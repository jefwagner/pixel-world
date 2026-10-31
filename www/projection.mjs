// Projection constants and the matrix builders that consume them.
//
// Deliberately free of WebGPU calls so that Node can import this module and
// unit-test it (`node --test`). The GPU half of the renderer lives in
// demo.js; the verification half lives in snapshotPixels.mjs.
//
// Run the tests with: node --test www/projection.test.mjs

// Visible window in pixels: what the present pass samples and what the
// canvas shows.
export const SCREEN_WIDTH = 160;
export const SCREEN_HEIGHT = 120;

// Internal scene buffer. Larger than the visible window in both axes so the
// crop window can slide without re-rasterising the scene.
export const BUFFER_WIDTH = 180;
export const BUFFER_HEIGHT = 150;

// Constants used to calculate projection matrix
// - 14 pixels per world unit
// - internal buffer is BUFFER_WIDTH x BUFFER_HEIGHT
// - near and far plane simply set large
export const PIX_WU = 14;                    // pixels/world-unit
export const VW = BUFFER_WIDTH / PIX_WU;     // view-width
export const VH = BUFFER_HEIGHT / PIX_WU;    // view-height
export const VDN = -100;                     // view-depth near plane
export const VDF = 100;                      // view-depth far plane

// Default top-left of the visible window inside the buffer (centred).
export const CROP_ORIGIN_X = (BUFFER_WIDTH - SCREEN_WIDTH) / 2;   // 10
export const CROP_ORIGIN_Y = (BUFFER_HEIGHT - SCREEN_HEIGHT) / 2; // 15

// Per-view camera parameters from the knowledge base (Ch1).
//
// The tile is L=14, W=7, so the diagonal diamond has half-diagonals p=10 and
// q=5. The exact derived constants below keep the ground-plane projection
// integral; the rounded Ch1 table values are 1.01015 and 1.00255, elevation
// 30.25 degrees.
export const DIAGONAL_STRETCH_X = (Math.SQRT2 * 10) / 14;        // ≈ 1.01015
export const DIAGONAL_STRETCH_Y = Math.sqrt(
  Math.cos(30 * Math.PI / 180) ** 2 + (2 * 5 ** 2) / (14 ** 2),
);                                                              // ≈ 1.00255
export const DIAGONAL_ELEVATION =
  Math.asin((Math.SQRT2 * 5) / (DIAGONAL_STRETCH_Y * 14)) * 180 / Math.PI; // ≈ 30.25

export const VIEW_KIND = Object.freeze({
  CARDINAL: 'cardinal',
  DIAGONAL: 'diagonal',
});

// The eight camera views, in 45-degree azimuth steps. Cardinal views use the
// 2:1 rectangle camera; diagonal views use the Ch1 stretched camera that makes
// the diamond exactly 20x10 buffer pixels.
export const VIEWS = Object.freeze([
  { azimuth:   0, elevation: 30,                 stretchWidth: 1,                  stretchHeight: 1,                  kind: VIEW_KIND.CARDINAL },
  { azimuth:  45, elevation: DIAGONAL_ELEVATION, stretchWidth: DIAGONAL_STRETCH_X, stretchHeight: DIAGONAL_STRETCH_Y, kind: VIEW_KIND.DIAGONAL },
  { azimuth:  90, elevation: 30,                 stretchWidth: 1,                  stretchHeight: 1,                  kind: VIEW_KIND.CARDINAL },
  { azimuth: 135, elevation: DIAGONAL_ELEVATION, stretchWidth: DIAGONAL_STRETCH_X, stretchHeight: DIAGONAL_STRETCH_Y, kind: VIEW_KIND.DIAGONAL },
  { azimuth: 180, elevation: 30,                 stretchWidth: 1,                  stretchHeight: 1,                  kind: VIEW_KIND.CARDINAL },
  { azimuth: 225, elevation: DIAGONAL_ELEVATION, stretchWidth: DIAGONAL_STRETCH_X, stretchHeight: DIAGONAL_STRETCH_Y, kind: VIEW_KIND.DIAGONAL },
  { azimuth: 270, elevation: 30,                 stretchWidth: 1,                  stretchHeight: 1,                  kind: VIEW_KIND.CARDINAL },
  { azimuth: 315, elevation: DIAGONAL_ELEVATION, stretchWidth: DIAGONAL_STRETCH_X, stretchHeight: DIAGONAL_STRETCH_Y, kind: VIEW_KIND.DIAGONAL },
]);

// A simple flush-to-zero function.
//
// The projection matrix is multiplied out to 16 floats and uploaded as a
// uniform. Sub-1e-15 residues that would be flush-to-zeroed on some hardware
// survive the round trip on others, and the result is texel positions that
// differ by a whole pixel — so the threshold is applied on the CPU, where it
// is deterministic.
export function ftz(num) {
  return Math.abs(num) < 1.0e-15 ? 0 : num;
}

/**
 * Matrix multiply, column-major: out = L * R.
 *
 * Both operands are column-major Float32Array(16), i.e. element (row, col)
 * lives at index col * 4 + row.
 *
 * @param {Float32Array} L
 * @param {Float32Array} R
 * @param {Float32Array} out
 * @returns {Float32Array} out
 */
export function matMul(L, R, out) {
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += L[k * 4 + row] * R[col * 4 + k];
      }
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

/**
 * Cross product of two 3-vectors.
 *
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @param {Float32Array} out
 * @returns {Float32Array} out
 */
export function crossVec3(a, b, out) {
  out[0] = a[1] * b[2] - a[2] * b[1];
  out[1] = a[2] * b[0] - a[0] * b[2];
  out[2] = a[0] * b[1] - a[1] * b[0];
  return out;
}

/**
 * Translation matrix moving `center` to the origin.
 *
 * @param {ArrayLike<number>} center
 * @returns {Float32Array}
 */
export function createTranslation(center) {
  return new Float32Array([
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    -center[0], -center[1], -center[2], 1.0,
  ]);
}

/**
 * Orthographic scale matrix. The 2/VW, 2/VH factors map the view extent onto
 * clip space; the stretch factors widen or narrow the screen axes; the z terms
 * map [VDN, VDF] onto [0, 1].
 *
 * @param {number} stretchWidth   screen-space x stretch (s_x)
 * @param {number} stretchHeight  screen-space y stretch (s_y)
 * @returns {Float32Array}
 */
export function createOrthoScale(stretchWidth, stretchHeight) {
  return new Float32Array([
    2 * stretchWidth / VW, 0, 0, 0,
    0, 2 * stretchHeight / VH, 0, 0,
    0, 0, 1 / (VDF - VDN), 0,
    0, 0, -VDN / (VDF - VDN), 1,
  ]);
}

/**
 * View rotation from spherical angles. Azimuth turns around the y axis;
 * elevation tilts down toward the ground. The matrix rows are the camera
 * basis: right, up, and -dir, so a world vector is expressed in camera axes
 * by this matrix.
 *
 * The parameter order is azimuth first, then elevation. The previous API had
 * them the other way round under the names theta/phi, which read backwards
 * once azimuth-indexed view tables entered the picture.
 *
 * @param {number} azimuth    degrees, 0, 45, ..., 315
 * @param {number} elevation  degrees above the horizon
 * @returns {Float32Array}
 */
export function createViewRotation(azimuth, elevation) {
  const azimuth_rad = azimuth * Math.PI / 180;
  const elevation_rad = elevation * Math.PI / 180;
  const dir = new Float32Array([
    Math.cos(elevation_rad) * Math.cos(azimuth_rad),
    -Math.sin(elevation_rad),
    Math.sin(azimuth_rad) * Math.cos(elevation_rad),
  ]);
  const right = new Float32Array([
    -Math.sin(azimuth_rad),
    0,
    Math.cos(azimuth_rad),
  ]);
  const up = new Float32Array(3);
  crossVec3(right, dir, up);
  return new Float32Array([
    right[0], up[0], -dir[0], 0,
    right[1], up[1], -dir[1], 0,
    right[2], up[2], -dir[2], 0,
    0, 0, 0, 1,
  ]);
}

/**
 * @typedef {Object} CameraView
 * @property {Float32Array} center
 * @property {number} azimuth       degrees, 0, 45, ..., 315
 * @property {number} elevation     degrees above the horizon
 * @property {number} stretchWidth  screen-space x stretch (s_x)
 * @property {number} stretchHeight screen-space y stretch (s_y)
 */

/**
 * @typedef {Object} View
 * @property {number} azimuth
 * @property {number} elevation
 * @property {number} stretchWidth
 * @property {number} stretchHeight
 * @property {'cardinal'|'diagonal'} kind
 */

/**
 * @typedef {Object} CameraSnap
 * @property {Float32Array} renderPos
 *   World camera centre on the constraint grid, as [x, 0, z].
 * @property {{ x: number, y: number }} cropOffset
 *   Sub-pixel remainder in buffer pixels, y down.
 */

// Ground-plane world-(x,z) to buffer-pixel map for a view. The camera basis
// rows are right and up; buffer y grows downward, hence the negated up terms.
// With the exact Ch1 stretch this maps integer world steps to integer pixels.
function groundPlaneMap(view) {
  const V = createViewRotation(view.azimuth, view.elevation);
  const sx = PIX_WU * view.stretchWidth;
  const sy = PIX_WU * view.stretchHeight;
  return {
    m00: sx * V[0],   //  right.x
    m01: sx * V[8],   //  right.z
    m10: -sy * V[1],  // -up.x
    m11: -sy * V[9],  // -up.z
  };
}

/**
 * Snap a continuous camera target onto the view's constraint grid.
 *
 * In buffer-pixel coordinates, with pixel centres at half-integers and edges
 * at integers, the camera centre must satisfy:
 *
 *   cardinal: M*c is (integer, integer)
 *   diagonal: M*c is (integer, half-integer)
 *
 * The diagonal half-integer y puts the diamond's horizontal diagonal on a
 * pixel centre and its vertical diagonal on a pixel edge, which rasterises the
 * 9-row 4,8,12,16,20,16,12,8,4 shape that tiles cleanly. An integer y gives
 * the 10-row shape instead. M maps integer world steps to integer pixels, so
 * both parities are reachable by shifting c by half a buffer pixel.
 *
 * The target stays continuous; the sub-pixel remainder is returned as
 * cropOffset for the present pass.
 *
 * @param {View} view
 * @param {ArrayLike<number>} target  world [x, y, z]; y is ignored
 * @returns {CameraSnap}
 */
export function snapCamera(view, target) {
  const { m00, m01, m10, m11 } = groundPlaneMap(view);
  const tx = target[0];
  const tz = target[2];
  const rawX = m00 * tx + m01 * tz;
  const rawY = m10 * tx + m11 * tz;

  const snappedX = Math.round(rawX);
  const snappedY = view.kind === VIEW_KIND.DIAGONAL
    ? Math.floor(rawY) + 0.5
    : Math.round(rawY);

  // c = target + M^-1 * (snapped - raw), so M*c is exactly the snapped
  // lattice point and the render position is the nearest valid camera centre.
  const det = m00 * m11 - m01 * m10;
  const ex = snappedX - rawX;
  const ey = snappedY - rawY;
  const dx = (m11 * ex - m01 * ey) / det;
  const dz = (-m10 * ex + m00 * ey) / det;

  return {
    renderPos: new Float32Array([tx + dx, 0, tz + dz]),
    cropOffset: { x: rawX - snappedX, y: rawY - snappedY },
  };
}

/**
 * Compose the full camera matrix: scale * view * translation.
 *
 * The multiply order and the trailing ftz pass over the result are both
 * load-bearing for texel-exactness — they are what the snapshot fingerprint
 * in todo.md pins down. Do not reassociate this arithmetic.
 *
 * @param {CameraView} view
 * @returns {Float32Array} column-major 4x4
 */
export function createCamera(view) {
  const T = createTranslation(view.center);
  const V = createViewRotation(view.azimuth, view.elevation);
  const S = createOrthoScale(view.stretchWidth, view.stretchHeight);
  const temp = new Float32Array(16);
  const C = new Float32Array(16);
  matMul(S, V, temp);
  matMul(temp, T, C);
  for (let i = 0; i < C.length; i++) {
    C[i] = ftz(C[i]);
  }
  return C;
}

/**
 * Normalised window rect for the present shader.
 *
 * The shader samples at `rect.xy + uv * rect.zw`, so the rect is expressed in
 * normalised buffer UV: origin first, then size.
 *
 * @param {number} originX  buffer px, top-left of the visible window
 * @param {number} originY  buffer px, top-left of the visible window
 * @returns {Float32Array} [originU, originV, sizeU, sizeV]
 */
export function createWindowRect(originX, originY) {
  return new Float32Array([
    originX / BUFFER_WIDTH,
    originY / BUFFER_HEIGHT,
    SCREEN_WIDTH / BUFFER_WIDTH,
    SCREEN_HEIGHT / BUFFER_HEIGHT,
  ]);
}
