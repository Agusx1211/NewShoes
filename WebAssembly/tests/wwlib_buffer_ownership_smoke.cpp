#include <cstddef>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <new>

#include "buff.h"

namespace {
unsigned g_array_allocations = 0;
unsigned g_array_deallocations = 0;

void reset_allocation_counts()
{
	g_array_allocations = 0;
	g_array_deallocations = 0;
}

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::fprintf(stderr, "%s\n", message);
		return false;
	}
	return true;
}

class InspectableBuffer : public Buffer
{
public:
	using Buffer::Buffer;
	using Buffer::operator=;

	InspectableBuffer(Buffer const &buffer) : Buffer(buffer) {}

	bool owns_memory() const { return IsAllocated; }
};

bool smoke_borrowed_buffer()
{
	char external[] = "ZH";
	reset_allocation_counts();
	{
		InspectableBuffer borrowed(external, sizeof(external));
		if (!expect(borrowed.Is_Valid(), "borrowed buffer should be valid") ||
			!expect(borrowed.Get_Buffer() == external, "borrowed buffer pointer changed") ||
			!expect(borrowed.Get_Size() == static_cast<long>(sizeof(external)),
				"borrowed buffer size changed") ||
			!expect(!borrowed.owns_memory(), "borrowed buffer should not own memory")) {
			return false;
		}
	}

	return expect(g_array_allocations == 0, "borrowed buffer allocated memory") &&
		expect(g_array_deallocations == 0, "borrowed buffer freed external memory") &&
		expect(std::strcmp(external, "ZH") == 0, "borrowed buffer contents changed");
}

bool smoke_copy_borrows_owner()
{
	reset_allocation_counts();
	void *owned_pointer = nullptr;
	{
		InspectableBuffer owned(16L);
		owned_pointer = owned.Get_Buffer();
		std::memset(owned.Get_Buffer(), 0x5a, static_cast<std::size_t>(owned.Get_Size()));
		if (!expect(owned.Is_Valid(), "owned buffer allocation failed") ||
			!expect(owned.owns_memory(), "owned buffer should own memory") ||
			!expect(g_array_allocations == 1, "owned buffer did not allocate once")) {
			return false;
		}

		{
			InspectableBuffer copy(owned);
			if (!expect(copy.Is_Valid(), "copied buffer should be valid") ||
				!expect(copy.Get_Buffer() == owned_pointer, "copied buffer should share pointer") ||
				!expect(copy.Get_Size() == 16, "copied buffer size changed") ||
				!expect(!copy.owns_memory(), "copied buffer should borrow memory")) {
				return false;
			}
		}

		if (!expect(g_array_deallocations == 0, "borrowed copy destructor freed owner memory")) {
			return false;
		}
	}

	return expect(g_array_deallocations == 1, "owned buffer destructor did not free memory");
}

bool smoke_assignment_releases_lhs_and_borrows_rhs()
{
	reset_allocation_counts();
	{
		InspectableBuffer owner(12L);
		InspectableBuffer assigned(6L);
		void *owner_pointer = owner.Get_Buffer();
		void *assigned_pointer = assigned.Get_Buffer();

		if (!expect(owner_pointer != nullptr && assigned_pointer != nullptr,
				"assignment smoke allocation failed") ||
			!expect(owner_pointer != assigned_pointer,
				"assignment smoke allocations unexpectedly alias") ||
			!expect(g_array_allocations == 2, "assignment smoke allocation count mismatch")) {
			return false;
		}

		assigned = owner;
		if (!expect(g_array_deallocations == 1, "assignment did not release previous owner") ||
			!expect(assigned.Get_Buffer() == owner_pointer, "assigned buffer did not borrow rhs pointer") ||
			!expect(assigned.Get_Size() == owner.Get_Size(), "assigned buffer size changed") ||
			!expect(!assigned.owns_memory(), "assigned buffer should not own rhs memory")) {
			return false;
		}
	}

	return expect(g_array_deallocations == 2,
		"assignment lifetime should free only the two original owning allocations");
}

bool smoke_reset_is_single_free()
{
	reset_allocation_counts();
	InspectableBuffer owned(5L);
	if (!expect(owned.Is_Valid(), "reset smoke allocation failed") ||
		!expect(owned.owns_memory(), "reset smoke buffer should own memory")) {
		return false;
	}

	owned.Reset();
	if (!expect(!owned.Is_Valid(), "reset should clear buffer pointer") ||
		!expect(owned.Get_Size() == 0, "reset should clear buffer size") ||
		!expect(!owned.owns_memory(), "reset should clear ownership") ||
		!expect(g_array_deallocations == 1, "reset should free owned memory once")) {
		return false;
	}

	owned.Reset();
	return expect(g_array_deallocations == 1, "second reset should not free again");
}
}

void *operator new[](std::size_t size)
{
	++g_array_allocations;
	if (void *memory = std::malloc(size)) {
		return memory;
	}
	throw std::bad_alloc();
}

void operator delete[](void *memory) noexcept
{
	if (memory != nullptr) {
		++g_array_deallocations;
	}
	std::free(memory);
}

void operator delete[](void *memory, std::size_t) noexcept
{
	operator delete[](memory);
}

int main()
{
	if (!smoke_borrowed_buffer() ||
		!smoke_copy_borrows_owner() ||
		!smoke_assignment_releases_lhs_and_borrows_rhs() ||
		!smoke_reset_is_single_free()) {
		return 1;
	}

	std::printf("{\"ok\":true,\"smoke\":\"wwlib-buffer-ownership\"}\n");
	return 0;
}
