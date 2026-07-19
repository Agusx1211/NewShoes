#include <cstddef>
#include <cstdio>

#include "PreRTS.h"
#include "WWMath/Matrix3D.h"
#include "GameLogic/Module/FlightDeckBehavior.h"

namespace {
bool expectLayout( Int numRows, Int numCols, std::size_t runway1Spaces,
		std::size_t runway2Spaces, Bool expected, const char *label )
{
	const std::size_t spaceCounts[ MAX_RUNWAYS ] = { runway1Spaces, runway2Spaces };
	const Bool actual = FlightDeckBehaviorModuleData::isValidRunwayLayout( numRows, numCols, spaceCounts );
	if( actual != expected )
	{
		std::fprintf( stderr, "%s: expected %d, got %d\n", label, expected, actual );
		return false;
	}
	return true;
}
}

int main()
{
	bool ok = true;
	ok &= expectLayout( 3, 2, 3, 3, TRUE, "complete two-runway layout" );
	ok &= expectLayout( 2, 1, 4, 0, TRUE, "extra inactive and active bones" );
	ok &= expectLayout( 0, 0, 0, 0, TRUE, "empty layout" );
	ok &= expectLayout( -1, 1, 0, 0, FALSE, "negative row count" );
	ok &= expectLayout( 1, -1, 1, 1, FALSE, "negative runway count" );
	ok &= expectLayout( 0, 1, 0, 0, FALSE, "runway without parking spaces" );
	ok &= expectLayout( 1, MAX_RUNWAYS + 1, 1, 1, FALSE, "runway count beyond storage" );
	ok &= expectLayout( 3, 1, 2, 0, FALSE, "short first runway" );
	ok &= expectLayout( 3, 2, 3, 2, FALSE, "short second runway" );

	if( !ok )
		return 1;

	std::puts( "flightdeck layout smoke: ok" );
	return 0;
}
