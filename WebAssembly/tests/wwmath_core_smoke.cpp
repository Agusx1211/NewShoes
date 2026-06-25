#include <cmath>
#include <iostream>

#include "aabox.h"
#include "colmath.h"
#include "lineseg.h"
#include "matrix3.h"
#include "matrix4.h"
#include "obbox.h"
#include "ode.h"
#include "pot.h"
#include "quat.h"
#include "random.h"
#include "sphere.h"
#include "tri.h"
#include "v3_rnd.h"
#include "vector2.h"
#include "vector3.h"

namespace {
bool near(float actual, float expected, float epsilon = 0.0001f)
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

bool inside_sphere(const Vector3 &vector, float radius)
{
	return vector.Length2() <= radius * radius + 0.0001f;
}

class ConstantDerivativeSystem final : public ODESystemClass
{
public:
	explicit ConstantDerivativeSystem(float value) : Value(value) {}

	void Get_State(StateVectorClass &set_state) override
	{
		set_state.Reset();
		set_state.Add(Value);
	}

	int Set_State(const StateVectorClass &new_state, int start_index = 0) override
	{
		Value = new_state[start_index];
		return start_index + 1;
	}

	int Compute_Derivatives(
		float,
		StateVectorClass *,
		StateVectorClass *dydt,
		int start_index = 0) override
	{
		dydt->Add(2.0f);
		return start_index + 1;
	}

	float Value;
};
}

int main()
{
	if (!expect(Find_POT(0) == 1, "Find_POT(0) mismatch")) {
		return 1;
	}
	if (!expect(Find_POT(257) == 512, "Find_POT(257) mismatch")) {
		return 1;
	}
	if (!expect(Find_POT_Log2(257) == 9, "Find_POT_Log2(257) mismatch")) {
		return 1;
	}

	const Vector3 a(1.0f, 2.0f, 3.0f);
	const Vector3 b(4.0f, -1.0f, 2.0f);
	if (!expect(near(Vector3::Dot_Product(a, b), 8.0f), "Vector3 dot mismatch")) {
		return 1;
	}

	Vector3 cross;
	Vector3::Cross_Product(a, b, &cross);
	if (!expect(near(cross.X, 7.0f) && near(cross.Y, 10.0f) && near(cross.Z, -9.0f),
			"Vector3 cross mismatch")) {
		return 1;
	}

	Vector3 normalized(3.0f, 0.0f, 4.0f);
	normalized.Normalize();
	if (!expect(near(normalized.X, 0.6f) && near(normalized.Y, 0.0f) &&
			near(normalized.Z, 0.8f) && near(normalized.Length(), 1.0f),
			"Vector3 normalize mismatch")) {
		return 1;
	}

	if (!expect(near(Vector2::Perp_Dot_Product(Vector2(1.0f, 0.0f), Vector2(0.0f, 1.0f)), -1.0f),
			"Vector2 perp dot mismatch")) {
		return 1;
	}

	Matrix3x3 rotation(Vector3(0.0f, 0.0f, 1.0f), 1.57079632679f);
	Vector3 rotated = rotation * Vector3(1.0f, 0.0f, 0.0f);
	if (!expect(near(rotated.X, 0.0f) && near(rotated.Y, 1.0f) &&
			near(rotated.Z, 0.0f), "Matrix3x3 rotation mismatch")) {
		return 1;
	}

	Matrix4x4 identity4(true);
	Vector4 transformed4 = identity4 * Vector4(1.0f, 2.0f, 3.0f, 1.0f);
	if (!expect(near(transformed4.X, 1.0f) && near(transformed4.Y, 2.0f) &&
			near(transformed4.Z, 3.0f) && near(transformed4.W, 1.0f),
			"Matrix4x4 identity transform mismatch")) {
		return 1;
	}

	Quaternion quat = Axis_To_Quat(Vector3(0.0f, 0.0f, 1.0f), 1.57079632679f);
	Vector3 quat_rotated = quat.Rotate_Vector(Vector3(1.0f, 0.0f, 0.0f));
	if (!expect(near(quat_rotated.X, 0.0f) && near(quat_rotated.Y, 1.0f) &&
			near(quat_rotated.Z, 0.0f), "Quaternion rotation mismatch")) {
		return 1;
	}

	Vector3 normal(0.0f, 0.0f, 1.0f);
	Vector3 p0(0.0f, 0.0f, 0.0f);
	Vector3 p1(1.0f, 0.0f, 0.0f);
	Vector3 p2(0.0f, 1.0f, 0.0f);
	TriClass triangle;
	triangle.N = &normal;
	triangle.V[0] = &p0;
	triangle.V[1] = &p1;
	triangle.V[2] = &p2;

	if (!expect(triangle.Contains_Point(Vector3(0.25f, 0.25f, 0.0f)),
			"TriClass inside point rejected")) {
		return 1;
	}
	if (!expect(!triangle.Contains_Point(Vector3(1.25f, 0.25f, 0.0f)),
			"TriClass outside point accepted")) {
		return 1;
	}

	AABoxClass aabox(Vector3(0.0f, 0.0f, 0.0f), Vector3(1.0f, 1.0f, 1.0f));
	AABoxClass other_box(Vector3(1.5f, 0.0f, 0.0f), Vector3(1.0f, 1.0f, 1.0f));
	if (!expect(CollisionMath::Intersection_Test(aabox, other_box),
			"AABox intersection rejected")) {
		return 1;
	}

	LineSegClass line(Vector3(-2.0f, 0.0f, 0.0f), Vector3(2.0f, 0.0f, 0.0f));
	if (!expect(CollisionMath::Overlap_Test(aabox, line) == CollisionMath::BOTH,
			"AABox/line overlap classification mismatch")) {
		return 1;
	}

	SphereClass sphere(Vector3(0.0f, 0.0f, 0.0f), 2.0f);
	if (!expect(CollisionMath::Overlap_Test(sphere, Vector3(0.5f, 0.0f, 0.0f)) ==
			CollisionMath::INSIDE, "sphere/point overlap classification mismatch")) {
		return 1;
	}

	OBBoxClass obox(Vector3(0.0f, 0.0f, 0.0f), Vector3(1.0f, 2.0f, 3.0f));
	OBBoxClass obox2(Vector3(0.5f, 0.0f, 0.0f), Vector3(1.0f, 2.0f, 3.0f));
	if (!expect(near(obox.Volume(), 48.0f), "OBBox volume mismatch")) {
		return 1;
	}
	if (!expect(Oriented_Boxes_Intersect(obox, obox2),
			"OBBox intersection rejected")) {
		return 1;
	}

	ConstantDerivativeSystem ode_system(1.0f);
	IntegrationSystem::Euler_Integrate(&ode_system, 0.5f);
	if (!expect(near(ode_system.Value, 2.0f), "ODE Euler integration mismatch")) {
		return 1;
	}

	RandomClass random(1234);
	const int ranged_random = random(3, 9);
	if (!expect(ranged_random >= 3 && ranged_random <= 9,
			"RandomClass ranged value outside bounds")) {
		return 1;
	}

	Vector3 vector;
	Vector3SolidBoxRandomizer box(Vector3(2.0f, 3.0f, 4.0f));
	box.Get_Vector(vector);
	if (!expect(std::fabs(vector.X) <= 2.0f && std::fabs(vector.Y) <= 3.0f &&
			std::fabs(vector.Z) <= 4.0f,
			"Vector3SolidBoxRandomizer produced value outside extents")) {
		return 1;
	}
	if (!expect(near(box.Get_Maximum_Extent(), 4.0f), "box maximum extent mismatch")) {
		return 1;
	}

	Vector3SolidSphereRandomizer solid_sphere(5.0f);
	solid_sphere.Get_Vector(vector);
	if (!expect(inside_sphere(vector, 5.0f), "solid sphere randomizer outside radius")) {
		return 1;
	}

	Vector3HollowSphereRandomizer hollow_sphere(6.0f);
	hollow_sphere.Get_Vector(vector);
	if (!expect(near(vector.Length(), 6.0f, 0.001f), "hollow sphere randomizer not on radius")) {
		return 1;
	}

	Vector3SolidCylinderRandomizer cylinder(7.0f, 2.0f);
	cylinder.Get_Vector(vector);
	if (!expect(std::fabs(vector.X) <= 7.0f &&
			(vector.Y * vector.Y + vector.Z * vector.Z) <= 4.0001f,
			"solid cylinder randomizer outside bounds")) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"WWMath\","
		"\"compiled\":\"core geometry, collision, quaternion, ODE, randomizers\","
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
