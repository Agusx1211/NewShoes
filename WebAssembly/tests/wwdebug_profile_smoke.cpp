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

	std::cout << "{\"ok\":true,\"library\":\"WWDebug\","
		"\"compiled\":\"FastAllocator.cpp,wwmemlog.cpp,wwprofile.cpp\","
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
