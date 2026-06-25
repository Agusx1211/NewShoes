#pragma once

#ifndef __INI_H_
#define __INI_H_

#include <cstdlib>
#include <strings.h>

#include "Common/AsciiString.h"

class INI;
class Xfer;

typedef void (*INIFieldParseProc)(INI *ini, void *instance, void *store, const void *userData);
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
	INI_INVALID_DATA,
};

struct FieldParse
{
	const char *token;
	INIFieldParseProc parse;
	const void *userData;
	Int offset;

	inline void set(const char *t, INIFieldParseProc p, const void *u, Int o)
	{
		token = t;
		parse = p;
		userData = u;
		offset = o;
	}
};

class INI
{
public:
	INI() : m_loadType(INI_LOAD_OVERWRITE) {}

	void load(AsciiString, INILoadType loadType, Xfer *) { m_loadType = loadType; }
	void loadDirectory(AsciiString, Bool, INILoadType loadType, Xfer *) { m_loadType = loadType; }
	void initFromINI(void *, const FieldParse *) {}
	INILoadType getLoadType() const { return m_loadType; }
	const char *getNextToken() { return ""; }
	const char *getNextTokenOrNull(const char * = nullptr) { return nullptr; }
	AsciiString getNextAsciiString() { return AsciiString(getNextToken()); }
	AsciiString getNextQuotedAsciiString() { return AsciiString(getNextToken()); }

	static void parseLanguageDefinition(INI *ini);
	static void parseWeatherDefinition(INI *ini);

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

	static Int scanInt(const char *token)
	{
		return token != nullptr ? std::atoi(token) : 0;
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

	static void parseAsciiString(INI *ini, void *, void *store, const void *)
	{
		if (store != nullptr) {
			*static_cast<AsciiString *>(store) = ini != nullptr ? ini->getNextAsciiString() : AsciiString("");
		}
	}

	static void parseInt(INI *ini, void *, void *store, const void *)
	{
		if (store != nullptr) {
			*static_cast<Int *>(store) = scanInt(ini != nullptr ? ini->getNextToken() : nullptr);
		}
	}

	static void parseBool(INI *ini, void *, void *store, const void *)
	{
		if (store != nullptr) {
			*static_cast<Bool *>(store) = scanBool(ini != nullptr ? ini->getNextToken() : nullptr);
		}
	}

	static void parseReal(INI *ini, void *, void *store, const void *)
	{
		if (store != nullptr) {
			*static_cast<Real *>(store) = scanReal(ini != nullptr ? ini->getNextToken() : nullptr);
		}
	}

private:
	INILoadType m_loadType;
};

#endif
