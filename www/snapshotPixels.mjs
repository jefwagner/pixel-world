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

/**
 * Crop a tightly-packed RGBA buffer to a rectangle.
 *
 * STUB: filled in during item 3 of roadmap Step 3.
 *
 * @param {Uint8Array|Uint8ClampedArray} pixels
 * @param {number} width
 * @param {number} height
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @returns {Uint8Array}
 */
export function cropRgba(pixels, width, height, x, y, w, h) {
  if (
    !Number.isInteger(x) || !Number.isInteger(y) ||
    !Number.isInteger(w) || !Number.isInteger(h) ||
    w <= 0 || h <= 0
  ) {
    throw new Error('invalid crop rectangle');
  }
  if (x < 0 || y < 0 || x + w > width || y + h > height) {
    throw new Error('crop rectangle is outside the buffer');
  }

  const rowBytes = w * 4;
  const out = new Uint8Array(rowBytes * h);
  for (let row = 0; row < h; row++) {
    const start = ((y + row) * width + x) * 4;
    out.set(pixels.subarray(start, start + rowBytes), row * rowBytes);
  }
  return out;
}

/**
 * Bounding box of non-black RGB pixels, ignoring alpha.
 *
 * STUB: filled in during item 3 of roadmap Step 3.
 *
 * @param {Uint8Array|Uint8ClampedArray} pixels
 * @param {number} width
 * @param {number} height
 * @returns {{x: number, y: number, width: number, height: number} | null}
 */
export function rgbBounds(pixels, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (pixels[i] !== 0 || pixels[i + 1] !== 0 || pixels[i + 2] !== 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/**
 * FNV-1a over RGB only, ignoring alpha.
 *
 * STUB: filled in during item 3 of roadmap Step 3.
 *
 * @param {Uint8Array|Uint8ClampedArray} pixels
 * @returns {string}
 */
export function hashRgb(pixels) {
  let h = 0x811c9dc5;
  for (let i = 0; i < pixels.length; i += 4) {
    h ^= pixels[i];
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= pixels[i + 1];
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= pixels[i + 2];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
