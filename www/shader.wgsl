//-------------------
// pass 1 -> scene
//-------------------

// Uniforms for first pass
struct Uniforms {
    cameraMatrix: mat4x4<f32>,
};

// Per-view tile selection and UV-to-texel transform for the first pass.
// transform: m00, m01, m10, m11
// cell:      offsetX, offsetY, cellWidth, cellHeight
// rect:      atlas u0, v0, u1, v1
// flags:     x = 1 for the diagonal sheet, 0 for cardinal
struct SceneParams {
    transform: vec4<f32>,
    cell: vec4<f32>,
    rect: vec4<f32>,
    flags: vec4<f32>,
};

// Bindings for first pass
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var mySampler: sampler;
@group(0) @binding(2) var cardinalTexture: texture_2d<f32>;
@group(0) @binding(3) var diagonalTexture: texture_2d<f32>;
@group(0) @binding(4) var<uniform> sceneParams: SceneParams;

// Output for first pass
struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

// Get UV and position for vertices
@vertex
fn vs_scene(
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>
) -> VertexOutput {
    var out: VertexOutput;
    out.clip_position = uniforms.cameraMatrix * vec4<f32>(position, 1.0);
    out.uv = uv;
    return out;
}

// Map square UV to the authored view cell, then sample it 1:1
@fragment
fn fs_scene(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
	let t = sceneParams.transform;
	let cell = vec2<f32>(
		t.x * uv.x + t.y * uv.y,
		t.z * uv.x + t.w * uv.y,
	) + sceneParams.cell.xy;
	let cellUv = cell / sceneParams.cell.zw;
	let atlasUv = mix(sceneParams.rect.xy, sceneParams.rect.zw, cellUv);

	if (sceneParams.flags.x > 0.5) {
		return textureSample(diagonalTexture, mySampler, atlasUv);
	}
	return textureSample(cardinalTexture, mySampler, atlasUv);
}

//------------------------------
// pass 2 -> present to canvas
//------------------------------

// Output for second pass
struct PresentOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

// bindings for second pass
@group(0) @binding(0) var presSampler: sampler;
@group(0) @binding(1) var presTexture: texture_2d<f32>;

// xy = crop-window origin in normalised buffer UV
// zw = crop-window size in normalised buffer UV
struct PresentWindow {
    rect: vec4<f32>,
};
@group(0) @binding(2) var<uniform> presentWindow: PresentWindow;

// Create single large triangle covering screen
@vertex
fn vs_present(
    @builtin(vertex_index) index: u32
) -> PresentOutput {
    // Single triangle that covers the entire screen
    var positions = array<vec2<f32>, 3>(
	vec2<f32>(-1.0, -1.0),
	vec2<f32>(3.0, -1.0),
	vec2<f32>(-1.0, 3.0)
    );
    var out: PresentOutput;
    let pos = positions[index];
    out.clip_position = vec4<f32>(pos, 0.0, 1.0);
    out.uv = vec2<f32>(pos.x*0.5 + 0.5, 1.0 - (pos.y*0.5 + 0.5));
    return out;
}

// Sample the visible window from inside the larger internal buffer
@fragment
fn fs_present(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
	let windowUv = presentWindow.rect.xy + uv * presentWindow.rect.zw;
	return textureSample(presTexture, presSampler, windowUv);
}

