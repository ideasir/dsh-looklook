/**
 * ProviderListEditor — a reusable provider-list editor (primary + fallbacks,
 * failover order) for one settings namespace. Used by the looklook card for
 * both the vision model list and the audio model list.
 *
 * Edits are draft-local until Save, which writes credentials (per-provider
 * API key) and the namespace's `providers` in one commit. Model discovery
 * (fetch /models) is optional and provided by the caller.
 */

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import {
  Button, StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  IconChevronDownOutline14, IconChevronUpOutline14,
  IconEditOutline16, IconPlusOutline16, IconTrashOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { namespaceValueOf } from './settings-view.ts'

/** One provider under local edit. */
export interface ProviderDraft {
  id: string
  name: string
  baseURL: string
  model: string
  enabled: boolean
  /** Fresh API key being entered; undefined keeps the stored credential. */
  apiKey?: string
}

/** Derive a credential reference for one provider id. */
export function credentialRefFor(id: string): string {
  const safe = id.toUpperCase().replace(/[^A-Z0-9]/g, '_')
  return `LOOKLOOK_${safe}_API_KEY`
}

/** Injected face for one provider-list editor. */
export interface ProviderListEditorProps {
  /** The wire API client. */
  api: IApiClient
  /** Bound translate for the `looklook` namespace. */
  t: TranslateNS<'looklook'>
  /** Settings namespace to read/write (e.g. 'vision', 'looklook-audio'). */
  ns: string
  /** Section title (e.g. "视觉模型" / "音频模型"). */
  title: string
  /** Intro copy under the title. */
  intro: string
  /** Optional /models probe; absent = the fetch button is hidden. */
  listModels?: (provider: { baseURL: string; apiKeyEnv: string }) => Promise<
    { ok: true; models: string[] } | { ok: false; error: string }
  >
}

/** The namespace value as read through the wire. */
interface NamespaceView {
  providers?: ProviderDraft[]
}

function newProviderId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

const layout = {
  section: { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720, color: 'var(--dsw-alias-label-primary)' },
  title: { margin: 0, fontSize: 16, lineHeight: '24px', fontWeight: 500, color: 'var(--dsw-alias-label-primary)' },
  intro: { margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--dsw-alias-label-tertiary)' },
  hint: { margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' },
  saved: { margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-state-success-primary)' },
  error: { margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-state-warn-label)' },
  card: {
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 12,
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  rowHead: { display: 'flex', alignItems: 'center', gap: 10 },
  rowIdentity: { display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 },
  rowName: { fontSize: 14, lineHeight: '22px', fontWeight: 500, color: 'var(--dsw-alias-label-primary)' },
  rowTag: {
    flex: 'none',
    padding: '1px 6px',
    border: '1px solid var(--dsw-alias-border-l3)',
    borderRadius: 4,
    fontSize: 11,
    lineHeight: '16px',
    color: 'var(--dsw-alias-label-secondary)',
  },
  rowMeta: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' },
  rowActions: { display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  editor: {
    borderRadius: 12,
    background: 'var(--dsw-alias-bg-module-platform)',
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  fieldLabel: {
    display: 'inline-flex', alignItems: 'center', gap: 10,
    fontSize: 12, lineHeight: '18px', fontWeight: 500,
    color: 'var(--dsw-alias-label-secondary)',
  },
  footer: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 },
  input: {
    boxSizing: 'border-box',
    width: '100%',
    height: 32,
    padding: '0 10px',
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 8,
    font: 'inherit',
    fontSize: 14,
    lineHeight: '22px',
    background: 'var(--dsw-alias-bg-layer-1)',
    color: 'var(--dsw-alias-label-primary)',
  },
} as const

/**
 * The full provider-list editor. Every state hook lives here; the caller
 * mounts it once per namespace (visual / audio).
 */
export function ProviderListEditor(props: ProviderListEditorProps) {
  const { api, t, ns, title, intro, listModels } = props
  const [providers, setProviders] = useState<ProviderDraft[]>([])
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'saved' | 'error'; text: string } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addDraft, setAddDraft] = useState<ProviderDraft | null>(null)
  const [fetching, setFetching] = useState<string | null>(null)
  const [fetchedModels, setFetchedModels] = useState<Record<string, string[]>>({})
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [keyStates, setKeyStates] = useState<Record<string, boolean>>({})

  useEffect(() => {
    void (async () => {
      const response = await api.settings.describe({})
      if (response.result.ok) {
        const value = namespaceValueOf(response.result.value.namespaces, ns) as NamespaceView | undefined
        const loaded = Array.isArray(value?.providers) ? value.providers : []
        setProviders(loaded)
        const refs = loaded.map(provider => credentialRefFor(provider.id))
        if (refs.length > 0) {
          const cred = await api.credentials.describe({ refs })
          if (cred.result.ok) {
            const next: Record<string, boolean> = {}
            for (const provider of loaded) {
              next[provider.id] = cred.result.value.credentials[credentialRefFor(provider.id)]?.configured === true
            }
            setKeyStates(next)
          }
        }
      }
      setLoaded(true)
    })()
  }, [api, ns])

  const primaryId = useMemo(() => providers.find(provider => provider.enabled)?.id, [providers])
  const editing = editingId === null ? undefined : providers.find(provider => provider.id === editingId)

  const patch = (id: string, next: Partial<ProviderDraft>): void => {
    setProviders(current => current.map(provider => (
      provider.id === id ? { ...provider, ...next } : provider
    )))
  }

  const move = (id: string, offset: -1 | 1): void => {
    setProviders(current => {
      const index = current.findIndex(provider => provider.id === id)
      const target = index + offset
      if (index < 0 || target < 0 || target >= current.length) return current
      const next = [...current]
      const [item] = next.splice(index, 1)
      if (item === undefined) return current
      next.splice(target, 0, item)
      return next
    })
  }

  const remove = (id: string): void => {
    setProviders(current => current.filter(provider => provider.id !== id))
    if (editingId === id) setEditingId(null)
  }

  const closeEditor = (): void => {
    setEditingId(null)
    setAddDraft(null)
    setFetchError(null)
  }

  const fetchModels = async (draft: ProviderDraft): Promise<void> => {
    if (listModels === undefined) return
    setFetchError(null)
    setFetching(draft.id)
    try {
      if (typeof draft.baseURL !== 'string' || draft.baseURL.trim() === '') {
        setFetchError(t('settings.provider.baseURLRequired'))
        return
      }
      const result = await listModels({
        baseURL: draft.baseURL,
        apiKeyEnv: credentialRefFor(draft.id),
      })
      if (result.ok) {
        setFetchedModels(current => ({ ...current, [draft.id]: result.models }))
      } else {
        const rawError: unknown = result.error
        const message = typeof rawError === 'string'
          ? rawError
          : rawError !== null && typeof rawError === 'object' && 'message' in rawError
            ? String((rawError as { message: unknown }).message)
            : JSON.stringify(rawError)
        setFetchError(message)
      }
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : String(error))
    } finally {
      setFetching(null)
    }
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    setNotice(null)
    try {
      const nextProviders = addDraft === null ? providers : [...providers, addDraft]
      const freshKeys = nextProviders.filter(provider => provider.apiKey !== undefined && provider.apiKey.length > 0)
      for (const provider of freshKeys) {
        const stored = await api.credentials.set({ ref: credentialRefFor(provider.id), value: provider.apiKey ?? '' })
        if (!stored.result.ok) throw new Error(stored.result.error.message)
      }
      const update = await api.settings.update({
        ns,
        patch: {
          providers: nextProviders.map(({ id, name, baseURL, model, enabled }) => ({
            id, name, baseURL, model, enabled,
            apiKeyEnv: credentialRefFor(id),
          })),
        },
      })
      if (!update.result.ok) throw new Error(update.result.error.message)
      setProviders(nextProviders.map(provider => ({
        id: provider.id,
        name: provider.name,
        baseURL: provider.baseURL,
        model: provider.model,
        enabled: provider.enabled,
      })))
      if (freshKeys.length > 0) {
        setKeyStates(current => {
          const next = { ...current }
          for (const provider of freshKeys) next[provider.id] = true
          return next
        })
      }
      setNotice({ kind: 'saved', text: t('settings.saved') })
      closeEditor()
    } catch (error) {
      setNotice({
        kind: 'error',
        text: `${t('settings.saveFailed')}：${error instanceof Error ? error.message : String(error)}`,
      })
    } finally {
      setSaving(false)
    }
  }

  const renderEditor = (
    draft: ProviderDraft,
    onPatch: (next: Partial<ProviderDraft>) => void,
  ): ReactNode => (
    <div style={layout.editor}>
      <div style={layout.field}>
        <label style={layout.fieldLabel}>{t('settings.provider.name')}</label>
        <input
          style={layout.input}
          value={draft.name} placeholder={t('settings.provider.nameHint')}
          onChange={event => onPatch({ name: event.target.value })}
        />
      </div>
      <div style={layout.field}>
        <label style={layout.fieldLabel}>{t('settings.provider.baseURL')}</label>
        <input
          style={layout.input}
          value={draft.baseURL} placeholder={t('settings.provider.baseURLHint')}
          onChange={event => onPatch({ baseURL: event.target.value })}
        />
      </div>
      <div style={layout.field}>
        <label style={layout.fieldLabel}>{t('settings.provider.model')}</label>
        <input
          style={layout.input}
          list={`looklook-models-${draft.id}`}
          value={draft.model} placeholder={t('settings.provider.modelHint')}
          onChange={event => onPatch({ model: event.target.value })}
        />
        <datalist id={`looklook-models-${draft.id}`}>
          {(fetchedModels[draft.id] ?? []).map(model => (
            <option key={model} value={model} />
          ))}
        </datalist>
        {(fetchedModels[draft.id] ?? []).length > 0 && (
          <span style={layout.hint}>{t('settings.provider.modelsFetched')}</span>
        )}
        {listModels !== undefined && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              variant="outline" size="sm"
              disabled={fetching === draft.id}
              onClick={() => void fetchModels(draft)}
            >
              {fetching === draft.id ? '…' : t('settings.provider.fetchModels')}
            </Button>
            {fetchError !== null && <span style={layout.error}>{fetchError}</span>}
          </div>
        )}
      </div>
      <div style={layout.field}>
        <label style={layout.fieldLabel}>{t('settings.provider.apiKey')}</label>
        <input
          style={layout.input}
          type="password" autoComplete="off"
          value={draft.apiKey ?? ''}
          placeholder={keyStates[draft.id] ? t('settings.provider.apiKeyConfigured') : t('settings.provider.apiKeyUnset')}
          onChange={event => onPatch({ apiKey: event.target.value })}
        />
      </div>
      <div style={layout.field}>
        <label style={{ ...layout.fieldLabel, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={event => onPatch({ enabled: event.target.checked })}
          />
          {t('settings.provider.enabled')}
        </label>
      </div>
    </div>
  )

  return (
    <div style={layout.section}>
      <h2 style={layout.title}>{title}</h2>
      <p style={layout.intro}>{intro}</p>

      {loaded && providers.length === 0 && (
        <p style={layout.hint}>{t('settings.provider.empty')}</p>
      )}

      {providers.map(provider => (
        <div
          key={provider.id}
          style={{ ...layout.card, cursor: 'pointer' }}
          role="button"
          tabIndex={0}
          onClick={() => setEditingId(provider.id)}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setEditingId(provider.id)
            }
          }}
        >
          <div style={layout.rowHead}>
            <span style={layout.rowIdentity}>
              <span style={layout.rowName}>{provider.name || provider.id}</span>
              {provider.id === primaryId
                ? <span style={layout.rowTag}>{t('settings.provider.primary')}</span>
                : <span style={layout.rowTag}>{t('settings.provider.fallback')}</span>}
            </span>
            <span style={{ ...layout.rowActions, cursor: 'default' }} onClick={event => event.stopPropagation()}>
              <StateDot state={keyStates[provider.id] ? 'done' : 'warning'} />
              <Button
                variant="ghost" size="sm" aria-label={t('settings.provider.moveUp')}
                disabled={provider.id === providers[0]?.id}
                onClick={() => move(provider.id, -1)}
              >
                <IconChevronUpOutline14 />
              </Button>
              <Button
                variant="ghost" size="sm" aria-label={t('settings.provider.moveDown')}
                disabled={provider.id === providers[providers.length - 1]?.id}
                onClick={() => move(provider.id, 1)}
              >
                <IconChevronDownOutline14 />
              </Button>
              <Button
                variant="ghost" size="sm" aria-label={t('settings.provider.name')}
                onClick={() => setEditingId(provider.id)}
              >
                <IconEditOutline16 />
              </Button>
              <Button
                variant="ghost" size="sm" aria-label={t('settings.provider.remove')}
                onClick={() => remove(provider.id)}
              >
                <IconTrashOutline16 />
              </Button>
            </span>
          </div>
          <span style={layout.rowMeta}>{provider.baseURL} · {provider.model}</span>
          {editingId === provider.id && editing !== undefined
            && renderEditor(editing, next => patch(editing.id, next))}
        </div>
      ))}

      {addDraft !== null
        && renderEditor(addDraft, next => setAddDraft(current => ({ ...current, ...next } as ProviderDraft)))}

      <div style={layout.footer}>
        {addDraft === null && editingId === null ? (
          <Button
            variant="ghost" icon={<IconPlusOutline16 />}
            onClick={() => setAddDraft({ id: newProviderId(), name: '', baseURL: '', model: '', enabled: true })}
          >
            {t('settings.provider.add')}
          </Button>
        ) : (
          <>
            <Button variant="primary" disabled={saving} onClick={() => void save()}>
              {t('settings.save')}
            </Button>
            <Button variant="ghost" disabled={saving} onClick={() => closeEditor()}>
              {t('settings.cancel')}
            </Button>
          </>
        )}
        {notice !== null && (
          <span style={notice.kind === 'saved' ? layout.saved : layout.error}>{notice.text}</span>
        )}
      </div>
    </div>
  )
}
