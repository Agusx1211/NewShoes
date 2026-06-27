#include <cstring>
#include <iostream>

#include "cpudetect.h"

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
	unsigned eax = 0xdeadbeef;
	unsigned ebx = 0xdeadbeef;
	unsigned ecx = 0xdeadbeef;
	unsigned edx = 0xdeadbeef;
	const bool cpuid = CPUDetectClass::CPUID(eax, ebx, ecx, edx, 0);
	if (!expect(!cpuid && eax == 0 && ebx == 0 && ecx == 0 && edx == 0,
			"wasm CPUID fallback should report unavailable with zeroed registers")) {
		return 1;
	}

	if (!expect(!CPUDetectClass::Has_CPUID_Instruction(), "CPUID should be unavailable on wasm") ||
			!expect(!CPUDetectClass::Has_RDTSC_Instruction(), "RDTSC should be unavailable on wasm") ||
			!expect(!CPUDetectClass::Has_CMOV_Instruction(), "CMOV should be unavailable on wasm") ||
			!expect(!CPUDetectClass::Has_MMX_Instruction_Set(), "MMX should be unavailable on wasm") ||
			!expect(!CPUDetectClass::Has_SSE_Instruction_Set(), "SSE should be unavailable on wasm") ||
			!expect(!CPUDetectClass::Has_SSE2_Instruction_Set(), "SSE2 should be unavailable on wasm") ||
			!expect(!CPUDetectClass::Has_3DNow_Instruction_Set(), "3DNow should be unavailable on wasm") ||
			!expect(!CPUDetectClass::Has_Extended_3DNow_Instruction_Set(),
				"extended 3DNow should be unavailable on wasm")) {
		return 1;
	}

	if (!expect(CPUDetectClass::Get_Processor_Manufacturer() == CPUDetectClass::MANUFACTURER_UNKNOWN,
			"processor manufacturer should remain unknown without CPUID") ||
			!expect(std::strcmp(CPUDetectClass::Get_Processor_Manufacturer_Name(), "<Unknown>") == 0,
				"processor manufacturer name mismatch") ||
			!expect(std::strcmp(CPUDetectClass::Get_Processor_String(), "<Unknown>") == 0,
				"processor string mismatch")) {
		return 1;
	}

	if (!expect(CPUDetectClass::Get_Processor_Speed() == 0, "processor speed should be unavailable") ||
			!expect(CPUDetectClass::Get_Processor_Ticks_Per_Second() == 0,
				"processor ticks should be unavailable") ||
			!expect(CPUDetectClass::Get_Inv_Processor_Ticks_Per_Second() == 0.0,
				"inverse processor ticks should be unavailable") ||
			!expect(CPUDetectClass::Get_Feature_Bits() == 0, "feature bits should be zero") ||
			!expect(CPUDetectClass::Get_Extended_Feature_Bits() == 0,
				"extended feature bits should be zero")) {
		return 1;
	}

	if (!expect(CPUDetectClass::Get_L1_Data_Cache_Size() == 0, "L1 data cache should be unknown") ||
			!expect(CPUDetectClass::Get_L1_Instruction_Cache_Size() == 0,
				"L1 instruction cache should be unknown") ||
			!expect(CPUDetectClass::Get_L1_Instruction_Trace_Cache_Size() == 0,
				"L1 instruction trace cache should be unknown") ||
			!expect(CPUDetectClass::Get_L2_Cache_Size() == 0, "L2 cache should be unknown")) {
		return 1;
	}

	const unsigned total_physical = CPUDetectClass::Get_Total_Physical_Memory();
	const unsigned available_physical = CPUDetectClass::Get_Available_Physical_Memory();
	const unsigned total_page = CPUDetectClass::Get_Total_Page_File_Size();
	const unsigned available_page = CPUDetectClass::Get_Available_Page_File_Size();
	const unsigned total_virtual = CPUDetectClass::Get_Total_Virtual_Memory();
	const unsigned available_virtual = CPUDetectClass::Get_Available_Virtual_Memory();
	if (!expect(total_physical > 0, "wasm heap size should be reported as physical memory") ||
			!expect(available_physical <= total_physical,
				"available physical memory should not exceed total") ||
			!expect(total_page >= total_physical, "page-file total should cover the current heap") ||
			!expect(available_page <= total_page, "available page memory should not exceed total") ||
			!expect(total_virtual >= total_physical, "virtual total should cover the current heap") ||
			!expect(available_virtual <= total_virtual,
				"available virtual memory should not exceed total")) {
		return 1;
	}

	const char *processor_log = CPUDetectClass::Get_Processor_Log().Peek_Buffer();
	const char *compact_log = CPUDetectClass::Get_Compact_Log().Peek_Buffer();
	if (!expect(processor_log != nullptr && std::strstr(processor_log, "Operating System: Windows NT") != nullptr,
			"processor log should include shimmed OS information") ||
			!expect(std::strstr(processor_log, "Processor: <Unknown>") != nullptr,
				"processor log should include the unknown CPU string") ||
			!expect(std::strstr(processor_log, "CPUID: No") != nullptr,
				"processor log should record unavailable CPUID") ||
			!expect(std::strstr(processor_log, "RDTSC: No") != nullptr,
				"processor log should record unavailable RDTSC") ||
			!expect(compact_log != nullptr && compact_log[0] != '\0',
				"compact CPU log should be populated")) {
		return 1;
	}

	std::cout
		<< "{\"compiled\":\"cpudetect.cpp\","
		<< "\"cpuid\":false,"
		<< "\"rdtsc\":false,"
		<< "\"totalPhysical\":" << total_physical
		<< ",\"availablePhysical\":" << available_physical
		<< "}\n";
	return 0;
}
