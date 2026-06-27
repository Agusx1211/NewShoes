#pragma once

#include "Common/GameMemory.h"

class ScopedOriginalMemoryManager
{
public:
	ScopedOriginalMemoryManager()
	{
		if (!isMemoryManagerOfficiallyInited()) {
			initMemoryManager();
			m_initialized_here = true;
		}
	}

	~ScopedOriginalMemoryManager()
	{
		if (m_initialized_here) {
			shutdownMemoryManager();
		}
	}

	ScopedOriginalMemoryManager(const ScopedOriginalMemoryManager &) = delete;
	ScopedOriginalMemoryManager &operator=(const ScopedOriginalMemoryManager &) = delete;

private:
	bool m_initialized_here = false;
};
