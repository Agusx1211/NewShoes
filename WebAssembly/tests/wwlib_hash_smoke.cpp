#include <iostream>
#include <string>
#include <vector>

#include "hash.h"

namespace {
class TestEntry : public HashableClass
{
public:
	explicit TestEntry(const char *key) : Key(key) {}

	const char *Get_Key() override
	{
		return Key.c_str();
	}

private:
	std::string Key;
};

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}

bool contains(const std::vector<std::string> &keys, const char *key)
{
	for (const std::string &seen : keys) {
		if (seen == key) {
			return true;
		}
	}
	return false;
}
}

int main()
{
	HashTableClass table(8);
	TestEntry alpha("Alpha");
	TestEntry bravo("bravo");
	TestEntry charlie("CHARLIE");
	TestEntry missing("missing");

	table.Add(&alpha);
	table.Add(&bravo);
	table.Add(&charlie);

	if (!expect(table.Find("alpha") == &alpha, "case-insensitive find failed for Alpha")) {
		return 1;
	}
	if (!expect(table.Find("BRAVO") == &bravo, "case-insensitive find failed for bravo")) {
		return 1;
	}
	if (!expect(table.Find("charlie") == &charlie, "case-insensitive find failed for CHARLIE")) {
		return 1;
	}
	if (!expect(table.Find("delta") == nullptr, "find returned an unexpected entry")) {
		return 1;
	}

	std::vector<std::string> iterated_keys;
	HashTableIteratorClass iterator(table);
	for (iterator.First(); !iterator.Is_Done(); iterator.Next()) {
		iterated_keys.emplace_back(iterator.Get_Current()->Get_Key());
	}
	if (!expect(iterated_keys.size() == 3, "iterator did not visit every entry")) {
		return 1;
	}
	if (!expect(contains(iterated_keys, "Alpha") && contains(iterated_keys, "bravo") &&
			contains(iterated_keys, "CHARLIE"),
			"iterator visited unexpected keys")) {
		return 1;
	}

	if (!expect(table.Remove(&bravo), "remove failed for existing entry")) {
		return 1;
	}
	if (!expect(table.Find("bravo") == nullptr, "removed entry is still findable")) {
		return 1;
	}
	if (!expect(!table.Remove(&missing), "remove succeeded for missing entry")) {
		return 1;
	}

	table.Reset();
	if (!expect(table.Find("alpha") == nullptr && table.Find("charlie") == nullptr,
			"reset did not clear hash table buckets")) {
		return 1;
	}

	HashTableIteratorClass empty_iterator(table);
	empty_iterator.First();
	if (!expect(empty_iterator.Is_Done(), "iterator over reset table should be done")) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"WWLib\","
		"\"compiled\":\"hash.cpp\",\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
