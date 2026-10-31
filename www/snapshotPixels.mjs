// Pure pixel helpers for snapshotting the internal scene buffer.
//
// These deliberately contain no WebGPU calls so they can be unit-tested
// under `node --test` — the GPU half lives in demo.js, and the only way to
// verify that half is to diff a real snapshot against a recorded baseline.
//
// Run: node --test www/snapshotPixels.test.mjs

// Matches the 256-byte alignment WebGPU requires for
// copyTextureToBuffer's bytesPerRow.
export const ROW_ALIGNMENT = 256;

export function bytesPerRowAligned(width, bytesPerPixel = 4) {
  const row = width * bytesPerPixel;
  return Math.ceil(row / ROW_ALIGNMENT) * ROW_ALIGNMENT;
}

// Number of pixels that are not black. Alpha is deliberately ignored: the
// scene pipeline has no blend state, so a fragment's colour is written
// straight through and visibility is decided by rgb alone.
export function nonBlackCount(pixels) {
  let n = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] !== 0 || pixels[i + 1] !== 0 || pixels[i + 2] !== 0) n++;
  }
  return n;
}

// copyTextureToBuffer requires bytesPerRow to be a multiple of 256, so each
// row read back from the GPU is padded. Reading `width * 4` bytes per row
// without stripping that padding shears the image diagonally.
export function unpadRows(padded, width, height, bytesPerRow) {
  const rowBytes = width * 4;
  const out = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) {
    out.set(padded.subarray(y * bytesPerRow, y * bytesPerRow + rowBytes), y * rowBytes);
  }
  return out;
}

// getPreferredCanvasFormat() is bgra8unorm on most platforms, so a raw dump
// has red and blue swapped. Normalise to rgba8unorm before hashing or export.
export function toRgba(pixels, format) {
  if (!format || !format.startsWith("bgra")) return pixels;
  const out = new Uint8Array(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    out[i] = pixels[i + 2];
    out[i + 1] = pixels[i + 1];
    out[i + 2] = pixels[i];
    out[i + 3] = pixels[i + 3];
  }
  return out;
}

// Per-row counts of covered pixels, as "4,8,12,...". Empty rows are omitted.
// This is the human-readable half of the fingerprint: the non-black count
// alone cannot distinguish a 9-row diamond from a 10-row one, because the
// area is conserved while the shape changes.
export function rowWidths(pixels, width, height) {
  const widths = [];
  for (let y = 0; y < height; y++) {
    let w = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (pixels[i] !== 0 || pixels[i + 1] !== 0 || pixels[i + 2] !== 0) w++;
    }
    if (w > 0) widths.push(w);
  }
  return widths.join(",");
}

// FNV-1a, 32-bit. Not cryptographic — just a cheap order-sensitive digest
// so a one-texel shift cannot pass as "identical to the baseline".
export function hash(pixels) {
  let h = 0x811c9dc5;
  for (let i = 0; i < pixels.length; i++) {
    h ^= pixels[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// Three-layer fingerprint of a snapshot. nonBlack answers "is anything
// plausible on screen", rowWidths answers "is it the right shape", hash
// answers "is it provably identical".
export function summarise(snap) {
  const { width, height, data, format } = snap;
  const rgba = toRgba(data, format);
  return {
    nonBlack: nonBlackCount(rgba),
    total: width * height,
    rowWidths: rowWidths(rgba, width, height),
    hash: hash(rgba),
  };
}
