#pragma once

#ifndef __INI_H_
#define __INI_H_

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cmath>
#include <strings.h>

#include "Common/AsciiString.h"
#include "Common/GameCommon.h"
#include "GameClient/Color.h"

class INI;
class Xfer;
enum ScienceType : int;

typedef void (*INIFieldParseProc)(INI *ini, void *instance, void *store, const void *userData);
typedef const char* ConstCharPtr;
typedef const ConstCharPtr* ConstCharPtrArray;

struct LookupListRec
{
	const char *name;
	Int value;
};
typedef const LookupListRec *ConstLookupListRecArray;

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
	INI_UNKNOWN_ERROR,
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

class MultiIniFieldParse
{
private:
	enum { MAX_MULTI_FIELDS = 16 };

	const FieldParse *m_fieldParse[MAX_MULTI_FIELDS];
	UnsignedInt m_extraOffset[MAX_MULTI_FIELDS];
	Int m_count;

public:
	MultiIniFieldParse() : m_fieldParse(), m_extraOffset(), m_count(0) {}

	void add(const FieldParse *fieldParse, UnsignedInt extraOffset = 0)
	{
		if (m_count >= MAX_MULTI_FIELDS) {
			throw INI_INVALID_DATA;
		}
		m_fieldParse[m_count] = fieldParse;
		m_extraOffset[m_count] = extraOffset;
		++m_count;
	}

	Int getCount() const { return m_count; }
	const FieldParse *getNthFieldParse(Int index) const { return m_fieldParse[index]; }
	UnsignedInt getNthExtraOffset(Int index) const { return m_extraOffset[index]; }
};

typedef void (*BuildMultiIniFieldProc)(MultiIniFieldParse &parse);

class INI
{
public:
	INI() : m_loadType(INI_LOAD_OVERWRITE) {}

	void load(AsciiString, INILoadType loadType, Xfer *) { m_loadType = loadType; }
	void loadDirectory(AsciiString, Bool, INILoadType loadType, Xfer *) { m_loadType = loadType; }
	void initFromINI(void *, const FieldParse *) {}
	void initFromINIMulti(void *, const MultiIniFieldParse &) {}
	void initFromINIMultiProc(void *what, BuildMultiIniFieldProc proc)
	{
		MultiIniFieldParse parse;
		if (proc != nullptr) {
			proc(parse);
		}
		initFromINIMulti(what, parse);
	}
	AsciiString getFilename() const { return AsciiString(""); }
	INILoadType getLoadType() const { return m_loadType; }
	UnsignedInt getLineNum() const { return 0; }
	const char *getSeps() const { return m_seps; }
	const char *getSepsColon() const { return m_sepsColon; }
	const char *getNextToken(const char *seps = nullptr)
	{
		const char *token = std::strtok(nullptr, seps != nullptr ? seps : getSeps());
		if (token == nullptr) {
			throw INI_INVALID_DATA;
		}
		return token;
	}
	const char *getNextTokenOrNull(const char *seps = nullptr)
	{
		return std::strtok(nullptr, seps != nullptr ? seps : getSeps());
	}
	const char *getNextSubToken(const char *expected)
	{
		const char *token = getNextToken(getSepsColon());
		if (expected == nullptr || strcasecmp(token, expected) != 0) {
			throw INI_INVALID_DATA;
		}
		return getNextToken(getSepsColon());
	}
	AsciiString getNextAsciiString() { return AsciiString(getNextToken()); }
	AsciiString getNextQuotedAsciiString() { return AsciiString(getNextToken()); }

	static void parseLanguageDefinition(INI *ini);
	static void parseWeatherDefinition(INI *ini);
	static void parseHeaderTemplateDefinition(INI *ini);
	static void parseAnim2DDefinition(INI *ini);
	static void parseAudioEventDefinition(INI *ini);
	static void parseDialogDefinition(INI *ini);
	static void parseMusicTrackDefinition(INI *ini);
	static void parseWaterSettingDefinition(INI *ini);
	static void parseWaterTransparencyDefinition(INI *ini);
	static void parseFXListDefinition(INI *ini);
	static void parseMappedImageDefinition(INI *ini);
	static void parseMultiplayerSettingsDefinition(INI *ini);
	static void parseMultiplayerColorDefinition(INI *ini);
	static void parseMultiplayerStartingMoneyChoiceDefinition(INI *ini);
	static void parseVideoDefinition(INI *ini);
	static void parseMiscAudio(INI *ini);
	static void parseControlBarResizerDefinition(INI *ini);
	static void parseCredits(INI *ini);
	static void parseShellMenuSchemeDefinition(INI *ini);
	static void parseChallengeModeDefinition(INI *ini);
	static void parseWindowTransitions(INI *ini);
	static void parseMetaMapDefinition(INI *ini);
	static void parseEvaEvent(INI *ini);
	static void parseAudioSettingsDefinition(INI *ini);
	static void parseScienceDefinition(INI *ini);
	static void parseSpecialPowerDefinition(INI *ini);
	static void parsePlayerTemplateDefinition(INI *ini);
	static void parseCommandButtonDefinition(INI *ini);
	static void parseCampaignDefinition(INI *ini);
	static void parseCommandSetDefinition(INI *ini);
	static void parseControlBarSchemeDefinition(INI *ini);
	static void parseDamageFXDefinition(INI *ini);
	static void parseDrawGroupNumberDefinition(INI *ini);
	static void parseInGameUIDefinition(INI *ini);
	static void parseMapDataDefinition(INI *ini);
	static void parseMouseCursorDefinition(INI *ini);
	static void parseMouseDefinition(INI *ini);
	static void parseCrateTemplateDefinition(INI *ini);
	static void parseTerrainDefinition(INI *ini);
	static void parseTerrainBridgeDefinition(INI *ini);
	static void parseTerrainRoadDefinition(INI *ini);
	static void parseUpgradeDefinition(INI *ini);

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
		throw INI_INVALID_DATA;
	}

	static Int scanLookupList(const char *token, ConstLookupListRecArray lookupList)
	{
		if (token == nullptr || lookupList == nullptr || lookupList[0].name == nullptr) {
			throw INI_INVALID_NAME_LIST;
		}
		for (const LookupListRec *lookup = &lookupList[0]; lookup->name != nullptr; ++lookup) {
			if (strcasecmp(token, lookup->name) == 0) {
				return lookup->value;
			}
		}
		throw INI_INVALID_DATA;
	}

	static Int scanInt(const char *token)
	{
		Int value = 0;
		if (token == nullptr || std::sscanf(token, "%d", &value) != 1) {
			throw INI_INVALID_DATA;
		}
		return value;
	}

	static UnsignedInt scanUnsignedInt(const char *token)
	{
		UnsignedInt value = 0;
		if (token == nullptr || std::sscanf(token, "%u", &value) != 1) {
			throw INI_INVALID_DATA;
		}
		return value;
	}

	static Bool scanBool(const char *token)
	{
		return token != nullptr &&
			(strcasecmp(token, "yes") == 0 || strcasecmp(token, "true") == 0 || std::atoi(token) != 0);
	}

	static Real scanReal(const char *token)
	{
		Real value = 0.0f;
		if (token == nullptr || std::sscanf(token, "%f", &value) != 1) {
			throw INI_INVALID_DATA;
		}
		return value;
	}

	static Real scanPercentToReal(const char *token)
	{
		return scanReal(token) / 100.0f;
	}

	static void parseUnsignedByte(INI *ini, void *, void *store, const void *)
	{
		if (store != nullptr) {
			*static_cast<UnsignedByte *>(store) =
				static_cast<UnsignedByte>(scanUnsignedInt(ini != nullptr ? ini->getNextToken() : nullptr));
		}
	}

	static void parseShort(INI *ini, void *, void *store, const void *)
	{
		if (store != nullptr) {
			*static_cast<Short *>(store) = static_cast<Short>(scanInt(ini != nullptr ? ini->getNextToken() : nullptr));
		}
	}

	static void parseUnsignedShort(INI *ini, void *, void *store, const void *)
	{
		if (store != nullptr) {
			*static_cast<UnsignedShort *>(store) =
				static_cast<UnsignedShort>(scanUnsignedInt(ini != nullptr ? ini->getNextToken() : nullptr));
		}
	}

	static void parseAsciiString(INI *ini, void *, void *store, const void *)
	{
		if (store != nullptr) {
			*static_cast<AsciiString *>(store) = ini != nullptr ? ini->getNextAsciiString() : AsciiString("");
		}
	}

	static void parseQuotedAsciiString(INI *ini, void *, void *store, const void *)
	{
		if (store != nullptr) {
			*static_cast<AsciiString *>(store) = ini != nullptr ? ini->getNextQuotedAsciiString() : AsciiString("");
		}
	}

	static void parseAsciiStringVectorAppend(INI *, void *, void *, const void *) {}
	static void parseDamageTypeFlags(INI *, void *, void *, const void *) {}
	static void parseThingTemplate(INI *, void *, void *, const void *) {}
	static void parseUpgradeTemplate(INI *, void *, void *, const void *) {}
	static void parseSpecialPowerTemplate(INI *, void *, void *, const void *) {}
	static void parseWeaponTemplate(INI *, void *, void *, const void *) {}

	static void parseInt(INI *ini, void *, void *store, const void *)
	{
		if (store != nullptr) {
			*static_cast<Int *>(store) = scanInt(ini != nullptr ? ini->getNextToken() : nullptr);
		}
	}

	static void parseUnsignedInt(INI *ini, void *, void *store, const void *)
	{
		if (store != nullptr) {
			*static_cast<UnsignedInt *>(store) = scanUnsignedInt(ini != nullptr ? ini->getNextToken() : nullptr);
		}
	}

	static void parseIndexList(INI *ini, void *, void *store, const void *userData)
	{
		if (store != nullptr) {
			*static_cast<Int *>(store) = scanIndexList(
				ini != nullptr ? ini->getNextToken() : nullptr,
				static_cast<ConstCharPtrArray>(userData));
		}
	}

	static void parseDurationReal(INI *ini, void *, void *store, const void *)
	{
		if (store != nullptr) {
			const Real milliseconds = scanReal(ini != nullptr ? ini->getNextToken() : nullptr);
			*static_cast<Real *>(store) = ConvertDurationFromMsecsToFrames(milliseconds);
		}
	}

	static void parseDurationUnsignedInt(INI *ini, void *, void *store, const void *)
	{
		if (store != nullptr) {
			const UnsignedInt milliseconds = scanUnsignedInt(ini != nullptr ? ini->getNextToken() : nullptr);
			*static_cast<UnsignedInt *>(store) =
				static_cast<UnsignedInt>(std::ceil(ConvertDurationFromMsecsToFrames(static_cast<Real>(milliseconds))));
		}
	}

	static void parseDurationUnsignedShort(INI *ini, void *, void *store, const void *)
	{
		if (store != nullptr) {
			const UnsignedInt milliseconds = scanUnsignedInt(ini != nullptr ? ini->getNextToken() : nullptr);
			*static_cast<UnsignedShort *>(store) =
				static_cast<UnsignedShort>(std::ceil(ConvertDurationFromMsecsToFrames(static_cast<Real>(milliseconds))));
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

	static void parseVelocityReal(INI *ini, void *, void *store, const void *)
	{
		if (store != nullptr) {
			*static_cast<Real *>(store) =
				ConvertVelocityInSecsToFrames(scanReal(ini != nullptr ? ini->getNextToken() : nullptr));
		}
	}

	static void parsePercentToReal(INI *ini, void *, void *store, const void *)
	{
		if (store != nullptr) {
			*static_cast<Real *>(store) = scanPercentToReal(ini != nullptr ? ini->getNextToken() : nullptr);
		}
	}

	static void parseCoord2D(INI *ini, void *, void *store, const void *)
	{
		if (store != nullptr) {
			Coord2D *coord = static_cast<Coord2D *>(store);
			coord->x = scanReal(ini != nullptr ? ini->getNextSubToken("X") : nullptr);
			coord->y = scanReal(ini != nullptr ? ini->getNextSubToken("Y") : nullptr);
		}
	}

	static void parseCoord3D(INI *ini, void *, void *store, const void *)
	{
		if (store != nullptr) {
			Coord3D *coord = static_cast<Coord3D *>(store);
			coord->x = scanReal(ini != nullptr ? ini->getNextSubToken("X") : nullptr);
			coord->y = scanReal(ini != nullptr ? ini->getNextSubToken("Y") : nullptr);
			coord->z = scanReal(ini != nullptr ? ini->getNextSubToken("Z") : nullptr);
		}
	}

	static void parseICoord2D(INI *ini, void *, void *store, const void *)
	{
		if (store != nullptr) {
			ICoord2D *coord = static_cast<ICoord2D *>(store);
			coord->x = scanInt(ini != nullptr ? ini->getNextSubToken("X") : nullptr);
			coord->y = scanInt(ini != nullptr ? ini->getNextSubToken("Y") : nullptr);
		}
	}

	static void parseLookupList(INI *ini, void *, void *store, const void *userData)
	{
		if (store != nullptr) {
			*static_cast<Int *>(store) = scanLookupList(
				ini != nullptr ? ini->getNextToken() : nullptr,
				static_cast<ConstLookupListRecArray>(userData));
		}
	}

	static void parseAndTranslateLabel(INI *ini, void *, void *store, const void *)
	{
		if (store != nullptr) {
			UnicodeString translated;
			translated.translate(ini != nullptr ? ini->getNextAsciiString() : AsciiString::TheEmptyString);
			*static_cast<UnicodeString *>(store) = translated;
		}
	}

	static ScienceType scanScience(const char *token);
	static void parseScience(INI *ini, void *, void *store, const void *);
	static void parseScienceVector(INI *, void *, void *, const void *) {}
	static void parseAngleReal(INI *ini, void *, void *store, const void *);
	static void parseFXList(INI *ini, void *, void *store, const void *);
	static void parseGameClientRandomVariable(INI *ini, void *, void *store, const void *);
	static void parseParticleSystemTemplate(INI *ini, void *instance, void *store, const void *userData);
	static void parseObjectCreationList(INI *ini, void *, void *store, const void *);
	static void parseMappedImage(INI *ini, void *instance, void *store, const void *userData);
	static void parseAnim2DTemplate(INI *ini, void *instance, void *store, const void *userData);
	static void parseAudioEventRTS(INI *ini, void *instance, void *store, const void *userData);
	static void parseSoundsList(INI *ini, void *instance, void *store, const void *userData);

	static void parseBitString32(INI *ini, void *, void *store, const void *userData)
	{
		ConstCharPtrArray flagList = static_cast<ConstCharPtrArray>(userData);
		UnsignedInt *bits = static_cast<UnsignedInt *>(store);
		if (ini == nullptr || bits == nullptr || flagList == nullptr || flagList[0] == nullptr) {
			throw INI_INVALID_NAME_LIST;
		}

		Bool foundNormal = FALSE;
		Bool foundAddOrSub = FALSE;
		for (const char *token = ini->getNextTokenOrNull(); token != nullptr; token = ini->getNextTokenOrNull()) {
			if (strcasecmp(token, "NONE") == 0) {
				if (foundNormal || foundAddOrSub) {
					throw INI_INVALID_NAME_LIST;
				}
				*bits = 0;
				break;
			}

			if (token[0] == '+') {
				if (foundNormal) {
					throw INI_INVALID_NAME_LIST;
				}
				*bits |= (1 << scanIndexList(token + 1, flagList));
				foundAddOrSub = TRUE;
			} else if (token[0] == '-') {
				if (foundNormal) {
					throw INI_INVALID_NAME_LIST;
				}
				*bits &= ~(1 << scanIndexList(token + 1, flagList));
				foundAddOrSub = TRUE;
			} else {
				if (foundAddOrSub) {
					throw INI_INVALID_NAME_LIST;
				}
				if (!foundNormal) {
					*bits = 0;
				}
				*bits |= (1 << scanIndexList(token, flagList));
				foundNormal = TRUE;
			}
		}
	}

	static void parseBitString8(INI *ini, void *instance, void *store, const void *userData)
	{
		UnsignedInt bits = 0;
		parseBitString32(ini, instance, &bits, userData);
		if ((bits & 0xffffff00) != 0) {
			throw INI_INVALID_DATA;
		}
		if (store != nullptr) {
			*static_cast<Byte *>(store) = static_cast<Byte>(bits);
		}
	}

	static void parseRGBColor(INI *ini, void *, void *store, const void *)
	{
		static const char *names[3] = { "R", "G", "B" };
		Int colors[3];
		for (Int i = 0; i < 3; ++i) {
			colors[i] = scanInt(ini != nullptr ? ini->getNextSubToken(names[i]) : nullptr);
			if (colors[i] < 0 || colors[i] > 255) {
				throw INI_INVALID_DATA;
			}
		}

		if (store != nullptr) {
			RGBColor *color = static_cast<RGBColor *>(store);
			color->red = static_cast<Real>(colors[0]) / 255.0f;
			color->green = static_cast<Real>(colors[1]) / 255.0f;
			color->blue = static_cast<Real>(colors[2]) / 255.0f;
		}
	}

	static void parseRGBAColorInt(INI *ini, void *, void *store, const void *)
	{
		static const char *names[4] = { "R", "G", "B", "A" };
		Int colors[4];
		for (Int i = 0; i < 4; ++i) {
			const char *token = ini != nullptr ? ini->getNextTokenOrNull(ini->getSepsColon()) : nullptr;
			if (token == nullptr) {
				if (i < 3) {
					throw INI_INVALID_DATA;
				}
				colors[i] = 255;
			} else {
				if (strcasecmp(token, names[i]) != 0) {
					throw INI_INVALID_DATA;
				}
				colors[i] = scanInt(ini->getNextToken(ini->getSepsColon()));
			}
			if (colors[i] < 0 || colors[i] > 255) {
				throw INI_INVALID_DATA;
			}
		}

		if (store != nullptr) {
			RGBAColorInt *color = static_cast<RGBAColorInt *>(store);
			color->red = colors[0];
			color->green = colors[1];
			color->blue = colors[2];
			color->alpha = colors[3];
		}
	}

	static void parseColorInt(INI *ini, void *instance, void *store, const void *userData)
	{
		RGBAColorInt color;
		parseRGBAColorInt(ini, instance, &color, userData);
		if (store != nullptr) {
			*static_cast<Color *>(store) = GameMakeColor(
				static_cast<UnsignedByte>(color.red),
				static_cast<UnsignedByte>(color.green),
				static_cast<UnsignedByte>(color.blue),
				static_cast<UnsignedByte>(color.alpha));
		}
	}

private:
	INILoadType m_loadType;
	const char *m_seps = " \t\r\n=";
	const char *m_sepsColon = " \t\r\n=:";
};

#endif
