#include "wasm_prerts_real.h"

#include "Common/INI.h"
#include "GameClient/Color.h"
#include "GameClient/Image.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <strings.h>

INI::INI()
{
	m_file = nullptr;
	m_readBufferNext = 0;
	m_readBufferUsed = 0;
	m_filename = "None";
	m_loadType = INI_LOAD_INVALID;
	m_lineNum = 0;
	m_seps = " \n\r\t=";
	m_sepsPercent = " \n\r\t=%%";
	m_sepsColon = " \n\r\t=:";
	m_sepsQuote = "\"\n=";
	m_blockEndToken = "END";
	m_endOfFile = FALSE;
	m_buffer[0] = 0;
}

INI::~INI()
{
}

void INI::load(AsciiString, INILoadType loadType, Xfer *)
{
	m_loadType = loadType;
}

void INI::initFromINI(void *, const FieldParse *)
{
}

const char *INI::getNextToken(const char *seps)
{
	const char *token = std::strtok(nullptr, seps != nullptr ? seps : getSeps());
	if (token == nullptr) {
		throw INI_INVALID_DATA;
	}
	return token;
}

const char *INI::getNextTokenOrNull(const char *seps)
{
	return std::strtok(nullptr, seps != nullptr ? seps : getSeps());
}

const char *INI::getNextSubToken(const char *expected)
{
	const char *token = getNextToken(getSepsColon());
	if (expected == nullptr || strcasecmp(token, expected) != 0) {
		throw INI_INVALID_DATA;
	}
	return getNextToken(getSepsColon());
}

AsciiString INI::getNextAsciiString()
{
	return AsciiString(getNextToken());
}

AsciiString INI::getNextQuotedAsciiString()
{
	return AsciiString(getNextToken());
}

Int INI::scanInt(const char *token)
{
	Int value = 0;
	if (token == nullptr || std::sscanf(token, "%d", &value) != 1) {
		throw INI_INVALID_DATA;
	}
	return value;
}

UnsignedInt INI::scanUnsignedInt(const char *token)
{
	UnsignedInt value = 0;
	if (token == nullptr || std::sscanf(token, "%u", &value) != 1) {
		throw INI_INVALID_DATA;
	}
	return value;
}

Real INI::scanReal(const char *token)
{
	Real value = 0.0f;
	if (token == nullptr || std::sscanf(token, "%f", &value) != 1) {
		throw INI_INVALID_DATA;
	}
	return value;
}

Bool INI::scanBool(const char *token)
{
	return token != nullptr &&
		(strcasecmp(token, "yes") == 0 || strcasecmp(token, "true") == 0 || std::atoi(token) != 0);
}

Int INI::scanIndexList(const char *token, ConstCharPtrArray names)
{
	if (token == nullptr || names == nullptr) {
		throw INI_INVALID_NAME_LIST;
	}
	for (Int index = 0; names[index] != nullptr; ++index) {
		if (strcasecmp(token, names[index]) == 0) {
			return index;
		}
	}
	throw INI_INVALID_DATA;
}

Int INI::scanLookupList(const char *token, ConstLookupListRecArray lookupList)
{
	if (token == nullptr || lookupList == nullptr) {
		throw INI_INVALID_NAME_LIST;
	}
	for (const LookupListRec *lookup = lookupList; lookup->name != nullptr; ++lookup) {
		if (strcasecmp(token, lookup->name) == 0) {
			return lookup->value;
		}
	}
	throw INI_INVALID_DATA;
}

void INI::parseAsciiString(INI *ini, void *, void *store, const void *)
{
	if (store != nullptr) {
		*static_cast<AsciiString *>(store) = ini != nullptr ? ini->getNextAsciiString() : AsciiString::TheEmptyString;
	}
}

void INI::parseInt(INI *ini, void *, void *store, const void *)
{
	if (store != nullptr) {
		*static_cast<Int *>(store) = scanInt(ini != nullptr ? ini->getNextToken() : nullptr);
	}
}

void INI::parseUnsignedInt(INI *ini, void *, void *store, const void *)
{
	if (store != nullptr) {
		*static_cast<UnsignedInt *>(store) = scanUnsignedInt(ini != nullptr ? ini->getNextToken() : nullptr);
	}
}

void INI::parseIndexList(INI *ini, void *, void *store, const void *userData)
{
	if (store != nullptr) {
		*static_cast<Int *>(store) = scanIndexList(
			ini != nullptr ? ini->getNextToken() : nullptr,
			static_cast<ConstCharPtrArray>(userData));
	}
}

void INI::parseLookupList(INI *ini, void *, void *store, const void *userData)
{
	if (store != nullptr) {
		*static_cast<Int *>(store) = scanLookupList(
			ini != nullptr ? ini->getNextToken() : nullptr,
			static_cast<ConstLookupListRecArray>(userData));
	}
}

void INI::parseBool(INI *ini, void *, void *store, const void *)
{
	if (store != nullptr) {
		*static_cast<Bool *>(store) = scanBool(ini != nullptr ? ini->getNextToken() : nullptr);
	}
}

void INI::parseReal(INI *ini, void *, void *store, const void *)
{
	if (store != nullptr) {
		*static_cast<Real *>(store) = scanReal(ini != nullptr ? ini->getNextToken() : nullptr);
	}
}

void INI::parseColorInt(INI *ini, void *, void *store, const void *)
{
	if (store != nullptr) {
		*static_cast<Color *>(store) = static_cast<Color>(scanUnsignedInt(ini != nullptr ? ini->getNextToken() : nullptr));
	}
}

void INI::parseMappedImage(INI *ini, void *, void *store, const void *)
{
	const char *token = ini != nullptr ? ini->getNextToken() : nullptr;
	if (store != nullptr && TheMappedImageCollection != nullptr) {
		*static_cast<const Image **>(store) =
			TheMappedImageCollection->findImageByName(AsciiString(token));
	}
}

void INI::parseRGBColor(INI *ini, void *, void *store, const void *)
{
	static const char *names[3] = { "R", "G", "B" };
	Int colors[3] = { 0, 0, 0 };
	for (Int index = 0; index < 3; ++index) {
		colors[index] = scanInt(ini != nullptr ? ini->getNextSubToken(names[index]) : nullptr);
	}

	if (store != nullptr) {
		RGBColor *color = static_cast<RGBColor *>(store);
		color->red = static_cast<Real>(colors[0]) / 255.0f;
		color->green = static_cast<Real>(colors[1]) / 255.0f;
		color->blue = static_cast<Real>(colors[2]) / 255.0f;
	}
}

void INI::parseRGBAColorInt(INI *ini, void *, void *store, const void *)
{
	static const char *names[4] = { "R", "G", "B", "A" };
	Int colors[4] = { 0, 0, 0, 255 };
	for (Int index = 0; index < 4; ++index) {
		colors[index] = scanInt(ini != nullptr ? ini->getNextSubToken(names[index]) : nullptr);
	}

	if (store != nullptr) {
		RGBAColorInt *color = static_cast<RGBAColorInt *>(store);
		color->red = colors[0];
		color->green = colors[1];
		color->blue = colors[2];
		color->alpha = colors[3];
	}
}

void INI::parseCoord2D(INI *ini, void *, void *store, const void *)
{
	if (store != nullptr) {
		Coord2D *coord = static_cast<Coord2D *>(store);
		coord->x = scanReal(ini != nullptr ? ini->getNextSubToken("X") : nullptr);
		coord->y = scanReal(ini != nullptr ? ini->getNextSubToken("Y") : nullptr);
	}
}

void INI::parseICoord2D(INI *ini, void *, void *store, const void *)
{
	if (store != nullptr) {
		ICoord2D *coord = static_cast<ICoord2D *>(store);
		coord->x = scanInt(ini != nullptr ? ini->getNextSubToken("X") : nullptr);
		coord->y = scanInt(ini != nullptr ? ini->getNextSubToken("Y") : nullptr);
	}
}

void INI::parseDurationReal(INI *ini, void *, void *store, const void *)
{
	if (store != nullptr) {
		*static_cast<Real *>(store) =
			ConvertDurationFromMsecsToFrames(scanReal(ini != nullptr ? ini->getNextToken() : nullptr));
	}
}

void INI::parseDurationUnsignedInt(INI *ini, void *, void *store, const void *)
{
	if (store != nullptr) {
		const UnsignedInt milliseconds = scanUnsignedInt(ini != nullptr ? ini->getNextToken() : nullptr);
		*static_cast<UnsignedInt *>(store) =
			static_cast<UnsignedInt>(std::ceil(ConvertDurationFromMsecsToFrames(static_cast<Real>(milliseconds))));
	}
}

void INI::parseDurationUnsignedShort(INI *ini, void *, void *store, const void *)
{
	if (store != nullptr) {
		const UnsignedInt milliseconds = scanUnsignedInt(ini != nullptr ? ini->getNextToken() : nullptr);
		*static_cast<UnsignedShort *>(store) =
			static_cast<UnsignedShort>(std::ceil(ConvertDurationFromMsecsToFrames(static_cast<Real>(milliseconds))));
	}
}

void INI::parseBitString32(INI *ini, void *, void *store, const void *userData)
{
	ConstCharPtrArray flagList = static_cast<ConstCharPtrArray>(userData);
	UnsignedInt *bits = static_cast<UnsignedInt *>(store);
	if (ini == nullptr || bits == nullptr || flagList == nullptr) {
		throw INI_INVALID_NAME_LIST;
	}

	Bool foundNormal = FALSE;
	Bool foundAddOrSub = FALSE;
	for (const char *token = ini->getNextTokenOrNull(); token != nullptr; token = ini->getNextTokenOrNull()) {
		if (strcasecmp(token, "NONE") == 0) {
			*bits = 0;
			return;
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
