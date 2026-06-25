#pragma once

#include "windows.h"

struct AsnObjectIdentifier
{
	UINT idLength;
	UINT *ids;
};

using AsnInteger32 = LONG;
using AsnInteger = AsnInteger32;

struct AsnOctetString
{
	BYTE *stream;
	UINT len;
	BOOL dynamic;
};

union AsnAnyValue
{
	AsnInteger number;
	AsnOctetString address;
};

struct AsnAny
{
	BYTE asnType;
	AsnAnyValue asnValue;
};

struct RFC1157VarBind
{
	AsnObjectIdentifier name;
	AsnAny value;
};

struct RFC1157VarBindList
{
	RFC1157VarBind *list;
	UINT len;
};

using SnmpVarBind = RFC1157VarBind;
using SnmpVarBindList = RFC1157VarBindList;

#ifndef SNMP_PDU_GETNEXT
#define SNMP_PDU_GETNEXT 0xA1
#endif
