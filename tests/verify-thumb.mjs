// replicate the client thumbSize rule and check the cases
function thumbSize(width, height) {
  const MAX = 220;
  if (typeof width !== "number" || typeof height !== "number" || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: MAX, height: MAX };
  }
  const shortSide = Math.min(width, height);
  if (shortSide >= MAX) {
    const scale = MAX / shortSide;
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
  }
  return { width, height };
}
const cases = [
  ["square 1:1 (500)", 500, 500, { width: 220, height: 220 }],
  ["landscape 16:9 (1600x900)", 1600, 900, { width: 391, height: 220 }],
  ["portrait 9:16 (300x600)", 300, 600, { width: 220, height: 440 }],
  ["tiny 100x100 (no upscale)", 100, 100, { width: 100, height: 100 }],
  ["missing metadata", undefined, undefined, { width: 220, height: 220 }],
];
for (const [name, w, h, expected] of cases) {
  const got = thumbSize(w, h);
  const ok = got.width === expected.width && got.height === expected.height;
  console.log((ok ? "PASS" : "FAIL"), name, "=>", JSON.stringify(got));
  if (!ok) process.exitCode = 1;
}
