"""
FunASR Server for ShiorikoTrans Electron
================================
Provides HTTP REST + WebSocket API for speech recognition using FunASR models.

Endpoints:
  POST /transcribe   - Offline file transcription
  WS   /stream       - Real-time streaming recognition
  GET  /health       - Health check
  GET  /models       - List available models
"""

import os
import sys
import json
import time
import logging
import tempfile
import traceback
from pathlib import Path
from typing import Optional, List

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("funasr-server")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
MODELS_DIR = Path(os.environ.get("FUNASR_MODELS_DIR", os.path.expanduser("~/.cache/shiorikotrans/models")))
PORT = int(os.environ.get("FUNASR_PORT", "8000"))
HOST = os.environ.get("FUNASR_HOST", "127.0.0.1")

# Ensure models directory exists
MODELS_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# FastAPI Application
# ---------------------------------------------------------------------------
from fastapi import FastAPI, File, UploadFile, Query, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

app = FastAPI(title="ShiorikoTrans FunASR Server", version="1.0.0")

# Allow CORS (needed for Electron file:// protocol)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Global model cache
# ---------------------------------------------------------------------------
_model_cache = {}

def get_model_dir() -> Path:
    """Get the FunASR model cache directory."""
    return MODELS_DIR


def load_funasr_models(language: str = "zh"):
    """
    Load FunASR models on demand.
    Returns (model, vad_model, punc_model) tuple.
    """
    cache_key = f"funasr_{language}"
    if cache_key in _model_cache:
        return _model_cache[cache_key]

    log.info(f"Loading FunASR models for language: {language}")

    try:
        from funasr import AutoModel

        # Main ASR model - Paraformer
        model_kwargs = {
            "model": "iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-pytorch",
            "vad_model": "fsmn-vad",
            "punc_model": "ct-punc",
            "device": "cpu",  # Use CPU for compatibility; change to "cuda:0" for GPU
        }

        # Language-specific model selection
        if language == "en":
            model_kwargs["model"] = "iic/speech_paraformer-large_asr_nat-en-16k-common-vocab5000-pytorch"
        elif language == "zh":
            model_kwargs["model"] = "iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-pytorch"
        elif language == "ja":
            model_kwargs["model"] = "iic/speech_paraformer-large_asr_nat-ja-16k-common-vocab5000-pytorch"
        elif language in ("ko", "korean"):
            model_kwargs["model"] = "iic/speech_paraformer-large_asr_nat-ko-16k-common-vocab5000-pytorch"
        else:
            # For other languages, use the multilingual model or fallback to Chinese
            log.warning(f"No dedicated model for language '{language}', using Paraformer-large (Chinese)")
            model_kwargs["model"] = "iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-pytorch"

        model = AutoModel(**model_kwargs)

        _model_cache[cache_key] = (model, model_kwargs)
        log.info(f"FunASR models loaded successfully for {language}")
        return (model, model_kwargs)

    except ImportError:
        log.error("FunASR not installed. Install with: pip install funasr")
        raise HTTPException(
            status_code=500,
            detail="FunASR not installed. Please run: pip install funasr modelscope",
        )
    except Exception as e:
        log.error(f"Failed to load FunASR models: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to load models: {str(e)}")


def unload_models():
    """Release model resources."""
    global _model_cache
    _model_cache.clear()
    log.info("All models unloaded")


# ---------------------------------------------------------------------------
# Helper: convert audio to 16kHz mono WAV using ffmpeg
# ---------------------------------------------------------------------------
def convert_to_wav_16k(input_path: str) -> str:
    """Convert any audio file to 16kHz mono WAV using ffmpeg."""
    import subprocess
    import shutil

    # Check if ffmpeg is available
    if not shutil.which("ffmpeg"):
        log.warning("ffmpeg not found, attempting direct processing")
        return input_path

    output_path = input_path + ".16k.wav"
    try:
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", input_path,
                "-ar", "16000",
                "-ac", "1",
                "-sample_fmt", "s16",
                output_path,
            ],
            capture_output=True,
            check=True,
            timeout=120,
        )
        return output_path
    except subprocess.CalledProcessError as e:
        log.error(f"ffmpeg conversion failed: {e.stderr.decode()}")
        return input_path
    except FileNotFoundError:
        return input_path


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "timestamp": time.time(),
        "models_dir": str(MODELS_DIR),
        "models_loaded": list(_model_cache.keys()),
    }


@app.get("/models")
async def list_models():
    """List available/cached models."""
    models = []
    if MODELS_DIR.exists():
        for item in MODELS_DIR.iterdir():
            models.append({
                "name": item.name,
                "type": "directory" if item.is_dir() else "file",
                "size": item.stat().st_size if item.is_file() else 0,
            })
    return {"models_dir": str(MODELS_DIR), "models": models}


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Query("zh", description="Language code (zh, en, ja, ko, auto)"),
    word_timestamps: bool = Query(False, description="Enable word-level timestamps"),
    max_sentence_len: int = Query(0, description="Max sentence length (0=default)"),
    vad_model: Optional[str] = Query(None, description="VAD model name"),
    punc_model: Optional[str] = Query(None, description="Punctuation model name"),
):
    """
    Transcribe an audio file.
    
    Returns JSON with format compatible with shiorikotrans's Transcript interface:
    {
        "segments": [
            {"start": 0.0, "stop": 2.5, "text": "Hello world", "speaker": null},
            ...
        ],
        "processing_time_sec": 2.3
    }
    """
    start_time = time.time()

    # Save uploaded file to temp location
    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        # Convert to 16kHz WAV if needed
        audio_path = convert_to_wav_16k(tmp_path)

        # Load models
        model, kwargs = load_funasr_models(language)

        # Build generation kwargs
        gen_kwargs = {
            "batch_size_s": 300,
        }

        if max_sentence_len and max_sentence_len > 0:
            gen_kwargs["sentence_timestamp"] = True

        # Run recognition
        log.info(f"Transcribing: {file.filename} (language={language})")
        result = model.generate(input=audio_path, **gen_kwargs)

        # Parse FunASR result into shiorikotrans-compatible format
        segments = []

        if result and len(result) > 0:
            res = result[0]

            # FunASR returns: {"text": "...", "timestamp": [[start_ms, end_ms], ...], "sentence_info": [...]}
            if "sentence_info" in res and res["sentence_info"]:
                for sent in res["sentence_info"]:
                    segment = {
                        "start": round(sent.get("start", 0) / 1000.0, 3),
                        "stop": round(sent.get("end", 0) / 1000.0, 3),
                        "text": sent.get("text", "").strip(),
                        "speaker": None,
                    }
                    segments.append(segment)
            elif "timestamp" in res and res["timestamp"]:
                full_text = res.get("text", "")
                timestamps = res["timestamp"]

                # Handle case where timestamps are at sentence level
                if len(timestamps) > 0 and isinstance(timestamps[0], list):
                    for i, ts in enumerate(timestamps):
                        if len(ts) >= 2:
                            # In FunASR, timestamp values can be in ms or seconds
                            start_val = ts[0]
                            end_val = ts[1]
                            # If values are large (> 1000), they're likely in ms
                            if start_val > 1000:
                                start_val /= 1000.0
                                end_val /= 1000.0

                            text_piece = ""
                            if "text" in res and isinstance(res["text"], list) and i < len(res["text"]):
                                text_piece = res["text"][i]
                            elif full_text:
                                text_piece = full_text

                            segment = {
                                "start": round(start_val, 3),
                                "stop": round(end_val, 3),
                                "text": text_piece.strip() if isinstance(text_piece, str) else str(text_piece),
                                "speaker": None,
                            }
                            segments.append(segment)
                else:
                    # Single segment with full text
                    segments.append({
                        "start": 0.0,
                        "stop": round(float(timestamps[-1][-1] if len(timestamps[-1]) > 1 else timestamps[-1][0]) / 1000.0, 3),
                        "text": full_text.strip(),
                        "speaker": None,
                    })
            elif "text" in res:
                # Only text, no timestamps
                segments.append({
                    "start": 0.0,
                    "stop": 0.0,
                    "text": res["text"].strip(),
                    "speaker": None,
                })

        elapsed = round(time.time() - start_time, 1)
        log.info(f"Transcription complete in {elapsed}s, {len(segments)} segments")

        return JSONResponse({
            "segments": segments,
            "word_segments": [],
            "processing_time_sec": elapsed,
        })

    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Transcription error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Cleanup temp files
        try:
            os.unlink(tmp_path)
            wav_path = tmp_path + ".16k.wav"
            if os.path.exists(wav_path):
                os.unlink(wav_path)
        except Exception:
            pass


@app.websocket("/stream")
async def websocket_stream(websocket: WebSocket):
    """
    Real-time streaming speech recognition via WebSocket.
    
    Client sends binary audio data (16kHz, mono, 16-bit PCM).
    Server returns JSON partial results:
    {
        "type": "partial" | "final",
        "text": "...",
        "segments": [...]
    }
    """
    await websocket.accept()
    log.info("WebSocket streaming client connected")

    # We'll use FunASR's streaming capabilities
    # For simplicity, we accumulate chunks and do periodic recognition
    try:
        from funasr import AutoModel

        # Load streaming-capable model
        streaming_model = AutoModel(
            model="iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-pytorch",
            vad_model="fsmn-vad",
            punc_model="ct-punc",
            device="cpu",
        )

    except Exception as e:
        await websocket.send_json({"type": "error", "message": f"Failed to load model: {str(e)}"})
        await websocket.close()
        return

    audio_buffer = bytearray()
    chunk_count = 0

    try:
        while True:
            data = await websocket.receive_bytes()
            audio_buffer.extend(data)
            chunk_count += 1

            # Process every ~0.5s of audio (16kHz * 2 bytes * 0.5s)
            if len(audio_buffer) >= 16000:
                # Write buffer to temp file
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                    import wave
                    with wave.open(tmp.name, "wb") as wf:
                        wf.setnchannels(1)
                        wf.setsampwidth(2)  # 16-bit
                        wf.setframerate(16000)
                        wf.writeframes(audio_buffer)

                    try:
                        result = streaming_model.generate(input=tmp.name)
                        if result and len(result) > 0:
                            text = result[0].get("text", "")
                            await websocket.send_json({
                                "type": "partial",
                                "text": text,
                                "segments": [],
                            })
                    finally:
                        try:
                            os.unlink(tmp.name)
                        except Exception:
                            pass

                audio_buffer = bytearray()

    except WebSocketDisconnect:
        log.info("WebSocket client disconnected")

        # Process remaining audio
        if len(audio_buffer) > 0:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                import wave
                with wave.open(tmp.name, "wb") as wf:
                    wf.setnchannels(1)
                    wf.setsampwidth(2)
                    wf.setframerate(16000)
                    wf.writeframes(audio_buffer)

                try:
                    result = streaming_model.generate(input=tmp.name)
                    if result and len(result) > 0:
                        text = result[0].get("text", "")
                        segments = []
                        if "sentence_info" in result[0]:
                            for sent in result[0]["sentence_info"]:
                                segments.append({
                                    "start": round(sent.get("start", 0) / 1000.0, 3),
                                    "stop": round(sent.get("end", 0) / 1000.0, 3),
                                    "text": sent.get("text", "").strip(),
                                    "speaker": None,
                                })
                        await websocket.send_json({
                            "type": "final",
                            "text": text,
                            "segments": segments,
                        })
                except Exception:
                    pass
                finally:
                    try:
                        os.unlink(tmp.name)
                    except Exception:
                        pass
    except Exception as e:
        log.error(f"WebSocket error: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass


@app.on_event("shutdown")
async def shutdown_event():
    """Release resources on shutdown."""
    unload_models()


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    log.info(f"Starting FunASR server on {HOST}:{PORT}")
    log.info(f"Models directory: {MODELS_DIR}")

    # Pre-download models on first run if needed
    try:
        from modelscope import snapshot_download
        default_model = "iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-pytorch"
        model_local_dir = MODELS_DIR / default_model.replace("/", "--")
        if not model_local_dir.exists():
            log.info(f"Downloading default model: {default_model}")
            snapshot_download(default_model, cache_dir=str(MODELS_DIR))
            log.info("Model downloaded successfully")
    except ImportError:
        log.warning("modelscope not installed, models will be downloaded by funasr on first use")
    except Exception as e:
        log.warning(f"Failed to pre-download model: {e}")

    uvicorn.run(
        app,
        host=HOST,
        port=PORT,
        log_level="info",
        ws_ping_interval=30,
        ws_ping_timeout=10,
    )
