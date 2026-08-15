import { buildImageToolReference, imageMarker, rewriteImagesToToolReferences, replaceImagesWithPlaceholder } from "/tmp/dsh-looklook/lib/translate.js";
import { apply } from "/tmp/dsh-looklook/lib/index.js";

// 1) tool reference text: hidden wrapper + marker
const image = { type: "image", attachment: { attachmentId: "sha256:abc", mediaType: "image/png", bytes: 100, width: 10, height: 10 } };
const ref = buildImageToolReference(image);
console.log("reference text:");
console.log(ref);
if (!ref.includes("【looklook:开始】") || !ref.includes("【looklook:结束】")) throw new Error("hide markers missing");
if (!ref.includes("sha256:abc")) throw new Error("attachment id missing");
if (!ref.includes("【附图:{\"attachmentId\":\"sha256:abc\"")) throw new Error("image marker missing");

// 2) client-side round trip: strip hidden range, extract marker
const HIDE_START = "【looklook:开始】", HIDE_END = "【looklook:结束】";
let out = ref;
for (;;) {
  const s = out.indexOf(HIDE_START);
  if (s === -1) break;
  const e = out.indexOf(HIDE_END, s);
  out = e === -1 ? out.slice(0, s) : out.slice(0, s) + out.slice(e + HIDE_END.length);
}
const ids = [...out.matchAll(/【附图:([^】]+)】/g)].map(m => JSON.parse(m[1]));
console.log("after client strip:", JSON.stringify(out));
if (ids.length !== 1 || ids[0].attachmentId !== "sha256:abc") throw new Error("client round trip failed");
if (out.includes("looklook_describe")) throw new Error("hidden text not stripped");

// 3) rewriteImagesToToolReferences populates registry + replaces images
const registry = new Map();
const messages = [{ role: "user", content: [image, { type: "text", text: "图里有几个人?" }] }];
const rewritten = rewriteImagesToToolReferences(messages, registry);
console.log("registry size:", registry.size, "has id:", registry.has("sha256:abc"));
if (registry.size !== 1) throw new Error("registry not populated");
if (rewritten[0].content[0].type !== "text") throw new Error("image not replaced");

// 4) mount test: apply() registers the tool + system prompt + hooks
const tools = [];
const prompts = [];
const handlers = [];
const ctx = {
  settings: { register: () => ({ get: () => ({ providers: [], maxDescribeChars: 1000, sessionOverrides: {} }) }) },
  plugin: () => undefined,
  provide: () => undefined,
  on: (ev, fn) => { handlers.push([ev, fn]); },
  get: (name) => {
    if (name === "webServer") return { register: () => () => {} };
    return undefined;
  },
  logger: { warn: () => undefined },
  tools: { register: (def) => { tools.push(def); } },
  systemPrompt: { section: (s) => { prompts.push(s); } },
  sessions: { prepare: () => { throw new Error("must not be called"); } },
  attachments: {},
};
apply(ctx, { providers: [], sessionOverrides: {}, maxDescribeChars: 1000 });
console.log("tools registered:", tools.map(t => t.name));
console.log("system prompts:", prompts.map(p => p.name));
console.log("events:", handlers.map(h => h[0]).join(", "));
const names = tools.map(t => t.name);
if (names.length !== 2 || !names.includes("looklook_describe") || !names.includes("process_zip")) {
  throw new Error("tools not registered: " + names.join(", "));
}
if (prompts.length < 2) throw new Error("system prompts missing");
if (handlers.length < 3) throw new Error("handlers missing");
console.log("ALL TOOL-ARCH TESTS PASS");
