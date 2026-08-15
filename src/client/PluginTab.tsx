/**
 * LooklookPluginCard: the looklook configuration card inside the Plugins
 * settings section's "插件配置" tab (`settings.plugin.item`). One card =
 * one plugin setting:
 * - the master switches (多模态 / ZIP) and the 7z install support;
 * - the vision-model configuration, visible while 多模态 is ON.
 */

import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { FeatureController } from './feature-controller.ts'
import { LooklookFeaturesSection, type FeaturesInjected } from './Features.tsx'
import { VisionSettingsSection, type VisionSettingsInjected } from './VisionSettings.tsx'

/** Injected face supplied by the plugin apply closure. */
export interface LooklookCardInjected {
  /** The wire API client. */
  api: IApiClient
  /** Bound translate for the `looklook` namespace. */
  t: TranslateNS<'looklook'>
  /** Feature controller (multimodal / zip toggles). */
  features: FeatureController
  /** Probe one provider's `/models` endpoint through the host RPC. */
  listModels: VisionSettingsInjected['listModels']
  /** Reactive snapshot of the `multimodal` master switch. */
  useMultimodal: () => boolean
}

/** The plugin-configuration card body. */
export function LooklookPluginCard(props: LooklookCardInjected) {
  const { api, t, features, listModels, useMultimodal } = props
  const featuresProps: FeaturesInjected = { api, t, features }
  const visionProps: VisionSettingsInjected = { api, t, listModels, useMultimodal }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 720 }}>
      <LooklookFeaturesSection {...featuresProps} />
      <VisionSettingsSection {...visionProps} />
    </div>
  )
}
