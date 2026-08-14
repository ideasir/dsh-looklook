/**
 * VisionToggle: the per-session eye toggle in the composer tool row
 * (`conversation.input.left`). On = vision assist translates images for
 * text-only models; off = the plugin is inert. Shows an amber warning when
 * the eye is on but no vision provider is configured.
 */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { EyeController } from './eye-controller.ts';
/** Injected face supplied by the plugin apply closure. */
export interface VisionToggleInjected {
    /** Per-session eye controller (store + load + toggle). */
    controller: EyeController;
    /** Snapshot selector bound to the controller store. */
    useSnapshot: <T>(selector: (state: EyeController['store']['getSnapshot'] extends () => infer S ? S : never) => unknown) => unknown;
    /** Bound translate for the `looklook` namespace. */
    t: TranslateNS<'looklook'>;
}
/** The active/inactive/warning rendering states. */
export type EyeVisualState = 'on' | 'off' | 'unconfigured';
/** Decide the visual state from one store snapshot. */
export declare function eyeVisualState(status: 'loading' | 'ready', eye: 'on' | 'off', unconfigured: boolean): EyeVisualState;
/** Render the eye toggle button. */
export declare function VisionToggle(props: VisionToggleInjected): import("react").JSX.Element;
