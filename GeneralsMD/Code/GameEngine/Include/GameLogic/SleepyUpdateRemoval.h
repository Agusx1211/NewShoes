/*
** Command & Conquer Generals Zero Hour(tm)
** Copyright 2025 Electronic Arts Inc.
** SPDX-License-Identifier: GPL-3.0-or-later
*/

#ifndef SLEEPY_UPDATE_REMOVAL_H
#define SLEEPY_UPDATE_REMOVAL_H

// Collect the first Capacity entries in heap order without scanning the heap.
// Removal must retain that order: equal-priority updates can otherwise run in
// a different order after the heap is repaired, changing the simulation.
template <class UpdatePointer, int Capacity>
inline void insertSleepyUpdateForRemoval(
	UpdatePointer update, UpdatePointer (&updates)[Capacity], int& count)
{
	const int index = update->friend_getIndexInLogic();
	if (index < 0)
		return;

	int position = count;
	while (position > 0 && updates[position - 1]->friend_getIndexInLogic() > index)
	{
		if (position < Capacity)
			updates[position] = updates[position - 1];
		--position;
	}
	if (position < Capacity)
	{
		updates[position] = update;
		if (count < Capacity)
			++count;
	}
}

#endif
