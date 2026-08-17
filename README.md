# Look Look

## 安装插件

### 推荐安装方式

在 DeepSeek Harness 的 profile 中执行：

```bash
dsh plugin --profile web add dsh-looklook
```

安装完成后重启 DSH Web：

```bash
dsh web --host 127.0.0.1 --port 3080
```

然后打开 DSH Web，刷新浏览器页面。若客户端界面仍是旧版本，执行一次强制刷新：

```text
Ctrl + Shift + R
```

> 插件的宿主代码需要重启 `dsh web` 才会生效；客户端界面通常在刷新页面后生效。

### 手动安装

如果不能使用 `dsh plugin` 命令，可以把插件加入 profile 后安装依赖：

```bash
cd "$DSH_HOME/profiles/web"
pnpm install
dsh web --host 127.0.0.1 --port 3080
```

插件仓库：

```text
https://github.com/ideasir/dsh-looklook
```

## 项目介绍

Look Look 是 DeepSeek Harness 的多媒体和文档理解插件。

DeepSeek Harness 的主 Agent 可能是纯文本模型，不能直接理解图片、视频和设计文件。Look Look 提供一个统一的内置工具：

```text
looklook_see(source, question)
```

当用户要求查看图片、视频、PSD、PPT 或其他文件时，Agent 直接调用 Look Look，不需要先运行 `npm install`、`pip install`，也不需要临时下载外部解析器。

Look Look 会根据内容类型自动选择处理流程，把解析结果、画面描述、字幕、声音理解和文档结构整理成主 Agent 可以使用的文本报告。

## 主要功能

### 图片理解

- 识别本地图片；
- 调用用户配置的视觉模型；
- 根据用户问题进行针对性分析；
- 支持 PNG、JPG、JPEG、GIF、WebP 等常见格式；
- 纯文本模型会通过 `.uploads/` 文件通道查看图片；
- 已支持原生图片模型的会话继续使用原生图片管线；
- 上传图片时在输入框显示本地缩略图。

### 视频理解

支持本地视频文件和视频链接。

本地视频可以进行：

- 视频元信息读取；
- 场景驱动抽帧；
- 画面内容识别；
- 字幕提取；
- 音频提取；
- 对白转写；
- 语气、音乐、节奏理解；
- 画面、声音和字幕的时间轴整理。

视频链接支持：

- B站；
- YouTube；
- 抖音；
- 西瓜视频；
- 腾讯视频；
- 以及 yt-dlp 支持的其他平台。

链接视频的实际可用性取决于平台访问权限、代理、登录态、Cookies 和 yt-dlp 当前支持状态。

### ZIP 压缩包

- 查看压缩包目录；
- 展示文件和目录结构；
- 根据用户问题分析压缩包内容；
- 只有用户明确要求改变文件时，才使用 `process_zip` 执行解压。

压缩包默认在待发送区域显示压缩包图标。

### PSD 设计文件

PSD 使用 Look Look 内置解析能力，不需要 Agent 另外下载 `psd.js` 或其他 PSD 解析器。

支持：

- 画布宽高；
- 分辨率；
- 色彩模式；
- 图层总数；
- 图层树和组结构；
- 图层名称；
- 显示/隐藏状态；
- 常见文字图层文本；
- PSD 合成预览；
- Logo、海报、UI 设计等整体视觉分析。

PSD 在待发送区域显示 PSD 图标。

默认不批量导出 PSD 图层。大型 PSD 可能包含数百甚至数千个图层，批量导出会产生严重的磁盘、内存和处理时间压力。智能对象、蒙版、调整图层和特殊色彩模式可能存在解析限制。

### Office 和 PDF 文档

支持：

- PPT/PPTX：幻灯片文字、图形、备注、图片和页面结构；
- PDF：页面文字和扫描页图片理解；
- Word/DOCX：段落、标题、表格和嵌入图片；
- Excel/XLSX：工作表、单元格、表格和日期数据。

### 本地语音识别

可选安装 faster-whisper，在本机完成视频对白转写。

支持选择：

- tiny；
- base；
- small；
- medium；
- large-v3。

同一时间只保留一个本地 ASR 模型，切换模型时会清理旧模型。

## 使用方式

安装后，用户可以直接发送文件并提问：

```text
请看看这个图片里的产品信息
```

```text
分析这个视频讲了什么，重点说明结论
```

```text
这个 PSD 的 Logo 设计有哪些图层？整体风格怎么样？
```

```text
看看这个 PPT 的结构，并总结每一页的重点
```

Agent 应直接调用：

```text
looklook_see(source, question)
```

### 文件上传流程

```text
选择或拖入文件
  → 文件上传到当前会话的 .uploads/
  → 输入框显示文件名、大小和类型图标
  → 图片额外显示缩略图
  → 用户输入问题并点击发送
  → 文件路径和问题一起交给主 Agent
  → Agent 调用 looklook_see
```

## 配置

位置：

```text
设置 → 插件配置 → Look Look
```

### 总开关

`looklook.enabled` 默认开启。

关闭后：

- 插件停止拦截文件入口；
- `looklook_see` 不执行识别；
- DSH 恢复为没有安装 Look Look 时的行为。

### 视觉模型

用于：

- 图片识别；
- 视频抽帧识别；
- PSD 合成预览；
- PPT/PDF 中的图片理解。

支持多个 OpenAI-compatible 提供商，按顺序进行主模型和备用模型切换。

### 音频模型

用于：

- 对白理解；
- 语气分析；
- 音乐识别；
- 节奏和氛围分析。

插件会自动探测模型能力，支持高阶音频理解的模型优先走高阶路径，不支持时降级为纯转写。

## 视频网络、代理和 Cookies

### 代理

Look Look 会自动检测以下环境变量，并传给视频 worker 和 yt-dlp：

```text
DISCORD_PROXY
HTTPS_PROXY
HTTP_PROXY
ALL_PROXY
https_proxy
http_proxy
all_proxy
```

优先级从上到下。环境检测页面会显示是否发现代理配置，但不会显示代理 URL、用户名、密码或 Token。

YouTube 等境外视频需要当前机器拥有真正可用的代理。Look Look 能发现并使用代理，但不能修复代理服务本身不可连接或无法访问目标网站的问题。

### Cookies

需要登录态的平台可以选择性配置：

```text
LOOKLOOK_COOKIES_BROWSER=edge
```

也可以指定 Netscape 格式的 Cookies 文件：

```text
LOOKLOOK_COOKIES_FILE=/path/to/cookies.txt
```

浏览器值可以是：

```text
edge
chrome
firefox
```

Cookies 只传给 yt-dlp，不会打印内容，不会交给视觉模型，也不会写入分析报告。

## 平台能力边界

| 平台/内容 | 状态 | 说明 |
|---|---|---|
| 本地图片 | 支持 | 视觉模型配置后可识别 |
| 本地视频 | 支持 | 需要 ffmpeg；声音理解还需要音频模型或本地 ASR |
| B站 | 支持 | 受网络、登录态和 yt-dlp 影响 |
| YouTube | 依赖代理 | 需要当前机器能通过代理访问 YouTube |
| 抖音 | 可尝试 | 使用 Chrome/Edge CDP；可能被平台反爬拦截 |
| 西瓜视频 | 依赖登录态 | 可能需要浏览器 Cookies |
| 腾讯视频 | 依赖登录态 | 可能需要浏览器 Cookies |
| PSD | 支持 | 内置解析；复杂 Photoshop 特性存在限制 |
| ZIP | 支持 | 默认查看目录，解压使用独立工具 |
| PPT/PDF/Word/Excel | 支持 | 解析文本、结构和可提取图片 |
| TXT/MD/JSON | 当前不支持 | 不属于当前文档解析范围 |

工具失败时，Look Look 会报告具体失败原因。它不会把标题、URL 或部分元信息冒充成已经看过视频画面。

## 环境要求

- DeepSeek Harness `dsh web` v0.1.0-rc.6 或更高版本；
- Node.js：由 DSH 提供；
- Python 3.9+：视频 worker 和本地 ASR 使用；
- ffmpeg：视频抽帧和音频提取；
- yt-dlp：视频链接分析，插件环境检测可安装到隔离 venv；
- 视觉模型：可选，识别图片和视频画面；
- 音频模型：可选，理解声音和音乐；
- 网络代理或登录 Cookies：部分视频平台需要。

## Agent Skill

Look Look 内置 Agent Skill，运行时会告诉 Agent：

- 图片、视频、ZIP、PSD、PPT、PDF、Word、Excel 已经由 Look Look 内置处理；
- 遇到这些内容优先直接调用 `looklook_see`；
- 不要先运行 `npm install` 或 `pip install` 下载解析依赖；
- PSD 默认分析整体设计和图层结构，不批量导出图层；
- 视频网络失败、登录失败或反爬失败时不能编造内容。

Skill 源码：

```text
src/looklook-skill.ts
```

维护文档：

```text
skills/looklook/SKILL.md
```

## 架构特点

Look Look 采用零补丁架构：

- 不修改全局 `@deepseek-ai/*` 包；
- 不修改 DSH 核心图片准入逻辑；
- 插件设置通过私有 `remote.looklook` RPC 管理；
- 不把插件设置注册成全局 LLM provider；
- 上传、设置、凭据、ASR、环境检测和会话模态查询使用授权 Remote RPC；
- 视频 worker 的 stdout 保持为单一 JSON IPC 文档，yt-dlp 日志写入 stderr；
- 插件卸载可以清理 settings、工具、RPC、渲染槽和监听器。

## 安全和信任边界

Look Look 定位为单用户桌面插件，适合本地或受信连接部署。

- 文件路径读取遵循 DSH fs 沙箱；
- 视频和 ZIP worker 处理模型提供的本地路径；
- 上传文件名经过 basename 和路径安全检查；
- 单文件上传上限为 100 MB；
- 图片 URL 可能被转发给用户配置的视觉模型供应商；
- Cookies 只用于 yt-dlp，不进入模型上下文；
- 本地 ASR 安装会创建隔离 venv 并下载模型；
- 多用户或不可信网络环境应自行增加网关和会话授权校验。

## 开发

```bash
npm install
npm run typecheck
npm run build
npm run verify
```

验证套件覆盖工具架构、Agent Skill 注入、图片引用、缩略图、上传安全、Office 文档解析和集成 smoke tests。

开发日志位于项目工作区旁：

```text
dsh-looklook-DEVLOG.md
```

## 许可证

MIT
