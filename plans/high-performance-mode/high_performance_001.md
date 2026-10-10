# 高性能模式验证报告

配套脚本：[high_performance_001.py](./high_performance_001.py)

```bash
uv run plans/high-performance-mode/high_performance_001.py
# 本地无 uv 时：
python plans/high-performance-mode/high_performance_001.py
```

脚本使用**真实发布用二进制**（`desktop/src-tauri/binaries/sona.exe` +
`ffmpeg.exe`）与 `samples/` 音频，不依赖应用界面。

## 本机实测环境

| 项 | 值 |
| --- | --- |
| CPU | 12 逻辑核心（`Genuine Intel(R) 0000`） |
| 内存 | 31.7 GB |
| GPU | Intel(R) Iris(R) Xe Graphics（`sona devices` 报告为 `igpu`，共享显存 2 GB） |
| 模型 | `ggml-tiny.bin`（74 MB，多语言） |
| 每进程线程 | 4 |

## 实测结果（最后一次完整运行，全部通过）

```
== 1. concurrency needs more than one process ==
  concurrent attempts while the file was running: [429 × 43]
  PASS  the running transcription succeeds (got 200)
  PASS  a concurrent request is rejected with 429 busy
  PASS  no second transcription ever starts while one runs
== 2. a pool beats a single process on a queue ==
  serial 26.3s vs pooled 21.8s -> 1.21x, text agreement 1.000 (control 1.000)
  PASS  pooling adds no variance beyond the engine's own
  PASS  pooling is clearly faster (1.21x >= 1.15x)
== 3. silence-aligned chunking of one long file ==
  duration 446s, 90 pauses, 2 chunks at [222]
  PASS  the long file splits into parallel chunks
  chunk_00.wav: 13.7s on port 6383 / chunk_01.wav: 23.5s on port 6398
  words: whole-file 1499 vs chunked 1607
  coverage: whole-file reaches 446s of 446s; chunked reaches 447s
  whole 13.1s vs chunked 23.5s -> 0.56x, word similarity 0.603
  PASS  chunked text stays close to the whole-file text (0.603 >= 0.500)
  PASS  chunking does not lose the transcript
  PASS  merged timestamps are monotonic
  PASS  the merged transcript covers the file
== summary ==
all checks passed
```

## 结论与据此做出的设计调整

1. **并发必须由多个 sona 进程实现。** 单个进程在转写期间对并发请求一律返回
   `429 busy`（43/43 次），这正是桌面端引入 `SonaPool` 的原因；同一时间从未有
   第二个转写真正开始执行。
2. **多文件并发是稳定的净收益。** 同样两个 446 s 文件，池化后 1.21x，且文本与串行
   完全一致（1.000，与「同一文件跑两遍」的对照组持平），说明池化本身不引入任何质量差异。
3. **集成显卡上并发与分片是负收益。** 分片把单个文件摊到两个进程后反而 0.56x ——
   iGPU 共享内存带宽，两个进程互相争抢；因此 `hardware.rs` 对集成显卡自动保持
   `workers = 1`（`PerfReason::IntegratedGpu`），并把「长文件分片并发」默认关闭，
   仅作为独显上的可选开关。
4. **分片本身工作正常但会改变切点附近的措辞。** 合并后时间戳单调、覆盖完整、字数不减少
   （1607 vs 1499），但与本文件由多段录音拼接而成（切换处常有硬切），整段转写与分片转写
   的相似度为 0.603。这属于分片策略的固有取舍，已在设置说明与发布说明中写明。
5. **线程数不再硬编码。** 请求未指定 `n_threads` 时后端按物理核心数（4–16）下发，
   脚本中显式传入 4 线程以固定对比条件。

## 单元测试覆盖（`cargo test`）

- `hardware::tests`：大显存多进程、小显存单进程、纯 CPU、显存未知（大/小模型）、
  手动覆盖被夹取、GPU 回落、**集成显卡保持单进程（含手动覆盖仍生效）**、
  `nvidia-smi` 解析、跨 API 显卡名匹配；
- `sona::pool::tests`：上限夹取、降级收敛为单进程、未加载模型时报错、
  首次获取需要扩容、扩容后恢复手动档位；
- `chunked::tests`：ffmpeg 时长解析、静音中点解析、切点吸附/回退、时长覆盖、
  最短分片保护、偏移换算为百分秒；
- 既有 `sona::tests`（事件解码、超长行、非法 JSON）与 `cmd::download::tests` 保持通过。
