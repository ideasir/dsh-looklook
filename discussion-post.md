### 🎉 Look Look 插件 — 给 DSH 装上「眼睛」

大家好，我做了一个 DSH 插件叫 **Look Look**（撸货），让 AI 能"看见"你发的文件。

---

#### 能做什么？

把文件直接拖进聊天框，AI 就能理解和分析：

| 文件类型 | 能力 |
|---------|------|
| 📷 图片 | 描述内容、分析设计稿、回答图片相关问题 |
| 🎬 视频 | 识别画面内容、回答视频相关问题 |
| 🎵 音频 | 转录语音、理解录音内容 |
| 📄 PDF | 本地解析，直接理解文档 |
| 📝 Word/Excel/PPT | 本地解析 Office 文件 |
| 🎨 PSD | 自动提取合成图预览 |
| 📦 ZIP | 解压后内部文件一并理解 |

---

#### 插件设置页

安装后，在 DSH 设置 → Plugins 中可以看到 Look Look：

![插件列表](https://github.com/ideasir/dsh-looklook/raw/main/screenshots/02-plugins-list.png)

点击展开后，可以配置视觉模型、音频模型、一键检测能力：

![Look Look 详情](https://github.com/ideasir/dsh-looklook/raw/main/screenshots/03-looklook.png)

> 💡 小眼睛开关打开时，图片走模型的视觉能力；关闭时走文件上传通道（如 OpenAI file API）。
> PDF/Office/PSD/ZIP 都在本地解析，不上传网络。

---

#### 聊天界面

![DSH 主界面](https://github.com/ideasir/dsh-looklook/raw/main/screenshots/01-home.png)

---

#### 怎么安装？

```bash
cd your-dsh-profile/web
npm install dsh-looklook
```

装完重启 DSH 就行。在设置页 Plugins 中找到 Look Look，配置视觉模型和音频模型即可使用。

---

#### 依赖

- `pdf-parse` — PDF 解析（npm 安装时自动装）
- `mime-types` — 文件类型识别
- 其他全靠 DSH 自身的 Files API，零额外依赖

---

#### 最新版本 `0821-rc.8`

- 新增 ChatMinimap — 对话导航标尺，快速跳转
- 新增复制会话 ID 按钮
- 修复文件上传时间戳命名
- 优化图标（Lucide + Tabler 标准风格）
- 代码审计：合并冗余文件，清理构建产物

---

**GitHub**: https://github.com/ideasir/dsh-looklook  
有问题欢迎在 Issues 或本讨论区回复。