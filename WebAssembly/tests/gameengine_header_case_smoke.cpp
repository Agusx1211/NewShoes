#include "PreRTS.h"

#include "Common/OVERRIDE.h"
#include "GameLOgic/GameLogic.h"
#include "GameLogic/Module/Diemodule.h"
#include "LightEnvironment.h"
#include "Lib/Basetype.h"
#include "hmdldef.h"
#include "lib/baseType.h"
#include "snappts.h"
#include "vector3i.h"
#include "WW3D2/ColType.h"
#include "WW3D2/Light.h"
#include "WWMATH/Vector2.h"
#include "WWMath/Matrix3D.h"

namespace {
struct SmokeValue
{
	int value;
};
}

int main()
{
	SmokeValue value = { 7 };
	OVERRIDE<SmokeValue> override_value(&value);
	Matrix3D matrix(true);
	Vector2 unit_y(0.0f, 1.0f);
	Vector3i grid(1, 2, 3);
	const Vector3 x_axis = matrix.Get_X_Vector();

	if (override_value.getNonOverloadedPointer() != &value) {
		return 1;
	}
	if (COLL_TYPE_ALL != 1) {
		return 1;
	}
	if (LightClass::POINT != 0 || sizeof(Int) != 4) {
		return 1;
	}
	if (unit_y.Y != 1.0f) {
		return 1;
	}
	if (grid[0] != 1 || grid[1] != 2 || grid[2] != 3) {
		return 1;
	}
	if (x_axis.X != 1.0f || x_axis.Y != 0.0f || x_axis.Z != 0.0f) {
		return 1;
	}

	std::printf("{\"ok\":true,\"smoke\":\"gameengine-header-case\"}\n");
	return 0;
}
