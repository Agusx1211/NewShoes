/*
** Command & Conquer Generals Zero Hour(tm)
** Copyright 2025 Electronic Arts Inc.
** SPDX-License-Identifier: GPL-3.0-or-later
*/

#ifndef PARTITION_QUERY_INDEX_H
#define PARTITION_QUERY_INDEX_H

#include <algorithm>
#include <vector>

// Derived search data, rebuilt with the partition grid. The simulation still
// owns objects in each PartitionCell's original COI list. This index only skips
// empty cells, retaining radius, row, column, and COI order for deterministic
// filtering and equal-distance ties.
class PartitionQueryIndex
{
public:
	PartitionQueryIndex() : m_width(0), m_height(0), m_wordsPerRow(0) {}

	void init(int width, int height)
	{
		m_width = width;
		m_height = height;
		m_wordsPerRow = (width + 31) / 32;
		m_occupied.assign(m_wordsPerRow * height, 0);
		m_radius.assign((width * 2 - 1) * (height * 2 - 1), -1);
		m_next.assign(width * height, -1);
		m_first.assign(width + height + 1, -1);
		m_last.resize(m_first.size());
		m_extentX.assign(m_first.size(), 0);
		m_extentY.assign(m_first.size(), 0);
	}

	void clear()
	{
		m_occupied.clear();
		m_radius.clear();
		m_next.clear();
		m_first.clear();
		m_last.clear();
		m_extentX.clear();
		m_extentY.clear();
		m_width = m_height = m_wordsPerRow = 0;
	}

	unsigned int* occupancyWord(int x, int y)
	{
		return &m_occupied[y * m_wordsPerRow + (x >> 5)];
	}

	void setRadius(int dx, int dy, int radius)
	{
		m_radius[(dy + m_height - 1) * (m_width * 2 - 1) + dx + m_width - 1] = radius;
		m_extentX[radius] = (std::max)(m_extentX[radius], dx < 0 ? -dx : dx);
		m_extentY[radius] = (std::max)(m_extentY[radius], dy < 0 ? -dy : dy);
	}

	void finishRadii()
	{
		for (unsigned int radius = 1; radius < m_first.size(); ++radius)
		{
			m_extentX[radius] = (std::max)(m_extentX[radius], m_extentX[radius - 1]);
			m_extentY[radius] = (std::max)(m_extentY[radius], m_extentY[radius - 1]);
		}
	}

	// getClosestObjects is already non-reentrant. Its range searches can reuse
	// this scratch storage without allocating memory for each querying unit.
	void build(int centerX, int centerY, int maxRadius, int minRadius = 0)
	{
		std::fill(m_first.begin() + minRadius, m_first.begin() + maxRadius + 1, -1);
		// Use the original table's bounds, including its floating-point rounding.
		const int extentX = m_extentX[maxRadius];
		const int extentY = m_extentY[maxRadius];
		const int firstX = (std::max)(0, centerX - extentX);
		const int lastX = (std::min)(m_width - 1, centerX + extentX);
		const int firstY = (std::max)(0, centerY - extentY);
		const int lastY = (std::min)(m_height - 1, centerY + extentY);
		if (firstX > lastX || firstY > lastY)
			return;

		for (int y = firstY; y <= lastY; ++y)
		{
			const int radiusRow = (y - centerY + m_height - 1) * (m_width * 2 - 1);
			for (int wordX = firstX >> 5; wordX <= (lastX >> 5); ++wordX)
			{
				unsigned int bits = m_occupied[y * m_wordsPerRow + wordX];
				if (wordX == (firstX >> 5))
					bits &= ~0u << (firstX & 31);
				if (wordX == (lastX >> 5))
					bits &= ~0u >> (31 - (lastX & 31));
				while (bits)
				{
					const int x = wordX * 32 + firstSetBit(bits);
					bits &= bits - 1;
					const int radius = m_radius[radiusRow + x - centerX + m_width - 1];
					if (radius < minRadius || radius > maxRadius)
						continue;
					const int cell = y * m_width + x;
					if (m_first[radius] < 0)
						m_first[radius] = cell;
					else
						m_next[m_last[radius]] = cell;
					m_last[radius] = cell;
					m_next[cell] = -1;
				}
			}
		}
	}

	int firstCell(int radius) const { return m_first[radius]; }
	int nextCell(int cell) const { return m_next[cell]; }

private:
	static int firstSetBit(unsigned int bits)
	{
#if defined(__GNUC__) || defined(__clang__)
		return __builtin_ctz(bits);
#else
		int bit = 0;
		while ((bits & 1u) == 0)
		{
			bits >>= 1;
			++bit;
		}
		return bit;
#endif
	}

	int m_width;
	int m_height;
	int m_wordsPerRow;
	std::vector<unsigned int> m_occupied;
	std::vector<int> m_radius;
	std::vector<int> m_next;
	std::vector<int> m_first;
	std::vector<int> m_last;
	std::vector<int> m_extentX;
	std::vector<int> m_extentY;
};

#endif
