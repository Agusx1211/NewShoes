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
	{
		PartitionManager manager;
		ThePartitionManager = &manager;
		{
			TestPartitionData data;
			data.makeDirty(TRUE);
			pendingBeforeDetach = manager.isInListDirtyModules(&data);
			data.detachFromGhostObject();
			detachedIsClean = !manager.isInListDirtyModules(&data);
		}
		ThePartitionManager = savedPartitionManager;
	}

	std::printf(
		"{\"pendingBeforeDetach\":%s,\"detachedIsClean\":%s}\n",
		pendingBeforeDetach ? "true" : "false",
		detachedIsClean ? "true" : "false");
	return pendingBeforeDetach && detachedIsClean ? 0 : 1;
}
