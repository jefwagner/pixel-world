// Demo of WebGPU rendering
//
// The renderer's two halves are split across three modules:
//
//   projection.mjs     - pure projection constants and matrix maths (no GPU)
//   snapshotPixels.mjs - pure pixel helpers for readback (no GPU)
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
  createWindowRect,
} from './projection.mjs';

import {
  bytesPerRowAligned,
  unpadRows,
  summarise,
} from './snapshotPixels.mjs';

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

  // Top-left of the visible window inside the larger scene buffer, in buffer
  // pixels. Debug keys move this; roadmap Step 4 will feed it from snapCamera.
  cropOrigin: { x: CROP_ORIGIN_X, y: CROP_ORIGIN_Y },

  // The quad sits on the xz plane (y = 0), so `center[1]` is always 0.
  // z = 0.6 is already on the diagonal half-integer parity, which rasterises
  // the 9-row tiling pattern; z = 0.5 is the 10-row parity.
  cameraView: {
    center: new Float32Array([0.5, 0, 0.5 + 0.1]),
    azimuth: 45,
    elevation: 30,
    stretchWidth: 1,
    stretchHeight: 1,
  },
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
// debug offsets are a present-pass concern, not a readback one.
//
// @param {{window?: boolean}} [options]
// @returns {Promise<{nonBlack: number, total: number, rowWidths: string,
//                    hash: string}>}
async function snapshot({ window: visibleWindow = false } = {}) {
  const width = visibleWindow ? SCREEN_WIDTH : BUFFER_WIDTH;
  const height = visibleWindow ? SCREEN_HEIGHT : BUFFER_HEIGHT;
  const origin = visibleWindow
    ? { x: Math.round(state.cropOrigin.x), y: Math.round(state.cropOrigin.y) }
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

// Load the two assets the pipeline needs: the texture image and the compiled
// shader. Everything else is derived from these.
//
// @param {GPUDevice} device
// @returns {Promise<{imageBitmap: ImageBitmap, shaderModule: GPUShaderModule}>}
async function createAssets(device) {
  console.log("Loading texture");
  const imageResponse = await fetch('./color-squares.png');
  const imageBlob = await imageResponse.blob();
  const imageBitmap = await createImageBitmap(imageBlob);

  console.log("Loading shader");
  const shaderResponse = await fetch("./shader.wgsl");
  const shaderCode = await shaderResponse.text();
  const shaderModule = device.createShaderModule({ code: shaderCode });
  console.log("...shader compiled successfully");

  return { imageBitmap, shaderModule };
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

// Buffers, texture, bind group and pipeline for the scene pass.
//
// Each vertex is 5 floats: x,y,z followed by u,v. Position and uv share one
// array because for static data the cache locality is better than two.
//
// @param {GPUDevice} device
// @param {{imageBitmap: ImageBitmap, shaderModule: GPUShaderModule}} assets
// @param {string} format
// @returns {object} scene resources consumed by renderFrame
function createSceneResources(device, assets, format) {  const { imageBitmap, shaderModule } = assets;

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

  // The camera matrix is rewritten every frame, so this buffer is created
  // once and never resized.
  const cameraBuffer = device.createBuffer({
    size: 16 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  console.log("Creating texture for GPU");
  const texture = device.createTexture({
    size: [imageBitmap.width, imageBitmap.height, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING |
           GPUTextureUsage.COPY_DST |
           GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture(
    { source: imageBitmap },
    { texture: texture },
    [ imageBitmap.width, imageBitmap.height],
  );

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
        texture: {}, // sampleType: 'float' is the default
      },
    ],
  });
  const sceneBindGroup = device.createBindGroup({
    layout: sceneBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: cameraBuffer } },
      { binding: 1, resource: sampler },
      { binding: 2, resource: texture.createView() },
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
// cached. At this scale that is free, and it means edits to state.cameraView
// take effect on the next frame with no invalidation step — which is what
// roadmap Step 2's view switching and Step 6's camera follow will want.
function renderFrame() {
  const cameraMatrix = createCamera(state.cameraView);
  state.device.queue.writeBuffer(state.scene.cameraBuffer, 0, cameraMatrix);

  const windowRect = createWindowRect(state.cropOrigin.x, state.cropOrigin.y);
  state.device.queue.writeBuffer(state.present.windowBuffer, 0, windowRect);

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

// Debug controls for the crop window. Arrows move one whole buffer pixel;
// Shift moves a quarter pixel so the nearest-neighbour quantisation crawl is
// visible. The origin is clamped so the window never leaves the buffer.
function installCropDebugKeys() {
  window.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 0.25 : 1;
    let dx = 0;
    let dy = 0;

    switch (event.key) {
      case 'ArrowLeft':  dx = -step; break;
      case 'ArrowRight': dx = step;  break;
      case 'ArrowUp':    dy = -step; break;
      case 'ArrowDown':  dy = step;  break;
      default: return;
    }

    event.preventDefault();
    const maxX = BUFFER_WIDTH - SCREEN_WIDTH;
    const maxY = BUFFER_HEIGHT - SCREEN_HEIGHT;
    state.cropOrigin.x = Math.min(maxX, Math.max(0, state.cropOrigin.x + dx));
    state.cropOrigin.y = Math.min(maxY, Math.max(0, state.cropOrigin.y + dy));
    console.log(`[crop] origin=${state.cropOrigin.x},${state.cropOrigin.y}`);
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

  state.sceneTexture = createSceneTexture(state.device, state.format);
  state.sceneTextureView = state.sceneTexture.createView();

  // The scene pass owns the sampler and hands it back; the present pass
  // samples the same internal buffer with the same filter, so both bind the
  // one instance rather than creating two identical ones.
  state.scene = createSceneResources(state.device, assets, state.format);
  state.present = createPresentResources(
    state.device, assets, state.format, state.sceneTextureView, state.scene.sampler,
  );

  installCropDebugKeys();

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
