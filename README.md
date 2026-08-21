# Look Look

> 当前版本 `0821-rc.8`，适配 DSH `v0.1.0-rc.8`（开发者预览版）。使 DeepSeek Harness 能 Look 万物——图片、视频、音频、PSD、Office 文档、PDF、压缩包，以及聊天记录。新对话能 Look 旧对话。

![DSH 插件设置页](screenshots/04-settings-zh.jpg)
![插件验证报告](screenshots/06-verification-report.jpg)

## 适配说明

DSH 目前还在开发者预览阶段，版本更新较频繁，每次大版本更新后插件需要重新适配。

当前版本对应 DSH `v0.1.0-rc.8`，后续会持续跟进。

## 部署方式

从 GitHub 克隆仓库后本地构建：

```bash
git clone https://github.com/ideasir/dsh-looklook.git
cd dsh-looklook
npm install
npm run build
```

构建产物在 `lib/` 目录。把产物复制到 DSH profile 的 `node_modules` 目录：

```bash
mkdir -p ~/.dsh/profiles/web/node_modules/dsh-looklook
cp -r lib/* ~/.dsh/profiles/web/node_modules/dsh-looklook/lib/
```

重启 DSH 即可。在设置页 Plugins → Look Look 中配置模型。

> 插件尚未发布到 npm，需要从仓库克隆构建。

## 功能介绍

### 📁 Look 文件

把文件拖进聊天框，AI 就能理解和分析：

- **图片** — PNG/JPG/GIF/WebP/BMP/SVG/PSD/TIFF/HEIC/RAW 等
- **视频** — 识别画面、场景分析、字幕提取、音频转写
- **音频** — 语音转录、录音内容理解
- **文档** — PDF / Word / Excel / PPT，全部本地解析，不上传
- **设计稿** — PSD 自动提取合成图预览
- **压缩包** — ZIP 内部文件一并理解

### 💬 Look 聊天记录

- 新对话 Look 旧对话 — 把之前的对话内容喂给新会话，AI 能看懂上下文
- 会话 ID 一键复制 — 方便跨会话传递上下文

### 🧩 其他能力

- 小眼睛开关 — 打开时走模型视觉能力，关闭时走文件上传通道
- ChatMinimap — 右侧对话导航标尺，快速跳转历史消息
- 环境检测 — 一键检查本地依赖是否完整
- 设置面板 — 配置视觉模型、音频模型、本地 ASR

## 依赖

- `pdfjs-dist` — PDF 解析
- `psd.js` — PSD 文件解析
- `adm-zip` / `fflate` — ZIP 解压
- `fast-xml-parser` — Office XML 解析
- `pngjs` — PNG 图片处理
- 其他靠 DSH 自身的 Files API，零外部网络请求

## 变更记录

参见 [CHANGELOG.md](CHANGELOG.md)。