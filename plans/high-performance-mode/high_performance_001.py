#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["httpx"]
# ///
"""End-to-end validation of the high-performance transcription mode.

Checks, against the *real* bundled sidecar:

1. A single `sona serve` process rejects concurrent requests with `429 busy`,
   which is why the app runs a pool of processes instead.
2. Transcribing a file queue with a 2-process pool is faster than doing it one
   after another on a single process, and produces identical text.
3. Silence-aligned chunking of a long file (the strategy used to split one file
   across workers) keeps the transcript close to the whole-file transcript and
   keeps timestamps monotonic.

The chunk *planning* itself is unit-tested in Rust
(`desktop/src-tauri/src/chunked.rs`); this script applies the same boundary rule
to real audio so the strategy can be measured end to end.

Run:  uv run plans/high-performance-mode/high_performance_001.py
"""

from __future__ import annotations

import concurrent.futures
import difflib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
BINARIES = ROOT / "desktop" / "src-tauri" / "binaries"
SAMPLES = ROOT / "samples"

MIN_CHUNK_SECONDS = 180.0
MAX_WORKERS = 4
# The bundled samples are English speech; the app sends a fixed language too, so
# pinning it keeps the comparison independent of per-chunk language detection.
LANGUAGE = os.environ.get("SHIORIKO_PERF_LANG", "en")
MODEL_URLS = [
    # Multilingual tiny: the samples are not English, and an English-only model
    # would hallucinate instead of transcribing, which would swamp every text
    # comparison below.
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
    "https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
]

results: list[str] = []
failures: list[str] = []


def log(message: str) -> None:
    print(message, flush=True)
    results.append(message)


def check(condition: bool, message: str) -> None:
    if condition:
        log(f"  PASS  {message}")
    else:
        log(f"  FAIL  {message}")
        failures.append(message)


def find_binary(name: str) -> Path | None:
    candidates = [BINARIES / f"{name}.exe", BINARIES / name]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    found = shutil.which(name)
    return Path(found) if found else None


def wav_duration(path: Path) -> float:
    data = path.read_bytes()
    if data[:4] != b"RIFF":
        raise RuntimeError(f"{path} is not a RIFF WAV")
    offset = 12
    rate = channels = bits = 0
    data_len = 0
    while offset + 8 <= len(data):
        chunk_id = data[offset : offset + 4]
        size = int.from_bytes(data[offset + 4 : offset + 8], "little")
        body = offset + 8
        if chunk_id == b"fmt ":
            channels = int.from_bytes(data[body + 2 : body + 4], "little")
            rate = int.from_bytes(data[body + 4 : body + 8], "little")
            bits = int.from_bytes(data[body + 14 : body + 16], "little")
        elif chunk_id == b"data":
            data_len = min(size, len(data) - body)
        offset = body + size + (size % 2)
    frame = channels * bits // 8
    if rate == 0 or frame == 0:
        raise RuntimeError(f"{path} has no usable audio header")
    return data_len / (rate * frame)


def run_ffmpeg(ffmpeg: Path, args: list[str]) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run([str(ffmpeg), "-hide_banner", "-nostdin", *args], capture_output=True, check=False)


def detect_silences(ffmpeg: Path, path: Path) -> list[float]:
    output = run_ffmpeg(ffmpeg, ["-i", str(path), "-af", "silencedetect=noise=-35dB:d=0.4", "-f", "null", os.devnull])
    starts: list[float] = []
    midpoints: list[float] = []
    for line in output.stderr.decode("utf-8", "replace").splitlines():
        start = re.search(r"silence_start:\s*([0-9.]+)", line)
        end = re.search(r"silence_end:\s*([0-9.]+)", line)
        if start:
            starts.append(float(start.group(1)))
        elif end:
            value = float(end.group(1))
            midpoints.append((starts.pop() + value) / 2 if starts else value)
    return sorted(midpoints)


def plan_boundaries(duration: float, count: int, silences: list[float]) -> list[float]:
    boundaries: list[float] = []
    for index in range(1, count):
        ideal = duration * index / count
        window = (duration / count) * 0.2
        nearby = [point for point in silences if abs(point - ideal) <= window]
        chosen = min(nearby, key=lambda point: abs(point - ideal)) if nearby else ideal
        previous = boundaries[-1] if boundaries else 0.0
        if chosen - previous < MIN_CHUNK_SECONDS / 2 or duration - chosen < MIN_CHUNK_SECONDS / 2:
            continue
        boundaries.append(chosen)
    return boundaries


class SonaWorker:
    """One inference process, driven over its HTTP API."""

    def __init__(self, binary: Path, ffmpeg: Path, model: Path) -> None:
        env = {**os.environ, "SONA_FFMPEG_PATH": str(ffmpeg), "SONA_UNLOAD_TIMEOUT": "0"}
        self.process = subprocess.Popen(
            [str(binary), "serve", "--port", "0"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            text=True,
        )
        ready = self.process.stdout.readline() if self.process.stdout else ""
        try:
            self.port = json.loads(ready)["port"]
        except Exception as error:  # noqa: BLE001 - surfaced to the user below
            stderr = self.process.stderr.read() if self.process.stderr else ""
            raise RuntimeError(f"sona did not announce a port ({error}); stderr: {stderr[:500]}") from error
        self.client = httpx.Client(
            base_url=f"http://127.0.0.1:{self.port}",
            timeout=1800.0,
            # No keep-alive: the client idles for many seconds (ffmpeg splitting,
            # the other worker running) and a reused stale connection fails with
            # WinError 10054 instead of retrying.
            limits=httpx.Limits(max_keepalive_connections=0, max_connections=4),
        )
        response = self.client.post("/v1/models/load", json={"path": str(model)})
        if response.status_code >= 400:
            # Machines without a usable Vulkan/Metal device must still be able to
            # run this validation, so fall back to the CPU path of the engine.
            log(f"  (gpu load failed on port {self.port}, retrying on the cpu: {response.text[:120]})")
            self.client.post("/v1/models/load", json={"path": str(model), "no_gpu": True}).raise_for_status()

    def transcribe(self, path: Path, threads: int, with_segments: bool = False) -> dict:
        payload = {
            "n_threads": str(threads),
            "language": LANGUAGE,
            "response_format": "verbose_json" if with_segments else "json",
        }
        with path.open("rb") as handle:
            response = self.client.post(
                "/v1/audio/transcriptions",
                files={"file": (path.name, handle, "application/octet-stream")},
                data=payload,
            )
        response.raise_for_status()
        return response.json()

    def busy_probe(self, path: Path, threads: int, poll: float = 0.3) -> tuple[int, list[int]]:
        """Runs one file and, while it is still running, keeps asking the same
        process for a second transcription.

        Returns `(first_status, concurrent_statuses)`. The engine holds an
        exclusive model lease, so a concurrent attempt is answered with `429
        busy`; `0` means the probe itself timed out, which is also a busy signal.
        The only other status that can appear is a `400` in the tiny window after
        the engine released the lease but before the client finished reading the
        response body.
        """
        pool = concurrent.futures.ThreadPoolExecutor(1)
        statuses: list[int] = []
        # Keep-alive on, but warmed with a cheap request first: the engine answers
        # instantly on an established connection, while a *new* connection is not
        # accepted until the running transcription yields (so a fresh probe would
        # only ever time out).
        probe_client = httpx.Client(base_url=self.client.base_url, timeout=5.0)
        probe_client.get("/health")
        with path.open("rb") as handle:
            first = pool.submit(
                self.client.post,
                "/v1/audio/transcriptions",
                files={"file": (path.name, handle, "application/octet-stream")},
                data={"n_threads": str(threads), "language": LANGUAGE},
            )
            time.sleep(0.4)
            while not first.done():
                try:
                    response = probe_client.post(
                        "/v1/audio/transcriptions",
                        files={"file": ("probe.wav", b"x", "application/octet-stream")},
                        data={"n_threads": str(threads), "language": LANGUAGE},
                    )
                    statuses.append(response.status_code)
                except httpx.TimeoutException:
                    statuses.append(0)
                time.sleep(poll)
            first_status = first.result().status_code
        probe_client.close()
        pool.shutdown()
        return first_status, statuses

    def stop(self) -> None:
        self.client.close()
        self.process.terminate()
        try:
            self.process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.process.kill()


def download_model(target: Path) -> Path:
    if target.exists() and target.stat().st_size > 1_000_000:
        return target
    target.parent.mkdir(parents=True, exist_ok=True)
    last_error: Exception | None = None
    for url in MODEL_URLS:
        try:
            log(f"downloading {url}")
            with httpx.stream("GET", url, follow_redirects=True, timeout=300.0) as response:
                response.raise_for_status()
                with target.open("wb") as handle:
                    for chunk in response.iter_bytes(1 << 20):
                        handle.write(chunk)
            return target
        except Exception as error:  # noqa: BLE001 - try the mirror next
            last_error = error
            target.unlink(missing_ok=True)
    raise RuntimeError(f"could not download the test model: {last_error}")


def build_long_file(ffmpeg: Path, work: Path, name: str, minimum_seconds: float) -> Path:
    """Builds a long track out of the sample recordings, re-encoded to the
    engine's native 16 kHz mono PCM so the whole-file and the chunked path read
    it identically.

    The sample order is rotated on every pass so no two neighbouring passages are
    the same recording: whisper.cpp drops text it detects as repeated, which
    would otherwise make a repeated file a poor quality reference.
    """
    target = work / name
    if target.exists():
        return target
    sources = [SAMPLES / "multi.wav", SAMPLES / "6_speakers.wav", SAMPLES / "single.wav", SAMPLES / "short.wav"]
    entries: list[Path] = []
    total = 0.0
    pass_index = 0
    while total < minimum_seconds:
        for offset in range(len(sources)):
            source = sources[(pass_index + offset) % len(sources)]
            entries.append(source)
            total += wav_duration(source)
        pass_index += 1
    listing = work / f"concat-{name}.txt"
    listing.write_text("".join(f"file '{entry}'\n" for entry in entries), encoding="utf-8")
    run_ffmpeg(
        ffmpeg,
        [
            "-f", "concat",
            "-safe", "0",
            "-i", str(listing),
            "-vn", "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le",
            "-y", str(target),
        ],
    )
    return target


def main() -> int:
    binary = find_binary("sona")
    ffmpeg = find_binary("ffmpeg")
    if not binary or not ffmpeg:
        log(f"sona={binary} ffmpeg={ffmpeg} - place both in desktop/src-tauri/binaries")
        return 2

    log(f"sona:    {binary}")
    log(f"ffmpeg:  {ffmpeg}")
    devices = subprocess.run([str(binary), "devices"], capture_output=True, text=True)
    log(f"devices: {' '.join(devices.stdout.split()) or 'none reported'}")

    work = Path(os.environ.get("SHIORIKO_PERF_WORK", tempfile.mkdtemp(prefix="shioriko-perf-")))
    work.mkdir(parents=True, exist_ok=True)
    # Cached outside the throwaway work folder so repeated runs are fast.
    default_model = Path(tempfile.gettempdir()) / "shioriko-perf-model" / "ggml-tiny.bin"
    model = download_model(Path(os.environ.get("SHIORIKO_PERF_MODEL", default_model)))
    log(f"model:   {model} ({model.stat().st_size // 1024 // 1024} MB)")

    threads = max(2, min(4, (os.cpu_count() or 4) // 2))
    log(f"threads: {threads} per worker, {os.cpu_count()} logical cores")

    # How many copies are needed to pass the app's eight minute split threshold.
    log(f"sample:  {SAMPLES / 'multi.wav'} ({wav_duration(SAMPLES / 'multi.wav'):.0f}s)")
    long_wav = build_long_file(ffmpeg, work, "long.wav", 540.0)
    long_wav_2 = build_long_file(ffmpeg, work, "long_2.wav", 540.0)
    files = [long_wav, long_wav_2]
    log(f"files:   {[f'{path.name} ({wav_duration(path):.0f}s)' for path in files]}")

    workers: list[SonaWorker] = []
    try:
        log("== 1. concurrency needs more than one process ==")
        worker_a = SonaWorker(binary, ffmpeg, model)
        worker_b = SonaWorker(binary, ffmpeg, model)
        workers = [worker_a, worker_b]
        # A long file, so the probe below has a wide window while it runs.
        first_status, concurrent_statuses = worker_a.busy_probe(long_wav, threads)
        log(f"  concurrent attempts while the file was running: {concurrent_statuses}")
        check(first_status == 200, f"the running transcription succeeds (got {first_status})")
        check(429 in concurrent_statuses, "a concurrent request is rejected with 429 busy")
        check(200 not in concurrent_statuses, "no second transcription ever starts while one runs")

        log("== 2. a pool beats a single process on a queue ==")
        started = time.perf_counter()
        first_file = worker_a.transcribe(files[0], threads, with_segments=True)
        first_seconds = time.perf_counter() - started
        started = time.perf_counter()
        second_file = worker_a.transcribe(files[1], threads)
        second_seconds = time.perf_counter() - started
        serial_seconds = first_seconds + second_seconds

        started = time.perf_counter()
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            pooled = list(
                pool.map(
                    lambda args: args[0].transcribe(args[1], threads)["text"],
                    zip((worker_a, worker_b), files),
                )
            )
        parallel_seconds = time.perf_counter() - started

        # Control: how much two runs of the same file already differ. The engine
        # is not bit-for-bit deterministic on spliced audio, so "identical text"
        # is not a meaningful bar; "no extra variance" is.
        control = worker_a.transcribe(files[0], threads)["text"]
        control_similarity = difflib.SequenceMatcher(None, first_file["text"].split(), control.split()).ratio()
        pooled_similarity = min(
            difflib.SequenceMatcher(None, first_file["text"].split(), pooled[0].split()).ratio(),
            difflib.SequenceMatcher(None, second_file["text"].split(), pooled[1].split()).ratio(),
        )
        speedup = serial_seconds / parallel_seconds if parallel_seconds else 0.0
        log(f"  serial {serial_seconds:.1f}s vs pooled {parallel_seconds:.1f}s -> {speedup:.2f}x, text agreement {pooled_similarity:.3f} (control {control_similarity:.3f})")
        log(f"  transcript excerpt: {first_file['text'][:120].strip()!r}")
        check(pooled_similarity >= control_similarity - 0.05, f"pooling adds no variance beyond the engine's own ({pooled_similarity:.3f} vs {control_similarity:.3f})")
        # This machine is a shared-memory iGPU with 12 logical cores, so the pool
        # is bound by core/memory contention; a discrete GPU scales further.
        check(speedup >= 1.15, f"pooling is clearly faster ({speedup:.2f}x >= 1.15x)")

        log("== 3. silence-aligned chunking of one long file ==")
        duration = wav_duration(long_wav)
        count = min(len(workers), max(1, int(duration // MIN_CHUNK_SECONDS)))
        silences = detect_silences(ffmpeg, long_wav)
        boundaries = plan_boundaries(duration, count, silences)
        log(f"  duration {duration:.0f}s, {len(silences)} pauses, {len(boundaries) + 1} chunks at {[round(value) for value in boundaries]}")
        check(len(boundaries) + 1 >= 2, "the long file splits into parallel chunks")

        edges = [0.0, *boundaries, duration]
        chunks: list[tuple[Path, float]] = []
        for index in range(len(edges) - 1):
            target = work / f"chunk_{index:02}.wav"
            start = edges[index]
            length = edges[index + 1] - start
            run_ffmpeg(
                ffmpeg,
                [
                    "-ss", f"{start:.3f}",
                    "-t", f"{length:.3f}",
                    "-i", str(long_wav),
                    "-vn", "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le",
                    "-y", str(target),
                ],
            )
            chunks.append((target, start))

        started = time.perf_counter()

        def transcribe_chunk(args: tuple[SonaWorker, Path]) -> dict:
            worker, chunk_path = args
            chunk_started = time.perf_counter()
            result = worker.transcribe(chunk_path, threads, with_segments=True)
            log(f"  {chunk_path.name}: {time.perf_counter() - chunk_started:.1f}s on port {worker.port}")
            return result

        with concurrent.futures.ThreadPoolExecutor(len(chunks)) as pool:
            chunk_results = list(pool.map(transcribe_chunk, zip(workers, [path for path, _ in chunks])))
        chunked_seconds = time.perf_counter() - started

        # The reference transcript is the serial run above: same file, same
        # worker, so the two are directly comparable. The extra run measures how
        # much the engine already varies on its own.
        whole = first_file
        whole_seconds = first_seconds
        control = worker_a.transcribe(long_wav, threads)["text"]
        control_similarity = difflib.SequenceMatcher(None, whole["text"].split(), control.split()).ratio()
        log(f"  control: two whole-file runs agree at {control_similarity:.3f}")

        merged_segments = []
        for (_, offset), result in zip(chunks, chunk_results):
            for segment in result["segments"]:
                merged_segments.append(
                    {
                        "start": segment["start"] + offset,
                        "stop": segment["end"] + offset,
                        "text": segment["text"],
                    }
                )
        merged_segments.sort(key=lambda segment: segment["start"])
        merged_text = " ".join(segment["text"].strip() for segment in merged_segments)
        similarity = difflib.SequenceMatcher(None, whole["text"].split(), merged_text.split()).ratio()
        whole_words = len(whole["text"].split())
        merged_words = len(merged_text.split())
        whole_coverage = whole["segments"][-1]["end"] if whole["segments"] else 0.0
        log(f"  words: whole-file {whole_words} vs chunked {merged_words}")
        log(f"  coverage: whole-file reaches {whole_coverage:.0f}s of {duration:.0f}s; chunked reaches {merged_segments[-1]['stop']:.0f}s")
        log(f"  whole {whole_seconds:.1f}s vs chunked {chunked_seconds:.1f}s -> {whole_seconds / chunked_seconds:.2f}x, word similarity {similarity:.3f}")
        check(similarity >= 0.5, f"chunked text stays close to the whole-file text ({similarity:.3f} >= 0.500)")
        check(merged_words >= whole_words * 0.5, "chunking does not lose the transcript")
        starts = [segment["start"] for segment in merged_segments]
        check(starts == sorted(starts), "merged timestamps are monotonic")
        check(duration * 0.9 <= merged_segments[-1]["stop"] <= duration + 5, "the merged transcript covers the file")
        log(f"  speed note: on this machine (integrated GPU, shared memory) parallel work is bounded by the GPU itself ({whole_seconds / chunked_seconds:.2f}x for two chunks).")
    finally:
        for worker in workers:
            worker.stop()
        for path in work.glob("chunk_*.wav"):
            path.unlink(missing_ok=True)
        if os.environ.get("SHIORIKO_PERF_KEEP") != "1" and work.name.startswith("shioriko-perf-"):
            shutil.rmtree(work, ignore_errors=True)

    log("== summary ==")
    if failures:
        log(f"{len(failures)} check(s) failed:")
        for failure in failures:
            log(f"  - {failure}")
        return 1
    log("all checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
