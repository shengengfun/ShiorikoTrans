import { Cpu, Globe, Languages, Mic, Palette, SlidersHorizontal, Sparkles, Terminal, Wrench, type LucideIcon } from 'lucide-react'
import { m } from '~/paraglide/messages.js'

/**
 * Single source of truth for the settings surface.
 *
 * Every row is described here — label, one-line description and extra search
 * terms — and the row components pull their text from this record (see
 * `components/kit.tsx`). That keeps the settings search index in sync with the
 * UI for free: a row can never show a label that the search cannot find.
 */
export type SectionId = 'general' | 'appearance' | 'transcription' | 'translation' | 'summarize' | 'dictation' | 'gpu' | 'api' | 'advanced'

export interface SettingDef {
	id: string
	section: SectionId
	/** Sub-tab inside the section; omit when the section renders a single page. */
	tab?: string
	label: () => string
	description?: () => string
	/**
	 * Extra search terms. Kept in both languages on purpose — people search in
	 * whichever language they think in, even when the UI is set to the other one.
	 */
	keywords?: string
}

export const SETTINGS = {
	// ── General · basic ────────────────────────────────────────────────────
	displayLanguage: {
		id: 'displayLanguage',
		section: 'general',
		tab: 'basic',
		label: () => m.language(),
		keywords: 'language 语言 locale 界面语言',
	},
	textDirection: {
		id: 'textDirection',
		section: 'general',
		tab: 'basic',
		label: () => m.textDirection(),
		keywords: 'direction rtl ltr 文本方向 从右到左',
	},
	subtitlePreset: {
		id: 'subtitlePreset',
		section: 'general',
		tab: 'basic',
		label: () => m.presetForSubtitles(),
		keywords: 'subtitle srt 字幕 预设',
	},
	exportFormat: {
		id: 'exportFormat',
		section: 'general',
		tab: 'basic',
		label: () => m.exportFormat(),
		keywords: 'export format 导出 格式 txt srt vtt json csv docx pdf md',
	},
	soundOnFinish: {
		id: 'soundOnFinish',
		section: 'general',
		tab: 'basic',
		label: () => m.playSoundOnFinish(),
		keywords: 'sound 声音 提示音 完成',
	},
	soundOnTranslateFinish: {
		id: 'soundOnTranslateFinish',
		section: 'general',
		tab: 'basic',
		label: () => m.soundOnTranslateFinish(),
		keywords: 'sound 声音 翻译完成',
	},
	focusOnFinish: {
		id: 'focusOnFinish',
		section: 'general',
		tab: 'basic',
		label: () => m.focusWindowOnFinish(),
		keywords: 'focus 窗口 前置 完成',
	},
	sendToTranslate: {
		id: 'sendToTranslate',
		section: 'general',
		tab: 'basic',
		label: () => m.sendToTranslate(),
		keywords: 'send translate after transcription 发送 翻译页 转录',
	},
	sendToSummary: {
		id: 'sendToSummary',
		section: 'general',
		tab: 'basic',
		label: () => m.sendToSummary(),
		keywords: 'send summary after transcription 发送 总结页 转录',
	},
	checkYtdlp: {
		id: 'checkYtdlp',
		section: 'general',
		tab: 'basic',
		label: () => m.checkYtdlpUpdates(),
		keywords: 'ytdlp youtube update 更新 检查',
	},
	storeRecordInDocuments: {
		id: 'storeRecordInDocuments',
		section: 'general',
		tab: 'recording',
		label: () => m.saveRecordInDocumentsFolder(),
		keywords: 'recording save documents 录音 保存 文档',
	},
	recordingPath: {
		id: 'recordingPath',
		section: 'general',
		tab: 'recording',
		label: () => m.recordingSavePath(),
		description: () => m.recordingSavePathInfo(),
		keywords: 'recording path folder 录音 路径 目录',
	},

	// ── General · recent ───────────────────────────────────────────────────
	recentFiles: {
		id: 'recentFiles',
		section: 'general',
		tab: 'recent',
		label: () => m.recentFiles(),
		description: () => m.recentFilesInfo(),
		keywords: 'recent history 最近 历史 文件',
	},
	recentLanguages: {
		id: 'recentLanguages',
		section: 'general',
		tab: 'recent',
		label: () => m.recentLanguages(),
		keywords: 'recent language 最近 语言',
	},

	// ── General · about ────────────────────────────────────────────────────
	resetOptions: {
		id: 'resetOptions',
		section: 'general',
		tab: 'about',
		label: () => m.resetOptions(),
		keywords: 'reset restore default 重置 恢复 默认',
	},
	aboutApp: {
		id: 'aboutApp',
		section: 'general',
		tab: 'about',
		label: () => m.appTitle(),
		keywords: 'about version system 关于 版本 系统信息 commit',
	},

	// ── Appearance ─────────────────────────────────────────────────────────
	themeMode: {
		id: 'themeMode',
		section: 'appearance',
		label: () => m.theme(),
		keywords: 'theme dark light system 主题 深色 浅色 跟随系统 外观',
	},
	themePalette: {
		id: 'themePalette',
		section: 'appearance',
		label: () => m.themePalette(),
		keywords: 'palette color 调色板 配色 表面',
	},
	accentColor: {
		id: 'accentColor',
		section: 'appearance',
		label: () => m.accentColor(),
		keywords: 'accent color 强调色 主题色 颜色',
	},
	customBackground: {
		id: 'customBackground',
		section: 'appearance',
		label: () => m.customBackground(),
		keywords: 'background image 背景 壁纸 图片',
	},

	// ── Transcription · basic ──────────────────────────────────────────────
	inputLanguage: {
		id: 'inputLanguage',
		section: 'transcription',
		tab: 'basic',
		label: () => m.language(),
		keywords: 'language input 语言 识别',
	},

	// ── Transcription · speakers ───────────────────────────────────────────
	diarization: {
		id: 'diarization',
		section: 'transcription',
		tab: 'speakers',
		label: () => m.enableDiarization(),
		description: () => m.infoDiarization(),
		keywords: 'diarization speaker 说话人 分离 发言者',
	},
	speakerLabels: {
		id: 'speakerLabels',
		section: 'transcription',
		tab: 'speakers',
		label: () => m.speakerLabels(),
		description: () => m.speakerLabelsInfo(),
		keywords: 'speaker label prefix 发言者 标签 前缀',
	},
	stableTimestamps: {
		id: 'stableTimestamps',
		section: 'transcription',
		tab: 'speakers',
		label: () => m.enableStableTimestamps(),
		description: () => m.stableTimestampsInfo(),
		keywords: 'timestamp stable 时间戳 稳定',
	},

	// ── Transcription · runtime ────────────────────────────────────────────
	ffmpeg: {
		id: 'ffmpeg',
		section: 'transcription',
		tab: 'runtime',
		label: () => m.runtimeDependencies(),
		description: () => m.runtimeDependenciesInfo(),
		keywords: 'ffmpeg dependency 依赖 运行时',
	},
	includeSubFolders: {
		id: 'includeSubFolders',
		section: 'transcription',
		tab: 'runtime',
		label: () => m.includeSubFolders(),
		keywords: 'folder recursive 子文件夹 递归 包含',
	},
	skipIfExists: {
		id: 'skipIfExists',
		section: 'transcription',
		tab: 'runtime',
		label: () => m.skipIfTranscriptExists(),
		keywords: 'skip overwrite 跳过 已存在',
	},
	saveNextToAudioFile: {
		id: 'saveNextToAudioFile',
		section: 'transcription',
		tab: 'runtime',
		label: () => m.placeTranscriptNextToFiles(),
		keywords: 'save output beside 输出 同目录',
	},

	// ── Models ─────────────────────────────────────────────────────────────
	modelCatalog: {
		id: 'modelCatalog',
		section: 'transcription',
		tab: 'catalog',
		label: () => m.modelCatalog(),
		description: () => m.modelCatalogInfo(),
		keywords: 'model catalog download 模型 目录 下载 推荐',
	},
	downloadModel: {
		id: 'downloadModel',
		section: 'transcription',
		tab: 'catalog',
		label: () => m.downloadModel(),
		keywords: 'download url huggingface 下载 链接',
	},
	hfMirror: {
		id: 'hfMirror',
		section: 'transcription',
		tab: 'catalog',
		label: () => m.hfMirror(),
		description: () => m.hfMirrorInfo(),
		keywords: 'huggingface mirror hf-mirror 镜像 下载慢 国内',
	},
	selectedModel: {
		id: 'selectedModel',
		section: 'transcription',
		tab: 'installed',
		label: () => m.selectModel(),
		keywords: 'model select current 模型 选择 当前',
	},
	modelSettings: {
		id: 'modelSettings',
		section: 'transcription',
		tab: 'installed',
		label: () => m.modelSettings(),
		keywords: 'model options engine 模型 设置 参数 引擎',
	},
	modelsFolder: {
		id: 'modelsFolder',
		section: 'transcription',
		tab: 'storage',
		label: () => m.modelsFolder(),
		keywords: 'models folder 模型 目录 位置 存储',
	},
	changeModelsFolder: {
		id: 'changeModelsFolder',
		section: 'transcription',
		tab: 'storage',
		label: () => m.changeModelsFolder(),
		keywords: 'move models folder 更改 模型 目录',
	},
	downloadModelsLink: {
		id: 'downloadModelsLink',
		section: 'transcription',
		tab: 'storage',
		label: () => m.downloadModelsLink(),
		keywords: 'browse models 下载 模型 网站',
	},

	// ── Translation ────────────────────────────────────────────────────────
	enableTranslation: {
		id: 'enableTranslation',
		section: 'translation',
		tab: 'engine',
		label: () => m.enableTranslation(),
		keywords: 'translation enable 翻译 启用',
	},
	translationEngine: {
		id: 'translationEngine',
		section: 'translation',
		tab: 'engine',
		label: () => m.translationEngine(),
		keywords: 'engine ollama claude openai 翻译 引擎 本地',
	},
	enginePreset: {
		id: 'enginePreset',
		section: 'translation',
		tab: 'engine',
		label: () => m.enginePreset(),
		keywords: 'preset llama.cpp lm studio jan vllm 预设 服务',
	},
	baseUrl: {
		id: 'baseUrl',
		section: 'translation',
		tab: 'engine',
		label: () => m.baseUrl(),
		keywords: 'base url endpoint 地址 接口',
	},
	apiKey: {
		id: 'apiKey',
		section: 'translation',
		tab: 'engine',
		label: () => m.apiKey(),
		keywords: 'api key token 密钥',
	},
	gatewayModel: {
		id: 'gatewayModel',
		section: 'translation',
		tab: 'engine',
		label: () => m.modelName(),
		keywords: 'model name 模型 名称',
	},
	testConnection: {
		id: 'testConnection',
		section: 'translation',
		tab: 'engine',
		label: () => m.testConnection(),
		keywords: 'test connection 测试 连接',
	},
	translateModels: {
		id: 'translateModels',
		section: 'translation',
		tab: 'models',
		label: () => m.translateModels(),
		keywords: 'translation model gguf 翻译 模型 下载',
	},
	translationLocalEngine: {
		id: 'translationLocalEngine',
		section: 'translation',
		tab: 'engine',
		label: () => m.translationLocalTitle(),
		keywords: 'local engine llama.cpp runtime start stop 本地 服务 运行时 启动',
	},
	translateDefaults: {
		id: 'translateDefaults',
		section: 'translation',
		tab: 'options',
		label: () => m.defaultTarget(),
		keywords: 'target language default 目标 语言 默认',
	},
	translateChunkSize: {
		id: 'translateChunkSize',
		section: 'translation',
		tab: 'options',
		label: () => m.chunkSize(),
		keywords: 'chunk lines 分块 行数',
	},
	translateMaxTokens: {
		id: 'translateMaxTokens',
		section: 'translation',
		tab: 'options',
		label: () => m.maxTokens(),
		keywords: 'max tokens 最大 token',
	},
	translateTemperature: {
		id: 'translateTemperature',
		section: 'translation',
		tab: 'options',
		label: () => m.temperature(),
		keywords: 'temperature 温度 采样',
	},

	// ── Summarize ──────────────────────────────────────────────────────────
	summarizeEnabled: {
		id: 'summarizeEnabled',
		section: 'summarize',
		label: () => m.processWithLlm(),
		keywords: 'summarize llm ai 摘要 总结 模型',
	},
	llmPlatform: {
		id: 'llmPlatform',
		section: 'summarize',
		label: () => m.llmPlatform(),
		keywords: 'platform claude ollama openai 平台',
	},
	llmApiKey: {
		id: 'llmApiKey',
		section: 'summarize',
		label: () => m.llmApiKey(),
		keywords: 'api key 密钥',
	},
	llmBaseUrl: {
		id: 'llmBaseUrl',
		section: 'summarize',
		label: () => m.baseUrl(),
		keywords: 'base url 地址',
	},
	llmModel: {
		id: 'llmModel',
		section: 'summarize',
		label: () => m.llmModel(),
		keywords: 'model 模型',
	},
	llmPrompt: {
		id: 'llmPrompt',
		section: 'summarize',
		label: () => m.llmPrompt(),
		keywords: 'prompt 提示词 模板',
	},
	summaryPreset: {
		id: 'summaryPreset',
		section: 'summarize',
		label: () => m.summaryPreset(),
		keywords: 'preset prompt template 预设 提示词 模板 纪要 笔记',
	},
	summaryChunkChars: {
		id: 'summaryChunkChars',
		section: 'summarize',
		label: () => m.summaryChunkChars(),
		keywords: 'chunk chars long transcript 分块 长文本 字数',
	},
	summarizeLocalEngine: {
		id: 'summarizeLocalEngine',
		section: 'summarize',
		label: () => m.summaryLocalTitle(),
		keywords: 'local engine llama.cpp runtime start stop 本地 服务 运行时 启动',
	},
	summarizeLocalModels: {
		id: 'summarizeLocalModels',
		section: 'summarize',
		label: () => m.summarizeLocalModels(),
		keywords: 'local model gguf download 本地 模型 下载',
	},
	llmTemperature: {
		id: 'llmTemperature',
		section: 'summarize',
		label: () => m.llmTemperature(),
		keywords: 'temperature 随机性 采样',
	},
	llmMaxTokens: {
		id: 'llmMaxTokens',
		section: 'summarize',
		label: () => m.maxTokens(),
		keywords: 'max tokens 最大 token',
	},
	runLlmCheck: {
		id: 'runLlmCheck',
		section: 'summarize',
		label: () => m.runLlmCheck(),
		keywords: 'test check 测试 检查',
	},

	// ── Dictation ──────────────────────────────────────────────────────────
	hotkeyEnabled: {
		id: 'hotkeyEnabled',
		section: 'dictation',
		label: () => m.globalHotkeyEnabled(),
		keywords: 'dictation hotkey 听写 快捷键 全局',
	},
	dictationIndicator: {
		id: 'dictationIndicator',
		section: 'dictation',
		label: () => m.dictationIndicatorSetting(),
		keywords: 'indicator overlay 指示器 悬浮',
	},
	hotkeyActivationMode: {
		id: 'hotkeyActivationMode',
		section: 'dictation',
		label: () => m.hotkeyActivationMode(),
		keywords: 'push to talk toggle 模式 按住 切换',
	},
	hotkeyShortcut: {
		id: 'hotkeyShortcut',
		section: 'dictation',
		label: () => m.globalHotkeyShortcut(),
		keywords: 'shortcut hotkey keys 快捷键 按键',
	},
	hotkeyOutputMode: {
		id: 'hotkeyOutputMode',
		section: 'dictation',
		label: () => m.hotkeyOutputMode(),
		keywords: 'output clipboard type 输出 剪贴板 输入',
	},
	hotkeyNormalizeOutput: {
		id: 'hotkeyNormalizeOutput',
		section: 'dictation',
		label: () => m.normalizeHotkeyOutput(),
		keywords: 'normalize punctuation 规范化 标点 大小写',
	},

	// ── Hardware acceleration ──────────────────────────────────────────────
	acceleratorDevice: {
		id: 'acceleratorDevice',
		section: 'gpu',
		tab: 'acceleration',
		label: () => m.gpuDevice(),
		keywords: 'gpu device 显卡 设备 加速',
	},
	forceCpu: {
		id: 'forceCpu',
		section: 'gpu',
		tab: 'acceleration',
		label: () => m.forceCpuMode(),
		description: () => m.forceCpuModeInfo(),
		keywords: 'cpu only 强制 禁用 gpu 加速',
	},
	vulkanDevice: {
		id: 'vulkanDevice',
		section: 'gpu',
		tab: 'acceleration',
		label: () => m.vulkanDevice(),
		keywords: 'vulkan index 设备 索引',
	},
	modelQuantization: {
		id: 'modelQuantization',
		section: 'gpu',
		tab: 'acceleration',
		label: () => m.modelQuantizationHint(),
		keywords: 'quantization hint 量化 提示',
	},
	enableDiagnostics: {
		id: 'enableDiagnostics',
		section: 'gpu',
		tab: 'acceleration',
		label: () => m.enableDiagnostics(),
		keywords: 'diagnostics verbose 诊断 详细 日志',
	},
	detectGpu: {
		id: 'detectGpu',
		section: 'gpu',
		tab: 'diagnostics',
		label: () => m.detectGpu(),
		keywords: 'detect scan 检测 扫描 诊断',
	},
	// ── Advanced ───────────────────────────────────────────────────────────
	unloadTimeout: {
		id: 'unloadTimeout',
		section: 'advanced',
		tab: 'behaviour',
		label: () => m.unloadModelAfterInactivity(),
		description: () => m.unloadModelAfterInactivityInfo(),
		keywords: 'memory unload idle 内存 卸载 空闲 模型',
	},
	logsAndDiagnostics: {
		id: 'logsAndDiagnostics',
		section: 'advanced',
		tab: 'logs',
		label: () => m.logsAndDiagnostics(),
		keywords: 'log diagnostics 日志 诊断 排查',
	},
	resetApp: {
		id: 'resetApp',
		section: 'advanced',
		tab: 'logs',
		label: () => m.resetApp(),
		description: () => m.resetAppInfo(),
		keywords: 'reset factory erase 重置 清空 出厂',
	},
} satisfies Record<string, SettingDef>

export type SettingId = keyof typeof SETTINGS

export const ALL_SETTINGS = Object.values(SETTINGS) as SettingDef[]

/** Fuzzy-ish match: label, description or keyword containing the query. */
export function matchSettings(query: string, locale: string): SettingDef[] {
	const needle = query.trim().toLowerCase()
	if (!needle) return []
	return ALL_SETTINGS.filter((def) => {
		const haystack = [def.label(), def.description?.() ?? '', def.keywords ?? '', def.id].join(' ').toLowerCase()
		return haystack.includes(needle)
	}).sort((a, b) => {
		// Prefix matches first — typing "模型" should surface the model rows.
		const score = (def: SettingDef) => (def.label().toLowerCase().startsWith(needle) ? 0 : 1)
		return score(a) - score(b) || a.label().localeCompare(b.label(), locale)
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation model
// ─────────────────────────────────────────────────────────────────────────────

export interface TabSpec {
	id: string
	label: () => string
}

export interface SectionSpec {
	id: SectionId
	label: () => string
	icon: LucideIcon
	/** Empty = the section renders a single scrolling page. */
	tabs: TabSpec[]
}

export interface SectionGroup {
	label: () => string
	sections: SectionSpec[]
}

const TAB_BASIC: TabSpec = { id: 'basic', label: () => m.tabBasic() }
const TAB_RECORDING: TabSpec = { id: 'recording', label: () => m.recording() }

export const SECTION_GROUPS: SectionGroup[] = [
	{
		label: () => m.general(),
		sections: [
			{
				id: 'general',
				label: () => m.general(),
				icon: Globe,
				tabs: [TAB_BASIC, TAB_RECORDING, { id: 'recent', label: () => m.tabRecent() }, { id: 'about', label: () => m.tabAbout() }],
			},
		],
	},
	{
		label: () => m.transcription(),
		sections: [
			{
				// Models live inside the transcription section: they are part of the
				// transcription pipeline, not a separate area of the app.
				id: 'transcription',
				label: () => m.transcription(),
				icon: SlidersHorizontal,
				tabs: [
					TAB_BASIC,
					{ id: 'speakers', label: () => m.speakerTiming() },
					{ id: 'runtime', label: () => m.runtimeDependencies() },
					{ id: 'catalog', label: () => m.modelCatalog() },
					{ id: 'installed', label: () => m.installed() },
					{ id: 'storage', label: () => m.modelsFolder() },
				],
			},
			{
				id: 'translation',
				label: () => m.translation(),
				icon: Languages,
				tabs: [
					{ id: 'engine', label: () => m.translationEngine() },
					{ id: 'models', label: () => m.translateModels() },
					{ id: 'options', label: () => m.tabOptions() },
				],
			},
		],
	},
	{
		label: () => m.customize(),
		sections: [
			{
				id: 'appearance',
				label: () => m.appearance(),
				icon: Palette,
				tabs: [],
			},
			{
				id: 'dictation',
				label: () => m.globalDictation(),
				icon: Mic,
				tabs: [],
			},
			{
				id: 'summarize',
				label: () => m.processWithLlm(),
				icon: Sparkles,
				tabs: [],
			},
		],
	},
	{
		label: () => m.advanced(),
		sections: [
			{
				id: 'gpu',
				label: () => m.hardwareAcceleration(),
				icon: Cpu,
				tabs: [
					{ id: 'acceleration', label: () => m.tabAcceleration() },
					{ id: 'diagnostics', label: () => m.tabDiagnostics() },
				],
			},
			{
				id: 'api',
				label: () => m.apiAndAgents(),
				icon: Terminal,
				tabs: [],
			},
			{
				id: 'advanced',
				label: () => m.advanced(),
				icon: Wrench,
				tabs: [
					{ id: 'behaviour', label: () => m.tabBehaviour() },
					{ id: 'logs', label: () => m.logsAndDiagnostics() },
				],
			},
		],
	},
]

export const SECTIONS: SectionSpec[] = SECTION_GROUPS.flatMap((group) => group.sections)

export function findSection(id: SectionId): SectionSpec {
	return SECTIONS.find((section) => section.id === id) ?? SECTIONS[0]
}

/** First tab id of a section ('' when the section has no tabs). */
export function defaultTab(section: SectionSpec) {
	return section.tabs[0]?.id ?? ''
}

