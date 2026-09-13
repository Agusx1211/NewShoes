#include <cstdio>

#include "PreRTS.h"

#include "Common/ObjectStatusTypes.h"
#include "GameLogic/WeaponSetType.h"
#include "GameLogic/PartitionManager.h"

// Subsystem registration is outside this focused lifecycle test.
SubsystemInterfaceList *TheSubsystemList = NULL;

// Expose the production class's protected destructor for stack ownership in this test only.
class TestPartitionData final : public PartitionData
{
public:
	~TestPartitionData() override = default;
};

int main()
{
	PartitionManager *savedPartitionManager = ThePartitionManager;
	Bool pendingBeforeDetach = FALSE;
	Bool detachedIsClean = FALSE;
	Bool occupancyCorrect = TRUE;
	Bool playerMaskCorrect = TRUE;
	{
		PartitionManager manager;
		ThePartitionManager = &manager;
		{
			TestPartitionData data;
			PartitionQueryIndex index;
			index.init(65, 2);
			for (Int x : {0, 31, 32, 63, 64})
			{
				PartitionCell cell;
				cell.init(x, 1, 0.0f, 0.0f);
				unsigned int* word = index.occupancyWord(x, 1);
				cell.setOccupancyWord(word);
				const unsigned int before = *word, mask = 1u << (x & 31);
				CellAndObjectIntersection first, second;
				playerMaskCorrect &= cell.getPlayerMask(1) == 0;
				first.addCoverage(&cell, &data);
				first.addCoverage(&cell, &data); // Repeated coverage must not duplicate it.
				second.addCoverage(&cell, &data);
				occupancyCorrect &= *word == (before | mask) && cell.getCoiCount() == 2;
				// A ghost/no-object intersection must conservatively retain the
				// cell. Membership edits invalidate a previously cached mask.
				playerMaskCorrect &= cell.getPlayerMask(1) == 0x80000000u;
				first.removeAllCoverage();
				occupancyCorrect &= *word == (before | mask) && cell.getCoiCount() == 1;
				playerMaskCorrect &= cell.getPlayerMask(1) == 0x80000000u;
				second.removeAllCoverage();
				occupancyCorrect &= *word == before && cell.getFirstCoiInCell() == NULL;
				playerMaskCorrect &= cell.getPlayerMask(1) == 0;
			}
			data.makeDirty(TRUE);
			pendingBeforeDetach = manager.isInListDirtyModules(&data);
			data.detachFromGhostObject();
			detachedIsClean = !manager.isInListDirtyModules(&data);
		}
		ThePartitionManager = savedPartitionManager;
	}

	std::printf(
		"{\"pendingBeforeDetach\":%s,\"detachedIsClean\":%s,\"occupancyCorrect\":%s,\"playerMaskCorrect\":%s}\n",
		pendingBeforeDetach ? "true" : "false",
		detachedIsClean ? "true" : "false", occupancyCorrect ? "true" : "false",
		playerMaskCorrect ? "true" : "false");
	return pendingBeforeDetach && detachedIsClean && occupancyCorrect && playerMaskCorrect ? 0 : 1;
}
