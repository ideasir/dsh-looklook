import { readFileSync } from "node:fs";
const s = readFileSync("/root/.dsh/profiles/web/node_modules/dsh-looklook/lib/client.js", "utf8");
const i = s.indexOf("trimmed.length > 0");
const seg = s.slice(i, i + 400);
console.log(seg.includes("{trimmed}") ? "BUBBLE USES trimmed: OK" : "STILL uses cleaned: FAIL");

// simulate the render: strip hidden, remove marker, then display trimmed
const HIDE_START = "【looklook:开始】";
const HIDE_END = "【looklook:结束】";
const IMAGE_MARKER_RE = /【附图:([^】]+)】/g;
function stripHidden(text) {
  let out = text;
  for (;;) {
    const start = out.indexOf(HIDE_START);
    if (start === -1) break;
    const end = out.indexOf(HIDE_END, start);
    out = end === -1 ? out.slice(0, start) : out.slice(0, start) + out.slice(end + HIDE_END.length);
  }
  return out;
}
const block0 = "【looklook:开始】\n用户发来一张图片...\n【looklook:结束】\n\n\n【附图:sha256:abc】";
const block1 = "描述一下这张图。";
const texts = [stripHidden(block0), block1];
const cleaned = texts.join("").replace(IMAGE_MARKER_RE, () => "");
const trimmed = cleaned.trim();
console.log("cleaned repr:", JSON.stringify(cleaned));
console.log("trimmed repr:", JSON.stringify(trimmed));
console.log(trimmed === "描述一下这张图。" ? "NO LEADING GAP: OK" : "LEADING GAP REMAINS: FAIL");
