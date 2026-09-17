# 设置界面大范围重做 + 最近文件修复

## 目标

1. 保留现有全部子设置，重做设置界面（参考 `D:\Project\RinaDown` 与 `D:\Project\LanzhuToolNX` 的 UI 语言）。
2. 修复「最近文件显示有文件但无法读取」。

## 参考项目的取舍

| 参考做法 | 本项目落地 |
| --- | --- |
| RinaDown：侧栏搜索框 + 结果列表（含所属分类），命中后跳转并高亮闪烁 | `components/sidebar.tsx` + 注册表驱动的搜索索引，命中后切分节/子标签、滚动定位并闪烁 2.2s |
| RinaDown：分类子 Tab（`_SettingsTabSpec`） | `registry.ts` 的 `SectionSpec.tabs`，通用/转录/模型/翻译/硬件/高级各自带子标签 |
| RinaDown：`_SettingsGroup` + `_SettingRow`（标题 + 描述 + 右侧控件，发丝线分隔） | `components/kit.tsx` 的 `SettingsGroup` / `SettingRow` / `SettingPanel`，密度约为旧版单卡单设置的两倍 |
| RinaDown：宽视口两列自适应 | `AdaptiveSections`（阈值 820px，弹窗宽度上限 1200px） |
| RinaDown：搜索定位闪烁（`_HighlightConsumer`） | `useHighlightTarget` + `flashId`（无需自定义 CSS，直接切类名） |
| LanzhuToolNX：紧凑 `GroupCard` + 定宽标签列 + `Badge` | `SettingsGroup` 标题栏 + `StateBadge`；「路径与存储」类行用 `ActionRow` |
| LanzhuToolNX：重置按钮两步确认 | 恢复默认设置、重置外观均改为「再点一次确认」 |

搜索索引不写第二份文案：每个设置项的 label/description/keywords 只在 `registry.ts` 声明一次，
行组件（`<SettingRow id="...">`）从注册表取文案并把自己登记的 DOM 节点交给搜索定位使用。

## 最近文件为什么读不出来

`addRecentFile()` 记录的是**完成转写的源文件路径**，但两条链路会写进临时目录：

- 录音：`cmd/audio.rs` 只有 `store_in_documents` 为真时才把 wav 移到 Documents，否则留在
  `<temp>/shiorikotrans_temp*`；
- 链接下载：`cmd/ytdlp.rs` 在 `in_documents=false` 时用 `<temp>/shiorikotrans-download-*`。

`cleaner.rs` 会在下次启动清理这些目录，于是「列表里还留着条目、点开却打不开」。
旧实现还有一个竞态：`reopenFile()` 用 `setTimeout(..., 120)` 抢在首页
「路由变化即清空选择」的 effect 之后写 `setFiles`，慢了就什么都不发生。

修复：

- `lib/recent-files.ts`：`isTemporaryPath` / `recentFileExists` / `findMissingRecents`。
- `lib/use-recent-files.ts`：标题栏与设置页共用；异步校验存在性 → 失效项打标、点击给出原因与
  「移除」操作、支持一键清理失效项。
- `FilesProvider.openFiles()` + `consumeExplicitOpen(files)`：显式选择会带标记，目标页的
  「路由变化清空」effect 只在标记与当前选择一致时跳过清空 —— 两处 `setTimeout` 竞态删除。
- 顺带：深链/「打开方式」也会回到转录页。

## 新增/恢复的功能

- 设置搜索（Ctrl+F 聚焦、↑↓ 选择、Enter 跳转、Esc 清空）。
- 通用 → 常规：转录文本方向、字幕预设（此前只在 view-model 里，UI 从未渲染）。
- 转录 → 运行时：ffmpeg 状态卡 + 批量转写默认值（包含子文件夹 / 跳过已存在 / 输出到源目录）。
- 硬件加速独立成节（含设备检测与 Vulkan 信息，文案补全 i18n，此前是硬编码中文）。
- 高级 → 日志：查看日志/生成诊断报告/复制日志/打开日志与临时目录/重置应用。
- 设置不再有重复的「高级」导航项（旧版 GPU 节标题也叫“高级”）。

## 验证

```bash
cd desktop
pnpm i18n:generate          # 新增 89 个键（en-US 基语言 + zh-CN）
pnpm exec tsc --noEmit      # 0 error
pnpm test                   # 4 passed
pnpm exec vite build        # 构建通过
python ../plans/settings-overhaul/settings-overhaul_001.py   # 幂等，仅补缺失键
```

未做：真机点击验证（本机 `pnpm dev` 没有 Tauri runtime，`lib/ytdlp.ts` 会在模块加载期报错白屏）。

## 第二轮（v1.0.9 之后）

- **模型分节并入转录**：`SectionId` 去掉 `models`，模型的三组内容（目录 / 已安装 / 存储位置）
  变成转录分节的三个子标签，导航少一层。`SETTINGS` 里模型条目的 `section` 全部改为 `transcription`。
- **修复「发送到翻译页」后第二次转录不正常**：两个原因 —— ①首页的导航 effect 会把上一次的选择清空，
  回到首页后文件没了；②自动跳转 effect 只看 `segments`，重新挂载后用**旧转录**立刻又把人踢回翻译页。
  现在选择跨导航保留，并用转录轮次（`runId`，每次成功转录 +1）判定「这次真的刚跑完」。
  顺带删掉了 `FilesProvider.openFiles/consumeExplicitOpen` 这套为绕开清空而生的标记机制。
- **关于页重做**（`sections/about.tsx`）：图标 + 版本 + 系统/提交号 + 当前模型/引擎/ffmpeg/CPU，
  维护动作（复制诊断 / 复制日志 / 打开日志·临时·模型目录 / 检查更新），项目链接，重置（两步确认），
  许可与致谢。
- **翻译可用性**：`probeTranslationEngine()` 先探测本地端点（2.5s 超时），不可达时给出可执行提示而
  不是 `error sending request for url (http://127.0.0.1:8080/v1/chat/completions)`；设置里显示
  服务在线/未启动，并给出**绝对路径**的 `llama-server` 启动命令（一键复制）。远端引擎不受此检查影响。
- **下载提速**：新增 HuggingFace 镜像开关（`prefs_hf_mirror`，把 `huggingface.co` 重写为
  `hf-mirror.com`，模型与翻译模型都生效）；进度弹窗按秒显示速度与预计剩余时间。
- **文案瘦身**：`settings-overhaul_002.py` 删掉 36 条描述（只保留 10 条真会踩坑的），导航里不再显示
  分节描述，外观页的长段落移除。
- **UI 继续对齐参考项目**：设置侧栏可拖拽调宽（200–340px，RinaDown 的分隔条做法），分节标签过多时
  横向滚动，设置行加悬停反馈。
- **性能**：设置弹窗与 `docx` 导出改为按需加载（首屏 chunk 1.77MB → 1.34MB，另拆出 87KB 设置块与
  329KB docx 块），Vite 配置 `manualChunks` 与 chunk 警告阈值，转录快照内容未变化时不再重写存储，
  窗口隐藏时状态栏停止轮询。

