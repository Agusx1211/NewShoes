#pragma once

#ifndef __XFER_H_
#define __XFER_H_

#include "Common/AsciiString.h"
#include "Common/GameType.h"
#include "Common/UnicodeString.h"
#include "GameClient/Color.h"

typedef UnsignedByte XferVersion;

enum XferMode
{
	XFER_INVALID = 0,
	XFER_SAVE,
	XFER_LOAD,
	XFER_CRC,
	NUM_XFER_TYPES,
};

enum XferStatus
{
	XFER_STATUS_INVALID = 0,
	XFER_OK,
	XFER_EOF,
	XFER_FILE_NOT_FOUND,
	XFER_FILE_NOT_OPEN,
	XFER_FILE_ALREADY_OPEN,
	XFER_READ_ERROR = 6,
	XFER_WRITE_ERROR,
	XFER_MODE_UNKNOWN = 8,
	XFER_SKIP_ERROR,
	XFER_BEGIN_END_MISMATCH,
	XFER_OUT_OF_MEMORY,
	XFER_STRING_ERROR,
	XFER_INVALID_VERSION,
	XFER_INVALID_PARAMETERS,
	XFER_LIST_NOT_EMPTY,
	XFER_UNKNOWN_STRING,
	XFER_ERROR_UNKNOWN,
	NUM_XFER_STATUS,
};

enum XferOptions
{
	XO_NONE = 0x00000000,
	XO_NO_POST_PROCESSING = 0x00000001,
	XO_ALL = 0xFFFFFFFF,
};

class Xfer
{
public:
	Xfer() : m_options(XO_NONE), m_xferMode(XFER_INVALID) {}
	virtual ~Xfer() {}

	virtual XferMode getXferMode() { return m_xferMode; }
	AsciiString getIdentifier() { return m_identifier; }
	virtual void setOptions(UnsignedInt options) { m_options |= options; }
	virtual void clearOptions(UnsignedInt options) { m_options &= ~options; }
	virtual UnsignedInt getOptions() { return m_options; }
	virtual void open(AsciiString identifier) { m_identifier = identifier; }
	virtual void close() { m_identifier.clear(); }
	virtual Int beginBlock() { return 0; }
	virtual void endBlock() {}
	virtual void skip(Int) {}
	virtual void xferVersion(XferVersion *, XferVersion) {}
	virtual void xferByte(Byte *) {}
	virtual void xferUnsignedByte(UnsignedByte *) {}
	virtual void xferInt(Int *) {}
	virtual void xferUnsignedInt(UnsignedInt *) {}
	virtual void xferUnsignedShort(UnsignedShort *) {}
	virtual void xferAsciiString(AsciiString *) {}
	virtual void xferMapName(AsciiString *) {}
	virtual void xferUser(void *, Int) {}
	virtual void xferBool(Bool *) {}
	virtual void xferReal(Real *) {}
	virtual void xferShort(Short *) {}
	virtual void xferUnicodeString(UnicodeString *) {}
	virtual void xferCoord2D(Coord2D *) {}
	virtual void xferCoord3D(Coord3D *) {}
	virtual void xferMatrix3D(class Matrix3D *) {}
	virtual void xferRGBColor(RGBColor *) {}
	virtual void xferRGBAColorReal(RGBAColorReal *) {}
	virtual void xferRGBAColorInt(RGBAColorInt *) {}
	virtual void xferObjectID(ObjectID *) {}
	virtual void xferDrawableID(DrawableID *) {}
	virtual void xferSnapshot(class Snapshot *) {}
	virtual void xferColor(Color *color)
	{
		if (color != nullptr) {
			UnsignedInt colorValue = static_cast<UnsignedInt>(*color);
			xferUnsignedInt(&colorValue);
			*color = static_cast<Color>(colorValue);
		}
	}

protected:
	UnsignedInt m_options;
	XferMode m_xferMode;
	AsciiString m_identifier;
};

#endif
