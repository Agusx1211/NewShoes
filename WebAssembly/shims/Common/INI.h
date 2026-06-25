#pragma once

#ifndef __INI_H_
#define __INI_H_

#include "Common/AsciiString.h"

class Xfer;

enum INILoadType
{
	INI_LOAD_INVALID,
	INI_LOAD_OVERWRITE,
	INI_LOAD_CREATE_OVERRIDES,
	INI_LOAD_MULTIFILE
};

class INI
{
public:
	void load(AsciiString, INILoadType, Xfer *) {}
	void loadDirectory(AsciiString, Bool, INILoadType, Xfer *) {}
	const char *getNextToken() { return ""; }
};

#endif
