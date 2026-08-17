# Contributing to Look Look

## 项目架构

Look Look 是一个 DSH 插件，由两部分组成：

- **宿主（host）**：Python 执行环境交互、文件存储、AI 视觉/音频/视频处理、工具注册。代码在 `src/*.ts`，编译为 `lib/*.js`。
- **客户端（client）**：浏览器端 UI—文件拖拽/粘贴上传、输入框挂件、消息气泡渲染。代码在 `src/client/*.tsx`，由 `tsdown` 打包为 `lib/client.js`。

插件通过 Cordis 协议注册：

```
src/index.ts (apply) → 注册服务、工具、系统提示
src/client/index.ts (apply) → 注册 slot、事件、RPC 调用
```

## 目录结构

```
dsh-looklook/
├── src/                    # 宿主源码（TypeScript）
│   ├── index.ts            # 插件入口，注册 host 服务与工具
│   ├── see-tool.ts         # 「looklook_see」工具（图片/视频/zip/文档）
│   ├── upload.ts           # 文件上传存储（saveUpload）
│   ├── remote.ts           # RPC 服务（同步设置、环境检查、模态查询）
│   ├── looklook-skill.ts   # 注入给模型的系统提示词
│   ├── doc-tool.ts         # 文档解析（PDF/Word/Excel/PPT）
│   ├── video-tool.ts       # 视频分析
│   ├── zip-tool.ts         # ZIP 压缩包操作
│   ├── describe-tool.ts    # 图片描述
│   ├── vision-client.ts    # 视觉 API 客户（本地/远程）
│   ├── translate.ts        # 翻译工具
│   ├── settings.ts         # 配置定义
│   ├── types.ts / ref.ts   # 类型定义与引用编码
│   ├── ffmpeg.ts           # ffmpeg 封装
│   ├── python-env.ts       # Python 环境检查
│   ├── asr-install.ts / env-check.ts  # 安装与环境
│   └── parser/             # PDF 解析 worker
│
├── src/client/             # 客户端源码（React + TypeScript）
│   ├── index.ts            # 客户端入口，注册 slot 与事件
│   ├── pending-files.ts    # 待上传文件的状态管理
│   ├── upload-shared.ts    # 上传逻辑（fileToBase64 + uploadFile RPC）
│   ├── FileChips.tsx       # 输入框中的文件挂件
│   ├── FileTypeIcon.tsx    # 文件类型图标
│   ├── UserMessageNodeView.tsx  # 定稿消息气泡渲染（缩略图卡片）
│   ├── VisionToggle.tsx    # 视觉开关
│   ├── VisionSettings.tsx  # 视觉设置面板
│   ├── Features.tsx        # 功能管理
│   ├── EnvCheck.tsx / PluginTab.tsx / ProviderListEditor.tsx
│   ├── eye-controller.ts   # 眼睛开关控制
│   ├── feature-controller.ts
│   ├── format.ts           # 格式化工具
│   ├── locales.ts          # 多语言
│   └── settings-view.ts    # 设置界面
│
├── lib/                    # 编译产物（不直接修改，由 build 生成）
│   ├── client.js           # 客户端 bundle（tsdown 打包）
│   ├── client.js.map
│   ├── *.js / *.d.ts       # 宿主编译产物
│   └── types/              # 类型声明
│
├── skills/looklook/SKILL.md  # 注入给模型的技能提示
├── scripts/                # 构建辅助脚本
├── tests/                  # 验证脚本
├── CHANGELOG.md
├── CONTRIBUTING.md         # 本文件
├── README.md               # 用户文档
├── package.json
├── tsconfig.json           # 宿主 TypeScript 配置
├── tsconfig.client.json    # 客户端 TypeScript 配置
├── tsdown.config.ts        # 客户端 bundle 打包配置
└── cordis.patch.yml        # 补丁配置（仅用于旧版 dsh-looklook-src）
```

## 开发环境搭建

### 前置条件

- Node.js ≥ 20
- pnpm
- DSH rc.6+ 已安装（`npm install -g @deepseek-ai/dsh`）

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/ideasir/dsh-looklook.git
cd dsh-looklook

# 安装依赖
pnpm install

# 构建
npm run build

# 安装到 DSH 的 web profile
dsh plugin --profile web add github:ideasir/dsh-looklook
```

> 热重载：修改 `src/client/*` 后执行 `npm run build` 并刷新浏览器；修改 `src/*.ts` 后需要重启 `dsh web`。

### 安装目录直接修改（快速调试）

```bash
# 构建产物后，手动同步到安装目录
cp lib/client.js /root/.dsh/profiles/web/node_modules/dsh-looklook/lib/
cp lib/index.js /root/.dsh/profiles/web/node_modules/dsh-looklook/lib/
# 然后在浏览器 CTRL+SHIFT+R 刷新（客户端）或重启 dsh web（宿主）
```

## 构建与验证

```bash
# 完整构建
npm run build
# 等价于：
#   tsc -p tsconfig.json          → 编译宿主 src/ → lib/
#   tsc -p tsconfig.client.json   → 客户端类型声明
#   tsdown                        → 打包 client bundle → lib/client.js
#   node scripts/copy-worker.mjs  → 复制 PDF worker

# 仅类型检查
npm run typecheck

# 运行验证脚本
npm run verify
```

## 核心流程

### 文件上传通道

```
用户拖拽/粘贴文件
  → FileChips.tsx (stageUploads)
  → upload-shared.ts (uploadFile) 读取文件为 base64
  → RPC remote.upload
  → 宿主 upload.ts (saveUpload) 保存到 session/.uploads/
  → 返回 { path, name: 唯一文件名 }
  → 客户端 pending-files 状态更新
  → 用户输入文字 + 按 Enter
  → index.ts (ensureSubmitPatched) 合并注记到 draft
  → 提交消息
```

### 消息注记格式

```
v0.2.1 格式（当前）：
  [图片]image_abc123.png 排队中...

v0.2.0 格式（历史）：
  上传了文件：image_abc123.png

v0.1.x 格式（已废弃）：
  【looklook:开始】上传了文件：image.png【looklook:结束】
  【looklook:file】{"name":"image.png","path":"...","size":12345}【looklook:file】
```

### 排队气泡 → 定稿气泡

```
排队中（pendingSteering）：
  显示消息原文：「[图片]image_abc123.png 排队中...」
  → DSH 的 PendingSteeringBubble 渲染，纯文本

定稿后（settled）：
  LooklookUserMessageNodeView 接管渲染
  → CLEAN_NOTE_RE 正则匹配「[图片]xxx 排队中...」
  → 提取文件名 → loadUpload RPC → 显示缩略图卡片
  → 若请求失败，降级为 FileCard（文件图标 + 文件名）
```

### 工具注册

```
looklook_see（见 see-tool.ts）：
  注册为 DSH 工具 → 模型可调用
  接收 source + question 参数
  source 自动解析：裸文件名 → 拼接 session/.uploads/ 路径
  根据文件类型分发到：
    - 图片 → describeImageFile（视觉 API）
    - 视频 → watchVideo（ffmpeg + 视觉 API）
    - ZIP → listZip（内置 ZIP 解析）
    - 文档 → parseDocument（PDF/Word/Excel/PPT）
    - URL → 直接下载分析
```

## 文件命名规则

上传到 `session/.uploads/` 的文件使用**唯一文件名**：

```
原始名：image.png
保存为：image_{timestamp}.png
  timestamp = Date.now().toString(36)  // 6-7 字符
```

避免同名文件互相覆盖。消息注记中显示的是唯一名，模型通过 `looklook_see("唯一名")` 直接定位。

## 发布流程

```bash
# 1. 更新版本号
vim package.json  # version: 0.2.x

# 2. 更新 CHANGELOG.md

# 3. 构建 + 验证
npm run build
npm run verify

# 4. 提交并推送
git add -A
git commit -m "feat: 说明"
git push origin main

# 5. 用户安装
dsh plugin --profile web add github:ideasir/dsh-looklook
```

## 测试

```bash
npm run verify
# 依次运行：
#   verify-translate.mjs    - 翻译工具输出格式
#   verify-tool-arch.mjs    - 工具注册架构
#   verify-lightbox.mjs     - 灯箱组件
#   verify-thumb.mjs        - 缩略图渲染
#   verify-upload-list.mjs  - 上传列表
#   verify-bubble.mjs       - 消息气泡
#   verify-doc-parser.mjs   - 文档解析
#   verify-integration.mjs  - 集成测试
```

## 注意事项

- **宿主编译产物（lib/*.js）与客户端 bundle（lib/client.js）都必须提交**，因为 `dsh plugin add github:...` 直接从仓库拉取 `lib/` 文件，不执行构建。
- 任何时候修改 `src/client/` 后必须执行 `npm run build`（或 `tsdown`）确保 `lib/client.js` 同步。
- `src/client/upload-shared.ts` 中的 `uploadFile` 函数返回 `name: business.name ?? file.name`。服务端 `saveUpload` 生成唯一文件名，客户端必须使用该唯一名，否则消息注记中的文件名无法映射到磁盘文件。
- `FileTypeIcon.tsx` 等组件使用 CSS 变量（`var(--dsw-*)`）保证深浅色主题兼容，不要硬编码颜色值。
- `CLEAN_NOTE_RE` 与 `fileNote` 的格式必须同步——前者解析后者生产的文本。修改任一格式时必须同步修改另一处。