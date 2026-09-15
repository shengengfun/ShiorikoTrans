<p align="center">
  <a target="_blank" href="https://github.com/shengengfun/ShiorikoTrans">
    <img
        width="128px"
        alt="ShiorikoTrans logo"
        src="./design/logo.png"
    />
  </a>
</p>

<h1 align="center">ShiorikoTrans</h1>

<p align="center">
  <strong>⌨️ 在你的设备上转写音频与视频</strong>
  <br/>
  <sub>完全本地运行 · 断网可用 · 数据永不离开你的电脑</sub>
</p>

<p align="center">
  <a target="_blank" href="https://github.com/shengengfun/ShiorikoTrans/releases/latest">
    ⬇️ 下载 ShiorikoTrans
  </a>
  &nbsp; | &nbsp;
  <a target="_blank" href="https://github.com/shengengfun/ShiorikoTrans/stargazers">给它一颗星 ⭐</a>
  &nbsp; | &nbsp;
  <a target="_blank" href="https://github.com/shengengfun/ShiorikoTrans/issues/new/choose">反馈问题 🐛</a>
</p>

<p align="center">
  <a target="_blank" href="https://github.com/shengengfun/ShiorikoTrans/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/shengengfun/ShiorikoTrans?label=release&color=2ea44f" /></a>
  <a target="_blank" href="https://github.com/shengengfun/ShiorikoTrans/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/shengengfun/ShiorikoTrans/total?label=downloads" /></a>
  <img alt="Platforms" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue" />
  <a target="_blank" href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-informational" /></a>
  <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2-24C8DB" />
</p>

<hr />

# 这是什么

**ShiorikoTrans** 是一款基于 [Tauri 2](https://tauri.app/)（Rust + React）的桌面转写工具：把音频、视频、网页链接或系统声音丢进去，片刻后就能拿到带时间轴的字幕。

所有识别都在你自己的电脑上完成 —— 不需要上传文件、不需要账号、不需要联网。模型权重只需下载一次，之后可以完全断网使用。

# 新版本亮点 · v1.0.2

- 🎨 **全新品牌图标**：应用图标、窗口 / 任务栏图标、macOS `.icns`、Windows `.ico` 与各尺寸 PNG 全部改为由 `logo.jpg` 生成
- 🪟 **安装包图标同步替换**：`bundle.windows.nsis.installerIcon` 显式指向新的 `icons/icon.ico`，NSIS 安装向导与卸载程序均使用新图标
- 📝 重写 README（就是你现在看到的这份）

# 下载与安装 ⬇️

前往 [**Releases**](https://github.com/shengengfun/ShiorikoTrans/releases/latest) 下载对应平台的安装包。

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| Windows | `ShiorikoTrans_1.0.2_x64-setup.exe` | **推荐**。NSIS 安装包，自带 `sona` 引擎，自动创建开始菜单与桌面快捷方式 |
| macOS | `ShiorikoTrans_1.0.2_<arch>.dmg` | 打开后把 App 拖进 Applications |
| Linux | `ShiorikoTrans_1.0.2_amd64.deb` / `ShiorikoTrans-1.0.2-1.x86_64.rpm` | Debian / Ubuntu、Fedora / RHEL |

> 想要免安装的绿色版？按 [docs/building.md](docs/building.md) 自行构建即可得到 `shiorikotrans.exe` 及同目录的 `sona` sidecar。
>
> 首次转写前请在 **设置 → 模型** 里下载一个识别模型（推荐 **Large v3 Turbo**），没有模型时启动向导会提示下载。

Windows 安装包使用 [SignPath Foundation](https://signpath.org/) 提供的免费开源代码签名服务，并由
[SignPath.io](https://signpath.io/) 执行签名。签名接入与可复现构建流程见
[docs/code-signing/signpath.md](docs/code-signing/signpath.md)。

# 功能特性 🌟

## 转写

- 🌍 支持近 100 种语言，可自动检测语种
- 🎙️ 四种输入来源：麦克风录音、系统声音、本地音视频文件、网络链接
- 📂 批量队列：一次丢进多个文件，排队自动跑完
- 🔗 从 YouTube、Bilibili 等 `yt-dlp` 支持的站点直接拉流转写
- 👀 实时预览：边转写边出字幕
- ⏰ 句级 / 词级时间戳（词级适合 JSON 二次处理）
- 🎬 **稳定时间戳模式**：VAD 支持，字幕 / 影片级对轴更稳（速度更慢）
- 👥 说话人分离（speaker diarization）
- 📹 面向短视频的字幕行长预设

## 导出

- 📝 `SRT`、`VTT`、`TXT`、`HTML`、`PDF`、`JSON`、`DOCX`
- 💬 双语字幕导出（原文 + 译文双行，可导出双语 SRT）
- �️ 说话人分离（diarization）可选，`[发言者 n]` 标签可单独开关（默认关闭，未开启分离时不再每行都加前缀）
- �🖨️ 直接把转写结果发送到打印机

## 翻译与摘要

- 🌐 字幕 / 文本翻译：**默认走本地 OpenAI 兼容服务**（llama.cpp `llama-server` / LM Studio / Jan / vLLM），也支持 **Claude** 与 **Ollama** —— 默认完全离线，不需要 Ollama
- 🧠 设置里内置**本地翻译模型目录**（Hunyuan-MT-7B 翻译专用、Qwen3 1.7B/4B、Qwen2.5 3B、Gemma 3 4B），可一键下载并复制启动命令
- ✂️ 长文本按行分块翻译，保留行数（字幕时间轴不错位），并实时显示进度
- 🔁 翻译页可直接切换已下载的本地模型，翻译配置与摘要 LLM **互不影响**
- 🔔 转录 / 翻译完成提示音（可关闭）
- 📚 术语表（glossary），保证专有名词译法统一
- ✨ 多语言摘要
- 🔀 转录结果可一键「发送到翻译页」

## 界面与体验

- 🪟 无边框窗口 + 自绘标题栏（拖拽区、最小化 / 最大化 / 关闭、最近文件）
- 📊 底部状态栏实时显示 CPU / 内存占用与任务进度
- 🎨 主题色预设 + 自定义色值 + 自定义背景图，亮色 / 暗色主题
- 🕘 最近打开的文件、转录历史、任务队列
- 🌏 界面支持 19 种语言（含简体中文、繁体中文）

## 进阶能力

- 🖥️ CLI：`shiorikotrans --help`
- ⚡ 本地 HTTP API，附 Swagger 文档，方便脚本与自动化接入
- 🔧 设置内自由添加自定义模型、调整模型参数
- 📥 自定义模型分发：`shiorikotrans://download/?url=<模型地址>`
- 🎮 GPU 加速：Nvidia / AMD / Intel（`Vulkan` / `CoreML` / `DirectML`），也支持纯 CPU

# 支持的平台 🖥️

| 平台 | 架构 | 状态 |
| --- | --- | --- |
| Windows 10 / 11 | x64 | ✅ 主要开发与发布平台 |
| macOS | Intel / Apple Silicon | ✅ |
| Linux | x64 | ✅ |

Windows 提供两种安装包，功能完全相同，只差 ffmpeg 是否内置：

| 安装包 | ffmpeg | 适用场景 |
| --- | --- | --- |
| `ShiorikoTrans_<ver>_x64-setup.exe` | 内置 | 装完即用，可离线处理音视频 |
| `ShiorikoTrans_<ver>_x64-setup-slim.exe` | 按需下载（约 83 MB） | 不在意首次联网，想要更小的安装包 |

精简版在首次转录音频/视频时会提示下载 ffmpeg，也可以随时到「设置 → 转录 → 运行时依赖」手动下载；自己安装的 ffmpeg（PATH 里）同样会被识别。

# 模型与引擎 🤖

- 识别模型（**设置 → 模型 → 模型目录** 一键下载，无需手动找链接）：
  - **Parakeet TDT 0.6B v3**（0.6B，25 种欧洲语言，TDT 解码，速度快，推荐）
  - **Nemotron 3.5 ASR Streaming 0.6B**（0.6B，32 种语言，流式）
  - **SenseVoice Small**（int8，中文 / 英文 / 粤语 / 日语 / 韩语，速度极快）
  - **Whisper** 系列（Tiny → Large v3 / Large v3 Turbo，99 种语言，兼容性最好）
- 推理引擎：[`sona`](https://github.com/thewh1teagle/sona) —— Rust + `whisper.cpp` / ggml 的本地推理进程，由 App 以 sidecar 方式拉起，通过本地 HTTP 通信；Parakeet / Nemotron 走 GGUF（自带 VAD 分段，VAD 辅助模型会自动下载），SenseVoice 走 ONNX（CTC 导出 + `tokens.txt`）
- 模型目录按用途分文件夹：`models/transcribe`、`models/translate`、`models/vad`、`models/diarize`
- 可选模型清单与下载地址见 [docs/models.md](docs/models.md)

# 文档 📄

| 文档 | 内容 |
| --- | --- |
| [docs/building.md](docs/building.md) | 本地开发与构建 |
| [docs/architecture.md](docs/architecture.md) | 架构说明（Tauri 前端 / Rust 后端 / sona 引擎） |
| [docs/models.md](docs/models.md) | 模型清单与手工安装 |
| [docs/install.md](docs/install.md) | 安装说明 |
| [docs/debug.md](docs/debug.md) | 出问题时如何抓日志 |
| [docs/translations.md](docs/translations.md) | 界面翻译指南 |

# 项目结构 📁

```text
desktop/                  Tauri 桌面应用（React 前端 + Rust 后端）
desktop/src-tauri/icons/  全套应用图标（由根目录 logo.jpg 生成）
desktop/public/           前端静态资源（标题栏 logo 等）
design/                   设计资源（README 用的 logo、DMG 背景等）
sona/                     sona 推理引擎（本地检出）
website/                  项目主页（仍为上游 Audire 品牌，未参与改名）
docs/                     构建、架构、模型、翻译等文档
i18n/                     界面翻译（inlang）
plans/                    开发过程记录与可复现的验证脚本
scripts/                  构建、发布与统计辅助脚本
logo.jpg                  品牌主图 —— 所有图标的唯一来源
```

# 开发 🤝

环境要求：[`pnpm`](https://pnpm.io/)、[`cargo`](https://www.rust-lang.org/tools/install)，以及可选的 [`uv`](https://docs.astral.sh/uv/)。

```bash
# 1. 准备 sidecar（sona / ffmpeg）与平台依赖
uv run scripts/pre_build.py

# 2. 安装前端依赖
cd desktop
pnpm install

# 3. 开发模式
pnpm exec tauri dev

# 4. 生产构建（Windows 产出 exe + NSIS 安装包）
pnpm exec tauri build --bundles nsis
```

构建产物：

- 可执行文件：`target/release/shiorikotrans.exe`
- 安装包：`target/release/bundle/nsis/ShiorikoTrans_<版本>_x64-setup.exe`

改完 `logo.jpg` 后重新生成整套图标：

```bash
cd desktop
.\node_modules\.bin\tauri.cmd icon ..\logo.jpg   # 标准图标集：PNG / ICO / ICNS / Android / iOS
python ..\plans\app-icons\app-icons_001.py       # 补齐 legacy PNG 与 design 资源
```

更多细节见 [docs/building.md](docs/building.md)。

# 参与翻译 🌐

界面翻译位于 `i18n/translations/`，欢迎新增语言或修正现有译文 —— 见[翻译指南](docs/translations.md)。

# 隐私政策 🔒

转写默认 100% 在本地完成，音频、视频与转写文本都不会离开你的设备。
只有当你自己配置了云端 LLM（Claude / OpenAI 兼容接口）并使用翻译或摘要功能时，相应文本才会发送给该服务商。
详见[隐私政策](website/public/privacy_policy.md)。

# 反馈问题 🐛

请先阅读 [docs/debug.md](docs/debug.md)，然后通过 [Issue](https://github.com/shengengfun/ShiorikoTrans/issues/new/choose) 反馈；附上日志会快很多。

# 致谢

- [tauri.app](https://tauri.app/) —— 让桌面应用开发变得轻快的框架
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) —— 出色的本地语音识别推理实现
- [OpenAI Whisper](https://openai.com/research/whisper) —— Whisper 模型本身
- [sona](https://github.com/thewh1teagle/sona) —— 本项目使用的本地推理引擎
- [thewh1teagle](https://github.com/thewh1teagle) —— 本项目二次开发所基于的 **Audire** 上游作者
- [DeepSeek](https://www.deepseek.com/) —— 本项目开发协作使用的 AI 编程助手（DeepSeek V4 Flash）

以及所有被本项目使用的开源库与框架。

# 许可 📄

[MIT](LICENSE) © 2024 thewh1teagle
