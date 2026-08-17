/**
 * EnvCheckDialog — the "环境检测" modal opened from the looklook plugin card.
 * Runs the host environment self-check (Python / ffmpeg / yt-dlp / local ASR)
 * and lists every item with status. Repairable items show a "一键修复" button
 * that calls the host repair RPC and refreshes that item's state.
 */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { EnvCheckItem, EnvCheckReport } from './upload-shared.ts';
/** Injected face supplied by the plugin card. */
export interface EnvCheckInjected {
    t: TranslateNS<'looklook'>;
    envCheck: () => Promise<EnvCheckReport>;
    envRepair: (action: 'install-yt-dlp' | 'install-asr') => Promise<EnvCheckItem>;
}
/** The environment-check modal. */
export declare function EnvCheckDialog(props: EnvCheckInjected & {
    onClose: () => void;
}): import("react").JSX.Element;
