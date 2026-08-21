# Changelog

## [0821-rc.8] - 2026-08-20

### 新增
- **ChatMinimap 导航概览标尺**：在对话区左侧显示用户消息概览横杠，支持点击跳转、悬停预览。从 React store（ConversationRoot.nodes）读取完整消息列表，不受虚拟滚动影响。自动缓存，会话切换时重建。
- **CopySessionIdButton 复制会话 ID**：在 assistant-actions 槽位添加按钮，一键复制 `dsh-session://` 链接到剪贴板。
- **深色/浅色主题自适应**：ChatMinimap 横杠颜色根据当前主题自动切换配色。
- **热区悬停效果**：横杠悬停时当前变宽（30px）、上下相邻变宽（20px），鼠标离开恢复。

### 适配
- **升级至 DSH v0.1.0-rc.8**：所有 `@deepseek-ai/*` 依赖从 `^0.1.0-rc.7` 升级到 `^0.1.0-rc.8`。
- **DSH 滚动容器类名变更**：rc.8 中滚动容器从 `.Md3f7G_scroll` 改为 `wSkVaW_scrollBody`，选择器改为通配匹配 `[class*="scrollBody"], [class*="scroller"], .Md3f7G_scroll`。
- **DSH 不再导出 `bindSnapshotSelector`**：插件内自建替代实现（`bind-snapshot.ts`）。

### 修复
- **文件上传时间戳从 36 进制改为十进制**：`Date.now().toString(36)` 生成 `mt1d67q7` 难以理解，改为 `Date.now().toString()` 生成 `1755693182000` 可读时间戳。
- **排队气泡显示源代码**：去掉 draft 中的 JSON 标记，改用 `fileRegistry` Map + `NEW_NOTE_RE` 文本标记方案。
- **fileRegistry key 不匹配导致缩略图 0B**：registry 用原始文件名做 key（不是哈希名），`UserMessageNodeView` 渲染时正确匹配。
- **模型找不到文件**：文本末尾保留 `[f:serverName]` 紧凑格式供 AI 使用。
- **feature-controller / eye-controller 竞态条件**：RPC 未就绪时不再擅自默认状态，改为 600ms 重试。
- **MutationObserver 循环触发**（ChatMinimap 越点越多）：给标尺添加 `looklook-minimap` class，observer 排除自身变化。
- **ChatMinimap 加载不全**：从 React store 直接读取完整消息列表，不再依赖 DOM 查询（虚拟滚动只渲染 6 个节点）。
- **ChatMinimap 切换会话延迟**：改用 document.body MutationObserver 实时监听，不再轮询等待。

### 变更
- **接口定义迁移**：`SessionModality`、`EnvCheckItem`、`EnvCheckReport`、`CapabilityItem`、`CapabilityReport` 从 `upload-shared.ts` 导出（原在 `plugin-settings.ts`）。
- **`looklook-skill` 更新**：指示 AI 用 `[f:serverName]` 标记做 `looklook_see` 的 source 参数，避免文件找不到。

## [0.3.0] - 2026-08-19

### 适配
- **升级 peerDependencies 至 DSH v0.1.0-rc.7**：所有 `@deepseek-ai/*` 依赖从 `^0.1.0-rc.6` 升级到 `^0.1.0-rc.7`，确保与 DSH rc.7 完全兼容（包括 node-pty 1.2 beta、max-tokens 截断修复、大历史分页栈溢出修复等底层变更）。
- **升级 devDependencies 至 DSH v0.1.0-rc.7**：构建环境与运行时保持一致。
- **升级 `@deepseek-ai/dsh-timeout` 依赖**：从 `^0.1.0-rc.6` 升级到 `^0.1.0-rc.7`。

### 修复
- **PPT 背景音乐识别缺失 `max_tokens` 参数**：`identifyBackgroundMusic` 向音频模型发送请求时未设置 `max_tokens`，部分 OpenAI-compatible 提供商可能因此拒绝请求。现已补充 `max_tokens: 200`。

### 说明
- rc.7 新增的「各插件可自行注册设置卡片」机制，Look Look 已通过 `settings.plugin.item` slot 正确注册，无需额外适配。
- rc.7 新增的「提问卡片支持折叠并保留草稿」与 pending files 机制兼容，已验证无冲突。
- README 中最低版本要求已更新为 `v0.1.0-rc.7`。

## [0.2.1] - 2026-08-17

### 修复
- **彻底移除消息内容里的原始标记**：不再往用户消息里注入 `【looklook:开始】...【looklook:结束】` 和 `【looklook:file】{json}【looklook:file】`，避免排队（pending）气泡暴露内部代码。
- **上传文件同名覆盖**：多个重名文件（如剪贴板多次粘贴的 `image.png`）不再互相覆盖，保存时追加时间戳后缀生成唯一文件名。

### 优化
- **排队气泡显示更清晰**：消息注记从「上传了文件：xxx」改为「[类型]文件名 排队中...」（如 `[图片]image_abc123.png 排队中...`），一眼可辨文件类型与具体文件。
- **`looklook_see` 直接传文件名**：不再需要完整路径，直接传 `image_abc123.png` 会自动去会话 `.uploads/` 目录解析文件。
- **定稿后缩略图**：消息定稿后自动把注记替换为图片缩略图卡片（新增 CLEAN_NOTE_RE 解析）。

### 说明
- 排队气泡内为 DSH 纯文本渲染，无法单独设置字体大小格式；此为用户可见的临时状态，定稿后即为缩略图。