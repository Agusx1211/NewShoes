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

#include "GameNetwork/GameSpy/LobbyGameSort.h"

#include <iostream>

namespace
{
	int failures = 0;

	void expectOrder(
		const char *name,
		GameSpyLobbySort::CRCCompatibilityOrder actual,
		GameSpyLobbySort::CRCCompatibilityOrder expected)
	{
		if (actual != expected)
		{
			std::cerr << name << ": expected " << expected << ", got " << actual << '\n';
			++failures;
		}
	}
}

int main()
{
	const unsigned int localExeCRC = 0x12345678U;
	const unsigned int localIniCRC = 0x87654321U;

	expectOrder(
		"compatible before executable mismatch",
		GameSpyLobbySort::compareCRCCompatibility(
			localExeCRC, localIniCRC, localExeCRC + 1U, localIniCRC, localExeCRC, localIniCRC),
		GameSpyLobbySort::CRC_COMPATIBILITY_FIRST);
	expectOrder(
		"executable mismatch after compatible",
		GameSpyLobbySort::compareCRCCompatibility(
			localExeCRC + 1U, localIniCRC, localExeCRC, localIniCRC, localExeCRC, localIniCRC),
		GameSpyLobbySort::CRC_COMPATIBILITY_SECOND);
	expectOrder(
		"compatible before INI mismatch",
		GameSpyLobbySort::compareCRCCompatibility(
			localExeCRC, localIniCRC, localExeCRC, localIniCRC + 1U, localExeCRC, localIniCRC),
		GameSpyLobbySort::CRC_COMPATIBILITY_FIRST);
	expectOrder(
		"INI mismatch after compatible",
		GameSpyLobbySort::compareCRCCompatibility(
			localExeCRC, localIniCRC + 1U, localExeCRC, localIniCRC, localExeCRC, localIniCRC),
		GameSpyLobbySort::CRC_COMPATIBILITY_SECOND);
	expectOrder(
		"compatible tie",
		GameSpyLobbySort::compareCRCCompatibility(
			localExeCRC, localIniCRC, localExeCRC, localIniCRC, localExeCRC, localIniCRC),
		GameSpyLobbySort::CRC_COMPATIBILITY_TIED);
	expectOrder(
		"mismatch tie",
		GameSpyLobbySort::compareCRCCompatibility(
			localExeCRC + 1U, localIniCRC, localExeCRC, localIniCRC + 1U, localExeCRC, localIniCRC),
		GameSpyLobbySort::CRC_COMPATIBILITY_TIED);

	std::cout << "{\"ok\":" << (failures == 0 ? "true" : "false")
		<< ",\"checks\":6,\"failures\":" << failures << "}" << std::endl;
	return failures == 0 ? 0 : 1;
}
