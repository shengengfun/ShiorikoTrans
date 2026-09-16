"""Patch the desktop i18n catalogue with the settings-overhaul keys.

The settings rewrite moves every label/description into `pages/settings/registry.ts`
and adds a search UI, GPU/logs panels and richer recent-file handling, so a batch
of new message keys is needed. Only en-US (base locale) and zh-CN are filled in;
inlang falls back to the base locale for every other language.

Run:  python plans/settings-overhaul/settings-overhaul_001.py
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TRANSLATIONS = ROOT / "i18n" / "translations"

EN = {
    "accentColorInfo": "The accent color drives buttons, switches and highlights. Pick a preset swatch or any hex value; the light/dark variants are derived automatically.",
    "batchDefaults": "Batch defaults",
    "batchDefaultsInfo": "Applied when a whole folder is selected (the folder panel on the home page uses the same values).",
    "clearRecentFiles": "Clear recent files",
    "confirmResetAgain": "Click again to confirm",
    "customBackgroundInfo": "The image is drawn behind the translucent cards with an automatic overlay so the text stays readable.",
    "detectGpu": "Detect GPU devices",
    "detectedDevices": "Detected devices",
    "detectingGpu": "Detecting…",
    "diagnosticsDevices": "GPU devices",
    "diagnosticsFailed": "Could not build the diagnostics report",
    "diagnosticsRecentErrors": "Recent errors",
    "diagnosticsSystem": "System diagnostics",
    "directionLtr": "Left to right",
    "directionRtl": "Right to left",
    "displayLanguageInfo": "Interface language. Switching it also updates the default transcription language.",
    "enableDiagnostics": "Verbose GPU diagnostics",
    "enableDiagnosticsInfo": "Write extra GPU/driver details to the log while troubleshooting.",
    "exportFormatInfo": "Default file types used by the save buttons on the transcript and summary panels.",
    "forceCpuMode": "Force CPU mode",
    "forceCpuModeInfo": "Disable GPU acceleration completely — slower, but it still works when the driver misbehaves.",
    "generateDiagnostics": "Generate report",
    "generatingDiagnostics": "Generating…",
    "gpuDetectFailed": "GPU detection failed",
    "gpuDetected": "Found {count} device(s)",
    "gpuDiagnostics": "GPU diagnostics",
    "gpuDiagnosticsInfo": "Enumerate the devices the accelerator can see and report what each backend returns.",
    "groupInterface": "Interface",
    "hideReplace": "Hide replace",
    "includeSubFoldersInfo": "Recurse into sub folders when a whole folder is selected.",
    "infoLogsAndDiagnostics": "Logs are always written to a file. Attach the report to a support request — it contains no transcript text.",
    "inputLanguageInfo": "Language the model should expect. `auto` lets engines with language detection decide.",
    "logsAndDiagnostics": "Logs & diagnostics",
    "modelQuantizationHint": "Quantization hint",
    "modelQuantizationHintInfo": "Fallback label used when a model file carries no quantization metadata (e.g. Q4_K_M). `auto` reads it from the file.",
    "modelSettingsInfo": "Per-engine decoding options (threads, temperature, prompt…). Engines only show what they support.",
    "modelsFolderInfo": "Where model files live. Purpose sub folders (transcribe/translate/vad/diarize) are created automatically.",
    "noGpuFound": "No GPU device found",
    "none": "none",
    "recentBusyTranscribing": "A transcription is running — open history again once it finishes",
    "recentFileMissing": "The file “{name}” is no longer on disk",
    "recentFileMissingBadge": "Missing",
    "recentFileMissingHint": "File was moved or deleted",
    "recentFileOnly": "file only",
    "recentSourceMissingBadge": "source missing",
    "recentSourceMissingHint": "source file gone — transcript kept",
    "recentSourceMissingRestored": "The source file is gone, so the saved transcript was restored",
    "recentTranscriptSegments": "{count} segments",
    "recentFilesInfo": "Files transcribed recently. Recordings kept only in the temp folder are wiped on the next launch, so they are marked as missing.",
    "recentFilesMissingHint": "{count} entry(ies) point to files that are gone.",
    "recentLanguagesInfo": "Languages picked recently, used to shorten the language menu.",
    "removeMissingRecents": "Remove {count} missing",
    "replace": "Replace",
    "replaceWith": "Replace with",
    "resetAppInfo": "Delete the settings, the model metadata and the app store, then start over from the setup wizard.",
    "resetAppWarning": "This cannot be undone.",
    "resetOptionsInfo": "Only the decoding/export defaults are restored — models, folders and appearance stay untouched.",
    "saveNextToAudioFileInfo": "Write the transcript beside the source file instead of into the chosen output folder.",
    "searchAndReplace": "Search & replace",
    "searchSettings": "Search settings",
    "searchSettingsHint": "Ctrl+F",
    "searchSettingsNoResults": "No setting matches that.",
    "searchTranscriptPlaceholder": "Search transcript & translation",
    "sectionAdvancedDesc": "Logs, diagnostics and the model memory policy.",
    "sectionApiDesc": "Expose transcription over a local HTTP API for scripts and agents.",
    "sectionAppearanceDesc": "Theme mode, palette, accent color and background.",
    "sectionDictationDesc": "Hold a hotkey to dictate anywhere and paste straight into the focused app.",
    "sectionGeneralDesc": "Interface language, what happens when a transcription finishes, and export formats.",
    "sectionGpuDesc": "Pick the accelerator and see what the backends actually detect.",
    "sectionModelsDesc": "Install, pick and manage speech recognition models.",
    "sectionSummarizeDesc": "Send the transcript to a language model to summarise, rewrite or translate it.",
    "sectionTranscriptionDesc": "Language, speaker handling and the runtime pieces the pipeline needs.",
    "sectionTranslationDesc": "Translate transcripts with a local server or a hosted model.",
    "selectedModelInfo": "The model used for the next transcription. Per-engine options live behind “Model settings”.",
    "skipIfExistsInfo": "Skip files that already have a transcript beside them.",
    "storeRecordInDocumentsInfo": "When off, recordings stay in the app temp folder and are deleted on the next launch.",
    "subtitlePresetInfo": "One click: word timestamps on, 32-character sentences and SRT as the transcript format.",
    "summarizeDisabledHint": "Off — transcripts are shown as-is.",
    "tabAbout": "About",
    "tabAcceleration": "Acceleration",
    "tabBasic": "Basic",
    "tabBehaviour": "Behaviour",
    "tabDiagnostics": "Diagnostics",
    "tabOptions": "Options",
    "tabRecent": "Recent",
    "textDirection": "Transcript direction",
    "textDirectionInfo": "Reading direction of the transcript editor (needed for Arabic, Hebrew, Persian…).",
    "themeModeInfo": "Follow the operating system, or pin light/dark.",
    "themePaletteInfo": "Neutral surface palette, independent from the accent color.",
    "viewLogs": "View logs",
    "viewLogsFailed": "Could not load the log file",
    "vulkanDevice": "Vulkan device index",
    "vulkanDeviceInfo": "Pin a specific Vulkan device index. Leave empty to pick automatically.",
    "vulkanInfoNone": "No Vulkan-capable device reported.",
    "vulkanInfoTitle": "Vulkan info",
}

ZH = {
    "accentColorInfo": "强调色用于按钮、开关与高亮。可选预设色或任意十六进制色值，浅色/深色的变体会自动推导。",
    "batchDefaults": "批量转写默认值",
    "batchDefaultsInfo": "选择整个文件夹时生效（首页的文件夹面板使用同一组设置）。",
    "clearRecentFiles": "清空最近文件",
    "confirmResetAgain": "再点一次确认",
    "customBackgroundInfo": "背景图绘制在半透明卡片之后，并自动叠加遮罩，保证文字可读。",
    "detectGpu": "检测 GPU 设备",
    "detectedDevices": "已检测设备",
    "detectingGpu": "检测中…",
    "diagnosticsDevices": "GPU 设备",
    "diagnosticsFailed": "生成诊断信息失败",
    "diagnosticsRecentErrors": "近期错误",
    "diagnosticsSystem": "系统诊断",
    "directionLtr": "从左到右",
    "directionRtl": "从右到左",
    "displayLanguageInfo": "界面语言。切换后同时更新默认的转写语言。",
    "enableDiagnostics": "详细 GPU 诊断",
    "enableDiagnosticsInfo": "排查问题时把额外的 GPU / 驱动信息写入日志。",
    "exportFormatInfo": "转录面板与摘要面板「保存」按钮默认使用的文件类型。",
    "forceCpuMode": "强制 CPU 模式",
    "forceCpuModeInfo": "完全禁用 GPU 加速——更慢，但驱动异常时仍能正常工作。",
    "generateDiagnostics": "生成诊断信息",
    "generatingDiagnostics": "生成中…",
    "gpuDetectFailed": "GPU 设备检测失败",
    "gpuDetected": "检测到 {count} 个设备",
    "gpuDiagnostics": "GPU 诊断",
    "gpuDiagnosticsInfo": "列出加速后端能看到的设备，并显示各后端的报告内容。",
    "groupInterface": "界面",
    "hideReplace": "隐藏替换",
    "includeSubFoldersInfo": "选择整个文件夹时递归扫描子文件夹。",
    "infoLogsAndDiagnostics": "日志始终写入文件。反馈问题时附上诊断报告即可，其中不含转录正文。",
    "inputLanguageInfo": "期望模型使用的语言。支持自动检测的引擎可选「auto」。",
    "logsAndDiagnostics": "日志与诊断",
    "modelQuantizationHint": "量化提示",
    "modelQuantizationHintInfo": "模型文件本身没有量化信息时使用的回退标签（如 Q4_K_M）。「auto」表示从文件中读取。",
    "modelSettingsInfo": "按引擎能力提供的解码参数（线程数、温度、提示词…），不支持的项不会显示。",
    "modelsFolderInfo": "模型文件所在目录，按用途自动创建 transcribe / translate / vad / diarize 子目录。",
    "noGpuFound": "未检测到 GPU 设备",
    "none": "无",
    "recentBusyTranscribing": "正在转写中，请等当前任务结束后再打开历史记录",
    "recentFileMissing": "最近文件「{name}」已不在磁盘上",
    "recentFileMissingBadge": "已失效",
    "recentFileMissingHint": "文件已被移动或删除",
    "recentFileOnly": "仅文件",
    "recentSourceMissingBadge": "源文件丢失",
    "recentSourceMissingHint": "源文件已不存在（转录内容已保存）",
    "recentSourceMissingRestored": "源文件已不存在，已为你恢复保存的转录内容",
    "recentTranscriptSegments": "{count} 段",
    "recentFilesInfo": "最近完成转写的文件。只保存在临时目录的录音会在下次启动时被清理，因此会被标记为失效。",
    "recentFilesMissingHint": "有 {count} 条记录指向的文件已不存在。",
    "recentLanguagesInfo": "最近选择过的语言，用于缩短语言菜单。",
    "removeMissingRecents": "清理 {count} 条失效记录",
    "replace": "替换",
    "replaceWith": "替换为",
    "resetAppInfo": "清除设置、模型元数据与应用存储，然后从初始化向导重新开始。",
    "resetAppWarning": "此操作无法撤销。",
    "resetOptionsInfo": "仅恢复解码 / 导出的默认值；模型、目录与外观设置保持不变。",
    "saveNextToAudioFileInfo": "把转录文件写在源文件旁边，而不是所选的输出目录。",
    "searchAndReplace": "搜索与替换",
    "searchSettings": "搜索设置",
    "searchSettingsHint": "Ctrl+F",
    "searchSettingsNoResults": "没有匹配的设置项。",
    "searchTranscriptPlaceholder": "搜索转录与翻译",
    "sectionAdvancedDesc": "日志、诊断与模型内存策略。",
    "sectionApiDesc": "通过本地 HTTP API 把转写能力提供给脚本与智能体。",
    "sectionAppearanceDesc": "主题模式、配色方案、强调色与背景。",
    "sectionDictationDesc": "按住快捷键即可在任意应用中口述，结果直接输入到当前焦点位置。",
    "sectionGeneralDesc": "界面语言、转写完成后的默认行为与导出格式。",
    "sectionGpuDesc": "选择加速设备，并查看各后端实际检测到的结果。",
    "sectionModelsDesc": "安装、选择与管理语音识别模型。",
    "sectionSummarizeDesc": "把转录文本交给语言模型做摘要、改写或翻译。",
    "sectionTranscriptionDesc": "语言、发言者处理，以及流水线需要的运行时组件。",
    "sectionTranslationDesc": "使用本地服务或云端模型翻译转录文本。",
    "selectedModelInfo": "下次转写使用的模型；各引擎的具体参数在「模型设置」中调整。",
    "skipIfExistsInfo": "同目录已存在转录文件时跳过。",
    "storeRecordInDocumentsInfo": "关闭时录音只留在应用临时目录，下次启动会被清理。",
    "subtitlePresetInfo": "一键设置：打开词级时间戳、句长 32 字符、转录格式为 SRT。",
    "summarizeDisabledHint": "已关闭——直接显示原始转录。",
    "tabAbout": "关于",
    "tabAcceleration": "加速",
    "tabBasic": "常规",
    "tabBehaviour": "行为",
    "tabDiagnostics": "诊断",
    "tabOptions": "选项",
    "tabRecent": "最近使用",
    "textDirection": "转录文本方向",
    "textDirectionInfo": "转录编辑区的阅读方向（阿拉伯语、希伯来语、波斯语等需要）。",
    "themeModeInfo": "跟随系统，或固定为浅色 / 深色。",
    "themePaletteInfo": "中性表面配色，与强调色相互独立。",
    "viewLogs": "查看日志",
    "viewLogsFailed": "加载日志失败",
    "vulkanDevice": "Vulkan 设备索引",
    "vulkanDeviceInfo": "手动指定 Vulkan 设备索引，留空为自动选择。",
    "vulkanInfoNone": "未发现支持 Vulkan 的设备。",
    "vulkanInfoTitle": "Vulkan 信息",
}


def patch(locale: str, additions: dict[str, str]) -> None:
    """Append missing keys without touching the rest of the file.

    The catalogue is not alphabetically ordered and re-sorting it would rewrite
    every line, so new keys are appended as a block at the end (JSON objects are
    unordered — inlang and the compiler do not care).
    """
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
