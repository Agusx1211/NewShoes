#include <cmath>
#include <iostream>

#include "lookuptable.h"
#include "refcount.h"
#include "wwmath.h"

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
	WWMath::Init();

	LookupTableClass *default_table = LookupTableMgrClass::Get_Table("DefaultTable", false);
	if (!expect(default_table != NULL, "DefaultTable lookup failed")) {
		WWMath::Shutdown();
		return 1;
	}

	const float low_value = default_table->Get_Value(0.0f);
	const float high_value = default_table->Get_Value(1.0f);
	const float quick_value = default_table->Get_Value_Quick(0.5f);
	default_table->Release_Ref();

	if (!expect(near(low_value, 0.5f) && near(high_value, 0.5f) &&
			near(quick_value, 0.5f), "DefaultTable sampled value mismatch")) {
		WWMath::Shutdown();
		return 1;
	}

	if (!expect(near(WWMath::Fast_Sin(0.0f), 0.0f, 0.01f) &&
			near(WWMath::Fast_Acos(1.0f), 0.0f, 0.01f) &&
			near(WWMath::Fast_Asin(0.0f), 0.0f, 0.01f),
			"WWMath fast trig table mismatch")) {
		WWMath::Shutdown();
		return 1;
	}

	WWMath::Shutdown();
	if (!expect(RefCountClass::Total_Refs() == 0, "RefCountClass total refs leaked")) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"WWMath\","
		"\"compiled\":\"lookup tables, WWMath init/shutdown, debug refcount tracking\","
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
