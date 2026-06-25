#pragma once

#include "Common/AsciiString.h"
#include "GameClient/Color.h"

class GlobalData
{
public:
	GlobalData() : m_xResolution(800), m_yResolution(600), m_userDataDir("./") {}

	const AsciiString &getPath_UserData() const { return m_userDataDir; }
	void setPath_UserData(const AsciiString &path) { m_userDataDir = path; }

	Int m_xResolution;
	Int m_yResolution;
	AsciiString m_modBIG;
	AsciiString m_modDir;

private:
	AsciiString m_userDataDir;
};

extern GlobalData *TheGlobalData;
