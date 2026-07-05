#include <cstddef>

class GhostObjectManager;
class Radar;
class PlayerList;
class CampaignManager;
struct Coord3D;
class ScriptActionsInterface;
class ScriptConditionsInterface;
class TeamFactory;
class VictoryConditionsInterface;
class Eva;
class BuildAssistant;

extern GhostObjectManager *TheGhostObjectManager;
extern Radar *TheRadar;
extern PlayerList *ThePlayerList;
extern CampaignManager *TheCampaignManager;
extern ScriptActionsInterface *TheScriptActions;
extern ScriptConditionsInterface *TheScriptConditions;
extern TeamFactory *TheTeamFactory;
extern VictoryConditionsInterface *TheVictoryConditions;
extern Eva *TheEva;
extern BuildAssistant *TheBuildAssistant;

#ifndef CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_SINGLETONS
GhostObjectManager *TheGhostObjectManager __attribute__((weak)) = nullptr;
Radar *TheRadar __attribute__((weak)) = nullptr;
PlayerList *ThePlayerList __attribute__((weak)) = nullptr;
CampaignManager *TheCampaignManager __attribute__((weak)) = nullptr;
ScriptActionsInterface *TheScriptActions __attribute__((weak)) = nullptr;
ScriptConditionsInterface *TheScriptConditions __attribute__((weak)) = nullptr;
TeamFactory *TheTeamFactory __attribute__((weak)) = nullptr;
VictoryConditionsInterface *TheVictoryConditions __attribute__((weak)) = nullptr;
Eva *TheEva __attribute__((weak)) = nullptr;
BuildAssistant *TheBuildAssistant __attribute__((weak)) = nullptr;
#endif

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
#ifndef CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_BRIDGE_SCRIPT_RUNTIME
extern "C" void *cnc_port_bridge_info_ctor_c1(void *) __asm__("_ZN10BridgeInfoC1Ev") __attribute__((weak));
extern "C" void *cnc_port_bridge_info_ctor_c2(void *) __asm__("_ZN10BridgeInfoC2Ev") __attribute__((weak));
extern "C" void cnc_port_reload_all_textures(void) __asm__("_Z17ReloadAllTexturesv") __attribute__((weak));
extern "C" int cnc_port_script_engine_time_frozen_debug(void *) __asm__("_ZN12ScriptEngine17isTimeFrozenDebugEv") __attribute__((weak));
extern "C" int cnc_port_script_engine_time_frozen_script(void *) __asm__("_ZN12ScriptEngine18isTimeFrozenScriptEv") __attribute__((weak));
#endif
#ifndef CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_TEAM_RUNTIME
extern "C" void *cnc_port_team_factory_find_team_by_id(void *, unsigned int) __asm__("_ZN11TeamFactory12findTeamByIDEj") __attribute__((weak));
extern "C" void *cnc_port_team_factory_find_prototype(void *, const void *) __asm__("_ZN11TeamFactory17findTeamPrototypeERK11AsciiString") __attribute__((weak));
extern "C" int cnc_port_team_prototype_count_instances(void *) __asm__("_ZN13TeamPrototype18countTeamInstancesEv") __attribute__((weak));
extern "C" void *cnc_port_campaign_manager_current_campaign(void *) __asm__("_ZN15CampaignManager18getCurrentCampaignEv") __attribute__((weak));
extern "C" void cnc_port_team_get_as_ai_group(void *, void *) __asm__("_ZN4Team16getTeamAsAIGroupEP7AIGroup") __attribute__((weak));
extern "C" void *cnc_port_team_get_controlling_player(const void *) __asm__("_ZNK4Team20getControllingPlayerEv") __attribute__((weak));
#endif
extern "C" void cnc_port_pathfinder_classify_object_footprint(void *, void *, bool) __asm__("_ZN10Pathfinder23classifyObjectFootprintEP6Objectb") __attribute__((weak));
extern "C" void cnc_port_pathfinder_classify_object_footprint(void *, void *, bool) {}
extern "C" void *cnc_port_ai_player_ctor_c1(void *self, void *) __asm__("_ZN8AIPlayerC1EP6Player") __attribute__((weak));
extern "C" void *cnc_port_ai_player_ctor_c1(void *self, void *) { return self; }
extern "C" void *cnc_port_ai_skirmish_player_ctor_c1(void *self, void *) __asm__("_ZN16AISkirmishPlayerC1EP6Player") __attribute__((weak));
extern "C" void *cnc_port_ai_skirmish_player_ctor_c1(void *self, void *) { return self; }
extern "C" int cnc_port_ai_player_difficulty(const void *) __asm__("_ZNK8AIPlayer15getAIDifficultyEv") __attribute__((weak));
extern "C" int cnc_port_ai_player_difficulty(const void *) { return 0; }
extern "C" void cnc_port_ai_player_pre_team_destroy(void *, const void *) __asm__("_ZN8AIPlayer16aiPreTeamDestroyEPK4Team") __attribute__((weak));
extern "C" void cnc_port_ai_player_pre_team_destroy(void *, const void *) {}
extern "C" void *cnc_port_resource_gathering_manager_ctor_c1(void *self) __asm__("_ZN24ResourceGatheringManagerC1Ev") __attribute__((weak));
extern "C" void *cnc_port_resource_gathering_manager_ctor_c1(void *self) { return self; }
extern "C" void cnc_port_radar_remove_object(void *, void *) __asm__("_ZN5Radar12removeObjectEP6Object") __attribute__((weak));
extern "C" void cnc_port_radar_remove_object(void *, void *) {}
extern "C" void cnc_port_radar_add_object(void *, void *) __asm__("_ZN5Radar9addObjectEP6Object") __attribute__((weak));
extern "C" void cnc_port_radar_add_object(void *, void *) {}
extern "C" void cnc_port_object_leave_group(void *) __asm__("_ZN6Object10leaveGroupEv") __attribute__((weak));
extern "C" void cnc_port_object_leave_group(void *) {}
extern "C" void cnc_port_object_set_disabled(void *, int) __asm__("_ZN6Object11setDisabledE12DisabledType") __attribute__((weak));
extern "C" void cnc_port_object_set_disabled(void *, int) {}
extern "C" int cnc_port_object_clear_disabled(void *, int) __asm__("_ZN6Object13clearDisabledE12DisabledType") __attribute__((weak));
extern "C" int cnc_port_object_clear_disabled(void *, int) { return 0; }
extern "C" void cnc_port_object_update_upgrade_modules(void *) __asm__("_ZN6Object20updateUpgradeModulesEv") __attribute__((weak));
extern "C" void cnc_port_object_update_upgrade_modules(void *) {}
extern "C" void cnc_port_object_set_team(void *, void *) __asm__("_ZN6Object7setTeamEP4Team") __attribute__((weak));
extern "C" void cnc_port_object_set_team(void *, void *) {}
extern "C" void cnc_port_object_set_indicator(void *, int) __asm__("_ZN6Object23setCustomIndicatorColorEi") __attribute__((weak));
extern "C" void cnc_port_object_remove_indicator(void *) __asm__("_ZN6Object26removeCustomIndicatorColorEv") __attribute__((weak));
extern "C" int cnc_port_object_get_indicator(const void *) __asm__("_ZNK6Object17getIndicatorColorEv") __attribute__((weak));
extern "C" const void *cnc_port_object_get_command_set_string(const void *) __asm__("_ZNK6Object19getCommandSetStringEv") __attribute__((weak));
extern "C" const void *cnc_port_object_get_command_set_string(const void *) { return nullptr; }
extern "C" int cnc_port_object_get_night_indicator_color(const void *) __asm__("_ZNK6Object22getNightIndicatorColorEv") __attribute__((weak));
extern "C" int cnc_port_object_get_night_indicator_color(const void *) { return 0; }
extern "C" void cnc_port_ai_group_add(void *, void *) __asm__("_ZN7AIGroup3addEP6Object") __attribute__((weak));
extern "C" void cnc_port_ai_group_add(void *, void *) {}
extern "C" void cnc_port_drawable_set_hidden(void *, int) __asm__("_ZN8Drawable17setDrawableHiddenEb") __attribute__((weak));
extern "C" void cnc_port_drawable_set_hidden(void *, int) {}
extern "C" void cnc_port_drawable_set_indicator_color(void *, int) __asm__("_ZN8Drawable17setIndicatorColorEi") __attribute__((weak));
extern "C" void cnc_port_drawable_set_indicator_color(void *, int) {}
extern "C" int cnc_port_thing_template_calc_cost_to_build(const void *, const void *) __asm__("_ZNK13ThingTemplate15calcCostToBuildEPK6Player") __attribute__((weak));
extern "C" int cnc_port_thing_template_calc_cost_to_build(const void *, const void *) { return 0; }
extern "C" void *cnc_port_player_current_enemy(void *) __asm__("_ZN6Player15getCurrentEnemyEv") __attribute__((weak));
extern "C" void cnc_port_player_update_team_states(void *) __asm__("_ZN6Player16updateTeamStatesEv") __attribute__((weak));
extern "C" int cnc_port_player_is_skirmish_ai(void *) __asm__("_ZN6Player18isSkirmishAIPlayerEv") __attribute__((weak));
extern "C" int cnc_port_player_difficulty(const void *) __asm__("_ZNK6Player19getPlayerDifficultyEv") __attribute__((weak));
extern "C" void *cnc_port_ai_group_ctor_c1(void *) __asm__("_ZN7AIGroupC1Ev") __attribute__((weak));
extern "C" int cnc_port_ai_group_is_dead(const void *) __asm__("_ZNK7AIGroup13isGroupAiDeadEv") __attribute__((weak));
extern "C" int cnc_port_ai_group_is_idle(const void *) __asm__("_ZNK7AIGroup6isIdleEv") __attribute__((weak));
extern "C" void cnc_port_w3d_snow_release(void *) __asm__("_ZN14W3DSnowManager16ReleaseResourcesEv") __attribute__((weak));
extern "C" int cnc_port_w3d_snow_reacquire(void *) __asm__("_ZN14W3DSnowManager18ReAcquireResourcesEv") __attribute__((weak));
extern "C" void *cnc_port_simple_object_iterator_ctor_c1(void *) __asm__("_ZN20SimpleObjectIteratorC1Ev") __attribute__((weak));
extern "C" void cnc_port_simple_object_iterator_insert(void *, void *, float) __asm__("_ZN20SimpleObjectIterator6insertEP6Objectf") __attribute__((weak));
extern "C" void cnc_port_simple_object_iterator_sort(void *, int) __asm__("_ZN20SimpleObjectIterator4sortE13IterOrderType") __attribute__((weak));
extern "C" void cnc_port_object_on_partition_cell_change(void *) __asm__("_ZN6Object21onPartitionCellChangeEv") __attribute__((weak));
extern "C" void cnc_port_object_on_collide(void *, void *, const Coord3D *, const Coord3D *) __asm__("_ZN6Object9onCollideEPS_PK7Coord3DS3_") __attribute__((weak));
extern "C" void cnc_port_w3d_shadow_release(void *) __asm__("_ZN16W3DShadowManager16ReleaseResourcesEv") __attribute__((weak));
extern "C" int cnc_port_w3d_shadow_reacquire(void *) __asm__("_ZN16W3DShadowManager18ReAcquireResourcesEv") __attribute__((weak));
extern "C" void *cnc_port_w3d_shadow_ctor_c1(void *) __asm__("_ZN16W3DShadowManagerC1Ev") __attribute__((weak));
extern "C" void *cnc_port_w3d_shadow_dtor_c1(void *) __asm__("_ZN16W3DShadowManagerD1Ev") __attribute__((weak));
extern "C" int cnc_port_w3d_shadow_init(void *) __asm__("_ZN16W3DShadowManager4initEv") __attribute__((weak));
extern "C" void cnc_port_w3d_shadow_reset(void *) __asm__("_ZN16W3DShadowManager5ResetEv") __attribute__((weak));
extern "C" void *cnc_port_projected_shadow_dtor_c1(void *) __asm__("_ZN18W3DProjectedShadowD1Ev") __attribute__((weak));
extern "C" void *cnc_port_projected_shadow_dtor_c2(void *) __asm__("_ZN18W3DProjectedShadowD2Ev") __attribute__((weak));
extern "C" void *cnc_port_water_ctor_c1(void *) __asm__("_ZN19WaterRenderObjClassC1Ev") __attribute__((weak));
extern "C" void *cnc_port_water_ctor_c2(void *) __asm__("_ZN19WaterRenderObjClassC2Ev") __attribute__((weak));
extern "C" void *cnc_port_water_dtor_c1(void *) __asm__("_ZN19WaterRenderObjClassD1Ev") __attribute__((weak));
extern "C" void *cnc_port_water_dtor_c2(void *) __asm__("_ZN19WaterRenderObjClassD2Ev") __attribute__((weak));
extern "C" int cnc_port_water_init(void *, float, float, float, void *, int) __asm__("_ZN19WaterRenderObjClass4initEfffP10SceneClassNS_9WaterTypeE") __attribute__((weak));
extern "C" void cnc_port_water_reset(void *) __asm__("_ZN19WaterRenderObjClass5resetEv") __attribute__((weak));
extern "C" void cnc_port_water_load(void *) __asm__("_ZN19WaterRenderObjClass4loadEv") __attribute__((weak));
extern "C" void cnc_port_water_update(void *) __asm__("_ZN19WaterRenderObjClass6updateEv") __attribute__((weak));
extern "C" void cnc_port_water_enable_grid(void *, bool) __asm__("_ZN19WaterRenderObjClass15enableWaterGridEb") __attribute__((weak));
extern "C" void cnc_port_water_update_map_overrides(void *) __asm__("_ZN19WaterRenderObjClass18updateMapOverridesEv") __attribute__((weak));
extern "C" float cnc_port_water_get_height(void *, float, float) __asm__("_ZN19WaterRenderObjClass14getWaterHeightEff") __attribute__((weak));
extern "C" void cnc_port_water_release(void *) __asm__("_ZN19WaterRenderObjClass16ReleaseResourcesEv") __attribute__((weak));
extern "C" void cnc_port_water_reacquire(void *) __asm__("_ZN19WaterRenderObjClass18ReAcquireResourcesEv") __attribute__((weak));
extern "C" void cnc_port_water_set_grid_height_clamps(void *, float, float) __asm__("_ZN19WaterRenderObjClass19setGridHeightClampsEff") __attribute__((weak));
extern "C" void cnc_port_water_add_velocity(void *, float, float, float, float) __asm__("_ZN19WaterRenderObjClass11addVelocityEffff") __attribute__((weak));
extern "C" void cnc_port_water_change_grid_height(void *, float, float, float) __asm__("_ZN19WaterRenderObjClass16changeGridHeightEfff") __attribute__((weak));
extern "C" void cnc_port_water_set_grid_change_attenuation(void *, float, float, float, float) __asm__("_ZN19WaterRenderObjClass31setGridChangeAttenuationFactorsEffff") __attribute__((weak));
extern "C" void cnc_port_water_set_grid_transform_values(void *, float, float, float, float) __asm__("_ZN19WaterRenderObjClass16setGridTransformEffff") __attribute__((weak));
extern "C" void cnc_port_water_set_grid_transform_matrix(void *, const void *) __asm__("_ZN19WaterRenderObjClass16setGridTransformEPK8Matrix3D") __attribute__((weak));
extern "C" void cnc_port_water_get_grid_transform(void *, void *) __asm__("_ZN19WaterRenderObjClass16getGridTransformEP8Matrix3D") __attribute__((weak));
extern "C" void cnc_port_water_set_grid_resolution(void *, float, float, float) __asm__("_ZN19WaterRenderObjClass17setGridResolutionEfff") __attribute__((weak));
extern "C" void cnc_port_water_get_grid_resolution(void *, float *, float *, float *) __asm__("_ZN19WaterRenderObjClass17getGridResolutionEPfS0_S0_") __attribute__((weak));
extern "C" void cnc_port_water_replace_skybox_texture(void *, const void *, const void *) __asm__("_ZN19WaterRenderObjClass20replaceSkyboxTextureERK11AsciiStringS2_") __attribute__((weak));
extern "C" void cnc_port_projected_shadow_queue_decal(void *, void *) __asm__("_ZN25W3DProjectedShadowManager10queueDecalEP18W3DProjectedShadow") __attribute__((weak));
extern "C" void cnc_port_projected_shadow_flush_decals(void *, void *, int) __asm__("_ZN25W3DProjectedShadowManager11flushDecalsEP16W3DShadowTexture10ShadowType") __attribute__((weak));
extern "C" void *cnc_port_projected_shadow_create_decal(void *, void *) __asm__("_ZN25W3DProjectedShadowManager17createDecalShadowEPN6Shadow14ShadowTypeInfoE") __attribute__((weak));
extern "C" void cnc_port_terrain_tracks_release(void *) __asm__("_ZN33TerrainTracksRenderObjClassSystem16ReleaseResourcesEv") __attribute__((weak));
extern "C" void cnc_port_terrain_tracks_reacquire(void *) __asm__("_ZN33TerrainTracksRenderObjClassSystem18ReAcquireResourcesEv") __attribute__((weak));
extern "C" void cnc_port_terrain_tracks_flush(void *) __asm__("_ZN33TerrainTracksRenderObjClassSystem5flushEv") __attribute__((weak));
extern "C" void *cnc_port_terrain_tracks_ctor_c1(void *) __asm__("_ZN33TerrainTracksRenderObjClassSystemC1Ev") __attribute__((weak));
extern "C" void *cnc_port_terrain_tracks_dtor_c1(void *) __asm__("_ZN33TerrainTracksRenderObjClassSystemD1Ev") __attribute__((weak));
extern "C" void cnc_port_terrain_tracks_init(void *, void *) __asm__("_ZN33TerrainTracksRenderObjClassSystem4initEP10SceneClass") __attribute__((weak));
extern "C" void cnc_port_terrain_tracks_reset(void *) __asm__("_ZN33TerrainTracksRenderObjClassSystem5ResetEv") __attribute__((weak));
extern "C" void cnc_port_terrain_tracks_set_detail(void *) __asm__("_ZN33TerrainTracksRenderObjClassSystem9setDetailEv") __attribute__((weak));
extern "C" int cnc_port_game_logic_is_paused(void *) __asm__("_ZN9GameLogic12isGamePausedEv") __attribute__((weak));
extern "C" const void *cnc_port_ai_state_goal_path_position(const void *, int) __asm__("_ZNK14AIStateMachine19getGoalPathPositionEi") __attribute__((weak));
extern "C" int cnc_port_partition_geom_collides(const void *, const void *, const void *, float, const void *, const void *, float) __asm__("_ZNK16PartitionManager20geomCollidesWithGeomEPK7Coord3DRK12GeometryInfofS2_S5_f") __attribute__((weak));
extern "C" int cnc_port_partition_prop_shroud_status(const void *, int, const void *) __asm__("_ZNK16PartitionManager28getPropShroudStatusForPlayerEiPK7Coord3D") __attribute__((weak));
extern "C" void cnc_port_partition_restore_fogged_cells(void *, const void *, bool) __asm__("_ZN16PartitionManager18restoreFoggedCellsERK24ShroudStatusStoreRestoreb") __attribute__((weak));
extern "C" void *cnc_port_partition_iterate_objects_in_range(void *, const void *, float, int, void *, int) __asm__("_ZN16PartitionManager21iterateObjectsInRangeEPK7Coord3Df23DistanceCalculationTypePP15PartitionFilter13IterOrderType") __attribute__((weak));
extern "C" void cnc_port_partition_process_pending_undo_shroud(void *) __asm__("_ZN16PartitionManager41processEntirePendingUndoShroudRevealQueueEv") __attribute__((weak));
extern "C" void cnc_port_partition_store_fogged_cells(const void *, void *, bool) __asm__("_ZNK16PartitionManager16storeFoggedCellsER24ShroudStatusStoreRestoreb") __attribute__((weak));
extern "C" int cnc_port_ai_update_waypoint_goal_path_size(const void *) __asm__("_ZNK17AIUpdateInterface30friend_getWaypointGoalPathSizeEv") __attribute__((weak));
extern "C" void cnc_port_w3d_model_draw_best_model_name_for_wb(void *, const void *, const void *) __asm__("_ZNK22W3DModelDrawModuleData21getBestModelNameForWBERK8BitFlagsILm117EE") __attribute__((weak));
extern "C" const void *cnc_port_thing_get_template(const void *) __asm__("_ZNK5Thing11getTemplateEv") __attribute__((weak));
extern "C" void cnc_port_thing_set_position(void *, const void *) __asm__("_ZN5Thing11setPositionEPK7Coord3D") __attribute__((weak));
extern "C" void cnc_port_thing_set_orientation(void *, float) __asm__("_ZN5Thing14setOrientationEf") __attribute__((weak));
extern "C" unsigned int cnc_port_drawable_get_id(const void *) __asm__("_ZNK8Drawable5getIDEv") __attribute__((weak));
extern "C" float cnc_port_object_vision_range(const void *) __asm__("_ZNK6Object14getVisionRangeEv") __attribute__((weak));
extern "C" int cnc_port_object_relationship(const void *, const void *) __asm__("_ZNK6Object15getRelationshipEPKS_") __attribute__((weak));
extern "C" int cnc_port_object_is_locally_controlled(const void *) __asm__("_ZNK6Object19isLocallyControlledEv") __attribute__((weak));
extern "C" void *cnc_port_object_exit_interface(const void *) __asm__("_ZNK6Object22getObjectExitInterfaceEv") __attribute__((weak));
extern "C" void cnc_port_object_attempt_damage(void *, void *) __asm__("_ZN6Object13attemptDamageEP10DamageInfo") __attribute__((weak));
extern "C" void cnc_port_object_friend_notify_boundary(void *) __asm__("_ZN6Object29friend_notifyOfNewMapBoundaryEv") __attribute__((weak));
extern "C" void cnc_port_object_update_values_from_map(void *, void *) __asm__("_ZN6Object32updateObjValuesFromMapPropertiesEP4Dict") __attribute__((weak));
extern "C" void cnc_port_object_friend_prepare_boundary(void *) __asm__("_ZN6Object34friend_prepareForMapBoundaryAdjustEv") __attribute__((weak));
extern "C" int cnc_port_pathfinder_is_point_on_wall(void *, const void *) __asm__("_ZN10Pathfinder13isPointOnWallEPK7Coord3D") __attribute__((weak));
extern "C" void cnc_port_pathfinder_change_bridge_state(void *, int, bool) __asm__("_ZN10Pathfinder17changeBridgeStateE17PathfindLayerEnumb") __attribute__((weak));
extern "C" void cnc_port_pathfinder_force_map_recalculation(void *) __asm__("_ZN10Pathfinder21forceMapRecalculationEv") __attribute__((weak));
extern "C" int cnc_port_pathfinder_add_bridge(void *, void *) __asm__("_ZN10Pathfinder9addBridgeEP6Bridge") __attribute__((weak));
extern "C" void *cnc_port_bridge_behavior_interface(void *) __asm__("_ZN14BridgeBehavior36getBridgeBehaviorInterfaceFromObjectEP6Object") __attribute__((weak));
extern "C" void *cnc_port_bridge_tower_behavior_interface(void *) __asm__("_ZN19BridgeTowerBehavior41getBridgeTowerBehaviorInterfaceFromObjectEP6Object") __attribute__((weak));
extern "C" void cnc_port_game_logic_destroy_object(void *, void *) __asm__("_ZN9GameLogic13destroyObjectEP6Object") __attribute__((weak));
extern "C" void *cnc_port_game_logic_get_first_object(void *) __asm__("_ZN9GameLogic14getFirstObjectEv") __attribute__((weak));

#ifndef CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_BRIDGE_SCRIPT_RUNTIME
extern "C" void *cnc_port_bridge_info_ctor_c1(void *self) { return self; }
extern "C" void *cnc_port_bridge_info_ctor_c2(void *self) { return self; }
extern "C" void cnc_port_reload_all_textures(void) {}
extern "C" int cnc_port_script_engine_time_frozen_debug(void *) { return 0; }
extern "C" int cnc_port_script_engine_time_frozen_script(void *) { return 0; }
#endif
#ifndef CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_TEAM_RUNTIME
extern "C" void *cnc_port_team_factory_find_team_by_id(void *, unsigned int) { return nullptr; }
extern "C" void *cnc_port_team_factory_find_prototype(void *, const void *) { return nullptr; }
extern "C" int cnc_port_team_prototype_count_instances(void *) { return 0; }
extern "C" void *cnc_port_campaign_manager_current_campaign(void *) { return nullptr; }
extern "C" void cnc_port_team_get_as_ai_group(void *, void *) {}
extern "C" void *cnc_port_team_get_controlling_player(const void *) { return nullptr; }
#endif
extern "C" void cnc_port_object_set_indicator(void *, int) {}
extern "C" void cnc_port_object_remove_indicator(void *) {}
extern "C" int cnc_port_object_get_indicator(const void *) { return 0; }
extern "C" void *cnc_port_player_current_enemy(void *) { return nullptr; }
extern "C" void cnc_port_player_update_team_states(void *) {}
extern "C" int cnc_port_player_is_skirmish_ai(void *) { return 0; }
extern "C" int cnc_port_player_difficulty(const void *) { return 1; }
extern "C" void *cnc_port_ai_group_ctor_c1(void *self) { return self; }
extern "C" int cnc_port_ai_group_is_dead(const void *) { return 1; }
extern "C" int cnc_port_ai_group_is_idle(const void *) { return 1; }
extern "C" void cnc_port_w3d_snow_release(void *) {}
extern "C" int cnc_port_w3d_snow_reacquire(void *) { return 1; }
extern "C" void *cnc_port_simple_object_iterator_ctor_c1(void *self) { return self; }
extern "C" void cnc_port_simple_object_iterator_insert(void *, void *, float) {}
extern "C" void cnc_port_simple_object_iterator_sort(void *, int) {}
extern "C" void cnc_port_object_on_partition_cell_change(void *) {}
extern "C" void cnc_port_object_on_collide(void *, void *, const Coord3D *, const Coord3D *) {}
extern "C" void cnc_port_w3d_shadow_release(void *) {}
extern "C" int cnc_port_w3d_shadow_reacquire(void *) { return 1; }
extern "C" void *cnc_port_w3d_shadow_ctor_c1(void *self) { return self; }
extern "C" void *cnc_port_w3d_shadow_dtor_c1(void *self) { return self; }
extern "C" int cnc_port_w3d_shadow_init(void *) { return 1; }
extern "C" void cnc_port_w3d_shadow_reset(void *) {}
extern "C" void *cnc_port_w3d_smudge_ctor_c1(void *self) { return self; }
extern "C" void *cnc_port_w3d_smudge_dtor_c1(void *self) { return self; }
extern "C" void cnc_port_w3d_smudge_init(void *) {}
extern "C" void cnc_port_w3d_smudge_reset(void *) {}
extern "C" void cnc_port_w3d_smudge_release(void *) {}
extern "C" void cnc_port_w3d_smudge_reacquire(void *) {}
extern "C" void *cnc_port_projected_shadow_dtor_c1(void *self) { return self; }
extern "C" void *cnc_port_projected_shadow_dtor_c2(void *self) { return self; }
extern "C" void *cnc_port_water_ctor_c1(void *self) { return self; }
extern "C" void *cnc_port_water_ctor_c2(void *self) { return self; }
extern "C" void *cnc_port_water_dtor_c1(void *self) { return self; }
extern "C" void *cnc_port_water_dtor_c2(void *self) { return self; }
extern "C" int cnc_port_water_init(void *, float, float, float, void *, int) { return 0; }
extern "C" void cnc_port_water_reset(void *) {}
extern "C" void cnc_port_water_load(void *) {}
extern "C" void cnc_port_water_update(void *) {}
extern "C" void cnc_port_water_enable_grid(void *, bool) {}
extern "C" void cnc_port_water_update_map_overrides(void *) {}
extern "C" float cnc_port_water_get_height(void *, float, float) { return 0.0f; }
extern "C" void cnc_port_water_release(void *) {}
extern "C" void cnc_port_water_reacquire(void *) {}
extern "C" void cnc_port_water_set_grid_height_clamps(void *, float, float) {}
extern "C" void cnc_port_water_add_velocity(void *, float, float, float, float) {}
extern "C" void cnc_port_water_change_grid_height(void *, float, float, float) {}
extern "C" void cnc_port_water_set_grid_change_attenuation(void *, float, float, float, float) {}
extern "C" void cnc_port_water_set_grid_transform_values(void *, float, float, float, float) {}
extern "C" void cnc_port_water_set_grid_transform_matrix(void *, const void *) {}
extern "C" void cnc_port_water_get_grid_transform(void *, void *) {}
extern "C" void cnc_port_water_set_grid_resolution(void *, float, float, float) {}
extern "C" void cnc_port_water_get_grid_resolution(void *, float *grid_cells_x, float *grid_cells_y, float *cell_size)
{
	if (grid_cells_x != nullptr) {
		*grid_cells_x = 0.0f;
	}
	if (grid_cells_y != nullptr) {
		*grid_cells_y = 0.0f;
	}
	if (cell_size != nullptr) {
		*cell_size = 0.0f;
	}
}
extern "C" void cnc_port_water_replace_skybox_texture(void *, const void *, const void *) {}
extern "C" void cnc_port_projected_shadow_queue_decal(void *, void *) {}
extern "C" void cnc_port_projected_shadow_flush_decals(void *, void *, int) {}
extern "C" void *cnc_port_projected_shadow_create_decal(void *, void *) { return nullptr; }
extern "C" void cnc_port_terrain_tracks_release(void *) {}
extern "C" void cnc_port_terrain_tracks_reacquire(void *) {}
extern "C" void cnc_port_terrain_tracks_flush(void *) {}
extern "C" void *cnc_port_terrain_tracks_ctor_c1(void *self) { return self; }
extern "C" void *cnc_port_terrain_tracks_dtor_c1(void *self) { return self; }
extern "C" void cnc_port_terrain_tracks_init(void *, void *) {}
extern "C" void cnc_port_terrain_tracks_reset(void *) {}
extern "C" void cnc_port_terrain_tracks_set_detail(void *) {}
extern "C" int cnc_port_game_logic_is_paused(void *) { return 0; }
extern "C" const void *cnc_port_ai_state_goal_path_position(const void *, int) { return nullptr; }
extern "C" int cnc_port_partition_geom_collides(const void *, const void *, const void *, float, const void *, const void *, float) { return 0; }
extern "C" int cnc_port_partition_prop_shroud_status(const void *, int, const void *) { return 0; }
extern "C" void cnc_port_partition_restore_fogged_cells(void *, const void *, bool) {}
extern "C" void *cnc_port_partition_iterate_objects_in_range(void *, const void *, float, int, void *, int) { return nullptr; }
extern "C" void cnc_port_partition_process_pending_undo_shroud(void *) {}
extern "C" void cnc_port_partition_store_fogged_cells(const void *, void *, bool) {}
extern "C" int cnc_port_ai_update_waypoint_goal_path_size(const void *) { return 0; }
extern "C" void cnc_port_w3d_model_draw_best_model_name_for_wb(void *, const void *, const void *) {}
extern "C" const void *cnc_port_thing_get_template(const void *) { return nullptr; }
extern "C" void cnc_port_thing_set_position(void *, const void *) {}
extern "C" void cnc_port_thing_set_orientation(void *, float) {}
extern "C" unsigned int cnc_port_drawable_get_id(const void *) { return 0; }
extern "C" float cnc_port_object_vision_range(const void *) { return 0.0f; }
extern "C" int cnc_port_object_relationship(const void *, const void *) { return 1; }
extern "C" int cnc_port_object_is_locally_controlled(const void *) { return 0; }
extern "C" void *cnc_port_object_exit_interface(const void *) { return nullptr; }
extern "C" void cnc_port_object_attempt_damage(void *, void *) {}
extern "C" void cnc_port_object_friend_notify_boundary(void *) {}
extern "C" void cnc_port_object_update_values_from_map(void *, void *) {}
extern "C" void cnc_port_object_friend_prepare_boundary(void *) {}
extern "C" int cnc_port_pathfinder_is_point_on_wall(void *, const void *) { return 0; }
extern "C" void cnc_port_pathfinder_change_bridge_state(void *, int, bool) {}
extern "C" void cnc_port_pathfinder_force_map_recalculation(void *) {}
extern "C" int cnc_port_pathfinder_add_bridge(void *, void *) { return 0; }
extern "C" void *cnc_port_bridge_behavior_interface(void *) { return nullptr; }
extern "C" void *cnc_port_bridge_tower_behavior_interface(void *) { return nullptr; }
extern "C" void cnc_port_game_logic_destroy_object(void *, void *) {}
extern "C" void *cnc_port_game_logic_get_first_object(void *) { return nullptr; }
