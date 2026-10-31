import test from "node:test";
import assert from "node:assert/strict";
import {
  ROW_ALIGNMENT,
  bytesPerRowAligned,
  nonBlackCount,
  unpadRows,
  toRgba,
  rowWidths,
  hash,
  summarise,
} from "./snapshotPixels.mjs";

const rgba = (r, g, b, a = 255) => [r, g, b, a];

// --- row alignment -----------------------------------------------------

test("bytesPerRowAligned rounds 160px RGBA up to the 256-byte boundary", () => {
  // 160 * 4 = 640, which is not a multiple of 256.
  assert.equal(bytesPerRowAligned(160), 768);
  assert.equal(768 % ROW_ALIGNMENT, 0);
});

test("bytesPerRowAligned leaves an already-aligned row alone", () => {
  assert.equal(bytesPerRowAligned(64), 256);
});

// --- nonBlackCount -----------------------------------------------------

test("nonBlackCount returns 0 for an all-black buffer", () => {
  assert.equal(nonBlackCount(rgba(0, 0, 0, 255)), 0);
});

test("nonBlackCount counts a pixel with only the blue channel set", () => {
  // Guards against a `r !== 0` style test that misses pure blue/black mixes.
  assert.equal(nonBlackCount(rgba(0, 0, 1, 255)), 1);
});

test("nonBlackCount ignores alpha, so a transparent texel is not 'visible'", () => {
  assert.equal(nonBlackCount(rgba(0, 0, 0, 0)), 0);
});

test("nonBlackCount counts across a multi-pixel buffer", () => {
  const px = [...rgba(10, 0, 0, 255), ...rgba(0, 0, 0, 255), ...rgba(0, 0, 0, 0)];
  assert.equal(nonBlackCount(px), 1);
});

// --- unpadRows ---------------------------------------------------------

test("unpadRows strips row padding, keeping only the real bytes", () => {
  const width = 2, height = 2, bpp = 4;
  const stride = bytesPerRowAligned(width, bpp); // 256
  const padded = new Uint8Array(stride * height);
  // Mark the first pixel of each row so we can see where rows land.
  padded[0] = 1;
  padded[stride] = 1;

  const out = unpadRows(padded, width, height, stride);
  assert.equal(out.length, width * height * bpp);
  assert.equal(out[0], 1);
  assert.equal(out[width * bpp], 1);
});

test("unpadRows round-trips a 160x120 buffer to 76800 bytes, not 92160", () => {
  const width = 160, height = 120, bpp = 4;
  const stride = bytesPerRowAligned(width, bpp);
  assert.equal(stride, 768);
  const padded = new Uint8Array(stride * height);

  const out = unpadRows(padded, width, height, stride);
  assert.equal(out.length, width * height * bpp);
  assert.equal(out.length, 76800);
});

// --- toRgba ------------------------------------------------------------

test("toRgba swizzles BGRA input into RGBA", () => {
  // getPreferredCanvasFormat() returns bgra8unorm in practice, so a naive
  // dump would swap red and blue.
  const bgra = [1, 2, 3, 255];
  assert.deepEqual([...toRgba(bgra, "bgra8unorm")], [3, 2, 1, 255]);
});

test("toRgba passes RGBA input through unchanged", () => {
  const px = [1, 2, 3, 255];
  assert.deepEqual([...toRgba(px, "rgba8unorm")], px);
});

// --- rowWidths ---------------------------------------------------------

test("rowWidths reports per-row counts of covered pixels", () => {
  // 3 rows: 4, 8, 12 covered pixels, rest empty.
  const width = 12, height = 5;
  const px = new Uint8Array(width * height * 4);
  const paint = (row, count) => {
    for (let i = 0; i < count; i++) {
      px[(row * width + i) * 4] = 255;
    }
  };
  paint(1, 4);
  paint(2, 8);
  paint(3, 12);

  assert.equal(rowWidths(px, width, height), "4,8,12");
});

test("rowWidths omits empty rows entirely", () => {
  const width = 4, height = 4;
  const px = new Uint8Array(width * height * 4);
  px[(2 * width) * 4] = 255; // one lit pixel on row 2 only
  assert.equal(rowWidths(px, width, height), "1");
});

// --- hash --------------------------------------------------------------

test("hash is stable for identical input", () => {
  const a = [1, 2, 3, 4, 5];
  const b = [1, 2, 3, 4, 5];
  assert.equal(hash(a), hash(b));
});

test("hash changes when rows are transposed", () => {
  // A sheared read (the classic 256-byte padding bug) would look like this.
  const row0 = [1, 1, 1, 1, 0, 0, 0, 0];
  const row1 = [0, 0, 0, 0, 1, 1, 1, 1];
  const correct = [...row0, ...row1];
  const sheared = [...row0, ...row0, ...row1, ...row1].slice(0, 32);
  assert.notEqual(hash(correct), hash(sheared));
});

test("hash differs for different content", () => {
  assert.notEqual(hash([1, 2, 3]), hash([1, 2, 4]));
});

// --- summarise ---------------------------------------------------------

test("summarise composes count, shape and hash", () => {
  const width = 4, height = 2;
  const px = new Uint8Array(width * height * 4);
  px[0] = 255; // row 0, one pixel
  px[width * 4] = 255; // row 1, one pixel

  const s = summarise({ width, height, data: px, format: "rgba8unorm" });
  assert.equal(s.nonBlack, 2);
  assert.equal(s.total, width * height);
  assert.equal(s.rowWidths, "1,1");
  assert.equal(typeof s.hash, "string");
  assert.ok(s.hash.length > 0);
});
