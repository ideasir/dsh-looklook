/**
 * Type-level extension points for dsh-looklook.
 *
 * The zero-patch architecture registers NO harness events (no image
 * admission, no request rewriting), so no `@deepseek-ai/cordis` Events
 * augmentation lives here anymore.
 */
/** Stable machine codes for vision-model failures, mapped to user copy by the caller. */
export type VisionErrorCode = 'unauthorized' | 'forbidden' | 'invalid-request' | 'model-not-found' | 'rate-limited' | 'timeout' | 'network' | 'unconfigured';
