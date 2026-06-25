/*
**	Command & Conquer Generals Zero Hour(tm)
**	Copyright 2025 Electronic Arts Inc.
**
**	This program is free software: you can redistribute it and/or modify
**	it under the terms of the GNU General Public License as published by
**	the Free Software Foundation, either version 3 of the License, or
**	(at your option) any later version.
**
**	This program is distributed in the hope that it will be useful,
**	but WITHOUT ANY WARRANTY; without even the implied warranty of
**	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
**	GNU General Public License for more details.
**
**	You should have received a copy of the GNU General Public License
**	along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

////////////////////////////////////////////////////////////////////////////////
//																																						//
//  (c) 2001-2003 Electronic Arts Inc.																				//
//																																						//
////////////////////////////////////////////////////////////////////////////////

// FILE: QuotedPrintable.cpp /////////////////////////////////////////////////////////
// Author: Matt Campbell, February 2002
// Description: Quoted-printable encode/decode
////////////////////////////////////////////////////////////////////////////
#include "PreRTS.h"	// This must go first in EVERY cpp file int the GameEngine

#include "Common/QuotedPrintable.h"

#define MAGIC_CHAR '_'
#define MAX_QUOTED_PRINTABLE_CHARS 1024

// takes an integer and returns an ASCII representation
static char intToHexDigit(int num)
{
	if (num<0 || num >15) return '\0';
	if (num<10)
	{
		return '0' + num;
	}
	return 'A' + (num-10);
}

// convert an ASCII representation of a hex digit into the digit itself
static int hexDigitToInt(char c)
{
	if (c <= '9' && c >= '0') return (c - '0');
	if (c <= 'f' && c >= 'a') return (c - 'a' + 10);
	if (c <= 'F' && c >= 'A') return (c - 'A' + 10);
	return 0;
}

static Bool appendByteToQuotedPrintable(unsigned char value, char *dest, int *index)
{
	if (isalnum(value))
	{
		if (*index >= MAX_QUOTED_PRINTABLE_CHARS - 1)
			return FALSE;
		dest[(*index)++] = value;
	}
	else
	{
		if (*index >= MAX_QUOTED_PRINTABLE_CHARS - 3)
			return FALSE;
		dest[(*index)++] = MAGIC_CHAR;
		dest[(*index)++] = intToHexDigit(value >> 4);
		dest[(*index)++] = intToHexDigit(value & 0xf);
	}

	return TRUE;
}

static Bool readByteFromQuotedPrintable(const unsigned char *&src, unsigned char *value)
{
	if (*src == '\0')
		return FALSE;

	if (*src == MAGIC_CHAR)
	{
		if (src[1] == '\0')
			return FALSE;

		*value = hexDigitToInt(src[1]);
		src++;
		if (src[1] != '\0')
		{
			*value = *value << 4;
			*value = *value | hexDigitToInt(src[1]);
			src++;
		}
	}
	else
	{
		*value = *src;
	}

	src++;
	return TRUE;
}

// Convert unicode strings into ascii quoted-printable strings
AsciiString UnicodeStringToQuotedPrintable(UnicodeString original)
{
	static char dest[MAX_QUOTED_PRINTABLE_CHARS];
	const WideChar *src = original.str();
	int i=0;
	// Preserve the original network/preferences wire format: UTF-16LE bytes.
	while ( *src && i<MAX_QUOTED_PRINTABLE_CHARS-1 )
	{
		UnsignedInt codeUnit = ((UnsignedInt)*src) & 0xffff;
		if (!appendByteToQuotedPrintable((unsigned char)(codeUnit & 0xff), dest, &i))
			break;
		if (!appendByteToQuotedPrintable((unsigned char)((codeUnit >> 8) & 0xff), dest, &i))
			break;
		src++;
	}
	dest[i] = '\0';

	return dest;
}

// Convert ascii strings into ascii quoted-printable strings
AsciiString AsciiStringToQuotedPrintable(AsciiString original)
{
	static char dest[MAX_QUOTED_PRINTABLE_CHARS];
	const unsigned char *src = (const unsigned char *)original.str();
	int i=0;
	while ( src[0]!='\0' && i<MAX_QUOTED_PRINTABLE_CHARS-1 )
	{
		if (!appendByteToQuotedPrintable(*src, dest, &i))
			break;
		src++;
	}
	dest[i] = '\0';

	return dest;
}

// Convert ascii quoted-printable strings into unicode strings
UnicodeString QuotedPrintableToUnicodeString(AsciiString original)
{
	static WideChar dest[MAX_QUOTED_PRINTABLE_CHARS];
	int i=0;

	const unsigned char *src = (const unsigned char *)original.str();

	// Decode the original UTF-16LE byte stream into the host WideChar width.
	while (*src && i<MAX_QUOTED_PRINTABLE_CHARS-1)
	{
		unsigned char low = 0;
		unsigned char high = 0;
		if (!readByteFromQuotedPrintable(src, &low))
			break;
		if (*src && !readByteFromQuotedPrintable(src, &high))
			break;
		dest[i++] = (WideChar)(low | (high << 8));
	}

	dest[i] = 0;

	UnicodeString out(dest);
	return out;
}

// Convert ascii quoted-printable strings into ascii strings
AsciiString QuotedPrintableToAsciiString(AsciiString original)
{
	static unsigned char dest[MAX_QUOTED_PRINTABLE_CHARS];
	int i=0;

	unsigned char *c = (unsigned char *)dest;
	const unsigned char *src = (const unsigned char *)original.str();

	while (*src && i<MAX_QUOTED_PRINTABLE_CHARS-1)
	{
		if (!readByteFromQuotedPrintable(src, c))
			break;
		c++;
		i++;
	}

	*c = 0;

	return AsciiString((const char *)dest);
}
