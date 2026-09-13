#include "GameLogic/SleepyUpdateRemoval.h"

#include <algorithm>
#include <cstdio>
#include <random>
#include <vector>

// Test doubles for scheduler entries; the collection algorithm is production code.
struct Update
{
	int index;
	int owner;
	int friend_getIndexInLogic() const { return index; }
};

int main()
{
	std::mt19937 random(169205);
	unsigned checks = 0;
	for (int trial = 0; trial < 400; ++trial)
	{
		// Include empty heaps, unrelated entries, sleeping entries, and objects
		// exceeding the legacy 256-entry collection limit.
		const int size = trial < 10 ? trial : random() % 5000;
		std::vector<Update> heap(size);
		std::vector<Update*> modules;
		std::vector<Update*> reference;
		for (int i = 0; i < size; ++i)
		{
			heap[i].index = i;
			heap[i].owner = random() % (trial % 7 + 1);
			if (heap[i].owner == 0)
			{
				modules.push_back(&heap[i]);
				if (reference.size() < 256)
					reference.push_back(&heap[i]);
			}
		}
		Update unscheduled = { -1, 0 };
		modules.push_back(&unscheduled);
		for (int order = 0; order < 8; ++order)
		{
			std::shuffle(modules.begin(), modules.end(), random);
			Update* actual[256];
			int count = 0;
			for (Update* update : modules)
				insertSleepyUpdateForRemoval(update, actual, count);
			if (count != static_cast<int>(reference.size())
				|| !std::equal(reference.begin(), reference.end(), actual))
			{
				std::fprintf(stderr, "Removal order mismatch: trial=%d order=%d\n", trial, order);
				return 1;
			}
			++checks;
		}
	}
	std::printf("{\"ok\":true,\"checks\":%u}\n", checks);
	return 0;
}
