#pragma once

#include "Common/AsciiString.h"
#include "Common/GameType.h"
#include "Common/Money.h"
#include "GameClient/Color.h"

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
		m_defaultIP(0),
		m_useAlternateMouse(FALSE),
		m_doubleClickAttackMove(FALSE),
		m_rightMouseAlwaysScrolls(FALSE),
		m_allowExitOutOfMovies(FALSE),
		m_animateWindows(TRUE),
		m_preloadEverything(FALSE),
		m_timeOfDay(TIME_OF_DAY_AFTERNOON),
		m_downwindAngle(-0.785f),
		m_scriptDebug(FALSE),
		m_winCursors(TRUE),
		m_useTreeSway(TRUE),
		m_useDrawModuleLOD(FALSE),
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
		m_maxLineBuildObjects(50),
		m_playIntro(TRUE),
		m_playSizzle(TRUE),
		m_afterIntro(FALSE),
		m_breakTheMovie(FALSE),
		m_netMinPlayers(1),
		m_exeCRC(0),
		m_iniCRC(0),
		m_buildMapCache(FALSE),
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
	UnsignedInt m_defaultIP;
	Bool m_useAlternateMouse;
	Bool m_doubleClickAttackMove;
	Bool m_rightMouseAlwaysScrolls;
	Bool m_allowExitOutOfMovies;
	Bool m_animateWindows;
	Bool m_preloadEverything;
	TimeOfDay m_timeOfDay;
	Real m_downwindAngle;
	Bool m_scriptDebug;
	Bool m_winCursors;
	Bool m_useTreeSway;
	Bool m_useDrawModuleLOD;
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
	Int m_maxLineBuildObjects;
	Bool m_playIntro;
	Bool m_playSizzle;
	Bool m_afterIntro;
	Bool m_breakTheMovie;
	Int m_netMinPlayers;
	UnsignedInt m_exeCRC;
	UnsignedInt m_iniCRC;
	Bool m_buildMapCache;
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
	AsciiString m_modBIG;
	AsciiString m_modDir;

private:
	AsciiString m_userDataDir;
};

extern GlobalData *TheGlobalData;
#define TheWritableGlobalData TheGlobalData
