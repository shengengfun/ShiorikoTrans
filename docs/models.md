# 🌟 ShiorikoTrans Models 🌟

Welcome to the ShiorikoTrans Models page! Here you can find a curated list of suggested models to use with ShiorikoTrans. To install a model, use the "Magic Setup" link to open it in ShiorikoTrans, or copy and paste the direct download link in ShiorikoTrans settings.

## Available Models

### 🌱 Tiny Model

A compact and efficient version, suitable for quick tasks and limited-resource environments.

[👉 Magic Setup](https://shorturl.at/XSP9R)  
[🔽 Direct Download](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin?download=true)

### 🌿 Small Model

A small yet capable model for a balance of efficiency and performance.

[👉 Magic Setup](https://shorturl.at/EmJS8)  
[🔽 Direct Download](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin?download=true)

### ⚖️ Medium Model

Balances performance and resource usage, making it ideal for most general applications.

[👉 Magic Setup](https://shorturl.at/Ha6br)  
[🔽 Direct Download](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin?download=true)

### 🚀 Large Model (v3)

For high accuracy and more computational resources, excels in complex scenarios.

[👉 Magic Setup](https://tinyurl.com/3cn846h8)  
[🔽 Direct Download](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin?download=true)

### 🚀 Large v3 Turbo (Recommended)

[👉 Magic Setup](https://tinyurl.com/yphwban5)  
[🔽 Direct Download](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin)

### 🦜 Parakeet TDT 0.6B v3

NVIDIA Parakeet TDT 0.6B v3 —— 0.6B 参数，支持 25 种欧洲语言（保加利亚语/克罗地亚语/捷克语/丹麦语/荷兰语/英语/爱沙尼亚语/芬兰语/法语/德语/希腊语/匈牙利语/意大利语/拉脱维亚语/立陶宛语/马耳他语/波兰语/葡萄牙语/罗马尼亚语/俄语/斯洛伐克语/斯洛文尼亚语/西班牙语/瑞典语/乌克兰语），带语言检测，速度很快。需要 VAD 辅助模型（应用会自动下载）。

[🔽 Download Q4_K_M](https://huggingface.co/handy-computer/parakeet-tdt-0.6b-v3-gguf/resolve/main/parakeet-tdt-0.6b-v3-Q4_K_M.gguf?download=true)

### ⚡ Nemotron 3.5 ASR Streaming 0.6B

NVIDIA Nemotron 3.5 ASR Streaming 0.6B —— 32 种语言（含中/日/韩/阿/印地/越/俄/德/法/西/葡…），RNNT 流式结构，适合听写与实时场景。需要 VAD 辅助模型（应用会自动下载）。

[🔽 Download Q4_K_M](https://huggingface.co/handy-computer/nemotron-3.5-asr-streaming-0.6b-gguf/resolve/main/nemotron-3.5-asr-streaming-0.6b-Q4_K_M.gguf?download=true)

### 🀄 SenseVoice Small (int8)

FunAudioLLM SenseVoice Small 的 ONNX CTC 导出，支持中文 / 英文 / 粤语 / 日语 / 韩语，内置语种与情感/事件识别，推理极快。需要 `model.int8.onnx` 与同目录的 `tokens.txt` 两个文件。

[🔽 model.int8.onnx](https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/model.int8.onnx?download=true)
[🔽 tokens.txt](https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/tokens.txt?download=true)

> 以上模型均可在 **设置 → 模型 → 模型目录** 里一键下载（含 VAD 辅助模型），无需手动放文件。

### Models optimised for other languages

<details>
<summary>✡️ Hebrew (Ivrit)</summary>

Specialized for Hebrew (Ivrit) language data, optimized for high speed and accuracy in Hebrew tasks.

[👉 Magic Setup (Large v3 Turbo)](https://tinyurl.com/t9r3tyxk)  
[🔽 Direct Download (Large v3 Turbo)](https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-ggml/resolve/main/ggml-model.bin?download=true)

</details>

<details>
<summary>🇳🇴 Norwegian</summary>
	
Optimised for Norwegian by the [AI Lab at the National Library of Norway](https://huggingface.co/NbAiLab).

[👉 Magic Setup (medium)](https://tinyurl.com/5wzb9ux8)  
[🔽 Direct Download (medium)](https://huggingface.co/NbAiLab/nb-whisper-medium/blob/main/ggml-model.bin?download=true)

[👉 Magic Setup (large)](https://tinyurl.com/f228efbu)  
[🔽 Direct Download (large)](https://huggingface.co/NbAiLab/nb-whisper-large/blob/main/ggml-model.bin?download=true)

More models of smaller sizes are available via [their huggingface download page](https://huggingface.co/NbAiLab/nb-whisper-large).  
Find the size you want, download the _ggml-model.bin_ file, rename the file, and palce it in shiorikotrans's model folder.

</details>

<details>
<summary>🇸🇪 Swedish</summary>

Optimised for Swedish by the [Data Lab at the National Library of Sweden](https://huggingface.co/KBLab).

[👉 Magic Setup (medium)](https://tinyurl.com/ynawnc33)  
[🔽 Direct Download (medium)](https://huggingface.co/KBLab/kb-whisper-medium/blob/main/ggml-model.bin?download=true)

[👉 Magic Setup (large v3)](https://tinyurl.com/46dvpeky)  
[🔽 Direct Download (large v3)](https://huggingface.co/KBLab/kb-whisper-large/blob/main/ggml-model.bin?download=true)

More models of smaller sizes are available via [their huggingface download page](https://huggingface.co/KBLab/kb-whisper-large).  
Find the size you want, download the _ggml-model.bin_ file, rename the file, and palce it in shiorikotrans's model folder.

</details>
</details>

Enjoy exploring these models and enhancing your ShiorikoTrans! 🌐✨

### Want More?

Find additional models here:

[👉 See More Models](https://huggingface.co/ggerganov/whisper.cpp/tree/main)

---

### Prepare your own models

<details>
<summary>Convert transformers to GGML</summary>

```console
# Setup environment
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc
uv venv
uv pip install torch transformers huggingface_hub
huggingface-cli login --token "token" # https://huggingface.co/settings/tokens

# Convert and upload
git clone https://github.com/openai/whisper
git clone https://github.com/ggml-org/whisper.cpp
git clone https://huggingface.co/ivrit-ai/whisper-large-v3-turbo
uv run ./whisper.cpp/models/convert-h5-to-ggml.py ./whisper-large-v3-turbo/ ./whisper .
uv run huggingface-cli upload --repo-type model whisper-large-v3-turbo-ivrit ./ggml-model.bin ./ggml-model.bin

# Quantize
sudo apt install cmake build-essential -y
cd whisper.cpp
cmake -B build
cmake --build build --config Release
cd ..
./whisper.cpp/build/bin/quantize ggml-model.bin ./ggml-model.int8.bin q8_0 # fp32/fp16/q8_0/q5_0
```

</details>
