#include "GameLogic/PartitionQueryIndex.h"

#include <cmath>
#include <cstdio>
#include <random>
#include <vector>

struct Offset { int x, y; };

int main()
{
	std::mt19937 random(169205);
	const int dimensions[][2] = {{1, 1}, {2, 3}, {31, 5}, {32, 7}, {33, 9}, {65, 11}, {96, 64}};
	unsigned checks = 0;
	PartitionQueryIndex index;
	for (const auto& dimension : dimensions)
	{
		const int width = dimension[0], height = dimension[1], maxRadius = width + height;
		for (int irregular = 0; irregular < 2; ++irregular)
		{
			index.init(width, height);
			std::vector<std::vector<Offset>> original(maxRadius + 1);
			for (int y = -height + 1; y < height; ++y)
				for (int x = -width + 1; x < width; ++x)
				{
					const int dx = std::max(0, std::abs(x) - 1), dy = std::max(0, std::abs(y) - 1);
					const int radius = irregular ? random() % (maxRadius + 1)
						: static_cast<int>(std::ceil(std::sqrt(dx * dx + dy * dy)));
					// Some deliberately absent offsets verify that no radius-zero
					// candidates are invented for entries omitted by the source table.
					if (irregular && random() % 7 == 0) continue;
					original[radius].push_back({x, y});
					index.setRadius(x, y, radius);
				}
			index.finishRadii();
			for (int density : {0, 1, 10, 50, 100})
			{
				std::vector<bool> occupied(width * height);
				for (int y = 0; y < height; ++y)
					for (int x = 0; x < width; ++x)
					{
						occupied[y * width + x] = random() % 100 < static_cast<unsigned>(density);
						unsigned int* word = index.occupancyWord(x, y);
						const unsigned int mask = 1u << (x & 31);
						*word = occupied[y * width + x] ? *word | mask : *word & ~mask;
					}
				for (int centerX : {-width, -1, 0, width / 2, width - 1, width, width * 2})
					for (int centerY : {-height, -1, 0, height / 2, height - 1, height, height * 2})
						for (int limit : {0, 1, 2, 8, 9, 20, maxRadius})
						{
							if (limit > maxRadius) continue;
							std::vector<int> reference, actual;
							for (int radius = 0; radius <= limit; ++radius)
								for (const Offset& offset : original[radius])
								{
									const int x = centerX + offset.x, y = centerY + offset.y;
									if (x >= 0 && x < width && y >= 0 && y < height && occupied[y * width + x])
										reference.push_back(y * width + x);
								}
							index.build(centerX, centerY, limit);
							for (int radius = 0; radius <= limit; ++radius)
								for (int cell = index.firstCell(radius); cell >= 0; cell = index.nextCell(cell))
									actual.push_back(cell);
							if (actual != reference)
							{
								std::fprintf(stderr, "Traversal mismatch: %dx%d center=%d,%d radius=%d density=%d irregular=%d\n",
									width, height, centerX, centerY, limit, density, irregular);
								return 1;
							}
							++checks;
							actual.clear();
							for (int first = 0, last = 8; first <= limit; first = last + 1, last = last * 2)
							{
								last = std::min(last, limit);
								index.build(centerX, centerY, last, first);
								for (int radius = first; radius <= last; ++radius)
									for (int cell = index.firstCell(radius); cell >= 0; cell = index.nextCell(cell))
										actual.push_back(cell);
							}
							if (actual != reference)
							{
								std::fprintf(stderr, "Banded traversal mismatch\n");
								return 1;
							}
							++checks;
						}
			}
			index.clear();
		}
	}
	std::printf("{\"ok\":true,\"checks\":%u}\n", checks);
	return 0;
}
