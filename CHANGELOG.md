# Changelog

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
