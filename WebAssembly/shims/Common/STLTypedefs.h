#pragma once

#ifndef __STLTYPEDEFS_H__
#define __STLTYPEDEFS_H__

#include <algorithm>
#include <bitset>
#include <list>
#include <map>
#include <queue>
#include <set>
#include <stack>
#include <string>
#include <unordered_map>
#include <vector>

namespace std {
template <typename Key, typename Value, typename Hash = std::hash<Key>, typename Equal = std::equal_to<Key>>
using hash_map = std::unordered_map<Key, Value, Hash, Equal>;
}

typedef std::vector<Coord3D> VecCoord3D;
typedef VecCoord3D::iterator VecCoord3DIt;

#endif
