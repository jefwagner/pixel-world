// Demo of WebGPU rendering
//
// The renderer's pure halves are split across modules:
//
//   projection.mjs     - pure projection constants and matrix maths (no GPU)
//   snapshotPixels.mjs - pure pixel helpers for readback (no GPU)
//   tiles.mjs          - manifest, view-cell and UV-transform helpers (no GPU)
//   demo.js            - this file: WebGPU setup, per-frame encoding, loop
//
// The split exists so the first two can be unit-tested with `node --test`,
// since Node cannot create a GPUDevice. This file's output is verified
// instead by snapshotting the internal buffer and diffing the fingerprint
// against a recorded baseline.
//
// NOTE: index.html loads this as `<script type="module">`, and whatever
// server serves www/ must send .mjs as JavaScript.

import {
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  BUFFER_WIDTH,
  BUFFER_HEIGHT,
  CROP_ORIGIN_X,
  CROP_ORIGIN_Y,
  createCamera,
  placeCamera,
  VIEWS,
} from './projection.mjs';

import {
  bytesPerRowAligned,
  unpadRows,
  summarise,
  toRgba,
  cropRgba,
  rgbBounds,
  hashRgb,
} from './snapshotPixels.mjs';

import {
  sceneParams,
  sheetFor,
  tileNames,
  validateManifest,
  viewCell,
  viewNameForAzimuth,
} from './tiles.mjs';

// All mutable renderer state, in one object. cameraView is read by the scene
// pass on every frame, so changing it here takes effect on the next frame
// with no separate invalidation step.
const state = {
  device: null,
  context: null,
  format: null,

  sceneTexture: null,
  sceneTextureView: null,
  scene: null,
  present: null,
  manifest: null,
  sheets: null,
  tileNames: null,
  tileIndex: 0,

  // Continuous camera target in world space. The camera itself is snapped
  // each frame; this target stays continuous so the crop absorbs the
  // sub-pixel remainder.
  viewTarget: new Float32Array([0.5, 0, 0.5 + 0.1]),

  // Index into VIEWS; starts on the diagonal azimuth 45.
  viewIndex: 1,

  // Derived each frame by placeCamera().
  cameraView: null,
  cropOffset: { x: 0, y: 0 },
};

// Read the internal scene texture back to the CPU as tightly-packed RGBA.
//
// copyTextureToBuffer requires bytesPerRow to be a multiple of 256. At the
// 180px buffer width the RGBA row is 720 bytes, rounded up to 768, so each row
// comes back with 48 bytes of padding that must be stripped or the image
// shears diagonally. The 160px window is 640 bytes, padded to 768 likewise.
//
// The copy is submitted after whatever frames the render loop has already
// queued, so the result reflects the most recently *submitted* frame — at
// most one frame old. That is invisible while the camera is static, and
// matters only once the camera follows a moving character (roadmap Step 6).
//
// @param {GPUDevice} device
// @param {GPUTexture} sceneTexture   must have COPY_SRC usage
// @param {number} width
// @param {number} height
// @param {string} format             the texture's format, e.g. 'bgra8unorm'
// @returns {Promise<{width: number, height: number, format: string,
//                    data: Uint8Array}>}
async function snapshotBuffer(device, sceneTexture, width, height, format, origin = { x: 0, y: 0 }) {
  const bytesPerRow = bytesPerRowAligned(width, 4);
  const readback = device.createBuffer({
    size: bytesPerRow * height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const encoder = device.createCommandEncoder();
  encoder.copyTextureToBuffer(
    { texture: sceneTexture, origin },
    { buffer: readback, bytesPerRow },
    [width, height, 1],
  );
  device.queue.submit([encoder.finish()]);

  await readback.mapAsync(GPUMapMode.READ);
  const padded = new Uint8Array(readback.getMappedRange());
  const data = unpadRows(padded, width, height, bytesPerRow);
  readback.unmap();
  readback.destroy();

  return { width, height, format, data };
}

// Read back the current frame and return its fingerprint.
//
// By default this snapshots the full internal buffer. Pass `{ window: true }`
// to fingerprint only the visible 160x120 crop, which is the way to check
// that the larger buffer did not change the presented image:
//
//   (await snapshot({ window: true })).hash === 'c8f95a5d'
//
// The crop origin is rounded to whole buffer pixels for the copy; fractional
// snap offsets are a present-pass concern, not a readback one. The initial
// on-grid target keeps the origin whole, so its window snapshot is exact.
//
// @param {{window?: boolean}} [options]
// @returns {Promise<{nonBlack: number, total: number, rowWidths: string,
//                    hash: string}>}
async function snapshot({ window: visibleWindow = false } = {}) {
  const width = visibleWindow ? SCREEN_WIDTH : BUFFER_WIDTH;
  const height = visibleWindow ? SCREEN_HEIGHT : BUFFER_HEIGHT;
  const origin = visibleWindow
    ? {
        x: Math.round(CROP_ORIGIN_X + state.cropOffset.x),
        y: Math.round(CROP_ORIGIN_Y + state.cropOffset.y),
      }
    : { x: 0, y: 0 };

  const snap = await snapshotBuffer(
    state.device, state.sceneTexture, width, height, state.format, origin,
  );
  const s = summarise(snap);
  window.lastSnapshot = s;
  console.log(
    `[snapshot${visibleWindow ? ':window' : ''}] ` +
    `nonBlack=${s.nonBlack}/${s.total} ` +
    `rowWidths=${s.rowWidths} hash=${s.hash}`,
  );
  return s;
}

// Exposed for console use. The render loop does not call this — a snapshot
// every frame would bury the console.
window.snapshot = snapshot;

// Compare the rendered cell with the authored manifest cell for the current
// view. RGB only: the authored cell's transparent corners have RGB 0, and the
// scene pass clears to opaque black, so alpha is not comparable.
async function verifyTile() {
  // Let the loop render the current view before copying the buffer.
  await new Promise((resolve) => requestAnimationFrame(() => resolve()));

  const view = VIEWS[state.viewIndex];
  const viewName = viewNameForAzimuth(view.azimuth);
  const tileName = state.tileNames[state.tileIndex];
  const { sheet, rect } = viewCell(state.manifest, tileName, view.azimuth);

  const snap = await snapshotBuffer(
    state.device, state.sceneTexture, BUFFER_WIDTH, BUFFER_HEIGHT, state.format,
  );
  const rgba = toRgba(snap.data, snap.format);
  const bounds = rgbBounds(rgba, snap.width, snap.height);

  if (!bounds) {
    const failed = {
      ok: false,
      viewName,
      tileName,
      bounds: null,
      renderedHash: null,
      authoredHash: null,
    };
    console.error(`[verifyTile] FAIL view=${viewName} tile=${tileName}: empty render`);
    return failed;
  }

  const rendered = cropRgba(
    rgba, snap.width, snap.height,
    bounds.x, bounds.y, bounds.width, bounds.height,
  );
  const renderedHash = hashRgb(rendered);

  const canvas2d = document.createElement('canvas');
  canvas2d.width = rect.width;
  canvas2d.height = rect.height;
  const context2d = canvas2d.getContext('2d');
  context2d.drawImage(
    state.sheets[sheet.name],
    rect.x, rect.y, rect.width, rect.height,
    0, 0, rect.width, rect.height,
  );
  const authoredHash = hashRgb(
    context2d.getImageData(0, 0, rect.width, rect.height).data,
  );

  const ok = bounds.width === rect.width &&
    bounds.height === rect.height &&
    renderedHash === authoredHash;

  const result = {
    ok,
    viewName,
    tileName,
    bounds,
    rect: { ...rect },
    renderedHash,
    authoredHash,
  };
  console.log(
    `[verifyTile] ${ok ? 'ok' : 'FAIL'} view=${viewName} tile=${tileName} ` +
    `bbox=${bounds.width}x${bounds.height} ` +
    `rendered=${renderedHash} authored=${authoredHash}`,
  );
  return result;
}
window.verifyTile = verifyTile;

// Verify every flower variant at the current view. Leaves the last tile
// selected; the results carry each tile's name and hashes.
async function verifyAllTiles() {
  const results = [];
  for (let i = 0; i < state.tileNames.length; i++) {
    state.tileIndex = i;
    results.push(await verifyTile());
  }
  return results;
}
window.verifyAllTiles = verifyAllTiles;

// Get a handle to the gpu adaptor and device
// - early exit with error message is missing
//
// @returns {Promise<{device: GPUDevice, context: GPUCanvasContext,
//                    format: string}>}
async function initGPU() {
  console.log("Checking for webgpu features");
  const adapter = await navigator.gpu?.requestAdapter();
  const device = await adapter?.requestDevice();
  if (!device) {
    throw new Error('...need a browser that supports WebGPU');
  }
  console.log("... webgpu found");

  const context = canvas.getContext('webgpu');
  const format = navigator.gpu?.getPreferredCanvasFormat();
  context.configure({
    device: device,
    format: format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
    alphaMode: 'opaque',
  });
  console.log("Setting Canvas Config");

  return { device, context, format };
}

// Load the flower manifest, its two spritesheets, and the compiled shader.
// Everything else is derived from these.
//
// @param {GPUDevice} device
// @returns {Promise<{manifest: object, cardinalBitmap: ImageBitmap,
//                    diagonalBitmap: ImageBitmap,
//                    shaderModule: GPUShaderModule}>}
async function createAssets(device) {
  console.log("Loading flower manifest");
  const manifestResponse = await fetch('./assets/flowers/flowers.json');
  if (!manifestResponse.ok) {
    throw new Error(`failed to load flowers.json: ${manifestResponse.status}`);
  }
  const manifest = validateManifest(await manifestResponse.json());

  const loadSheet = async (name) => {
    const sheet = sheetFor(manifest, name);
    const url = new URL(sheet.file, manifestResponse.url);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`failed to load ${sheet.file}: ${response.status}`);
    }
    return createImageBitmap(await response.blob());
  };

  console.log("Loading spritesheets");
  const [cardinalBitmap, diagonalBitmap] = await Promise.all([
    loadSheet('cardinal'),
    loadSheet('diagonal'),
  ]);

  console.log("Loading shader");
  const shaderResponse = await fetch("./shader.wgsl");
  const shaderCode = await shaderResponse.text();
  const shaderModule = device.createShaderModule({ code: shaderCode });
  console.log("...shader compiled successfully");

  return { manifest, cardinalBitmap, diagonalBitmap, shaderModule };
}

// The internal low-res render target. Larger than the visible window in both
// axes, so the crop window can slide without re-rasterising the scene.
//
// COPY_SRC is required for snapshotBuffer(); it is not a present-only target.
//
// @param {GPUDevice} device
// @param {string} format
// @returns {GPUTexture}
function createSceneTexture(device, format) {
  console.log("Create low-res canvas");
  return device.createTexture({
    size: [BUFFER_WIDTH, BUFFER_HEIGHT],
    format: format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING |
           GPUTextureUsage.COPY_SRC,
  });
}

// Upload one RGBA spritesheet to a sampled texture.
function createImageTexture(device, imageBitmap) {
  const texture = device.createTexture({
    size: [imageBitmap.width, imageBitmap.height, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING |
           GPUTextureUsage.COPY_DST |
           GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture(
    { source: imageBitmap },
    { texture },
    [imageBitmap.width, imageBitmap.height],
  );
  return texture;
}

// Buffers, textures, bind group and pipeline for the scene pass.
//
// Each vertex is 5 floats: x,y,z followed by u,v. Position and uv share one
// array because for static data the cache locality is better than two.
//
// @param {GPUDevice} device
// @param {{cardinalBitmap: ImageBitmap, diagonalBitmap: ImageBitmap,
//          shaderModule: GPUShaderModule}} assets
// @param {string} format
// @returns {object} scene resources consumed by renderFrame
function createSceneResources(device, assets, format) {
  const { cardinalBitmap, diagonalBitmap, shaderModule } = assets;

  // Create the vertex array
  console.log("Creating vertex/attribute array");
  const vertices = new Float32Array([
    // 0: lower-left
    0, 0, 1,  0, 1,
    // 1: lower-right
    1, 0, 1,  0, 0,
    // 2: upper-right
    1, 0, 0,  1, 0,
    // 3: upper-left
    0, 0, 0,  1, 1,
  ]);

  // Create the index array
  // each set of three indices depicts a triangle
  console.log("Creating index array of triangles");
  const indices = new Uint16Array([
    0, 1, 2, // first triangle with ccw orientation
    0, 2, 3, // second triangle with ccw orientation
  ]);

  console.log("Copying vertex/index data to GPU buffers");
  const vertexBuffer = device.createBuffer({
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, vertices);
  const indexBuffer = device.createBuffer({
    size: indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, indices);

  // Both uniforms are rewritten every frame, so they are created once and
  // never resized.
  const cameraBuffer = device.createBuffer({
    size: 16 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const paramsBuffer = device.createBuffer({
    size: 16 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  console.log("Creating spritesheet textures");
  const cardinalTexture = createImageTexture(device, cardinalBitmap);
  const diagonalTexture = createImageTexture(device, diagonalBitmap);

  // Note: addressModeU/V are left at their default of 'clamp-to-edge'.
  // That is correct for a single quad; it becomes load-bearing in roadmap
  // Step 3, where the UV-to-texel transform samples authored tile art and
  // must not wrap.
  console.log("Creating sampler");
  const sampler = device.createSampler({
    magFilter: 'nearest',
    minFilter: 'nearest',
  });

  console.log("Creating scene bindgroup");
  const sceneBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: {}, // type: 'filtering' is the default
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {}, // cardinal sheet
      },
      {
        binding: 3,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {}, // diagonal sheet
      },
      {
        binding: 4,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
  });
  const sceneBindGroup = device.createBindGroup({
    layout: sceneBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: cameraBuffer } },
      { binding: 1, resource: sampler },
      { binding: 2, resource: cardinalTexture.createView() },
      { binding: 3, resource: diagonalTexture.createView() },
      { binding: 4, resource: { buffer: paramsBuffer } },
    ],
  });

  console.log("Creating pipeline");
  const scenePipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [sceneBindGroupLayout],
  });
  const scenePipeline = device.createRenderPipeline({
    layout: scenePipelineLayout,
    vertex: {
      module: shaderModule,
      entryPoint: 'vs_scene',
      buffers: [{
        arrayStride: 5 * 4, // 5 floats (x,y,z)(u,v), 4 bytes each (f32)
        attributes: [
          {
            shaderLocation: 0,
            offset: 0,
            format: 'float32x3',
          },
          {
            shaderLocation: 1,
            offset: 3 * 4,
            format: 'float32x2',
          },
        ]
      }]
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs_scene',
      targets: [{ format: format }],
    },
    primitive: {
      topology: 'triangle-list',
      frontFace: 'ccw',
      cullMode: 'back',
    }
  });

  return {
    vertexBuffer,
    indexBuffer,
    indexCount: indices.length,
    cameraBuffer,
    paramsBuffer,
    pipeline: scenePipeline,
    bindGroup: sceneBindGroup,
    sampler,
  };
}

// Pipeline and bind group for the present pass, which upscales the internal
// buffer to the canvas. The present pipeline is deliberately vertex-buffer
// free: vs_present generates one large triangle from vertex_index alone.
//
// @param {GPUDevice} device
// @param {{shaderModule: GPUShaderModule}} assets
// @param {string} format
// @param {GPUTextureView} sceneTextureView
// @param {GPUSampler} sampler  shared with the scene pass; both sample
//                             nearest-filtered, so one instance serves both
// @returns {object} present resources consumed by renderFrame
function createPresentResources(device, assets, format, sceneTextureView, sampler) {
  const { shaderModule } = assets;

  // [originU, originV, sizeU, sizeV], rewritten each frame as the crop moves.
  const windowBuffer = device.createBuffer({
    size: 4 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  console.log("Creating presentation bindgroup layout");
  const presentBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ]
  });
  const presentBindGroup = device.createBindGroup({
    layout: presentBindGroupLayout,
    entries: [
      { binding: 0, resource: sampler },
      { binding: 1, resource: sceneTextureView },
      { binding: 2, resource: { buffer: windowBuffer } },
    ],
  });

  const presentPipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [presentBindGroupLayout],
  });
  const presentPipeline = device.createRenderPipeline({
    layout: presentPipelineLayout,
    vertex: {
      module: shaderModule,
      entryPoint: 'vs_present',
      buffers: [],
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs_present',
      targets: [{ format: format }],
    },
    primitive: {
      topology: 'triangle-list',
      frontFace: 'ccw',
      cullMode: 'back',
    },
  });

  return {
    pipeline: presentPipeline,
    bindGroup: presentBindGroup,
    windowBuffer,
  };
}

// Encode and submit exactly one frame: the scene pass into the internal
// buffer, then the present pass from that buffer to the canvas.
//
// The camera matrix is recomputed and re-uploaded every frame rather than
// cached. At this scale that is free, and it means edits to viewIndex or
// viewTarget take effect on the next frame with no invalidation step.
function renderFrame() {
  const view = VIEWS[state.viewIndex];
  const placed = placeCamera(view, state.viewTarget);
  state.cameraView = placed.cameraView;
  state.cropOffset = placed.cropOffset;

  const cameraMatrix = createCamera(state.cameraView);
  state.device.queue.writeBuffer(state.scene.cameraBuffer, 0, cameraMatrix);
  state.device.queue.writeBuffer(state.scene.paramsBuffer, 0, sceneParams(
    state.manifest, state.tileNames[state.tileIndex], view.azimuth,
  ).values);
  state.device.queue.writeBuffer(state.present.windowBuffer, 0, placed.windowRect);

  // There can be no async calls between getting the canvas texture and
  // queueing the commands.
  const canvasTexture = state.context.getCurrentTexture();
  const canvasTextureView = canvasTexture.createView();

  const commandEncoder = state.device.createCommandEncoder();

  const scenePassEncoder = commandEncoder.beginRenderPass({
    colorAttachments: [{
      view: state.sceneTextureView,
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    }]
  });
  scenePassEncoder.setViewport(0, 0, BUFFER_WIDTH, BUFFER_HEIGHT, 0, 1);
  scenePassEncoder.setVertexBuffer(0, state.scene.vertexBuffer);
  scenePassEncoder.setIndexBuffer(state.scene.indexBuffer, 'uint16');
  scenePassEncoder.setPipeline(state.scene.pipeline);
  scenePassEncoder.setBindGroup(0, state.scene.bindGroup);
  scenePassEncoder.drawIndexed(state.scene.indexCount);
  scenePassEncoder.end();

  const presentPassEncoder = commandEncoder.beginRenderPass({
    colorAttachments: [{
      view: canvasTextureView,
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    }]
  });
  presentPassEncoder.setViewport(0, 0, canvas.width, canvas.height, 0, 1);
  presentPassEncoder.setPipeline(state.present.pipeline);
  presentPassEncoder.setBindGroup(0, state.present.bindGroup);
  presentPassEncoder.draw(3);
  presentPassEncoder.end();

  state.device.queue.submit([commandEncoder.finish()]);
}

// Drive renderFrame from the display's refresh. Only GPU *resources* are
// created during init; per-frame work is encoding and submission.
function startRenderLoop() {
  requestAnimationFrame(function loop() {
    renderFrame();
    requestAnimationFrame(loop);
  });
}

// Debug controls. V cycles the eight views; T cycles the flower variants.
// Arrows nudge the continuous view target (Shift = quarter step), so the camera
// snaps at cell boundaries while the crop window slides continuously.
function installViewDebugKeys() {
  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();

    if (key === 'v') {
      state.viewIndex = (state.viewIndex + 1) % VIEWS.length;
      const view = VIEWS[state.viewIndex];
      console.log(
        `[view] index=${state.viewIndex} azimuth=${view.azimuth} kind=${view.kind}`,
      );
      return;
    }

    if (key === 't') {
      state.tileIndex = (state.tileIndex + 1) % state.tileNames.length;
      console.log(
        `[tile] index=${state.tileIndex} name=${state.tileNames[state.tileIndex]}`,
      );
      return;
    }

    const step = event.shiftKey ? 0.0025 : 0.01;
    let dx = 0;
    let dz = 0;

    switch (event.key) {
      case 'ArrowLeft':  dx = -step; break;
      case 'ArrowRight': dx = step;  break;
      case 'ArrowUp':    dz = -step; break;
      case 'ArrowDown':  dz = step;  break;
      default: return;
    }

    event.preventDefault();
    state.viewTarget[0] += dx;
    state.viewTarget[2] += dz;
    console.log(
      `[target] x=${state.viewTarget[0].toFixed(3)} z=${state.viewTarget[2].toFixed(3)}`,
    );
  });
}

// Create the canvas we will be working with
console.log("Creating canvas");
const demoDiv = document.getElementById("demo");
const canvas = document.createElement('canvas');
demoDiv.appendChild(canvas);
canvas.id = 'demoCanvas';
canvas.width = 640;
canvas.height = 480;

// Create all GPU resources. Creation happens exactly once; nothing here is
// called again on subsequent frames.
async function init() {
  const gpu = await initGPU();
  state.device = gpu.device;
  state.context = gpu.context;
  state.format = gpu.format;

  const assets = await createAssets(state.device);
  state.manifest = assets.manifest;
  state.sheets = {
    cardinal: assets.cardinalBitmap,
    diagonal: assets.diagonalBitmap,
  };
  state.tileNames = tileNames(state.manifest);

  state.sceneTexture = createSceneTexture(state.device, state.format);
  state.sceneTextureView = state.sceneTexture.createView();

  // The scene pass owns the sampler and hands it back; the present pass
  // samples the same internal buffer with the same filter, so both bind the
  // one instance rather than creating two identical ones.
  state.scene = createSceneResources(state.device, assets, state.format);
  state.present = createPresentResources(
    state.device, assets, state.format, state.sceneTextureView, state.scene.sampler,
  );

  installViewDebugKeys();

  console.log("Init complete");
}

init()
  .then(async () => {
    // Render one frame and fingerprint it, so the console opens with the
    // baseline the todo.md verification refers to. Log both the full buffer
    // and the visible crop; the latter is the one that should still match the
    // old 160x120 baseline. Then hand over to the loop.
    renderFrame();
    await snapshot();
    await snapshot({ window: true });
    startRenderLoop();
  })
  .catch((err) => {
    console.error(err);
  });
