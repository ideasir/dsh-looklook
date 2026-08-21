### Look Look — 让 DSH 能 Look 万物

大家好，我做了一个 DSH 插件叫 **Look Look**（俗称撸货）。

DSH 原生只能上传图片，格式支持很有限。这个插件把"看"的能力扩展到几乎所有常见文件格式。而且不光能看文件——还能看聊天记录，让新对话 look 旧对话。

---

## 适配说明

当前版本 `0821-rc.8`，适配 DSH `v0.1.0-rc.8`（开发者预览版）。

DSH 目前还在开发者预览阶段，版本更新较频繁，后续会持续跟进适配。每次大版本更新后，我会尽量在短时间内发布适配版本。

---

## 功能介绍

### 📁 Look 文件

把文件拖进聊天框，AI 就能理解和分析：

| 文件类型 | 能力 |
|---------|------|
| 📷 图片 | PNG/JPG/GIF/WebP/BMP/SVG/PSD/TIFF/HEIC/RAW 等 |
| 🎬 视频 | 识别画面、场景分析、字幕提取、音频转写 |
| 🎵 音频 | 语音转录、录音内容理解 |
| 📄 文档 | PDF / Word / Excel / PPT，全部本地解析，不上传 |
| 🎨 设计稿 | PSD 自动提取合成图预览 |
| 📦 压缩包 | ZIP 内部文件一并理解 |

### 💬 Look 聊天记录

- **新对话 look 旧对话** — 可以把之前的对话内容喂给新会话，AI 能看懂上下文
- **会话 ID 一键复制** — 方便跨会话传递上下文

### 🧩 其他能力

- **小眼睛开关** — 打开时走模型视觉能力，关闭时走文件上传通道
- **ChatMinimap** — 右侧对话导航标尺，快速跳转历史消息
- **环境检测** — 一键检查本地依赖是否完整
- **设置面板** — 配置视觉模型、音频模型、本地 ASR

---

## 项目截图

![DSH 插件设置页](https://github.com/ideasir/dsh-looklook/raw/main/screenshots/04-settings-zh.jpg)

![插件验证报告](https://github.com/ideasir/dsh-looklook/raw/main/screenshots/06-verification-report.jpg)

---

**GitHub**: https://github.com/ideasir/dsh-looklook

有问题欢迎在 Issues 或本讨论区回复。
