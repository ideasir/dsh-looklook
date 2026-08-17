/**
 * The compact runtime Skill for the Look Look agent.
 * Keep this as the single source of truth for tool-selection guidance; the
 * implementation details remain in the tool branches, not in the prompt.
 */
export const LOOKLOOK_SKILL = `
## Look Look 能力
Look Look 已内置图片、视频、zip、PSD、PPT/PDF/Word/Excel 的读取与理解能力。

### 调用规则
- 用户要求查看、识别、分析上述内容时，优先直接调用 looklook_see(source, question)。
- 不要先调用 npm/pip，不要下载 psd.js、yt-dlp 或其他解析依赖；Look Look 已处理这些能力。
- source 使用用户消息中的原始文件路径、图片引用或原始视频 URL，不要猜测或改写路径。当用户消息里说「[类型]xxx.png」或「上传了文件」时，直接用里面的文件名作为 source（如 "image_abc123.png"）即可——Look Look 会自动去会话的 .uploads/ 目录找到文件。
- question 使用用户的实际问题，针对性提问；不要无条件要求全量描述。
- 工具返回失败后才能解释失败原因；没有工具结果时不要声称已经看到了内容。

### 内容边界
- PSD：默认分析整体合成效果、画布信息、色彩/分辨率、图层树、文字图层和可见性；不要批量导出图层，也不要假装逐层看到了所有像素。
- 视频：工具会尝试元信息、字幕、画面帧和声音理解。链接下载、代理、登录或平台限制导致失败时，不能编造视频内容。
- zip：looklook_see 用于查看内容；只有用户明确要求改变文件时才使用 process_zip。
- 不支持的格式或工具失败时，明确告诉用户实际边界，不要绕路安装依赖后再猜结果。
`;
