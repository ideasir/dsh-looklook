/**
 * Type-level extension points for dsh-looklook.
 *
 * The `prompt/image-admission` and `agent/request-messages` events are the
 * harness extension points this plugin answers (added upstream in
 * deepseek-harness; these local declarations keep the plugin compiling and
 * running against rc.6 releases either way — they merge with the upstream
 * declarations when both exist).
 */

import type { Agent } from '@deepseek-ai/dsh-agent'
import type { GenerateOptions, ModelModality } from '@deepseek-ai/dsh-llm'
import type { Scoped } from '@deepseek-ai/dsh-scope'
import type { SessionId } from '@deepseek-ai/dsh-session'

export type { SessionId }

/** One image-admission interrogation (mirrors the gateway payload). */
export interface ImageAdmissionPayload {
  sessionId: SessionId
  provider: string
  model: string
  inputModalities: readonly ModelModality[] | undefined
  hasImage: boolean
}

/** One image-admission decision. */
export type ImageAdmissionDecision = 'allow' | { deny: string }

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Image-admission decision point dispatched by the gateway before a
     * session admits image content. This plugin answers `'allow'` so images
     * reach the session log regardless of the selected model's declared
     * modalities; translation happens later at `agent/request-messages`.
     * @mode bail
     */
    'prompt/image-admission'(
      this: Context,
      payload: ImageAdmissionPayload,
    ): ImageAdmissionDecision | undefined
    /**
     * Rewrite the assembled model request immediately before dispatch. This
     * plugin replaces image blocks with vision text (or the placeholder)
     * here, so a text-only model never receives raw image bytes.
     * @mode waterfall
     */
    'agent/request-messages'(
      this: Scoped<Agent>,
      payload: { agent: Agent; turn: number; step: number; signal: AbortSignal },
      request: GenerateOptions,
      next: () => Promise<GenerateOptions>,
    ): Promise<GenerateOptions>
  }
}

/** Stable machine codes for vision-model failures, mapped to user copy by the caller. */
export type VisionErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'invalid-request'
  | 'model-not-found'
  | 'rate-limited'
  | 'timeout'
  | 'network'
  | 'unconfigured'

/** One `vision/describe` log record: what the model actually saw for one image. */
export interface VisionDescribeEvent {
  /** The attachment this record describes. */
  attachmentId: string
  /** Vision provider that produced the record. */
  provider: string
  /** Vision model id that produced the record. */
  model: string
  /** Whether the vision call succeeded. */
  ok: boolean
  /** Machine error code; present only when `ok` is false. */
  error?: { code: VisionErrorCode }
  /** The text the conversation model received (description or error copy). */
  text?: string
  /** The primary provider that failed when a fallback produced the record. */
  degradedFrom?: string
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Log-only record of one vision translation. `ignorable` lets builds that
     * do not know this event type skip it instead of refusing the log; a
     * replay that understands it can reconstruct the exact model-visible text
     * for the image.
     */
    'vision/describe': VisionDescribeEvent
  }
}
