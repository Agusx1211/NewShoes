#pragma once

#ifndef MUTEX_H
#define MUTEX_H

#include <atomic>

class MutexClass
{
	std::atomic_flag Flag = ATOMIC_FLAG_INIT;

	bool Lock(int)
	{
		while (Flag.test_and_set(std::memory_order_acquire)) {
		}
		return true;
	}

	void Unlock()
	{
		Flag.clear(std::memory_order_release);
	}

public:
	explicit MutexClass(const char * = nullptr) {}
	~MutexClass() = default;

	enum {
		WAIT_INFINITE = -1
	};

	class LockClass
	{
		MutexClass &Mutex;
		bool failed;
	public:
		LockClass(MutexClass &mutex, int time = MutexClass::WAIT_INFINITE)
			: Mutex(mutex), failed(!Mutex.Lock(time))
		{
		}

		~LockClass()
		{
			if (!failed) {
				Mutex.Unlock();
			}
		}

		bool Failed()
		{
			return failed;
		}

	private:
		LockClass &operator=(const LockClass &) { return *this; }
	};
	friend class LockClass;
};

class CriticalSectionClass
{
	std::atomic_flag Flag = ATOMIC_FLAG_INIT;

	void Lock()
	{
		while (Flag.test_and_set(std::memory_order_acquire)) {
		}
	}

	void Unlock()
	{
		Flag.clear(std::memory_order_release);
	}

public:
	CriticalSectionClass() = default;
	~CriticalSectionClass() = default;

	class LockClass
	{
		CriticalSectionClass &CriticalSection;
	public:
		explicit LockClass(CriticalSectionClass &critical_section)
			: CriticalSection(critical_section)
		{
			CriticalSection.Lock();
		}

		~LockClass()
		{
			CriticalSection.Unlock();
		}

	private:
		LockClass &operator=(const LockClass &) { return *this; }
	};
	friend class LockClass;
};

class FastCriticalSectionClass
{
	std::atomic_flag Flag = ATOMIC_FLAG_INIT;

public:
	FastCriticalSectionClass() = default;

	class LockClass
	{
		FastCriticalSectionClass &CriticalSection;
	public:
		explicit LockClass(FastCriticalSectionClass &critical_section)
			: CriticalSection(critical_section)
		{
			while (CriticalSection.Flag.test_and_set(std::memory_order_acquire)) {
			}
		}

		~LockClass()
		{
			CriticalSection.Flag.clear(std::memory_order_release);
		}

	private:
		LockClass &operator=(const LockClass &);
		LockClass(const LockClass &);
	};

	friend class LockClass;
};

#endif
