# 本地推理引擎 + 总结页重做

## 目标

1. **翻译/总结开箱可用**：应用自己下载并运行 llama.cpp（`llama-server`），用户不再需要手动
   安装服务、复制命令；「翻译功能不能用 / `error sending request for url (http://127.0.0.1:8080/...)`」
   从根上解决。
2. **总结页可用**：转录完成后可以把文本送到总结页，用本地小模型生成总结。
3. **提示词可调**：总结设置提供预设、恢复默认、分块字数、温度等。

## 改动

### 后端（Rust）

- `desktop/src-tauri/src/llama.rs`（新增）
  - `get_llama_status` / `install_llama_server` / `start_llama_server` / `stop_llama_server`
  - 资源解析：`api.github.com/repos/ggml-org/llama.cpp/releases/latest`，按平台选 CPU 包
    （Windows 有 AVX2 时优先 `win-avx2-x64`，否则 `win-cpu-x64`；macOS/Linux 同理）。
  - 解压使用系统 `tar`（Windows 10+ bsdtar 支持 zip），回退 `unzip`，**不引入 `zip` crate**。
  - 启动：`llama-server -m <model> -c <ctx> -t <threads> --host 127.0.0.1 --port <p>`，
    Windows 用 `CREATE_NO_WINDOW`；优先使用配置里的端口（若被占用则回退空闲端口），
    轮询 `/v1/models` 直到就绪。
  - 子进程存放在 Tauri 托管状态里，退出时随 `kill_sona_process_tree()` 一起结束。
- `cmd/download.rs`：新增 `download_with_progress()`，复用已有流式下载 + `download_progress` 事件。
- `main.rs`：注册命令、`manage(LlamaServerState)`、退出时 `kill_sidecar_processes()`。
- `Cargo.toml`：tokio 增加 `time` feature（等待就绪轮询）。

### 前端

- `lib/llama-server.ts`：运行时状态/安装/启动/停止 + 端口解析。
- `lib/local-engine.ts`：共享层——`probeEndpoint`、`ensureEngineRunning`、`ensureLocalModelServer`、
  `resolveLocalModel`、`listLocalModels`。
- `lib/summarize.ts`：总结逻辑
  - `summaryPresets()`：默认摘要 / 精简摘要 / 要点清单 / 会议纪要 / 学习笔记（中英双语模板）。
  - `fillSummaryPrompt()`：模板没有 `%s` 时**追加**文本（旧实现会静默丢掉转录内容）。
  - `summarizeText()`：长文本按行分块（map）→ 合并（reduce），小模型也能总结长转录；
    本地端点先自动启动引擎。
- `providers/preference.tsx`：新增 `summarizeChunkChars`、`sendToSummary`；
  翻译/总结默认改为「内置本地引擎 + 小模型（Qwen3-1.7B-Q4_K_M，约 1 GB）」。
- 设置页
  - `components/local-engine-panel.tsx`、`components/local-model-list.tsx`：翻译与总结共用的
    引擎面板（状态/下载运行时/启动/停止）与模型列表（下载、选择、从磁盘挑 GGUF）。
  - `sections/translation.tsx`：改用共享组件；「测试连接」先自动启动本地引擎。
  - `sections/summarize.tsx`：引擎分组内嵌本地引擎面板 + 「使用内置本地模型」；
    新增「本地模型」分组；提示词分组新增预设、恢复默认、分块字数、温度。
  - `sections/general.tsx`：「完成时」新增「转录完成后打开翻译页/总结页」开关。
- 转录页
  - 新增「总结」按钮（有转录文本即可用）；设置里可让转录完成后自动切到总结页。
  - 总结页签在没有总结时显示空状态 + 「总结 / 总结设置」入口（旧版本没有总结就看不到页签）。

## 验证

- `pnpm exec tsc --noEmit` → 0 错误
- `pnpm test` → 3 个文件 10 个用例通过（新增 `lib/summarize.test.ts`：模板填充、分块不丢内容、超大行硬切）
- `pnpm exec vite build` → 成功
- `cd desktop/src-tauri && cargo check` → 0 错误 0 警告
- 实机：`pnpm build:windows:slim`（先）→ `pnpm build:windows`
