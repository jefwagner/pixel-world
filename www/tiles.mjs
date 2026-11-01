// Pure helpers for the authored flower spritesheets.
//
// Deliberately free of WebGPU and DOM calls so Node can import this module and
// unit-test it (`node --test`). The runtime loader in demo.js fetches the
// manifest and images; this module only validates, selects cells, and computes
// the UV-to-texel transforms.
//
// Run the tests with: node --test www/tiles.test.mjs

export const COMPASS_VIEWS = Object.freeze([
  'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW',
]);

const DEGREES_PER_VIEW = 45;
const FULL_TURN = 360;

/**
 * @typedef {Object} Sheet
 * @property {string} name
 * @property {string} file
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} CellRect
 * @property {string} sheet
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} CellTransform
 * @property {number} m00
 * @property {number} m01
 * @property {number} m10
 * @property {number} m11
 * @property {number} offsetX
 * @property {number} offsetY
 * @property {number} width
 * @property {number} height
 */

const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;
const isNonNegativeInteger = (value) => Number.isInteger(value) && value >= 0;

// The camera's square UVs rotate with the view, while the authored cells are
// pre-rotated. This table is the inverse orientation needed before the
// square-to-diamond transform; it keeps the rendered cell pixel-identical to
// the authored cell rather than rotating it at sample time.
const UV_ORIENTATIONS = Object.freeze({
  N:  Object.freeze({ m00: -1, m01: 0, m10: 0, m11: 1, offsetX: 1, offsetY: 0 }),
  E:  Object.freeze({ m00: 0, m01: 1, m10: 1, m11: 0, offsetX: 0, offsetY: 0 }),
  S:  Object.freeze({ m00: 1, m01: 0, m10: 0, m11: -1, offsetX: 0, offsetY: 1 }),
  W:  Object.freeze({ m00: 0, m01: -1, m10: -1, m11: 0, offsetX: 1, offsetY: 1 }),
  NE: Object.freeze({ m00: 0, m01: 1, m10: -1, m11: 0, offsetX: 0, offsetY: 1 }),
  SE: Object.freeze({ m00: 1, m01: 0, m10: 0, m11: 1, offsetX: 0, offsetY: 0 }),
  SW: Object.freeze({ m00: 0, m01: -1, m10: 1, m11: 0, offsetX: 1, offsetY: 0 }),
  NW: Object.freeze({ m00: -1, m01: 0, m10: 0, m11: -1, offsetX: 1, offsetY: 1 }),
});

/**
 * @typedef {Object} UvOrientation
 * @property {number} m00
 * @property {number} m01
 * @property {number} m10
 * @property {number} m11
 * @property {number} offsetX
 * @property {number} offsetY
 */

/**
 * Square-UV orientation for a compass view.
 *
 * @param {'N'|'NE'|'E'|'SE'|'S'|'SW'|'W'|'NW'} viewName
 * @returns {UvOrientation}
 */
export function viewUvOrientation(viewName) {
  const orientation = UV_ORIENTATIONS[viewName];
  if (!orientation) {
    throw new Error(`unknown view: ${viewName}`);
  }
  return orientation;
}

/**
 * Compass name for an azimuth, normalised modulo 360.
 *
 * @param {number} azimuth  degrees; must be a multiple of 45
 * @returns {'N'|'NE'|'E'|'SE'|'S'|'SW'|'W'|'NW'}
 */
export function viewNameForAzimuth(azimuth) {
  if (typeof azimuth !== 'number' || !Number.isFinite(azimuth)) {
    throw new Error(`azimuth must be a finite number: ${azimuth}`);
  }

  const normalized = ((azimuth % FULL_TURN) + FULL_TURN) % FULL_TURN;
  const index = normalized / DEGREES_PER_VIEW;
  const rounded = Math.round(index);

  if (Math.abs(index - rounded) > 1e-9) {
    throw new Error(`azimuth ${azimuth} is not a multiple of ${DEGREES_PER_VIEW}`);
  }

  return COMPASS_VIEWS[rounded % COMPASS_VIEWS.length];
}

/**
 * Validate the manifest shape and every referenced cell.
 *
 * @param {object} manifest
 * @returns {object} the same manifest
 */
export function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('manifest must be an object');
  }

  if (manifest.version !== 1) {
    throw new Error(`unsupported manifest version: ${manifest.version}`);
  }

  if (!Array.isArray(manifest.spritesheets) || manifest.spritesheets.length === 0) {
    throw new Error('manifest.spritesheets must be a non-empty array');
  }

  const sheets = new Map();
  for (const sheet of manifest.spritesheets) {
    if (!sheet || typeof sheet !== 'object') {
      throw new Error('manifest spritesheet must be an object');
    }
    if (typeof sheet.name !== 'string' || sheet.name.length === 0) {
      throw new Error('spritesheet name must be a non-empty string');
    }
    if (sheets.has(sheet.name)) {
      throw new Error(`duplicate spritesheet name: ${sheet.name}`);
    }
    if (typeof sheet.file !== 'string' || sheet.file.length === 0) {
      throw new Error(`spritesheet ${sheet.name} has no file`);
    }
    if (!isPositiveInteger(sheet.width) || !isPositiveInteger(sheet.height)) {
      throw new Error(`spritesheet ${sheet.name} has invalid dimensions`);
    }
    sheets.set(sheet.name, sheet);
  }

  if (
    !manifest.tiles ||
    typeof manifest.tiles !== 'object' ||
    Array.isArray(manifest.tiles) ||
    Object.keys(manifest.tiles).length === 0
  ) {
    throw new Error('manifest.tiles must be a non-empty object');
  }

  for (const [tileName, tile] of Object.entries(manifest.tiles)) {
    if (!tile || typeof tile !== 'object' || Array.isArray(tile)) {
      throw new Error(`tile ${tileName} must be an object`);
    }

    for (const viewName of COMPASS_VIEWS) {
      const rect = tile[viewName];
      if (!rect || typeof rect !== 'object') {
        throw new Error(`tile ${tileName} is missing view ${viewName}`);
      }
      if (typeof rect.sheet !== 'string' || !sheets.has(rect.sheet)) {
        throw new Error(
          `tile ${tileName}/${viewName} references unknown spritesheet: ${rect.sheet}`,
        );
      }
      if (
        !isNonNegativeInteger(rect.x) ||
        !isNonNegativeInteger(rect.y) ||
        !isPositiveInteger(rect.width) ||
        !isPositiveInteger(rect.height)
      ) {
        throw new Error(`tile ${tileName}/${viewName} has an invalid rect`);
      }

      const sheet = sheets.get(rect.sheet);
      if (rect.x + rect.width > sheet.width || rect.y + rect.height > sheet.height) {
        throw new Error(
          `tile ${tileName}/${viewName} is outside sheet ${rect.sheet}`,
        );
      }
    }
  }

  return manifest;
}

/**
 * Look up a spritesheet by name.
 *
 * @param {object} manifest
 * @param {string} name
 * @returns {Sheet}
 */
export function sheetFor(manifest, name) {
  const sheet = manifest?.spritesheets?.find((entry) => entry.name === name);
  if (!sheet) {
    throw new Error(`unknown spritesheet: ${name}`);
  }
  return sheet;
}

/**
 * Select the manifest cell for a tile and camera azimuth.
 *
 * @param {object} manifest
 * @param {string} tileName
 * @param {number} azimuth
 * @returns {{sheet: Sheet, rect: CellRect}}
 */
export function viewCell(manifest, tileName, azimuth) {
  const tile = manifest?.tiles?.[tileName];
  if (!tile) {
    throw new Error(`unknown tile: ${tileName}`);
  }

  const viewName = viewNameForAzimuth(azimuth);
  const rect = tile[viewName];
  if (!rect) {
    throw new Error(`tile ${tileName} has no view ${viewName}`);
  }

  return { sheet: sheetFor(manifest, rect.sheet), rect };
}

/**
 * Normalised atlas rect for the scene shader.
 *
 * @param {CellRect} rect
 * @param {number} sheetWidth
 * @param {number} sheetHeight
 * @returns {Float32Array} [u0, v0, u1, v1]
 */
export function normaliseRect(rect, sheetWidth, sheetHeight) {
  return new Float32Array([
    rect.x / sheetWidth,
    rect.y / sheetHeight,
    (rect.x + rect.width) / sheetWidth,
    (rect.y + rect.height) / sheetHeight,
  ]);
}

/**
 * @typedef {Object} SceneParams
 * @property {string} sheetName
 * @property {Float32Array} values  16 floats for the scene uniform
 */

/**
 * Base cell transform composed with the view's square-UV orientation.
 *
 * @param {'cardinal'|'diagonal'} kind
 * @param {'N'|'NE'|'E'|'SE'|'S'|'SW'|'W'|'NW'} viewName
 * @returns {CellTransform}
 */
export function orientedCellTransform(kind, viewName) {
  const base = cellTransform(kind);
  const orientation = viewUvOrientation(viewName);

  return {
    m00: base.m00 * orientation.m00 + base.m01 * orientation.m10,
    m01: base.m00 * orientation.m01 + base.m01 * orientation.m11,
    m10: base.m10 * orientation.m00 + base.m11 * orientation.m10,
    m11: base.m10 * orientation.m01 + base.m11 * orientation.m11,
    offsetX: base.m00 * orientation.offsetX + base.m01 * orientation.offsetY + base.offsetX,
    offsetY: base.m10 * orientation.offsetX + base.m11 * orientation.offsetY + base.offsetY,
    width: base.width,
    height: base.height,
  };
}

/**
 * Pack the selected cell into the scene-pass uniform.
 *
 * Layout: [m00,m01,m10,m11, offsetX,offsetY,cellWidth,cellHeight,
 *          u0,v0,u1,v1, diagonalFlag,0,0,0].
 *
 * @param {object} manifest
 * @param {string} tileName
 * @param {number} azimuth
 * @returns {SceneParams}
 */
export function sceneParams(manifest, tileName, azimuth) {
  const { sheet, rect } = viewCell(manifest, tileName, azimuth);
  const transform = orientedCellTransform(sheet.name, viewNameForAzimuth(azimuth));
  const uv = normaliseRect(rect, sheet.width, sheet.height);

  const values = new Float32Array(16);
  values[0] = transform.m00;
  values[1] = transform.m01;
  values[2] = transform.m10;
  values[3] = transform.m11;
  values[4] = transform.offsetX;
  values[5] = transform.offsetY;
  values[6] = transform.width;
  values[7] = transform.height;
  values.set(uv, 8);
  values[12] = sheet.name === 'diagonal' ? 1 : 0;

  return { sheetName: sheet.name, values };
}

/**
 * Affine square-UV to cell-texel transform.
 *
 * Cardinal cells are 14x7. Diagonal cells are 20x9: the 20x10 figure is the
 * theoretical outline, centred at y = 4.5, so the authored cell has 9 rows and
 * the transform carries a +4.5 y offset.
 *
 * @param {'cardinal'|'diagonal'} kind
 * @returns {CellTransform}
 */
export function cellTransform(kind) {
  if (kind === 'cardinal') {
    return {
      m00: 14, m01: 0, m10: 0, m11: 7,
      offsetX: 0, offsetY: 0, width: 14, height: 7,
    };
  }

  if (kind === 'diagonal') {
    return {
      m00: 10, m01: 10, m10: 5, m11: -5,
      offsetX: 0, offsetY: 4.5, width: 20, height: 9,
    };
  }

  throw new Error(`unknown view kind: ${kind}`);
}
