/*
**	Command & Conquer Generals Zero Hour(tm)
**	Copyright 2025 Electronic Arts Inc.
**
**	This program is free software: you can redistribute it and/or modify
**	it under the terms of the GNU General Public License as published by
**	the Free Software Foundation, either version 3 of the License, or
**	(at your option) any later version.
**
**	This program is distributed in the hope that it will be useful,
**	but WITHOUT ANY WARRANTY; without even the implied warranty of
**	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
**	GNU General Public License for more details.
**
**	You should have received a copy of the GNU General Public License
**	along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

#include "Common/RTS/AcademyStatsDozerSearch.h"

#include <iostream>

class CommandSet
{
};

namespace
{
	int failures = 0;

	void expect(const char *name, bool condition)
	{
		if (!condition)
		{
			std::cerr << name << " failed\n";
			++failures;
		}
	}
}

int main()
{
	const CommandSet first;
	const CommandSet second;
	const CommandSet *result = nullptr;

	expect("empty callback output", !AcademyStatsDozerSearch::hasResult(&result));
	AcademyStatsDozerSearch::recordFirst(&result, &first);
	expect("first command set returned", result == &first);
	expect("callback output reports a result", AcademyStatsDozerSearch::hasResult(&result));
	AcademyStatsDozerSearch::recordFirst(&result, &second);
	expect("first command set preserved", result == &first);

	result = nullptr;
	AcademyStatsDozerSearch::recordFirst(&result, nullptr);
	expect("null lookup ignored", result == nullptr);

	std::cout << "{\"ok\":" << (failures == 0 ? "true" : "false")
		<< ",\"checks\":5,\"failures\":" << failures << "}" << std::endl;
	return failures == 0 ? 0 : 1;
}
