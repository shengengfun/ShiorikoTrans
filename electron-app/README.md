# ShiorikoTrans Electron - Desktop Voice Transcription App

基于 [shiorikotrans](https://github.com/shiorikotrans/shiorikotrans) 的 Electron 移植版本，后端使用 FunASR 替代 Whisper。

## 技术栈

- **前端**: React 19 + TypeScript + Tailwind CSS 4 + Radix UI
- **桌面壳**: Electron 33
- **语音识别后端**: FunASR (Paraformer-large) via Python FastAPI
- **构建工具**: Vite 7 + electron-builder

## 系统要求

- Node.js 18+
- Python 3.8+ (推荐 3.10-3.12)
- ffmpeg (可选，用于音频格式转换)

## 开发

```bash
# 1. 安装 Node.js 依赖
npm install

# 2. 安装 Python 后端依赖
pip install -r backend/requirements.txt

# 注意: 首次运行时会自动从 ModelScope 下载 FunASR 模型 (~1.5GB)
# 或手动预下载:
# python -c "from modelscope import snapshot_download; snapshot_download('iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-pytorch')"

# 3. 启动开发模式 (前端 + Electron + Python 后端)
# 终端 1: 启动 Python 后端
cd backend && python server.py

# 终端 2: 启动 Electron + Vite
npm run dev
```

## 构建

```bash
# 构建 Electron 桌面应用 (当前平台)
npm run build

# 输出在 dist-release/ 目录
```

## 打包 Python 后端

```bash
# 安装 PyInstaller
pip install pyinstaller

# 打包为单个可执行文件
pyinstaller --onefile --name funasr-server backend/server.py

# 将生成的 dist/funasr-server 放入 electron-app/backend/
```

## 项目结构

```
electron-app/
├── electron/           # Electron 主进程
│   ├── main.ts         # 主进程入口
│   └── preload.ts      # 预加载脚本
├── src/                # 前端代码 (来自 shiorikotrans desktop/src)
│   ├── @tauri-apps/    # Tauri API 兼容层 (适配到 Electron)
│   ├── components/     # UI 组件
│   ├── lib/            # 工具库 (含 electron-adapter.ts)
│   ├── pages/          # 页面
│   └── providers/      # React Context 提供者
├── backend/            # Python FunASR 后端
│   ├── server.py       # FastAPI 服务
│   └── requirements.txt
├── public/             # 静态资源 (含 locale 文件)
├── package.json
├── vite.config.ts
└── electron-builder.yml
```

## API 端点

FunASR 后端运行在 `http://127.0.0.1:8000`:

| 方法 | 路径          | 说明                           |
| ---- | ------------- | ------------------------------ |
| GET  | `/health`     | 健康检查                       |
| POST | `/transcribe` | 文件转录 (multipart/form-data) |
| WS   | `/stream`     | 实时流式识别                   |
| GET  | `/models`     | 模型列表                       |

### POST /transcribe 参数

- `file` (required): 音频文件
- `language` (query): 语言代码 (`zh`, `en`, `ja`, `ko`, 默认 `zh`)
- `word_timestamps` (query): 启用词级时间戳
- `max_sentence_len` (query): 最大句子长度

返回格式:

```json
{
	"segments": [{ "start": 0.0, "stop": 2.5, "text": "你好世界", "speaker": null }],
	"processing_time_sec": 1.2
}
```

## 许可证

MIT License - 保留原始 shiorikotrans 项目的 MIT 许可证。

原始项目: https://github.com/shiorikotrans/shiorikotrans
