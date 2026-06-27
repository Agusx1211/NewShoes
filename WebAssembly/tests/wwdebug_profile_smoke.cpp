#include <cstring>
#include <iostream>

#include "fastallocator.h"
#include "wwmemlog.h"
#include "wwprofile.h"

namespace {
bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}
}

int main()
{
	WWProfileManager::Enable_Profile(true);
	WWProfileManager::Reset();
	WWProfileManager::Start_Profile("Frame");
	WWProfileManager::Start_Profile("Simulation");
	WWProfileManager::Stop_Profile();
	WWProfileManager::Stop_Profile();
	WWProfileManager::Increment_Frame_Counter();

	if (!expect(WWProfileManager::Get_Frame_Count_Since_Reset() == 1,
			"profile frame counter did not increment")) {
		return 1;
	}

	WWProfileIterator *iterator = WWProfileManager::Get_Iterator();
	iterator->First();
	if (!expect(!iterator->Is_Done() &&
			std::strcmp(iterator->Get_Current_Name(), "Frame") == 0 &&
			iterator->Get_Current_Total_Calls() == 1,
			"profile root child was not recorded")) {
		WWProfileManager::Release_Iterator(iterator);
		return 1;
	}

	iterator->Enter_Child();
	if (!expect(!iterator->Is_Done() &&
			std::strcmp(iterator->Get_Current_Name(), "Simulation") == 0 &&
			iterator->Get_Current_Total_Calls() == 1,
			"profile nested child was not recorded")) {
		WWProfileManager::Release_Iterator(iterator);
		return 1;
	}
	WWProfileManager::Release_Iterator(iterator);

	WWMemoryLogClass::Reset_Counters();
	void *logged_memory = WWMemoryLogClass::Allocate_Memory(64);
	if (!expect(logged_memory != nullptr &&
			WWMemoryLogClass::Get_Allocate_Count() == 1,
			"memory log allocation counter failed")) {
		return 1;
	}
	WWMemoryLogClass::Release_Memory(logged_memory);
	if (!expect(WWMemoryLogClass::Get_Free_Count() == 1,
			"memory log free counter failed")) {
		return 1;
	}

	FastAllocatorGeneral *allocator = FastAllocatorGeneral::Get_Allocator();
	const unsigned count_before = allocator->Get_Total_Allocation_Count();
	void *fast_memory = allocator->Alloc(32);
	if (!expect(fast_memory != nullptr &&
			allocator->Get_Total_Allocation_Count() == count_before + 1,
			"fast allocator allocation accounting failed")) {
		return 1;
	}
	allocator->Free(fast_memory);
	if (!expect(allocator->Get_Total_Allocation_Count() == count_before,
			"fast allocator free accounting failed")) {
		return 1;
	}

	/*
	** Browser `_UNIX` memory-log contract: original wwmemlog.cpp force-disables
	** category accounting under `_UNIX` (DISABLE_MEMLOG=1, so no per-allocation
	** MemoryLogStruct header and no category charging) while keeping the
	** allocate/free counters and the category introspection API intact. Pin
	** that contract so a future wasm-safe memory-log mode has to update this
	** smoke deliberately rather than silently changing browser allocation
	** behavior.
	*/
	if (!expect(!WWMemoryLogClass::Is_Memory_Log_Enabled(),
			"memory log should be disabled in the browser _UNIX build")) {
		return 1;
	}

	if (!expect(WWMemoryLogClass::Get_Category_Count() == MEM_COUNT,
			"memory log category count should report MEM_COUNT")) {
		return 1;
	}

	const char *texture_name = WWMemoryLogClass::Get_Category_Name(MEM_TEXTURE);
	const char *renderer_name = WWMemoryLogClass::Get_Category_Name(MEM_RENDERER);
	if (!expect(texture_name != nullptr &&
			std::strcmp(texture_name, "Texture") == 0 &&
			renderer_name != nullptr &&
			std::strcmp(renderer_name, "Renderer") == 0,
			"memory log category name table should be intact")) {
		return 1;
	}

	void *untracked_memory = WWMemoryLogClass::Allocate_Memory(48);
	if (!expect(untracked_memory != nullptr &&
			WWMemoryLogClass::Get_Current_Allocated_Memory(MEM_TEXTURE) == 0 &&
			WWMemoryLogClass::Get_Peak_Allocated_Memory(MEM_TEXTURE) == 0,
			"disabled memory log must not charge categories")) {
		return 1;
	}
	WWMemoryLogClass::Release_Memory(untracked_memory);

	/*
	** The enable flag toggles but, without USE_MEMLOG-defined WWMEMLOG macros,
	** does not restore category accounting in the browser build.
	*/
	WWMemoryLogClass::Enable_Memory_Log(true);
	void *still_untracked_memory = WWMemoryLogClass::Allocate_Memory(48);
	bool enable_flag_inert = still_untracked_memory != nullptr &&
		WWMemoryLogClass::Is_Memory_Log_Enabled() &&
		WWMemoryLogClass::Get_Current_Allocated_Memory(MEM_TEXTURE) == 0 &&
		WWMemoryLogClass::Get_Peak_Allocated_Memory(MEM_TEXTURE) == 0;
	if (still_untracked_memory != nullptr) {
		WWMemoryLogClass::Release_Memory(still_untracked_memory);
	}
	WWMemoryLogClass::Enable_Memory_Log(false);
	if (!expect(enable_flag_inert,
			"memory log enable flag must not charge categories without USE_MEMLOG")) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"WWDebug\","
		"\"compiled\":\"FastAllocator.cpp,wwmemlog.cpp,wwprofile.cpp\","
		"\"memLogCategoryTracking\":\"disabled-browser-unix-build\","
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
