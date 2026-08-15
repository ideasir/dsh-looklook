import { readFileSync } from "node:fs";
// decode the real JSONL line exactly like the client surface does
const line = JSON.parse(readFileSync("/tmp/real-msg.txt", "utf8"));
const text = line.data.content[0].text;
console.log("decoded text preview:", JSON.stringify(text.slice(0, 80)));
const REF_JSON_RE = /(\{"attachmentId":"[^"]+","mediaType":"[^"]+","bytes":\d+,"width":\d+,"height":\d+\})/g;
const map = new Map();
for (const m of text.matchAll(REF_JSON_RE)) {
  const raw = m[1];
  if (raw === undefined) continue;
  try {
    const p = JSON.parse(raw);
    if (typeof p?.attachmentId === "string") map.set(p.attachmentId, p);
  } catch (err) { console.log("parse err:", err.message); }
}
console.log("embedded refs found:", map.size);
const bare = text.match(/【附图:([^】]+)】/);
if (bare) {
  const resolved = map.get(bare[1]);
  console.log("bare-id marker:", bare[1].slice(0, 24));
  console.log("resolved:", resolved ? resolved.width + "x" + resolved.height : "NONE");
  if (!resolved) throw new Error("resolution failed");
}
console.log("LEGACY REF TEST PASS");
