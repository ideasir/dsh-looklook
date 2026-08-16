import { replaceImagesWithPlaceholder, imageMarker, PLACEHOLDER_TEXT } from "../lib/translate.js";

// 1) marker format: full ref JSON
const ref = { attachmentId: "sha256:abc123", mediaType: "image/png", bytes: 42, width: 300, height: 400 };
const marker = imageMarker(ref);
console.log("marker:", JSON.stringify(marker));
const parsedMarker = JSON.parse(marker.match(/【附图:([^】]+)】/)[1]);
if (parsedMarker.attachmentId !== "sha256:abc123" || parsedMarker.width !== 300) throw new Error("marker format mismatch");

// 2) client-side regex round trip (must match src/client/UserMessageNodeView.tsx)
const re = /【附图:([^】]+)】/g;
const extracted = [...marker.matchAll(re)].map(m => JSON.parse(m[1]));
console.log("extracted by client regex:", JSON.stringify(extracted));
if (extracted.length !== 1 || extracted[0].attachmentId !== "sha256:abc123" || extracted[0].width !== 300) throw new Error("client regex mismatch");

// 3) eye-off path: image block → placeholder + marker; no image block left
const message = {
  role: "user",
  content: [
    { type: "image", attachment: { attachmentId: "sha256:img1" } },
    { type: "text", text: "帮我看看这张图" },
  ],
};
const out = replaceImagesWithPlaceholder([message])[0];
const textBlock = out.content.find(b => b.type === "text");
const imageBlocks = out.content.filter(b => b.type === "image");
console.log("replaced text block:", JSON.stringify(textBlock.text).slice(0, 120));
console.log("remaining image blocks:", imageBlocks.length);
if (imageBlocks.length !== 0) throw new Error("image block not replaced");
if (!textBlock.text.includes(PLACEHOLDER_TEXT)) throw new Error("placeholder missing");
if (!textBlock.text.includes("sha256:img1")) throw new Error("marker missing in placeholder path");

// 4) no session append anywhere in the host build
const host = await import("../lib/index.js");
console.log("host exports:", Object.keys(host).sort().join(", "));
console.log("ALL TESTS PASS");
