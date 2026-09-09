# ShiorikoTrans (Vibe) 全面改造任务清单

## 概述

本计划基于对 `D:\Project\ShiorikoTrans 1.01` 源码的全面调研，针对 4 个核心问题进行改造。每个问题拆分为具体的代码修改任务，按依赖关系排序。

---

## 任务组 A：修复中止任务不能真正停止的问题

### 根因分析
- 前端点击中止 → 发射 `abort_transcribe` 事件
- 后端 `transcribe.rs` 收到事件 → 设置 `AtomicBool` 标志
- 检查在 `stream.next().await` 之后，每个事件循环中检查一次
- **问题**：如果 sona 正在处理一大段音频（HTTP 流阻塞），`stream.next()` 可能长时间不返回，导致中止信号无法生效
- **更严重的问题**：没有强制杀掉 sona 进程的机制，也不超时

### A1. 添加强制超时机制
**文件**: `desktop/src-tauri/src/cmd/transcribe.rs`

```rust
// 在 transcribe 函数开头添加超时
let timeout_duration = std::time::Duration::from_secs(300); // 5分钟超时
let timeout = tokio::time::sleep(timeout_duration);
tokio::pin!(timeout);

// 在主循环中使用 select! 同时等待 stream 和 timeout
```

### A2. 监听中止时强制杀掉 sona 进程
**文件**: `desktop/src-tauri/src/cmd/transcribe.rs`

在 `abort_transcribe` 事件的回调中，不仅设置 AtomicBool，还要：
1. 获取 sona 进程句柄（从 `SonaState`）
2. 强制杀掉 sona 子进程（`process.kill()`）
3. 重置 state

### A3. 添加 HTTP 请求级超时
**文件**: `desktop/src-tauri/src/sona/mod.rs` (transcribe_stream 方法)

给 `client.post(&url).multipart(form).send()` 调用添加 `timeout()` 或使用 `tokio::time::timeout` 包裹。

### A4. 前端中止按钮增加强制中止模式
**文件**: `desktop/src/pages/home/hooks/use-transcription.ts`

添加二次确认或强制中止逻辑：点击中止后 3 秒未完成则显示"强制关闭"按钮。

### A5. 批次处理中止优化
**文件**: `desktop/src/pages/batch/view-model.tsx`

当前批次处理的中止检查在文件循环中 (`for (const file of files)`)，需要：
1. 在 `emit('abort_transcribe')` 之后立即停止当前循环
2. 杀掉当前运行的 sona 进程
3. 跳过剩余文件

---

## 任务组 B：修复 Whisper Large v3 F16 GGUF 不能被 sona 正确调用

### 根因分析
- F16 GGUF 文件约 3GB，是 float16 量化
- 标准 Whisper Large v3 有 154M 参数，F16 量化约 3GB
- sona 的 `/v1/models/load` 通过 HTTP 接收 `{"path": "...", "gpu_device": null}`
- **可能原因**：
  1. F16 模型太大，GPU 显存不足（12GB 应够，但可能是连续显存碎片）
  2. 模型读取路径问题（文件扩展名检测）
  3. sona 内部的 GGUF 解析器对特定架构的支持问题

### B1. 修复模型文件扩展名检测
**文件**: `desktop/src/lib/model.ts`

当前 `MODEL_EXTENSIONS = ['bin', 'gguf']` 只识别 `.bin` 和 `.gguf`。F16 GGUF 文件后缀为 `.gguf`，应该已经被识别。但 `getModelExtension` 使用正则匹配，需要确认大写后缀也被匹配。

验证：`isGgufModel('whisper-large-v3-F16.gguf')` 应返回 `true`

### B2. 增强模型加载错误诊断
**文件**: `desktop/src-tauri/src/cmd/sona_cmd.rs`

在 `load_model` 函数中，当模型加载失败时，记录详细的错误信息：
- sona 返回的错误码和消息
- 模型文件大小
- GPU 设备信息
- 显存使用情况

### B3. 添加模型文件校验
**文件**: `desktop/src-tauri/src/cmd/sona_cmd.rs`

在调用 sona 加载模型之前，先校验文件：
- 检查文件是否存在
- 检查文件大小（F16 ~3GB）
- 检查文件头部 GGUF magic bytes (`GGUF` at offset 0)

### B4. 尝试自动降级量化
**文件**: `desktop/src-tauri/src/cmd/sona_cmd.rs`

如果 F16 模型加载失败，自动尝试降级：
1. 先用 F16 尝试
2. 如果失败，建议用户使用 Q8_0 或 Q4_K_M 量化版本
3. 记录错误到分析系统

### B5. 添加 GGUF 架构检测
**文件**: `desktop/src-tauri/src/sona/process.rs`

在 `model_metadata()` 调用失败时，手动读取 GGUF 文件头部获取架构信息，以便更精确的错误定位。

---

## 任务组 C：优化设置界面，增加更多设置选项

### 根因分析
当前设置界面较简洁，缺少一些重要选项：
- GPU 设备选择在 API 部分，不够显眼
- 没有模型下载 URL 自定义输入
- 没有线程数配置
- 没有强制 GPU/CPU 切换
- 没有模型量化偏好设置

### C1. 重构设置侧边栏布局
**文件**: `desktop/src/pages/settings/page.tsx`

添加新的设置组和分区：

```typescript
const groups: SettingsGroup[] = [
    // 现有...
    {
        label: '硬件加速',
        sections: [
            { id: 'gpu', label: 'GPU 设置', icon: <Cpu /> },
        ],
    },
    // ...
]
```

### C2. 新建 GPU 设置面板
**新文件**: `desktop/src/pages/settings/sections/gpu.tsx`

功能：
- GPU 设备选择下拉框（显示所有检测到的 GPU）
- GPU 状态指示灯（绿色=GPU正常 / 红色=已回退到CPU）
- 强制 CPU 模式开关
- Vulkan 诊断信息显示
- "检测 GPU" 按钮（运行 `sona devices`）

### C3. 在偏好设置中添加新字段
**文件**: `desktop/src/providers/preference.tsx`

添加：
- `forceCpu: boolean` — 强制使用 CPU
- `vulkanDevice: number | null` — 明确的 Vulkan 设备索引
- `enableDiagnostics: boolean` — 启用诊断日志
- `modelQuantization: string` — 模型量化偏好

### C4. 在 Tuning 面板添加高级选项
**文件**: `desktop/src/pages/settings/sections/tuning.tsx`

添加：
- 线程数滑块（n_threads）
- 采样策略选择（greedy / beam search）
- 温度控制滑块
- 最大文本上下文长度
- Beam size / Best of 配置

### C5. 添加模型下载管理
**文件**: `desktop/src/pages/settings/sections/models.tsx`

添加：
- 模型下载 URL 自定义输入框
- 模型列表显示量化类型
- 模型删除按钮
- 模型下载进度显示

### C6. 日志和诊断面板
**文件**: `desktop/src/pages/settings/sections/advanced.tsx`

添加：
- 实时日志查看器
- 系统诊断报告生成按钮
- Vulkan 版本检测结果
- GPU 驱动版本显示

---

## 任务组 D：提高 GPU 性能利用率

### 根因分析
- sona 启动时没有 GPU 配置
- GPU 设备只在模型加载时通过 HTTP 指定
- 没有 GPU 可用性预检
- GPU 回退完全静默
- 没有 GPU 后端选择（Vulkan vs CUDA）

### D1. 在 sona 启动时指定 GPU 设备
**文件**: `desktop/src-tauri/src/sona/process.rs`

修改 `spawn()` 方法，添加 `gpu_device: Option<i32>` 参数：

```rust
pub fn spawn(binary_path: &Path, ffmpeg_path: Option<&Path>, gpu_device: Option<i32>) -> Result<Self> {
    let mut cmd = Command::new(binary_path);
    let mut args = vec!["serve", "--port", "0"];
    if let Some(device) = gpu_device {
        args.push("--gpu-device");
        args.push(&device.to_string());
    }
    cmd.args(&args);
    // ...
}
```

### D2. 更新所有 spawn 调用点
**文件**: `desktop/src-tauri/src/cmd/sona_cmd.rs`

在 `spawn_sona` 闭包和其他调用 `SonaProcess::spawn` 的地方传入 `gpu_device`。

### D3. 启动时预检 Vulkan 可用性
**文件**: `desktop/src-tauri/src/cmd/sona_cmd.rs`

在 `load_model` 中增加启动预检：
1. 调用 `sona devices` 检查 GPU 列表
2. 如果没检测到 GPU，直接跳过 GPU 尝试
3. 缓存检测结果

### D4. 添加 GPU 预热
**文件**: `desktop/src-tauri/src/cmd/sona_cmd.rs`

在加载模型后，发送一个短音频进行 GPU 预热，确保 GPU 后端真正初始化成功。

### D5. 将 GPU fallback 信息传递给前端
**文件**: `desktop/src-tauri/src/cmd/sona_cmd.rs` + `desktop/src/providers/hotkey.tsx`

已修改（见之前的工作）：
- 后端发射 `gpu_fallback` 事件 ✅
- 热键模式检查 fallback ✅

还需要：
- 在设置页面显示 GPU 状态（见 C2）
- 在主页显示 GPU 状态指示器

### D6. 添加环境变量配置
**文件**: `desktop/src-tauri/src/sona/process.rs`

在 Windows 上，添加 Vulkan 环境变量设置：
```rust
// Windows Vulkan 优化
#[cfg(target_os = "windows")]
{
    // 设置 Vulkan 设备选择
    if let Some(device) = gpu_device {
        cmd.env("VK_DEVICE_INDEX", device.to_string());
    }
    // 禁用 Vulkan 验证层（生产环境）
    cmd.env("VK_LOADER_LAYERS_DISABLE", "VK_LAYER_KHRONOS_validation");
}
```

---

## 文件修改总清单

| # | 文件路径 | 修改类型 | 涉及任务 |
|---|---------|---------|---------|
| 1 | `desktop/src-tauri/src/cmd/transcribe.rs` | 修改 | A1, A2, A3 |
| 2 | `desktop/src-tauri/src/sona/mod.rs` | 修改 | A3 |
| 3 | `desktop/src-tauri/src/sona/process.rs` | 修改 | D1, D6 |
| 4 | `desktop/src-tauri/src/cmd/sona_cmd.rs` | 修改 | B2, B3, B4, D2, D3, D4, D5 |
| 5 | `desktop/src/lib/model.ts` | 修改 | B1 |
| 6 | `desktop/src/providers/preference.tsx` | 修改 | C3 |
| 7 | `desktop/src/pages/settings/page.tsx` | 修改 | C1 |
| 8 | `desktop/src/pages/settings/sections/gpu.tsx` | **新建** | C2 |
| 9 | `desktop/src/pages/settings/sections/tuning.tsx` | 修改 | C4 |
| 10 | `desktop/src/pages/settings/sections/models.tsx` | 修改 | C5 |
| 11 | `desktop/src/pages/settings/sections/advanced.tsx` | 修改 | C6 |
| 12 | `desktop/src/pages/settings/view-model.ts` | 修改 | C2, C5, C6 |
| 13 | `desktop/src/pages/home/hooks/use-transcription.ts` | 修改 | A4 |
| 14 | `desktop/src/pages/batch/view-model.tsx` | 修改 | A5 |
| 15 | `desktop/src/pages/setup/view-model.ts` | 修改 | B2 |

## 编译与验证

```bash
# 1. 下载 sona 二进制
cd scripts
uv run pre_build.py

# 2. 安装前端依赖
cd ../desktop
pnpm install

# 3. 构建前端
pnpm build

# 4. 编译 Rust 后端 (debug 模式验证)
cd src-tauri
cargo build

# 5. 生产构建
cd ..
pnpm tauri build
```

## 测试清单

- [ ] 中止任务能在 3 秒内真正停止
- [ ] 强制中止能杀掉 sona 进程
- [ ] Whisper Large v3 F16 GGUF 能正常加载
- [ ] 加载失败时显示详细错误信息
- [ ] 新的 GPU 设置面板可用
- [ ] GPU 状态指示灯显示正确
- [ ] 选择不同 GPU 设备生效
- [ ] 强制 CPU 模式生效
- [ ] 所有新设置项持久化到 localStorage
- [ ] 批次处理中止生效
- [ ] 模型下载 URL 自定义生效
