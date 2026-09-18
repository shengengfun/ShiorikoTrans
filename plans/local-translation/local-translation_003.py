"""i18n keys for the summarisation rework + local engine wording.

Two jobs:
1. Rename the two translation-specific engine keys to generic ones, because the
   engine is now shared by translation and summarisation (line-level rewrite so
   the rest of the catalogue keeps its formatting and order).
2. Append the new keys for the summary page, prompt presets and local models.

Run: python plans/local-translation/local-translation_003.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TRANSLATIONS = ROOT / "i18n" / "translations"

RENAMES = {
    "translateEngineModelMissing": "localModelMissing",
    "translateEngineStartFailed": "localEngineStartFailed",
}

EN = {
    "localModelMissing": "No local model is available yet. Download one under Summarize → Local models.",
    "localEngineStartFailed": "Could not start the local engine: {error}",
    "selected": "Selected",
    "useModel": "Use",
    "pickModelFile": "Choose a GGUF file…",
    "summarizeNow": "Summarize",
    "needEnableSummarize": "Enable summarization in Settings → Summarize first.",
    "summarizeEmptyHint": "No summary yet. Pick a prompt under Settings → Summarize, then summarize this transcript.",
    "summarySettings": "Summary settings",
    "summaryLocalTitle": "Local summarization engine",
    "summaryLocalHint": "The app downloads llama.cpp itself and starts it when you summarize — no manual command needed.",
    "summarizeLocalModels": "Local models",
    "useBuiltinLocalModel": "Use built-in local model",
    "summaryPreset": "Prompt preset",
    "restoreDefaultPrompt": "Restore default prompt",
    "summaryChunkChars": "Chunk size (characters)",
    "infoSummaryChunkChars": "Characters sent per request when the transcript is long. A small local model cannot read a whole transcript at once, so it is summarised part by part and merged afterwards. 0 disables chunking.",
    "llmTemperature": "Temperature",
    "sendToTranslate": "Open the translation page after transcription",
    "sendToSummary": "Open the summary tab after transcription",
}

ZH = {
    "localModelMissing": "还没有本地模型，请先在 总结 → 本地模型 中下载。",
    "localEngineStartFailed": "本地服务启动失败：{error}",
    "selected": "已选择",
    "useModel": "使用",
    "pickModelFile": "选择 GGUF 文件…",
    "summarizeNow": "总结",
    "needEnableSummarize": "请先在 设置 → 总结 中启用总结。",
    "summarizeEmptyHint": "还没有总结。可在 设置 → 总结 中选中提示词，再对当前转录文本生成总结。",
    "summarySettings": "总结设置",
    "summaryLocalTitle": "本地总结服务",
    "summaryLocalHint": "应用会自动下载 llama.cpp 并在总结时启动，无需手动运行命令。",
    "summarizeLocalModels": "本地模型",
    "useBuiltinLocalModel": "使用内置本地模型",
    "summaryPreset": "提示词预设",
    "restoreDefaultPrompt": "恢复默认提示词",
    "summaryChunkChars": "分块字数",
    "infoSummaryChunkChars": "文本较长时每次送入模型的最大字数。小模型无法一次读完整个转录，因此会分段总结后再合并。填 0 表示不再分段。",
    "llmTemperature": "随机性 (temperature)",
    "sendToTranslate": "转录完成后打开翻译页",
    "sendToSummary": "转录完成后打开总结页",
}


def rename_keys(locale: str) -> None:
    path = TRANSLATIONS / locale / "desktop.json"
    raw = path.read_text(encoding="utf-8")
    for old, new in RENAMES.items():
        pattern = re.compile(rf'^(\t)"{re.escape(old)}":', re.MULTILINE)
        if not pattern.search(raw):
            print(f"{locale}: {old} not present (already renamed)")
            continue
        raw = pattern.sub(rf'\1"{new}":', raw)
    path.write_text(raw, encoding="utf-8")


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
    for locale in ("en-US", "zh-CN"):
        rename_keys(locale)
        patch(locale, EN if locale == "en-US" else ZH)


if __name__ == "__main__":
    main()
