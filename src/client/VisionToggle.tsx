/**
 * VisionToggle: the per-session eye toggle in the composer tool row
 * (`conversation.input.left`). On = vision assist translates images for
 * text-only models; off = the plugin is inert. Shows an amber warning when
 * the eye is on but no vision provider is configured.
 */

import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { EyeController } from './eye-controller.ts'

/** Injected face supplied by the plugin apply closure. */
export interface VisionToggleInjected {
  /** Per-session eye controller (store + load + toggle). */
  controller: EyeController
  /** Snapshot selector bound to the controller store. */
  useSnapshot: (selector: (state: EyeController['store']['getSnapshot'] extends () => infer S ? S : never) => unknown) => unknown
  /** Bound translate for the `looklook` namespace. */
  t: TranslateNS<'looklook'>
  /** Reactive plugin master switch (false hides the eye entirely). */
  usePluginEnabled: () => boolean
}

/** The active/inactive/warning rendering states. */
export type EyeVisualState = 'on' | 'off' | 'unconfigured'

/** Decide the visual state from one store snapshot. */
export function eyeVisualState(
  status: 'loading' | 'ready',
  eye: 'on' | 'off',
  unconfigured: boolean,
): EyeVisualState {
  if (status !== 'ready') return eye === 'off' ? 'off' : 'on'
  if (eye === 'off') return 'off'
  return unconfigured ? 'unconfigured' : 'on'
}

/** One eye glyph (Lucide Eye / EyeOff style). */
function EyeGlyph({ off, warning }: { off: boolean; warning: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" fill={warning ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {off && <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  )
}

/** Render the eye toggle button. */
export function VisionToggle(
  props: VisionToggleInjected,
) {
  const { controller, useSnapshot, usePluginEnabled, t } = props
  // Both hooks run on every render so the hook order stays stable.
  const pluginEnabled = usePluginEnabled()
  const state = useSnapshot((s: { status: string; eye?: 'on' | 'off'; unconfigured?: boolean }) => s) as
    { status: 'loading' | 'ready'; eye: 'on' | 'off'; unconfigured: boolean }
  if (!pluginEnabled) return null
  const eye = state.status === 'ready' ? state.eye : 'on'
  const unconfigured = state.status === 'ready' && state.unconfigured === true
  const visual = eyeVisualState(state.status, eye, unconfigured)
  const label = visual === 'unconfigured'
    ? t('eye.unconfigured')
    : visual === 'on'
      ? t('eye.on')
      : t('eye.off')
  const active = visual !== 'off'

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      data-looklook-eye={visual}
      onClick={() => controller.toggle(eye === 'on' ? 'off' : 'on')}
      style={{
        display: 'grid',
        placeItems: 'center',
        flex: 'none',
        width: 28,
        height: 28,
        border: 'none',
        borderRadius: 999,
        background: 'transparent',
        cursor: 'pointer',
        color: active
          ? visual === 'unconfigured'
            ? 'var(--dsw-alias-state-warn-primary)'
            : 'var(--dsw-alias-brand-primary)'
          : 'var(--dsw-alias-label-tertiary)',
      }}
    >
      <EyeGlyph off={visual === 'off'} warning={visual === 'unconfigured'} />
    </button>
  )
}
