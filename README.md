# dsh-looklook

给 **DeepSeek Harness（dsh）** 的图片视觉助手插件：让**纯文本对话模型**也能"看"图片，
表现得像原生多模态模型一样——你问什么，它答什么，而不是把整张图啰嗦一遍。

## 特性

- **伪原生多模态**：文本模型通过识图工具"看"图，主模型根据你的问题自主决定问视觉模型什么
  （你问"图里有几个人"就答几个人；你说"描述这张图"才做全量描述——规则不写死）；
- **图片立即显示**：发图瞬间显示在你的聊天里（无需等待识别），支持**点击放大、中间弹窗**；
- **识图结果不出现在聊天里**：视觉模型的回答只喂给主模型，由主模型组织语言回复你；
- **多视觉提供商 + 故障切换**：主提供商失败自动切换备用；
- **每会话眼睛开关**：关掉后图片只显示不给模型看（占位符）；
- **会话日志零污染**：插件不写任何自定义事件，日志任何 dsh 版本都能加载，历史永不被锁；
- **设置页模型探测**：一键验证 API Key 并拉取模型列表。

## 工作原理

```
你发图 + 提问
  │
  ▼
插件把图换成「图片引用」（含编号/宽高）→ 图立即显示在聊天里
  │
  ▼
主模型（纯文本）要回答你 → 调用 looklook_describe 工具
  │        │
  │        └─ 把「图片引用 + 它自己决定的问题」发给视觉模型
  ▼        └─ 视觉模型只回答那个问题
主模型组织语言回复你（识图过程不打扰你）
```

简单说：插件给文本模型装了一双"眼睛"（识图工具），怎么用这双眼睛，由模型自己判断。

## 安装

### 环境要求

- DeepSeek Harness（dsh web），v0.1.0-rc.6 及以上；
- 一个视觉模型服务（OpenAI 兼容 chat-completions 接口，如 GPT-4o、GLM-4V、Qwen-VL 等）。

### 方式一：通过 dsh 插件命令安装（推荐）

```bash
dsh plugin --profile web add dsh-looklook
```

安装后在 profile 的 package.json 中确认：

```json
"dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-looklook"] } },
"dependencies": { "dsh-looklook": "github:ideasir/dsh-looklook" }
```

### 方式二：手动加入 profile

1. 编辑你的 profile 目录（如 `$DSH_HOME/profiles/web/`）下的 `package.json`：

   - 在 `dsh.profile.bundles` 里加入 `"dsh-looklook"`；
   - 在 `dependencies` 里加入 `"dsh-looklook": "github:ideasir/dsh-looklook"`。

2. 安装依赖并重启：

```bash
cd $DSH_HOME/profiles/web && pnpm install
dsh web --host 127.0.0.1 --port 3080
```

3. 浏览器**整页刷新**（Ctrl+Shift+R）加载插件客户端。

## 配置

### 1. 配置视觉模型（必须）

打开「设置 → 视觉模型」，添加至少一个提供商：

| 字段 | 说明 |
| --- | --- |
| 名称 | 显示名 |
| Base URL | OpenAI 兼容接口地址（自动补 /chat/completions） |
| API Key 环境变量 | 存放密钥的环境变量名（如 MY_VISION_KEY） |
| 模型 | 视觉模型 id（如 gpt-4o、glm-4v） |
| 超时(ms) | 单次请求超时，默认 30000 |
| 启用 | 是否参与识别；可配多个，第一个启用的是主、其余为备用 |

API Key 通过环境变量注入，密钥不会写入配置。

### 2. 每会话眼睛开关

输入框右侧的 👁 图标：

- **开（默认）**：纯文本模型看图时自动走识图工具；
- **关**：图片仍显示，但模型只看到「没有开启多模态功能」占位符。

## 使用

1. 在聊天里发一张图片，可附上你的问题（如"图里有几个人？"）；
2. 图片**立即显示**，点击可放大；
3. 主模型会调用识图工具查看图片，按你的问题回答（你问什么答什么）。

## 开发

```bash
git clone git@github.com:ideasir/dsh-looklook.git
cd dsh-looklook
pnpm install
npm run build        # tsc + tsdown 构建宿主与客户端
npm run typecheck    # 严格类型检查（含未使用代码）
npm test             # 验证脚本（tests/）
```

## 兼容性

- **dsh rc.6**：通过 agent/pre-step 改写请求（记录与请求耦合，客户端负责原图渲染）；
- **dsh 新版**：走 agent/request-messages 请求级改写，记录原生保留图片块。

## 许可证

MIT

---

> 开发日记（DEVLOG）为内部资料，不随仓库发布。