// Demo of WebGPU rendering
//
// I'll try to capture what's happing in notes in front of each block

// Screen-size in pixels
const SCREEN_WIDTH = 160;
const SCREEN_HEIGHT = 120;

// Constants used to calculate projection matrix
// - 14 pixelx per world unit
// - internal canvas is 160x120
// - near and far plane simply set large
const PIX_WU = 14; // 14 pixels/world-unit
const VW = SCREEN_WIDTH/PIX_WU; // view-width
const VH = SCREEN_HEIGHT/PIX_WU; // view-height
const VDN = -100; // view-depth near plane
const VDF = 100; // view-depth far plane

// A simple flush-to-zero function
const FTZ_THRESHOLD = 1.0e-15;
function ftz(num) {
  return Math.abs(num) < FTZ_THRESHOLD ? 0 : num;
}

// First - create the canvas we will be working with
console.log("Creating canvas");
let demoDiv = document.getElementById("demo");
let canvas = document.createElement('canvas');
demoDiv.appendChild(canvas);
canvas.id = 'demoCanvas';
canvas.width = 640;
canvas.height = 480;

// Run the full process as an async function
main();

/**
  * @typedef {Object} CameraView
  * @property {Float32Array} center
  * @property {number} theta
  * @property {number} phi
  * @property {number} stretchWidth
  * @property {number} stretchHeight
  */

/**
 * @type {CameraView}
 */
function createCamera(view) {
  const T = createTranslation(view.center);
  const V = createViewRotation(view.theta, view.phi);
  const S = createOrthoScale(view.stretchWidth, view.stretchHeight);
  let temp = new Float32Array(16);
  let C = new Float32Array(16);
  matMul(S, V, temp);
  matMul(temp, T, C);
  for (let i=0; i<C.length; i++) {
    C[i] = ftz(C[i]);
  }
  return C;
}

/**
 * @type {number}
 */
function createTranslation(center) {
  return new Float32Array([
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    -center[0], -center[1], -center[2], 1.0,
  ]);
}

/**
 * @type {number}
 * #type {number}
 */
function createOrthoScale(sWidth, sHeight) {
  return new Float32Array([
    2/VW, 0, 0, 0,
    0, 2/VH, 0, 0,
    0, 0, 1/(VDF-VDN), 0,
    0, 0, -VDN/(VDF-VDN), 1,
  ])
}

/**
 * @type {number}
 * @type {number}
 */
function createViewRotation(theta, phi) {
  const theta_rad = theta*Math.PI/180;
  const phi_rad = phi*Math.PI/180;
  const dir = new Float32Array([
    Math.cos(phi_rad)*Math.cos(theta_rad),
    -Math.sin(theta_rad),
    Math.sin(phi_rad)*Math.cos(theta_rad),
  ]);
  const right = new Float32Array([
    -Math.sin(phi_rad),
    0,
    Math.cos(phi_rad),
  ]);
  let up = new Float32Array(3);
  crossVec3(right, dir, up);
  return new Float32Array([
    right[0], up[0], -dir[0], 0,
    right[1], up[1], -dir[1], 0,
    right[2], up[2], -dir[2], 0,
    0, 0, 0, 1,
  ]);
}

/**
 * @type {Float32Array}
 * @type {Float32Array}
 * @type {Float32Array}
 */
function crossVec3(a, b, out) {
  out[0] = a[1]*b[2]-a[2]*b[1];
  out[1] = a[2]*b[0]-a[0]*b[2];
  out[2] = a[0]*b[1]-a[1]*b[0];
  return out;
}

/**
 * @type {FLoat32Array}
 * @type {Float32Array}
 * @type {Float32Array}
 */
function matMul(L, R, out) {
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

async function main() {

  /**
    * @typedef {Object} CameraView
    * @property {Float32Array} center
    * @property {number} theta
    * @property {number} phi
    * @property {number} stretchWidth
    * @property {number} stretchHeight
    */
  const cameraView = {
    center: new Float32Array([0.5, 0, 0.5+0.1]),
    theta: 30,
    phi: 45,
    stretchWidth: 1,
    stretchHeight: 1,
  };
  
  // calculate the camera matrix
  const cameraMatrix = createCamera(cameraView);
  console.log("Creating camera matrix");

  // Create the vertex array
  // each vertex is a 4 floats (x,y) (uv)
  // Note: attributes (pos/uv) being in same array is better for static data because 
  // of cache locality
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

  // Load image data
  console.log("Loading texture");
  const imageResponse = await fetch('./color-squares.png');
  const imageBlob = await imageResponse.blob();
  const imageBitmap = await createImageBitmap(imageBlob);

  // get a handle to gpu adaptor and device
  // - early exit with error message is missing
  console.log("Checking for webgpu features");
  const adapter = await navigator.gpu?.requestAdapter();
  const device = await adapter?.requestDevice();
  if (!device) {
    console.error('...need a browser that supports WebGPU');
    return;
  }
  console.log("... webgpu found");

  // Create a new webgpu context in the canvas
  console.log("Setting Canvas Config");
  const context = canvas.getContext('webgpu');
  const format = navigator.gpu?.getPreferredCanvasFormat();
  const canvasConfig = {
    device: device,
    format: format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
    alphaMode: 'opaque',
  };
  context.configure(canvasConfig);

  // Create camera matrix
  console.log("Copying camera matrix data to GPU");
  const cameraBuffer = device.createBuffer({
    size: cameraMatrix.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(cameraBuffer, 0, cameraMatrix);

  // Create buffers and copy data
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

  // Create the texture
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

  // Create a sampler
  console.log("Creating sampler");
  const sampler = device.createSampler({
    magFilter: 'nearest',
    minFilter: 'nearest',
  });

  // Load and compile the shader code
  console.log("Loading shader");
  const shaderResponse = await fetch("./shader.wgsl");
  const shaderCode = await shaderResponse.text();
  const shaderDesc = {
    code: shaderCode
  };
  let shaderModule = device.createShaderModule(shaderDesc);
  console.log("...shader compiled successfully");

  // Create the bindgroup for the uniform and texture
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

  // Create the render pipeline
  console.log("Creating pipeline");
  const scenePipelineLayoutDesc = { bindGroupLayouts: [sceneBindGroupLayout] };
  const scenePipelineLayout = device.createPipelineLayout(scenePipelineLayoutDesc);
  const scenePipelineDesc = {
    layout: scenePipelineLayout,
    vertex: {
      module: shaderModule,
      entryPoint: 'vs_scene',
      buffers: [{
        arrayStride: 5*4, // 4 floats (x,y,z)(u,v) , 4 bytes each (f32)
        attributes: [
          {
            shaderLocation: 0,
            offset: 0,
            format: 'float32x3',
          },
          {
            shaderLocation: 1,
            offset: 3*4,
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
  } 
  let scenePipeline = device.createRenderPipeline(scenePipelineDesc);

  // Create a render pass
  // - get ref to canvas as target texture
  // - create clear color
  // - create command encoder
  //   - create render pass with clear color
  //   - set viewpoint
  //   - set pipeline
  //   - set bindgroup
  //   - send draw command
  //
  // Note: There can be no async calls between getting the canvas texture and queueing
  // the commands
  console.log("Create low-res canvas");
  const sceneTexture = device.createTexture({
    size: [SCREEN_WIDTH, SCREEN_HEIGHT],
    format: format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const sceneTextureView = sceneTexture.createView();

  console.log("Creating clear-color render pass");
  let sceneColorAttachment = {
    view: sceneTextureView,
    clearValue: {r: 0, g: 0, b: 0, a: 1},
    loadOp: 'clear',
    storeOp: 'store',
  };
  const sceneRenderPassDesc = {
    colorAttachments: [sceneColorAttachment]
  };

  console.log("Creating pipeline command queue");
  let commandEncoder = device.createCommandEncoder();
  let scenePassEncoder = commandEncoder.beginRenderPass(sceneRenderPassDesc);
  scenePassEncoder.setViewport(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, 0, 1);
  scenePassEncoder.setVertexBuffer(0, vertexBuffer);
  scenePassEncoder.setIndexBuffer(indexBuffer, 'uint16');
  scenePassEncoder.setPipeline(scenePipeline);
  scenePassEncoder.setBindGroup(0, sceneBindGroup);
  scenePassEncoder.drawIndexed(indices.length);
  scenePassEncoder.end();

  console.log("Getting canvas as target texture");
  let canvasTexture = context.getCurrentTexture();
  let canvasTextureView = canvasTexture.createView();

  console.log("Creating presentation bindgroup layout");
  const presentBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
    ]
  });
  const presentBindGroup = device.createBindGroup({
    layout: presentBindGroupLayout,
    entries: [
      { binding: 0, resource: sampler },
      { binding: 1, resource: sceneTextureView },
    ]
  });

  const presentPipelineLayoutDesc = { bindGroupLayouts: [presentBindGroupLayout] };
  const presentPipelineLayout = device.createPipelineLayout(presentPipelineLayoutDesc);
  const presentPipelineDesc = {
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
  }; 
  let presentPipeline = device.createRenderPipeline(presentPipelineDesc);

  let presentColorAttachment = {
    view: canvasTextureView,
    clearValue: {r: 0, g: 0, b: 0, a: 1},
    loadOp: 'clear',
    storeOp: 'store',
  };
  const presentRenderPassDesc = {
    colorAttachments: [presentColorAttachment]
  };
  let presentPassEncoder = commandEncoder.beginRenderPass(presentRenderPassDesc);
  presentPassEncoder.setViewport(0, 0, canvas.width, canvas.height, 0, 1);
  presentPassEncoder.setPipeline(presentPipeline);
  presentPassEncoder.setBindGroup(0, presentBindGroup);
  presentPassEncoder.draw(3);
  presentPassEncoder.end();

  console.log("Submitting command queue");
  device.queue.submit([commandEncoder.finish()]);
}

