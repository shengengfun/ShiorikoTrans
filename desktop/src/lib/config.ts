export const aboutURL = 'https://thewh1teagle.github.io/audire/'
export const updateVersionURL = 'https://github.com/thewh1teagle/audire/releases/latest'
export const modelsDocURL = 'https://thewh1teagle.github.io/audire/docs#models'
export const discordURL = 'https://discord.gg/EcxWSstQN8'
export const unsupportedCpuReadmeURL = 'https://thewh1teagle.github.io/audire/docs#install'
export const supportaudireURL = 'https://thewh1teagle.github.io/audire/?action=support-audire'
export const privacyPolicyURL = 'https://thewh1teagle.github.io/audire/?action=open-privacy-policy'
export const storeFilename = 'app_config.json'
export const latestReleaseURL = 'https://github.com/thewh1teagle/audire/releases/latest'
export const latestVersionWithoutVulkan = 'https://github.com/thewh1teagle/audire/releases/download/v2.4.0/audire_2.4.0_x64-setup.exe'

export const modelUrls = {
	default: [
		'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin',
		'https://huggingface.co/audire-app/whisper-large-v3-turbo-gguf/resolve/main/ggml-large-v3-turbo.bin', // Hugging Face fallback
		'https://github.com/thewh1teagle/audire/releases/download/model-files-v1.0/ggml-large-v3-turbo.bin', // GitHub fallback
	],
	hebrew: ['https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-ggml/resolve/main/ggml-model.bin'],
}

export const embeddingModelFilename = 'wespeaker_en_voxceleb_CAM++.onnx'
export const segmentModelFilename = 'segmentation-3.0.onnx'
export const embeddingModelUrl = 'https://github.com/thewh1teagle/audire/releases/download/v0.0.1/wespeaker_en_voxceleb_CAM++.onnx'
export const segmentModelUrl = 'https://github.com/thewh1teagle/audire/releases/download/v0.0.1/segmentation-3.0.onnx'

export const diarizeModelFilename = 'diar_streaming_sortformer_4spk-v2.1.onnx'
export const diarizeModelUrl = 'https://huggingface.co/altunenes/parakeet-rs/resolve/main/diar_streaming_sortformer_4spk-v2.1.onnx'
export const vadModelFilename = 'ggml-silero-v6.2.0.bin'
export const vadModelUrl = 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin'

// Tencent Hunyuan-Audio (腾讯混元音频)：ASR + 音频理解。
// 注意：
// 1) 官方仓库 tencent/Hunyuan-Audio 是 gated 模型，需 HuggingFace 登录并同意协议后
//    才能下载（curl -L -H "Authorization: Bearer <HF_TOKEN>" ...）。
// 2) 模型是多文件（safetensors + config + tokenizer + whisper 编码器，约 14GB），
//    且为自定义架构，sona 现有引擎无法运行 —— 需要专门的 Hunyuan 推理引擎
//    （见 plans/hunyuan-integration/）。此配置仅作为下载入口占位。
export const hunyuanModelFilename = 'model.safetensors'
export const hunyuanModelUrl = 'https://huggingface.co/tencent/Hunyuan-Audio/resolve/main/model.safetensors'

export const llmApiKeyUrl = 'https://console.anthropic.com/settings/keys'
export const llmDefaultMaxTokens = 8192 // https://docs.anthropic.com/en/docs/about-claude/models
export const llmLimitsUrl = 'https://console.anthropic.com/settings/limits'
export const llmCostUrl = 'https://console.anthropic.com/settings/cost'

export const ytDlpAssetNames: Record<string, string> = {
	'windows-x86_64': 'yt-dlp.exe',
	'windows-aarch64': 'yt-dlp_arm64.exe',
	'linux-x86_64': 'yt-dlp_linux',
	'linux-aarch64': 'yt-dlp_linux_aarch64',
	'macos-x86_64': 'yt-dlp_macos',
	'macos-aarch64': 'yt-dlp_macos',
}

export function ytDlpDownloadUrl(version: string, key: string): string {
	return `https://github.com/yt-dlp/yt-dlp/releases/download/${version}/${ytDlpAssetNames[key]}`
}

export const videoExtensions = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'webm', 'mxf']
export const audioExtensions = ['mp3', 'wav', 'aac', 'flac', 'oga', 'ogg', 'opic', 'opus', 'm4a', 'm4b', 'wma']
export const themes = ['light', 'dark']
