# Look Look

**Look at anything for DeepSeek Harness**：让文本模型直接理解图片、视频、B站/YouTube 链接、ZIP、PSD、PPT、PDF、Word 和 Excel。

Look Look 的目标不是让 Agent 自己寻找解析库，而是提供一个稳定、统一的内置能力：当用户要求“看看这个文件/视频/设计稿”时，Agent 直接调用 `looklook_see`，不需要先安装 npm 或 Python 依赖。

## 能力概览

| 内容 | 内置能力 |
|---|---|
| 图片 | 视觉模型识别、针对问题回答、拖拽上传、原生多模态自动分流 |
| 本地视频 | 场景驱动抽帧、字幕、音频/对白、画面与声音时间轴分析 |
| 视频链接 | B站、YouTube、抖音及 yt-dlp 支持的平台（依赖网络、代理和平台可访问性） |
| ZIP | 查看压缩包目录和文件结构；只有明确要求时才执行解压 |
| PSD | 画布、分辨率、色彩模式、合成预览、图层树、文字图层、可见性和整体设计描述 |
| PPT/PDF/Word/Excel | 文本、表格、页面/幻灯片结构和嵌入图片理解 |
| 本地 ASR | faster-whisper 本地语音转写，可选择 tiny/base/small/medium/large-v3 |

## 工具

### `looklook_see(source, question)`

统一的内容理解工具。使用场景包括：

- 用户要求识别图片；
- 用户要求分析本地视频或视频链接；
- 用户要求查看 ZIP 内容；
- 用户要求理解 PSD、PPT、PDF、Word 或 Excel；
- 用户对文件/图片/视频提出具体问题。

参数规则：

- `source`：使用用户消息中的原始文件路径、图片引用或视频 URL，不要猜测路径；
- `question`：填写用户的实际问题，针对性提问，不要每次都要求全量描述。

### `process_zip`

只负责会改变文件系统的 ZIP 解压操作。查看 ZIP 内容优先使用 `looklook_see`。

## 内置 Agent Skill

插件内置 `Look Look Agent Skill`，运行时会通过 system prompt 告诉 Agent：

1. 图片、视频、ZIP、PSD、PPT、PDF、Word、Excel 已由 Look Look 内置处理；
2. 遇到这些内容应先调用 `looklook_see`；
3. 不要先运行 `npm install`、`pip install`，也不要先下载 `psd.js`、`yt-dlp` 等解析依赖；
4. PSD 默认分析整体设计和图层结构，不批量导出图层；
5. 视频或网络失败时不能编造内容；
6. 工具返回失败后再向用户解释原因。

维护文档位于：

```text
skills/looklook/SKILL.md
```

运行时 Skill 源码位于：

```text
src/looklook-skill.ts
```

## PSD 能力边界

PSD 使用内置 JavaScript 解析器处理，不要求 Agent 额外下载 PSD 解析包。当前重点是：

- 读取画布尺寸、分辨率和色彩模式；
- 读取图层树、图层名称、组结构和显示/隐藏状态；
- 读取常见文字图层内容；
- 加载合成预览并交给视觉模型描述整体设计。

当前不默认批量导出图层。原因是大型 PSD 可能包含数百甚至数千个图层，批量导出会造成磁盘、内存和处理时间压力。复杂 PSD 的智能对象、蒙版、调整图层和特殊色彩模式可能存在解析限制，工具返回的 warning 应视为结果的一部分。

## 视频能力边界

本地视频和视频链接的处理流程包括：

```text
视频文件/URL
  → Python worker
  → 元信息/字幕
  → 场景驱动抽帧
  → 音频切片与声音理解
  → 视觉模型 + 音频模型
  → 时间轴报告
```

视频链接依赖 Python venv 中的 `yt-dlp`。B站、YouTube 等平台还受以下因素影响：

- 网络和代理；
- 平台登录或 Cookie；
- YouTube bot challenge；
- 视频 CDN 是否可访问；
- yt-dlp 对平台的支持状态。

网络失败时 Look Look 会报告失败，不能把标题或元信息冒充成已经看过画面。

## 安装

### 环境要求

- DeepSeek Harness `dsh web` v0.1.0-rc.6 或更高版本；
- Node.js（由 DSH 提供）；
- 视觉模型：支持图片输入的 OpenAI-compatible 端点，可选；
- 音频模型：支持音频输入的 OpenAI-compatible 端点，可选；
- `ffmpeg`：视频抽帧、音频提取；
- Python 3：视频 worker 和本地 ASR 使用；
- 视频链接分析需要可访问目标平台的网络/代理；
- 本地 ASR 和 yt-dlp 会安装到插件自己的隔离 venv。

### 安装插件

```bash
dsh plugin --profile web add dsh-looklook
```

或者手动加入 profile 后启动：

```bash
cd $DSH_HOME/profiles/web
pnpm install
dsh web --host 127.0.0.1 --port 3080
```

安装后需要重启 `dsh web` 使宿主侧代码生效；客户端界面通常整页刷新即可加载最新 bundle。

> Look Look 不修改任何全局 `@deepseek-ai/*` 源码，不使用兼容补丁。

## 配置

位置：**设置 → 插件配置 → Look Look**。

| 配置项 | 说明 |
|---|---|
| **总开关** `looklook.enabled` | 默认开启；关闭后插件休眠，不拦截入口，DSH 恢复原样 |
| **视觉模型** | 图片和视频帧识别；支持主模型和备用模型自动切换 |
| **音频模型** | 对白、语气、音乐、节奏理解；自动探测能力并降级为纯转写 |
| **本地 ASR** | 选择并安装一个 faster-whisper 模型；同一时间只保留一个模型，换装会清理旧模型 |

模型配置使用 OpenAI-compatible 格式：Base URL、API Key 引用和模型名。API Key 通过 DSH credentials 服务保存，不写入对话或日志。

## 架构与安全

Look Look 采用零补丁架构：

- 图片根据会话模型能力在原生管线和文件通道之间自动分流；
- 不修改 DSH 的图片准入检查或请求消息；
- 上传、设置、凭据、ASR、环境检测和会话模态查询使用授权 Remote RPC；
- 插件设置通过私有 `remote.looklook` RPC 管理，不注册成全局 LLM provider，因此不会污染后台的模型选择器；
- 视频 worker 的 stdout 是单独的 JSON IPC 通道，yt-dlp 日志写入 stderr；
- 插件卸载通过 effect 清理 settings、工具、RPC、渲染槽和监听器。

### 信任边界

本插件定位为单用户桌面工具，适合本地或受信连接部署。多用户或不可信网络环境应自行增加网关和会话归属校验。

- `looklook_see` 的路径参数遵循 DSH fs 沙箱，但模型可以请求读取它知道路径的文件；
- 视频/ZIP worker 处理模型提供的路径，信任模型与 bash 工具相同；
- `remote.looklook.upload/readUpload` 做路径安全和大小限制，但不替代多用户会话授权；
- 图片 URL 可能被转发到用户配置的视觉供应商；
- 本地 ASR 安装会创建 venv、安装 Python 包并下载模型，属于受信本机操作；
- 视频链接分析会访问用户提供的外部网站和 CDN。

## 开发

```bash
npm install
npm run typecheck
npm run build
npm run verify
```

`verify` 包含工具架构、翻译、图片 lightbox、缩略图、上传安全、气泡、Office 文档解析和集成 smoke tests。

开发维护资料：

- `skills/looklook/SKILL.md`：Agent 使用规则；
- `dsh-looklook-DEVLOG.md`：完整开发记录（仓库外部内部日志）；
- `src/looklook-skill.ts`：运行时 Skill 单一来源。

## 许可证

MIT
