//-------------------
// pass 1 -> scene
//-------------------

// Uniforms for first pass
struct Uniforms {
    cameraMatrix: mat4x4<f32>,
};

// Bindings for first pass
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var mySampler: sampler;
@group(0) @binding(2) var myTexture: texture_2d<f32>;

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

// Sample from texture
@fragment
fn fs_scene(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
	return textureSample(myTexture, mySampler, uv);
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

// Sample from texture
@fragment
fn fs_present(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
	return textureSample(presTexture, presSampler, uv);
}

