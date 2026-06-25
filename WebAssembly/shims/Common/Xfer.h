#pragma once

#ifndef __XFER_H_
#define __XFER_H_

#include "Common/AsciiString.h"
#include "Common/UnicodeString.h"

typedef UnsignedByte XferVersion;

enum XferMode
{
	XFER_INVALID = 0,
	XFER_SAVE,
	XFER_LOAD,
	XFER_CRC,
};

enum XferStatus
{
	XFER_READ_ERROR = 6,
	XFER_MODE_UNKNOWN = 8,
};

class Xfer
{
public:
	Xfer() : m_mode(XFER_INVALID) {}
	virtual ~Xfer() {}

	virtual XferMode getXferMode() { return m_mode; }
	virtual void xferVersion(XferVersion *, XferVersion) {}
	virtual void xferUnsignedByte(UnsignedByte *) {}
	virtual void xferInt(Int *) {}
	virtual void xferUnsignedInt(UnsignedInt *) {}
	virtual void xferAsciiString(AsciiString *) {}
	virtual void xferUser(void *, Int) {}
	virtual void xferBool(Bool *) {}
	virtual void xferReal(Real *) {}
	virtual void xferUnicodeString(UnicodeString *) {}

protected:
	XferMode m_mode;
};

#endif
