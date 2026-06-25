#pragma once

#ifndef _GLOBALDATA_H_
#define _GLOBALDATA_H_

#include "Common/AsciiString.h"
#include "Common/GameType.h"
#include "Common/Money.h"
#include "GameClient/Color.h"

enum AIDebugOptions : int;
enum BodyDamageType : int;
class WeaponBonusSet;

class GlobalData
{
public:
	GlobalData() :
		m_xResolution(800),
		m_yResolution(600),
		m_maxCameraHeight(300.0f),
		m_minCameraHeight(100.0f),
		m_framesPerSecondLimit(0),
		m_useFpsLimit(FALSE),
		m_windowed(FALSE),
		m_ammoPipWorldOffset(),
		m_containerPipWorldOffset(),
		m_ammoPipScreenOffset(),
		m_containerPipScreenOffset(),
		m_scriptOverrideInfantryLightScale(-1.0f),
		m_defaultIP(0),
		m_useAlternateMouse(FALSE),
		m_doubleClickAttackMove(FALSE),
		m_rightMouseAlwaysScrolls(FALSE),
		m_allowExitOutOfMovies(FALSE),
		m_animateWindows(TRUE),
		m_preloadEverything(FALSE),
		m_preloadAssets(FALSE),
		m_timeOfDay(TIME_OF_DAY_AFTERNOON),
		m_weather(WEATHER_NORMAL),
		m_forceModelsToFollowTimeOfDay(TRUE),
		m_forceModelsToFollowWeather(TRUE),
		m_downwindAngle(-0.785f),
		m_groundStiffness(0.5f),
		m_structureStiffness(0.5f),
		m_gravity(-1.0f),
		m_partitionCellSize(0.0f),
		m_historicDamageLimit(0),
		m_levelGainAnimationDisplayTimeInSeconds(0.0f),
		m_levelGainAnimationZRisePerSecond(0.0f),
		m_getHealedAnimationDisplayTimeInSeconds(0.0f),
		m_getHealedAnimationZRisePerSecond(0.0f),
		m_scriptDebug(FALSE),
		m_debugAI(static_cast<AIDebugOptions>(0)),
		m_debugSupplyCenterPlacement(FALSE),
		m_debugAIObstacles(FALSE),
		m_particleEdit(FALSE),
		m_winCursors(TRUE),
		m_useTrees(TRUE),
		m_useTreeSway(TRUE),
		m_useDrawModuleLOD(FALSE),
		m_useCloudMap(FALSE),
		m_useLightMap(FALSE),
		m_useShadowVolumes(FALSE),
		m_horizontalScrollSpeedFactor(1.0f),
		m_verticalScrollSpeedFactor(1.0f),
		m_keyboardScrollFactor(1.0f),
		m_keyboardCameraRotateSpeed(1.0f),
		m_saveCameraInReplay(FALSE),
		m_TiVOFastMode(FALSE),
		m_useFX(TRUE),
		m_stealthFriendlyOpacity(0.5f),
		m_particleScale(1.0f),
		m_maxParticleCount(5000),
		m_maxFieldParticleCount(100),
		m_baseValuePerSupplyBox(75),
		m_defaultStructureRubbleHeight(1.0f),
		m_movementPenaltyDamageState(static_cast<BodyDamageType>(2)),
		m_standardMinefieldDensity(0.01f),
		m_standardMinefieldDistance(40.0f),
		m_maxLineBuildObjects(50),
		m_groupMoveClickToGatherFactor(1.0f),
		m_shroudAlpha(0),
		m_clearAlpha(255),
		m_unlookPersistDuration(30),
		m_playIntro(TRUE),
		m_playSizzle(TRUE),
		m_afterIntro(FALSE),
		m_breakTheMovie(FALSE),
		m_netMinPlayers(1),
		m_exeCRC(0),
		m_iniCRC(0),
		m_buildMapCache(FALSE),
		m_loadScreenRender(FALSE),
		m_playStats(-1),
		m_showClientPhysics(TRUE),
		m_showObjectHealth(FALSE),
		m_selectionFlashSaturationFactor(0.5f),
		m_selectionFlashHouseColor(FALSE),
		m_firewallBehavior(0),
		m_firewallSendDelay(FALSE),
		m_firewallPortOverride(0),
		m_firewallPortAllocationDelta(0),
		m_networkFPSHistoryLength(30),
		m_networkLatencyHistoryLength(200),
		m_networkCushionHistoryLength(10),
		m_networkRunAheadMetricsTime(2000),
		m_networkRunAheadSlack(10),
		m_networkDisconnectTime(5000),
		m_networkPlayerTimeoutTime(60000),
		m_networkDisconnectScreenNotifyTime(15000),
		m_shellMapName("Maps\\ShellMap1\\ShellMap1.map"),
		m_shellMapOn(TRUE),
		m_weaponBonusSet(nullptr),
		m_userDataDir("./")
	{
	}

	const AsciiString &getPath_UserData() const { return m_userDataDir; }
	void setPath_UserData(const AsciiString &path) { m_userDataDir = path; }

	Int m_xResolution;
	Int m_yResolution;
	Real m_maxCameraHeight;
	Real m_minCameraHeight;
	Int m_framesPerSecondLimit;
	Bool m_useFpsLimit;
	Bool m_windowed;
	Coord3D m_ammoPipWorldOffset;
	Coord3D m_containerPipWorldOffset;
	Coord2D m_ammoPipScreenOffset;
	Coord2D m_containerPipScreenOffset;
	Real m_scriptOverrideInfantryLightScale;
	UnsignedInt m_defaultIP;
	Bool m_useAlternateMouse;
	Bool m_doubleClickAttackMove;
	Bool m_rightMouseAlwaysScrolls;
	Bool m_allowExitOutOfMovies;
	Bool m_animateWindows;
	Bool m_preloadEverything;
	Bool m_preloadAssets;
	TimeOfDay m_timeOfDay;
	Weather m_weather;
	Bool m_forceModelsToFollowTimeOfDay;
	Bool m_forceModelsToFollowWeather;
	Real m_downwindAngle;
	Real m_groundStiffness;
	Real m_structureStiffness;
	Real m_gravity;
	Real m_partitionCellSize;
	UnsignedInt m_historicDamageLimit;
	AsciiString m_levelGainAnimationName;
	Real m_levelGainAnimationDisplayTimeInSeconds;
	Real m_levelGainAnimationZRisePerSecond;
	AsciiString m_getHealedAnimationName;
	Real m_getHealedAnimationDisplayTimeInSeconds;
	Real m_getHealedAnimationZRisePerSecond;
	Bool m_scriptDebug;
	AIDebugOptions m_debugAI;
	Bool m_debugSupplyCenterPlacement;
	Bool m_debugAIObstacles;
	Bool m_particleEdit;
	Bool m_winCursors;
	Bool m_useTrees;
	Bool m_useTreeSway;
	Bool m_useDrawModuleLOD;
	Bool m_useCloudMap;
	Bool m_useLightMap;
	Bool m_useShadowVolumes;
	Real m_horizontalScrollSpeedFactor;
	Real m_verticalScrollSpeedFactor;
	Real m_keyboardScrollFactor;
	Real m_keyboardCameraRotateSpeed;
	Bool m_saveCameraInReplay;
	Bool m_TiVOFastMode;
	Bool m_useFX;
	Real m_stealthFriendlyOpacity;
	Real m_particleScale;
	Int m_maxParticleCount;
	Int m_maxFieldParticleCount;
	Int m_baseValuePerSupplyBox;
	Real m_defaultStructureRubbleHeight;
	BodyDamageType m_movementPenaltyDamageState;
	Real m_standardMinefieldDensity;
	Real m_standardMinefieldDistance;
	Int m_maxLineBuildObjects;
	Real m_groupMoveClickToGatherFactor;
	UnsignedByte m_shroudAlpha;
	UnsignedByte m_clearAlpha;
	UnsignedInt m_unlookPersistDuration;
	Bool m_playIntro;
	Bool m_playSizzle;
	Bool m_afterIntro;
	Bool m_breakTheMovie;
	Int m_netMinPlayers;
	UnsignedInt m_exeCRC;
	UnsignedInt m_iniCRC;
	Bool m_buildMapCache;
	Bool m_loadScreenRender;
	Int m_playStats;
	Bool m_showClientPhysics;
	Bool m_showObjectHealth;
	Real m_selectionFlashSaturationFactor;
	Bool m_selectionFlashHouseColor;
	UnsignedInt m_firewallBehavior;
	Bool m_firewallSendDelay;
	UnsignedInt m_firewallPortOverride;
	Short m_firewallPortAllocationDelta;
	UnsignedInt m_networkFPSHistoryLength;
	UnsignedInt m_networkLatencyHistoryLength;
	UnsignedInt m_networkCushionHistoryLength;
	UnsignedInt m_networkRunAheadMetricsTime;
	UnsignedInt m_networkRunAheadSlack;
	UnsignedInt m_networkDisconnectTime;
	UnsignedInt m_networkPlayerTimeoutTime;
	UnsignedInt m_networkDisconnectScreenNotifyTime;
	Money m_defaultStartingCash;
	AsciiString m_mapName;
	AsciiString m_pendingFile;
	AsciiString m_initialFile;
	AsciiString m_shellMapName;
	Bool m_shellMapOn;
	AsciiString m_modBIG;
	AsciiString m_modDir;
	WeaponBonusSet *m_weaponBonusSet;

private:
	AsciiString m_userDataDir;
};

extern GlobalData *TheGlobalData;
#define TheWritableGlobalData TheGlobalData

#endif
