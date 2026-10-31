import test from "node:test";
import assert from "node:assert/strict";

import {
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  PIX_WU,
  VW,
  VH,
  VDN,
  VDF,
  ftz,
  matMul,
  crossVec3,
  createTranslation,
  createViewRotation,
  createOrthoScale,
  createCamera,
} from "./projection.mjs";

// Tolerances below are sized for float32, not float64. These matrices are
// Float32Array, so every stored value carries ~1e-7 relative rounding; the
// float32 representation of 0.6 alone differs from 0.6 by 2.4e-8. Asserting
// at 1e-12 would fail on correct arithmetic.
const EPS = 1e-6;

// --- ftz ---------------------------------------------------------------

test("ftz zeroes values inside the flush-to-zero deadband", () => {
  assert.equal(ftz(1.0e-16), 0);
  assert.equal(ftz(-1.0e-16), 0);
  assert.equal(ftz(0), 0);
});

test("ftz leaves ordinary magnitudes alone", () => {
  assert.equal(ftz(1), 1);
  assert.equal(ftz(-0.5), -0.5);
});

test("ftz's threshold is strict, so exactly 1e-15 survives", () => {
  // A >= here instead of > would silently flush a value the GPU would keep.
  assert.equal(ftz(1.0e-15), 1.0e-15);
});

// --- matMul ------------------------------------------------------------

const IDENTITY = new Float32Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

test("matMul with the identity returns the other operand", () => {
  const a = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  const out = new Float32Array(16);
  assert.deepEqual([...matMul(a, IDENTITY, out)], [...a]);
  assert.deepEqual([...matMul(IDENTITY, a, out)], [...a]);
});

test("matMul writes into and returns the caller's out buffer", () => {
  const out = new Float32Array(16);
  const ret = matMul(IDENTITY, IDENTITY, out);
  assert.equal(ret, out);
  assert.deepEqual([...out], [...IDENTITY]);
});

test("matMul indexes columns, not rows", () => {
  // Column-major: element (row, col) is at col * 4 + row. This matrix is the
  // translation of 1 unit in x, and it only lands where it does if the
  // indexing is right — the classic bug is a transpose, which moves the
  // translation into the last column instead of the last row.
  const T = createTranslation([1, 2, 3]);
  assert.deepEqual([...T.subarray(0, 4)], [1, 0, 0, 0]);
  assert.deepEqual([...T.subarray(12, 16)], [-1, -2, -3, 1]);
});

test("matMul is not commutative", () => {
  // If a refactor ever made these interchangeable, a column/row mix-up would
  // stop being caught.
  const S = createOrthoScale(1, 1);
  const T = createTranslation([1, 2, 3]);
  const st = new Float32Array(16);
  const ts = new Float32Array(16);
  matMul(S, T, st);
  matMul(T, S, ts);
  assert.notDeepEqual([...st], [...ts]);
});

// --- crossVec3 ---------------------------------------------------------

test("crossVec3 gives the standard basis handedness", () => {
  const x = new Float32Array([1, 0, 0]);
  const y = new Float32Array([0, 1, 0]);
  const z = new Float32Array(3);
  crossVec3(x, y, z);
  assert.deepEqual([...z], [0, 0, 1]);
});

test("crossVec3 is anti-commutative", () => {
  const a = new Float32Array([1, 2, 3]);
  const b = new Float32Array([4, 5, 6]);
  const ab = new Float32Array(3);
  const ba = new Float32Array(3);
  crossVec3(a, b, ab);
  crossVec3(b, a, ba);
  assert.deepEqual([...ab], [...ba].map((v) => -v));
});

test("crossVec3 of a vector with itself is zero", () => {
  const a = new Float32Array([1, 2, 3]);
  const out = new Float32Array(3).fill(99);
  crossVec3(a, a, out);
  assert.deepEqual([...out], [0, 0, 0]);
});

// --- createTranslation -------------------------------------------------

test("createTranslation maps the given centre to the origin", () => {
  const centre = new Float32Array([0.5, 0, 0.6, 1]);
  const T = createTranslation(centre);
  const out = new Float32Array(4);
  for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += T[k * 4 + r] * centre[k];
    out[r] = s;
  }
  assert.ok(Math.abs(out[0]) < EPS, `x was ${out[0]}`);
  assert.ok(Math.abs(out[1]) < EPS, `y was ${out[1]}`);
  assert.ok(Math.abs(out[2]) < EPS, `z was ${out[2]}`);
  assert.ok(Math.abs(out[3] - 1) < EPS, `w was ${out[3]}`);
});

test("createTranslation of the origin is the identity", () => {
  // Compared element-wise rather than with deepEqual: the matrix literal
  // contains -0 for the negated centre, and under assert/strict -0 !== 0.
  const T = createTranslation([0, 0, 0]);
  for (let i = 0; i < 16; i++) {
    assert.ok(Math.abs(T[i] - IDENTITY[i]) < EPS, `element ${i}: ${T[i]}`);
  }
});

// --- createViewRotation ------------------------------------------------

// Pull the three camera basis vectors out of the rotation matrix, which
// stores them as its rows (right, up, -dir).
const basis = (M) => [
  [M[0], M[4], M[8]],
  [M[1], M[5], M[9]],
  [M[2], M[6], M[10]],
];
const norm = (v) => Math.hypot(v[0], v[1], v[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

test("createViewRotation produces an orthonormal basis", () => {
  for (const [theta, phi] of [[0, 0], [30, 45], [90, 45], [315, 45], [180, 30]]) {
    const [right, up, negDir] = basis(createViewRotation(theta, phi));
    for (const v of [right, up, negDir]) {
      assert.ok(Math.abs(norm(v) - 1) < EPS, `|v| for ${theta}/${phi}`);
    }
    assert.ok(Math.abs(dot(right, up)) < EPS, "right . up");
    assert.ok(Math.abs(dot(right, negDir)) < EPS, "right . -dir");
    assert.ok(Math.abs(dot(up, negDir)) < EPS, "up . -dir");
  }
});

test("createViewRotation takes degrees, not radians", () => {
  const M = createViewRotation(30, 45);
  const theta_rad = 30 * Math.PI / 180;
  const phi_rad = 45 * Math.PI / 180;
  const expected = [
    -Math.sin(phi_rad),
    0,
    Math.cos(phi_rad),
  ];
  const [right] = basis(M);
  assert.ok(Math.abs(right[0] - expected[0]) < EPS);
  assert.ok(Math.abs(right[1] - expected[1]) < EPS);
  assert.ok(Math.abs(right[2] - expected[2]) < EPS);
  // If the angles were taken as radians this would be wrong by a wide margin.
  assert.ok(Math.abs(theta_rad - 30) > 1, "sanity: 30 deg is not 30 rad");
});

test("createViewRotation at theta=0, phi=0 gives the expected basis", () => {
  // Looking down -z: right is +z, up is +y, and the negated view direction
  // is -x.
  const [right, up, negDir] = basis(createViewRotation(0, 0));
  assert.ok(Math.abs(right[0] - 0) < EPS);
  assert.ok(Math.abs(right[2] - 1) < EPS);
  assert.ok(Math.abs(up[1] - 1) < EPS);
  assert.ok(Math.abs(negDir[0] + 1) < EPS);
});

// --- createOrthoScale --------------------------------------------------

// Apply a column-major matrix to a point.
const apply = (M, p) => {
  const v = [p[0], p[1], p[2], 1];
  const o = [0, 0, 0, 0];
  for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += M[k * 4 + r] * v[k];
    o[r] = s;
  }
  return o;
};

test("createOrthoScale maps the view extent onto clip space", () => {
  const S = createOrthoScale(1, 1);
  const right = apply(S, [VW / 2, 0, 0]);
  const up = apply(S, [0, VH / 2, 0]);
  assert.ok(Math.abs(right[0] - 1) < EPS, "x extent reaches +1");
  assert.ok(Math.abs(up[1] - 1) < EPS, "y extent reaches +1");
});

test("createOrthoScale maps the depth range onto [0, 1]", () => {
  const S = createOrthoScale(1, 1);
  assert.ok(Math.abs(apply(S, [0, 0, VDN])[2] - 0) < EPS, "near plane is 0");
  assert.ok(Math.abs(apply(S, [0, 0, VDF])[2] - 1) < EPS, "far plane is 1");
});

test("createOrthoScale ignores its stretch arguments", () => {
  // CHARACTERISATION, not endorsement. createOrthoScale(sWidth, sHeight)
  // returns 2/VW and 2/VH regardless of what it is passed, so the
  // stretchWidth/stretchHeight fields of CameraView currently have no
  // effect anywhere in the pipeline. The Ch1 table calls for 1.010 / 1.003
  // on diagonal views, so this is a real gap. It belongs with roadmap
  // Step 2, where the VIEWS table starts passing those values; fixing it
  // here would change camera behaviour under cover of a test-only commit.
  //
  // When the gap is closed, this test should be deleted and replaced with
  // one asserting that 1.010 actually narrows the x extent.
  const a = [...createOrthoScale(1, 1)];
  const b = [...createOrthoScale(1.010, 1.003)];
  assert.deepEqual(b, a, "stretch arguments are currently dead parameters");
});

// --- createCamera ------------------------------------------------------

const CANONICAL_VIEW = {
  center: new Float32Array([0.5, 0, 0.5 + 0.1]),
  theta: 30,
  phi: 45,
  stretchWidth: 1,
  stretchHeight: 1,
};

test("createCamera reproduces the golden matrix for the canonical view", () => {
  // Shortest round-trip literals: each is the exact float32 value widened to
  // a double, so this comparison is bit-exact rather than approximate. The
  // multiply order (scale * view * translation) and the trailing ftz pass are
  // both load-bearing for texel-exactness: reassociating this arithmetic
  // would still be a valid camera and would still look right, but would move
  // texels and change the snapshot hash. These are the values the recorded
  // baseline c8f95a5d depends on.
  //
  // Transposed for readability - matMul stores column-major.
  const expected = [
    -0.1237436830997467, 0.0, 0.1237436830997467, -0.01237437129020691,
    0.0824957937002182, 0.2020726054906845, 0.0824957937002182, -0.09074537456035614,
    -0.0030618621967732906, 0.0024999999441206455, -0.0030618621967732906, 0.5033680200576782,
    0.0, 0.0, 0.0, 1.0,
  ];
  // `v + 0` normalises -0 to +0; the matMul result contains negative zeros
  // and assert/strict's deepEqual distinguishes them.
  // matMul stores column-major; transpose to rows for readability.
  const rowMajor = (M) => {
    const out = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) out.push(M[c * 4 + r] + 0);
    }
    return out;
  };
  assert.deepEqual(rowMajor(createCamera(CANONICAL_VIEW)), expected);
});

test("createCamera leaves no value inside the ftz deadband", () => {
  // If ftz were dropped from createCamera, residues below 1e-15 would survive
  // and the same scene would rasterize differently on different hardware.
  const C = createCamera(CANONICAL_VIEW);
  for (const v of C) {
    assert.ok(v === 0 || Math.abs(v) >= 1.0e-15, `value ${v} is in the deadband`);
  }
});

test("createCamera is deterministic", () => {
  assert.deepEqual([...createCamera(CANONICAL_VIEW)], [...createCamera(CANONICAL_VIEW)]);
});

// Project a world point into internal-buffer pixel coordinates.
const toBufferPx = (C, p) => {
  const o = apply(C, p);
  return [
    (o[0] / o[3] * 0.5 + 0.5) * SCREEN_WIDTH,
    (1 - (o[1] / o[3] * 0.5 + 0.5)) * SCREEN_HEIGHT,
  ];
};

test("the off-constraint centre shifts the image less than its world size", () => {
  // The roadmap describes this centre as "0.6 wu = 8.4 px" off-constraint.
  // That 8.4 px is 0.6 world units at 14 px/wu — an absolute distance, not a
  // screen displacement. The gridline the diamond is actually symmetric
  // about is z = 0.5, so the offset is 0.1 wu, and once projected it is
  // foreshortened: the z axis is not perpendicular to the view, so 0.1 wu
  // moves the image about 1.1 px on screen, not 1.4.
  //
  // Both readings agree the centre is off-constraint. Which one matters for
  // Step 2 depends on where the constraint grid is anchored, so the measured
  // value is pinned here and the roadmap wording is left alone.
  const onGrid = createCamera({ ...CANONICAL_VIEW, center: new Float32Array([0.5, 0, 0.5]) });
  const offGrid = createCamera(CANONICAL_VIEW);

  const a = toBufferPx(onGrid, [0, 0, 0]);
  const b = toBufferPx(offGrid, [0, 0, 0]);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];

  // The off-grid centre puts the quad's near corner to the *left* of where the
  // on-grid centre puts it, and lower on screen.
  assert.ok(Math.abs(dx + 0.98995) < 1e-4, `dx was ${dx}`);
  assert.ok(Math.abs(dy - 0.49500) < 1e-4, `dy was ${dy}`);  // Less than the naive 0.1 * 14 = 1.4 px, because the z axis is
  // foreshortened at phi=45, theta=30.
  assert.ok(Math.hypot(dx, dy) < 0.1 * PIX_WU, "screen shift is under the naive figure");
});

// Rasterize the unit quad's four projected corners and count covered pixels,
// by pixel-centre containment. This is how the snapshot's nonBlack count and
// rowWidths are derived, so pinning it here pins the ground truth that the
// GPU path is expected to reproduce.
const quadCoverage = (C) => {
  const pts = [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]].map((p) => toBufferPx(C, p));
  const inside = (X, Y) => {
    let c = false;
    for (let i = 0, j = 3; i < 4; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (((yi > Y) !== (yj > Y)) && (X < (xj - xi) * (Y - yi) / (yj - yi) + xi)) c = !c;
    }
    return c;
  };
  let n = 0;
  const rows = [];
  for (let y = 0; y < SCREEN_HEIGHT; y++) {
    let w = 0;
    for (let x = 0; x < SCREEN_WIDTH; x++) if (inside(x + 0.5, y + 0.5)) { n++; w++; }
    if (w > 0) rows.push(w);
  }
  return { n, rows: rows.join(","), rowCount: rows.length };
};

test("the off-constraint centre rasterizes 9 rows, the on-grid one 10", () => {
  // This is the finding that made rowWidths part of the snapshot
  // fingerprint. Both cover 100 pixels — the area is conserved while the
  // shape changes — so a non-black count alone could not tell them apart.
  const offGrid = quadCoverage(createCamera(CANONICAL_VIEW));
  assert.equal(offGrid.n, 100);
  assert.equal(offGrid.rows, "4,8,12,16,20,16,12,8,4");
  assert.equal(offGrid.rowCount, 9);

  const onGrid = quadCoverage(createCamera({
    ...CANONICAL_VIEW, center: new Float32Array([0.5, 0, 0.5]),
  }));
  assert.equal(onGrid.n, 100);
  assert.equal(onGrid.rowCount, 10);
  assert.equal(onGrid.rows, "2,6,10,14,18,18,14,10,6,2");
});
