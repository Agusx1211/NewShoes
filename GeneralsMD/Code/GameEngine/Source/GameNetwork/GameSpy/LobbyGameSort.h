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

#pragma once

namespace GameSpyLobbySort
{
	enum CRCCompatibilityOrder
	{
		CRC_COMPATIBILITY_SECOND = -1,
		CRC_COMPATIBILITY_TIED = 0,
		CRC_COMPATIBILITY_FIRST = 1,
	};

	inline CRCCompatibilityOrder compareCRCCompatibility(
		unsigned int firstExeCRC,
		unsigned int firstIniCRC,
		unsigned int secondExeCRC,
		unsigned int secondIniCRC,
		unsigned int localExeCRC,
		unsigned int localIniCRC)
	{
		const bool firstCompatible = firstExeCRC == localExeCRC && firstIniCRC == localIniCRC;
		const bool secondCompatible = secondExeCRC == localExeCRC && secondIniCRC == localIniCRC;
		if (firstCompatible == secondCompatible)
		{
			return CRC_COMPATIBILITY_TIED;
		}

		return firstCompatible ? CRC_COMPATIBILITY_FIRST : CRC_COMPATIBILITY_SECOND;
	}
}
