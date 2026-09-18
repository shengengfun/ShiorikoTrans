"""Append the i18n keys for the built-in local translation engine.

The catalogues are not alphabetically ordered (re-sorting would rewrite every
line of a 600-key file), so keys are appended as a block at the end — JSON
objects are unordered and inlang does not care.

Run: python plans/local-translation/local-translation_001.py
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TRANSLATIONS = ROOT / "i18n" / "translations"

EN = {
    "translationLocalTitle": "Local translation engine",
    "translationLocalHint": "The app downloads llama.cpp itself and starts it when you translate — no manual command needed.",
    "translationLocalRuntimeMissing": "Runtime not installed",
    "translationLocalRuntimeReady": "Runtime ready",
    "translationLocalDownloadRuntime": "Download runtime",
    "translationLocalServiceStopped": "Engine not running",
    "translationLocalServiceRunning": "Running · port {port}",
    "translationLocalServiceStarting": "Starting…",
    "translationLocalStart": "Start engine",
    "translationLocalStop": "Stop",
    "translationLocalModelMissing": "Download a translation model first.",
    "translateEngineModelMissing": "The translation model is not downloaded yet. Open Settings → Translation → Models and download one.",
    "translateEngineStartFailed": "Could not start the local translation engine: {error}",
}

ZH = {
    "translationLocalTitle": "本地翻译服务",
    "translationLocalHint": "应用会自动下载 llama.cpp 并在翻译时启动，无需手动运行命令。",
    "translationLocalRuntimeMissing": "运行时未安装",
    "translationLocalRuntimeReady": "运行时已就绪",
    "translationLocalDownloadRuntime": "下载运行时",
    "translationLocalServiceStopped": "服务未运行",
    "translationLocalServiceRunning": "运行中 · 端口 {port}",
    "translationLocalServiceStarting": "正在启动…",
    "translationLocalStart": "启动服务",
    "translationLocalStop": "停止",
    "translationLocalModelMissing": "请先下载翻译模型。",
    "translateEngineModelMissing": "本地翻译模型还没下载。请到 设置 → 翻译 → 模型 中下载后再试。",
    "translateEngineStartFailed": "本地翻译服务启动失败：{error}",
}


def patch(locale: str, additions: dict[str, str]) -> None:
    path = TRANSLATIONS / locale / "desktop.json"
    raw = path.read_text(encoding="utf-8")
    data = json.loads(raw)

    appended, kept = [], []
    for key in sorted(additions):
        if key in data:
            kept.append(key)
        else:
            appended.append((key, additions[key]))

    if not appended:
        print(f"{locale}: nothing to add ({len(kept)} keys already present)")
        return

    body = raw.rstrip()
    assert body.endswith("}"), f"unexpected tail in {path}"
    body = body[:-1].rstrip()
    if not body.endswith("{"):
        body += ","
    lines = [f"\t{json.dumps(key, ensure_ascii=False)}: {json.dumps(value, ensure_ascii=False)}" for key, value in appended]
    path.write_text(body + "\n" + ",\n".join(lines) + "\n}\n", encoding="utf-8")
    print(f"{locale}: +{len(appended)} keys appended, {len(kept)} already present (total {len(data) + len(appended)})")


def main() -> None:
    patch("en-US", EN)
    patch("zh-CN", ZH)


if __name__ == "__main__":
    main()
