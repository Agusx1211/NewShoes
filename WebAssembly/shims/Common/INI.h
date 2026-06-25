#pragma once

#ifndef __INI_H_
#define __INI_H_

#include <cstdlib>
#include <strings.h>

#include "Common/AsciiString.h"

class Xfer;

typedef const char* ConstCharPtr;
typedef const ConstCharPtr* ConstCharPtrArray;

enum INILoadType
{
	INI_LOAD_INVALID,
	INI_LOAD_OVERWRITE,
	INI_LOAD_CREATE_OVERRIDES,
	INI_LOAD_MULTIFILE
};

enum
{
	INI_INVALID_NAME_LIST = 1,
};

class INI
{
public:
	void load(AsciiString, INILoadType, Xfer *) {}
	void loadDirectory(AsciiString, Bool, INILoadType, Xfer *) {}
	const char *getNextToken() { return ""; }
	const char *getNextTokenOrNull(const char * = nullptr) { return nullptr; }

	static Int scanIndexList(const char *token, ConstCharPtrArray nameList)
	{
		if (token == nullptr || nameList == nullptr) {
			throw INI_INVALID_NAME_LIST;
		}
		for (Int index = 0; nameList[index] != nullptr; ++index) {
			if (strcasecmp(token, nameList[index]) == 0) {
				return index;
			}
		}
		throw INI_INVALID_NAME_LIST;
	}

	static Bool scanBool(const char *token)
	{
		return token != nullptr &&
			(strcasecmp(token, "yes") == 0 || strcasecmp(token, "true") == 0 || std::atoi(token) != 0);
	}

	static Real scanReal(const char *token)
	{
		return token != nullptr ? static_cast<Real>(std::atof(token)) : 0.0f;
	}
};

#endif
