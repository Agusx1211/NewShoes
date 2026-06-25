#pragma once

#include "Common/AsciiString.h"
#include "GameClient/Color.h"

class GlobalData
{
public:
	GlobalData() :
		m_xResolution(800),
		m_yResolution(600),
		m_maxCameraHeight(300.0f),
		m_minCameraHeight(100.0f),
		m_buildMapCache(FALSE),
		m_firewallBehavior(0),
		m_firewallSendDelay(FALSE),
		m_firewallPortOverride(0),
		m_firewallPortAllocationDelta(0),
		m_networkFPSHistoryLength(30),
		m_networkLatencyHistoryLength(200),
		m_networkCushionHistoryLength(10),
		m_userDataDir("./")
	{
	}

	const AsciiString &getPath_UserData() const { return m_userDataDir; }
	void setPath_UserData(const AsciiString &path) { m_userDataDir = path; }

	Int m_xResolution;
	Int m_yResolution;
	Real m_maxCameraHeight;
	Real m_minCameraHeight;
	Bool m_buildMapCache;
	UnsignedInt m_firewallBehavior;
	Bool m_firewallSendDelay;
	UnsignedInt m_firewallPortOverride;
	Short m_firewallPortAllocationDelta;
	UnsignedInt m_networkFPSHistoryLength;
	UnsignedInt m_networkLatencyHistoryLength;
	UnsignedInt m_networkCushionHistoryLength;
	AsciiString m_modBIG;
	AsciiString m_modDir;

private:
	AsciiString m_userDataDir;
};

extern GlobalData *TheGlobalData;
#define TheWritableGlobalData TheGlobalData
