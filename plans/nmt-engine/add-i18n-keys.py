"""Append the new built-in-translation strings to both locales.

Runtime keys are appended at the end of the JSON file (never re-sorted) so the
diff stays small, exactly like the earlier settings-overhaul batches.
"""

import collections
import json
import os

ROOT = r"d:\Project\ShiorikoTrans\i18n\translations"

NEW = {
    "zh-CN": collections.OrderedDict(
        [
            ("engineBuiltin", "内置翻译模型（离线，无需配置）"),
            ("engineOpenAICompatible", "OpenAI 兼容端点（高级）"),
            ("translateBuiltinTitle", "内置翻译模型"),
            (
                "translateBuiltinHint",
                "由应用自己运行的翻译专用模型，完全离线、无需 API Key，翻译时直接调用。",
            ),
            ("translateBuiltinReady", "模型已就绪"),
            ("translateBuiltinMissing", "尚未下载模型"),
            ("translateBuiltinDownload", "下载模型"),
            ("translateBuiltinSizeHint", "首次使用需下载约 {size} MB 的模型文件，之后可完全离线使用。"),
            ("downloadingTranslationModel", "正在下载翻译模型"),
            ("needDownloadTranslateModel", "请先在 设置 → 翻译 → 引擎 中下载内置翻译模型。"),
            ("translateSourceLanguage", "源语言"),
            ("translateSourceAuto", "自动检测"),
        ]
    ),
    "en-US": collections.OrderedDict(
        [
            ("engineBuiltin", "Built-in translation model (offline, no setup)"),
            ("engineOpenAICompatible", "OpenAI-compatible endpoint (advanced)"),
            ("translateBuiltinTitle", "Built-in translation model"),
            (
                "translateBuiltinHint",
                "A translation-only model the app runs itself: fully offline, no API key, used directly while translating.",
            ),
            ("translateBuiltinReady", "Model ready"),
            ("translateBuiltinMissing", "Model not downloaded"),
            ("translateBuiltinDownload", "Download model"),
            ("translateBuiltinSizeHint", "The first run downloads about {size} MB of model files; afterwards translation is fully offline."),
            ("downloadingTranslationModel", "Downloading the translation model"),
            ("needDownloadTranslateModel", "Download the built-in translation model first (Settings → Translation → Engine)."),
            ("translateSourceLanguage", "Source language"),
            ("translateSourceAuto", "Detect automatically"),
        ]
    ),
}

for locale, entries in NEW.items():
    path = os.path.join(ROOT, locale, "desktop.json")
    with open(path, encoding="utf-8") as handle:
        data = json.load(handle, object_pairs_hook=collections.OrderedDict)
    added = [key for key in entries if key not in data]
    for key in added:
        data[key] = entries[key]
    # The files are tab-indented with CRLF endings (prettier `useTabs`); writing
    # anything else rewrites every single line and buries the real change.
    with open(path, "w", encoding="utf-8", newline="\r\n") as handle:
        json.dump(data, handle, ensure_ascii=False, indent="\t")
    print(f"{locale}: +{len(added)} keys ({len(data)} total)")
    missing = [key for key in entries if key not in data]
    if missing:
        print("  still missing:", missing)
