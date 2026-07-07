#include "wasm_d3d8_shim.h"

#include "D3dx8core.h"

#include <cstdint>
#include <cstring>
#include <limits>
#include <map>
#include <new>
#include <vector>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif
#ifndef EMSCRIPTEN_KEEPALIVE
#define EMSCRIPTEN_KEEPALIVE
#endif

#ifdef __EMSCRIPTEN__
extern "C" void cnc_port_note_engine_profile_marker(const char *name) __attribute__((weak));
extern "C" const char *cnc_port_current_engine_profile_marker() __attribute__((weak));
extern "C" const char *cnc_port_current_sorted_draw_submit_profile_marker() __attribute__((weak));
extern "C" int cnc_port_is_sorted_draw_submit_profile_scope() __attribute__((weak));
static bool wasm_d3d8_sorted_draw_profile_enabled()
{
	return cnc_port_is_sorted_draw_submit_profile_scope && cnc_port_is_sorted_draw_submit_profile_scope();
}
#define WASM_D3D8_NOTE_SORTED_DRAW_STEP(enabled, name) \
	do { \
		if ((enabled) && cnc_port_note_engine_profile_marker) { \
			cnc_port_note_engine_profile_marker(name); \
		} \
	} while (0)
#else
static bool wasm_d3d8_sorted_draw_profile_enabled() { return false; }
#define WASM_D3D8_NOTE_SORTED_DRAW_STEP(enabled, name) do { } while (0)
#endif

#ifdef __EMSCRIPTEN__
EM_JS(void, wasm_d3d8_browser_clear_target, (unsigned int flags, unsigned int color_arg, double z, unsigned int stencil), {
	const bridge = typeof Module !== "undefined" ? Module.cncPortD3D8Clear : null;
	if (typeof bridge !== "function") {
		return;
	}
	const color = color_arg >>> 0;
	bridge(
		flags >>> 0,
		(color >>> 16) & 0xff,
		(color >>> 8) & 0xff,
		color & 0xff,
		(color >>> 24) & 0xff,
		z,
		stencil >>> 0,
	);
});
EM_JS(void, wasm_d3d8_browser_set_viewport, (
	unsigned int x,
	unsigned int y,
	unsigned int width,
	unsigned int height,
	double min_z,
	double max_z,
	unsigned int target_width,
	unsigned int target_height
), {
	const bridge = typeof Module !== "undefined" ? Module.cncPortD3D8SetViewport : null;
	if (typeof bridge !== "function") {
		return;
	}
	bridge({
		x: x >>> 0,
		y: y >>> 0,
		width: width >>> 0,
		height: height >>> 0,
		minZ: min_z,
		maxZ: max_z,
		targetWidth: target_width >>> 0,
		targetHeight: target_height >>> 0,
	});
});
EM_JS(void, wasm_d3d8_browser_set_gamma_ramp, (
	unsigned int flags,
	const unsigned short *red,
	const unsigned short *green,
	const unsigned short *blue
), {
	const bridge = typeof Module !== "undefined" ? Module.cncPortD3D8SetGammaRamp : null;
	if (typeof bridge !== "function") {
		return;
	}
	const heap = Module.HEAPU16;
	if (!(heap instanceof Uint16Array) || !red || !green || !blue) {
		return;
	}
	const copyRamp = (ptr) => {
		const start = ptr >>> 1;
		const end = start + 256;
		return Array.from(heap.subarray(start, end), (value) => value >>> 0);
	};
	bridge({
		flags: flags >>> 0,
		red: copyRamp(red),
		green: copyRamp(green),
		blue: copyRamp(blue),
	});
});
EM_JS(void, wasm_d3d8_browser_buffer_create, (
	unsigned int kind,
	unsigned int buffer_id,
	unsigned int byte_size,
	unsigned int usage
), {
	const bridge = typeof Module !== "undefined" ? Module.cncPortD3D8BufferCreate : null;
	if (typeof bridge !== "function") {
		return;
	}
	bridge({
		kind: kind >>> 0,
		id: buffer_id >>> 0,
		byteSize: byte_size >>> 0,
		usage: usage >>> 0,
	});
});
EM_JS(void, wasm_d3d8_browser_buffer_update, (
	unsigned int kind,
	unsigned int buffer_id,
	unsigned int data_ptr,
	unsigned int byte_offset,
	unsigned int byte_size,
	unsigned int usage,
	unsigned int lock_flags,
	unsigned int producer_ptr
), {
	const bridge = typeof Module !== "undefined" ? Module.cncPortD3D8BufferUpdate : null;
	if (typeof bridge !== "function" || typeof Module === "undefined" || !Module.HEAPU8) {
		return;
	}
	const producerTracking =
		typeof globalThis !== "undefined" && globalThis.__cncD3D8BufferProducerTrackingEnabled === true;
	let producer = "";
	if (producerTracking && producer_ptr !== 0) {
		const heap = Module.HEAPU8;
		let end = producer_ptr >>> 0;
		const maxEnd = Math.min(heap.length, end + 160);
		while (end < maxEnd && heap[end] !== 0) {
			end++;
		}
		for (let cursor = producer_ptr >>> 0; cursor < end; cursor++) {
			const code = heap[cursor];
			producer += code >= 0x20 && code < 0x7f ? String.fromCharCode(code) : "?";
		}
	}
	bridge({
		kind: kind >>> 0,
		id: buffer_id >>> 0,
		byteOffset: byte_offset >>> 0,
		byteSize: byte_size >>> 0,
		usage: usage >>> 0,
		lockFlags: lock_flags >>> 0,
		producer,
		bytes: Module.HEAPU8.subarray(data_ptr, data_ptr + byte_size),
	});
});
EM_JS(void, wasm_d3d8_browser_buffer_release, (
	unsigned int kind,
	unsigned int buffer_id
), {
	const bridge = typeof Module !== "undefined" ? Module.cncPortD3D8BufferRelease : null;
	if (typeof bridge !== "function") {
		return;
	}
	bridge({
		kind: kind >>> 0,
		id: buffer_id >>> 0,
	});
});
EM_JS(void, wasm_d3d8_browser_texture_create, (
	unsigned int texture_id,
	unsigned int width,
	unsigned int height,
	unsigned int levels,
	unsigned int format,
	unsigned int usage,
	unsigned int pool
), {
	const bridge = typeof Module !== "undefined" ? Module.cncPortD3D8TextureCreate : null;
	if (typeof bridge !== "function") {
		return;
	}
	bridge({
		id: texture_id >>> 0,
		width: width >>> 0,
		height: height >>> 0,
		levels: levels >>> 0,
		format: format >>> 0,
		usage: usage >>> 0,
		pool: pool >>> 0,
	});
});
EM_JS(void, wasm_d3d8_browser_texture_update, (
	unsigned int texture_id,
	unsigned int level,
	unsigned int format,
	unsigned int x,
	unsigned int y,
	unsigned int width,
	unsigned int height,
	unsigned int pitch,
	unsigned int row_bytes,
	unsigned int data_ptr,
	unsigned int usage,
	unsigned int lock_flags
), {
	const bridge = typeof Module !== "undefined" ? Module.cncPortD3D8TextureUpdate : null;
	if (typeof bridge !== "function" || typeof Module === "undefined" || !Module.HEAPU8) {
		return;
	}
	const update_width = width >>> 0;
	const update_height = height >>> 0;
	const compact_row_bytes = row_bytes >>> 0;
	const source_pitch = pitch >>> 0;
	const D3DFMT_DXT1 = 0x31545844;
	const D3DFMT_DXT2 = 0x32545844;
	const D3DFMT_DXT3 = 0x33545844;
	const D3DFMT_DXT4 = 0x34545844;
	const D3DFMT_DXT5 = 0x35545844;
	const d3d_format = format >>> 0;
	const compressed = d3d_format === D3DFMT_DXT1 || d3d_format === D3DFMT_DXT2 ||
		d3d_format === D3DFMT_DXT3 || d3d_format === D3DFMT_DXT4 ||
		d3d_format === D3DFMT_DXT5;
	const compact_rows = compressed ? Math.ceil(update_height / 4) : update_height;
	const compact = new Uint8Array(compact_row_bytes * compact_rows);
	for (let row = 0; row < compact_rows; ++row) {
		const source = data_ptr + (row * source_pitch);
		const target = row * compact_row_bytes;
		compact.set(Module.HEAPU8.subarray(source, source + compact_row_bytes), target);
	}
	bridge({
		id: texture_id >>> 0,
		level: level >>> 0,
		format: d3d_format,
		x: x >>> 0,
		y: y >>> 0,
		width: update_width,
		height: update_height,
		pitch: source_pitch,
		rowBytes: compact_row_bytes,
		usage: usage >>> 0,
		lockFlags: lock_flags >>> 0,
		bytes: compact,
	});
});
EM_JS(void, wasm_d3d8_browser_volume_texture_create, (
	unsigned int texture_id,
	unsigned int width,
	unsigned int height,
	unsigned int depth,
	unsigned int levels,
	unsigned int format,
	unsigned int usage,
	unsigned int pool
), {
	const bridge = typeof Module !== "undefined" ? Module.cncPortD3D8VolumeTextureCreate : null;
	if (typeof bridge !== "function") {
		return;
	}
	bridge({
		id: texture_id >>> 0,
		width: width >>> 0,
		height: height >>> 0,
		depth: depth >>> 0,
		levels: levels >>> 0,
		format: format >>> 0,
		usage: usage >>> 0,
		pool: pool >>> 0,
	});
});
EM_JS(void, wasm_d3d8_browser_volume_texture_update, (
	unsigned int texture_id,
	unsigned int level,
	unsigned int format,
	unsigned int x,
	unsigned int y,
	unsigned int z,
	unsigned int width,
	unsigned int height,
	unsigned int depth,
	unsigned int row_pitch,
	unsigned int slice_pitch,
	unsigned int row_bytes,
	unsigned int data_ptr,
	unsigned int usage,
	unsigned int lock_flags
), {
	const bridge = typeof Module !== "undefined" ? Module.cncPortD3D8VolumeTextureUpdate : null;
	if (typeof bridge !== "function" || typeof Module === "undefined" || !Module.HEAPU8) {
		return;
	}
	const update_width = width >>> 0;
	const update_height = height >>> 0;
	const update_depth = depth >>> 0;
	const compact_row_bytes = row_bytes >>> 0;
	const source_row_pitch = row_pitch >>> 0;
	const source_slice_pitch = slice_pitch >>> 0;
	const D3DFMT_DXT1 = 0x31545844;
	const D3DFMT_DXT2 = 0x32545844;
	const D3DFMT_DXT3 = 0x33545844;
	const D3DFMT_DXT4 = 0x34545844;
	const D3DFMT_DXT5 = 0x35545844;
	const d3d_format = format >>> 0;
	const compressed = d3d_format === D3DFMT_DXT1 || d3d_format === D3DFMT_DXT2 ||
		d3d_format === D3DFMT_DXT3 || d3d_format === D3DFMT_DXT4 ||
		d3d_format === D3DFMT_DXT5;
	const compact_rows = compressed ? Math.ceil(update_height / 4) : update_height;
	const compact_slice_bytes = compact_row_bytes * compact_rows;
	const compact = new Uint8Array(compact_slice_bytes * update_depth);
	for (let slice = 0; slice < update_depth; ++slice) {
		const source_slice = data_ptr + (slice * source_slice_pitch);
		const target_slice = slice * compact_slice_bytes;
		for (let row = 0; row < compact_rows; ++row) {
			const source = source_slice + (row * source_row_pitch);
			const target = target_slice + (row * compact_row_bytes);
			compact.set(Module.HEAPU8.subarray(source, source + compact_row_bytes), target);
		}
	}
	bridge({
		id: texture_id >>> 0,
		level: level >>> 0,
		format: d3d_format,
		x: x >>> 0,
		y: y >>> 0,
		z: z >>> 0,
		width: update_width,
		height: update_height,
		depth: update_depth,
		rowPitch: source_row_pitch,
		slicePitch: source_slice_pitch,
		rowBytes: compact_row_bytes,
		usage: usage >>> 0,
		lockFlags: lock_flags >>> 0,
		bytes: compact,
	});
});
EM_JS(void, wasm_d3d8_browser_texture_release, (
	unsigned int texture_id
), {
	const bridge = typeof Module !== "undefined" ? Module.cncPortD3D8TextureRelease : null;
	if (typeof bridge !== "function") {
		return;
	}
	bridge({
		id: texture_id >>> 0,
	});
});
EM_JS(void, wasm_d3d8_browser_texture_bind, (
	unsigned int stage,
	unsigned int texture_id
), {
	const bridge = typeof Module !== "undefined" ? Module.cncPortD3D8TextureBind : null;
	if (typeof bridge !== "function") {
		return;
	}
	bridge({
		stage: stage >>> 0,
		id: texture_id >>> 0,
	});
});
EM_JS(int, wasm_d3d8_browser_fbo_bind, (
	unsigned int color_texture_id,
	unsigned int depth_texture_id,
	unsigned int width,
	unsigned int height
), {
	const bridge = typeof Module !== "undefined" ? Module.cncPortD3D8BindFramebuffer : null;
	if (typeof bridge !== "function") {
		return 0;
	}
	return bridge({
		colorTextureId: color_texture_id >>> 0,
		depthTextureId: depth_texture_id >>> 0,
		width: width >>> 0,
		height: height >>> 0,
	}) | 0;
});
EM_JS(void, wasm_d3d8_browser_draw_indexed, (
	int primitive_type,
	unsigned int base_vertex_index,
	unsigned int min_vertex_index,
	unsigned int first_index,
	unsigned int vertex_buffer_id,
	unsigned int vertex_byte_offset,
	unsigned int vertex_byte_size,
	unsigned int vertex_count,
	unsigned int vertex_stride,
	unsigned int vertex_shader_fvf,
	unsigned int index_buffer_id,
	unsigned int index_byte_offset,
	unsigned int index_byte_size,
	unsigned int index_count,
	unsigned int index_size,
	unsigned int transform_mask,
	unsigned int world_ptr,
	unsigned int view_ptr,
	unsigned int projection_ptr,
	unsigned int texture0_transform_ptr,
	unsigned int texture1_transform_ptr,
	unsigned int render_state_ptr,
	unsigned int clip_planes_ptr,
	unsigned int lights_ptr,
	unsigned int material_ptr,
	unsigned int state_hash,
	unsigned int derived_state_hash,
	unsigned int producer_ptr,
	int sorted_draw_profile_scope
), {
	const bridge = typeof Module !== "undefined" ? Module.cncPortD3D8DrawIndexed : null;
	if (typeof bridge !== "function" || typeof Module === "undefined") {
		return;
	}
	const producerTracking =
		typeof globalThis !== "undefined" && globalThis.__cncD3D8DrawProducerTrackingEnabled === true;
	let producer = "";
	if (producerTracking && producer_ptr !== 0 && Module.HEAPU8) {
		const heap = Module.HEAPU8;
		let end = producer_ptr >>> 0;
		const maxEnd = Math.min(heap.length, end + 160);
		while (end < maxEnd && heap[end] !== 0) {
			end++;
		}
		for (let cursor = producer_ptr >>> 0; cursor < end; cursor++) {
			const code = heap[cursor];
			producer += code >= 0x20 && code < 0x7f ? String.fromCharCode(code) : "?";
		}
	}
	const copyMatrix = (ptr) => {
		if (!ptr || !Module.HEAPF32) {
			return null;
		}
		const offset = ptr >>> 2;
		return new Float32Array(Module.HEAPF32.subarray(offset, offset + 16));
	};
	const heapMatrixView = (ptr) => {
		if (!ptr || !Module.HEAPF32) {
			return null;
		}
		const offset = ptr >>> 2;
		return Module.HEAPF32.subarray(offset, offset + 16);
	};
	const copyRenderState = (ptr) => {
		if (!ptr || !Module.HEAPU32) {
			return null;
		}
		const offset = ptr >>> 2;
		const renderStateSlots = 50;
		const textureStageCount = 8;
		const textureStageStateSlots = 29;
		const state = Module.HEAPU32.subarray(offset, offset + renderStateSlots);
		const copyTextureStage = (stage) => {
			const stageOffset = offset + renderStateSlots + (stage * textureStageStateSlots);
			const read = (slot) => Module.HEAPU32[stageOffset + slot] >>> 0;
			return {
				stage,
				colorOp: read(1),
				colorArg1: read(2),
				colorArg2: read(3),
				alphaOp: read(4),
				alphaArg1: read(5),
				alphaArg2: read(6),
				bumpEnvMat00: read(7),
				bumpEnvMat01: read(8),
				bumpEnvMat10: read(9),
				bumpEnvMat11: read(10),
				texCoordIndex: read(11),
				addressU: read(13),
				addressV: read(14),
				borderColor: read(15),
				magFilter: read(16),
				minFilter: read(17),
				mipFilter: read(18),
				mipMapLodBias: read(19),
				maxMipLevel: read(20),
				maxAnisotropy: read(21),
				bumpEnvLScale: read(22),
				bumpEnvLOffset: read(23),
				textureTransformFlags: read(24),
				addressW: read(25),
				colorArg0: read(26),
				alphaArg0: read(27),
				resultArg: read(28),
			};
		};
		const textureStages = [];
		for (let stage = 0; stage < textureStageCount; ++stage) {
			textureStages.push(copyTextureStage(stage));
		}
		return {
			cullMode: state[0] >>> 0,
			zEnable: state[1] >>> 0,
			zWriteEnable: state[2] >>> 0,
			zFunc: state[3] >>> 0,
			alphaBlendEnable: state[4] >>> 0,
			srcBlend: state[5] >>> 0,
			destBlend: state[6] >>> 0,
			blendOp: state[7] >>> 0,
			alphaTestEnable: state[8] >>> 0,
			alphaFunc: state[9] >>> 0,
			alphaRef: state[10] >>> 0,
			colorWriteEnable: state[11] >>> 0,
			textureFactor: state[12] >>> 0,
			stencilEnable: state[13] >>> 0,
			stencilFail: state[14] >>> 0,
			stencilZFail: state[15] >>> 0,
			stencilPass: state[16] >>> 0,
			stencilFunc: state[17] >>> 0,
			stencilRef: state[18] >>> 0,
			stencilMask: state[19] >>> 0,
			stencilWriteMask: state[20] >>> 0,
			fogEnable: state[21] >>> 0,
			fogColor: state[22] >>> 0,
			fogStart: state[23] >>> 0,
			fogEnd: state[24] >>> 0,
			fogVertexMode: state[25] >>> 0,
			rangeFogEnable: state[26] >>> 0,
			fillMode: state[27] >>> 0,
			zBias: state[28] >>> 0,
			shadeMode: state[29] >>> 0,
			lighting: state[30] >>> 0,
			ambient: state[31] >>> 0,
			colorVertex: state[32] >>> 0,
			diffuseMaterialSource: state[33] >>> 0,
			specularMaterialSource: state[34] >>> 0,
			ambientMaterialSource: state[35] >>> 0,
			emissiveMaterialSource: state[36] >>> 0,
			clipping: state[37] >>> 0,
			clipPlaneEnable: state[38] >>> 0,
			specularEnable: state[39] >>> 0,
			normalizeNormals: state[40] >>> 0,
			localViewer: state[41] >>> 0,
			pointSize: state[42] >>> 0,
			pointSizeMin: state[43] >>> 0,
			pointSizeMax: state[44] >>> 0,
			pointSpriteEnable: state[45] >>> 0,
			pointScaleEnable: state[46] >>> 0,
			pointScaleA: state[47] >>> 0,
			pointScaleB: state[48] >>> 0,
			pointScaleC: state[49] >>> 0,
			textureStages,
		};
	};
	const copyClipPlanes = (ptr) => {
		if (!ptr || !Module.HEAPF32) {
			return null;
		}
		const offset = ptr >>> 2;
		const planes = [];
		for (let index = 0; index < 6; ++index) {
			const base = offset + index * 4;
			planes.push(Array.from(Module.HEAPF32.subarray(base, base + 4)));
		}
		return planes;
	};
	const copyLights = (ptr) => {
		if (!ptr || !Module.HEAPU32 || !Module.HEAPF32) {
			return null;
		}
		const lightCount = 8;
		const lightStrideSlots = 27;
		const u32Offset = ptr >>> 2;
		const f32Offset = ptr >>> 2;
		const copyColor = (base) => Array.from(Module.HEAPF32.subarray(base, base + 4));
		const copyVector = (base) => Array.from(Module.HEAPF32.subarray(base, base + 3));
		const lights = [];
		for (let index = 0; index < lightCount; ++index) {
			const baseU32 = u32Offset + index * lightStrideSlots;
			const baseF32 = f32Offset + index * lightStrideSlots;
			lights.push({
				index,
				type: Module.HEAPU32[baseU32] >>> 0,
				enabled: Module.HEAPU32[baseU32 + 1] >>> 0,
				diffuse: copyColor(baseF32 + 2),
				specular: copyColor(baseF32 + 6),
				ambient: copyColor(baseF32 + 10),
				position: copyVector(baseF32 + 14),
				direction: copyVector(baseF32 + 17),
				range: Module.HEAPF32[baseF32 + 20],
				falloff: Module.HEAPF32[baseF32 + 21],
				attenuation0: Module.HEAPF32[baseF32 + 22],
				attenuation1: Module.HEAPF32[baseF32 + 23],
				attenuation2: Module.HEAPF32[baseF32 + 24],
				theta: Module.HEAPF32[baseF32 + 25],
				phi: Module.HEAPF32[baseF32 + 26],
			});
		}
		return lights;
	};
	const copyMaterial = (ptr) => {
		if (!ptr || !Module.HEAPF32) {
			return null;
		}
		const offset = ptr >>> 2;
		const copyColor = (base) => Array.from(Module.HEAPF32.subarray(offset + base, offset + base + 4));
		return {
			diffuse: copyColor(0),
			ambient: copyColor(4),
			specular: copyColor(8),
			emissive: copyColor(12),
			power: Module.HEAPF32[offset + 16],
		};
	};
	const current_state_hash = state_hash >>> 0;
	const current_derived_state_hash = derived_state_hash >>> 0;
	const derived_state_cache_limit = 64;
	const derived_state_cache = Module.__cncPortD3D8DerivedStatePayloadCache instanceof Map
		? Module.__cncPortD3D8DerivedStatePayloadCache
		: (Module.__cncPortD3D8DerivedStatePayloadCache = new Map());
	let cached_state = null;
	if (Module.__cncPortD3D8LastDrawDerivedStateHash === current_derived_state_hash &&
			Module.__cncPortD3D8LastDrawStatePayload) {
		cached_state = Module.__cncPortD3D8LastDrawStatePayload;
	} else if (derived_state_cache.has(current_derived_state_hash)) {
		cached_state = derived_state_cache.get(current_derived_state_hash);
		derived_state_cache.delete(current_derived_state_hash);
		derived_state_cache.set(current_derived_state_hash, cached_state);
		Module.__cncPortD3D8LastDrawDerivedStateHash = current_derived_state_hash;
		Module.__cncPortD3D8LastDrawStatePayload = cached_state;
	} else {
		cached_state = {
			texture0Transform: copyMatrix(texture0_transform_ptr),
			texture1Transform: copyMatrix(texture1_transform_ptr),
			renderState: copyRenderState(render_state_ptr),
			clipPlanes: copyClipPlanes(clip_planes_ptr),
			lights: copyLights(lights_ptr),
			material: copyMaterial(material_ptr),
		};
		derived_state_cache.set(current_derived_state_hash, cached_state);
		if (derived_state_cache.size > derived_state_cache_limit) {
			const oldest_key = derived_state_cache.keys().next().value;
			derived_state_cache.delete(oldest_key);
		}
		Module.__cncPortD3D8LastDrawDerivedStateHash = current_derived_state_hash;
		Module.__cncPortD3D8LastDrawStatePayload = cached_state;
	}
	const transforms = {
		world: heapMatrixView(world_ptr),
		view: heapMatrixView(view_ptr),
		projection: heapMatrixView(projection_ptr),
		texture0: cached_state.texture0Transform,
		texture1: cached_state.texture1Transform,
	};
	bridge({
		primitiveType: primitive_type,
		baseVertexIndex: base_vertex_index >>> 0,
		minVertexIndex: min_vertex_index >>> 0,
		firstIndex: first_index >>> 0,
		vertexBufferId: vertex_buffer_id >>> 0,
		vertexByteOffset: vertex_byte_offset >>> 0,
		vertexBytes: vertex_byte_size >>> 0,
		vertexCount: vertex_count >>> 0,
		vertexStride: vertex_stride >>> 0,
		vertexShaderFvf: vertex_shader_fvf >>> 0,
		indexBufferId: index_buffer_id >>> 0,
		indexByteOffset: index_byte_offset >>> 0,
		indexBytes: index_byte_size >>> 0,
		indexCount: index_count >>> 0,
		indexSize: index_size >>> 0,
		transformMask: transform_mask >>> 0,
		transforms,
		renderState: cached_state.renderState,
		clipPlanes: cached_state.clipPlanes,
		lights: cached_state.lights,
		material: cached_state.material,
		stateHash: current_state_hash,
		derivedStateHash: current_derived_state_hash,
		producer,
		sortedDrawSubmitProfile: sorted_draw_profile_scope !== 0,
	});
	});
#else
void wasm_d3d8_browser_clear_target(unsigned int, unsigned int, double, unsigned int) {}
void wasm_d3d8_browser_set_viewport(unsigned int, unsigned int, unsigned int, unsigned int, double, double,
	unsigned int, unsigned int) {}
void wasm_d3d8_browser_buffer_create(unsigned int, unsigned int, unsigned int, unsigned int) {}
void wasm_d3d8_browser_buffer_update(unsigned int, unsigned int, unsigned int, unsigned int, unsigned int,
	unsigned int, unsigned int, unsigned int) {}
void wasm_d3d8_browser_buffer_release(unsigned int, unsigned int) {}
void wasm_d3d8_browser_texture_create(unsigned int, unsigned int, unsigned int, unsigned int, unsigned int,
	unsigned int, unsigned int) {}
void wasm_d3d8_browser_texture_update(unsigned int, unsigned int, unsigned int, unsigned int, unsigned int,
	unsigned int, unsigned int, unsigned int, unsigned int, unsigned int, unsigned int, unsigned int) {}
void wasm_d3d8_browser_texture_release(unsigned int) {}
void wasm_d3d8_browser_texture_bind(unsigned int, unsigned int) {}
void wasm_d3d8_browser_draw_indexed(int, unsigned int, unsigned int, unsigned int, unsigned int,
	unsigned int, unsigned int, unsigned int, unsigned int, unsigned int, unsigned int, unsigned int, unsigned int,
	unsigned int, unsigned int, unsigned int, unsigned int, unsigned int, unsigned int, unsigned int, unsigned int,
	unsigned int, unsigned int, unsigned int, unsigned int, unsigned int, unsigned int, unsigned int, int) {}
#endif

namespace {

static_assert(sizeof(WasmD3D8DrawLight) == 108,
	"WasmD3D8DrawLight memory layout must match bridge.js copyLights");

WasmD3D8ShimState g_state = {};
bool g_bound_draw_diagnostics_enabled = true;
int g_d3d8_module = 0;
UINT g_next_browser_buffer_id = 1;
UINT g_next_browser_texture_id = 1;

HMODULE d3d8_module_handle()
{
	return &g_d3d8_module;
}

char ascii_lower(char value)
{
	return (value >= 'A' && value <= 'Z') ? static_cast<char>(value - 'A' + 'a') : value;
}

bool ascii_iequals(const char *left, const char *right)
{
	if (left == nullptr || right == nullptr) {
		return false;
	}
	while (*left != '\0' && *right != '\0') {
		if (ascii_lower(*left) != ascii_lower(*right)) {
			return false;
		}
		++left;
		++right;
	}
	return *left == '\0' && *right == '\0';
}

void fill_display_mode(D3DDISPLAYMODE &mode)
{
	mode.Width = 800;
	mode.Height = 600;
	mode.RefreshRate = 60;
	mode.Format = D3DFMT_A8R8G8B8;
}

void fill_caps(D3DCAPS8 &caps)
{
	std::memset(&caps, 0, sizeof(caps));
	caps.AdapterOrdinal = D3DADAPTER_DEFAULT;
	caps.DeviceType = D3DDEVTYPE_HAL;
	caps.Caps2 = D3DCAPS2_FULLSCREENGAMMA;
	caps.PrimitiveMiscCaps = D3DPMISCCAPS_COLORWRITEENABLE;
	caps.RasterCaps = D3DPRASTERCAPS_ZBIAS;
	caps.TextureFilterCaps = D3DPTFILTERCAPS_MINFPOINT | D3DPTFILTERCAPS_MINFLINEAR |
		D3DPTFILTERCAPS_MIPFPOINT | D3DPTFILTERCAPS_MIPFLINEAR |
		D3DPTFILTERCAPS_MAGFPOINT | D3DPTFILTERCAPS_MAGFLINEAR;
	caps.TextureAddressCaps = D3DTADDRESS_WRAP | D3DTADDRESS_CLAMP | D3DTADDRESS_MIRROR;
	caps.TextureOpCaps = D3DTEXOPCAPS_DISABLE | D3DTEXOPCAPS_SELECTARG1 |
		D3DTEXOPCAPS_SELECTARG2 | D3DTEXOPCAPS_MODULATE |
		D3DTEXOPCAPS_MODULATE2X | D3DTEXOPCAPS_MODULATE4X |
		D3DTEXOPCAPS_ADD | D3DTEXOPCAPS_ADDSIGNED |
		D3DTEXOPCAPS_ADDSIGNED2X | D3DTEXOPCAPS_SUBTRACT |
		D3DTEXOPCAPS_ADDSMOOTH | D3DTEXOPCAPS_BLENDDIFFUSEALPHA |
		D3DTEXOPCAPS_BLENDTEXTUREALPHA | D3DTEXOPCAPS_BLENDFACTORALPHA |
		D3DTEXOPCAPS_BLENDCURRENTALPHA | D3DTEXOPCAPS_DOTPRODUCT3 |
		D3DTEXOPCAPS_MULTIPLYADD | D3DTEXOPCAPS_LERP;
	caps.MaxTextureWidth = 4096;
	caps.MaxTextureHeight = 4096;
	caps.MaxTextureRepeat = 4096;
	caps.MaxTextureAspectRatio = 4096;
	caps.MaxAnisotropy = 1;
	caps.MaxVertexW = 1.0f;
	caps.MaxTextureBlendStages = 8;
	caps.MaxSimultaneousTextures = 8;
	caps.MaxActiveLights = 8;
	caps.MaxUserClipPlanes = WASM_D3D8_CLIP_PLANE_COUNT;
	caps.MaxStreams = 8;
	caps.MaxStreamStride = 255;
	caps.MaxPrimitiveCount = 65535;
	caps.MaxVertexIndex = 65535;
	caps.MaxPointSize = 64.0f;
}

void fill_identity_gamma_ramp(D3DGAMMARAMP &ramp)
{
	for (UINT i = 0; i < 256; ++i) {
		const WORD value = static_cast<WORD>(i * 257U);
		ramp.red[i] = value;
		ramp.green[i] = value;
		ramp.blue[i] = value;
	}
}

UINT bytes_per_pixel(D3DFORMAT format)
{
	switch (format) {
		case D3DFMT_R8G8B8:
			return 3;
		case D3DFMT_R5G6B5:
		case D3DFMT_X1R5G5B5:
		case D3DFMT_A1R5G5B5:
		case D3DFMT_A4R4G4B4:
		case D3DFMT_A8L8:
			return 2;
		case D3DFMT_A8:
		case D3DFMT_P8:
		case D3DFMT_L8:
			return 1;
		default:
			return 4;
	}
}

bool is_block_compressed_format(D3DFORMAT format)
{
	switch (format) {
		case D3DFMT_DXT1:
		case D3DFMT_DXT2:
		case D3DFMT_DXT3:
		case D3DFMT_DXT4:
		case D3DFMT_DXT5:
			return true;
		default:
			return false;
	}
}

bool is_browser_texture_format_supported(D3DFORMAT format)
{
	switch (format) {
		// D3DFMT_R8G8B8 deliberately stays out of caps advertising. The WebGL
		// bridge can upload 24-bit rows, but WW3D's SurfaceClass::DrawPixel()
		// has no 3-byte pixel write path; advertising it makes W3DRadar choose
		// a terrain texture format that remains black.
		case D3DFMT_A8R8G8B8:
		case D3DFMT_X8R8G8B8:
		case D3DFMT_R5G6B5:
		case D3DFMT_X1R5G5B5:
		case D3DFMT_A1R5G5B5:
		case D3DFMT_A4R4G4B4:
		case D3DFMT_X4R4G4B4:
		case D3DFMT_A8:
		case D3DFMT_L8:
		case D3DFMT_A8L8:
		case D3DFMT_DXT1:
		case D3DFMT_DXT2:
		case D3DFMT_DXT3:
		case D3DFMT_DXT4:
		case D3DFMT_DXT5:
			return true;
		default:
			return false;
	}
}

bool is_browser_render_target_format_supported(D3DFORMAT format)
{
	switch (format) {
		case D3DFMT_X1R5G5B5:
		case D3DFMT_R5G6B5:
		case D3DFMT_X8R8G8B8:
		case D3DFMT_A8R8G8B8:
			return true;
		default:
			return false;
	}
}

bool is_browser_depth_stencil_format_supported(D3DFORMAT format)
{
	switch (format) {
		case D3DFMT_D16_LOCKABLE:
		case D3DFMT_D16:
		case D3DFMT_D24X8:
		case D3DFMT_D24S8:
			return true;
		default:
			return false;
	}
}

UINT block_bytes(D3DFORMAT format)
{
	switch (format) {
		case D3DFMT_DXT1:
			return 8;
		case D3DFMT_DXT2:
		case D3DFMT_DXT3:
		case D3DFMT_DXT4:
		case D3DFMT_DXT5:
			return 16;
		default:
			return 0;
	}
}

UINT block_count(UINT texels)
{
	return (texels + 3) / 4;
}

UINT texture_pitch(D3DFORMAT format, UINT width)
{
	if (is_block_compressed_format(format)) {
		return block_count(width) * block_bytes(format);
	}
	return width * bytes_per_pixel(format);
}

UINT texture_storage_rows(D3DFORMAT format, UINT height)
{
	return is_block_compressed_format(format) ? block_count(height) : height;
}

UINT texture_level_size(D3DFORMAT format, UINT width, UINT height)
{
	return texture_pitch(format, width) * texture_storage_rows(format, height);
}

UINT texture_volume_level_size(D3DFORMAT format, UINT width, UINT height, UINT depth)
{
	return texture_level_size(format, width, height) * depth;
}

void identity_matrix(D3DMATRIX &matrix)
{
	std::memset(&matrix, 0, sizeof(matrix));
	matrix.m[0][0] = 1.0f;
	matrix.m[1][1] = 1.0f;
	matrix.m[2][2] = 1.0f;
	matrix.m[3][3] = 1.0f;
}

D3DMATRIX multiply_matrix(const D3DMATRIX &left, const D3DMATRIX &right)
{
	D3DMATRIX result = {};
	for (int row = 0; row < 4; ++row) {
		for (int column = 0; column < 4; ++column) {
			for (int index = 0; index < 4; ++index) {
				result.m[row][column] += left.m[row][index] * right.m[index][column];
			}
		}
	}
	return result;
}

D3DMATERIAL8 default_d3d8_material()
{
	D3DMATERIAL8 material = {};
	material.Diffuse = { 1.0f, 1.0f, 1.0f, 1.0f };
	material.Ambient = { 1.0f, 1.0f, 1.0f, 1.0f };
	material.Specular = { 0.0f, 0.0f, 0.0f, 0.0f };
	material.Emissive = { 0.0f, 0.0f, 0.0f, 0.0f };
	material.Power = 1.0f;
	return material;
}

WasmD3D8DrawMaterial draw_material_from_d3d(const D3DMATERIAL8 &material)
{
	WasmD3D8DrawMaterial draw_material = {};
	draw_material.diffuse = material.Diffuse;
	draw_material.ambient = material.Ambient;
	draw_material.specular = material.Specular;
	draw_material.emissive = material.Emissive;
	draw_material.power = material.Power;
	return draw_material;
}

WasmD3D8DrawLight draw_light_from_d3d(const D3DLIGHT8 &light, BOOL enabled)
{
	WasmD3D8DrawLight draw_light = {};
	draw_light.type = static_cast<DWORD>(light.Type);
	draw_light.enabled = enabled ? TRUE : FALSE;
	draw_light.diffuse = light.Diffuse;
	draw_light.specular = light.Specular;
	draw_light.ambient = light.Ambient;
	draw_light.position = light.Position;
	draw_light.direction = light.Direction;
	draw_light.range = light.Range;
	draw_light.falloff = light.Falloff;
	draw_light.attenuation0 = light.Attenuation0;
	draw_light.attenuation1 = light.Attenuation1;
	draw_light.attenuation2 = light.Attenuation2;
	draw_light.theta = light.Theta;
	draw_light.phi = light.Phi;
	return draw_light;
}

DWORD checksum_bytes(const BYTE *data, UINT size)
{
	if (data == nullptr || size == 0) {
		return 0;
	}
	DWORD hash = 2166136261u;
	for (UINT index = 0; index < size; ++index) {
		hash ^= data[index];
		hash *= 16777619u;
	}
	return hash;
}

DWORD checksum_texture_region(const BYTE *data, UINT pitch, UINT row_bytes, UINT height)
{
	if (data == nullptr || pitch == 0 || row_bytes == 0 || height == 0) {
		return 0;
	}
	DWORD hash = 2166136261u;
	for (UINT row = 0; row < height; ++row) {
		const BYTE *row_data = data + (row * pitch);
		for (UINT column = 0; column < row_bytes; ++column) {
			hash ^= row_data[column];
			hash *= 16777619u;
		}
	}
	return hash;
}

DWORD checksum_texture_volume_region(const BYTE *data, UINT row_pitch, UINT slice_pitch, UINT row_bytes,
	UINT height, UINT depth)
{
	if (data == nullptr || row_pitch == 0 || slice_pitch == 0 || row_bytes == 0 || height == 0 ||
		depth == 0) {
		return 0;
	}
	DWORD hash = 2166136261u;
	for (UINT slice = 0; slice < depth; ++slice) {
		const BYTE *slice_data = data + (slice * slice_pitch);
		for (UINT row = 0; row < height; ++row) {
			const BYTE *row_data = slice_data + (row * row_pitch);
			for (UINT column = 0; column < row_bytes; ++column) {
				hash ^= row_data[column];
				hash *= 16777619u;
			}
		}
	}
	return hash;
}

constexpr UINT DRAW_TRANSFORM_WORLD = 1u << 0;
constexpr UINT DRAW_TRANSFORM_VIEW = 1u << 1;
constexpr UINT DRAW_TRANSFORM_PROJECTION = 1u << 2;
constexpr UINT DRAW_TEXTURE_TRANSFORM_STAGE0 = 1u << 0;
constexpr UINT DRAW_TEXTURE_TRANSFORM_STAGE1 = 1u << 1;
constexpr UINT BROWSER_BUFFER_VERTEX = 1u;
constexpr UINT BROWSER_BUFFER_INDEX = 2u;

struct BrowserD3DTextureDirtyRegion
{
	const BYTE *data = nullptr;
	UINT x = 0;
	UINT y = 0;
	UINT width = 0;
	UINT height = 0;
	UINT pitch = 0;
	UINT row_bytes = 0;
	DWORD lock_flags = 0;
};

struct BrowserD3DVolumeTextureDirtyRegion
{
	const BYTE *data = nullptr;
	UINT x = 0;
	UINT y = 0;
	UINT z = 0;
	UINT width = 0;
	UINT height = 0;
	UINT depth = 0;
	UINT row_pitch = 0;
	UINT slice_pitch = 0;
	UINT row_bytes = 0;
	DWORD lock_flags = 0;
};

UINT checked_range_size(UINT length, UINT offset, UINT requested_size)
{
	if (offset > length) {
		return 0;
	}
	const UINT available = length - offset;
	return requested_size <= available ? requested_size : available;
}

class BufferChecksumCache
{
public:
	void invalidate()
	{
		++m_revision;
		if (m_revision == 0) {
			m_revision = 1;
			for (ChecksumCacheEntry &entry : m_entries) {
				entry.valid = false;
			}
		}
	}

	DWORD checksum(const BYTE *data, UINT length, UINT offset, UINT size) const
	{
		const UINT checked_size = checked_range_size(length, offset, size);
		if (data == nullptr || checked_size == 0) {
			return 0;
		}
		++m_clock;
		for (ChecksumCacheEntry &entry : m_entries) {
			if (entry.valid && entry.revision == m_revision && entry.offset == offset &&
					entry.size == checked_size) {
				entry.last_used = m_clock;
				++g_state.draw_buffer_checksum_cache_hits;
				return entry.value;
			}
		}

		DWORD value = checksum_bytes(data + offset, checked_size);
		ChecksumCacheEntry *victim = &m_entries[0];
		for (ChecksumCacheEntry &entry : m_entries) {
			if (!entry.valid) {
				victim = &entry;
				break;
			}
			if (entry.last_used < victim->last_used) {
				victim = &entry;
			}
		}
		victim->valid = true;
		victim->revision = m_revision;
		victim->offset = offset;
		victim->size = checked_size;
		victim->value = value;
		victim->last_used = m_clock;
		++g_state.draw_buffer_checksum_cache_misses;
		return value;
	}

private:
	struct ChecksumCacheEntry
	{
		bool valid = false;
		std::uint64_t revision = 0;
		UINT offset = 0;
		UINT size = 0;
		DWORD value = 0;
		std::uint64_t last_used = 0;
	};

	static constexpr UINT CACHE_ENTRY_COUNT = 32;
	mutable ChecksumCacheEntry m_entries[CACHE_ENTRY_COUNT] = {};
	std::uint64_t m_revision = 1;
	mutable std::uint64_t m_clock = 0;
};

UINT primitive_vertex_count(D3DPRIMITIVETYPE primitive_type, UINT primitive_count)
{
	switch (primitive_type) {
		case D3DPT_POINTLIST:
			return primitive_count;
		case D3DPT_LINELIST:
			return primitive_count * 2;
		case D3DPT_LINESTRIP:
			return primitive_count + 1;
		case D3DPT_TRIANGLELIST:
			return primitive_count * 3;
		case D3DPT_TRIANGLESTRIP:
		case D3DPT_TRIANGLEFAN:
			return primitive_count + 2;
		default:
			return 0;
	}
}

void browser_clear_target(DWORD flags, D3DCOLOR color, float z, DWORD stencil)
{
	wasm_d3d8_browser_clear_target(
		static_cast<unsigned int>(flags),
		static_cast<unsigned int>(color),
		static_cast<double>(z),
		static_cast<unsigned int>(stencil));
}

void browser_buffer_create(UINT kind, UINT buffer_id, UINT byte_size, DWORD usage)
{
	if (buffer_id == 0 || byte_size == 0) {
		return;
	}
	++g_state.browser_buffer_create_calls;
	g_state.last_browser_buffer_kind = kind;
	g_state.last_browser_buffer_id = buffer_id;
	g_state.last_browser_buffer_offset = 0;
	g_state.last_browser_buffer_bytes = byte_size;
	g_state.last_browser_buffer_usage = usage;
	g_state.last_browser_buffer_lock_flags = 0;
	wasm_d3d8_browser_buffer_create(kind, buffer_id, byte_size, usage);
}

void browser_buffer_update(UINT kind, UINT buffer_id, const BYTE *data, UINT byte_offset, UINT byte_size, DWORD usage,
	DWORD lock_flags)
{
	if (buffer_id == 0 || data == nullptr || byte_size == 0) {
		return;
	}
	++g_state.browser_buffer_update_calls;
	g_state.last_browser_buffer_kind = kind;
	g_state.last_browser_buffer_id = buffer_id;
	g_state.last_browser_buffer_offset = byte_offset;
	g_state.last_browser_buffer_bytes = byte_size;
	g_state.last_browser_buffer_usage = usage;
	g_state.last_browser_buffer_lock_flags = lock_flags;
#ifdef __EMSCRIPTEN__
	const char *producer = cnc_port_current_engine_profile_marker ? cnc_port_current_engine_profile_marker() : nullptr;
#else
	const char *producer = nullptr;
#endif
	wasm_d3d8_browser_buffer_update(
		kind,
		buffer_id,
		static_cast<unsigned int>(reinterpret_cast<std::uintptr_t>(data)),
		byte_offset,
		byte_size,
		usage,
		lock_flags,
		static_cast<unsigned int>(reinterpret_cast<std::uintptr_t>(producer)));
}

void browser_buffer_release(UINT kind, UINT buffer_id)
{
	if (buffer_id == 0) {
		return;
	}
	++g_state.browser_buffer_release_calls;
	g_state.last_browser_buffer_kind = kind;
	g_state.last_browser_buffer_id = buffer_id;
	g_state.last_browser_buffer_offset = 0;
	g_state.last_browser_buffer_bytes = 0;
	g_state.last_browser_buffer_usage = 0;
	g_state.last_browser_buffer_lock_flags = 0;
	wasm_d3d8_browser_buffer_release(kind, buffer_id);
}

void browser_texture_create(UINT texture_id, UINT width, UINT height, UINT levels, D3DFORMAT format, DWORD usage,
	D3DPOOL pool)
{
	if (texture_id == 0 || width == 0 || height == 0 || levels == 0) {
		return;
	}
	++g_state.browser_texture_create_calls;
	g_state.last_browser_texture_id = texture_id;
	g_state.last_browser_texture_level = 0;
	g_state.last_browser_texture_x = 0;
	g_state.last_browser_texture_y = 0;
	g_state.last_browser_texture_z = 0;
	g_state.last_browser_texture_width = width;
	g_state.last_browser_texture_height = height;
	g_state.last_browser_texture_depth = 1;
	g_state.last_browser_texture_pitch = texture_pitch(format, width);
	g_state.last_browser_texture_row_bytes = g_state.last_browser_texture_pitch;
	g_state.last_browser_texture_slice_pitch = texture_level_size(format, width, height);
	g_state.last_browser_texture_bytes = texture_level_size(format, width, height);
	g_state.last_browser_texture_levels = levels;
	g_state.last_browser_texture_format = format;
	g_state.last_browser_texture_usage = usage;
	g_state.last_browser_texture_pool = pool;
	g_state.last_browser_texture_lock_flags = 0;
	g_state.last_browser_texture_checksum = 0;
	wasm_d3d8_browser_texture_create(texture_id, width, height, levels, format, usage, pool);
}

void browser_volume_texture_create(UINT texture_id, UINT width, UINT height, UINT depth, UINT levels,
	D3DFORMAT format, DWORD usage, D3DPOOL pool)
{
	if (texture_id == 0 || width == 0 || height == 0 || depth == 0 || levels == 0) {
		return;
	}
	++g_state.browser_texture_create_calls;
	g_state.last_browser_texture_id = texture_id;
	g_state.last_browser_texture_level = 0;
	g_state.last_browser_texture_x = 0;
	g_state.last_browser_texture_y = 0;
	g_state.last_browser_texture_z = 0;
	g_state.last_browser_texture_width = width;
	g_state.last_browser_texture_height = height;
	g_state.last_browser_texture_depth = depth;
	g_state.last_browser_texture_pitch = texture_pitch(format, width);
	g_state.last_browser_texture_row_bytes = g_state.last_browser_texture_pitch;
	g_state.last_browser_texture_slice_pitch = texture_level_size(format, width, height);
	g_state.last_browser_texture_bytes = texture_volume_level_size(format, width, height, depth);
	g_state.last_browser_texture_levels = levels;
	g_state.last_browser_texture_format = format;
	g_state.last_browser_texture_usage = usage;
	g_state.last_browser_texture_pool = pool;
	g_state.last_browser_texture_lock_flags = 0;
	g_state.last_browser_texture_checksum = 0;
	wasm_d3d8_browser_volume_texture_create(texture_id, width, height, depth, levels, format, usage, pool);
}

void browser_texture_update(UINT texture_id, UINT level, D3DFORMAT format, const BrowserD3DTextureDirtyRegion &dirty,
	DWORD usage)
{
	if (texture_id == 0 || dirty.data == nullptr || dirty.width == 0 || dirty.height == 0 ||
		dirty.pitch == 0 || dirty.row_bytes == 0) {
		return;
	}
	++g_state.browser_texture_update_calls;
	g_state.last_browser_texture_id = texture_id;
	g_state.last_browser_texture_level = level;
	g_state.last_browser_texture_x = dirty.x;
	g_state.last_browser_texture_y = dirty.y;
	g_state.last_browser_texture_z = 0;
	g_state.last_browser_texture_width = dirty.width;
	g_state.last_browser_texture_height = dirty.height;
	g_state.last_browser_texture_depth = 1;
	g_state.last_browser_texture_pitch = dirty.pitch;
	g_state.last_browser_texture_row_bytes = dirty.row_bytes;
	g_state.last_browser_texture_slice_pitch =
		dirty.pitch * texture_storage_rows(format, dirty.height);
	g_state.last_browser_texture_bytes =
		dirty.row_bytes * texture_storage_rows(format, dirty.height);
	g_state.last_browser_texture_levels = 0;
	g_state.last_browser_texture_format = format;
	g_state.last_browser_texture_usage = usage;
	g_state.last_browser_texture_pool = 0;
	g_state.last_browser_texture_lock_flags = dirty.lock_flags;
	g_state.last_browser_texture_checksum =
		checksum_texture_region(dirty.data, dirty.pitch, dirty.row_bytes,
			texture_storage_rows(format, dirty.height));
	wasm_d3d8_browser_texture_update(
		texture_id,
		level,
		format,
		dirty.x,
		dirty.y,
		dirty.width,
		dirty.height,
		dirty.pitch,
		dirty.row_bytes,
		static_cast<unsigned int>(reinterpret_cast<std::uintptr_t>(dirty.data)),
		usage,
		dirty.lock_flags);
}

void browser_volume_texture_update(UINT texture_id, UINT level, D3DFORMAT format,
	const BrowserD3DVolumeTextureDirtyRegion &dirty, DWORD usage)
{
	if (texture_id == 0 || dirty.data == nullptr || dirty.width == 0 || dirty.height == 0 ||
		dirty.depth == 0 || dirty.row_pitch == 0 || dirty.slice_pitch == 0 || dirty.row_bytes == 0) {
		return;
	}
	++g_state.browser_texture_update_calls;
	g_state.last_browser_texture_id = texture_id;
	g_state.last_browser_texture_level = level;
	g_state.last_browser_texture_x = dirty.x;
	g_state.last_browser_texture_y = dirty.y;
	g_state.last_browser_texture_z = dirty.z;
	g_state.last_browser_texture_width = dirty.width;
	g_state.last_browser_texture_height = dirty.height;
	g_state.last_browser_texture_depth = dirty.depth;
	g_state.last_browser_texture_pitch = dirty.row_pitch;
	g_state.last_browser_texture_row_bytes = dirty.row_bytes;
	g_state.last_browser_texture_slice_pitch = dirty.slice_pitch;
	g_state.last_browser_texture_bytes =
		dirty.row_bytes * texture_storage_rows(format, dirty.height) * dirty.depth;
	g_state.last_browser_texture_levels = 0;
	g_state.last_browser_texture_format = format;
	g_state.last_browser_texture_usage = usage;
	g_state.last_browser_texture_pool = 0;
	g_state.last_browser_texture_lock_flags = dirty.lock_flags;
	g_state.last_browser_texture_checksum =
		checksum_texture_volume_region(dirty.data, dirty.row_pitch, dirty.slice_pitch, dirty.row_bytes,
			texture_storage_rows(format, dirty.height), dirty.depth);
	wasm_d3d8_browser_volume_texture_update(
		texture_id,
		level,
		format,
		dirty.x,
		dirty.y,
		dirty.z,
		dirty.width,
		dirty.height,
		dirty.depth,
		dirty.row_pitch,
		dirty.slice_pitch,
		dirty.row_bytes,
		static_cast<unsigned int>(reinterpret_cast<std::uintptr_t>(dirty.data)),
		usage,
		dirty.lock_flags);
}

void browser_texture_release(UINT texture_id)
{
	if (texture_id == 0) {
		return;
	}
	++g_state.browser_texture_release_calls;
	g_state.last_browser_texture_id = texture_id;
	g_state.last_browser_texture_level = 0;
	g_state.last_browser_texture_x = 0;
	g_state.last_browser_texture_y = 0;
	g_state.last_browser_texture_z = 0;
	g_state.last_browser_texture_width = 0;
	g_state.last_browser_texture_height = 0;
	g_state.last_browser_texture_depth = 0;
	g_state.last_browser_texture_pitch = 0;
	g_state.last_browser_texture_row_bytes = 0;
	g_state.last_browser_texture_slice_pitch = 0;
	g_state.last_browser_texture_bytes = 0;
	g_state.last_browser_texture_levels = 0;
	g_state.last_browser_texture_format = D3DFMT_UNKNOWN;
	g_state.last_browser_texture_usage = 0;
	g_state.last_browser_texture_pool = 0;
	g_state.last_browser_texture_lock_flags = 0;
	g_state.last_browser_texture_checksum = 0;
	wasm_d3d8_browser_texture_release(texture_id);
}

void browser_fbo_bind(UINT color_texture_id, UINT depth_texture_id, UINT width, UINT height)
{
	++g_state.browser_fbo_bind_calls;
	g_state.last_browser_fbo_color_texture_id = color_texture_id;
	g_state.last_browser_fbo_depth_texture_id = depth_texture_id;
	g_state.last_browser_fbo_width = width;
	g_state.last_browser_fbo_height = height;
	int ok = wasm_d3d8_browser_fbo_bind(color_texture_id, depth_texture_id, width, height);
	if (!ok) {
		++g_state.browser_fbo_bind_failures;
	}
}

void browser_texture_bind(UINT stage, UINT texture_id)
{
	++g_state.browser_texture_bind_calls;
	g_state.last_browser_texture_bind_stage = stage;
	g_state.last_browser_texture_bind_id = texture_id;
	wasm_d3d8_browser_texture_bind(stage, texture_id);
}

UINT allocate_browser_buffer_id()
{
	UINT id = g_next_browser_buffer_id++;
	if (id == 0) {
		id = g_next_browser_buffer_id++;
	}
	return id;
}

UINT allocate_browser_texture_id()
{
	UINT id = g_next_browser_texture_id++;
	if (id == 0) {
		id = g_next_browser_texture_id++;
	}
	return id;
}

void browser_draw_indexed(D3DPRIMITIVETYPE primitive_type, UINT base_vertex_index, UINT min_vertex_index,
	UINT first_index, UINT vertex_buffer_id, UINT vertex_byte_offset,
	UINT vertex_byte_size, UINT vertex_count, UINT vertex_stride, DWORD vertex_shader_fvf,
	UINT index_buffer_id, UINT index_byte_offset,
	UINT index_byte_size, UINT index_count, UINT index_size, UINT transform_mask, const D3DMATRIX *world_transform,
	const D3DMATRIX *view_transform, const D3DMATRIX *projection_transform,
	const D3DMATRIX *texture0_transform, const D3DMATRIX *texture1_transform,
	const WasmD3D8DrawRenderState *render_state, const float *clip_planes,
	const WasmD3D8DrawLight *lights, const WasmD3D8DrawMaterial *material, UINT state_hash,
	UINT derived_state_hash)
{
	const bool profile_sorted_draw_submit = wasm_d3d8_sorted_draw_profile_enabled();
	if (vertex_buffer_id == 0 || vertex_byte_size == 0 || index_buffer_id == 0 || index_byte_size == 0 ||
		index_count == 0 || vertex_stride == 0) {
		WASM_D3D8_NOTE_SORTED_DRAW_STEP(profile_sorted_draw_submit,"WasmD3D8.browserDrawIndexed.complete");
		return;
	}
#ifdef __EMSCRIPTEN__
	const char *producer = cnc_port_current_sorted_draw_submit_profile_marker
		? cnc_port_current_sorted_draw_submit_profile_marker()
		: nullptr;
	if ((producer == nullptr || producer[0] == '\0') && cnc_port_current_engine_profile_marker) {
		producer = cnc_port_current_engine_profile_marker();
	}
#else
	const char *producer = nullptr;
#endif
	WASM_D3D8_NOTE_SORTED_DRAW_STEP(profile_sorted_draw_submit,"WasmD3D8.browserDrawIndexed.before");
	wasm_d3d8_browser_draw_indexed(
		static_cast<int>(primitive_type),
		base_vertex_index,
		min_vertex_index,
		first_index,
		vertex_buffer_id,
		vertex_byte_offset,
		vertex_byte_size,
		vertex_count,
		vertex_stride,
		vertex_shader_fvf,
		index_buffer_id,
		index_byte_offset,
		index_byte_size,
		index_count,
		index_size,
		transform_mask,
		static_cast<unsigned int>(reinterpret_cast<std::uintptr_t>(world_transform)),
		static_cast<unsigned int>(reinterpret_cast<std::uintptr_t>(view_transform)),
		static_cast<unsigned int>(reinterpret_cast<std::uintptr_t>(projection_transform)),
		static_cast<unsigned int>(reinterpret_cast<std::uintptr_t>(texture0_transform)),
		static_cast<unsigned int>(reinterpret_cast<std::uintptr_t>(texture1_transform)),
		static_cast<unsigned int>(reinterpret_cast<std::uintptr_t>(render_state)),
		static_cast<unsigned int>(reinterpret_cast<std::uintptr_t>(clip_planes)),
		static_cast<unsigned int>(reinterpret_cast<std::uintptr_t>(lights)),
		static_cast<unsigned int>(reinterpret_cast<std::uintptr_t>(material)),
		state_hash,
		derived_state_hash,
		static_cast<unsigned int>(reinterpret_cast<std::uintptr_t>(producer)),
		profile_sorted_draw_submit ? 1 : 0);
	WASM_D3D8_NOTE_SORTED_DRAW_STEP(profile_sorted_draw_submit,"WasmD3D8.browserDrawIndexed.after");
}

struct BrowserD3DResource
{
	explicit BrowserD3DResource(IDirect3DDevice8 *device) : m_device(device) {}

	HRESULT GetDevice(IDirect3DDevice8 **device)
	{
		if (device == nullptr) {
			return E_FAIL;
		}
		*device = m_device;
		if (m_device != nullptr) {
			m_device->AddRef();
		}
		return S_OK;
	}

	HRESULT SetPrivateData(const GUID &, const void *, DWORD, DWORD) { return D3DERR_NOTAVAILABLE; }
	HRESULT GetPrivateData(const GUID &, void *, DWORD *) { return D3DERR_NOTAVAILABLE; }
	HRESULT FreePrivateData(const GUID &) { return D3DERR_NOTAVAILABLE; }
	DWORD SetPriority(DWORD priority) { return priority; }
	DWORD GetPriority() { return 0; }
	void PreLoad() {}

protected:
	IDirect3DDevice8 *m_device = nullptr;
};

class BrowserD3DSurface final : public IDirect3DSurface8, private BrowserD3DResource
{
public:
	BrowserD3DSurface(IDirect3DDevice8 *device, UINT width, UINT height, D3DFORMAT format, DWORD usage,
		D3DPOOL pool = D3DPOOL_DEFAULT) :
		BrowserD3DResource(device)
	{
		const UINT pitch = texture_pitch(format, width);
		std::memset(&m_desc, 0, sizeof(m_desc));
		m_desc.Format = format;
		m_desc.Type = D3DRTYPE_SURFACE;
		m_desc.Usage = usage;
		m_desc.Pool = pool;
		m_desc.Width = width;
		m_desc.Height = height;
		m_desc.Size = texture_level_size(format, width, height);
		m_desc.MultiSampleType = D3DMULTISAMPLE_NONE;
		m_pitch = static_cast<int>(pitch);
		m_pixels.resize(m_desc.Size);
	}

	HRESULT GetDevice(IDirect3DDevice8 **device) override { return BrowserD3DResource::GetDevice(device); }
	HRESULT SetPrivateData(const GUID &guid, const void *data, DWORD size, DWORD flags) override
	{
		return BrowserD3DResource::SetPrivateData(guid, data, size, flags);
	}
	HRESULT GetPrivateData(const GUID &guid, void *data, DWORD *size) override
	{
		return BrowserD3DResource::GetPrivateData(guid, data, size);
	}
	HRESULT FreePrivateData(const GUID &guid) override { return BrowserD3DResource::FreePrivateData(guid); }
	DWORD SetPriority(DWORD priority) override { return BrowserD3DResource::SetPriority(priority); }
	DWORD GetPriority() override { return BrowserD3DResource::GetPriority(); }
	void PreLoad() override { BrowserD3DResource::PreLoad(); }
	D3DRESOURCETYPE GetType() override { return D3DRTYPE_SURFACE; }

	HRESULT GetDesc(D3DSURFACE_DESC *desc) override
	{
		if (desc == nullptr) {
			return E_FAIL;
		}
		*desc = m_desc;
		return S_OK;
	}

	HRESULT LockRect(D3DLOCKED_RECT *locked_rect, const RECT *rect, DWORD flags) override
	{
		if (locked_rect == nullptr || m_pixels.empty() || m_locked) {
			return E_FAIL;
		}

		int left = 0;
		int top = 0;
		int right = static_cast<int>(m_desc.Width);
		int bottom = static_cast<int>(m_desc.Height);
		if (rect != nullptr) {
			if (rect->left < 0 || rect->top < 0 || rect->right < rect->left || rect->bottom < rect->top ||
				static_cast<UINT>(rect->right) > m_desc.Width ||
				static_cast<UINT>(rect->bottom) > m_desc.Height) {
				return E_FAIL;
			}
			left = rect->left;
			top = rect->top;
			right = rect->right;
			bottom = rect->bottom;
		}
		if (is_block_compressed_format(m_desc.Format) &&
			(left != 0 || top != 0 || right != static_cast<int>(m_desc.Width) ||
				bottom != static_cast<int>(m_desc.Height))) {
			return E_FAIL;
		}

		locked_rect->Pitch = m_pitch;
		locked_rect->pBits = m_pixels.data() + texture_offset(static_cast<UINT>(left), static_cast<UINT>(top));
		m_locked = true;
		m_lock_flags = flags;
		m_dirty_x = static_cast<UINT>(left);
		m_dirty_y = static_cast<UINT>(top);
		m_dirty_width = static_cast<UINT>(right - left);
		m_dirty_height = static_cast<UINT>(bottom - top);
		return S_OK;
	}

	HRESULT UnlockRect() override
	{
		BrowserD3DTextureDirtyRegion dirty = {};
		HRESULT result = unlock_and_capture(&dirty);
		if (SUCCEEDED(result)) {
			browser_texture_update(m_owner_texture_id, m_owner_texture_level, m_owner_texture_format,
				dirty, m_owner_texture_usage);
		}
		return result;
	}

	HRESULT unlock_and_capture(BrowserD3DTextureDirtyRegion *dirty)
	{
		if (!m_locked) {
			return E_FAIL;
		}
		if (dirty != nullptr && (m_lock_flags & (D3DLOCK_READONLY | D3DLOCK_NO_DIRTY_UPDATE)) == 0) {
			dirty->data = m_pixels.data() + texture_offset(m_dirty_x, m_dirty_y);
			dirty->x = m_dirty_x;
			dirty->y = m_dirty_y;
			dirty->width = m_dirty_width;
			dirty->height = m_dirty_height;
			dirty->pitch = static_cast<UINT>(m_pitch);
			dirty->row_bytes = texture_pitch(m_desc.Format, m_dirty_width);
			dirty->lock_flags = m_lock_flags;
		}
		m_locked = false;
		m_lock_flags = 0;
		m_dirty_x = 0;
		m_dirty_y = 0;
		m_dirty_width = 0;
		m_dirty_height = 0;
		return S_OK;
	}

	bool is_locked() const { return m_locked; }

	const D3DSURFACE_DESC &desc() const { return m_desc; }

	const BYTE *pixels() const { return m_pixels.data(); }

	UINT pitch() const { return static_cast<UINT>(m_pitch); }

	bool copy_pixels_from(const BrowserD3DSurface &source)
	{
		if (m_locked || source.is_locked() ||
			m_desc.Format != source.desc().Format ||
			m_desc.Width != source.desc().Width ||
			m_desc.Height != source.desc().Height ||
			m_pixels.size() != source.m_pixels.size()) {
			return false;
		}
		m_pixels = source.m_pixels;
		return true;
	}

	bool copy_rects_from(const BrowserD3DSurface &source, const RECT *source_rects, UINT rect_count,
		const POINT *destination_points)
	{
		if (m_locked || source.is_locked() ||
			m_desc.Format != source.desc().Format ||
			is_block_compressed_format(m_desc.Format)) {
			return false;
		}

		RECT whole_source = {};
		whole_source.left = 0;
		whole_source.top = 0;
		whole_source.right = static_cast<LONG>(source.desc().Width);
		whole_source.bottom = static_cast<LONG>(source.desc().Height);
		if (source_rects == nullptr || rect_count == 0) {
			source_rects = &whole_source;
			rect_count = 1;
		}

		const UINT bytes_per_texel = bytes_per_pixel(m_desc.Format);
		for (UINT index = 0; index < rect_count; ++index) {
			const RECT &source_rect = source_rects[index];
			if (source_rect.left < 0 || source_rect.top < 0 ||
				source_rect.right < source_rect.left ||
				source_rect.bottom < source_rect.top ||
				static_cast<UINT>(source_rect.right) > source.desc().Width ||
				static_cast<UINT>(source_rect.bottom) > source.desc().Height) {
				return false;
			}

			const UINT width = static_cast<UINT>(source_rect.right - source_rect.left);
			const UINT height = static_cast<UINT>(source_rect.bottom - source_rect.top);
			const LONG destination_x = destination_points != nullptr ? destination_points[index].x : source_rect.left;
			const LONG destination_y = destination_points != nullptr ? destination_points[index].y : source_rect.top;
			if (destination_x < 0 || destination_y < 0 ||
				static_cast<UINT>(destination_x) > m_desc.Width ||
				static_cast<UINT>(destination_y) > m_desc.Height ||
				width > m_desc.Width - static_cast<UINT>(destination_x) ||
				height > m_desc.Height - static_cast<UINT>(destination_y)) {
				return false;
			}

			const UINT row_bytes = width * bytes_per_texel;
			for (UINT row = 0; row < height; ++row) {
				const BYTE *source_row = source.m_pixels.data() +
					source.texture_offset(static_cast<UINT>(source_rect.left),
						static_cast<UINT>(source_rect.top) + row);
				BYTE *destination_row = m_pixels.data() +
					texture_offset(static_cast<UINT>(destination_x), static_cast<UINT>(destination_y) + row);
				std::memcpy(destination_row, source_row, row_bytes);
			}
		}
		return true;
	}

	bool copy_scaled_rect_from(const BrowserD3DSurface &source, const RECT &source_rect,
		const RECT &destination_rect)
	{
		if (m_locked || source.is_locked() ||
			m_desc.Format != source.desc().Format ||
			is_block_compressed_format(m_desc.Format)) {
			return false;
		}
		if (source_rect.left < 0 || source_rect.top < 0 ||
			source_rect.right < source_rect.left ||
			source_rect.bottom < source_rect.top ||
			static_cast<UINT>(source_rect.right) > source.desc().Width ||
			static_cast<UINT>(source_rect.bottom) > source.desc().Height ||
			destination_rect.left < 0 || destination_rect.top < 0 ||
			destination_rect.right < destination_rect.left ||
			destination_rect.bottom < destination_rect.top ||
			static_cast<UINT>(destination_rect.right) > m_desc.Width ||
			static_cast<UINT>(destination_rect.bottom) > m_desc.Height) {
			return false;
		}

		const UINT source_width = static_cast<UINT>(source_rect.right - source_rect.left);
		const UINT source_height = static_cast<UINT>(source_rect.bottom - source_rect.top);
		const UINT destination_width = static_cast<UINT>(destination_rect.right - destination_rect.left);
		const UINT destination_height = static_cast<UINT>(destination_rect.bottom - destination_rect.top);
		const UINT texel_size = bytes_per_pixel(m_desc.Format);
		if (source_width == 0 || source_height == 0 ||
			destination_width == 0 || destination_height == 0 ||
			texel_size == 0) {
			return false;
		}

		for (UINT y = 0; y < destination_height; ++y) {
			const UINT source_y = static_cast<UINT>(source_rect.top) +
				static_cast<UINT>((static_cast<std::uint64_t>(y) * source_height) / destination_height);
			BYTE *destination_row = m_pixels.data() +
				texture_offset(static_cast<UINT>(destination_rect.left),
					static_cast<UINT>(destination_rect.top) + y);
			if (source_width == destination_width) {
				const BYTE *source_row = source.m_pixels.data() +
					source.texture_offset(static_cast<UINT>(source_rect.left), source_y);
				std::memcpy(destination_row, source_row, destination_width * texel_size);
				continue;
			}
			for (UINT x = 0; x < destination_width; ++x) {
				const UINT source_x = static_cast<UINT>(source_rect.left) +
					static_cast<UINT>((static_cast<std::uint64_t>(x) * source_width) / destination_width);
				const BYTE *source_texel = source.m_pixels.data() +
					source.texture_offset(source_x, source_y);
				BYTE *destination_texel = destination_row + x * texel_size;
				std::memcpy(destination_texel, source_texel, texel_size);
			}
		}
		return true;
	}

	void set_texture_owner(UINT texture_id, UINT level, D3DFORMAT format, DWORD usage)
	{
		m_owner_texture_id = texture_id;
		m_owner_texture_level = level;
		m_owner_texture_format = format;
		m_owner_texture_usage = usage;
	}

	void upload_owned_texture() const
	{
		if (m_owner_texture_id == 0) {
			return;
		}
		BrowserD3DTextureDirtyRegion dirty = full_dirty_region();
		browser_texture_update(m_owner_texture_id, m_owner_texture_level, m_owner_texture_format,
			dirty, m_owner_texture_usage);
	}

	UINT texture_owner_id() const { return m_owner_texture_id; }

	BrowserD3DTextureDirtyRegion full_dirty_region() const
	{
		BrowserD3DTextureDirtyRegion dirty = {};
		dirty.data = pixels();
		dirty.x = 0;
		dirty.y = 0;
		dirty.width = m_desc.Width;
		dirty.height = m_desc.Height;
		dirty.pitch = pitch();
		dirty.row_bytes = texture_pitch(m_desc.Format, m_desc.Width);
		return dirty;
	}

	ULONG AddRef() override { return ++m_ref_count; }

	ULONG Release() override
	{
		const ULONG ref_count = --m_ref_count;
		if (ref_count == 0) {
			delete this;
		}
		return ref_count;
	}

private:
	UINT texture_offset(UINT left, UINT top) const
	{
		if (is_block_compressed_format(m_desc.Format)) {
			return block_count(top) * static_cast<UINT>(m_pitch) +
				block_count(left) * block_bytes(m_desc.Format);
		}
		return (top * static_cast<UINT>(m_pitch)) + (left * bytes_per_pixel(m_desc.Format));
	}

	ULONG m_ref_count = 1;
	D3DSURFACE_DESC m_desc = {};
	int m_pitch = 0;
	std::vector<unsigned char> m_pixels;
	bool m_locked = false;
	DWORD m_lock_flags = 0;
	UINT m_dirty_x = 0;
	UINT m_dirty_y = 0;
	UINT m_dirty_width = 0;
	UINT m_dirty_height = 0;
	UINT m_owner_texture_id = 0;
	UINT m_owner_texture_level = 0;
	D3DFORMAT m_owner_texture_format = D3DFMT_UNKNOWN;
	DWORD m_owner_texture_usage = 0;
};

class BrowserD3DVolume final : public IDirect3DVolume8, private BrowserD3DResource
{
public:
	BrowserD3DVolume(IDirect3DDevice8 *device, UINT width, UINT height, UINT depth, D3DFORMAT format,
		DWORD usage, D3DPOOL pool = D3DPOOL_DEFAULT) :
		BrowserD3DResource(device)
	{
		const UINT row_pitch = texture_pitch(format, width);
		const UINT slice_pitch = texture_level_size(format, width, height);
		std::memset(&m_desc, 0, sizeof(m_desc));
		m_desc.Format = format;
		m_desc.Type = D3DRTYPE_VOLUME;
		m_desc.Usage = usage;
		m_desc.Pool = pool;
		m_desc.Width = width;
		m_desc.Height = height;
		m_desc.Depth = depth;
		m_desc.Size = texture_volume_level_size(format, width, height, depth);
		m_row_pitch = static_cast<int>(row_pitch);
		m_slice_pitch = static_cast<int>(slice_pitch);
		m_pixels.resize(m_desc.Size);
	}

	HRESULT GetDevice(IDirect3DDevice8 **device) override { return BrowserD3DResource::GetDevice(device); }
	HRESULT SetPrivateData(const GUID &guid, const void *data, DWORD size, DWORD flags) override
	{
		return BrowserD3DResource::SetPrivateData(guid, data, size, flags);
	}
	HRESULT GetPrivateData(const GUID &guid, void *data, DWORD *size) override
	{
		return BrowserD3DResource::GetPrivateData(guid, data, size);
	}
	HRESULT FreePrivateData(const GUID &guid) override { return BrowserD3DResource::FreePrivateData(guid); }
	DWORD SetPriority(DWORD priority) override { return BrowserD3DResource::SetPriority(priority); }
	DWORD GetPriority() override { return BrowserD3DResource::GetPriority(); }
	void PreLoad() override { BrowserD3DResource::PreLoad(); }
	D3DRESOURCETYPE GetType() override { return D3DRTYPE_VOLUME; }

	HRESULT GetDesc(D3DVOLUME_DESC *desc) override
	{
		if (desc == nullptr) {
			return E_FAIL;
		}
		*desc = m_desc;
		return S_OK;
	}

	HRESULT LockBox(D3DLOCKED_BOX *locked_box, const D3DBOX *box, DWORD flags)
	{
		if (locked_box == nullptr || m_pixels.empty() || m_locked) {
			return E_FAIL;
		}

		UINT left = 0;
		UINT top = 0;
		UINT right = m_desc.Width;
		UINT bottom = m_desc.Height;
		UINT front = 0;
		UINT back = m_desc.Depth;
		if (box != nullptr) {
			if (box->Right < box->Left || box->Bottom < box->Top || box->Back < box->Front ||
				box->Right > m_desc.Width || box->Bottom > m_desc.Height || box->Back > m_desc.Depth) {
				return E_FAIL;
			}
			left = box->Left;
			top = box->Top;
			right = box->Right;
			bottom = box->Bottom;
			front = box->Front;
			back = box->Back;
		}
		if (is_block_compressed_format(m_desc.Format) &&
			(left != 0 || top != 0 || front != 0 || right != m_desc.Width ||
				bottom != m_desc.Height || back != m_desc.Depth)) {
			return E_FAIL;
		}

		locked_box->RowPitch = m_row_pitch;
		locked_box->SlicePitch = m_slice_pitch;
		locked_box->pBits = m_pixels.data() + texture_offset(left, top, front);
		m_locked = true;
		m_lock_flags = flags;
		m_dirty_x = left;
		m_dirty_y = top;
		m_dirty_z = front;
		m_dirty_width = right - left;
		m_dirty_height = bottom - top;
		m_dirty_depth = back - front;
		return S_OK;
	}

	HRESULT unlock_and_capture(BrowserD3DVolumeTextureDirtyRegion *dirty)
	{
		if (!m_locked) {
			return E_FAIL;
		}
		if (dirty != nullptr && (m_lock_flags & (D3DLOCK_READONLY | D3DLOCK_NO_DIRTY_UPDATE)) == 0) {
			dirty->data = m_pixels.data() + texture_offset(m_dirty_x, m_dirty_y, m_dirty_z);
			dirty->x = m_dirty_x;
			dirty->y = m_dirty_y;
			dirty->z = m_dirty_z;
			dirty->width = m_dirty_width;
			dirty->height = m_dirty_height;
			dirty->depth = m_dirty_depth;
			dirty->row_pitch = static_cast<UINT>(m_row_pitch);
			dirty->slice_pitch = static_cast<UINT>(m_slice_pitch);
			dirty->row_bytes = texture_pitch(m_desc.Format, m_dirty_width);
			dirty->lock_flags = m_lock_flags;
		}
		m_locked = false;
		m_lock_flags = 0;
		m_dirty_x = 0;
		m_dirty_y = 0;
		m_dirty_z = 0;
		m_dirty_width = 0;
		m_dirty_height = 0;
		m_dirty_depth = 0;
		return S_OK;
	}

	bool is_locked() const { return m_locked; }

	const D3DVOLUME_DESC &desc() const { return m_desc; }

	const BYTE *pixels() const { return m_pixels.data(); }

	UINT row_pitch() const { return static_cast<UINT>(m_row_pitch); }

	UINT slice_pitch() const { return static_cast<UINT>(m_slice_pitch); }

	ULONG AddRef() override { return ++m_ref_count; }

	ULONG Release() override
	{
		const ULONG ref_count = --m_ref_count;
		if (ref_count == 0) {
			delete this;
		}
		return ref_count;
	}

private:
	UINT texture_offset(UINT left, UINT top, UINT front) const
	{
		if (is_block_compressed_format(m_desc.Format)) {
			return front * static_cast<UINT>(m_slice_pitch) +
				block_count(top) * static_cast<UINT>(m_row_pitch) +
				block_count(left) * block_bytes(m_desc.Format);
		}
		return front * static_cast<UINT>(m_slice_pitch) +
			top * static_cast<UINT>(m_row_pitch) +
			left * bytes_per_pixel(m_desc.Format);
	}

	ULONG m_ref_count = 1;
	D3DVOLUME_DESC m_desc = {};
	int m_row_pitch = 0;
	int m_slice_pitch = 0;
	std::vector<unsigned char> m_pixels;
	bool m_locked = false;
	DWORD m_lock_flags = 0;
	UINT m_dirty_x = 0;
	UINT m_dirty_y = 0;
	UINT m_dirty_z = 0;
	UINT m_dirty_width = 0;
	UINT m_dirty_height = 0;
	UINT m_dirty_depth = 0;
};

class BrowserD3DTexture final : public IDirect3DTexture8, private BrowserD3DResource
{
public:
	BrowserD3DTexture(IDirect3DDevice8 *device, UINT width, UINT height, UINT levels, DWORD usage,
		D3DFORMAT format, D3DPOOL pool) :
		BrowserD3DResource(device)
	{
		if (width == 0) {
			width = 1;
		}
		if (height == 0) {
			height = 1;
		}
		if (format == D3DFMT_UNKNOWN) {
			format = D3DFMT_A8R8G8B8;
		}
		if (levels == 0) {
			levels = 1;
		}

		m_browser_texture_id = allocate_browser_texture_id();
		for (UINT level = 0; level < levels; ++level) {
			BrowserD3DSurface *surface = new (std::nothrow) BrowserD3DSurface(
				device, width, height, format, usage, pool);
			if (surface == nullptr) {
				break;
			}
			surface->set_texture_owner(m_browser_texture_id, level, format, usage);
			m_levels.push_back(surface);
			if (width > 1) {
				width /= 2;
			}
			if (height > 1) {
				height /= 2;
			}
		}
		m_usage = usage;
		m_pool = pool;
		m_format = format;
		m_last_lock_flags.resize(m_levels.size());
	}

	~BrowserD3DTexture()
	{
		if (m_browser_texture_created) {
			browser_texture_release(m_browser_texture_id);
		}
		for (BrowserD3DSurface *surface : m_levels) {
			surface->Release();
		}
	}

	bool is_valid() const { return !m_levels.empty(); }

	HRESULT GetDevice(IDirect3DDevice8 **device) override { return BrowserD3DResource::GetDevice(device); }
	HRESULT SetPrivateData(const GUID &guid, const void *data, DWORD size, DWORD flags) override
	{
		return BrowserD3DResource::SetPrivateData(guid, data, size, flags);
	}
	HRESULT GetPrivateData(const GUID &guid, void *data, DWORD *size) override
	{
		return BrowserD3DResource::GetPrivateData(guid, data, size);
	}
	HRESULT FreePrivateData(const GUID &guid) override { return BrowserD3DResource::FreePrivateData(guid); }
	DWORD SetPriority(DWORD priority) override { return BrowserD3DResource::SetPriority(priority); }
	DWORD GetPriority() override { return BrowserD3DResource::GetPriority(); }
	void PreLoad() override { BrowserD3DResource::PreLoad(); }
	D3DRESOURCETYPE GetType() override { return D3DRTYPE_TEXTURE; }

	DWORD SetLOD(DWORD lod) override
	{
		const DWORD previous = m_lod;
		m_lod = lod;
		return previous;
	}

	DWORD GetLOD() override { return m_lod; }
	DWORD GetLevelCount() override { return static_cast<DWORD>(m_levels.size()); }

	HRESULT GetLevelDesc(UINT level, D3DSURFACE_DESC *desc) override
	{
		if (level >= m_levels.size() || desc == nullptr) {
			return E_FAIL;
		}
		return m_levels[level]->GetDesc(desc);
	}

	HRESULT GetSurfaceLevel(UINT level, IDirect3DSurface8 **surface) override
	{
		if (level >= m_levels.size() || surface == nullptr) {
			return E_FAIL;
		}
		m_levels[level]->AddRef();
		*surface = m_levels[level];
		return S_OK;
	}

	HRESULT LockRect(UINT level, D3DLOCKED_RECT *locked_rect, const RECT *rect, DWORD flags) override
	{
		if (level >= m_levels.size()) {
			return E_FAIL;
		}
		++g_state.texture_lock_rect_calls;
		HRESULT result = m_levels[level]->LockRect(locked_rect, rect, flags);
		if (SUCCEEDED(result) && level < m_last_lock_flags.size()) {
			m_last_lock_flags[level] = flags;
		}
		return result;
	}

	HRESULT UnlockRect(UINT level) override
	{
		if (level >= m_levels.size()) {
			return E_FAIL;
		}
		++g_state.texture_unlock_rect_calls;
		BrowserD3DTextureDirtyRegion dirty = {};
		if (level < m_last_lock_flags.size()) {
			dirty.lock_flags = m_last_lock_flags[level];
		}
		HRESULT result = m_levels[level]->unlock_and_capture(&dirty);
		if (level < m_last_lock_flags.size()) {
			m_last_lock_flags[level] = 0;
		}
		if (SUCCEEDED(result)) {
			browser_texture_update(m_browser_texture_id, level, m_format, dirty, m_usage);
		}
		return result;
	}

	UINT browser_texture_id() const { return m_browser_texture_id; }

	D3DFORMAT format() const { return m_format; }

	D3DPOOL pool() const { return m_pool; }

	HRESULT copy_from(const BrowserD3DTexture &source)
	{
		if (m_levels.size() != source.m_levels.size()) {
			return E_FAIL;
		}
		for (std::size_t level = 0; level < m_levels.size(); ++level) {
			if (!m_levels[level]->copy_pixels_from(*source.m_levels[level])) {
				return E_FAIL;
			}
			const BrowserD3DTextureDirtyRegion dirty = m_levels[level]->full_dirty_region();
			browser_texture_update(m_browser_texture_id, static_cast<UINT>(level), m_format, dirty, m_usage);
		}
		return S_OK;
	}

	HRESULT generate_mip_chain(UINT source_level)
	{
		if (source_level >= m_levels.size()) {
			return E_FAIL;
		}
		for (std::size_t level = static_cast<std::size_t>(source_level) + 1;
			level < m_levels.size();
			++level) {
			D3DSURFACE_DESC source_desc = {};
			D3DSURFACE_DESC destination_desc = {};
			if (FAILED(m_levels[level - 1]->GetDesc(&source_desc)) ||
				FAILED(m_levels[level]->GetDesc(&destination_desc))) {
				return E_FAIL;
			}
			RECT source_rect = {};
			source_rect.right = static_cast<LONG>(source_desc.Width);
			source_rect.bottom = static_cast<LONG>(source_desc.Height);
			RECT destination_rect = {};
			destination_rect.right = static_cast<LONG>(destination_desc.Width);
			destination_rect.bottom = static_cast<LONG>(destination_desc.Height);
			if (!m_levels[level]->copy_scaled_rect_from(*m_levels[level - 1],
				source_rect, destination_rect)) {
				return E_FAIL;
			}
			m_levels[level]->upload_owned_texture();
		}
		return S_OK;
	}

	void create_browser_texture()
	{
		if (m_browser_texture_created || m_levels.empty()) {
			return;
		}
		D3DSURFACE_DESC desc = {};
		if (FAILED(m_levels[0]->GetDesc(&desc))) {
			return;
		}
		browser_texture_create(m_browser_texture_id, desc.Width, desc.Height,
			static_cast<UINT>(m_levels.size()), m_format, m_usage, m_pool);
		m_browser_texture_created = true;
	}

	ULONG AddRef() override { return ++m_ref_count; }

	ULONG Release() override
	{
		const ULONG ref_count = --m_ref_count;
		if (ref_count == 0) {
			delete this;
		}
		return ref_count;
	}

private:
	ULONG m_ref_count = 1;
	DWORD m_lod = 0;
	std::vector<BrowserD3DSurface *> m_levels;
	std::vector<DWORD> m_last_lock_flags;
	DWORD m_usage = 0;
	D3DPOOL m_pool = D3DPOOL_DEFAULT;
	D3DFORMAT m_format = D3DFMT_A8R8G8B8;
	UINT m_browser_texture_id = 0;
	bool m_browser_texture_created = false;
};

class BrowserD3DVolumeTexture final : public IDirect3DVolumeTexture8, private BrowserD3DResource
{
public:
	BrowserD3DVolumeTexture(IDirect3DDevice8 *device, UINT width, UINT height, UINT depth, UINT levels,
		DWORD usage, D3DFORMAT format, D3DPOOL pool) :
		BrowserD3DResource(device)
	{
		if (width == 0) {
			width = 1;
		}
		if (height == 0) {
			height = 1;
		}
		if (depth == 0) {
			depth = 1;
		}
		if (format == D3DFMT_UNKNOWN) {
			format = D3DFMT_A8R8G8B8;
		}
		if (levels == 0) {
			levels = 1;
		}

		m_browser_texture_id = allocate_browser_texture_id();
		for (UINT level = 0; level < levels; ++level) {
			BrowserD3DVolume *volume = new (std::nothrow) BrowserD3DVolume(
				device, width, height, depth, format, usage, pool);
			if (volume == nullptr) {
				break;
			}
			m_levels.push_back(volume);
			if (width > 1) {
				width /= 2;
			}
			if (height > 1) {
				height /= 2;
			}
			if (depth > 1) {
				depth /= 2;
			}
		}
		m_usage = usage;
		m_pool = pool;
		m_format = format;
		m_last_lock_flags.resize(m_levels.size());
	}

	~BrowserD3DVolumeTexture()
	{
		if (m_browser_texture_created) {
			browser_texture_release(m_browser_texture_id);
		}
		for (BrowserD3DVolume *volume : m_levels) {
			volume->Release();
		}
	}

	bool is_valid() const { return !m_levels.empty(); }

	HRESULT GetDevice(IDirect3DDevice8 **device) override { return BrowserD3DResource::GetDevice(device); }
	HRESULT SetPrivateData(const GUID &guid, const void *data, DWORD size, DWORD flags) override
	{
		return BrowserD3DResource::SetPrivateData(guid, data, size, flags);
	}
	HRESULT GetPrivateData(const GUID &guid, void *data, DWORD *size) override
	{
		return BrowserD3DResource::GetPrivateData(guid, data, size);
	}
	HRESULT FreePrivateData(const GUID &guid) override { return BrowserD3DResource::FreePrivateData(guid); }
	DWORD SetPriority(DWORD priority) override { return BrowserD3DResource::SetPriority(priority); }
	DWORD GetPriority() override { return BrowserD3DResource::GetPriority(); }
	void PreLoad() override { BrowserD3DResource::PreLoad(); }
	D3DRESOURCETYPE GetType() override { return D3DRTYPE_VOLUMETEXTURE; }

	DWORD SetLOD(DWORD lod) override
	{
		const DWORD previous = m_lod;
		m_lod = lod;
		return previous;
	}

	DWORD GetLOD() override { return m_lod; }
	DWORD GetLevelCount() override { return static_cast<DWORD>(m_levels.size()); }

	HRESULT GetLevelDesc(UINT level, D3DVOLUME_DESC *desc) override
	{
		if (level >= m_levels.size() || desc == nullptr) {
			return E_FAIL;
		}
		return m_levels[level]->GetDesc(desc);
	}

	HRESULT GetVolumeLevel(UINT level, IDirect3DVolume8 **volume) override
	{
		if (level >= m_levels.size() || volume == nullptr) {
			return E_FAIL;
		}
		m_levels[level]->AddRef();
		*volume = m_levels[level];
		return S_OK;
	}

	HRESULT LockBox(UINT level, D3DLOCKED_BOX *locked_volume, const D3DBOX *box, DWORD flags) override
	{
		if (level >= m_levels.size()) {
			return E_FAIL;
		}
		++g_state.texture_lock_box_calls;
		HRESULT result = m_levels[level]->LockBox(locked_volume, box, flags);
		if (SUCCEEDED(result) && level < m_last_lock_flags.size()) {
			m_last_lock_flags[level] = flags;
		}
		return result;
	}

	HRESULT UnlockBox(UINT level) override
	{
		if (level >= m_levels.size()) {
			return E_FAIL;
		}
		++g_state.texture_unlock_box_calls;
		BrowserD3DVolumeTextureDirtyRegion dirty = {};
		if (level < m_last_lock_flags.size()) {
			dirty.lock_flags = m_last_lock_flags[level];
		}
		HRESULT result = m_levels[level]->unlock_and_capture(&dirty);
		if (level < m_last_lock_flags.size()) {
			m_last_lock_flags[level] = 0;
		}
		if (SUCCEEDED(result)) {
			browser_volume_texture_update(m_browser_texture_id, level, m_format, dirty, m_usage);
		}
		return result;
	}

	UINT browser_texture_id() const { return m_browser_texture_id; }

	D3DFORMAT format() const { return m_format; }

	D3DPOOL pool() const { return m_pool; }

	void create_browser_texture()
	{
		if (m_browser_texture_created || m_levels.empty()) {
			return;
		}
		D3DVOLUME_DESC desc = {};
		if (FAILED(m_levels[0]->GetDesc(&desc))) {
			return;
		}
		browser_volume_texture_create(m_browser_texture_id, desc.Width, desc.Height, desc.Depth,
			static_cast<UINT>(m_levels.size()), m_format, m_usage, m_pool);
		m_browser_texture_created = true;
	}

	ULONG AddRef() override { return ++m_ref_count; }

	ULONG Release() override
	{
		const ULONG ref_count = --m_ref_count;
		if (ref_count == 0) {
			delete this;
		}
		return ref_count;
	}

private:
	ULONG m_ref_count = 1;
	DWORD m_lod = 0;
	std::vector<BrowserD3DVolume *> m_levels;
	std::vector<DWORD> m_last_lock_flags;
	DWORD m_usage = 0;
	D3DPOOL m_pool = D3DPOOL_DEFAULT;
	D3DFORMAT m_format = D3DFMT_A8R8G8B8;
	UINT m_browser_texture_id = 0;
	bool m_browser_texture_created = false;
};

extern "C" UINT cnc_port_d3d8_browser_texture_id(void *texture)
{
	if (texture == nullptr) {
		return 0;
	}
	IDirect3DBaseTexture8 *base_texture = static_cast<IDirect3DBaseTexture8 *>(texture);
	const D3DRESOURCETYPE texture_type = base_texture->GetType();
	if (texture_type == D3DRTYPE_TEXTURE) {
		BrowserD3DTexture *browser_texture =
			static_cast<BrowserD3DTexture *>(static_cast<IDirect3DTexture8 *>(base_texture));
		return browser_texture->browser_texture_id();
	}
	if (texture_type == D3DRTYPE_VOLUMETEXTURE) {
		BrowserD3DVolumeTexture *browser_texture =
			static_cast<BrowserD3DVolumeTexture *>(static_cast<IDirect3DVolumeTexture8 *>(base_texture));
		return browser_texture->browser_texture_id();
	}
	return 0;
}

class BrowserD3DVertexBuffer final : public IDirect3DVertexBuffer8, private BrowserD3DResource
{
public:
	BrowserD3DVertexBuffer(IDirect3DDevice8 *device, UINT length, DWORD usage, DWORD, D3DPOOL) :
		BrowserD3DResource(device),
		m_bytes(length),
		m_usage(usage),
		m_browser_buffer_id(allocate_browser_buffer_id())
	{
	}

	bool is_valid() const { return !m_bytes.empty(); }

	HRESULT GetDevice(IDirect3DDevice8 **device) override { return BrowserD3DResource::GetDevice(device); }
	HRESULT SetPrivateData(const GUID &guid, const void *data, DWORD size, DWORD flags) override
	{
		return BrowserD3DResource::SetPrivateData(guid, data, size, flags);
	}
	HRESULT GetPrivateData(const GUID &guid, void *data, DWORD *size) override
	{
		return BrowserD3DResource::GetPrivateData(guid, data, size);
	}
	HRESULT FreePrivateData(const GUID &guid) override { return BrowserD3DResource::FreePrivateData(guid); }
	DWORD SetPriority(DWORD priority) override { return BrowserD3DResource::SetPriority(priority); }
	DWORD GetPriority() override { return BrowserD3DResource::GetPriority(); }
	void PreLoad() override { BrowserD3DResource::PreLoad(); }
	D3DRESOURCETYPE GetType() override { return D3DRTYPE_VERTEXBUFFER; }

	HRESULT Lock(UINT offset, UINT size, BYTE **data, DWORD flags) override
	{
		if (data == nullptr || m_locked || offset > m_bytes.size()) {
			return E_FAIL;
		}
		if (size == 0) {
			size = static_cast<UINT>(m_bytes.size() - offset);
		}
		if (size > m_bytes.size() - offset) {
			return E_FAIL;
		}
		++g_state.buffer_lock_calls;
		m_locked = true;
		m_dirty_offset = offset;
		m_dirty_size = size;
		m_lock_flags = flags;
		*data = m_bytes.data() + offset;
		return S_OK;
	}

	HRESULT Unlock() override
	{
		if (!m_locked) {
			return E_FAIL;
		}
		++g_state.buffer_unlock_calls;
		if (m_dirty_size != 0) {
			m_checksum_cache.invalidate();
		}
		browser_buffer_update(BROWSER_BUFFER_VERTEX, m_browser_buffer_id,
			m_bytes.data() + m_dirty_offset, m_dirty_offset, m_dirty_size, m_usage, m_lock_flags);
		m_locked = false;
		m_dirty_offset = 0;
		m_dirty_size = 0;
		m_lock_flags = 0;
		return S_OK;
	}

	UINT length() const { return static_cast<UINT>(m_bytes.size()); }
	const BYTE *data() const { return m_bytes.data(); }
	UINT browser_buffer_id() const { return m_browser_buffer_id; }

	void create_browser_buffer()
	{
		if (!m_browser_buffer_created) {
			browser_buffer_create(BROWSER_BUFFER_VERTEX, m_browser_buffer_id, length(), m_usage);
			m_browser_buffer_created = true;
		}
	}

	DWORD checksum(UINT offset, UINT size) const
	{
		return m_checksum_cache.checksum(m_bytes.data(), length(), offset, size);
	}

	ULONG AddRef() override { return ++m_ref_count; }

	ULONG Release() override
	{
		const ULONG ref_count = --m_ref_count;
		if (ref_count == 0) {
			if (m_browser_buffer_created) {
				browser_buffer_release(BROWSER_BUFFER_VERTEX, m_browser_buffer_id);
			}
			delete this;
		}
		return ref_count;
	}

private:
	ULONG m_ref_count = 1;
	std::vector<BYTE> m_bytes;
	DWORD m_usage = 0;
	UINT m_browser_buffer_id = 0;
	bool m_browser_buffer_created = false;
	bool m_locked = false;
	UINT m_dirty_offset = 0;
	UINT m_dirty_size = 0;
	DWORD m_lock_flags = 0;
	BufferChecksumCache m_checksum_cache;
};

class BrowserD3DIndexBuffer final : public IDirect3DIndexBuffer8, private BrowserD3DResource
{
public:
	BrowserD3DIndexBuffer(IDirect3DDevice8 *device, UINT length, DWORD usage, D3DFORMAT format, D3DPOOL) :
		BrowserD3DResource(device),
		m_bytes(length),
		m_usage(usage),
		m_format(format),
		m_browser_buffer_id(allocate_browser_buffer_id())
	{
	}

	bool is_valid() const { return !m_bytes.empty(); }

	HRESULT GetDevice(IDirect3DDevice8 **device) override { return BrowserD3DResource::GetDevice(device); }
	HRESULT SetPrivateData(const GUID &guid, const void *data, DWORD size, DWORD flags) override
	{
		return BrowserD3DResource::SetPrivateData(guid, data, size, flags);
	}
	HRESULT GetPrivateData(const GUID &guid, void *data, DWORD *size) override
	{
		return BrowserD3DResource::GetPrivateData(guid, data, size);
	}
	HRESULT FreePrivateData(const GUID &guid) override { return BrowserD3DResource::FreePrivateData(guid); }
	DWORD SetPriority(DWORD priority) override { return BrowserD3DResource::SetPriority(priority); }
	DWORD GetPriority() override { return BrowserD3DResource::GetPriority(); }
	void PreLoad() override { BrowserD3DResource::PreLoad(); }
	D3DRESOURCETYPE GetType() override { return D3DRTYPE_INDEXBUFFER; }

	HRESULT Lock(UINT offset, UINT size, BYTE **data, DWORD flags) override
	{
		if (data == nullptr || m_locked || offset > m_bytes.size()) {
			return E_FAIL;
		}
		if (size == 0) {
			size = static_cast<UINT>(m_bytes.size() - offset);
		}
		if (size > m_bytes.size() - offset) {
			return E_FAIL;
		}
		++g_state.buffer_lock_calls;
		m_locked = true;
		m_dirty_offset = offset;
		m_dirty_size = size;
		m_lock_flags = flags;
		*data = m_bytes.data() + offset;
		return S_OK;
	}

	HRESULT Unlock() override
	{
		if (!m_locked) {
			return E_FAIL;
		}
		++g_state.buffer_unlock_calls;
		if (m_dirty_size != 0) {
			m_checksum_cache.invalidate();
		}
		browser_buffer_update(BROWSER_BUFFER_INDEX, m_browser_buffer_id,
			m_bytes.data() + m_dirty_offset, m_dirty_offset, m_dirty_size, m_usage, m_lock_flags);
		m_locked = false;
		m_dirty_offset = 0;
		m_dirty_size = 0;
		m_lock_flags = 0;
		return S_OK;
	}

	UINT length() const { return static_cast<UINT>(m_bytes.size()); }
	const BYTE *data() const { return m_bytes.data(); }
	D3DFORMAT format() const { return m_format; }
	UINT index_size() const { return m_format == D3DFMT_INDEX32 ? 4 : 2; }
	UINT browser_buffer_id() const { return m_browser_buffer_id; }

	void create_browser_buffer()
	{
		if (!m_browser_buffer_created) {
			browser_buffer_create(BROWSER_BUFFER_INDEX, m_browser_buffer_id, length(), m_usage);
			m_browser_buffer_created = true;
		}
	}

	DWORD checksum(UINT offset, UINT size) const
	{
		return m_checksum_cache.checksum(m_bytes.data(), length(), offset, size);
	}

	ULONG AddRef() override { return ++m_ref_count; }

	ULONG Release() override
	{
		const ULONG ref_count = --m_ref_count;
		if (ref_count == 0) {
			if (m_browser_buffer_created) {
				browser_buffer_release(BROWSER_BUFFER_INDEX, m_browser_buffer_id);
			}
			delete this;
		}
		return ref_count;
	}

private:
	ULONG m_ref_count = 1;
	std::vector<BYTE> m_bytes;
	DWORD m_usage = 0;
	D3DFORMAT m_format = D3DFMT_INDEX16;
	UINT m_browser_buffer_id = 0;
	bool m_browser_buffer_created = false;
	bool m_locked = false;
	UINT m_dirty_offset = 0;
	UINT m_dirty_size = 0;
	DWORD m_lock_flags = 0;
	BufferChecksumCache m_checksum_cache;
};

class BrowserD3DDevice final : public IDirect3DDevice8
{
public:
	explicit BrowserD3DDevice(const D3DPRESENT_PARAMETERS &parameters) : m_parameters(parameters)
	{
		if (m_parameters.BackBufferWidth == 0) {
			m_parameters.BackBufferWidth = 800;
		}
		if (m_parameters.BackBufferHeight == 0) {
			m_parameters.BackBufferHeight = 600;
		}
		if (m_parameters.BackBufferFormat == D3DFMT_UNKNOWN) {
			m_parameters.BackBufferFormat = D3DFMT_A8R8G8B8;
		}
		if (m_parameters.AutoDepthStencilFormat == D3DFMT_UNKNOWN) {
			m_parameters.AutoDepthStencilFormat = D3DFMT_D24S8;
		}

		m_viewport.X = 0;
		m_viewport.Y = 0;
		m_viewport.Width = m_parameters.BackBufferWidth;
		m_viewport.Height = m_parameters.BackBufferHeight;
		m_viewport.MinZ = 0.0f;
		m_viewport.MaxZ = 1.0f;

		m_back_buffer = new (std::nothrow) BrowserD3DSurface(this, m_parameters.BackBufferWidth,
			m_parameters.BackBufferHeight, m_parameters.BackBufferFormat, D3DUSAGE_RENDERTARGET);
		m_depth_stencil = new (std::nothrow) BrowserD3DSurface(this, m_parameters.BackBufferWidth,
			m_parameters.BackBufferHeight, m_parameters.AutoDepthStencilFormat, D3DUSAGE_DEPTHSTENCIL);
		m_default_render_target = m_back_buffer; // the real canvas target

		g_state.back_buffer_width = m_parameters.BackBufferWidth;
		g_state.back_buffer_height = m_parameters.BackBufferHeight;
		g_state.back_buffer_format = m_parameters.BackBufferFormat;
		g_state.depth_stencil_format = m_parameters.AutoDepthStencilFormat;
		g_state.viewport = m_viewport;
		wasm_d3d8_browser_set_viewport(
			m_viewport.X,
			m_viewport.Y,
			m_viewport.Width,
			m_viewport.Height,
			m_viewport.MinZ,
			m_viewport.MaxZ,
			m_parameters.BackBufferWidth,
			m_parameters.BackBufferHeight);
	}

	~BrowserD3DDevice()
	{
		if (m_stream_source != nullptr) {
			m_stream_source->Release();
			m_stream_source = nullptr;
		}
		if (m_indices != nullptr) {
			m_indices->Release();
			m_indices = nullptr;
		}
		if (m_user_pointer_vertex_buffer != nullptr) {
			m_user_pointer_vertex_buffer->Release();
			m_user_pointer_vertex_buffer = nullptr;
		}
		if (m_user_pointer_index_buffer != nullptr) {
			m_user_pointer_index_buffer->Release();
			m_user_pointer_index_buffer = nullptr;
		}
		// Release device-held references on all still-bound textures, matching
		// the DX8 device-reset / teardown contract (see
		// DX8Wrapper::Invalidate_Cached_Render_States).
		for (auto &entry : m_bound_textures) {
			if (entry.second != nullptr) {
				entry.second->Release();
			}
		}
		m_bound_textures.clear();
		m_bound_texture_ids.clear();
		if (m_back_buffer != nullptr) {
			m_back_buffer->Release();
			m_back_buffer = nullptr;
		}
		if (m_depth_stencil != nullptr) {
			m_depth_stencil->Release();
			m_depth_stencil = nullptr;
		}
	}

	HRESULT TestCooperativeLevel() override { return S_OK; }

	HRESULT GetDeviceCaps(D3DCAPS8 *caps) override
	{
		if (caps == nullptr) {
			return E_FAIL;
		}
		fill_caps(*caps);
		return S_OK;
	}

	HRESULT GetDisplayMode(D3DDISPLAYMODE *mode) override
	{
		if (mode == nullptr) {
			return E_FAIL;
		}
		fill_display_mode(*mode);
		return S_OK;
	}

	HRESULT SetCursorProperties(UINT, UINT, IDirect3DSurface8 *) override { return S_OK; }
	void SetCursorPosition(int, int, DWORD) override {}
	BOOL ShowCursor(BOOL show) override { return show; }
	HRESULT CreateAdditionalSwapChain(D3DPRESENT_PARAMETERS *, IDirect3DSwapChain8 **) override
	{
		return D3DERR_NOTAVAILABLE;
	}

	HRESULT Reset(D3DPRESENT_PARAMETERS *parameters) override
	{
		if (parameters != nullptr) {
			m_parameters = *parameters;
		}
		return S_OK;
	}

	HRESULT Present(const RECT *, const RECT *, HWND, const void *) override
	{
		++g_state.present_calls;
		return S_OK;
	}

	HRESULT GetBackBuffer(UINT, DWORD, IDirect3DSurface8 **surface) override
	{
		if (surface == nullptr || m_back_buffer == nullptr) {
			return E_FAIL;
		}
		m_back_buffer->AddRef();
		*surface = m_back_buffer;
		return S_OK;
	}

	HRESULT GetRasterStatus(void *) override { return D3DERR_NOTAVAILABLE; }
	void SetGammaRamp(DWORD flags, const void *ramp) override
	{
		if (ramp == nullptr) {
			return;
		}
		const D3DGAMMARAMP *gamma_ramp = static_cast<const D3DGAMMARAMP *>(ramp);
		m_gamma_ramp = *gamma_ramp;
		m_has_gamma_ramp = true;
		wasm_d3d8_browser_set_gamma_ramp(flags, m_gamma_ramp.red, m_gamma_ramp.green, m_gamma_ramp.blue);
	}

	void GetGammaRamp(void *ramp) override
	{
		if (ramp == nullptr) {
			return;
		}
		D3DGAMMARAMP *gamma_ramp = static_cast<D3DGAMMARAMP *>(ramp);
		if (m_has_gamma_ramp) {
			*gamma_ramp = m_gamma_ramp;
		} else {
			fill_identity_gamma_ramp(*gamma_ramp);
		}
	}
	HRESULT CreateTexture(UINT width, UINT height, UINT levels, DWORD usage, D3DFORMAT format, D3DPOOL pool,
		IDirect3DTexture8 **texture) override
	{
		if (texture == nullptr) {
			return E_FAIL;
		}
		*texture = new (std::nothrow) BrowserD3DTexture(this, width, height, levels, usage, format, pool);
		if (*texture == nullptr) {
			return D3DERR_OUTOFVIDEOMEMORY;
		}
		BrowserD3DTexture *browser_texture = static_cast<BrowserD3DTexture *>(*texture);
		if (!browser_texture->is_valid()) {
			browser_texture->Release();
			*texture = nullptr;
			return D3DERR_OUTOFVIDEOMEMORY;
		}
		browser_texture->create_browser_texture();
		++g_state.create_texture_calls;
		return S_OK;
	}
	HRESULT CreateVolumeTexture(UINT width, UINT height, UINT depth, UINT levels, DWORD usage, D3DFORMAT format,
		D3DPOOL pool, IDirect3DVolumeTexture8 **texture) override
	{
		if (texture == nullptr) {
			return E_FAIL;
		}
		*texture = new (std::nothrow) BrowserD3DVolumeTexture(
			this, width, height, depth, levels, usage, format, pool);
		if (*texture == nullptr) {
			return D3DERR_OUTOFVIDEOMEMORY;
		}
		BrowserD3DVolumeTexture *browser_texture = static_cast<BrowserD3DVolumeTexture *>(*texture);
		if (!browser_texture->is_valid()) {
			browser_texture->Release();
			*texture = nullptr;
			return D3DERR_OUTOFVIDEOMEMORY;
		}
		browser_texture->create_browser_texture();
		++g_state.create_volume_texture_calls;
		return S_OK;
	}
	HRESULT CreateCubeTexture(UINT, UINT, DWORD, D3DFORMAT, D3DPOOL, IDirect3DCubeTexture8 **) override
	{
		return D3DERR_NOTAVAILABLE;
	}
	HRESULT CreateVertexBuffer(UINT length, DWORD usage, DWORD fvf, D3DPOOL pool,
		IDirect3DVertexBuffer8 **buffer) override
	{
		if (buffer == nullptr) {
			return E_FAIL;
		}
		*buffer = new (std::nothrow) BrowserD3DVertexBuffer(this, length, usage, fvf, pool);
		if (*buffer == nullptr) {
			return D3DERR_OUTOFVIDEOMEMORY;
		}
		BrowserD3DVertexBuffer *browser_buffer = static_cast<BrowserD3DVertexBuffer *>(*buffer);
		if (!browser_buffer->is_valid()) {
			browser_buffer->Release();
			*buffer = nullptr;
			return D3DERR_OUTOFVIDEOMEMORY;
		}
		browser_buffer->create_browser_buffer();
		++g_state.create_vertex_buffer_calls;
		return S_OK;
	}
	HRESULT CreateIndexBuffer(UINT length, DWORD usage, D3DFORMAT format, D3DPOOL pool,
		IDirect3DIndexBuffer8 **buffer) override
	{
		if (buffer == nullptr) {
			return E_FAIL;
		}
		*buffer = new (std::nothrow) BrowserD3DIndexBuffer(this, length, usage, format, pool);
		if (*buffer == nullptr) {
			return D3DERR_OUTOFVIDEOMEMORY;
		}
		BrowserD3DIndexBuffer *browser_buffer = static_cast<BrowserD3DIndexBuffer *>(*buffer);
		if (!browser_buffer->is_valid()) {
			browser_buffer->Release();
			*buffer = nullptr;
			return D3DERR_OUTOFVIDEOMEMORY;
		}
		browser_buffer->create_browser_buffer();
		++g_state.create_index_buffer_calls;
		return S_OK;
	}

	HRESULT CreateImageSurface(UINT width, UINT height, D3DFORMAT format, IDirect3DSurface8 **surface) override
	{
		return create_surface(width, height, format, 0, surface);
	}

	HRESULT CreateRenderTarget(UINT width, UINT height, D3DFORMAT format, UINT, BOOL,
		IDirect3DSurface8 **surface) override
	{
		return create_surface(width, height, format, D3DUSAGE_RENDERTARGET, surface);
	}

	HRESULT CreateDepthStencilSurface(UINT width, UINT height, D3DFORMAT format, UINT,
		IDirect3DSurface8 **surface) override
	{
		return create_surface(width, height, format, D3DUSAGE_DEPTHSTENCIL, surface);
	}

	HRESULT UpdateTexture(IDirect3DBaseTexture8 *source_texture, IDirect3DBaseTexture8 *destination_texture) override
	{
		if (source_texture == nullptr || destination_texture == nullptr ||
			source_texture->GetType() != D3DRTYPE_TEXTURE ||
			destination_texture->GetType() != D3DRTYPE_TEXTURE) {
			return E_FAIL;
		}
		BrowserD3DTexture *source =
			static_cast<BrowserD3DTexture *>(static_cast<IDirect3DTexture8 *>(source_texture));
		BrowserD3DTexture *destination =
			static_cast<BrowserD3DTexture *>(static_cast<IDirect3DTexture8 *>(destination_texture));
		if (source->pool() != D3DPOOL_SYSTEMMEM ||
			destination->pool() != D3DPOOL_DEFAULT ||
			source->format() != destination->format()) {
			return E_FAIL;
		}
		return destination->copy_from(*source);
	}
	HRESULT CopyRects(IDirect3DSurface8 *source_surface, const RECT *source_rects, UINT rect_count,
		IDirect3DSurface8 *destination_surface, const POINT *destination_points) override
	{
		if (source_surface == nullptr || destination_surface == nullptr) {
			return E_FAIL;
		}

		BrowserD3DSurface *source = static_cast<BrowserD3DSurface *>(source_surface);
		BrowserD3DSurface *destination = static_cast<BrowserD3DSurface *>(destination_surface);
		D3DSURFACE_DESC source_desc = {};
		D3DSURFACE_DESC destination_desc = {};
		if (FAILED(source->GetDesc(&source_desc)) ||
			FAILED(destination->GetDesc(&destination_desc)) ||
			source_desc.Format != destination_desc.Format) {
			return E_FAIL;
		}

		const UINT effective_rect_count = (source_rects == nullptr || rect_count == 0) ? 1 : rect_count;
		if (!destination->copy_rects_from(*source, source_rects, rect_count, destination_points)) {
			return E_FAIL;
		}
		destination->upload_owned_texture();

		++g_state.copy_rects_calls;
		g_state.last_copy_rects_rect_count = effective_rect_count;
		g_state.last_copy_rects_width = source_rects == nullptr || rect_count == 0 ?
			source_desc.Width : static_cast<UINT>(source_rects[0].right - source_rects[0].left);
		g_state.last_copy_rects_height = source_rects == nullptr || rect_count == 0 ?
			source_desc.Height : static_cast<UINT>(source_rects[0].bottom - source_rects[0].top);
		g_state.last_copy_rects_format = source_desc.Format;
		g_state.last_copy_rects_uploaded_texture_id = destination->texture_owner_id();
		return S_OK;
	}
	HRESULT ResourceManagerDiscardBytes(DWORD) override { return S_OK; }
	UINT GetAvailableTextureMem() override { return 64 * 1024 * 1024; }
	HRESULT GetFrontBuffer(IDirect3DSurface8 *) override { return D3DERR_NOTAVAILABLE; }

	HRESULT SetRenderTarget(IDirect3DSurface8 *render_target, IDirect3DSurface8 *depth_stencil) override
	{
		if (render_target != nullptr) {
			render_target->AddRef();
		}
		if (depth_stencil != nullptr) {
			depth_stencil->AddRef();
		}
		if (m_back_buffer != nullptr) {
			m_back_buffer->Release();
		}
		if (m_depth_stencil != nullptr) {
			m_depth_stencil->Release();
		}
		m_back_buffer = render_target;
		m_depth_stencil = depth_stencil;

		// Resolve texture IDs for FBO binding
		UINT color_texture_id = 0;
		UINT depth_texture_id = 0;
		UINT width = 0;
		UINT height = 0;

		if (render_target != nullptr && render_target != m_default_render_target) {
			// Offscreen render target: get its texture ID and dimensions
			BrowserD3DSurface *browser_surface = static_cast<BrowserD3DSurface *>(render_target);
			color_texture_id = browser_surface->texture_owner_id();
			D3DSURFACE_DESC desc;
			if (SUCCEEDED(render_target->GetDesc(&desc))) {
				width = desc.Width;
				height = desc.Height;
			}
			// Try to get depth texture ID from depth_stencil surface if provided
			if (depth_stencil != nullptr) {
				BrowserD3DSurface *browser_depth = static_cast<BrowserD3DSurface *>(depth_stencil);
				depth_texture_id = browser_depth->texture_owner_id();
			}
		}

		// Bind the appropriate framebuffer
		browser_fbo_bind(color_texture_id, depth_texture_id, width, height);

		// Track current FBO state
		m_current_fbo_color_texture_id = color_texture_id;
		m_current_fbo_depth_texture_id = depth_texture_id;

		return S_OK;
	}

	HRESULT GetRenderTarget(IDirect3DSurface8 **render_target) override
	{
		if (render_target == nullptr || m_back_buffer == nullptr) {
			return E_FAIL;
		}
		m_back_buffer->AddRef();
		*render_target = m_back_buffer;
		return S_OK;
	}

	HRESULT GetDepthStencilSurface(IDirect3DSurface8 **depth_stencil) override
	{
		if (depth_stencil == nullptr || m_depth_stencil == nullptr) {
			return E_FAIL;
		}
		m_depth_stencil->AddRef();
		*depth_stencil = m_depth_stencil;
		return S_OK;
	}

	HRESULT BeginScene() override
	{
		++g_state.begin_scene_calls;
		return S_OK;
	}

	HRESULT EndScene() override
	{
		++g_state.end_scene_calls;
		return S_OK;
	}

	HRESULT Clear(DWORD, const void *, DWORD flags, D3DCOLOR color, float z, DWORD stencil) override
	{
		++g_state.clear_calls;
		g_state.last_clear_flags = flags;
		g_state.last_clear_color = color;
		g_state.last_clear_z = z;
		g_state.last_clear_stencil = stencil;
		// Forward the clear when ANY of color/depth/stencil is requested — a
		// depth-only clear (DX8Wrapper::Clear(false, true, ...) => ZBUFFER without
		// TARGET) must still reach WebGL, otherwise the depth buffer is never
		// reset and later geometry (terrain) fails the depth test.
		if ((flags & (D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER | D3DCLEAR_STENCIL)) != 0) {
			browser_clear_target(flags, color, z, stencil);
		}
		return S_OK;
	}

	HRESULT SetTransform(D3DTRANSFORMSTATETYPE state, const D3DMATRIX *matrix) override
	{
		if (matrix == nullptr) {
			return E_FAIL;
		}
		if (is_cached_draw_texture_transform(state)) {
			const auto found = m_transforms.find(state);
			if (found == m_transforms.end() || !memory_equal(found->second, *matrix)) {
				invalidate_draw_derived_payload();
			}
		}
		m_transforms[state] = *matrix;
		++g_state.set_transform_calls;
		g_state.last_set_transform_state = state;
		g_state.last_set_transform_matrix = *matrix;
		return S_OK;
	}
	HRESULT GetTransform(D3DTRANSFORMSTATETYPE state, D3DMATRIX *matrix) override
	{
		if (matrix == nullptr) {
			return E_FAIL;
		}
		const auto found = m_transforms.find(state);
		if (found != m_transforms.end()) {
			*matrix = found->second;
		} else {
			identity_matrix(*matrix);
		}
		++g_state.get_transform_calls;
		g_state.last_get_transform_state = state;
		return S_OK;
	}
	HRESULT MultiplyTransform(D3DTRANSFORMSTATETYPE state, const D3DMATRIX *matrix) override
	{
		if (matrix == nullptr) {
			return E_FAIL;
		}
		D3DMATRIX current = {};
		const auto found = m_transforms.find(state);
		if (found != m_transforms.end()) {
			current = found->second;
		} else {
			identity_matrix(current);
		}
		const D3DMATRIX multiplied = multiply_matrix(*matrix, current);
		if (is_cached_draw_texture_transform(state)) {
			const auto found = m_transforms.find(state);
			if (found == m_transforms.end() || !memory_equal(found->second, multiplied)) {
				invalidate_draw_derived_payload();
			}
		}
		m_transforms[state] = multiplied;
		return S_OK;
	}

	HRESULT SetViewport(const D3DVIEWPORT8 *viewport) override
	{
		if (viewport == nullptr) {
			return E_FAIL;
		}
		m_viewport = *viewport;
		g_state.viewport = m_viewport;
		++g_state.set_viewport_calls;
		wasm_d3d8_browser_set_viewport(
			m_viewport.X,
			m_viewport.Y,
			m_viewport.Width,
			m_viewport.Height,
			m_viewport.MinZ,
			m_viewport.MaxZ,
			m_parameters.BackBufferWidth,
			m_parameters.BackBufferHeight);
		return S_OK;
	}

	HRESULT GetViewport(D3DVIEWPORT8 *viewport) override
	{
		if (viewport == nullptr) {
			return E_FAIL;
		}
		*viewport = m_viewport;
		++g_state.get_viewport_calls;
		return S_OK;
	}

	HRESULT SetMaterial(const D3DMATERIAL8 *material) override
	{
		if (material == nullptr) {
			return E_FAIL;
		}
		if (!memory_equal(m_material, *material)) {
			invalidate_draw_derived_payload();
		}
		m_material = *material;
		++g_state.set_material_calls;
		g_state.last_set_material = draw_material_from_d3d(m_material);
		return S_OK;
	}
	HRESULT GetMaterial(D3DMATERIAL8 *material) override
	{
		if (material == nullptr) {
			return E_FAIL;
		}
		*material = m_material;
		++g_state.get_material_calls;
		g_state.last_get_material = draw_material_from_d3d(m_material);
		return S_OK;
	}
	HRESULT SetLight(DWORD index, const D3DLIGHT8 *light) override
	{
		if (light == nullptr || index >= WASM_D3D8_LIGHT_COUNT) {
			return E_FAIL;
		}
		if (!memory_equal(m_lights[index], *light)) {
			invalidate_draw_derived_payload();
		}
		m_lights[index] = *light;
		++g_state.set_light_calls;
		g_state.last_set_light_index = index;
		g_state.last_set_light = draw_light_from_d3d(*light, m_light_enabled[index]);
		return S_OK;
	}
	HRESULT LightEnable(DWORD index, BOOL enable) override
	{
		if (index >= WASM_D3D8_LIGHT_COUNT) {
			return E_FAIL;
		}
		const BOOL enabled = enable ? TRUE : FALSE;
		if (m_light_enabled[index] != enabled) {
			invalidate_draw_derived_payload();
		}
		m_light_enabled[index] = enabled;
		++g_state.light_enable_calls;
		g_state.last_light_enable_index = index;
		g_state.last_light_enable_value = m_light_enabled[index];
		return S_OK;
	}
	HRESULT SetClipPlane(DWORD index, const float *plane) override
	{
		if (plane == nullptr || index >= WASM_D3D8_CLIP_PLANE_COUNT) {
			return E_FAIL;
		}
		if (std::memcmp(m_clip_planes[index], plane, sizeof(m_clip_planes[index])) != 0) {
			invalidate_draw_derived_payload();
		}
		std::memcpy(m_clip_planes[index], plane, sizeof(m_clip_planes[index]));
		++g_state.set_clip_plane_calls;
		g_state.last_set_clip_plane_index = index;
		std::memcpy(g_state.last_set_clip_plane, plane, sizeof(g_state.last_set_clip_plane));
		return S_OK;
	}
	HRESULT SetRenderState(D3DRENDERSTATETYPE state, DWORD value) override
	{
		if (render_state_value(state) != value) {
			invalidate_draw_derived_payload();
		}
		m_render_states[state] = value;
		++g_state.set_render_state_calls;
		if (state == D3DRS_ZFUNC && value == D3DCMP_EQUAL) {
			++g_state.set_render_state_zfunc_equal_calls;
		}
		g_state.last_set_render_state = state;
		g_state.last_set_render_state_value = value;
		return S_OK;
	}
	HRESULT GetRenderState(D3DRENDERSTATETYPE state, DWORD *value) override
	{
		if (value == nullptr) {
			return E_FAIL;
		}
		*value = render_state_value(state);
		++g_state.get_render_state_calls;
		g_state.last_get_render_state = state;
		return S_OK;
	}
	HRESULT SetTexture(DWORD stage, IDirect3DBaseTexture8 *texture) override
	{
		// Same-pointer early-return, mirroring the original
		// DX8Wrapper::Set_DX8_Texture (`if (Textures[stage]==texture) return;`)
		// and D3D8 device semantics: rebinding the texture that is already
		// bound on this stage is a no-op. The unconditional Release-then-AddRef
		// below would otherwise drop the device-held reference mid-call when it
		// is the only remaining reference (engine already released its handle),
		// destroying the object and then AddRef'ing freed memory (use-after-free).
		{
			auto already_bound = m_bound_textures.find(stage);
			if (already_bound != m_bound_textures.end() && already_bound->second == texture) {
				return S_OK;
			}
		}

		UINT texture_id = 0;
		D3DRESOURCETYPE texture_type = D3DRTYPE_FORCE_DWORD;
		if (texture != nullptr) {
			texture_type = texture->GetType();
			if (texture_type == D3DRTYPE_TEXTURE) {
				BrowserD3DTexture *browser_texture =
					static_cast<BrowserD3DTexture *>(static_cast<IDirect3DTexture8 *>(texture));
				texture_id = browser_texture->browser_texture_id();
			} else if (texture_type == D3DRTYPE_VOLUMETEXTURE) {
				BrowserD3DVolumeTexture *browser_texture =
					static_cast<BrowserD3DVolumeTexture *>(static_cast<IDirect3DVolumeTexture8 *>(texture));
				texture_id = browser_texture->browser_texture_id();
			} else {
				return E_FAIL;
			}
		}

		++g_state.set_texture_calls;
		g_state.last_set_texture_stage = stage;
		g_state.last_set_texture_id = texture_id;
		g_state.last_set_texture_type = texture_type;

		// DX8 device-held reference contract: IDirect3DDevice8::SetTexture holds
		// its own reference on the currently-bound texture. Binding a new texture
		// Releases the previously-bound one (held by the device) and AddRefs the
		// new one; binding NULL Releases the previously-bound one. This matches
		// the original DX8Wrapper::Set_DX8_Texture shadow and Microsoft's DX8
		// device contract, so a texture that is still bound is not destroyed
		// when the engine releases its own handle, and device teardown unbinds.
		auto previous = m_bound_textures.find(stage);
		if (previous != m_bound_textures.end()) {
			previous->second->Release();
			m_bound_textures.erase(previous);
			m_bound_texture_ids.erase(stage);
		}
		if (texture != nullptr) {
			texture->AddRef();
			m_bound_textures[stage] = texture;
			m_bound_texture_ids[stage] = texture_id;
		}
		browser_texture_bind(stage, texture_id);
		return S_OK;
	}
	HRESULT SetTextureStageState(DWORD stage, D3DTEXTURESTAGESTATETYPE state, DWORD value) override
	{
		if (texture_stage_state_value(stage, state) != value) {
			invalidate_draw_derived_payload();
		}
		m_texture_stage_states[stage][state] = value;
		++g_state.set_texture_stage_state_calls;
		if (state == D3DTSS_TEXCOORDINDEX && value == D3DTSS_TCI_CAMERASPACEPOSITION) {
			++g_state.set_texture_stage_state_camera_space_texcoord_calls;
		}
		if (state == D3DTSS_TEXTURETRANSFORMFLAGS && value == D3DTTFF_COUNT2) {
			++g_state.set_texture_stage_state_texture_transform_count2_calls;
		}
		g_state.last_set_texture_stage_state_stage = stage;
		g_state.last_set_texture_stage_state = state;
		g_state.last_set_texture_stage_state_value = value;
		return S_OK;
	}
	HRESULT GetTextureStageState(DWORD stage, D3DTEXTURESTAGESTATETYPE state, DWORD *value) override
	{
		if (value == nullptr) {
			return E_FAIL;
		}
		*value = texture_stage_state_value(stage, state);
		return S_OK;
	}
	HRESULT ValidateDevice(DWORD *passes) override
	{
		if (passes != nullptr) {
			*passes = 1;
		}
		return S_OK;
	}
	HRESULT SetCurrentTexturePalette(UINT) override { return S_OK; }
	HRESULT DrawPrimitive(D3DPRIMITIVETYPE primitive_type, UINT start_vertex, UINT primitive_count) override
	{
		++g_state.draw_primitive_calls;
		g_state.last_draw_primitive_type = primitive_type;
		g_state.last_draw_start_vertex = start_vertex;
		g_state.last_draw_primitive_count = primitive_count;
		const UINT vertex_count = primitive_vertex_count(primitive_type, primitive_count);
		g_state.last_draw_min_vertex_index = 0;
		g_state.last_draw_vertex_count = vertex_count;
		g_state.last_draw_start_index = 0;
		if (primitive_count == 0 || vertex_count == 0) {
			capture_bound_draw(start_vertex, vertex_count, 0, 0);
			return S_OK;
		}
		return draw_bound_sequential_primitive(primitive_type, start_vertex, vertex_count);
	}
	HRESULT DrawIndexedPrimitive(D3DPRIMITIVETYPE primitive_type, UINT min_index, UINT vertex_count,
		UINT start_index, UINT primitive_count) override
	{
		const bool profile_sorted_draw_submit = wasm_d3d8_sorted_draw_profile_enabled();
		WASM_D3D8_NOTE_SORTED_DRAW_STEP(profile_sorted_draw_submit,"WasmD3D8.DrawIndexedPrimitive.entry");
		++g_state.draw_indexed_primitive_calls;
		g_state.last_draw_primitive_type = primitive_type;
		g_state.last_draw_min_vertex_index = min_index;
		g_state.last_draw_vertex_count = vertex_count;
		g_state.last_draw_start_index = start_index;
		g_state.last_draw_primitive_count = primitive_count;
		WASM_D3D8_NOTE_SORTED_DRAW_STEP(profile_sorted_draw_submit,"WasmD3D8.DrawIndexedPrimitive.captureBound.before");
		capture_bound_draw(m_indices_base_vertex_index + min_index, vertex_count, start_index,
			primitive_vertex_count(primitive_type, primitive_count));
		WASM_D3D8_NOTE_SORTED_DRAW_STEP(profile_sorted_draw_submit,"WasmD3D8.DrawIndexedPrimitive.drawBound.before");
		draw_bound_indexed_primitive(primitive_type, m_indices_base_vertex_index, min_index, vertex_count,
			start_index, primitive_vertex_count(primitive_type, primitive_count));
		WASM_D3D8_NOTE_SORTED_DRAW_STEP(profile_sorted_draw_submit,"WasmD3D8.DrawIndexedPrimitive.drawBound.after");
		return S_OK;
	}
	HRESULT DrawPrimitiveUP(D3DPRIMITIVETYPE primitive_type, UINT primitive_count,
		const void *vertex_stream_zero_data, UINT vertex_stream_zero_stride) override
	{
		++g_state.draw_primitive_calls;
		g_state.last_draw_primitive_type = primitive_type;
		g_state.last_draw_start_vertex = 0;
		g_state.last_draw_primitive_count = primitive_count;

		clear_stream_source_zero();
		const UINT vertex_count = primitive_vertex_count(primitive_type, primitive_count);
		if (primitive_count == 0 || vertex_stream_zero_stride == 0 || vertex_count == 0) {
			return S_OK;
		}
		if (vertex_stream_zero_data == nullptr ||
				vertex_count > std::numeric_limits<UINT>::max() / vertex_stream_zero_stride) {
			return E_FAIL;
		}
		const UINT vertex_byte_size = vertex_count * vertex_stream_zero_stride;
		if (FAILED(upload_user_pointer_vertex_data(vertex_stream_zero_data, vertex_byte_size)) ||
				FAILED(upload_sequential_user_pointer_indices(vertex_count))) {
			return E_FAIL;
		}

		IDirect3DIndexBuffer8 *saved_indices = m_indices;
		const UINT saved_base_vertex_index = m_indices_base_vertex_index;
		if (saved_indices != nullptr) {
			saved_indices->AddRef();
		}

		bind_stream_source_zero(m_user_pointer_vertex_buffer, vertex_stream_zero_stride);
		bind_indices(m_user_pointer_index_buffer, 0);
		capture_bound_draw(0, vertex_count, 0, vertex_count);
		draw_bound_indexed_primitive(primitive_type, 0, 0, vertex_count, 0, vertex_count);

		clear_stream_source_zero();
		clear_indices();
		m_indices = saved_indices;
		m_indices_base_vertex_index = saved_indices != nullptr ? saved_base_vertex_index : 0;
		return S_OK;
	}
	HRESULT DrawIndexedPrimitiveUP(D3DPRIMITIVETYPE primitive_type, UINT min_vertex_index, UINT vertex_count,
		UINT primitive_count, const void *index_data, D3DFORMAT index_data_format,
		const void *vertex_stream_zero_data, UINT vertex_stream_zero_stride) override
	{
		++g_state.draw_indexed_primitive_calls;
		g_state.last_draw_primitive_type = primitive_type;
		g_state.last_draw_min_vertex_index = min_vertex_index;
		g_state.last_draw_vertex_count = vertex_count;
		g_state.last_draw_start_index = 0;
		g_state.last_draw_primitive_count = primitive_count;

		clear_stream_source_zero();
		clear_indices();
		const UINT index_count = primitive_vertex_count(primitive_type, primitive_count);
		if (primitive_count == 0 || vertex_stream_zero_stride == 0 || index_count == 0) {
			return S_OK;
		}
		if (index_data_format != D3DFMT_INDEX16 && index_data_format != D3DFMT_INDEX32) {
			return E_FAIL;
		}
		const UINT index_size = index_data_format == D3DFMT_INDEX32 ? 4 : 2;
		if (index_data == nullptr || vertex_stream_zero_data == nullptr ||
				index_count > std::numeric_limits<UINT>::max() / index_size ||
				min_vertex_index > std::numeric_limits<UINT>::max() - vertex_count ||
				(min_vertex_index + vertex_count) >
					std::numeric_limits<UINT>::max() / vertex_stream_zero_stride) {
			return E_FAIL;
		}

		const UINT index_byte_size = index_count * index_size;
		const UINT vertex_byte_size = (min_vertex_index + vertex_count) * vertex_stream_zero_stride;
		if (FAILED(upload_user_pointer_vertex_data(vertex_stream_zero_data, vertex_byte_size)) ||
				FAILED(upload_user_pointer_index_data(index_data, index_byte_size, index_data_format))) {
			return E_FAIL;
		}

		bind_stream_source_zero(m_user_pointer_vertex_buffer, vertex_stream_zero_stride);
		bind_indices(m_user_pointer_index_buffer, 0);
		capture_bound_draw(min_vertex_index, vertex_count, 0, index_count);
		draw_bound_indexed_primitive(primitive_type, 0, min_vertex_index, vertex_count, 0, index_count);
		clear_stream_source_zero();
		clear_indices();
		return S_OK;
	}
	HRESULT ProcessVertices(UINT, UINT, UINT, IDirect3DVertexBuffer8 *, DWORD) override
	{
		return D3DERR_NOTAVAILABLE;
	}
	HRESULT CreateVertexShader(const DWORD *, const DWORD *, DWORD *, DWORD) override
	{
		return D3DERR_NOTAVAILABLE;
	}
	HRESULT SetVertexShader(DWORD handle) override
	{
		++g_state.set_vertex_shader_calls;
		g_state.last_set_vertex_shader = handle;
		m_vertex_shader = handle;
		return S_OK;
	}
	HRESULT DeleteVertexShader(DWORD) override { return S_OK; }
	HRESULT SetVertexShaderConstant(DWORD, const void *, DWORD) override { return S_OK; }
	HRESULT CreatePixelShader(const DWORD *, DWORD *) override { return D3DERR_NOTAVAILABLE; }
	HRESULT SetPixelShader(DWORD) override { return S_OK; }
	HRESULT DeletePixelShader(DWORD) override { return S_OK; }
	HRESULT SetPixelShaderConstant(DWORD, const void *, DWORD) override { return S_OK; }
	HRESULT SetStreamSource(UINT stream_number, IDirect3DVertexBuffer8 *stream_data, UINT stride) override
	{
		++g_state.set_stream_source_calls;
		g_state.last_stream_source_stride = stride;
		if (stream_number == 0) {
			bind_stream_source_zero(stream_data, stride);
		}
		return S_OK;
	}
	HRESULT SetIndices(IDirect3DIndexBuffer8 *index_data, UINT base_vertex_index) override
	{
		++g_state.set_indices_calls;
		g_state.last_indices_base_vertex_index = base_vertex_index;
		bind_indices(index_data, base_vertex_index);
		return S_OK;
	}

	ULONG AddRef() override { return ++m_ref_count; }

	ULONG Release() override
	{
		const ULONG ref_count = --m_ref_count;
		if (ref_count == 0) {
			delete this;
		}
		return ref_count;
	}

private:
	void bind_stream_source_zero(IDirect3DVertexBuffer8 *stream_data, UINT stride)
	{
		if (stream_data != nullptr) {
			stream_data->AddRef();
		}
		if (m_stream_source != nullptr) {
			m_stream_source->Release();
		}
		m_stream_source = stream_data;
		m_stream_source_stride = stream_data != nullptr ? stride : 0;
	}

	void clear_stream_source_zero()
	{
		bind_stream_source_zero(nullptr, 0);
	}

	void bind_indices(IDirect3DIndexBuffer8 *index_data, UINT base_vertex_index)
	{
		if (index_data != nullptr) {
			index_data->AddRef();
		}
		if (m_indices != nullptr) {
			m_indices->Release();
		}
		m_indices = index_data;
		m_indices_base_vertex_index = index_data != nullptr ? base_vertex_index : 0;
	}

	void clear_indices()
	{
		bind_indices(nullptr, 0);
	}

	UINT user_pointer_buffer_capacity(UINT current_capacity, UINT required_capacity) const
	{
		constexpr UINT MIN_USER_POINTER_BUFFER_CAPACITY = 4096;
		if (required_capacity < MIN_USER_POINTER_BUFFER_CAPACITY) {
			required_capacity = MIN_USER_POINTER_BUFFER_CAPACITY;
		}
		if (current_capacity >= required_capacity) {
			return current_capacity;
		}
		if (current_capacity != 0 &&
				current_capacity <= std::numeric_limits<UINT>::max() / 2) {
			const UINT doubled = current_capacity * 2;
			if (doubled >= required_capacity) {
				return doubled;
			}
		}
		return required_capacity;
	}

	HRESULT ensure_user_pointer_vertex_buffer(UINT byte_size)
	{
		if (byte_size == 0) {
			return S_OK;
		}
		if (m_user_pointer_vertex_buffer != nullptr &&
				m_user_pointer_vertex_buffer_capacity >= byte_size) {
			return S_OK;
		}
		const UINT previous_capacity = m_user_pointer_vertex_buffer_capacity;
		if (m_user_pointer_vertex_buffer != nullptr) {
			m_user_pointer_vertex_buffer->Release();
			m_user_pointer_vertex_buffer = nullptr;
			m_user_pointer_vertex_buffer_capacity = 0;
		}
		const UINT capacity = user_pointer_buffer_capacity(previous_capacity, byte_size);
		m_user_pointer_vertex_buffer = new (std::nothrow) BrowserD3DVertexBuffer(
			this, capacity, D3DUSAGE_DYNAMIC | D3DUSAGE_WRITEONLY, 0, D3DPOOL_DEFAULT);
		if (m_user_pointer_vertex_buffer == nullptr || !m_user_pointer_vertex_buffer->is_valid()) {
			if (m_user_pointer_vertex_buffer != nullptr) {
				m_user_pointer_vertex_buffer->Release();
				m_user_pointer_vertex_buffer = nullptr;
			}
			return D3DERR_OUTOFVIDEOMEMORY;
		}
		m_user_pointer_vertex_buffer->create_browser_buffer();
		m_user_pointer_vertex_buffer_capacity = capacity;
		return S_OK;
	}

	HRESULT ensure_user_pointer_index_buffer(UINT byte_size, D3DFORMAT format)
	{
		if (byte_size == 0) {
			return S_OK;
		}
		if (m_user_pointer_index_buffer != nullptr &&
				m_user_pointer_index_buffer_capacity >= byte_size &&
				m_user_pointer_index_buffer_format == format) {
			return S_OK;
		}
		const UINT previous_capacity = m_user_pointer_index_buffer_capacity;
		if (m_user_pointer_index_buffer != nullptr) {
			m_user_pointer_index_buffer->Release();
			m_user_pointer_index_buffer = nullptr;
			m_user_pointer_index_buffer_capacity = 0;
		}
		const UINT capacity = user_pointer_buffer_capacity(previous_capacity, byte_size);
		m_user_pointer_index_buffer = new (std::nothrow) BrowserD3DIndexBuffer(
			this, capacity, D3DUSAGE_DYNAMIC | D3DUSAGE_WRITEONLY, format, D3DPOOL_DEFAULT);
		if (m_user_pointer_index_buffer == nullptr || !m_user_pointer_index_buffer->is_valid()) {
			if (m_user_pointer_index_buffer != nullptr) {
				m_user_pointer_index_buffer->Release();
				m_user_pointer_index_buffer = nullptr;
			}
			return D3DERR_OUTOFVIDEOMEMORY;
		}
		m_user_pointer_index_buffer->create_browser_buffer();
		m_user_pointer_index_buffer_capacity = capacity;
		m_user_pointer_index_buffer_format = format;
		return S_OK;
	}

	HRESULT upload_user_pointer_vertex_data(const void *data, UINT byte_size)
	{
		if (data == nullptr || byte_size == 0) {
			return E_FAIL;
		}
		if (FAILED(ensure_user_pointer_vertex_buffer(byte_size))) {
			return E_FAIL;
		}
		BYTE *target = nullptr;
		if (FAILED(m_user_pointer_vertex_buffer->Lock(0, byte_size, &target, D3DLOCK_DISCARD)) ||
				target == nullptr) {
			return E_FAIL;
		}
		std::memcpy(target, data, byte_size);
		return m_user_pointer_vertex_buffer->Unlock();
	}

	HRESULT upload_user_pointer_index_data(const void *data, UINT byte_size, D3DFORMAT format)
	{
		if (data == nullptr || byte_size == 0) {
			return E_FAIL;
		}
		if (FAILED(ensure_user_pointer_index_buffer(byte_size, format))) {
			return E_FAIL;
		}
		BYTE *target = nullptr;
		if (FAILED(m_user_pointer_index_buffer->Lock(0, byte_size, &target, D3DLOCK_DISCARD)) ||
				target == nullptr) {
			return E_FAIL;
		}
		std::memcpy(target, data, byte_size);
		return m_user_pointer_index_buffer->Unlock();
	}

	HRESULT upload_sequential_user_pointer_indices(UINT index_count)
	{
		if (index_count == 0) {
			return E_FAIL;
		}
		const D3DFORMAT format = index_count > std::numeric_limits<std::uint16_t>::max() ?
			D3DFMT_INDEX32 : D3DFMT_INDEX16;
		const UINT index_size = format == D3DFMT_INDEX32 ? 4 : 2;
		if (index_count > std::numeric_limits<UINT>::max() / index_size) {
			return E_FAIL;
		}
		const UINT byte_size = index_count * index_size;
		m_user_pointer_index_bytes.resize(byte_size);
		if (format == D3DFMT_INDEX32) {
			std::uint32_t *indices = reinterpret_cast<std::uint32_t *>(m_user_pointer_index_bytes.data());
			for (UINT index = 0; index < index_count; ++index) {
				indices[index] = index;
			}
		} else {
			std::uint16_t *indices = reinterpret_cast<std::uint16_t *>(m_user_pointer_index_bytes.data());
			for (UINT index = 0; index < index_count; ++index) {
				indices[index] = static_cast<std::uint16_t>(index);
			}
		}
		return upload_user_pointer_index_data(m_user_pointer_index_bytes.data(), byte_size, format);
	}

	HRESULT draw_bound_sequential_primitive(D3DPRIMITIVETYPE primitive_type, UINT start_vertex, UINT vertex_count)
	{
		if (m_stream_source == nullptr || m_stream_source_stride == 0) {
			capture_bound_draw(start_vertex, vertex_count, 0, 0);
			return S_OK;
		}
		if (start_vertex > std::numeric_limits<UINT>::max() / m_stream_source_stride ||
				vertex_count > std::numeric_limits<UINT>::max() / m_stream_source_stride) {
			return E_FAIL;
		}
		if (FAILED(upload_sequential_user_pointer_indices(vertex_count))) {
			return E_FAIL;
		}

		IDirect3DIndexBuffer8 *saved_indices = m_indices;
		const UINT saved_base_vertex_index = m_indices_base_vertex_index;
		if (saved_indices != nullptr) {
			saved_indices->AddRef();
		}

		bind_indices(m_user_pointer_index_buffer, 0);
		capture_bound_draw(start_vertex, vertex_count, 0, vertex_count);
		draw_bound_indexed_primitive(primitive_type, start_vertex, 0, vertex_count, 0, vertex_count);
		clear_indices();
		m_indices = saved_indices;
		m_indices_base_vertex_index = saved_indices != nullptr ? saved_base_vertex_index : 0;
		return S_OK;
	}

	void capture_bound_draw(UINT first_vertex, UINT vertex_count, UINT first_index, UINT index_count)
	{
		g_state.last_draw_vertex_buffer_length = 0;
		g_state.last_draw_vertex_buffer_offset = 0;
		g_state.last_draw_vertex_buffer_bytes = 0;
		g_state.last_draw_vertex_buffer_checksum = 0;
		g_state.last_draw_stream_source_stride = 0;
		g_state.last_draw_index_buffer_length = 0;
		g_state.last_draw_index_buffer_offset = 0;
		g_state.last_draw_index_buffer_bytes = 0;
		g_state.last_draw_index_buffer_checksum = 0;
		g_state.last_draw_index_format = D3DFMT_UNKNOWN;
		g_state.last_draw_vertex_buffer_id = 0;
		g_state.last_draw_index_buffer_id = 0;
		g_state.last_draw_vertex_shader = m_vertex_shader;
		g_state.last_draw_transform_mask = 0;
		g_state.last_draw_texture_transform_mask = 0;
		if (g_bound_draw_diagnostics_enabled) {
			identity_matrix(g_state.last_draw_world_transform);
			identity_matrix(g_state.last_draw_view_transform);
			identity_matrix(g_state.last_draw_projection_transform);
			identity_matrix(g_state.last_draw_texture0_transform);
			identity_matrix(g_state.last_draw_texture1_transform);
			g_state.last_draw_render_state = {};
			g_state.last_draw_material = draw_material_from_d3d(m_material);
		}

		if (m_stream_source != nullptr && m_stream_source_stride != 0) {
			const BrowserD3DVertexBuffer *stream =
				static_cast<const BrowserD3DVertexBuffer *>(m_stream_source);
			const UINT offset = first_vertex * m_stream_source_stride;
			const UINT requested_bytes = vertex_count * m_stream_source_stride;
			const UINT captured_bytes = checked_range_size(stream->length(), offset, requested_bytes);
			g_state.last_draw_stream_source_stride = m_stream_source_stride;
			g_state.last_draw_vertex_buffer_length = stream->length();
			g_state.last_draw_vertex_buffer_offset = offset;
			g_state.last_draw_vertex_buffer_bytes = captured_bytes;
			if (g_bound_draw_diagnostics_enabled) {
				g_state.last_draw_vertex_buffer_checksum = stream->checksum(offset, captured_bytes);
			}
			g_state.last_draw_vertex_buffer_id = stream->browser_buffer_id();
		}

		if (m_indices != nullptr && index_count != 0) {
			const BrowserD3DIndexBuffer *indices = static_cast<const BrowserD3DIndexBuffer *>(m_indices);
			const UINT index_size = indices->index_size();
			const UINT offset = first_index * index_size;
			const UINT requested_bytes = index_count * index_size;
			const UINT captured_bytes = checked_range_size(indices->length(), offset, requested_bytes);
			g_state.last_draw_index_buffer_length = indices->length();
			g_state.last_draw_index_buffer_offset = offset;
			g_state.last_draw_index_buffer_bytes = captured_bytes;
			if (g_bound_draw_diagnostics_enabled) {
				g_state.last_draw_index_buffer_checksum = indices->checksum(offset, captured_bytes);
			}
			g_state.last_draw_index_format = indices->format();
			g_state.last_draw_index_buffer_id = indices->browser_buffer_id();
		}
	}

	DWORD default_render_state_value(D3DRENDERSTATETYPE state) const
	{
		switch (state) {
			case D3DRS_CULLMODE:
				return D3DCULL_CW;
			case D3DRS_ZENABLE:
				return D3DZB_TRUE;
			case D3DRS_ZWRITEENABLE:
				return TRUE;
			case D3DRS_ZFUNC:
				return D3DCMP_LESSEQUAL;
			case D3DRS_ALPHABLENDENABLE:
				return FALSE;
			case D3DRS_SRCBLEND:
				return D3DBLEND_ONE;
			case D3DRS_DESTBLEND:
				return D3DBLEND_ZERO;
			case D3DRS_BLENDOP:
				return D3DBLENDOP_ADD;
			case D3DRS_ALPHATESTENABLE:
				return FALSE;
			case D3DRS_ALPHAFUNC:
				return D3DCMP_LESSEQUAL;
			case D3DRS_ALPHAREF:
				return 0;
			case D3DRS_COLORWRITEENABLE:
				return D3DCOLORWRITEENABLE_RED | D3DCOLORWRITEENABLE_GREEN |
					D3DCOLORWRITEENABLE_BLUE | D3DCOLORWRITEENABLE_ALPHA;
			case D3DRS_TEXTUREFACTOR:
				return 0;
			case D3DRS_STENCILENABLE:
				return FALSE;
			case D3DRS_STENCILFAIL:
			case D3DRS_STENCILZFAIL:
			case D3DRS_STENCILPASS:
				return D3DSTENCILOP_KEEP;
			case D3DRS_STENCILFUNC:
				return D3DCMP_ALWAYS;
			case D3DRS_STENCILREF:
				return 0;
			case D3DRS_STENCILMASK:
			case D3DRS_STENCILWRITEMASK:
				return 0xffffffffUL;
			case D3DRS_FOGENABLE:
			case D3DRS_SPECULARENABLE:
			case D3DRS_NORMALIZENORMALS:
				return FALSE;
			case D3DRS_FOGCOLOR:
			case D3DRS_FOGSTART:
				return 0;
			case D3DRS_FOGEND:
				return 0x3f800000UL;
			case D3DRS_FOGVERTEXMODE:
				return D3DFOG_LINEAR;
			case D3DRS_RANGEFOGENABLE:
				return FALSE;
			case D3DRS_CLIPPING:
				return TRUE;
			case D3DRS_CLIPPLANEENABLE:
				return 0;
			case D3DRS_FILLMODE:
				return D3DFILL_SOLID;
			case D3DRS_ZBIAS:
				return 0;
			case D3DRS_SHADEMODE:
				return D3DSHADE_GOURAUD;
			case D3DRS_LIGHTING:
				return TRUE;
			case D3DRS_LOCALVIEWER:
				return TRUE;
			case D3DRS_POINTSIZE:
				return 0x3f800000UL;
			case D3DRS_POINTSIZE_MIN:
				return 0;
			case D3DRS_POINTSIZE_MAX:
				return 0x42800000UL;
			case D3DRS_POINTSPRITEENABLE:
			case D3DRS_POINTSCALEENABLE:
				return FALSE;
			case D3DRS_POINTSCALE_A:
				return 0x3f800000UL;
			case D3DRS_POINTSCALE_B:
			case D3DRS_POINTSCALE_C:
				return 0;
			case D3DRS_AMBIENT:
				return 0;
			case D3DRS_COLORVERTEX:
				return TRUE;
			case D3DRS_DIFFUSEMATERIALSOURCE:
				return D3DMCS_COLOR1;
			case D3DRS_SPECULARMATERIALSOURCE:
				return D3DMCS_COLOR2;
			case D3DRS_AMBIENTMATERIALSOURCE:
			case D3DRS_EMISSIVEMATERIALSOURCE:
				return D3DMCS_MATERIAL;
			default:
				return 0;
		}
	}

	DWORD render_state_value(D3DRENDERSTATETYPE state) const
	{
		const auto found = m_render_states.find(state);
		return found != m_render_states.end() ? found->second : default_render_state_value(state);
	}

	DWORD default_texture_stage_state_value(DWORD stage, UINT state) const
	{
		switch (state) {
			case D3DTSS_COLOROP:
				return stage == 0 ? D3DTOP_MODULATE : D3DTOP_DISABLE;
			case D3DTSS_COLORARG1:
				return D3DTA_TEXTURE;
			case D3DTSS_COLORARG2:
				return D3DTA_CURRENT;
			case D3DTSS_ALPHAOP:
				return stage == 0 ? D3DTOP_SELECTARG1 : D3DTOP_DISABLE;
			case D3DTSS_ALPHAARG1:
				return D3DTA_TEXTURE;
			case D3DTSS_ALPHAARG2:
				return D3DTA_CURRENT;
			case D3DTSS_TEXCOORDINDEX:
				return stage;
			case D3DTSS_ADDRESSU:
			case D3DTSS_ADDRESSV:
			case D3DTSS_ADDRESSW:
				return D3DTADDRESS_WRAP;
			case D3DTSS_MAGFILTER:
			case D3DTSS_MINFILTER:
				return D3DTEXF_POINT;
			case D3DTSS_MIPFILTER:
				return D3DTEXF_NONE;
			case D3DTSS_MAXANISOTROPY:
				return 1;
			case D3DTSS_TEXTURETRANSFORMFLAGS:
				return D3DTTFF_DISABLE;
			case D3DTSS_COLORARG0:
			case D3DTSS_ALPHAARG0:
			case D3DTSS_RESULTARG:
				return D3DTA_CURRENT;
			default:
				return 0;
		}
	}

	DWORD texture_stage_state_value(DWORD stage, UINT state) const
	{
		const auto stage_found = m_texture_stage_states.find(stage);
		if (stage_found != m_texture_stage_states.end()) {
			const auto state_found =
				stage_found->second.find(static_cast<D3DTEXTURESTAGESTATETYPE>(state));
			if (state_found != stage_found->second.end()) {
				return state_found->second;
			}
		}
		return default_texture_stage_state_value(stage, state);
	}

	void capture_draw_texture_stage_states()
	{
		for (UINT stage = 0; stage < WASM_D3D8_TEXTURE_STAGE_COUNT; ++stage) {
			WasmD3D8DrawTextureStageState &texture_stage =
				g_state.last_draw_render_state.texture_stages[stage];
			for (UINT state = 0; state < WASM_D3D8_TEXTURE_STAGE_STATE_SLOTS; ++state) {
				texture_stage.values[state] = texture_stage_state_value(stage, state);
			}
		}
	}

	void capture_draw_render_state()
	{
		WasmD3D8DrawRenderState &state = g_state.last_draw_render_state;
		state.cull_mode = render_state_value(D3DRS_CULLMODE);
		state.z_enable = render_state_value(D3DRS_ZENABLE);
		state.z_write_enable = render_state_value(D3DRS_ZWRITEENABLE);
		state.z_func = render_state_value(D3DRS_ZFUNC);
		state.alpha_blend_enable = render_state_value(D3DRS_ALPHABLENDENABLE);
		state.src_blend = render_state_value(D3DRS_SRCBLEND);
		state.dest_blend = render_state_value(D3DRS_DESTBLEND);
		state.blend_op = render_state_value(D3DRS_BLENDOP);
		state.alpha_test_enable = render_state_value(D3DRS_ALPHATESTENABLE);
		state.alpha_func = render_state_value(D3DRS_ALPHAFUNC);
		state.alpha_ref = render_state_value(D3DRS_ALPHAREF);
		state.color_write_enable = render_state_value(D3DRS_COLORWRITEENABLE);
		state.texture_factor = render_state_value(D3DRS_TEXTUREFACTOR);
		state.stencil_enable = render_state_value(D3DRS_STENCILENABLE);
		state.stencil_fail = render_state_value(D3DRS_STENCILFAIL);
		state.stencil_z_fail = render_state_value(D3DRS_STENCILZFAIL);
		state.stencil_pass = render_state_value(D3DRS_STENCILPASS);
		state.stencil_func = render_state_value(D3DRS_STENCILFUNC);
		state.stencil_ref = render_state_value(D3DRS_STENCILREF);
		state.stencil_mask = render_state_value(D3DRS_STENCILMASK);
		state.stencil_write_mask = render_state_value(D3DRS_STENCILWRITEMASK);
		state.fog_enable = render_state_value(D3DRS_FOGENABLE);
		state.fog_color = render_state_value(D3DRS_FOGCOLOR);
		state.fog_start = render_state_value(D3DRS_FOGSTART);
		state.fog_end = render_state_value(D3DRS_FOGEND);
		state.fog_vertex_mode = render_state_value(D3DRS_FOGVERTEXMODE);
		state.range_fog_enable = render_state_value(D3DRS_RANGEFOGENABLE);
		state.fill_mode = render_state_value(D3DRS_FILLMODE);
		state.z_bias = render_state_value(D3DRS_ZBIAS);
		state.shade_mode = render_state_value(D3DRS_SHADEMODE);
		state.lighting = render_state_value(D3DRS_LIGHTING);
		state.ambient = render_state_value(D3DRS_AMBIENT);
		state.color_vertex = render_state_value(D3DRS_COLORVERTEX);
		state.diffuse_material_source = render_state_value(D3DRS_DIFFUSEMATERIALSOURCE);
		state.specular_material_source = render_state_value(D3DRS_SPECULARMATERIALSOURCE);
		state.ambient_material_source = render_state_value(D3DRS_AMBIENTMATERIALSOURCE);
		state.emissive_material_source = render_state_value(D3DRS_EMISSIVEMATERIALSOURCE);
		state.clipping = render_state_value(D3DRS_CLIPPING);
		state.clip_plane_enable = render_state_value(D3DRS_CLIPPLANEENABLE);
		state.specular_enable = render_state_value(D3DRS_SPECULARENABLE);
		state.normalize_normals = render_state_value(D3DRS_NORMALIZENORMALS);
		state.local_viewer = render_state_value(D3DRS_LOCALVIEWER);
		state.point_size = render_state_value(D3DRS_POINTSIZE);
		state.point_size_min = render_state_value(D3DRS_POINTSIZE_MIN);
		state.point_size_max = render_state_value(D3DRS_POINTSIZE_MAX);
		state.point_sprite_enable = render_state_value(D3DRS_POINTSPRITEENABLE);
		state.point_scale_enable = render_state_value(D3DRS_POINTSCALEENABLE);
		state.point_scale_a = render_state_value(D3DRS_POINTSCALE_A);
		state.point_scale_b = render_state_value(D3DRS_POINTSCALE_B);
		state.point_scale_c = render_state_value(D3DRS_POINTSCALE_C);
		std::memcpy(g_state.last_draw_clip_planes, m_clip_planes, sizeof(g_state.last_draw_clip_planes));
		for (UINT index = 0; index < WASM_D3D8_LIGHT_COUNT; ++index) {
			g_state.last_draw_lights[index] = draw_light_from_d3d(m_lights[index], m_light_enabled[index]);
		}
		capture_draw_texture_stage_states();
	}

	void capture_draw_material()
	{
		g_state.last_draw_material = draw_material_from_d3d(m_material);
	}

	void draw_bound_indexed_primitive(D3DPRIMITIVETYPE primitive_type, UINT base_vertex_index, UINT min_vertex_index,
		UINT vertex_count, UINT first_index, UINT index_count)
	{
		const bool profile_sorted_draw_submit = wasm_d3d8_sorted_draw_profile_enabled();
		WASM_D3D8_NOTE_SORTED_DRAW_STEP(profile_sorted_draw_submit,"WasmD3D8.drawBound.entry");
		if (m_stream_source == nullptr || m_indices == nullptr || m_stream_source_stride == 0 || index_count == 0) {
			WASM_D3D8_NOTE_SORTED_DRAW_STEP(profile_sorted_draw_submit,"WasmD3D8.drawBound.complete");
			return;
		}

		const BrowserD3DVertexBuffer *stream = static_cast<const BrowserD3DVertexBuffer *>(m_stream_source);
		const BrowserD3DIndexBuffer *indices = static_cast<const BrowserD3DIndexBuffer *>(m_indices);
		if (min_vertex_index > std::numeric_limits<UINT>::max() - vertex_count) {
			WASM_D3D8_NOTE_SORTED_DRAW_STEP(profile_sorted_draw_submit,"WasmD3D8.drawBound.complete");
			return;
		}

		WASM_D3D8_NOTE_SORTED_DRAW_STEP(profile_sorted_draw_submit,"WasmD3D8.drawBound.range.before");
		// Keep the D3D index buffer bytes unchanged for this first browser bridge.
		// Upload from BaseVertexIndex and include the MinVertexIndex range so raw
		// D3D indices still address the intended vertices in WebGL.
		const UINT uploaded_vertex_count = min_vertex_index + vertex_count;
		if (base_vertex_index > std::numeric_limits<UINT>::max() / m_stream_source_stride ||
				uploaded_vertex_count > std::numeric_limits<UINT>::max() / m_stream_source_stride) {
			WASM_D3D8_NOTE_SORTED_DRAW_STEP(profile_sorted_draw_submit,"WasmD3D8.drawBound.complete");
			return;
		}
		const UINT vertex_offset = base_vertex_index * m_stream_source_stride;
		const UINT requested_vertex_bytes = uploaded_vertex_count * m_stream_source_stride;
		const UINT vertex_bytes = checked_range_size(stream->length(), vertex_offset, requested_vertex_bytes);
		const UINT index_size = indices->index_size();
		const UINT index_offset = first_index * index_size;
		const UINT requested_index_bytes = index_count * index_size;
		const UINT index_bytes = checked_range_size(indices->length(), index_offset, requested_index_bytes);
		WASM_D3D8_NOTE_SORTED_DRAW_STEP(profile_sorted_draw_submit,"WasmD3D8.drawBound.capture.before");
		capture_draw_transform(D3DTS_WORLD, DRAW_TRANSFORM_WORLD, g_state.last_draw_world_transform);
		capture_draw_transform(D3DTS_VIEW, DRAW_TRANSFORM_VIEW, g_state.last_draw_view_transform);
		capture_draw_transform(D3DTS_PROJECTION, DRAW_TRANSFORM_PROJECTION, g_state.last_draw_projection_transform);
		capture_or_apply_draw_derived_payload();
		WASM_D3D8_NOTE_SORTED_DRAW_STEP(profile_sorted_draw_submit,"WasmD3D8.drawBound.hash.before");

		UINT transform_hash = FNV1A_OFFSET_BASIS;
		hash_matrix(transform_hash, g_state.last_draw_world_transform);
		hash_matrix(transform_hash, g_state.last_draw_view_transform);
		hash_matrix(transform_hash, g_state.last_draw_projection_transform);
		const UINT derived_state_hash =
			fnv1a_step(m_cached_draw_derived_payload.payload_hash, g_state.last_draw_transform_mask);
		const UINT state_hash = fnv1a_step(
			fnv1a_step(transform_hash, m_cached_draw_derived_payload.payload_hash),
			g_state.last_draw_transform_mask);
		g_state.last_draw_state_hash = state_hash;
		WASM_D3D8_NOTE_SORTED_DRAW_STEP(profile_sorted_draw_submit,"WasmD3D8.drawBound.hash.after");
		const WasmD3D8DrawTextureStageState &stage0 =
			g_state.last_draw_render_state.texture_stages[0];
		if (g_state.last_draw_render_state.z_func == D3DCMP_EQUAL &&
				stage0.values[D3DTSS_TEXCOORDINDEX] == D3DTSS_TCI_CAMERASPACEPOSITION &&
				stage0.values[D3DTSS_TEXTURETRANSFORMFLAGS] == D3DTTFF_COUNT2) {
			++g_state.draw_indexed_depth_equal_camera_space_tex0_count2_calls;
			g_state.last_draw_indexed_depth_equal_camera_space_tex0_count2_sequence =
				g_state.draw_indexed_primitive_calls;
		}

		if (vertex_bytes == 0 || index_bytes == 0) {
			WASM_D3D8_NOTE_SORTED_DRAW_STEP(profile_sorted_draw_submit,"WasmD3D8.drawBound.complete");
			return;
		}

		WASM_D3D8_NOTE_SORTED_DRAW_STEP(profile_sorted_draw_submit,"WasmD3D8.drawBound.bridge.before");
		browser_draw_indexed(
			primitive_type,
			base_vertex_index,
			min_vertex_index,
			first_index,
			stream->browser_buffer_id(),
			vertex_offset,
			vertex_bytes,
			uploaded_vertex_count,
			m_stream_source_stride,
			m_vertex_shader,
			indices->browser_buffer_id(),
			index_offset,
			index_bytes,
			index_count,
			index_size,
			g_state.last_draw_transform_mask,
			&g_state.last_draw_world_transform,
			&g_state.last_draw_view_transform,
			&g_state.last_draw_projection_transform,
			&g_state.last_draw_texture0_transform,
			&g_state.last_draw_texture1_transform,
			&g_state.last_draw_render_state,
			&g_state.last_draw_clip_planes[0][0],
			g_state.last_draw_lights,
			&g_state.last_draw_material,
			g_state.last_draw_state_hash,
			derived_state_hash);
		WASM_D3D8_NOTE_SORTED_DRAW_STEP(profile_sorted_draw_submit,"WasmD3D8.drawBound.bridge.after");
		WASM_D3D8_NOTE_SORTED_DRAW_STEP(profile_sorted_draw_submit,"WasmD3D8.drawBound.complete");
	}

	void capture_draw_transform(D3DTRANSFORMSTATETYPE state, UINT mask_bit, D3DMATRIX &destination) const
	{
		const auto found = m_transforms.find(state);
		if (found != m_transforms.end()) {
			destination = found->second;
			g_state.last_draw_transform_mask |= mask_bit;
		} else {
			identity_matrix(destination);
		}
	}

	void capture_draw_texture_transform(D3DTRANSFORMSTATETYPE state, UINT mask_bit, D3DMATRIX &destination) const
	{
		const auto found = m_transforms.find(state);
		if (found != m_transforms.end()) {
			destination = found->second;
			g_state.last_draw_texture_transform_mask |= mask_bit;
		} else {
			identity_matrix(destination);
		}
	}

	struct CachedDrawDerivedPayload
	{
		bool valid = false;
		UINT revision = 0;
		UINT payload_hash = 0;
		UINT texture_transform_mask = 0;
		D3DMATRIX texture0_transform = {};
		D3DMATRIX texture1_transform = {};
		WasmD3D8DrawRenderState render_state = {};
		float clip_planes[WASM_D3D8_CLIP_PLANE_COUNT][4] = {};
		WasmD3D8DrawMaterial material = {};
		WasmD3D8DrawLight lights[WASM_D3D8_LIGHT_COUNT] = {};
	};

	static constexpr UINT FNV1A_OFFSET_BASIS = 0x811c9dc5u;
	static constexpr UINT FNV1A_PRIME = 0x01000193u;

	template <typename T>
	static bool memory_equal(const T &left, const T &right)
	{
		return std::memcmp(&left, &right, sizeof(T)) == 0;
	}

	static bool is_cached_draw_texture_transform(D3DTRANSFORMSTATETYPE state)
	{
		return state == D3DTS_TEXTURE0 || state == D3DTS_TEXTURE1;
	}

	static UINT hash_float(float value)
	{
		union FloatUInt { float f; UINT u; };
		FloatUInt bits = {};
		bits.f = value;
		return bits.u;
	}

	static UINT fnv1a_step(UINT hash, UINT value)
	{
		return (hash ^ value) * FNV1A_PRIME;
	}

	static void hash_matrix(UINT &hash, const D3DMATRIX &matrix)
	{
		for (UINT row = 0; row < 4; ++row) {
			for (UINT column = 0; column < 4; ++column) {
				hash = fnv1a_step(hash, hash_float(matrix.m[row][column]));
			}
		}
	}

	static void hash_draw_derived_payload(
		UINT &hash,
		const D3DMATRIX &texture0_transform,
		const D3DMATRIX &texture1_transform,
		const WasmD3D8DrawRenderState &render_state,
		const float clip_planes[WASM_D3D8_CLIP_PLANE_COUNT][4],
		const WasmD3D8DrawMaterial &material,
		const WasmD3D8DrawLight lights[WASM_D3D8_LIGHT_COUNT])
	{
		hash_matrix(hash, texture0_transform);
		hash_matrix(hash, texture1_transform);
		#define HASH_RS_FIELD(field) hash = fnv1a_step(hash, static_cast<UINT>(render_state.field));
		HASH_RS_FIELD(cull_mode); HASH_RS_FIELD(z_enable); HASH_RS_FIELD(z_write_enable);
		HASH_RS_FIELD(z_func); HASH_RS_FIELD(alpha_blend_enable); HASH_RS_FIELD(src_blend);
		HASH_RS_FIELD(dest_blend); HASH_RS_FIELD(blend_op); HASH_RS_FIELD(alpha_test_enable);
		HASH_RS_FIELD(alpha_func); HASH_RS_FIELD(alpha_ref); HASH_RS_FIELD(color_write_enable);
		HASH_RS_FIELD(texture_factor); HASH_RS_FIELD(stencil_enable); HASH_RS_FIELD(stencil_fail);
		HASH_RS_FIELD(stencil_z_fail); HASH_RS_FIELD(stencil_pass); HASH_RS_FIELD(stencil_func);
		HASH_RS_FIELD(stencil_ref); HASH_RS_FIELD(stencil_mask); HASH_RS_FIELD(stencil_write_mask);
		HASH_RS_FIELD(fog_enable); HASH_RS_FIELD(fog_color); HASH_RS_FIELD(fog_start);
		HASH_RS_FIELD(fog_end); HASH_RS_FIELD(fog_vertex_mode); HASH_RS_FIELD(range_fog_enable);
		HASH_RS_FIELD(fill_mode); HASH_RS_FIELD(z_bias); HASH_RS_FIELD(shade_mode);
		HASH_RS_FIELD(lighting); HASH_RS_FIELD(ambient); HASH_RS_FIELD(color_vertex);
		HASH_RS_FIELD(diffuse_material_source); HASH_RS_FIELD(specular_material_source);
		HASH_RS_FIELD(ambient_material_source); HASH_RS_FIELD(emissive_material_source);
		HASH_RS_FIELD(clipping); HASH_RS_FIELD(clip_plane_enable); HASH_RS_FIELD(specular_enable);
		HASH_RS_FIELD(normalize_normals); HASH_RS_FIELD(local_viewer);
		HASH_RS_FIELD(point_size); HASH_RS_FIELD(point_size_min); HASH_RS_FIELD(point_size_max);
		HASH_RS_FIELD(point_sprite_enable); HASH_RS_FIELD(point_scale_enable);
		HASH_RS_FIELD(point_scale_a); HASH_RS_FIELD(point_scale_b); HASH_RS_FIELD(point_scale_c);
		#undef HASH_RS_FIELD
		for (UINT stage = 0; stage < WASM_D3D8_TEXTURE_STAGE_COUNT; ++stage) {
			for (UINT slot = 0; slot < WASM_D3D8_TEXTURE_STAGE_STATE_SLOTS; ++slot) {
				hash = fnv1a_step(hash, static_cast<UINT>(render_state.texture_stages[stage].values[slot]));
			}
		}
		for (UINT plane = 0; plane < WASM_D3D8_CLIP_PLANE_COUNT; ++plane) {
			for (UINT component = 0; component < 4; ++component) {
				hash = fnv1a_step(hash, hash_float(clip_planes[plane][component]));
			}
		}
		#define HASH_COLOR(color) \
			do { \
				hash = fnv1a_step(hash, hash_float(color.r)); \
				hash = fnv1a_step(hash, hash_float(color.g)); \
				hash = fnv1a_step(hash, hash_float(color.b)); \
				hash = fnv1a_step(hash, hash_float(color.a)); \
			} while (0)
		HASH_COLOR(material.diffuse);
		HASH_COLOR(material.ambient);
		HASH_COLOR(material.specular);
		HASH_COLOR(material.emissive);
		hash = fnv1a_step(hash, hash_float(material.power));
		for (UINT index = 0; index < WASM_D3D8_LIGHT_COUNT; ++index) {
			const WasmD3D8DrawLight &light = lights[index];
			hash = fnv1a_step(hash, static_cast<UINT>(light.type));
			hash = fnv1a_step(hash, static_cast<UINT>(light.enabled));
			HASH_COLOR(light.diffuse);
			HASH_COLOR(light.specular);
			HASH_COLOR(light.ambient);
			hash = fnv1a_step(hash, hash_float(light.position.x));
			hash = fnv1a_step(hash, hash_float(light.position.y));
			hash = fnv1a_step(hash, hash_float(light.position.z));
			hash = fnv1a_step(hash, hash_float(light.direction.x));
			hash = fnv1a_step(hash, hash_float(light.direction.y));
			hash = fnv1a_step(hash, hash_float(light.direction.z));
			hash = fnv1a_step(hash, hash_float(light.range));
			hash = fnv1a_step(hash, hash_float(light.falloff));
			hash = fnv1a_step(hash, hash_float(light.attenuation0));
			hash = fnv1a_step(hash, hash_float(light.attenuation1));
			hash = fnv1a_step(hash, hash_float(light.attenuation2));
			hash = fnv1a_step(hash, hash_float(light.theta));
			hash = fnv1a_step(hash, hash_float(light.phi));
		}
		#undef HASH_COLOR
	}

	void invalidate_draw_derived_payload()
	{
		++m_draw_derived_payload_revision;
		if (m_draw_derived_payload_revision == 0) {
			m_draw_derived_payload_revision = 1;
			m_cached_draw_derived_payload.valid = false;
		}
	}

	void capture_or_apply_draw_derived_payload()
	{
		if (m_cached_draw_derived_payload.valid &&
				m_cached_draw_derived_payload.revision == m_draw_derived_payload_revision) {
			g_state.last_draw_texture_transform_mask = m_cached_draw_derived_payload.texture_transform_mask;
			g_state.last_draw_texture0_transform = m_cached_draw_derived_payload.texture0_transform;
			g_state.last_draw_texture1_transform = m_cached_draw_derived_payload.texture1_transform;
			g_state.last_draw_render_state = m_cached_draw_derived_payload.render_state;
			std::memcpy(g_state.last_draw_clip_planes, m_cached_draw_derived_payload.clip_planes,
				sizeof(g_state.last_draw_clip_planes));
			g_state.last_draw_material = m_cached_draw_derived_payload.material;
			std::memcpy(g_state.last_draw_lights, m_cached_draw_derived_payload.lights,
				sizeof(g_state.last_draw_lights));
			++g_state.draw_derived_state_cache_hits;
			return;
		}

		g_state.last_draw_texture_transform_mask = 0;
		capture_draw_texture_transform(D3DTS_TEXTURE0, DRAW_TEXTURE_TRANSFORM_STAGE0,
			g_state.last_draw_texture0_transform);
		capture_draw_texture_transform(D3DTS_TEXTURE1, DRAW_TEXTURE_TRANSFORM_STAGE1,
			g_state.last_draw_texture1_transform);
		capture_draw_render_state();
		capture_draw_material();

		m_cached_draw_derived_payload.valid = true;
		m_cached_draw_derived_payload.revision = m_draw_derived_payload_revision;
		m_cached_draw_derived_payload.texture_transform_mask = g_state.last_draw_texture_transform_mask;
		m_cached_draw_derived_payload.texture0_transform = g_state.last_draw_texture0_transform;
		m_cached_draw_derived_payload.texture1_transform = g_state.last_draw_texture1_transform;
		m_cached_draw_derived_payload.render_state = g_state.last_draw_render_state;
		std::memcpy(m_cached_draw_derived_payload.clip_planes, g_state.last_draw_clip_planes,
			sizeof(m_cached_draw_derived_payload.clip_planes));
		m_cached_draw_derived_payload.material = g_state.last_draw_material;
		std::memcpy(m_cached_draw_derived_payload.lights, g_state.last_draw_lights,
			sizeof(m_cached_draw_derived_payload.lights));
		UINT payload_hash = FNV1A_OFFSET_BASIS;
		hash_draw_derived_payload(
			payload_hash,
			m_cached_draw_derived_payload.texture0_transform,
			m_cached_draw_derived_payload.texture1_transform,
			m_cached_draw_derived_payload.render_state,
			m_cached_draw_derived_payload.clip_planes,
			m_cached_draw_derived_payload.material,
			m_cached_draw_derived_payload.lights);
		m_cached_draw_derived_payload.payload_hash = payload_hash;
		++g_state.draw_derived_state_cache_misses;
	}

	HRESULT create_surface(UINT width, UINT height, D3DFORMAT format, DWORD usage, IDirect3DSurface8 **surface)
	{
		if (surface == nullptr) {
			return E_FAIL;
		}
		*surface = new (std::nothrow) BrowserD3DSurface(this, width, height, format, usage);
		return *surface != nullptr ? S_OK : D3DERR_OUTOFVIDEOMEMORY;
	}

	ULONG m_ref_count = 1;
	D3DPRESENT_PARAMETERS m_parameters = {};
	D3DVIEWPORT8 m_viewport = {};
	std::map<D3DTRANSFORMSTATETYPE, D3DMATRIX> m_transforms;
	std::map<D3DRENDERSTATETYPE, DWORD> m_render_states;
	std::map<DWORD, std::map<D3DTEXTURESTAGESTATETYPE, DWORD>> m_texture_stage_states;
	std::map<DWORD, UINT> m_bound_texture_ids;
	std::map<DWORD, IDirect3DBaseTexture8 *> m_bound_textures;
	float m_clip_planes[WASM_D3D8_CLIP_PLANE_COUNT][4] = {};
	D3DLIGHT8 m_lights[WASM_D3D8_LIGHT_COUNT] = {};
	BOOL m_light_enabled[WASM_D3D8_LIGHT_COUNT] = {};
	D3DMATERIAL8 m_material = default_d3d8_material();
	IDirect3DSurface8 *m_back_buffer = nullptr;
	IDirect3DSurface8 *m_depth_stencil = nullptr;
	IDirect3DSurface8 *m_default_render_target = nullptr;
	UINT m_current_fbo_color_texture_id = 0; // 0 = backbuffer
	UINT m_current_fbo_depth_texture_id = 0; // 0 = default depth buffer
	IDirect3DVertexBuffer8 *m_stream_source = nullptr;
	IDirect3DIndexBuffer8 *m_indices = nullptr;
	D3DGAMMARAMP m_gamma_ramp = {};
	bool m_has_gamma_ramp = false;
	UINT m_stream_source_stride = 0;
	UINT m_indices_base_vertex_index = 0;
	BrowserD3DVertexBuffer *m_user_pointer_vertex_buffer = nullptr;
	BrowserD3DIndexBuffer *m_user_pointer_index_buffer = nullptr;
	UINT m_user_pointer_vertex_buffer_capacity = 0;
	UINT m_user_pointer_index_buffer_capacity = 0;
	D3DFORMAT m_user_pointer_index_buffer_format = D3DFMT_INDEX16;
	std::vector<BYTE> m_user_pointer_index_bytes;
	DWORD m_vertex_shader = 0;
	UINT m_draw_derived_payload_revision = 1;
	CachedDrawDerivedPayload m_cached_draw_derived_payload;
};

class BrowserD3D8 final : public IDirect3D8
{
public:
	explicit BrowserD3D8(UINT) {}

	HRESULT RegisterSoftwareDevice(void *) override { return D3DERR_NOTAVAILABLE; }
	UINT GetAdapterCount() override { return 1; }

	HRESULT GetAdapterIdentifier(UINT adapter, DWORD, D3DADAPTER_IDENTIFIER8 *identifier) override
	{
		if (adapter != D3DADAPTER_DEFAULT || identifier == nullptr) {
			return E_FAIL;
		}
		std::memset(identifier, 0, sizeof(*identifier));
		std::strncpy(identifier->Driver, "3dfxvgl", sizeof(identifier->Driver) - 1);
		std::strncpy(identifier->Description, "Browser Direct3D8 fixed-function shim",
			sizeof(identifier->Description) - 1);
		std::strncpy(identifier->DeviceName, "webgl2", sizeof(identifier->DeviceName) - 1);
		identifier->VendorId = 0x121a;
		identifier->DeviceId = 0x0009;
		return S_OK;
	}

	UINT GetAdapterModeCount(UINT adapter) override { return adapter == D3DADAPTER_DEFAULT ? 1 : 0; }

	HRESULT EnumAdapterModes(UINT adapter, UINT mode, D3DDISPLAYMODE *display_mode) override
	{
		if (adapter != D3DADAPTER_DEFAULT || mode != 0 || display_mode == nullptr) {
			return E_FAIL;
		}
		fill_display_mode(*display_mode);
		return S_OK;
	}

	HRESULT GetAdapterDisplayMode(UINT adapter, D3DDISPLAYMODE *display_mode) override
	{
		if (adapter != D3DADAPTER_DEFAULT || display_mode == nullptr) {
			return E_FAIL;
		}
		fill_display_mode(*display_mode);
		return S_OK;
	}

	HRESULT CheckDeviceType(UINT adapter, DWORD, D3DFORMAT, D3DFORMAT, BOOL) override
	{
		return adapter == D3DADAPTER_DEFAULT ? S_OK : D3DERR_NOTAVAILABLE;
	}

	HRESULT CheckDeviceFormat(UINT adapter, DWORD, D3DFORMAT, DWORD usage, D3DRESOURCETYPE resource_type,
		D3DFORMAT check_format) override
	{
		if (adapter != D3DADAPTER_DEFAULT) {
			return D3DERR_NOTAVAILABLE;
		}
		if ((usage & D3DUSAGE_DEPTHSTENCIL) != 0) {
			return (resource_type == D3DRTYPE_SURFACE || resource_type == D3DRTYPE_TEXTURE) &&
				is_browser_depth_stencil_format_supported(check_format) ? S_OK : D3DERR_NOTAVAILABLE;
		}
		if ((usage & D3DUSAGE_RENDERTARGET) != 0) {
			return (resource_type == D3DRTYPE_SURFACE || resource_type == D3DRTYPE_TEXTURE) &&
				is_browser_render_target_format_supported(check_format) ? S_OK : D3DERR_NOTAVAILABLE;
		}
		if (resource_type == D3DRTYPE_TEXTURE || resource_type == D3DRTYPE_VOLUMETEXTURE ||
			resource_type == D3DRTYPE_SURFACE) {
			return is_browser_texture_format_supported(check_format) ? S_OK : D3DERR_NOTAVAILABLE;
		}
		return D3DERR_NOTAVAILABLE;
	}

	HRESULT CheckDepthStencilMatch(UINT adapter, DWORD, D3DFORMAT, D3DFORMAT, D3DFORMAT) override
	{
		return adapter == D3DADAPTER_DEFAULT ? S_OK : D3DERR_NOTAVAILABLE;
	}

	HRESULT GetDeviceCaps(UINT adapter, DWORD, D3DCAPS8 *caps) override
	{
		if (adapter != D3DADAPTER_DEFAULT || caps == nullptr) {
			return E_FAIL;
		}
		fill_caps(*caps);
		return S_OK;
	}

	HRESULT CreateDevice(UINT adapter, DWORD, HWND, DWORD, D3DPRESENT_PARAMETERS *presentation_parameters,
		IDirect3DDevice8 **device) override
	{
		if (adapter != D3DADAPTER_DEFAULT || presentation_parameters == nullptr || device == nullptr) {
			return E_FAIL;
		}
		*device = new (std::nothrow) BrowserD3DDevice(*presentation_parameters);
		if (*device == nullptr) {
			return D3DERR_OUTOFVIDEOMEMORY;
		}
		++g_state.create_device_calls;
		return S_OK;
	}

	ULONG AddRef() override { return ++m_ref_count; }

	ULONG Release() override
	{
		const ULONG ref_count = --m_ref_count;
		if (ref_count == 0) {
			delete this;
		}
		return ref_count;
	}

private:
	ULONG m_ref_count = 1;
};

} // namespace

extern "C" void wasm_d3d8_reset_state()
{
	std::memset(&g_state, 0, sizeof(g_state));
}

extern "C" const WasmD3D8ShimState *wasm_d3d8_get_state()
{
	return &g_state;
}

extern "C" EMSCRIPTEN_KEEPALIVE void cnc_port_d3d8_set_bound_draw_diagnostics(int enabled)
{
	g_bound_draw_diagnostics_enabled = enabled != 0;
}

extern "C" HMODULE wasm_d3d8_load_library_a(LPCSTR library_name)
{
	++g_state.load_library_calls;
	if (ascii_iequals(library_name, "D3D8.DLL") || ascii_iequals(library_name, "D3D8")) {
		return d3d8_module_handle();
	}
	return nullptr;
}

extern "C" BOOL wasm_d3d8_free_library(HMODULE module)
{
	++g_state.free_library_calls;
	return module == nullptr || module == d3d8_module_handle() ? TRUE : FALSE;
}

extern "C" FARPROC wasm_d3d8_get_proc_address(HMODULE module, LPCSTR procedure_name)
{
	++g_state.get_proc_address_calls;
	if (module == d3d8_module_handle() && procedure_name != nullptr &&
		std::strcmp(procedure_name, "Direct3DCreate8") == 0) {
		return reinterpret_cast<FARPROC>(&Direct3DCreate8);
	}
	return nullptr;
}

IDirect3D8 *Direct3DCreate8(UINT sdk_version)
{
	++g_state.direct3d_create_calls;
	if (sdk_version != D3D_SDK_VERSION) {
		return nullptr;
	}
	return new (std::nothrow) BrowserD3D8(sdk_version);
}

HRESULT D3DXLoadSurfaceFromSurface(
	IDirect3DSurface8 *destination_surface,
	const void *,
	const RECT *destination_rect,
	IDirect3DSurface8 *source_surface,
	const void *,
	const RECT *source_rect,
	DWORD,
	D3DCOLOR)
{
	if (destination_surface == nullptr || source_surface == nullptr) {
		return E_FAIL;
	}

	BrowserD3DSurface *source = static_cast<BrowserD3DSurface *>(source_surface);
	BrowserD3DSurface *destination = static_cast<BrowserD3DSurface *>(destination_surface);
	D3DSURFACE_DESC source_desc = {};
	D3DSURFACE_DESC destination_desc = {};
	if (FAILED(source->GetDesc(&source_desc)) ||
		FAILED(destination->GetDesc(&destination_desc)) ||
		source_desc.Format != destination_desc.Format) {
		return E_FAIL;
	}

	RECT effective_source_rect = {};
	if (source_rect != nullptr) {
		effective_source_rect = *source_rect;
	} else {
		effective_source_rect.right = static_cast<LONG>(source_desc.Width);
		effective_source_rect.bottom = static_cast<LONG>(source_desc.Height);
	}

	RECT effective_destination_rect = {};
	if (destination_rect != nullptr) {
		effective_destination_rect = *destination_rect;
	} else {
		effective_destination_rect.right = static_cast<LONG>(destination_desc.Width);
		effective_destination_rect.bottom = static_cast<LONG>(destination_desc.Height);
	}

	if (!destination->copy_scaled_rect_from(*source, effective_source_rect, effective_destination_rect)) {
		return E_FAIL;
	}
	destination->upload_owned_texture();

	++g_state.copy_rects_calls;
	g_state.last_copy_rects_rect_count = 1;
	g_state.last_copy_rects_width =
		static_cast<UINT>(effective_source_rect.right - effective_source_rect.left);
	g_state.last_copy_rects_height =
		static_cast<UINT>(effective_source_rect.bottom - effective_source_rect.top);
	g_state.last_copy_rects_format = source_desc.Format;
	g_state.last_copy_rects_uploaded_texture_id = destination->texture_owner_id();

	return S_OK;
}

HRESULT D3DXCreateTexture(
	IDirect3DDevice8 *device,
	UINT width,
	UINT height,
	UINT levels,
	DWORD usage,
	D3DFORMAT format,
	D3DPOOL pool,
	IDirect3DTexture8 **texture)
{
	if (texture == nullptr) {
		return E_FAIL;
	}
	*texture = nullptr;
	if (device == nullptr) {
		return E_FAIL;
	}
	return device->CreateTexture(width, height, levels, usage, format, pool, texture);
}

HRESULT D3DXCreateTextureFromFileExA(
	IDirect3DDevice8 *,
	LPCSTR,
	UINT,
	UINT,
	UINT,
	DWORD,
	D3DFORMAT,
	D3DPOOL,
	DWORD,
	DWORD,
	D3DCOLOR,
	void *,
	void *,
	IDirect3DTexture8 **texture)
{
	if (texture == nullptr) {
		return E_FAIL;
	}
	*texture = nullptr;
	return D3DERR_NOTAVAILABLE;
}

HRESULT D3DXFilterTexture(IDirect3DBaseTexture8 *texture, const void *, UINT source_level, DWORD)
{
	if (texture == nullptr) {
		return E_FAIL;
	}
	if (texture->GetType() != D3DRTYPE_TEXTURE) {
		return D3DERR_NOTAVAILABLE;
	}
	BrowserD3DTexture *browser_texture =
		static_cast<BrowserD3DTexture *>(static_cast<IDirect3DTexture8 *>(texture));
	return browser_texture->generate_mip_chain(source_level);
}

HRESULT D3DXCreateCubeTexture(
	IDirect3DDevice8 *device,
	UINT edge_length,
	UINT levels,
	DWORD usage,
	D3DFORMAT format,
	D3DPOOL pool,
	IDirect3DCubeTexture8 **texture)
{
	if (texture == nullptr) {
		return E_FAIL;
	}
	*texture = nullptr;
	if (device == nullptr) {
		return E_FAIL;
	}
	return device->CreateCubeTexture(edge_length, levels, usage, format, pool, texture);
}

HRESULT D3DXCreateVolumeTexture(
	IDirect3DDevice8 *device,
	UINT width,
	UINT height,
	UINT depth,
	UINT levels,
	DWORD usage,
	D3DFORMAT format,
	D3DPOOL pool,
	IDirect3DVolumeTexture8 **texture)
{
	if (texture == nullptr) {
		return E_FAIL;
	}
	*texture = nullptr;
	if (device == nullptr) {
		return E_FAIL;
	}
	return device->CreateVolumeTexture(width, height, depth, levels, usage, format, pool, texture);
}

HRESULT D3DXAssembleShaderFromFile(
	LPCSTR,
	const void *,
	LPD3DXBUFFER *,
	LPD3DXBUFFER *shader_code,
	LPD3DXBUFFER *errors)
{
	if (shader_code != nullptr) {
		*shader_code = nullptr;
	}
	if (errors != nullptr) {
		*errors = nullptr;
	}
	return D3DERR_NOTAVAILABLE;
}

HRESULT D3DXAssembleShader(
	const void *,
	UINT,
	DWORD,
	LPD3DXBUFFER *,
	LPD3DXBUFFER *shader_code,
	LPD3DXBUFFER *errors)
{
	if (shader_code != nullptr) {
		*shader_code = nullptr;
	}
	if (errors != nullptr) {
		*errors = nullptr;
	}
	return D3DERR_NOTAVAILABLE;
}
