# 内置翻译引擎（NLLB-200 ONNX）

2026-09-25。目标：把「翻译」从"用户自己起一个 OpenAI 兼容服务"改成开箱可用。

## 结论

`desktop/src-tauri/src/nmt.rs` 在应用进程内跑 **NLLB-200-distilled-600M**（int8 ONNX），
用已经为 SenseVoice 打包好的 `onnxruntime.dll`（`ort` crate，`load-dynamic` + `api-24`）。
首次使用下载一次模型（约 1.36 GB），之后完全离线、无需 API Key、无需任何配置。

实测（CPU，批量 8 行）：

| 原文 | 译文 |
| --- | --- |
| Hello world, this is a test of the translation engine. | 你好，世界，这是一个测试翻译引擎 |
| こんにちは、世界。 | 你好，世界。 |
| Good morning, everyone. | 你好，大家早上好 |

3 行约 11 秒（含首次加载会话）。

## 模型文件（`models/translate/nllb-200-distilled-600M/`）

| 本地文件 | 仓库路径 | 大小 |
| --- | --- | --- |
| `config.json` | `config.json` | 873 B |
| `tokenizer.json` | `tokenizer.json` | 17 MB |
| `encoder_model_quantized.onnx` | `onnx/encoder_model_quantized.onnx` | 419 MB |
| `decoder_model_quantized.onnx` | `onnx/decoder_model_quantized.onnx` | 470 MB |
| `decoder_with_past_model_quantized.onnx` | `onnx/decoder_with_past_model_quantized.onnx` | 445 MB |

下载走 `cmd::download::download_with_progress`（`download_progress` 事件），
huggingface.co 失败时回落 `hf-mirror.com`。

## 关键设计

1. **不用 `decoder_model_merged_quantized.onnx`**。它的 `If` 节点用 `use_cache_branch`
   切换分支，而极性反直觉（`false` 才是"首算并拼接"分支，且要求零长度占位张量）；
   占位长度给错 → 模型永远重复一个空白 token（`decelerate` 到 MAX_NEW_TOKENS）。
   改用**非合并**的两个解码器图，各自契约明确、无分支：
   - first：`input_ids` / `encoder_attention_mask` / `encoder_hidden_states` →
     `logits` + `present.*`
   - with-past：`input_ids`(长度 1) / `encoder_attention_mask` / `past_key_values.*` →
     `logits` + `present.*`（**只回 self-attention 的 24 个张量，cross-attention 的 24 个
     必须沿用首次的**）
2. **分词**：导出文件的 post_processor 硬编码 `eng_Latn` 前缀，所以
   `encode(text, add_special_tokens=false)` 后自己拼 `[src_lang] + tokens + [</s>]`；
   语言 token 取 `token_to_id("zho_Hans")`（FLORES-200 码）。
3. **解码**：提示词 `[decoder_start(2), tgt_lang]` 一次喂入并取最后一位 logits
   （等价 HF 的 `forced_bos_token_id`）；greedy；`</s>` 即结束；空行原样保留，
   整行翻译为空时回退原文，保证字幕行数不变。
4. **前端**：`lib/nmt.ts`（invoke 封装）+ `lib/translate.ts` 按
   `config.platform === 'builtin'` 分流；默认引擎就是它（`enabled: true`）；
   旧的 llama.cpp 本地端点配置由 `lib/migrations/migrate-legacy-translation.ts` 迁移；
   设置页/翻译页都是一键下载（`useModelDownload.withProgress`），翻译进度用 `nmt_progress`。

## 验证

```powershell
$env:NMT_MODEL_DIR="$env:LOCALAPPDATA\ShiorikoTransNmtTest\nllb-200-distilled-600M"
cargo test --manifest-path desktop/src-tauri/Cargo.toml nmt:: -- --ignored --nocapture
```

- `nmt::tests::translates_a_sentence`：真实端到端，断言译文非空且不等于原文。
- `nmt::tests::dump_model_io`：打印两个图的输入/输出契约和分词结果（换导出时用）。
- 测试进程要能加载 `onnxruntime.dll`：把它复制到 **测试 exe 同目录**
  （`target/debug/deps/`），否则 Windows 会去 `system32` 找到一个旧版本并报 `MissingApi`。

## 脚本

- `fetch-model.ps1 -Only <repo 内路径…>`：从 hf-mirror 拉模型文件（可按需单拉）。
- `inspect-tokenizer.py`：看 post_processor / added_tokens / 语言 token。
- `dump-merged-decoder.py`：手写 protobuf 解析，列出 merged 图两个分支的节点与输入
  （没有 onnx 包时用来确认 `If` 语义）。
- `add-i18n-keys.py`：批量追加 i18n 键（制表符 + CRLF，避免整文件 diff）。
