#include <iostream>

#include "_mono.h"
#include "msgloop.h"

namespace {
int intercept_calls = 0;

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}

bool count_intercepts(MSG &)
{
	++intercept_calls;
	return false;
}
}

int main()
{
	if (!expect(!MonoClass::Is_Enabled(), "MonoClass should start disabled")) {
		return 1;
	}

	MonoClass local_mono;
	local_mono.Clear();
	local_mono.Sub_Window(1, 2, 3, 4);
	local_mono.Set_Cursor(2, 3);
	local_mono.Print("wasm mono smoke");
	local_mono.Printf("value %d", 7);
	local_mono.Text_Print("text", 0, 0, MonoClass::NORMAL);
	local_mono.Fill_Attrib(0, 0, 1, 1, MonoClass::INVERSE);
	local_mono.Scroll();
	local_mono.Pan();
	local_mono.Set_Default_Attribute(MonoClass::NORMAL);
	local_mono.View();

	MonoClass::Enable();
	if (!expect(MonoClass::Is_Enabled(), "MonoClass enable failed")) {
		return 1;
	}
	Mono.Print("global mono smoke");
	MonoClass::Disable();
	if (!expect(!MonoClass::Is_Enabled(), "MonoClass disable failed")) {
		return 1;
	}

	HWND window = reinterpret_cast<HWND>(0x1000);
	HWND dialog = reinterpret_cast<HWND>(0x2000);
	HACCEL accelerator = reinterpret_cast<HACCEL>(0x3000);
	Add_Modeless_Dialog(dialog);
	Remove_Modeless_Dialog(dialog);
	Add_Accelerator(window, accelerator);
	Remove_Accelerator(accelerator);

	Message_Intercept_Handler = count_intercepts;
	Windows_Message_Handler();
	if (!expect(intercept_calls == 0,
			"empty browser message queue should not invoke intercepts")) {
		return 1;
	}
	Message_Intercept_Handler = nullptr;

	std::cout << "{\"ok\":true,\"library\":\"WWLib\","
		"\"compiled\":\"mono.cpp,_mono.cpp,msgloop.cpp\","
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
