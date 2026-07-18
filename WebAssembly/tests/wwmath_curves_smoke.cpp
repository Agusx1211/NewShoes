#include <cmath>
#include <iostream>

#include "cardinalspline.h"
#include "catmullromspline.h"
#include "curve.h"
#include "hermitespline.h"
#include "persistfactory.h"
#include "saveload.h"
#include "tcbspline.h"
#include "vehiclecurve.h"
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

class CardinalSpline1DProbe : public CardinalSpline1DClass
{
public:
	int getTightnessCountForTest() const
	{
		return Tightness.Count();
	}
};
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

	CardinalSpline1DProbe polymorphic_cardinal;
	Curve1DClass *polymorphic_curve = &polymorphic_cardinal;
	polymorphic_curve->Add_Key(0.0f, 0.0f, 7);
	polymorphic_curve->Add_Key(10.0f, 1.0f, 17);
	polymorphic_curve->Add_Key(20.0f, 2.0f, 27);
	if (!expect(polymorphic_cardinal.getTightnessCountForTest() ==
			polymorphic_cardinal.Key_Count(),
			"CardinalSpline1DClass polymorphic insertion skipped tightness bookkeeping")) {
		return 1;
	}
	float polymorphic_point = 0.0f;
	float polymorphic_time = 0.0f;
	unsigned int polymorphic_extra = 0;
	polymorphic_curve->Get_Key(
		1, &polymorphic_point, &polymorphic_time, &polymorphic_extra);
	polymorphic_cardinal.Set_Tightness(1, 0.25f);
	polymorphic_cardinal.Evaluate(1.0f, &value);
	if (!expect(near(value, 10.0f) && near(polymorphic_point, 10.0f) &&
			near(polymorphic_time, 1.0f) && polymorphic_extra == 17,
			"CardinalSpline1DClass polymorphic insertion lost key data")) {
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

	VehicleCurveClass vehicle_curve(2.0f);
	vehicle_curve.Add_Key(Vector3(0.0f, 0.0f, 0.0f), 0.0f);
	vehicle_curve.Add_Key(Vector3(10.0f, 0.0f, 0.0f), 1.0f);
	vehicle_curve.Add_Key(Vector3(10.0f, 10.0f, 5.0f), 2.0f);
	vehicle_curve.Evaluate(1.5f, &vector);
	if (!expect(std::isfinite(vector.X) && std::isfinite(vector.Y) &&
			std::isfinite(vector.Z) && vector.Z >= 0.0f && vector.Z <= 5.0f,
			"VehicleCurveClass evaluation produced invalid point")) {
		return 1;
	}

	Vector3 sharpness_position;
	const float sharpness = vehicle_curve.Get_Current_Sharpness(&sharpness_position);
	if (!expect(std::isfinite(sharpness) && sharpness >= 0.0f && sharpness <= 1.0f,
			"VehicleCurveClass sharpness outside expected range")) {
		return 1;
	}

	const PersistFactoryClass &vehicle_factory = vehicle_curve.Get_Factory();
	if (!expect(SaveLoadSystemClass::Find_Persist_Factory(vehicle_factory.Chunk_ID()) ==
			&vehicle_factory, "VehicleCurveClass factory not registered")) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"WWMath\","
		"\"compiled\":\"curves, hermite/cardinal/catmull-rom/TCB splines, vehicle curves, WWSaveLoad factories\","
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
