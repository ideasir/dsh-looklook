#!/usr/bin/env node
/**
 * Verify the no-whitelist upload policy: the host accepts every extension
 * (isAllowedUploadName removed → route has no extension check), and the
 * client intercepts only non-image drops (images stay on the native DSH
 * pipeline).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// 1) The host route must NOT contain an extension rejection.
const hostSource = readFileSync(fileURLToPath(new URL("../src/upload.ts", import.meta.url)), "utf8");
if (/unsupported file type|isAllowedUploadName\(/.test(hostSource)) {
  throw new Error("host upload still has an extension whitelist — expected no-whitelist policy");
}
console.log("HOST NO-WHITELIST: OK");

// 2) The client mirror must classify native images vs everything else.
const clientSource = readFileSync(fileURLToPath(new URL("../src/client/upload-shared.ts", import.meta.url)), "utf8");
const imageMatch = clientSource.match(/NATIVE_IMAGE_EXTENSIONS = (\[[^\]]*\])/);
if (!imageMatch) throw new Error("NATIVE_IMAGE_EXTENSIONS not found in upload-shared.ts");
const images = [...imageMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
console.log("native image extensions:", JSON.stringify(images));
if (images.length === 0 || !images.includes(".png") || !images.includes(".jpg")) {
  throw new Error("native image list is incomplete");
}
console.log("CLIENT NATIVE-IMAGE LIST: OK");
