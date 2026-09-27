// Projection constants and the matrix builders that consume them.
//
// Deliberately free of WebGPU calls so that Node can import this module and
// unit-test it (`node --test`). The GPU half of the renderer lives in
// demo.js; the verification half lives in snapshotPixels.mjs.
//
// Run the tests with: node --test www/projection.test.mjs

// Screen-size in pixels
export const SCREEN_WIDTH = 160;
export const SCREEN_HEIGHT = 120;

// Constants used to calculate projection matrix
// - 14 pixels per world unit
// - internal canvas is 160x120
// - near and far plane simply set large
export const PIX_WU = 14;                    // pixels/world-unit
export const VW = SCREEN_WIDTH / PIX_WU;     // view-width
export const VH = SCREEN_HEIGHT / PIX_WU;    // view-height
export const VDN = -100;                     // view-depth near plane
export const VDF = 100;                      // view-depth far plane

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
 * clip space; the z terms map [VDN, VDF] onto [0, 1].
 *
 * @param {number} stretchWidth
 * @param {number} stretchHeight
 * @returns {Float32Array}
 */
export function createOrthoScale(stretchWidth, stretchHeight) {
  return new Float32Array([
    2 / VW, 0, 0, 0,
    0, 2 / VH, 0, 0,
    0, 0, 1 / (VDF - VDN), 0,
    0, 0, -VDN / (VDF - VDN), 1,
  ]);
}

/**
 * View rotation from spherical angles. theta is the azimuth in degrees, phi
 * the elevation. The matrix rows are the camera basis: right, up, and -dir,
 * so a world vector is expressed in camera axes by this matrix.
 *
 * @param {number} theta  azimuth, degrees
 * @param {number} phi    elevation, degrees
 * @returns {Float32Array}
 */
export function createViewRotation(theta, phi) {
  const theta_rad = theta * Math.PI / 180;
  const phi_rad = phi * Math.PI / 180;
  const dir = new Float32Array([
    Math.cos(phi_rad) * Math.cos(theta_rad),
    -Math.sin(theta_rad),
    Math.sin(phi_rad) * Math.cos(theta_rad),
  ]);
  const right = new Float32Array([
    -Math.sin(phi_rad),
    0,
    Math.cos(phi_rad),
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
 * @property {number} theta   azimuth, degrees
 * @property {number} phi     elevation, degrees
 * @property {number} stretchWidth
 * @property {number} stretchHeight
 */

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
  const V = createViewRotation(view.theta, view.phi);
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
