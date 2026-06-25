#pragma once

#ifndef __STLTYPEDEFS_H__
#define __STLTYPEDEFS_H__

#include <algorithm>
#include <bitset>
#include <functional>
#include <hash_map>
#include <list>
#include <map>
#include <queue>
#include <set>
#include <stack>
#include <string>
#include <vector>

#include "Common/AsciiString.h"
#include "Common/GameCommon.h"
#include "Common/UnicodeString.h"

enum NameKeyType : int;

namespace rts {
template <typename T> struct hash
{
	size_t operator()(const T& value) const { return std::hash<T>()(value); }
};

template <typename T> struct equal_to
{
	bool operator()(const T& lhs, const T& rhs) const { return lhs == rhs; }
};

template <typename T> struct less_than_nocase
{
	bool operator()(const T& lhs, const T& rhs) const { return lhs < rhs; }
};

template <> struct less_than_nocase<AsciiString>
{
	bool operator()(const AsciiString& lhs, const AsciiString& rhs) const
	{
		return lhs.compareNoCase(rhs) < 0;
	}
};

template <> struct less_than_nocase<UnicodeString>
{
	bool operator()(const UnicodeString& lhs, const UnicodeString& rhs) const
	{
		return lhs.compareNoCase(rhs) < 0;
	}
};

template <> struct equal_to<AsciiString>
{
	bool operator()(const AsciiString& lhs, const AsciiString& rhs) const
	{
		return lhs == rhs;
	}
};

template <> struct hash<AsciiString>
{
	size_t operator()(const AsciiString& value) const
	{
		return std::hash<std::string>()(value.str());
	}
};
}

typedef std::vector<Coord3D> VecCoord3D;
typedef VecCoord3D::iterator VecCoord3DIt;
typedef std::list<AsciiString> AsciiStringList;
typedef AsciiStringList::iterator AsciiStringListIterator;
typedef AsciiStringList::const_iterator AsciiStringListConstIterator;
typedef std::map<NameKeyType, Real, std::less<NameKeyType>> ProductionChangeMap;
typedef std::map<NameKeyType, VeterancyLevel, std::less<NameKeyType>> ProductionVeterancyMap;

#endif
