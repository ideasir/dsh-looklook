/**
 * dsh-looklook/capability-check — 功能能力自检。
 *
 * 检测每种识别能力是否完整可用，返回每项的状态和失败原因。
 * 与 env-check.ts（运行环境检测）互补：
 * - env-check 检查 代理/ffmpeg/Python/yt-dlp 等运行依赖
 * - capability-check 检查 图像/视频/声音/PSD/Office/视频平台 等识别能力
 */

import { runEnvCheck } from './env-check.ts'

/** 功能检测结果项。 */
export interface CapabilityItem {
  /** Stable id。 */
  id: string
  /** 显示名称。 */
  label: string
  /** 成功/失败。 */
  status: 'ok' | 'fail'
  /** 失败时的详细原因（成功时可为空字符串）。 */
  errorReason: string
}

/** 功能检测结果。 */
export interface CapabilityReport {
  ok: boolean
  items: CapabilityItem[]
}

/** 检查 PSD 解析库是否可加载。 */
async function checkPsdParser(): Promise<CapabilityItem> {
  try {
    const { parsePsd } = await import('./parser/psd.ts')
    // 确认函数存在
    if (typeof parsePsd !== 'function') {
      return { id: 'psd', label: '识别 PSD 检测', status: 'fail', errorReason: 'PSD 解析函数不存在' }
    }
    return { id: 'psd', label: '识别 PSD 检测', status: 'ok', errorReason: 'PSD 解析库已就绪，可解析 Photoshop 文档' }
  } catch (err) {
    return { id: 'psd', label: '识别 PSD 检测', status: 'fail', errorReason: `PSD 解析库加载失败：${err instanceof Error ? err.message : String(err)}` }
  }
}

/** 检查 Office 解析库是否可加载。 */
async function checkOfficeParser(): Promise<CapabilityItem> {
  try {
    const { readDocument } = await import('./parser/index.ts')
    if (typeof readDocument !== 'function') {
      return { id: 'office', label: '识别 Office 检测', status: 'fail', errorReason: 'Office 解析函数不存在' }
    }
    return { id: 'office', label: '识别 Office 检测', status: 'ok', errorReason: 'Office 文档解析库已就绪，支持 .docx/.xlsx/.pptx 格式' }
  } catch (err) {
    return { id: 'office', label: '识别 Office 检测', status: 'fail', errorReason: `Office 解析库加载失败：${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * 运行完整功能检测。
 * @param hasVisionModel - 视觉模型是否已配置（>0 个 enabled provider）
 * @param hasAudioModel - 音频模型是否已配置（>0 个 enabled provider）
 */
export async function runCapabilityCheck(
  hasVisionModel: boolean,
  hasAudioModel: boolean,
): Promise<CapabilityReport> {
  // 先跑环境检测获取 ffmpeg/yt-dlp 状态
  const envReport = await runEnvCheck()
  const ffmpegItem = envReport.items.find(i => i.id === 'ffmpeg')
  const ytDlpItem = envReport.items.find(i => i.id === 'yt-dlp')
  const ffmpegOk = ffmpegItem?.status === 'ok'
  const ytDlpOk = ytDlpItem?.status === 'ok'

  const items: CapabilityItem[] = [
    // 1. 识别图像
    hasVisionModel
      ? { id: 'image', label: '识别图像检测', status: 'ok', errorReason: '已配置视觉模型，可识别图片内容' }
      : { id: 'image', label: '识别图像检测', status: 'fail', errorReason: '未配置视觉模型，请先在「视觉模型」中添加 AI 视觉服务提供商' },

    // 2. 识别视频
    !hasVisionModel
      ? { id: 'video', label: '识别视频检测', status: 'fail', errorReason: '未配置视觉模型，视频帧识别需要视觉模型配合' }
      : !ffmpegOk
        ? { id: 'video', label: '识别视频检测', status: 'fail', errorReason: '缺少 ffmpeg（视频抽帧/音频采样），请安装 ffmpeg 后重启 DSH' }
        : { id: 'video', label: '识别视频检测', status: 'ok', errorReason: '视频识别链路完整（视觉模型 + ffmpeg 抽帧）' },

    // 3. 识别声音
    !ffmpegOk
      ? { id: 'audio', label: '识别声音检测', status: 'fail', errorReason: '缺少 ffmpeg（音频采样），请安装 ffmpeg 后重启 DSH' }
      : !hasAudioModel && !false
        ? { id: 'audio', label: '识别声音检测', status: 'fail', errorReason: '未配置音频模型，请在插件设置中添加音频模型提供商' }
        : { id: 'audio', label: '识别声音检测', status: 'ok', errorReason: '音频识别链路完整（ffmpeg + 音频模型）' },

    // 4. 识别 PSD
    await checkPsdParser(),

    // 5. 识别 Office
    await checkOfficeParser(),

    // 6. 支持视频平台
    ytDlpOk
      ? { id: 'platform', label: '视频平台链接解析', status: 'ok', errorReason: 'yt-dlp 已就绪，支持抖音 / B 站 / YouTube 等视频平台链接解析' }
      : { id: 'platform', label: '视频平台链接解析', status: 'fail', errorReason: 'yt-dlp 未安装，视频平台链接无法解析，请点击「环境检测」一键安装 yt-dlp' },
  ]

  return {
    ok: items.every(i => i.status === 'ok'),
    items,
  }
}