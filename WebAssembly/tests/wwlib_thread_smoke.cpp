#include <cstring>
#include <iostream>

#include "thread.h"

namespace {
bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}

class ProbeThread final : public ThreadClass
{
public:
	explicit ProbeThread(const char *name) : ThreadClass(name), calls(0) {}

	int Calls() const
	{
		return calls;
	}

protected:
	void Thread_Function() override
	{
		++calls;
		running = false;
	}

private:
	int calls;
};
}

int main()
{
	ProbeThread thread("wasm-probe");
	if (!expect(std::strcmp(thread.Get_Name(), "wasm-probe") == 0,
			"ThreadClass did not preserve the supplied name")) {
		return 1;
	}
	if (!expect(!thread.Is_Running() && thread.Calls() == 0,
			"ThreadClass started before Execute")) {
		return 1;
	}

	thread.Set_Priority(1);
	thread.Execute();
	if (!expect(!thread.Is_Running() && thread.Calls() == 0,
			"ThreadClass _UNIX Execute path should remain a no-op")) {
		return 1;
	}

	ThreadClass::Sleep_Ms(0);
	ThreadClass::Switch_Thread();
	if (!expect(ThreadClass::_Get_Current_Thread_ID() == 0,
			"ThreadClass _UNIX current thread id should be zero")) {
		return 1;
	}

	ProbeThread default_name(nullptr);
	if (!expect(std::strcmp(default_name.Get_Name(), "No name") == 0,
			"ThreadClass default name failed")) {
		return 1;
	}
	default_name.Stop(0);
	if (!expect(!default_name.Is_Running() && default_name.Calls() == 0,
			"ThreadClass Stop should leave _UNIX fallback idle")) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"WWLib\",\"compiled\":\"thread.cpp\","
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
