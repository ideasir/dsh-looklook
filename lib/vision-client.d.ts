/**
 * OpenAI-compatible vision client: one chat-completions call per describe
 * request, primary-then-fallback provider failover, classified errors, and
 * credential-safe transport (redirects are rejected, never followed).
 */
import type { ImageMediaType } from '@deepseek-ai/dsh-attachment';
import type { VisionProviderConfig } from './settings.ts';
import type { VisionErrorCode } from './types.ts';
/** One image to describe, as raw bytes the vision endpoint can read. */
export interface DescribeImageInput {
    mediaType: ImageMediaType;
    data: Uint8Array;
}
/** A successful recognition result. */
export interface DescribeSuccess {
    ok: true;
    text: string;
    provider: string;
    model: string;
    /** The primary provider that failed when a fallback produced this result. */
    degradedFrom?: string;
}
/** A classified failure after every enabled provider was tried. */
export interface DescribeFailure {
    ok: false;
    code: VisionErrorCode;
    /** The human-readable Chinese reason for the last failure. */
    message: string;
    provider: string;
    model: string;
}
export type DescribeResult = DescribeSuccess | DescribeFailure;
/**
 * Resolve a provider's base URL to the chat-completions endpoint.
 * Accepts either a full endpoint (`.../chat/completions`) or a base URL.
 */
export declare function chatCompletionsUrl(baseURL: string): string;
/** Map a classified code to the canonical Chinese user copy. */
export declare function statusMessage(code: VisionErrorCode, model: string): string;
/**
 * Describe the given images with the first healthy enabled provider; a
 * provider failure fails over to the next. Returns the first success, or a
 * classified failure after every provider was tried.
 */
export declare function describeImages(providers: readonly VisionProviderConfig[], resolveApiKey: (ref: string) => Promise<string | undefined>, images: readonly DescribeImageInput[], maxDescribeChars: number, signal: AbortSignal): Promise<DescribeResult>;
