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
		m_windowed(FALSE),
		m_useAlternateMouse(FALSE),
		m_doubleClickAttackMove(FALSE),
		m_rightMouseAlwaysScrolls(FALSE),
		m_allowExitOutOfMovies(FALSE),
		m_horizontalScrollSpeedFactor(1.0f),
		m_verticalScrollSpeedFactor(1.0f),
		m_keyboardScrollFactor(1.0f),
		m_saveCameraInReplay(FALSE),
		m_TiVOFastMode(FALSE),
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
	Bool m_windowed;
	Bool m_useAlternateMouse;
	Bool m_doubleClickAttackMove;
	Bool m_rightMouseAlwaysScrolls;
	Bool m_allowExitOutOfMovies;
	Real m_horizontalScrollSpeedFactor;
	Real m_verticalScrollSpeedFactor;
	Real m_keyboardScrollFactor;
	Bool m_saveCameraInReplay;
	Bool m_TiVOFastMode;
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
	UnsignedInt m_networkDisconnectTime;
	UnsignedInt m_networkPlayerTimeoutTime;
	UnsignedInt m_networkDisconnectScreenNotifyTime;
	Money m_defaultStartingCash;
	AsciiString m_modBIG;
	AsciiString m_modDir;

private:
	AsciiString m_userDataDir;
};

extern GlobalData *TheGlobalData;
#define TheWritableGlobalData TheGlobalData
