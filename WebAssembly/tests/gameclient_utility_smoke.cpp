#include <cmath>
#include <cstdio>

#include "PreRTS.h"

#include "GameClient/Color.h"
#include "GameClient/Line2D.h"
#include "GameClient/ParabolicEase.h"
#include "GameClient/Statistics.h"

namespace {
bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::fprintf(stderr, "%s\n", message);
	}
	return condition;
}

bool near(Real actual, Real expected, Real epsilon = 0.0001f)
{
	return std::fabs(actual - expected) <= epsilon;
}

bool exercise_color()
{
	const Color color = GameMakeColor(80, 120, 160, 200);
	UnsignedByte red = 0;
	UnsignedByte green = 0;
	UnsignedByte blue = 0;
	UnsignedByte alpha = 0;
	GameGetColorComponents(color, &red, &green, &blue, &alpha);

	Real red_real = 0.0f;
	Real green_real = 0.0f;
	Real blue_real = 0.0f;
	Real alpha_real = 0.0f;
	GameGetColorComponentsReal(color, &red_real, &green_real, &blue_real, &alpha_real);

	const Color darkened = GameDarkenColor(color, 25);
	UnsignedByte dark_red = 0;
	UnsignedByte dark_green = 0;
	UnsignedByte dark_blue = 0;
	UnsignedByte dark_alpha = 0;
	GameGetColorComponents(darkened, &dark_red, &dark_green, &dark_blue, &dark_alpha);

	return expect(color == static_cast<Color>(0xc85078a0), "GameMakeColor packing failed") &&
		expect(red == 80 && green == 120 && blue == 160 && alpha == 200,
			"GameGetColorComponents unpack failed") &&
		expect(near(red_real, 80.0f / 255.0f) &&
				near(green_real, 120.0f / 255.0f) &&
				near(blue_real, 160.0f / 255.0f) &&
				near(alpha_real, 200.0f / 255.0f),
			"GameGetColorComponentsReal unpack failed") &&
		expect(dark_red == 60 && dark_green == 90 && dark_blue == 120 && dark_alpha == 200,
			"GameDarkenColor failed");
}

bool exercise_line2d()
{
	IRegion2D clip = { { 0, 0 }, { 10, 10 } };
	ICoord2D p1 = { -5, 5 };
	ICoord2D p2 = { 15, 5 };
	ICoord2D c1 = { 0, 0 };
	ICoord2D c2 = { 0, 0 };
	if (!expect(ClipLine2D(&p1, &p2, &c1, &c2, &clip), "ClipLine2D rejected visible line")) {
		return false;
	}
	if (!expect(c1.x == 0 && c1.y == 5 && c2.x == 10 && c2.y == 5,
			"ClipLine2D endpoints failed")) {
		return false;
	}

	ICoord2D outside1 = { -5, -5 };
	ICoord2D outside2 = { -1, -1 };
	if (!expect(!ClipLine2D(&outside1, &outside2, &c1, &c2, &clip),
			"ClipLine2D accepted invisible line")) {
		return false;
	}

	Coord2D a = { 0.0f, 0.0f };
	Coord2D b = { 10.0f, 10.0f };
	Coord2D c = { 0.0f, 10.0f };
	Coord2D d = { 10.0f, 0.0f };
	Coord2D intersection = { 0.0f, 0.0f };
	if (!expect(IntersectLine2D(&a, &b, &c, &d, &intersection) &&
			near(intersection.x, 5.0f) && near(intersection.y, 5.0f),
			"IntersectLine2D failed")) {
		return false;
	}

	Coord2D square[] = {
		{ 0.0f, 0.0f },
		{ 4.0f, 0.0f },
		{ 4.0f, 4.0f },
		{ 0.0f, 4.0f },
	};
	Coord2D inside = { 1.0f, 2.0f };
	Coord2D outside = { 5.0f, 2.0f };
	if (!expect(PointInsideArea2D(&inside, square, 4) &&
			!PointInsideArea2D(&outside, square, 4),
			"PointInsideArea2D failed")) {
		return false;
	}

	Coord2D top_left = { 0.0f, 0.0f };
	Coord2D bottom_right = { 10.0f, 10.0f };
	ScaleRect2D(&top_left, &bottom_right, 1.5f);
	return expect(near(top_left.x, -2.5f) && near(top_left.y, -2.5f) &&
			near(bottom_right.x, 12.5f) && near(bottom_right.y, 12.5f),
		"ScaleRect2D failed");
}

bool exercise_parabolic_ease()
{
	ParabolicEase linear;
	ParabolicEase eased(0.25f, 0.25f);

	return expect(near(linear(0.5f), 0.5f), "default ParabolicEase midpoint failed") &&
		expect(near(eased(0.0f), 0.0f) &&
				near(eased(0.5f), 0.5f) &&
				near(eased(1.0f), 1.0f),
			"ParabolicEase endpoint/midpoint failed") &&
		expect(eased(0.125f) < 0.125f && eased(0.875f) > 0.875f,
			"ParabolicEase curve shape failed");
}

bool exercise_statistics()
{
	return expect(near(Normalize(5.0f, 0.0f, 10.0f), 0.5f),
			"Normalize failed") &&
		expect(near(NormalizeToRange(5.0f, 0.0f, 10.0f, -1.0f, 1.0f), 0.0f),
			"NormalizeToRange failed") &&
		expect(near(MuLaw(5.0f, 10.0f, 255.0f), 0.0f) &&
				near(MuLaw(10.0f, 10.0f, 255.0f), 1.0f) &&
				near(MuLaw(0.0f, 10.0f, 255.0f), -1.0f),
			"MuLaw failed");
}
}

int main()
{
	const bool ok = exercise_color() &&
		exercise_line2d() &&
		exercise_parabolic_ease() &&
		exercise_statistics();

	if (!ok) {
		return 1;
	}

	std::printf("{\"ok\":true,\"library\":\"GameClient/utility\","
		"\"compiled\":\"Color,Line2D,ParabolicEase,Statistics\","
		"\"source\":\"GeneralsMD original\"}\n");
	return 0;
}
