#include "mutex.h"

#include <iostream>

namespace {
bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << '\n';
	}
	return condition;
}
} // namespace

int main()
{
	MutexClass mutex;
	{
		MutexClass::LockClass lock(mutex);
		if (!expect(!lock.Failed(), "MutexClass default lock failed")) {
			return 1;
		}
	}

	{
		MutexClass::LockClass lock(mutex, 0);
		if (!expect(!lock.Failed(), "MutexClass zero-time lock failed")) {
			return 1;
		}
	}

	CriticalSectionClass critical_section;
	{
		CriticalSectionClass::LockClass lock(critical_section);
	}

	FastCriticalSectionClass fast_critical_section;
	{
		FastCriticalSectionClass::LockClass lock(fast_critical_section);
	}

	std::cout << "{\"ok\":true,\"library\":\"WWLib\","
		"\"compiled\":\"mutex.cpp\","
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
