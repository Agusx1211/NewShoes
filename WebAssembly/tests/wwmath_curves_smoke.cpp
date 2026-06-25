#include <cmath>
#include <iostream>

#include "cardinalspline.h"
#include "catmullromspline.h"
#include "curve.h"
#include "hermitespline.h"
#include "persistfactory.h"
#include "saveload.h"
#include "tcbspline.h"
#include "vector3.h"

namespace {
bool near(float actual, float expected, float epsilon = 0.001f)
{
	return std::fabs(actual - expected) <= epsilon;
}

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}
}

int main()
{
	float value = 0.0f;

	LinearCurve1DClass linear;
	linear.Add_Key(0.0f, 0.0f);
	linear.Add_Key(10.0f, 1.0f);
	linear.Evaluate(0.5f, &value);
	if (!expect(near(value, 5.0f), "LinearCurve1DClass interpolation mismatch")) {
		return 1;
	}

	const PersistFactoryClass &linear_factory = linear.Get_Factory();
	if (!expect(SaveLoadSystemClass::Find_Persist_Factory(linear_factory.Chunk_ID()) ==
			&linear_factory, "LinearCurve1DClass factory not registered")) {
		return 1;
	}

	HermiteSpline1DClass hermite;
	hermite.Add_Key(0.0f, 0.0f);
	hermite.Add_Key(10.0f, 1.0f);
	hermite.Set_Tangents(0, 0.0f, 10.0f);
	hermite.Set_Tangents(1, 10.0f, 0.0f);
	hermite.Evaluate(0.5f, &value);
	if (!expect(near(value, 5.0f), "HermiteSpline1DClass interpolation mismatch")) {
		return 1;
	}

	CardinalSpline1DClass cardinal;
	cardinal.Add_Key(0.0f, 0.0f);
	cardinal.Add_Key(10.0f, 1.0f);
	cardinal.Add_Key(20.0f, 2.0f);
	cardinal.Set_Tightness(1, 0.25f);
	cardinal.Evaluate(1.0f, &value);
	if (!expect(near(value, 10.0f), "CardinalSpline1DClass key interpolation mismatch")) {
		return 1;
	}

	CatmullRomSpline1DClass catmull;
	catmull.Add_Key(0.0f, 0.0f);
	catmull.Add_Key(10.0f, 1.0f);
	catmull.Add_Key(20.0f, 2.0f);
	catmull.Evaluate(1.0f, &value);
	if (!expect(near(value, 10.0f), "CatmullRomSpline1DClass key interpolation mismatch")) {
		return 1;
	}

	Vector3 vector;
	LinearCurve3DClass linear3;
	linear3.Add_Key(Vector3(0.0f, 0.0f, 0.0f), 0.0f);
	linear3.Add_Key(Vector3(2.0f, 4.0f, 6.0f), 1.0f);
	linear3.Evaluate(0.5f, &vector);
	if (!expect(near(vector.X, 1.0f) && near(vector.Y, 2.0f) &&
			near(vector.Z, 3.0f), "LinearCurve3DClass interpolation mismatch")) {
		return 1;
	}

	TCBSpline3DClass tcb;
	tcb.Add_Key(Vector3(0.0f, 0.0f, 0.0f), 0.0f);
	tcb.Add_Key(Vector3(10.0f, 5.0f, 2.0f), 1.0f);
	tcb.Add_Key(Vector3(20.0f, 0.0f, 4.0f), 2.0f);
	tcb.Set_TCB_Params(1, 0.0f, 0.0f, 0.0f);
	tcb.Evaluate(1.0f, &vector);
	if (!expect(near(vector.X, 10.0f) && near(vector.Y, 5.0f) &&
			near(vector.Z, 2.0f), "TCBSpline3DClass key interpolation mismatch")) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"WWMath\","
		"\"compiled\":\"curves, hermite/cardinal/catmull-rom/TCB splines, WWSaveLoad factories\","
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
