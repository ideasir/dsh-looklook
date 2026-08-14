#!/usr/bin/env node
/**
 * dsh-looklook compatibility patch — applies the three upstream extension
 * points to an unpatched `@deepseek-ai/dsh-*` 0.1.0-rc.6 install so the
 * vision-assist plugin works before the upstream PR lands.
 *
 * Patched (each edit is exact-match; nothing is modified unless every edit
 * matches, and originals are backed up):
 *
 *   1. dsh-host-apiproxy/lib/types/api-proxy.js
 *      two image-modality checks now consult the `prompt/image-admission`
 *      bail event first (built-in rule stays the default).
 *   2. dsh-session/lib/index.js
 *      `Session.append` accepts `{ ignorable: true }` for non-surface event
 *      types (the out-of-repo plugin event channel).
 *   3. dsh-agent-loop/lib/index.js
 *      dispatches the `agent/request-messages` waterfall before streaming
 *      (the request rewrite point), defaulting to pass-through.
 *
 * Usage:
 *   node patches/apply-patch.mjs --check [--root <node_modules>]
 *   node patches/apply-patch.mjs --apply [--root <node_modules>]
 *   node patches/apply-patch.mjs --restore [--root <node_modules>]
 *
 * `--root` names the directory that directly contains `@deepseek-ai`; default
 * is `<cwd>/node_modules`. The dsh CLI's own install can be located with:
 *   node patches/apply-patch.mjs --apply --root <path-to/node_modules>
 */

import { existsSync, readFileSync, writeFileSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const mode = args.includes('--check') ? 'check' : args.includes('--restore') ? 'restore' : args.includes('--apply') ? 'apply' : null
const rootFlag = args.indexOf('--root')
const root = rootFlag >= 0 ? args[rootFlag + 1] : join(process.cwd(), 'node_modules')

if (mode === null) {
  console.error('usage: node apply-patch.mjs --check|--apply|--restore [--root <node_modules>]')
  process.exit(2)
}
if (!existsSync(root)) {
  console.error(`root not found: ${root}`)
  process.exit(1)
}

/** Exact-match edits against rc.6 lib artifacts (whitespace from the artifact). */
const PATCHES = [
  {
    id: 'api-proxy-admission',
    // Runtime entry is the tsdown bundle, which inlines api-proxy.ts.
    file: join(root, '@deepseek-ai', 'dsh-host-apiproxy', 'lib', 'index.js'),
    marker: '/* dsh-looklook: prompt/image-admission */',
    edits: [
      {
        // session.prompt admission (tab indent, single-line if in the bundle).
        from: `							if (modelInfo.inputModalities !== void 0 && !modelInfo.inputModalities.includes("image")) return err(request, {
								code: "attachment-error",
								message: \`Model "\${current.model}" does not support image input.\`,
								details: { reason: "MODEL_DOES_NOT_SUPPORT_IMAGES" }
							});`,
        to: `							const admission = ctx.bail("prompt/image-admission", { sessionId: agent.session.id, provider: current.provider, model: current.model, inputModalities: modelInfo.inputModalities, hasImage: true }); /* dsh-looklook */
							if (admission !== void 0) {
								if (admission !== "allow") return err(request, {
									code: "attachment-error",
									message: admission.deny,
									details: { reason: "IMAGE_ADMISSION_DENIED" }
								});
							}
							else if (modelInfo.inputModalities !== void 0 && !modelInfo.inputModalities.includes("image")) return err(request, {
								code: "attachment-error",
								message: \`Model "\${current.model}" does not support image input.\`,
								details: { reason: "MODEL_DOES_NOT_SUPPORT_IMAGES" }
							});`,
      },
      {
        // session.selectModel admission.
        from: `							const info = await ctx.llm.resolveModelInfo(resolved.provider, resolved.model);
							if (info.inputModalities !== void 0 && !info.inputModalities.includes("image")) return err(request, {
								code: "model-unavailable",
								message: \`Model "\${resolved.model}" does not accept image input, but this session already contains images; select an image-capable model.\`,
								details: {
									provider,
									model
								}
							});`,
        to: `							const info = await ctx.llm.resolveModelInfo(resolved.provider, resolved.model);
							const admission = ctx.bail("prompt/image-admission", { sessionId: found.agent.session.id, provider: resolved.provider, model: resolved.model, inputModalities: info.inputModalities, hasImage: true }); /* dsh-looklook */
							if (admission !== void 0) {
								if (admission !== "allow") return err(request, {
									code: "model-unavailable",
									message: admission.deny,
									details: {
										provider,
										model
									}
								});
							}
							else if (info.inputModalities !== void 0 && !info.inputModalities.includes("image")) return err(request, {
								code: "model-unavailable",
								message: \`Model "\${resolved.model}" does not accept image input, but this session already contains images; select an image-capable model.\`,
								details: {
									provider,
									model
								}
							});`,
      },
    ],
  },
  {
    id: 'session-append-ignorable',
    file: join(root, '@deepseek-ai', 'dsh-session', 'lib', 'index.js'),
    marker: '/* dsh-looklook: ignorable append */',
    edits: [
      {
        // Distinguish surface options from the ignorable option (tab indent).
        from: `		const surfaceOpts = opts[0];
		const surfaceMetadata = {`,
        to: `		const surfaceOpts = opts[0] && (opts[0].sourceEventSeqs !== void 0 || opts[0].surfaceOp !== void 0) ? opts[0] : void 0; /* dsh-looklook */
		const ignorable = surfaceOpts === void 0 && opts[0]?.ignorable === true;
		const surfaceMetadata = {`,
      },
      {
        // Stamp the envelope marker when requested.
        from: `		const event = deepFreeze({
			type,
			seq: this.log.length,
			time: Date.now(),
			data: dataSnapshot,
			...surfaceMetadataSnapshot
		});`,
        to: `		const event = deepFreeze({
			type,
			seq: this.log.length,
			time: Date.now(),
			data: dataSnapshot,
			...surfaceMetadataSnapshot,
			...ignorable ? { ignorable: true } : {}
		});`,
      },
    ],
  },
  {
    id: 'agent-loop-request-messages',
    file: join(root, '@deepseek-ai', 'dsh-agent-loop', 'lib', 'index.js'),
    marker: '/* dsh-looklook: agent/request-messages */',
    edits: [
      {
        // Rewrite point before dispatch (tab indent in the bundle).
        from: `			const stream = preparedCall?.stream(request) ?? this.loopCtx.llm.stream(request);`,
        to: `			const dispatched = await this.dispatch.waterfall("agent/request-messages", { turn, step, signal }, request, () => Promise.resolve(request)); /* dsh-looklook */
			signal.throwIfAborted();
			const stream = preparedCall?.stream(dispatched) ?? this.loopCtx.llm.stream(dispatched);`,
      },
    ],
  },
  {
    // Transitional: expose the plugin's `vision` settings namespace to the
    // configuration client (the browser settings page). Upstream this becomes
    // a general settings-registration option; the allowlist entry is the
    // equivalent patch for rc.6.
    id: 'api-proxy-expose-vision-namespace',
    file: join(root, '@deepseek-ai', 'dsh-host-apiproxy', 'lib', 'index.js'),
    marker: '/* dsh-looklook: expose vision settings namespace */',
    edits: [
      {
        from: `const PRODUCT_SETTINGS_NAMESPACES = new Set(["ui-onboarding", SETTINGS_NAMESPACE]);`,
        to: `const PRODUCT_SETTINGS_NAMESPACES = new Set(["ui-onboarding", SETTINGS_NAMESPACE, "vision"]); /* dsh-looklook */`,
      },
    ],
  },
]

const backupOf = (file) => `${file}.dsh-looklook.bak`

function statusOf(patch) {
  if (!existsSync(patch.file)) return 'missing'
  const content = readFileSync(patch.file, 'utf8')
  if (content.includes(patch.marker)) return 'patched'
  const missing = patch.edits.filter(edit => !content.includes(edit.from))
  return missing.length === 0 ? 'clean' : `unexpected (${missing.length} edit(s) unmatched)`
}

if (mode === 'check') {
  for (const patch of PATCHES) {
    console.log(`${patch.id}: ${statusOf(patch)}`)
  }
  process.exit(0)
}

if (mode === 'restore') {
  let ok = true
  for (const patch of PATCHES) {
    const backup = backupOf(patch.file)
    if (!existsSync(backup)) {
      console.log(`${patch.id}: no backup, skipping`)
      continue
    }
    renameSync(backup, patch.file)
    console.log(`${patch.id}: restored`)
  }
  process.exit(ok ? 0 : 1)
}

// apply
let failed = false
for (const patch of PATCHES) {
  const status = statusOf(patch)
  if (status === 'patched') {
    console.log(`${patch.id}: already patched, skipping`)
    continue
  }
  if (status !== 'clean') {
    console.error(`${patch.id}: cannot apply — ${status}`)
    failed = true
    continue
  }
  let content = readFileSync(patch.file, 'utf8')
  for (const edit of patch.edits) {
    if (!content.includes(edit.from)) {
      console.error(`${patch.id}: edit no longer matches — aborting this file`)
      failed = true
      break
    }
    content = content.replace(edit.from, edit.to)
  }
  if (failed) continue
  // Commit only when every edit matched: backup, then write.
  const stamp = `${patch.marker}\n`
  if (!content.includes(patch.marker)) {
    content = stamp + content
  }
  renameSync(patch.file, backupOf(patch.file))
  writeFileSync(patch.file, content)
  console.log(`${patch.id}: patched (backup at ${backupOf(patch.file)})`)
}

if (failed) {
  console.error('one or more patches failed; run --restore to roll back, then report the artifact versions')
  process.exit(1)
}
console.log('dsh-looklook compatibility patch applied. Restart dsh web for it to take effect.')
