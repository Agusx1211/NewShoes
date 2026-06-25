#include "PreRTS.h"

#include "Common/OVERRIDE.h"
#include "GameLogic/Module/Diemodule.h"
#include "Lib/Basetype.h"
#include "WW3D2/ColType.h"
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
	const Vector3 x_axis = matrix.Get_X_Vector();

	if (override_value.getNonOverloadedPointer() != &value) {
		return 1;
	}
	if (COLL_TYPE_ALL != 1) {
		return 1;
	}
	if (x_axis.X != 1.0f || x_axis.Y != 0.0f || x_axis.Z != 0.0f) {
		return 1;
	}

	std::printf("{\"ok\":true,\"smoke\":\"gameengine-header-case\"}\n");
	return 0;
}
