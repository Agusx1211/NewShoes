#include <cstddef>

extern "C" int __attribute__((weak)) RunBenchmark(
	int,
	char **,
	float *float_result,
	float *int_result,
	float *mem_result)
{
	if (float_result != nullptr) {
		*float_result = 0.0f;
	}
	if (int_result != nullptr) {
		*int_result = 0.0f;
	}
	if (mem_result != nullptr) {
		*mem_result = 0.0f;
	}
	return 0;
}

// Probe-only weak ABI hooks for adjacent terrain systems that are not created
// by the focused HeightMapRenderObjClass smoke yet.
extern "C" void *cnc_port_bridge_info_ctor_c1(void *) __asm__("_ZN10BridgeInfoC1Ev") __attribute__((weak));
extern "C" void *cnc_port_bridge_info_ctor_c2(void *) __asm__("_ZN10BridgeInfoC2Ev") __attribute__((weak));
extern "C" int cnc_port_script_engine_time_frozen_debug(void *) __asm__("_ZN12ScriptEngine17isTimeFrozenDebugEv") __attribute__((weak));
extern "C" int cnc_port_script_engine_time_frozen_script(void *) __asm__("_ZN12ScriptEngine18isTimeFrozenScriptEv") __attribute__((weak));
extern "C" void cnc_port_w3d_snow_release(void *) __asm__("_ZN14W3DSnowManager16ReleaseResourcesEv") __attribute__((weak));
extern "C" int cnc_port_w3d_snow_reacquire(void *) __asm__("_ZN14W3DSnowManager18ReAcquireResourcesEv") __attribute__((weak));
extern "C" void cnc_port_partition_refresh_shroud(void *) __asm__("_ZN16PartitionManager27refreshShroudForLocalPlayerEv") __attribute__((weak));
extern "C" void cnc_port_w3d_shadow_release(void *) __asm__("_ZN16W3DShadowManager16ReleaseResourcesEv") __attribute__((weak));
extern "C" int cnc_port_w3d_shadow_reacquire(void *) __asm__("_ZN16W3DShadowManager18ReAcquireResourcesEv") __attribute__((weak));
extern "C" void *cnc_port_projected_shadow_dtor_c1(void *) __asm__("_ZN18W3DProjectedShadowD1Ev") __attribute__((weak));
extern "C" void *cnc_port_projected_shadow_dtor_c2(void *) __asm__("_ZN18W3DProjectedShadowD2Ev") __attribute__((weak));
extern "C" float cnc_port_water_get_height(void *, float, float) __asm__("_ZN19WaterRenderObjClass14getWaterHeightEff") __attribute__((weak));
extern "C" void cnc_port_water_release(void *) __asm__("_ZN19WaterRenderObjClass16ReleaseResourcesEv") __attribute__((weak));
extern "C" void cnc_port_water_reacquire(void *) __asm__("_ZN19WaterRenderObjClass18ReAcquireResourcesEv") __attribute__((weak));
extern "C" void cnc_port_projected_shadow_queue_decal(void *, void *) __asm__("_ZN25W3DProjectedShadowManager10queueDecalEP18W3DProjectedShadow") __attribute__((weak));
extern "C" void cnc_port_projected_shadow_flush_decals(void *, void *, int) __asm__("_ZN25W3DProjectedShadowManager11flushDecalsEP16W3DShadowTexture10ShadowType") __attribute__((weak));
extern "C" void *cnc_port_projected_shadow_create_decal(void *, void *) __asm__("_ZN25W3DProjectedShadowManager17createDecalShadowEPN6Shadow14ShadowTypeInfoE") __attribute__((weak));
extern "C" void cnc_port_terrain_tracks_release(void *) __asm__("_ZN33TerrainTracksRenderObjClassSystem16ReleaseResourcesEv") __attribute__((weak));
extern "C" void cnc_port_terrain_tracks_reacquire(void *) __asm__("_ZN33TerrainTracksRenderObjClassSystem18ReAcquireResourcesEv") __attribute__((weak));
extern "C" void cnc_port_terrain_tracks_flush(void *) __asm__("_ZN33TerrainTracksRenderObjClassSystem5flushEv") __attribute__((weak));
extern "C" int cnc_port_game_logic_is_paused(void *) __asm__("_ZN9GameLogic12isGamePausedEv") __attribute__((weak));
extern "C" const void *cnc_port_ai_state_goal_path_position(const void *, int) __asm__("_ZNK14AIStateMachine19getGoalPathPositionEi") __attribute__((weak));
extern "C" int cnc_port_partition_prop_shroud_status(const void *, int, const void *) __asm__("_ZNK16PartitionManager28getPropShroudStatusForPlayerEiPK7Coord3D") __attribute__((weak));
extern "C" int cnc_port_ai_update_waypoint_goal_path_size(const void *) __asm__("_ZNK17AIUpdateInterface30friend_getWaypointGoalPathSizeEv") __attribute__((weak));
extern "C" float cnc_port_object_vision_range(const void *) __asm__("_ZNK6Object14getVisionRangeEv") __attribute__((weak));
extern "C" int cnc_port_object_relationship(const void *, const void *) __asm__("_ZNK6Object15getRelationshipEPKS_") __attribute__((weak));
extern "C" int cnc_port_object_is_locally_controlled(const void *) __asm__("_ZNK6Object19isLocallyControlledEv") __attribute__((weak));
extern "C" void *cnc_port_object_exit_interface(const void *) __asm__("_ZNK6Object22getObjectExitInterfaceEv") __attribute__((weak));

extern "C" void *cnc_port_bridge_info_ctor_c1(void *self) { return self; }
extern "C" void *cnc_port_bridge_info_ctor_c2(void *self) { return self; }
extern "C" int cnc_port_script_engine_time_frozen_debug(void *) { return 0; }
extern "C" int cnc_port_script_engine_time_frozen_script(void *) { return 0; }
extern "C" void cnc_port_w3d_snow_release(void *) {}
extern "C" int cnc_port_w3d_snow_reacquire(void *) { return 1; }
extern "C" void cnc_port_partition_refresh_shroud(void *) {}
extern "C" void cnc_port_w3d_shadow_release(void *) {}
extern "C" int cnc_port_w3d_shadow_reacquire(void *) { return 1; }
extern "C" void *cnc_port_projected_shadow_dtor_c1(void *self) { return self; }
extern "C" void *cnc_port_projected_shadow_dtor_c2(void *self) { return self; }
extern "C" float cnc_port_water_get_height(void *, float, float) { return 0.0f; }
extern "C" void cnc_port_water_release(void *) {}
extern "C" void cnc_port_water_reacquire(void *) {}
extern "C" void cnc_port_projected_shadow_queue_decal(void *, void *) {}
extern "C" void cnc_port_projected_shadow_flush_decals(void *, void *, int) {}
extern "C" void *cnc_port_projected_shadow_create_decal(void *, void *) { return nullptr; }
extern "C" void cnc_port_terrain_tracks_release(void *) {}
extern "C" void cnc_port_terrain_tracks_reacquire(void *) {}
extern "C" void cnc_port_terrain_tracks_flush(void *) {}
extern "C" int cnc_port_game_logic_is_paused(void *) { return 0; }
extern "C" const void *cnc_port_ai_state_goal_path_position(const void *, int) { return nullptr; }
extern "C" int cnc_port_partition_prop_shroud_status(const void *, int, const void *) { return 0; }
extern "C" int cnc_port_ai_update_waypoint_goal_path_size(const void *) { return 0; }
extern "C" float cnc_port_object_vision_range(const void *) { return 0.0f; }
extern "C" int cnc_port_object_relationship(const void *, const void *) { return 1; }
extern "C" int cnc_port_object_is_locally_controlled(const void *) { return 0; }
extern "C" void *cnc_port_object_exit_interface(const void *) { return nullptr; }
