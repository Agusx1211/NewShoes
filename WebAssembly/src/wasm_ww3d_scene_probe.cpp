#include <cstdio>
#include <cstring>
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
#include "WW3D2/light.h"
#include "WW3D2/rinfo.h"
#include "WW3D2/ww3d.h"
#include "WWMath/Matrix3D.h"
#if defined(__clang__)
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wkeyword-macro"
#endif
#define protected public
#include "W3DDevice/GameClient/W3DDisplay.h"
#undef protected
#if defined(__clang__)
#pragma clang diagnostic pop
#endif
#include "W3DDevice/GameClient/W3DShadow.h"
#include "W3DDevice/GameClient/W3DScene.h"
#include "W3DDevice/GameClient/W3DShroud.h"
#include "W3DDevice/GameClient/W3DTreeBuffer.h"
#include "wasm_d3d8_shim.h"
#include "wasm_ww3d_probe_lifetime.h"

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

class ScriptEngine;

namespace {

std::string g_ww3d_rts_scene_probe_json;
std::string g_ww3d_display_scene_probe_json;

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
	global_data.m_framesPerSecondLimit = 30.0f;
	global_data.m_windowed = TRUE;
	global_data.m_xResolution = 800;
	global_data.m_yResolution = 600;
	global_data.m_textureReductionFactor = 0;
	global_data.m_maxVisibleTranslucentObjects = 64;
	global_data.m_maxVisibleOccluderObjects = 64;
	global_data.m_maxVisibleOccludeeObjects = 64;
	global_data.m_maxVisibleNonOccluderOrOccludeeObjects = 64;
	global_data.m_defaultOcclusionDelay = 0;
	global_data.m_enableBehindBuildingMarkers = FALSE;
	global_data.m_clearAlpha = 255;
	global_data.m_fogAlpha = 127;
	global_data.m_timeOfDay = TIME_OF_DAY_AFTERNOON;
	global_data.m_numGlobalLights = 1;
	global_data.m_incrementalAGPBuf = FALSE;
	global_data.m_displayGamma = 1.0f;
	for (Int i = 0; i < TIME_OF_DAY_COUNT; ++i) {
		global_data.m_infantryLightScale[i] = 1.0f;
		for (Int light_index = 0; light_index < MAX_GLOBAL_LIGHTS; ++light_index) {
			GlobalData::TerrainLighting &lighting =
				global_data.m_terrainObjectsLighting[i][light_index];
			lighting.ambient.red = 0.35f;
			lighting.ambient.green = 0.35f;
			lighting.ambient.blue = 0.35f;
			lighting.diffuse.red = 0.8f;
			lighting.diffuse.green = 0.8f;
			lighting.diffuse.blue = 0.8f;
			lighting.lightPos.x = 0.3f;
			lighting.lightPos.y = -0.4f;
			lighting.lightPos.z = 0.85f;
		}
	}
	global_data.m_scriptOverrideInfantryLightScale = -1.0f;
}

struct ProbeW3DDisplaySceneStorage
{
	W3DDisplay *prepare(unsigned int width, unsigned int height)
	{
		std::memset(storage, 0, sizeof(storage));
		W3DDisplay *display = as_display();
		display->m_width = width;
		display->m_height = height;
		display->m_bitDepth = 32;
		display->m_windowed = TRUE;
		display->m_initialized = FALSE;
		display->m_averageFPS = 30.0f;
		display->m_isClippedEnabled = FALSE;
		display->m_clipRegion.lo.x = 0;
		display->m_clipRegion.lo.y = 0;
		display->m_clipRegion.hi.x = static_cast<Int>(width);
		display->m_clipRegion.hi.y = static_cast<Int>(height);
		return display;
	}

	W3DDisplay *as_display()
	{
		return reinterpret_cast<W3DDisplay *>(storage);
	}

	alignas(W3DDisplay) unsigned char storage[sizeof(W3DDisplay)] = {};
};

} // namespace

#ifndef CNC_PORT_LINKS_REAL_W3D_SCENE_EXTRA_PASSES
void __attribute__((weak)) DoTrees(RenderInfoClass &)
{
	++g_scene_probe_tree_flushes;
}

// NOTE: the real DoShadows (GameEngineDevice W3DShadow.cpp) is linked through
// zh_gameengine_real_object_ini_runtime and overrides this weak counting hook,
// so g_scene_probe_shadow_flushes stays 0 while the real extra-pass callback
// runs.  The counter is kept as a tripwire: it only increments again if the
// real implementation ever drops out of the link.
void __attribute__((weak)) DoShadows(RenderInfoClass &, Bool)
{
	++g_scene_probe_shadow_flushes;
}

// NOTE: the real DoParticles (GameEngineDevice W3DParticleSys.cpp) is linked
// through zh_gameengine_real_object_ini_runtime and overrides this weak
// counting hook, mirroring the DoShadows tripwire above.
void __attribute__((weak)) DoParticles(RenderInfoClass &)
{
	++g_scene_probe_particle_flushes;
}
#endif

extern ParticleSystemManager *TheParticleSystemManager;
extern W3DShadowManager *TheW3DShadowManager;
extern GlobalData *TheWritableGlobalData;
extern ScriptEngine *TheScriptEngine;

#ifndef CNC_PORT_LINKS_REAL_W3D_SCENE_SINGLETONS
ParticleSystemManager *TheParticleSystemManager __attribute__((weak)) = nullptr;
W3DShadowManager *TheW3DShadowManager __attribute__((weak)) = nullptr;
GlobalData *TheWritableGlobalData __attribute__((weak)) = nullptr;
ScriptEngine *TheScriptEngine __attribute__((weak)) = nullptr;
#endif

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

extern "C" {

const char *probe_ww3d_rts_scene_extra_pass(
	SceneClass::ExtraPassPolyRenderType extra_pass_mode,
	const char *extra_pass_name,
	const char *source,
	bool expect_clear_line)
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
		scene->Set_Extra_Pass_Polygon_Mode(extra_pass_mode);
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
	const DWORD rgb_color_write =
		D3DCOLORWRITEENABLE_RED | D3DCOLORWRITEENABLE_GREEN | D3DCOLORWRITEENABLE_BLUE;
	const bool draw_state_ok =
		state != nullptr &&
		state->last_draw_render_state.fill_mode == D3DFILL_WIREFRAME &&
		state->last_draw_render_state.z_bias == (expect_clear_line ? 0u : 7u) &&
		state->last_draw_render_state.color_write_enable == rgb_color_write;
	const bool clear_line_state_ok =
		!expect_clear_line ||
		(state != nullptr &&
		 state->clear_calls >= 2 &&
		 state->last_clear_flags == D3DCLEAR_TARGET &&
		 (state->last_clear_color & 0x00ffffffu) == 0 &&
		 state->last_clear_z == 1.0f &&
		 state->viewport.MinZ == 0.0f &&
		 state->viewport.MaxZ == 1.0f &&
		 state->set_viewport_calls >= 3);
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		scene_created &&
		camera_created &&
		render_object_created &&
		object_added &&
		object_visible_after_render &&
		scene->Get_Extra_Pass_Polygon_Mode() == extra_pass_mode &&
		succeeded(begin_render_result) &&
		succeeded(render_result) &&
		succeeded(end_render_result) &&
		state->create_device_calls >= 1 &&
		state->create_vertex_buffer_calls >= 1 &&
		state->create_index_buffer_calls >= 1 &&
		state->set_stream_source_calls >= 1 &&
		state->set_indices_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 2 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_transform_calls >= 3 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == 8 &&
		state->last_draw_primitive_count == 12 &&
		state->last_draw_index_format == D3DFMT_INDEX16 &&
		(state->last_draw_transform_mask & 7u) == 7u &&
		draw_state_ok &&
		clear_line_state_ok;

	char buffer[5200];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"%s\","
		"\"ok\":%s,"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,\"beginRender\":%d,"
		"\"render\":%d,\"endRender\":%d,\"sceneCreated\":%s,"
		"\"cameraCreated\":%s,\"renderObjectCreated\":%s,\"objectAdded\":%s,"
		"\"objectVisibleAfterRender\":%s},"
		"\"scene\":{\"type\":\"RTS3DScene\",\"path\":\"WW3D::Render(scene,camera)\","
		"\"extraPassMode\":%d,\"extraPassName\":\"%s\","
		"\"treeFlushes\":%u,\"shadowFlushes\":%u,\"particleFlushes\":%u},"
		"\"calls\":{\"createDevice\":%u,\"createIndexBuffer\":%u,"
		"\"createVertexBuffer\":%u,\"setStreamSource\":%u,\"setIndices\":%u,"
		"\"drawIndexed\":%u,\"setTransform\":%u,\"lastTransformState\":%d,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,"
		"\"browserBufferRelease\":%u,\"clear\":%u,\"present\":%u,"
		"\"setViewport\":%u},"
		"\"clear\":{\"flags\":%lu,\"color\":%lu,\"z\":%.6f,\"stencil\":%lu},"
		"\"viewport\":{\"x\":%lu,\"y\":%lu,\"width\":%lu,\"height\":%lu,"
		"\"minZ\":%.6f,\"maxZ\":%.6f},"
		"\"draw\":{\"primitiveType\":%d,\"startVertex\":%u,\"minVertexIndex\":%u,"
		"\"vertexCount\":%u,\"primitiveCount\":%u,\"vertexStride\":%u,"
		"\"vertexBufferId\":%u,\"vertexOffset\":%u,\"vertexBytes\":%u,"
		"\"indexBufferId\":%u,\"indexOffset\":%u,\"indexBytes\":%u,"
		"\"indexFormat\":%d,\"transformMask\":%u,"
		"\"renderState\":{\"cullMode\":%lu,\"zEnable\":%lu,"
		"\"zWriteEnable\":%lu,\"zFunc\":%lu,\"fillMode\":%lu,\"zBias\":%lu,"
		"\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"blendOp\":%lu,"
		"\"alphaTestEnable\":%lu,\"alphaFunc\":%lu,\"alphaRef\":%lu,"
		"\"colorWriteEnable\":%lu}}}",
		source,
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
		static_cast<int>(extra_pass_mode),
		extra_pass_name,
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
		state != nullptr ? state->set_viewport_calls : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_clear_flags : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_clear_color : 0),
		state != nullptr ? state->last_clear_z : 0.0f,
		static_cast<unsigned long>(state != nullptr ? state->last_clear_stencil : 0),
		static_cast<unsigned long>(state != nullptr ? state->viewport.X : 0),
		static_cast<unsigned long>(state != nullptr ? state->viewport.Y : 0),
		static_cast<unsigned long>(state != nullptr ? state->viewport.Width : 0),
		static_cast<unsigned long>(state != nullptr ? state->viewport.Height : 0),
		state != nullptr ? state->viewport.MinZ : 0.0f,
		state != nullptr ? state->viewport.MaxZ : 0.0f,
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
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.fill_mode : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.z_bias : 0),
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
		wasm_shutdown_ww3d_probe();
	}

	TheParticleSystemManager = old_particle_system_manager;
	TheW3DShadowManager = old_shadow_manager;
	TheWritableGlobalData = old_global_data;

	return g_ww3d_rts_scene_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_rts_scene()
{
	return probe_ww3d_rts_scene_extra_pass(
		SceneClass::EXTRA_PASS_LINE,
		"EXTRA_PASS_LINE",
		"ww3d_rts_scene_probe",
		false);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_rts_scene_clear_line()
{
	return probe_ww3d_rts_scene_extra_pass(
		SceneClass::EXTRA_PASS_CLEAR_LINE,
		"EXTRA_PASS_CLEAR_LINE",
		"ww3d_rts_scene_clear_line_probe",
		true);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_display_scene()
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
	RTS3DScene *old_3d_scene = W3DDisplay::m_3DScene;
	RTS2DScene *old_2d_scene = W3DDisplay::m_2DScene;
	RTS3DInterfaceScene *old_interface_scene = W3DDisplay::m_3DInterfaceScene;
	W3DAssetManager *old_asset_manager = W3DDisplay::m_assetManager;
	TheParticleSystemManager = nullptr;
	TheW3DShadowManager = reinterpret_cast<W3DShadowManager *>(g_probe_shadow_manager_storage);
	W3DDisplay::m_3DScene = nullptr;
	W3DDisplay::m_2DScene = nullptr;
	W3DDisplay::m_3DInterfaceScene = nullptr;
	W3DDisplay::m_assetManager = nullptr;

	ProbeW3DDisplaySceneStorage display_storage;
	W3DDisplay *display = display_storage.prepare(800, 600);
	const bool display_prepared = display != nullptr &&
		display->m_width == 800 &&
		display->m_height == 600 &&
		display->m_bitDepth == 32 &&
		display->m_windowed == TRUE;

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool scene_owned = false;
	bool scene_created = false;
	bool scene_2d_created = false;
	bool interface_scene_created = false;
	bool light_created = false;
	bool time_of_day_applied = false;
	bool camera_created = false;
	bool render_object_created = false;
	bool object_added = false;
	bool object_visible_after_render = false;

	CameraClass *camera = nullptr;
	AABoxRenderObjClass *box = nullptr;

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);
		BoxRenderObjClass::Set_Box_Display_Mask(COLL_TYPE_ALL);

		W3DDisplay::m_3DInterfaceScene = NEW_REF(RTS3DInterfaceScene, ());
		W3DDisplay::m_2DScene = NEW_REF(RTS2DScene, ());
		W3DDisplay::m_3DScene = NEW_REF(RTS3DScene, ());
		interface_scene_created = W3DDisplay::m_3DInterfaceScene != nullptr;
		scene_2d_created = W3DDisplay::m_2DScene != nullptr;
		scene_created = W3DDisplay::m_3DScene != nullptr;

		if (interface_scene_created) {
			W3DDisplay::m_3DInterfaceScene->Set_Ambient_Light(Vector3(1.0f, 1.0f, 1.0f));
		}
		if (scene_2d_created) {
			W3DDisplay::m_2DScene->Set_Ambient_Light(Vector3(1.0f, 1.0f, 1.0f));
		}

		display->m_myLight[0] = NEW_REF(LightClass, (LightClass::DIRECTIONAL));
		light_created = display->m_myLight[0] != nullptr;
		if (scene_created && light_created) {
			display->W3DDisplay::setTimeOfDay(global_data.m_timeOfDay);
			W3DDisplay::m_3DScene->setGlobalLight(display->m_myLight[0], 0);
			time_of_day_applied = true;
		}

		scene_owned =
			W3DDisplay::m_3DScene != nullptr &&
			W3DDisplay::m_2DScene != nullptr &&
			W3DDisplay::m_3DInterfaceScene != nullptr &&
			W3DDisplay::m_assetManager == nullptr;

		camera = W3DNEW CameraClass();
		box = NEW_REF(AABoxRenderObjClass, ());
		camera_created = camera != nullptr;
		render_object_created = box != nullptr;
	}

	if (scene_created && camera_created && render_object_created) {
		box->Set_Position(Vector3(0.0f, 0.0f, 0.0f));
		box->Set_Local_Center_Extent(Vector3(0.0f, 0.0f, 0.0f), Vector3(2.0f, 2.0f, 2.0f));
		box->Set_Color(Vector3(0.1f, 0.85f, 0.3f));
		box->Set_Opacity(1.0f);
		box->Set_Force_Visible(true);

		W3DDisplay::m_3DScene->Add_Render_Object(box);
		object_added = box->Peek_Scene() == W3DDisplay::m_3DScene;
	}

	if (object_added) {
		Matrix3D camera_transform(true);
		camera_transform.Look_At(Vector3(0.0f, -8.0f, 4.0f), Vector3(0.0f, 0.0f, 0.0f), 0.0f);
		camera->Set_Transform(camera_transform);
		camera->Set_Aspect_Ratio(800.0f / 600.0f);
		camera->Set_Clip_Planes(1.0f, 1000.0f);

		begin_render_result = WW3D::Begin_Render(true, true, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			render_result = WW3D::Render(W3DDisplay::m_3DScene, camera);
			object_visible_after_render = box->Is_Really_Visible();
			end_render_result = WW3D::End_Render(false);
		}
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const bool ok =
		state != nullptr &&
		display_prepared &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		scene_owned &&
		scene_created &&
		scene_2d_created &&
		interface_scene_created &&
		light_created &&
		time_of_day_applied &&
		camera_created &&
		render_object_created &&
		object_added &&
		object_visible_after_render &&
		succeeded(begin_render_result) &&
		succeeded(render_result) &&
		succeeded(end_render_result) &&
		g_scene_probe_shadow_flushes == 0 &&
		// The real DoParticles (GameEngineDevice W3DParticleSys.cpp) is linked
		// through zh_gameengine_real_lifecycle_runtime and overrides the weak
		// counting hook above (it no-ops safely with a null
		// TheParticleSystemManager), so this stays 0 like the DoShadows
		// tripwire: it only increments if the real implementation drops out.
		g_scene_probe_particle_flushes == 0 &&
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

	char buffer[4400];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_display_scene_probe\","
		"\"ok\":%s,"
		"\"results\":{\"displayPrepared\":%s,\"init\":%d,\"setRenderDevice\":%d,"
		"\"beginRender\":%d,\"render\":%d,\"endRender\":%d,"
		"\"sceneOwned\":%s,\"sceneCreated\":%s,\"scene2DCreated\":%s,"
		"\"interfaceSceneCreated\":%s,\"lightCreated\":%s,"
		"\"timeOfDayApplied\":%s,\"cameraCreated\":%s,"
		"\"renderObjectCreated\":%s,\"objectAdded\":%s,"
		"\"objectVisibleAfterRender\":%s},"
		"\"display\":{\"width\":%u,\"height\":%u,\"bitDepth\":%u,"
		"\"windowed\":%s,\"path\":\"W3DDisplay::m_3DScene\"},"
		"\"scene\":{\"type\":\"RTS3DScene\",\"path\":\"WW3D::Render(W3DDisplay::m_3DScene,camera)\","
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
		"\"indexFormat\":%d,\"transformMask\":%u}}",
		bool_json(ok),
		bool_json(display_prepared),
		init_result,
		set_device_result,
		begin_render_result,
		render_result,
		end_render_result,
		bool_json(scene_owned),
		bool_json(scene_created),
		bool_json(scene_2d_created),
		bool_json(interface_scene_created),
		bool_json(light_created),
		bool_json(time_of_day_applied),
		bool_json(camera_created),
		bool_json(render_object_created),
		bool_json(object_added),
		bool_json(object_visible_after_render),
		display != nullptr ? display->m_width : 0,
		display != nullptr ? display->m_height : 0,
		display != nullptr ? display->m_bitDepth : 0,
		bool_json(display != nullptr && display->m_windowed == TRUE),
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
		state != nullptr ? state->last_draw_transform_mask : 0);

	g_ww3d_display_scene_probe_json = buffer;

	if (W3DDisplay::m_3DScene != nullptr && box != nullptr && object_added) {
		W3DDisplay::m_3DScene->Remove_Render_Object(box);
	}
	REF_PTR_RELEASE(box);
	REF_PTR_RELEASE(camera);

	RTS3DScene *owned_3d_scene = W3DDisplay::m_3DScene;
	RTS2DScene *owned_2d_scene = W3DDisplay::m_2DScene;
	RTS3DInterfaceScene *owned_interface_scene = W3DDisplay::m_3DInterfaceScene;
	W3DDisplay::m_3DScene = old_3d_scene;
	W3DDisplay::m_2DScene = old_2d_scene;
	W3DDisplay::m_3DInterfaceScene = old_interface_scene;
	W3DDisplay::m_assetManager = old_asset_manager;
	REF_PTR_RELEASE(owned_3d_scene);
	REF_PTR_RELEASE(owned_2d_scene);
	REF_PTR_RELEASE(owned_interface_scene);
	for (Int i = 0; i < LightEnvironmentClass::MAX_LIGHTS; ++i) {
		REF_PTR_RELEASE(display->m_myLight[i]);
	}

	if (succeeded(init_result)) {
		wasm_shutdown_ww3d_probe();
	}

	TheParticleSystemManager = old_particle_system_manager;
	TheW3DShadowManager = old_shadow_manager;
	TheWritableGlobalData = old_global_data;

	return g_ww3d_display_scene_probe_json.c_str();
}

} // extern "C"
