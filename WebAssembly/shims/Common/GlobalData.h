#pragma once

#include "Common/AsciiString.h"

class GlobalData
{
public:
	GlobalData() : m_userDataDir("./") {}

	const AsciiString &getPath_UserData() const { return m_userDataDir; }
	void setPath_UserData(const AsciiString &path) { m_userDataDir = path; }

	AsciiString m_modBIG;
	AsciiString m_modDir;

private:
	AsciiString m_userDataDir;
};

extern GlobalData *TheGlobalData;
