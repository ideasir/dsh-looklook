# dsh-looklook

dsh-looklook 是 DeepSeek Harness（dsh）的图片视觉助手插件，用于为纯文本对话模型扩展图片理解能力。

## 插件作用

DeepSeek Harness 的对话模型默认以文本为主，无法直接理解用户发送的图片。本插件在**不更换对话模型**的前提下，
为文本模型接入独立的视觉（多模态）识别模型，使文本模型能够"看懂"图片，并针对用户的问题作出准确回答——
用户无需感知后台差异，获得与原生多模态一致的使用体验。

## 为什么开发这个插件

- 让纯文本对话模型获得图片理解能力，同时保留其原有文本能力与使用习惯；
- 视觉能力独立配置、独立调用，对话模型与视觉模型互不影响；
- 用户问什么，模型答什么：识别结果仅作为主模型的依据，最终答复由主模型组织，不干扰用户阅读。

## 特点

- **独立配置视觉模型**：「设置 → 视觉模型」中单独配置多模态模型，支持多个提供商及故障自动切换，无需改动主对话模型；
- **对话框眼睛开关**：配置好视觉模型后，对话框输入区出现 👁 图标，可随时手动开启/关闭多模态能力，**默认开启**；
- **主模型自主组织回答**：视觉识别结果只服务于主模型，由主模型根据用户的问题组织最终答复；
- **会话记录零污染**：插件不向会话日志写入任何自定义事件，历史记录在所有 dsh 版本下均可正常加载。

## 安装

### 环境要求

- DeepSeek Harness（`dsh web`）v0.1.0-rc.6 及以上；
- 一个支持图片输入的视觉模型服务（OpenAI 兼容 chat-completions 接口）。

### 方式一：dsh 插件命令（推荐）

```bash
dsh plugin --profile web add dsh-looklook
```

### 方式二：手动加入 profile

1. 编辑 `$DSH_HOME/profiles/web/package.json`：

   - 在 `dsh.profile.bundles` 中加入 `dsh-looklook`；
   - 在 `dependencies` 中加入 `dsh-looklook`，值为 `github:ideasir/dsh-looklook`。

2. 安装依赖并启动：

```bash
cd $DSH_HOME/profiles/web && pnpm install
dsh web --host 127.0.0.1 --port 3080
```

3. 浏览器整页刷新（Ctrl+Shift+R）加载插件界面。

## 配置

打开「设置 → 视觉模型」，添加至少一个提供商：

| 字段 | 说明 |
| --- | --- |
| 名称 | 提供商显示名称 |
| Base URL | OpenAI 兼容接口地址（自动补 /chat/completions） |
| API Key 环境变量 | 存放密钥的环境变量名 |
| 模型 | 视觉模型 ID（如 gpt-4o、glm-4v） |
| 超时(ms) | 单次请求超时，默认 30000 |
| 启用 | 是否参与识别；可配置多个，第一个启用的为主、其余自动作为备用 |

API Key 通过环境变量注入，不写入配置文件。

## 质量与检测

- 通过 DeepSeek Harness 插件结构规范检测（cordis 插件标准：name/inject/apply、工具注册、设置命名空间、客户端插槽）；
- TypeScript 严格模式构建零错误，含未使用代码检查（--noUnusedLocals / --noUnusedParameters）；
- 内置功能验证脚本（tests/）全部通过。

## 许可证

MIT