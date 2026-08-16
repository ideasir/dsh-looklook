#!/usr/bin/env node
/**
 * Verify the client upload-extension mirror stays in sync with the
 * authoritative host whitelist (src/upload.ts → lib/upload.js).
 *
 * The client bundle cannot import host code (tsconfig rootDir separation),
 * so src/client/upload-shared.ts keeps a literal mirror. This test fails the
 * build when the two drift apart.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ARCHIVE_EXTENSIONS, VIDEO_EXTENSIONS } from "../lib/upload.js";

const hostList = [...ARCHIVE_EXTENSIONS, ...VIDEO_EXTENSIONS].sort();
const clientSource = readFileSync(fileURLToPath(new URL("../src/client/upload-shared.ts", import.meta.url)), "utf8");
const clientMatch = clientSource.match(/export const ACCEPT_EXTENSIONS = (\[[^\]]*\])/);
if (!clientMatch) throw new Error("ACCEPT_EXTENSIONS not found in upload-shared.ts");
const clientList = [...clientMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1]).sort();

console.log("host:", JSON.stringify(hostList));
console.log("client:", JSON.stringify(clientList));

if (hostList.length !== clientList.length || hostList.some((ext, i) => ext !== clientList[i])) {
  console.error("DRIFT: update src/client/upload-shared.ts ACCEPT_EXTENSIONS to match src/upload.ts");
  process.exitCode = 1;
} else {
  console.log("UPLOAD LIST IN SYNC: OK");
}
