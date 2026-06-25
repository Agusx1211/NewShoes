#include <iostream>

#include "multilist.h"
#include "simplevec.h"
#include "slist.h"

namespace {
bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}

class ListItem final : public MultiListObjectClass
{
public:
	explicit ListItem(int value) : Value(value) {}

	int Value;
};

class IntDynVec final : public SimpleDynVecClass<int>
{
public:
	int Find_Value(int value)
	{
		return Find_Index(value);
	}
};
}

int main()
{
	IntDynVec values;
	for (int index = 0; index < 6; ++index) {
		if (!expect(values.Add(index * 10), "SimpleDynVecClass add failed")) {
			return 1;
		}
	}
	if (!expect(values.Count() == 6 && values[3] == 30, "SimpleDynVecClass add/count mismatch")) {
		return 1;
	}

	int *tail = values.Add_Multiple(2);
	tail[0] = 60;
	tail[1] = 70;
	if (!expect(values.Count() == 8 && values[7] == 70, "SimpleDynVecClass Add_Multiple mismatch")) {
		return 1;
	}

	if (!expect(values.Delete_Range(2, 1), "SimpleDynVecClass indexed delete failed")) {
		return 1;
	}
	if (!expect(values.Count() == 7 && values[2] == 30, "SimpleDynVecClass indexed delete mismatch")) {
		return 1;
	}
	if (!expect(values.Find_Value(60) == 5, "SimpleDynVecClass Find_Index mismatch")) {
		return 1;
	}
	if (!expect(values.Delete_Range(4, 2), "SimpleDynVecClass Delete_Range failed")) {
		return 1;
	}
	if (!expect(values.Count() == 5 && values[4] == 70, "SimpleDynVecClass Delete_Range mismatch")) {
		return 1;
	}

	int single_first = 100;
	int single_second = 200;
	int single_third = 300;
	SList<int> single_list;
	if (!expect(single_list.Add_Head(&single_second), "SList Add_Head failed")) {
		return 1;
	}
	if (!expect(single_list.Add_Tail(&single_third), "SList Add_Tail failed")) {
		return 1;
	}
	if (!expect(single_list.Insert_Before(&single_first, &single_second),
			"SList Insert_Before failed")) {
		return 1;
	}
	if (!expect(single_list.Get_Count() == 3 && single_list.Head()->Data() == &single_first &&
			single_list.Tail()->Data() == &single_third,
			"SList count/head/tail mismatch")) {
		return 1;
	}
	if (!expect(single_list.Find_Node(&single_second) != NULL, "SList Find_Node failed")) {
		return 1;
	}
	if (!expect(single_list.Remove(&single_second), "SList Remove failed")) {
		return 1;
	}
	if (!expect(single_list.Remove_Tail() == &single_third &&
			single_list.Remove_Head() == &single_first &&
			single_list.Is_Empty(), "SList remove order mismatch")) {
		return 1;
	}

	ListItem first(1);
	ListItem second(2);
	ListItem third(3);
	ListItem inserted(4);
	MultiListClass<ListItem> list;

	if (!expect(list.Add(&first), "MultiListClass Add(first) failed")) {
		return 1;
	}
	if (!expect(!list.Add(&first), "MultiListClass duplicate Add accepted")) {
		return 1;
	}
	if (!expect(list.Add_Tail(&second) && list.Add_Tail(&third), "MultiListClass Add_Tail failed")) {
		return 1;
	}
	if (!expect(list.Add_After(&inserted, &first), "MultiListClass Add_After failed")) {
		return 1;
	}
	if (!expect(list.Count() == 4 && list.Contains(&inserted), "MultiListClass count/contains mismatch")) {
		return 1;
	}

	MultiListIterator<ListItem> iterator(&list);
	int total = 0;
	for (iterator.First(); !iterator.Is_Done(); iterator.Next()) {
		total += iterator.Peek_Obj()->Value;
	}
	if (!expect(total == 10, "MultiListIterator traversal mismatch")) {
		return 1;
	}

	for (iterator.First(); !iterator.Is_Done();) {
		if (iterator.Peek_Obj()->Value == 4) {
			iterator.Remove_Current_Object();
		} else {
			iterator.Next();
		}
	}
	if (!expect(list.Count() == 3 && !list.Contains(&inserted), "MultiListIterator removal mismatch")) {
		return 1;
	}
	if (!expect(list.Remove_Head() == &first, "MultiListClass Remove_Head mismatch")) {
		return 1;
	}
	list.Reset_List();
	if (!expect(list.Is_Empty(), "MultiListClass Reset_List failed")) {
		return 1;
	}

	ListItem priority_first(10);
	ListItem priority_second(20);
	ListItem priority_third(30);
	MultiListClass<ListItem> priority_list;
	priority_list.Add_Tail(&priority_first);
	priority_list.Add_Tail(&priority_second);
	priority_list.Add_Tail(&priority_third);

	PriorityMultiListIterator<ListItem> priority_iterator(&priority_list);
	ListItem *processed = NULL;
	int processed_total = 0;
	int processed_count = 0;
	while (priority_iterator.Process_Head(&processed)) {
		processed_total += processed->Value;
		++processed_count;
	}
	if (!expect(processed_count == 3 && processed_total == 60,
			"PriorityMultiListIterator rotation mismatch")) {
		return 1;
	}
	priority_list.Reset_List();

	std::cout << "{\"ok\":true,\"library\":\"WWLib\","
		"\"compiled\":\"simple dynamic vectors, pooled singly linked lists, pooled multilists, priority iterator\","
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
