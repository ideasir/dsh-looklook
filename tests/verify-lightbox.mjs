import { readFileSync } from "node:fs";
import { buildImageToolReference, imageMarker, replaceImagesWithPlaceholder } from "/tmp/dsh-looklook/lib/translate.js";

// 1) bundle references the external gallery package (not inlined)
const s = readFileSync("/tmp/dsh-looklook/lib/client.js", "utf8");
console.log("external require present:", s.includes("dsh-client-ui-attachment"));
console.log("ImageGallery used:", s.includes("ImageGallery"));

// 2) marker now carries full ref JSON
const image = { type: "image", attachment: { attachmentId: "sha256:abc", mediaType: "image/png", bytes: 100, width: 300, height: 515 } };
const ref = buildImageToolReference(image);
const marker = ref.match(/【附图:([^】]+)】/);
console.log("marker payload:", marker ? marker[1] : "NOT FOUND");
if (!marker) throw new Error("marker missing");
const parsed = JSON.parse(marker[1]);
console.log("parsed ref:", JSON.stringify(parsed));
if (parsed.attachmentId !== "sha256:abc" || parsed.width !== 300 || parsed.height !== 515) throw new Error("marker ref round trip failed");

// 3) placeholder path marker too
const msgs = [{ role: "user", content: [{ type: "image", attachment: image.attachment }, { type: "text", text: "hi" }] }];
const out = replaceImagesWithPlaceholder(msgs)[0];
const marker2 = out.content[0].text.match(/【附图:([^】]+)】/);
console.log("placeholder marker has width:", marker2 ? JSON.parse(marker2[1]).width : "none");
if (!marker2 || JSON.parse(marker2[1]).width !== 300) throw new Error("placeholder marker not JSON");

// 4) client-side parse: JSON ref + bare-id fallback
function parseMarkerRef(raw) {
  const trimmed = raw.trim();
  try {
    const p = JSON.parse(trimmed);
    if (typeof p?.attachmentId === "string" && p.attachmentId.length > 0) {
      return { attachmentId: p.attachmentId, width: p.width, height: p.height };
    }
  } catch { /* fallback */ }
  return { attachmentId: trimmed };
}
const r1 = parseMarkerRef(marker[1]);
const r2 = parseMarkerRef("sha256:oldstyle");
console.log("parse JSON ref:", JSON.stringify(r1));
console.log("parse bare id:", JSON.stringify(r2));
if (r1.width !== 300) throw new Error("json parse failed");
if (r2.attachmentId !== "sha256:oldstyle") throw new Error("bare id fallback failed");
console.log("ALL LIGHTBOX TESTS PASS");
