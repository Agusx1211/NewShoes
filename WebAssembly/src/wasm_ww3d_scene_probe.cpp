#include <cstdio>
#include <string>

#ifndef __PRERTS_H__
#define __PRERTS_H__
#endif

#include "windows.h"
#include "mmsystem.h"
#include "wwvegas_port.h"
#include "Common/Thing.h"
#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "GameClient/Drawable.h"
#include "GameLogic/Object.h"
#include "WW3D2/boxrobj.h"
#include "WW3D2/camera.h"
#include "WW3D2/coltype.h"
#include "WW3D2/rinfo.h"
#include "WW3D2/ww3d.h"
#include "WWMath/Matrix3D.h"
#include "W3DDevice/GameClient/W3DShadow.h"
#include "W3DDevice/GameClient/W3DScene.h"
#include "W3DDevice/GameClient/W3DShroud.h"
#include "W3DDevice/GameClient/W3DTreeBuffer.h"
#include "wasm_d3d8_shim.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

class ParticleSystemManager
{
public:
	void queueParticleRender();
};

namespace {

std::string g_ww3d_rts_scene_probe_json;

unsigned int g_scene_probe_tree_flushes = 0;
unsigned int g_scene_probe_shadow_flushes = 0;
unsigned int g_scene_probe_particle_flushes = 0;
alignas(W3DShadowManager) unsigned char g_probe_shadow_manager_storage[sizeof(W3DShadowManager)] = {};

bool succeeded(int result)
{
	return result == WW3D_ERROR_OK;
}

const char *bool_json(bool value)
{
	return value ? "true" : "false";
}

void reset_scene_probe_flush_counters()
{
	g_scene_probe_tree_flushes = 0;
	g_scene_probe_shadow_flushes = 0;
	g_scene_probe_particle_flushes = 0;
}

void configure_global_data_for_scene_probe(GlobalData &global_data)
{
	global_data.m_maxVisibleTranslucentObjects = 64;
	global_data.m_maxVisibleOccluderObjects = 64;
	global_data.m_maxVisibleOccludeeObjects = 64;
	global_data.m_maxVisibleNonOccluderOrOccludeeObjects = 64;
	global_data.m_defaultOcclusionDelay = 0;
	global_data.m_enableBehindBuildingMarkers = FALSE;
	global_data.m_clearAlpha = 255;
	global_data.m_fogAlpha = 127;
	global_data.m_timeOfDay = TIME_OF_DAY_AFTERNOON;
	for (Int i = 0; i < TIME_OF_DAY_COUNT; ++i) {
		global_data.m_infantryLightScale[i] = 1.0f;
	}
	global_data.m_scriptOverrideInfantryLightScale = -1.0f;
}

} // namespace

void __attribute__((weak)) DoTrees(RenderInfoClass &)
{
	++g_scene_probe_tree_flushes;
}

void __attribute__((weak)) DoShadows(RenderInfoClass &, Bool)
{
	++g_scene_probe_shadow_flushes;
}

void __attribute__((weak)) DoParticles(RenderInfoClass &)
{
	++g_scene_probe_particle_flushes;
}

ParticleSystemManager *TheParticleSystemManager __attribute__((weak)) = nullptr;
W3DShadowManager *TheW3DShadowManager __attribute__((weak)) = nullptr;
GlobalData *TheWritableGlobalData __attribute__((weak)) = nullptr;

// Probe-only weak definitions for cold drawable/object/tree branches linked by
// RTS3DScene::renderOneObject and BaseHeightMap::DoTrees. The AABox path below
// does not enter those gameplay branches; real linked implementations win.
void __attribute__((weak)) W3DTreeBuffer::drawTrees(CameraClass *, RefRenderObjListIterator *)
{
}

void __attribute__((weak)) Drawable::friend_lockDirtyStuffForIteration()
{
}

void __attribute__((weak)) Drawable::friend_unlockDirtyStuffForIteration()
{
}

const Vector3 *__attribute__((weak)) Drawable::getTintColor(void) const
{
	return nullptr;
}

const Vector3 *__attribute__((weak)) Drawable::getSelectionColor(void) const
{
	return nullptr;
}

Bool __attribute__((weak)) Thing::isKindOf(KindOfType) const
{
	return FALSE;
}

Player *__attribute__((weak)) Object::getControllingPlayer() const
{
	return nullptr;
}

void __attribute__((weak)) ParticleSystemManager::queueParticleRender()
{
}

void __attribute__((weak)) W3DShroudMaterialPassClass::Install_Materials(void) const
{
}

void __attribute__((weak)) W3DShroudMaterialPassClass::UnInstall_Materials(void) const
{
}

void __attribute__((weak)) W3DMaskMaterialPassClass::Install_Materials(void) const
{
}

void __attribute__((weak)) W3DMaskMaterialPassClass::UnInstall_Materials(void) const
{
}

extern "C" {

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_rts_scene()
{
	initMemoryManager();
	wasm_d3d8_reset_state();
	reset_scene_probe_flush_counters();

	GlobalData global_data;
	configure_global_data_for_scene_probe(global_data);
	GlobalData *old_global_data = TheWritableGlobalData;
	TheWritableGlobalData = &global_data;
	ParticleSystemManager *old_particle_system_manager = TheParticleSystemManager;
	W3DShadowManager *old_shadow_manager = TheW3DShadowManager;
	TheParticleSystemManager = nullptr;
	TheW3DShadowManager = reinterpret_cast<W3DShadowManager *>(g_probe_shadow_manager_storage);

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool scene_created = false;
	bool camera_created = false;
	bool render_object_created = false;
	bool object_added = false;
	bool object_visible_after_render = false;

	RTS3DScene *scene = nullptr;
	CameraClass *camera = nullptr;
	AABoxRenderObjClass *box = nullptr;

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);
		BoxRenderObjClass::Set_Box_Display_Mask(COLL_TYPE_ALL);

		scene = NEW_REF(RTS3DScene, ());
		camera = W3DNEW CameraClass();
		box = NEW_REF(AABoxRenderObjClass, ());
		scene_created = scene != nullptr;
		camera_created = camera != nullptr;
		render_object_created = box != nullptr;
	}

	if (scene_created && camera_created && render_object_created) {
		box->Set_Position(Vector3(0.0f, 0.0f, 0.0f));
		box->Set_Local_Center_Extent(Vector3(0.0f, 0.0f, 0.0f), Vector3(2.0f, 2.0f, 2.0f));
		box->Set_Color(Vector3(0.1f, 0.85f, 0.3f));
		box->Set_Opacity(1.0f);
		box->Set_Force_Visible(true);

		scene->Add_Render_Object(box);
		object_added = box->Peek_Scene() == scene;
	}

	if (object_added) {
		Matrix3D camera_transform(true);
		camera_transform.Look_At(Vector3(0.0f, -8.0f, 4.0f), Vector3(0.0f, 0.0f, 0.0f), 0.0f);
		camera->Set_Transform(camera_transform);
		camera->Set_Aspect_Ratio(800.0f / 600.0f);
		camera->Set_Clip_Planes(1.0f, 1000.0f);

		begin_render_result = WW3D::Begin_Render(true, true, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			render_result = WW3D::Render(scene, camera);
			object_visible_after_render = box->Is_Really_Visible();
			end_render_result = WW3D::End_Render(false);
		}
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		scene_created &&
		camera_created &&
		render_object_created &&
		object_added &&
		object_visible_after_render &&
		succeeded(begin_render_result) &&
		succeeded(render_result) &&
		succeeded(end_render_result) &&
		g_scene_probe_shadow_flushes >= 2 &&
		g_scene_probe_particle_flushes >= 1 &&
		state->create_device_calls >= 1 &&
		state->create_vertex_buffer_calls >= 1 &&
		state->create_index_buffer_calls >= 1 &&
		state->set_stream_source_calls >= 1 &&
		state->set_indices_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_transform_calls >= 3 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == 8 &&
		state->last_draw_primitive_count == 12 &&
		state->last_draw_index_format == D3DFMT_INDEX16 &&
		(state->last_draw_transform_mask & 7u) == 7u;

	char buffer[3600];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_rts_scene_probe\","
		"\"ok\":%s,"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,\"beginRender\":%d,"
		"\"render\":%d,\"endRender\":%d,\"sceneCreated\":%s,"
		"\"cameraCreated\":%s,\"renderObjectCreated\":%s,\"objectAdded\":%s,"
		"\"objectVisibleAfterRender\":%s},"
		"\"scene\":{\"type\":\"RTS3DScene\",\"path\":\"WW3D::Render(scene,camera)\","
		"\"treeFlushes\":%u,\"shadowFlushes\":%u,\"particleFlushes\":%u},"
		"\"calls\":{\"createDevice\":%u,\"createIndexBuffer\":%u,"
		"\"createVertexBuffer\":%u,\"setStreamSource\":%u,\"setIndices\":%u,"
		"\"drawIndexed\":%u,\"setTransform\":%u,\"lastTransformState\":%d,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,"
		"\"browserBufferRelease\":%u,\"clear\":%u,\"present\":%u},"
		"\"draw\":{\"primitiveType\":%d,\"startVertex\":%u,\"minVertexIndex\":%u,"
		"\"vertexCount\":%u,\"primitiveCount\":%u,\"vertexStride\":%u,"
		"\"vertexBufferId\":%u,\"vertexOffset\":%u,\"vertexBytes\":%u,"
		"\"indexBufferId\":%u,\"indexOffset\":%u,\"indexBytes\":%u,"
		"\"indexFormat\":%d,\"transformMask\":%u,"
		"\"renderState\":{\"cullMode\":%lu,\"zEnable\":%lu,"
		"\"zWriteEnable\":%lu,\"zFunc\":%lu,\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"blendOp\":%lu,"
		"\"alphaTestEnable\":%lu,\"alphaFunc\":%lu,\"alphaRef\":%lu,"
		"\"colorWriteEnable\":%lu}}}",
		bool_json(ok),
		init_result,
		set_device_result,
		begin_render_result,
		render_result,
		end_render_result,
		bool_json(scene_created),
		bool_json(camera_created),
		bool_json(render_object_created),
		bool_json(object_added),
		bool_json(object_visible_after_render),
		g_scene_probe_tree_flushes,
		g_scene_probe_shadow_flushes,
		g_scene_probe_particle_flushes,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_index_buffer_calls : 0,
		state != nullptr ? state->create_vertex_buffer_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		static_cast<int>(state != nullptr ? state->last_set_transform_state : D3DTS_FORCE_DWORD),
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		state != nullptr ? state->last_draw_start_vertex : 0,
		state != nullptr ? state->last_draw_min_vertex_index : 0,
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_vertex_buffer_offset : 0,
		state != nullptr ? state->last_draw_vertex_buffer_bytes : 0,
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_offset : 0,
		state != nullptr ? state->last_draw_index_buffer_bytes : 0,
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		state != nullptr ? state->last_draw_transform_mask : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.cull_mode : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.z_enable : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.z_write_enable : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.z_func : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.alpha_blend_enable : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.src_blend : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.dest_blend : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.blend_op : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.alpha_test_enable : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.alpha_func : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.alpha_ref : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.color_write_enable : 0));

	g_ww3d_rts_scene_probe_json = buffer;

	if (scene != nullptr && box != nullptr && object_added) {
		scene->Remove_Render_Object(box);
	}
	REF_PTR_RELEASE(box);
	REF_PTR_RELEASE(camera);
	REF_PTR_RELEASE(scene);

	if (succeeded(init_result)) {
		WW3D::Shutdown();
	}

	TheParticleSystemManager = old_particle_system_manager;
	TheW3DShadowManager = old_shadow_manager;
	TheWritableGlobalData = old_global_data;

	return g_ww3d_rts_scene_probe_json.c_str();
}

} // extern "C"
