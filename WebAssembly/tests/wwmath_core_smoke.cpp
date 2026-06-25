#include <cmath>
#include <iostream>

#include "pot.h"
#include "tri.h"
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

	std::cout << "{\"ok\":true,\"library\":\"WWMath\","
		"\"compiled\":[\"pot.cpp\",\"tri.cpp\"],"
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
