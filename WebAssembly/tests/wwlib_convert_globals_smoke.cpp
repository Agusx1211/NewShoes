#include "_convert.h"

#include <iostream>

namespace {
bool expect_null(ConvertClass *value, const char *name)
{
	if (value != nullptr) {
		std::cerr << name << " should default to null\n";
		return false;
	}
	return true;
}
}

int main()
{
	if (!expect_null(VoxelDrawer, "VoxelDrawer") ||
		!expect_null(UnitDrawer, "UnitDrawer") ||
		!expect_null(TerrainDrawer, "TerrainDrawer") ||
		!expect_null(AnimDrawer, "AnimDrawer") ||
		!expect_null(NormalDrawer, "NormalDrawer") ||
		!expect_null(IsometricDrawer, "IsometricDrawer")) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"WWLib\","
		"\"compiled\":\"_convert.cpp\","
		"\"globals\":6,"
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
