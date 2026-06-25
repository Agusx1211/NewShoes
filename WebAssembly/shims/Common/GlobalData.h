#pragma once

#include "Common/AsciiString.h"
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
		m_defaultIP(0),
		m_useAlternateMouse(FALSE),
		m_doubleClickAttackMove(FALSE),
		m_rightMouseAlwaysScrolls(FALSE),
		m_allowExitOutOfMovies(FALSE),
		m_animateWindows(TRUE),
		m_horizontalScrollSpeedFactor(1.0f),
		m_verticalScrollSpeedFactor(1.0f),
		m_keyboardScrollFactor(1.0f),
		m_keyboardCameraRotateSpeed(1.0f),
		m_saveCameraInReplay(FALSE),
		m_TiVOFastMode(FALSE),
		m_useFX(TRUE),
		m_particleScale(1.0f),
		m_maxParticleCount(5000),
		m_maxFieldParticleCount(100),
		m_baseValuePerSupplyBox(75),
		m_maxLineBuildObjects(50),
		m_netMinPlayers(1),
		m_exeCRC(0),
		m_iniCRC(0),
		m_buildMapCache(FALSE),
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
	UnsignedInt m_defaultIP;
	Bool m_useAlternateMouse;
	Bool m_doubleClickAttackMove;
	Bool m_rightMouseAlwaysScrolls;
	Bool m_allowExitOutOfMovies;
	Bool m_animateWindows;
	Real m_horizontalScrollSpeedFactor;
	Real m_verticalScrollSpeedFactor;
	Real m_keyboardScrollFactor;
	Real m_keyboardCameraRotateSpeed;
	Bool m_saveCameraInReplay;
	Bool m_TiVOFastMode;
	Bool m_useFX;
	Real m_particleScale;
	Int m_maxParticleCount;
	Int m_maxFieldParticleCount;
	Int m_baseValuePerSupplyBox;
	Int m_maxLineBuildObjects;
	Int m_netMinPlayers;
	UnsignedInt m_exeCRC;
	UnsignedInt m_iniCRC;
	Bool m_buildMapCache;
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
