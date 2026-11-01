import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  COMPASS_VIEWS,
  viewNameForAzimuth,
  validateManifest,
  sheetFor,
  viewCell,
  normaliseRect,
  cellTransform,
} from "./tiles.mjs";

const AZIMUTHS = [0, 45, 90, 135, 180, 225, 270, 315];

const realManifest = () => JSON.parse(
  readFileSync(new URL("./assets/flowers/flowers.json", import.meta.url), "utf8"),
);

// A minimal but structurally complete manifest, cloned per test.
const makeFixture = () => ({
  version: 1,
  spritesheets: [
    { name: "cardinal", file: "cardinal.png", width: 56, height: 112 },
    { name: "diagonal", file: "diagonal.png", width: 80, height: 144 },
  ],
  tiles: {
    tile_01: {
      N:  { sheet: "cardinal", x: 0,  y: 0, width: 14, height: 7 },
      E:  { sheet: "cardinal", x: 14, y: 0, width: 14, height: 7 },
      S:  { sheet: "cardinal", x: 28, y: 0, width: 14, height: 7 },
      W:  { sheet: "cardinal", x: 42, y: 0, width: 14, height: 7 },
      NE: { sheet: "diagonal", x: 0,  y: 0, width: 20, height: 9 },
      SE: { sheet: "diagonal", x: 20, y: 0, width: 20, height: 9 },
      SW: { sheet: "diagonal", x: 40, y: 0, width: 20, height: 9 },
      NW: { sheet: "diagonal", x: 60, y: 0, width: 20, height: 9 },
    },
  },
});

// --- COMPASS_VIEWS -----------------------------------------------------

test("COMPASS_VIEWS is the eight-point compass in order", () => {
  assert.deepEqual([...COMPASS_VIEWS], ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
});

// --- viewNameForAzimuth ------------------------------------------------

test("viewNameForAzimuth maps every 45-degree azimuth", () => {
  assert.deepEqual(
    AZIMUTHS.map((azimuth) => viewNameForAzimuth(azimuth)),
    ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
  );
});

test("viewNameForAzimuth normalises out-of-range angles", () => {
  assert.equal(viewNameForAzimuth(360), "N");
  assert.equal(viewNameForAzimuth(-45), "NW");
  assert.equal(viewNameForAzimuth(720), "N");
});

test("viewNameForAzimuth rejects non-multiples of 45", () => {
  for (const azimuth of [30, 22.5, NaN]) {
    assert.throws(() => viewNameForAzimuth(azimuth), /azimuth/);
  }
});

// --- validateManifest --------------------------------------------------

test("validateManifest accepts the fixture and returns it", () => {
  const manifest = makeFixture();
  assert.equal(validateManifest(manifest), manifest);
});

test("the flower manifest validates", () => {
  const manifest = realManifest();
  assert.equal(validateManifest(manifest), manifest);

  assert.deepEqual(
    manifest.spritesheets.map((sheet) => [sheet.name, sheet.width, sheet.height]),
    [["cardinal", 56, 112], ["diagonal", 80, 144]],
  );

  const tileNames = Object.keys(manifest.tiles);
  assert.equal(tileNames.length, 16);

  for (const tileName of tileNames) {
    const tile = manifest.tiles[tileName];
    assert.deepEqual([...Object.keys(tile)].sort(), [...COMPASS_VIEWS].sort());

    for (const [viewName, rect] of Object.entries(tile)) {
      const expected = rect.sheet === "cardinal" ? [14, 7] : [20, 9];
      assert.deepEqual([rect.width, rect.height], expected, `${tileName}/${viewName}`);
    }
  }
});

test("validateManifest rejects a missing or unsupported version", () => {
  const missing = makeFixture();
  delete missing.version;
  assert.throws(() => validateManifest(missing), /version/);

  const unsupported = makeFixture();
  unsupported.version = 2;
  assert.throws(() => validateManifest(unsupported), /version/);
});

test("validateManifest rejects duplicate sheet names", () => {
  const manifest = makeFixture();
  manifest.spritesheets.push({ ...manifest.spritesheets[0] });
  assert.throws(() => validateManifest(manifest), /duplicate/);
});

test("validateManifest rejects an unknown sheet reference", () => {
  const manifest = makeFixture();
  manifest.tiles.tile_01.N.sheet = "missing";
  assert.throws(() => validateManifest(manifest), /unknown spritesheet/);
});

test("validateManifest rejects a tile missing a compass view", () => {
  const manifest = makeFixture();
  delete manifest.tiles.tile_01.NW;
  assert.throws(() => validateManifest(manifest), /missing view NW/);
});

test("validateManifest rejects cells outside their sheet", () => {
  const manifest = makeFixture();
  manifest.tiles.tile_01.N.x = 50; // 50 + 14 > 56
  assert.throws(() => validateManifest(manifest), /outside sheet/);
});

test("validateManifest rejects negative or non-integer cells", () => {
  const negative = makeFixture();
  negative.tiles.tile_01.N.x = -1;
  assert.throws(() => validateManifest(negative), /invalid rect/);

  const fractional = makeFixture();
  fractional.tiles.tile_01.N.y = 0.5;
  assert.throws(() => validateManifest(fractional), /invalid rect/);
});

test("validateManifest rejects an empty tile set", () => {
  const manifest = makeFixture();
  manifest.tiles = {};
  assert.throws(() => validateManifest(manifest), /tiles/);
});

// --- sheetFor ----------------------------------------------------------

test("sheetFor returns the named sheet", () => {
  const manifest = makeFixture();
  assert.equal(sheetFor(manifest, "cardinal"), manifest.spritesheets[0]);
});

test("sheetFor throws for an unknown sheet", () => {
  assert.throws(() => sheetFor(makeFixture(), "nope"), /unknown spritesheet/);
});

// --- viewCell ----------------------------------------------------------

test("viewCell selects the compass cell for the azimuth", () => {
  const manifest = realManifest();

  const north = viewCell(manifest, "flower_01", 0);
  assert.equal(north.sheet.name, "cardinal");
  assert.deepEqual(
    [north.rect.x, north.rect.y, north.rect.width, north.rect.height],
    [0, 0, 14, 7],
  );

  const northeast = viewCell(manifest, "flower_01", 45);
  assert.equal(northeast.sheet.name, "diagonal");
  assert.deepEqual(
    [northeast.rect.x, northeast.rect.y, northeast.rect.width, northeast.rect.height],
    [0, 0, 20, 9],
  );

  const east = viewCell(manifest, "flower_01", 90);
  assert.deepEqual(
    [east.rect.x, east.rect.y, east.rect.width, east.rect.height],
    [14, 0, 14, 7],
  );

  const northwest = viewCell(manifest, "flower_01", 315);
  assert.equal(northwest.sheet.name, "diagonal");
  assert.deepEqual(
    [northwest.rect.x, northwest.rect.y, northwest.rect.width, northwest.rect.height],
    [60, 0, 20, 9],
  );
});

test("viewCell covers every tile and azimuth", () => {
  const manifest = realManifest();

  for (const tileName of Object.keys(manifest.tiles)) {
    for (const azimuth of AZIMUTHS) {
      const { sheet, rect } = viewCell(manifest, tileName, azimuth);
      assert.equal(rect.sheet, sheet.name, `${tileName}/${azimuth}`);
      assert.ok(rect.x >= 0 && rect.y >= 0, `${tileName}/${azimuth}`);
      assert.ok(rect.x + rect.width <= sheet.width, `${tileName}/${azimuth} x`);
      assert.ok(rect.y + rect.height <= sheet.height, `${tileName}/${azimuth} y`);
    }
  }
});

test("viewCell throws for an unknown tile", () => {
  assert.throws(() => viewCell(realManifest(), "nope", 0), /unknown tile/);
});

// --- normaliseRect -----------------------------------------------------

test("normaliseRect maps a cell to atlas UV", () => {
  const cardinal = normaliseRect({ x: 14, y: 7, width: 14, height: 7 }, 56, 112);
  assert.ok(cardinal instanceof Float32Array);
  assert.equal(cardinal.length, 4);
  assert.deepEqual([...cardinal], [0.25, 0.0625, 0.5, 0.125]);

  const diagonal = normaliseRect({ x: 20, y: 9, width: 20, height: 9 }, 80, 144);
  assert.ok(diagonal instanceof Float32Array);
  assert.equal(diagonal.length, 4);
  assert.deepEqual([...diagonal], [0.25, 0.0625, 0.5, 0.125]);
});

// --- cellTransform -----------------------------------------------------

const applyTransform = (t, u, v) => [
  t.m00 * u + t.m01 * v + t.offsetX,
  t.m10 * u + t.m11 * v + t.offsetY,
];

test("cellTransform returns the cardinal affine map", () => {
  const t = cellTransform("cardinal");
  assert.deepEqual(t, {
    m00: 14, m01: 0, m10: 0, m11: 7,
    offsetX: 0, offsetY: 0, width: 14, height: 7,
  });
  assert.deepEqual(applyTransform(t, 0, 0), [0, 0]);
  assert.deepEqual(applyTransform(t, 1, 0), [14, 0]);
  assert.deepEqual(applyTransform(t, 1, 1), [14, 7]);
  assert.deepEqual(applyTransform(t, 0, 1), [0, 7]);
  assert.deepEqual(applyTransform(t, 0.5, 0.5), [7, 3.5]);
});

test("cellTransform returns the diagonal 20x9 affine map", () => {
  const t = cellTransform("diagonal");
  assert.deepEqual(t, {
    m00: 10, m01: 10, m10: 5, m11: -5,
    offsetX: 0, offsetY: 4.5, width: 20, height: 9,
  });
  assert.deepEqual(applyTransform(t, 0, 0), [0, 4.5]);
  assert.deepEqual(applyTransform(t, 1, 0), [10, 9.5]);
  assert.deepEqual(applyTransform(t, 1, 1), [20, 4.5]);
  assert.deepEqual(applyTransform(t, 0, 1), [10, -0.5]);
  assert.deepEqual(applyTransform(t, 0.5, 0.5), [10, 4.5]);
});

test("cellTransform rejects an unknown kind", () => {
  assert.throws(() => cellTransform("isometric"), /unknown view kind/);
});
