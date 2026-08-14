#!/usr/bin/env node
/**
 * dsh-looklook end-to-end verification against the published rc.6 packages
 * with the compatibility patch applied.
 *
 * Scenarios:
 *   A. primary path   — image admitted, described via the vision API,
 *                       adapter receives pure text, log keeps the image,
 *                       vision/describe recorded (ignorable), second turn
 *                       reuses the log cache.
 *   B. eye off        — images become the「没有开启多模态功能」placeholder,
 *                       no vision API call.
 *   C. failover       — primary provider fails, fallback succeeds, and the
 *                       text carries the degradation notice.
 *   D. all fail       — every provider fails; the error copy reaches the
 *                       adapter instead of a description.
 *
 * Run: node scripts/verify-e2e.mjs   (after `pnpm run build` + patch --apply)
 */

import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import LlmRuntime, { LlmAdapter } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import { createApiProxy } from '@deepseek-ai/dsh-host-apiproxy'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import { apply as applyLooklook } from '../lib/index.js'

/** ---- mocks ----------------------------------------------------------- */

function fakeAttachments() {
  const images = new Map()
  let next = 1
  return {
    imageLimits: {
      maxImageBytes: 10 * 1024 * 1024,
      maxImagesPerMessage: 10,
      maxMessageImageBytes: 50 * 1024 * 1024,
      maxImagePixels: 40_000_000,
      mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    },
    validateImage: async () => {},
    saveImage: async (input) => {
      const ref = {
        attachmentId: `att-${next++}`,
        mediaType: input.mediaType,
        bytes: input.data.byteLength,
        width: 1,
        height: 1,
        ...input.name === undefined ? {} : { name: input.name },
      }
      images.set(String(ref.attachmentId), { ref, data: input.data })
      return ref
    },
    readImage: async (ref) => {
      const stored = images.get(String(ref.attachmentId))
      if (stored === undefined) throw new Error(`attachment ${ref.attachmentId} missing`)
      return stored
    },
  }
}

function fakeSettings() {
  const namespaces = new Map()
  const register = (ns, _schema, options = {}) => {
    const value = { ...(options.base ?? {}) }
    namespaces.set(ns, value)
    return {
      get: () => value,
      watch: () => () => {},
      update: async (patch) => { Object.assign(value, patch) },
      replace: async (section) => { namespaces.set(ns, { ...section }) },
    }
  }
  return {
    register,
    describe: () => [...namespaces.entries()].map(([ns, value]) => ({ ns, value })),
    get: (ns) => namespaces.get(ns),
    update: async (ns, patch) => { Object.assign(namespaces.get(ns) ?? {}, patch) },
  }
}

function fakeCredentials() {
  const store = new Map([['VISION_KEY', 'test-vision-key']])
  return {
    resolve: async (ref) => store.has(ref) ? { value: store.get(ref), source: 'memory' } : undefined,
    describe: async (ref) => ({ configured: store.has(ref), writable: true }),
    set: async (ref, value) => { store.set(ref, value) },
    unset: async (ref) => { store.delete(ref) },
  }
}

class TextOnlyAdapter extends LlmAdapter {
  requests = []
  providerInfo(provider) { return { id: provider, name: 'Mock Text' } }
  listModels() { return Promise.resolve([{ provider: 'mock-text', id: 'plain', name: 'Plain' }]) }
  resolveModel(provider, model) {
    return Promise.resolve({ provider, id: model, name: model, inputModalities: ['text'] })
  }
  async *stream(options) {
    this.requests.push(options.messages)
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'ok' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'ok' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

let passed = 0
function assert(condition, label) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${label}`)
  passed += 1
  console.log(`  ✓ ${label}`)
}

/** Build one harness: full service stack + dsh-looklook with the given providers. */
async function harness({ providers, sessionOverrides = {} }) {
  const ctx = new Context()
  const settings = fakeSettings()
  ctx.provide('attachments', fakeAttachments())
  ctx.provide('settings', settings)
  ctx.provide('credentials', fakeCredentials())
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: '' })
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  const adapter = new TextOnlyAdapter()
  ctx.llm.registerAdapter(['mock-text'], adapter)
  applyLooklook(ctx, { providers, sessionOverrides, maxDescribeChars: 2000 })
  const api = createApiProxy(ctx, {
    defaultModelSelection: () => ({ provider: 'mock-text', model: 'plain' }),
    cwd: process.cwd(),
  })
  const agent = ctx.agentLoop.create(SessionId(`e2e-${Math.random().toString(36).slice(2, 8)}`), {
    provider: 'mock-text', model: 'plain',
  })
  return { ctx, settings, adapter, api, agent }
}

/** Send one image prompt and wait for the turn to settle. */
async function sendImage(h, text = '看看这张图') {
  const result = await h.api.sessions.prompt({
    rpcId: RpcId('e2e'),
    payload: {
      sessionId: h.agent.session.id,
      mode: 'queue',
      content: [
        { type: 'image', mediaType: 'image/png', data: 'iVBORw0KGgo=', name: 'test.png' },
        { type: 'text', text },
      ],
    },
  })
  assert(result.result.ok === true, 'image prompt admitted')
  await new Promise((resolve) => {
    const dispose = h.ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject === h.agent && status === 'idle') { dispose(); resolve() }
    })
  })
}

function adapterText(h) {
  const messages = h.adapter.requests[h.adapter.requests.length - 1] ?? []
  return messages.map(message => message.content.map(block => block.text ?? '').join('')).join('\n')
}

function adapterHasImage(h) {
  const messages = h.adapter.requests[h.adapter.requests.length - 1] ?? []
  return messages.some(message => message.content.some(block => block.type === 'image'))
}

/** ---- scenarios ------------------------------------------------------- */

async function scenarioA() {
  console.log('\nScenario A — primary path (eye on, text-only model)')
  const visionCalls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('vision.test')) {
      visionCalls.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify({ choices: [{ message: { content: '这是一张测试图片，内容为蓝天白云。' } }] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      })
    }
    throw new Error(`unexpected fetch to ${url}`)
  }
  const h = await harness({ providers: [{
    id: 'v1', name: 'Vision Mock', baseURL: 'https://vision.test/v1',
    apiKeyEnv: 'VISION_KEY', model: 'mock-vl', timeoutMs: 5000, enabled: true,
  }] })
  await sendImage(h)
  assert(visionCalls.length === 1, `vision API called once (${visionCalls.length})`)
  assert(adapterHasImage(h) === false, 'adapter received no image blocks')
  const text = adapterText(h)
  assert(text.includes('【图片识别 · mock-vl】'), 'adapter received the recognition header')
  assert(text.includes('蓝天白云'), 'adapter received the vision description text')
  const events = h.agent.session.events
  const userMessage = events.find(event => event.type === 'user/message')
  assert(userMessage?.type === 'user/message' && userMessage.data.content.some(block => block.type === 'image'),
    'log keeps the original image block')
  const describe = events.find(event => event.type === 'vision/describe')
  assert(describe !== undefined, 'vision/describe event recorded')
  assert(describe?.ignorable === true, 'vision/describe carries the ignorable envelope marker')
  assert(describe?.data?.ok === true && describe.data.text?.includes('蓝天白云'), 'vision/describe carries the model-visible text')
  await new Promise((resolve) => {
    h.agent.followup({ id: 'second', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '再描述一次' }] })
    const dispose = h.ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject === h.agent && status === 'idle') { dispose(); resolve() }
    })
  })
  assert(visionCalls.length === 1, `second turn reuses the log cache (vision calls stay ${visionCalls.length})`)
  globalThis.fetch = originalFetch
  await h.ctx.fiber.dispose()
}

async function scenarioB() {
  console.log('\nScenario B — eye off (placeholder, no vision call)')
  const visionCalls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    visionCalls.push(String(url))
    return new Response(JSON.stringify({ choices: [{ message: { content: 'unused' } }] }), { status: 200 })
  }
  const h = await harness({ providers: [{
    id: 'v1', name: 'Vision Mock', baseURL: 'https://vision.test/v1',
    apiKeyEnv: 'VISION_KEY', model: 'mock-vl', timeoutMs: 5000, enabled: true,
  }] })
  // Eye off for THIS session: flip the per-session override on the settings value.
  h.settings.get('vision').sessionOverrides = { [String(h.agent.session.id)]: 'off' }
  await sendImage(h)
  assert(visionCalls.length === 0, 'no vision API call while the eye is off')
  assert(adapterHasImage(h) === false, 'adapter received no image blocks')
  const text = adapterText(h)
  assert(text.includes('没有开启多模态功能'), 'adapter received the placeholder copy')
  const userMessage = h.agent.session.events.find(event => event.type === 'user/message')
  assert(userMessage?.type === 'user/message' && userMessage.data.content.some(block => block.type === 'image'),
    'log keeps the original image block even with the eye off')
  globalThis.fetch = originalFetch
  await h.ctx.fiber.dispose()
}

async function scenarioC() {
  console.log('\nScenario C — failover (primary fails, fallback succeeds)')
  const visionCalls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    visionCalls.push(String(url))
    if (String(url).includes('primary.test')) {
      return new Response(JSON.stringify({ error: 'boom' }), { status: 500 })
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: '备用模型识别结果。' } }] }), { status: 200 })
  }
  const h = await harness({ providers: [
    { id: 'primary', name: 'Primary', baseURL: 'https://primary.test/v1', apiKeyEnv: 'VISION_KEY', model: 'p-vl', timeoutMs: 5000, enabled: true },
    { id: 'fallback', name: 'Fallback', baseURL: 'https://fallback.test/v1', apiKeyEnv: 'VISION_KEY', model: 'f-vl', timeoutMs: 5000, enabled: true },
  ] })
  await sendImage(h)
  assert(visionCalls.length === 2, `both providers tried (${visionCalls.length})`)
  const text = adapterText(h)
  assert(text.includes('【图片识别 · f-vl】'), 'fallback model produced the recognition')
  assert(text.includes('备用模型识别结果'), 'fallback description reached the adapter')
  assert(text.includes('已自动切换为「f-vl」'), 'degradation notice reached the adapter')
  const describe = h.agent.session.events.find(event => event.type === 'vision/describe')
  assert(describe?.data?.provider === 'fallback' && describe.data.degradedFrom === 'primary', 'vision/describe records the degradation')
  globalThis.fetch = originalFetch
  await h.ctx.fiber.dispose()
}

async function scenarioD() {
  console.log('\nScenario D — all providers fail (error copy)')
  const visionCalls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    visionCalls.push(String(url))
    return new Response(JSON.stringify({ error: 'invalid key' }), { status: 401 })
  }
  const h = await harness({ providers: [{
    id: 'v1', name: 'Vision Mock', baseURL: 'https://vision.test/v1',
    apiKeyEnv: 'VISION_KEY', model: 'mock-vl', timeoutMs: 5000, enabled: true,
  }] })
  await sendImage(h)
  const text = adapterText(h)
  assert(text.includes('【图片识别失败】'), 'failure header reached the adapter')
  assert(text.includes('API Key 无效或已失效'), 'classified error copy reached the adapter')
  assert(text.includes('请到「设置 → 视觉模型」检查配置后重试'), 'action hint reached the adapter')
  const describe = h.agent.session.events.find(event => event.type === 'vision/describe')
  assert(describe?.data?.ok === false && describe.data.error?.code === 'unauthorized', 'vision/describe records the failure code')
  globalThis.fetch = originalFetch
  await h.ctx.fiber.dispose()
}

async function main() {
  await scenarioA()
  await scenarioB()
  await scenarioC()
  await scenarioD()
  console.log(`\nALL ${passed} ASSERTIONS PASSED`)
}

main().catch((error) => {
  console.error('\nE2E FAILED:', error)
  process.exit(1)
})
