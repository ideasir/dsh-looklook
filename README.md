# dsh-looklook

**Look at anything** for DeepSeek Harness — 为纯文本对话模型扩展"看万物"能力：图片、视频（画面+声音）、压缩包、文档，一个工具统一理解。

## 插件作用

DeepSeek Harness 的对话模型默认以文本为主，无法直接理解图片、视频等媒体。本插件在**不更换对话模型**的前提下：

- 接入独立的**视觉模型**识别图片和视频画面（视频=抽帧成图）；
- 接入**音频模型**（或本地 ASR）理解视频声音：对白、语气、音乐、节奏；
- 通过统一的 `looklook_see` 工具，让主模型"看到"任何内容并针对用户问题作答。

用户无需感知后台差异，获得与原生多模态一致的使用体验。

## 特点

- **统一工具 `looklook_see`**：图片文件/视频文件/视频链接/压缩包/文档，一个工具自动分发，主模型只需记一个名字；
- **图片文件通道**：拖入的图片经插件上传通道存入会话 `.uploads/`，消息只带路径文本——**永不进入原生 attachment 管线**，因此原生 api-proxy 的"模型不支持图片"检查不会被触发，**不需要任何兼容补丁**；
- **多模态自动分流**：会话模型本身支持图片时，拖图走原生管线（完全原生体验）；纯文本模型时自动走文件通道；
- **视频多模态联动**：按场景切换点抽帧（卡点视频不丢镜头）、音频按对白停顿分段（无字幕时按 60s 块限长防 OOM）、画面与声音在**同一时间轴**输出；
- **字幕交叉验证**：从画面 OCR 提取字幕，纠正音频转写的同音错字（"测联号"→"策联号"）；
- **模型能力自动探测**：音频模型无需用户标注能力——先试高阶（对白+语气+音乐+节奏），不行自动降级纯转写；
- **主+备用模型故障切换**：视觉/音频模型都支持多个提供商，主模型报错自动切换备用；
- **本地 ASR 一键安装**：无 API 也能转写对白（faster-whisper medium）；
- **标准 API、零补丁**：设置命名空间通过 `llm.registerConfigurableProviders()` 暴露（rc.6 原生机制），上传/ASR/模态查询全部走鉴权的 Remote RPC，不修改任何 DSH 核心文件。

## 工具一览

| 工具 | 作用 |
|---|---|
| `looklook_see(source, question)` | 理解任何内容：图片（文件路径）、视频（文件/链接）、压缩包内容、文档 |
| `process_zip` | 解压压缩包（extract 操作；看内容用 looklook_see） |

## 安装

### 环境要求

- DeepSeek Harness（`dsh web`）v0.1.0-rc.6 及以上；
- **视觉模型**：一个支持图片输入的 OpenAI 兼容端点（可选，识别图片/视频画面用）；
- **音频模型**：支持音频输入的 OpenAI 兼容端点（可选，理解语气/音乐用）；
- **ffmpeg**（视频抽帧/音频提取）；**yt-dlp**（视频链接下载，可选）；
- 本地 ASR（可选）：一键安装 faster-whisper，无需 API。

### 安装插件

```bash
dsh plugin --profile web add dsh-looklook
```

或手动加入 profile 后启动：

```bash
cd $DSH_HOME/profiles/web && pnpm install
dsh web --host 127.0.0.1 --port 3080
```

浏览器整页刷新（Ctrl+Shift+R）加载插件界面。安装后重启 `dsh web` 使宿主代码生效。

> 无需任何兼容补丁。本插件不修改 `@deepseek-ai/*` 的任何文件。

## 配置（设置 → 插件配置 → 看看）

| 配置项 | 说明 |
|---|---|
| **识别图像** 开关 | ON=插件视觉模型识别图片；OFF=交给大模型自身多模态 |
| **识别视频** 开关 | ON=视频分析（抽帧+音频）；OFF=视频仅保存不分析 |
| **视觉模型** | 识别图片/视频画面（视频共用）；主+备用故障切换 |
| **音频模型** | 对白+声音理解（自动探测能力）；主+备用 |
| **本地 ASR 一键安装** | 安装 faster-whisper medium，无需 API |

模型配置均为 OpenAI 兼容格式：API 地址（Base URL）+ API Key（环境变量引用）+ 模型名。

## 架构说明（为什么零补丁）

DSH rc.6 的 api-proxy 对"文本模型 + 图片"会原生拒绝（`MODEL_DOES_NOT_SUPPORT_IMAGES`）。传统方案靠打补丁绕过该检查；本插件改为**图片不走原生管线**：

```
用户拖图 → 客户端查会话模态（remote.looklook.sessionModality）
          ├─ 模型支持图片 → 放行原生管线（多模态模型完全原生）
          └─ 模型不支持 → 拦截 → remote.looklook.upload 存入 .uploads/
                消息文本只含文件路径 → 模型调 looklook_see(路径) → 视觉模型描述
```

- 设置页命名空间（`looklook`/`vision`/`looklook-audio`）通过 `llm.registerConfigurableProviders()` 声明，api-proxy 自动暴露——无需改 `WEB_SETTINGS_NAMESPACES`；
- 上传、ASR 安装、模态查询全部是 `remote.looklook.*` 的 Typert Remote 方法——走鉴权连接，无未授权 HTTP 路由；
- 插件卸载即净：settings/工具/RPC/渲染槽全部是 effect，不留任何全局改动。

### 信任边界（安全模型）

本插件是**单用户桌面工具**的定位，面向本地/受信连接部署。以下几点是设计上的信任边界，多用户或不可信网络环境下部署时需自行加网关层：

- **`looklook_see` 的路径参数**：模型（或注入提示词）可以请求读取它知道路径的任何文件——图片/文档分支通过 `fs` 服务读取（沙箱策略生效），视频/压缩包分支经 Python worker / adm-zip 读取（模型可控路径）。这与"模型可执行 bash 读取任意文件"属于同一信任模型：**模型本身就是可信代码执行者**。
- **会话归属**：`remote.looklook.upload` / `readUpload` 只校验 session 存在与路径安全（basename + `.uploads/` 前缀），不校验"调用方属于该会话"——DSH 的 Remote 通道按连接鉴权，sessionId 由客户端自报（格式为可枚举的 `session-<n>`）。
- **图片 URL 识别**：`looklook_see` 对 http(s) 图片 URL 会拉取字节并转发给（用户配置的）视觉供应商，`redirect: 'error'` 禁重定向；对内网端点的访问面与"模型可 curl 内网"一致。
- **本地 ASR 安装**：一键安装执行 `pip3 install --break-system-packages faster-whisper` 并下载模型，属于机器级系统副作用，仅在受信本机触发。

## 开发日志

见 `DEVLOG.md`（内部资料，不随包发布）。

## 许可证

MIT
