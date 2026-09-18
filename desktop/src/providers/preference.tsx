import { ReactNode, SetStateAction, createContext, useContext, useEffect, useRef, useState } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import { load } from '@tauri-apps/plugin-store'
import * as config from '~/lib/config'
import { ACCENT_PRESETS, applyAccentColor, applyThemePalette, backgroundOverlay, DEFAULT_ACCENT_ID, DEFAULT_PALETTE_ID } from '~/lib/appearance'
import { TextFormat } from '~/components/format-select'
import { ModifyState } from '~/lib/types'
import { supportedLanguages } from '~/lib/i18n'
import { getLocale, getTextDirection, setLocale } from '~/paraglide/runtime.js'
import { m } from '~/paraglide/messages.js'
import { LlmConfig, defaultOpenAIConfig } from '~/lib/llm'
import { DEFAULT_SUMMARY_CHUNK_CHARS } from '~/lib/summarize'
import { DEFAULT_LOCAL_BASE_URL, DEFAULT_LOCAL_MODEL } from '~/lib/translate-models'
import { message } from '@tauri-apps/plugin-dialog'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import type { ModelMetadata } from '~/lib/model'
import { getModelPipeline, getModelPipelineFromPath, ModelPipeline, ModelType } from '~/lib/model-pipeline'

type Direction = 'ltr' | 'rtl'
export type HomeTab = 'record' | 'file' | 'link'
/** `system` follows the OS light/dark preference. */
export type ThemeMode = 'light' | 'dark' | 'system'

export interface RecentFile {
	name: string
	path: string
	ts: number
}

export interface AdvancedTranscribeOptions {
	includeSubFolders: boolean
	skipIfExists: boolean
	saveNextToAudioFile: boolean
}

// Define the type of preference
export interface Preference {
	displayLanguage: string
	setDisplayLanguage: ModifyState<string>
	soundOnFinish: boolean
	setSoundOnFinish: ModifyState<boolean>
	focusOnFinish: boolean
	setFocusOnFinish: ModifyState<boolean>
	modelPath: string | null
	setModelPath: ModifyState<string | null>
	modelMetadata: ModelMetadata | null
	setModelMetadata: ModifyState<ModelMetadata | null>
	modelDisplayNames: Record<string, string>
	setModelDisplayNames: ModifyState<Record<string, string>>
	skippedSetup: boolean
	setSkippedSetup: ModifyState<boolean>
	textAreaDirection: Direction
	setTextAreaDirection: ModifyState<Direction>
	textFormatTranscript: TextFormat
	setTextFormatTranscript: ModifyState<TextFormat>
	textFormatSummary: TextFormat
	setTextFormatSummary: ModifyState<TextFormat>
	modelOptions: ModelOptions
	setModelOptions: ModifyState<ModelOptions>
	theme: 'light' | 'dark'
	themeMode: ThemeMode
	setThemeMode: ModifyState<ThemeMode>
	themePalette: string
	setThemePalette: ModifyState<string>
	accentPreset: string
	setAccentPreset: ModifyState<string>
	accentCustomColor: string | null
	setAccentCustomColor: ModifyState<string | null>
	customBackground: string | null
	setCustomBackground: ModifyState<string | null>
	recentFiles: RecentFile[]
	setRecentFiles: ModifyState<RecentFile[]>
	addRecentFile: (name: string, path: string) => void
	storeRecordInDocuments: boolean
	setStoreRecordInDocuments: ModifyState<boolean>
	customRecordingPath: string | null
	setCustomRecordingPath: ModifyState<string | null>
	setLanguageDirections: () => void
	homeTab: HomeTab
	setHomeTab: ModifyState<HomeTab>

	llmConfig: LlmConfig
	setLlmConfig: ModifyState<LlmConfig>
	translationLlmConfig: LlmConfig
	setTranslationLlmConfig: ModifyState<LlmConfig>
	translateChunkSize: number
	setTranslateChunkSize: ModifyState<number>
	soundOnTranslateFinish: boolean
	setSoundOnTranslateFinish: ModifyState<boolean>
	/** Characters per summarisation chunk (`0` sends the whole transcript). */
	summarizeChunkChars: number
	setSummarizeChunkChars: ModifyState<number>
	/** Open the summary tab automatically once a transcription finishes. */
	sendToSummary: boolean
	setSendToSummary: ModifyState<boolean>
	ffmpegOptions: FfmpegOptions
	setFfmpegOptions: ModifyState<FfmpegOptions>
	resetOptions: () => void
	enableSubtitlesPreset: () => void
	ytDlpVersion: string | null
	setYtDlpVersion: ModifyState<string | null>
	shouldCheckYtDlpVersion: boolean
	setShouldCheckYtDlpVersion: ModifyState<boolean>

	advancedTranscribeOptions: AdvancedTranscribeOptions
	setAdvancedTranscribeOptions: ModifyState<AdvancedTranscribeOptions>

	diarizeEnabled: boolean
	setDiarizeEnabled: ModifyState<boolean>
	/** Show `[Speaker n]` prefixes in transcripts/exports (needs diarization to be useful). */
	speakerLabels: boolean
	setSpeakerLabels: ModifyState<boolean>
	stableTimestampsEnabled: boolean
	setStableTimestampsEnabled: ModifyState<boolean>

	gpuDevice: number | null
	setGpuDevice: ModifyState<number | null>

	forceCpu: boolean
	setForceCpu: ModifyState<boolean>
	/** Rewrite HuggingFace download URLs to hf-mirror.com (slow/unreachable HF). */
	hfMirrorEnabled: boolean
	setHfMirrorEnabled: ModifyState<boolean>
	vulkanDevice: number | null
	setVulkanDevice: ModifyState<number | null>
	enableDiagnostics: boolean
	setEnableDiagnostics: ModifyState<boolean>
	modelQuantization: string
	setModelQuantization: ModifyState<string>

	unloadTimeoutMinutes: number
	setUnloadTimeoutMinutes: ModifyState<number>

	recentLanguages: { code: string; ts: number }[]
	setRecentLanguages: ModifyState<{ code: string; ts: number }[]>

	analyticsEnabled: boolean
	setAnalyticsEnabled: (value: boolean) => void

	modelType: ModelType
	modelPipeline: ModelPipeline
}

// Create the context
const PreferenceContext = createContext<Preference | null>(null)

// Custom hook to use the preference context
export function usePreferenceProvider() {
	return useContext(PreferenceContext) as Preference
}

export interface FfmpegOptions {
	normalize_loudness: boolean
	custom_command: string | null
}

export type TranslationTarget = 'none' | 'en' | 'zh' | 'ru' | 'ja' | 'fr' | 'de' | 'es' | 'ko' | 'it'

export interface ModelOptions {
	lang: string
	verbose: boolean
	n_threads?: number
	init_prompt?: string
	temperature?: number
	translate: TranslationTarget | string
	max_text_ctx?: number
	word_timestamps?: boolean
	max_sentence_len?: number
	sampling_strategy: 'greedy' | 'beam search'
	best_of?: number
	beam_size?: number
}

const systemIsDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
const defaultDisplayLanguage = 'en-US'

/**
 * Translation defaults to a **local** OpenAI-compatible server (llama.cpp
 * `llama-server`, LM Studio, Jan, vLLM…) instead of Ollama, so the built-in
 * path is offline and uses a small model.
 */
function defaultTranslateLlmConfig(): LlmConfig {
	return {
		...defaultOpenAIConfig(),
		enabled: false,
		model: DEFAULT_LOCAL_MODEL,
		openaiBaseUrl: DEFAULT_LOCAL_BASE_URL,
		openaiApiKey: '',
		temperature: 0.2,
		maxTokens: 4096,
	}
}

/**
 * Summarisation defaults to the same built-in engine: a small local model that
 * the app downloads and serves itself, so summarising works without Ollama or a
 * cloud API key. A hosted provider can still be selected in the settings.
 */
function defaultSummarizeLlmConfig(): LlmConfig {
	return {
		...defaultOpenAIConfig(),
		enabled: false,
		model: DEFAULT_LOCAL_MODEL,
		openaiBaseUrl: DEFAULT_LOCAL_BASE_URL,
		openaiApiKey: '',
		temperature: 0.3,
		maxTokens: 2048,
	}
}

/** Migrate the legacy `prefs_theme` (light/dark only) into the new theme mode. */
function initialThemeMode(): ThemeMode {
	try {
		const raw = localStorage.getItem('prefs_theme')
		if (raw) {
			const value = JSON.parse(raw)
			if (value === 'light' || value === 'dark') return value
		}
	} catch {
		/* ignore malformed values */
	}
	return 'system'
}

const defaultOptions = {
	soundOnFinish: true,
	focusOnFinish: true,
	modelPath: null,
	modelOptions: {
			init_prompt: '',
			verbose: false,
			lang: 'en',
			n_threads: 4,
			temperature: 0.4,
			translate: 'none',
			max_text_ctx: undefined,
			word_timestamps: false,
			max_sentence_len: undefined,
			sampling_strategy: 'beam search' as 'greedy' | 'beam search',
			best_of: 5,
			beam_size: 5,
		},
	ffmpegOptions: {
		normalize_loudness: false,
		custom_command: null,
	},
	storeRecordInDocuments: true,
	llmConfig: defaultSummarizeLlmConfig(),
	ytDlpVersion: null,
	shouldCheckYtDlpVersion: true,
}

// Preference provider component
export function PreferenceProvider({ children }: { children: ReactNode }) {
	const previousLanguage = useRef(getLocale())
	const [language, setLanguage] = useLocalStorage('prefs_display_language', defaultDisplayLanguage)
	const [isFirstRun, setIsFirstRun] = useLocalStorage('prefs_first_localstorage_read', true)

	const [modelPath, setModelPath] = useLocalStorage<string | null>('prefs_model_path', null)
	const [modelMetadata, setModelMetadata] = useState<ModelMetadata | null>(null)
	const [modelDisplayNames, setModelDisplayNames] = useLocalStorage<Record<string, string>>('prefs_model_display_names', {})
	const [skippedSetup, setSkippedSetup] = useLocalStorage<boolean>('prefs_skipped_setup', false)
	const [textAreaDirection, setTextAreaDirection] = useLocalStorage<Direction>('prefs_textarea_direction', 'ltr')
	const [textFormatTranscript, setTextFormatTranscript] = useLocalStorage<TextFormat>('prefs_text_format_transcript', 'pdf')
	const [textFormatSummary, setTextFormatSummary] = useLocalStorage<TextFormat>('prefs_text_format_summary', 'md')
	const isMounted = useRef<boolean>(false)
	const [themeMode, setThemeMode] = useLocalStorage<ThemeMode>('prefs_theme_mode', initialThemeMode())
	const [themePalette, setThemePalette] = useLocalStorage<string>('prefs_theme_palette', DEFAULT_PALETTE_ID)
	const [systemDark, setSystemDark] = useState(systemIsDark)
	// Resolved scheme (what the CSS class and the accent helpers use).
	const theme: 'light' | 'dark' = themeMode === 'system' ? (systemDark ? 'dark' : 'light') : themeMode
	const [accentPreset, setAccentPreset] = useLocalStorage<string>('prefs_accent_preset', DEFAULT_ACCENT_ID)
	const [accentCustomColor, setAccentCustomColor] = useLocalStorage<string | null>('prefs_accent_custom_color', null)
	const [customBackground, setCustomBackground] = useLocalStorage<string | null>('prefs_custom_background', null)
	const [recentFiles, setRecentFiles] = useLocalStorage<RecentFile[]>('prefs_recent_files', [])

	function addRecentFile(name: string, path: string) {
		if (!path) return
		setRecentFiles((prev) => {
			const entry: RecentFile = { name: name || path.split(/[\\/]/).pop() || path, path, ts: Date.now() }
			return [entry, ...(prev ?? []).filter((f) => f.path !== path)].slice(0, 12)
		})
	}
	const [homeTab, setHomeTab] = useLocalStorage<HomeTab>('prefs_home_tab', 'file')

	const [soundOnFinish, setSoundOnFinish] = useLocalStorage('prefs_sound_on_finish', defaultOptions.soundOnFinish)
	const [focusOnFinish, setFocusOnFinish] = useLocalStorage('prefs_focus_on_finish', defaultOptions.focusOnFinish)
	const [modelOptions, setModelOptions] = useLocalStorage<ModelOptions>('prefs_modal_args', defaultOptions.modelOptions)
	const [ffmpegOptions, setFfmpegOptions] = useLocalStorage<FfmpegOptions>('prefs_ffmpeg_options', defaultOptions.ffmpegOptions)
	const [storeRecordInDocuments, setStoreRecordInDocuments] = useLocalStorage('prefs_store_record_in_documents', defaultOptions.storeRecordInDocuments)
	const [customRecordingPath, setCustomRecordingPath] = useLocalStorage<string | null>('prefs_custom_recording_path', null)
	const [llmConfig, setLlmConfig] = useLocalStorage<LlmConfig>('prefs_llm_config', defaultOptions.llmConfig)
	const [translationLlmConfig, setTranslationLlmConfig] = useLocalStorage<LlmConfig>('prefs_translation_llm_config', defaultTranslateLlmConfig())
	const [translateChunkSize, setTranslateChunkSize] = useLocalStorage<number>('prefs_translate_chunk_size', 25)
	const [soundOnTranslateFinish, setSoundOnTranslateFinish] = useLocalStorage<boolean>('prefs_sound_on_translate_finish', true)
	const [summarizeChunkChars, setSummarizeChunkChars] = useLocalStorage<number>('prefs_summarize_chunk_chars', DEFAULT_SUMMARY_CHUNK_CHARS)
	const [sendToSummary, setSendToSummary] = useLocalStorage<boolean>('prefs_send_to_summary', false)
	const [ytDlpVersion, setYtDlpVersion] = useLocalStorage<string | null>('prefs_ytdlp_version', null)
	const [shouldCheckYtDlpVersion, setShouldCheckYtDlpVersion] = useLocalStorage<boolean>('prefs_should_check_ytdlp_version', true)
	const [advancedTranscribeOptions, setAdvancedTranscribeOptions] = useLocalStorage<AdvancedTranscribeOptions>('prefs_advanced_transcribe_options', {
		includeSubFolders: false,
		saveNextToAudioFile: true,
		skipIfExists: true,
	})

	const [recentLanguages, setRecentLanguages] = useLocalStorage<{ code: string; ts: number }[]>('prefs_recent_languages', [])
	const [diarizeEnabled, setDiarizeEnabled] = useLocalStorage<boolean>('prefs_diarize_enabled', false)
	const [speakerLabels, setSpeakerLabels] = useLocalStorage<boolean>('prefs_speaker_labels', false)
	const [stableTimestampsEnabled, setStableTimestampsEnabled] = useLocalStorage<boolean>('prefs_stable_timestamps_enabled', false)
	const [gpuDevice, setGpuDevice] = useLocalStorage<number | null>('prefs_gpu_device', null)
	const [forceCpu, setForceCpu] = useLocalStorage<boolean>('prefs_force_cpu', false)
	const [hfMirrorEnabled, setHfMirrorEnabled] = useLocalStorage<boolean>('prefs_hf_mirror', false)
	const [vulkanDevice, setVulkanDevice] = useLocalStorage<number | null>('prefs_vulkan_device', null)
	const [enableDiagnostics, setEnableDiagnostics] = useLocalStorage<boolean>('prefs_enable_diagnostics', false)
	const [modelQuantization, setModelQuantization] = useLocalStorage<string>('prefs_model_quantization', 'auto')
	const [unloadTimeoutMinutes, setUnloadTimeoutMinutes] = useLocalStorage<number>('prefs_unload_timeout_minutes', 5)

	const [modelType, setModelType] = useState<ModelType>('custom')
	const [modelPipeline, setModelPipeline] = useState<ModelPipeline>(getModelPipeline(''))

	const [analyticsEnabled, setAnalyticsEnabledLocal] = useState(true)
	useEffect(() => {
		if (!modelPath) {
			setModelMetadata(null)
			return
		}
		invoke<ModelMetadata>('get_model_metadata', { modelPath })
			.then(setModelMetadata)
			.catch((error) => {
				console.error('failed to read model metadata:', error)
				setModelMetadata(null)
			})
	}, [modelPath])

	useEffect(() => {
		if (!modelPath) {
			setModelType('custom')
			setModelPipeline(getModelPipeline(''))
			return
		}
		const pipeline = getModelPipelineFromPath(modelPath)
		setModelType(pipeline.type)
		setModelPipeline(pipeline)
	}, [modelPath])

	useEffect(() => {
		load(config.storeFilename).then((store) => {
			store.get<boolean>('analytics_enabled').then((val) => {
				if (val !== null && val !== undefined) {
					setAnalyticsEnabledLocal(val)
				}
			})
		})
	}, [])
	const setAnalyticsEnabled = async (value: boolean) => {
		setAnalyticsEnabledLocal(value)
		const store = await load(config.storeFilename)
		await store.set('analytics_enabled', value)
		await store.save()
	}

	useEffect(() => {
		setIsFirstRun(false)
	}, [])

	useEffect(() => {
		const query = window.matchMedia?.('(prefers-color-scheme: dark)')
		if (!query) return
		const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches)
		query.addEventListener('change', listener)
		return () => query.removeEventListener('change', listener)
	}, [])

	useEffect(() => {
		if (theme === 'dark') {
			document.documentElement.classList.add('dark')
		} else {
			document.documentElement.classList.remove('dark')
		}
	}, [theme])

	// Neutral palette (surfaces) — independent from the accent color.
	useEffect(() => {
		applyThemePalette(themePalette, theme)
	}, [themePalette, theme])

	// Accent color (preset palette or custom hex)
	useEffect(() => {
		applyAccentColor(accentPreset, accentCustomColor, theme)
	}, [accentPreset, accentCustomColor, theme])

	// Legacy accent ids (e.g. the removed 'blue' preset) fall back to the default
	// 三船栞子 colour so a swatch is always selected in the appearance page.
	useEffect(() => {
		if (!ACCENT_PRESETS.some((preset) => preset.id === accentPreset)) setAccentPreset(DEFAULT_ACCENT_ID)
	}, [accentPreset, setAccentPreset])

	// Custom background image behind the (translucent) cards
	useEffect(() => {
		const body = document.body
		if (customBackground) {
			const url = convertFileSrc(customBackground)
			body.style.backgroundImage = `${backgroundOverlay(theme, 1)}, url("${url}")`
			body.style.backgroundSize = 'cover'
			body.style.backgroundPosition = 'center'
			body.style.backgroundAttachment = 'fixed'
		} else {
			body.style.backgroundImage = ''
		}
	}, [customBackground, theme])

	function setLanguageDefaults() {
		if (supportedLanguages[preference.displayLanguage]) {
			preference.setModelOptions({ ...preference.modelOptions, lang: preference.displayLanguage.split('-')[0].toLowerCase() })
			preference.setTextAreaDirection(getTextDirection())
		}
	}
	useEffect(() => {
		if (!isMounted.current) {
			isMounted.current = true
			return
		}
		if (previousLanguage.current !== getLocale() || isFirstRun) {
			previousLanguage.current = getLocale()
			setLanguageDefaults()
		}
	}, [language, isFirstRun])

	function setDisplayLanguage(nextLanguage: SetStateAction<string>) {
		const resolvedLanguage = typeof nextLanguage === 'function' ? nextLanguage(language) : nextLanguage
		if (!supportedLanguages[resolvedLanguage]) return
		if (resolvedLanguage !== getLocale()) setLocale(resolvedLanguage as never, { reload: false })
		setLanguage(resolvedLanguage)
	}

	useEffect(() => {
		if (!supportedLanguages[language]) {
			setLanguage('en-US')
		}
	}, [language, setLanguage])

	function resetOptions() {
		setSoundOnFinish(defaultOptions.soundOnFinish)
		setFocusOnFinish(defaultOptions.focusOnFinish)
		setModelOptions(defaultOptions.modelOptions)
		setFfmpegOptions(defaultOptions.ffmpegOptions)
		setStoreRecordInDocuments(defaultOptions.storeRecordInDocuments)
		setCustomRecordingPath(null)
		setLlmConfig(defaultOptions.llmConfig)
		message(m.successAction())
	}

	function enableSubtitlesPreset() {
		setModelOptions({ ...preference.modelOptions, word_timestamps: true, max_sentence_len: 32 })
		setTextFormatTranscript('srt')
		message(m.successAction())
	}

	const preference: Preference = {
		enableSubtitlesPreset,
		llmConfig,
		translationLlmConfig,
		resetOptions,
		setLlmConfig,
		setTranslationLlmConfig,
		setLanguageDirections: setLanguageDefaults,
		modelOptions,
		setModelOptions,
		storeRecordInDocuments,
		setStoreRecordInDocuments,
		customRecordingPath,
		setCustomRecordingPath,
		textFormatTranscript,
		setTextFormatTranscript,
		textFormatSummary,
		setTextFormatSummary,
		textAreaDirection,
		setTextAreaDirection,
		skippedSetup,
		setSkippedSetup,
		displayLanguage: language,
		setDisplayLanguage,
		soundOnFinish,
		setSoundOnFinish,
		soundOnTranslateFinish,
		setSoundOnTranslateFinish,
		summarizeChunkChars,
		setSummarizeChunkChars,
		sendToSummary,
		setSendToSummary,
		translateChunkSize,
		setTranslateChunkSize,
		focusOnFinish,
		setFocusOnFinish,
		modelPath,
		setModelPath,
		modelMetadata,
		setModelMetadata,
		modelDisplayNames,
		setModelDisplayNames,
		theme,
		themeMode,
		setThemeMode,
		themePalette,
		setThemePalette,
		accentPreset,
		setAccentPreset,
		accentCustomColor,
		setAccentCustomColor,
		customBackground,
		setCustomBackground,
		recentFiles,
		setRecentFiles,
		addRecentFile,
		homeTab,
		setHomeTab,
		ffmpegOptions,
		setFfmpegOptions,
		ytDlpVersion,
		setYtDlpVersion,
		shouldCheckYtDlpVersion,
		setShouldCheckYtDlpVersion,
		advancedTranscribeOptions,
		setAdvancedTranscribeOptions,
		recentLanguages,
		setRecentLanguages,
		diarizeEnabled,
		setDiarizeEnabled,
		speakerLabels,
		setSpeakerLabels,
		stableTimestampsEnabled,
		setStableTimestampsEnabled,
		gpuDevice,
		setGpuDevice,
		forceCpu,
		setForceCpu,
		hfMirrorEnabled,
		setHfMirrorEnabled,
		vulkanDevice,
		setVulkanDevice,
		enableDiagnostics,
		setEnableDiagnostics,
		modelQuantization,
		setModelQuantization,
		unloadTimeoutMinutes,
		setUnloadTimeoutMinutes,
		analyticsEnabled,
		setAnalyticsEnabled,
		modelType,
		modelPipeline,
	}

	return <PreferenceContext.Provider value={preference}>{children}</PreferenceContext.Provider>
}
