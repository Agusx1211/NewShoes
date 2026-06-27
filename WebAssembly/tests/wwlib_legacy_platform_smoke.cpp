#include <iostream>

#include "_mono.h"
#include "_xmouse.h"
#include "keyboard.h"
#include "msgloop.h"

Mouse *MouseCursor = nullptr;

namespace {
int intercept_calls = 0;
int wnd_proc_calls = 0;
HWND wnd_proc_last_window = nullptr;
UINT wnd_proc_last_message = 0;
WPARAM wnd_proc_last_wparam = 0;
LPARAM wnd_proc_last_lparam = 0;
WWKeyboardClass *active_keyboard = nullptr;

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

LRESULT CALLBACK smoke_wnd_proc(HWND window, UINT message, WPARAM wparam, LPARAM lparam)
{
	++wnd_proc_calls;
	wnd_proc_last_window = window;
	wnd_proc_last_message = message;
	wnd_proc_last_wparam = wparam;
	wnd_proc_last_lparam = lparam;
	return 0x3456;
}

bool route_message_to_keyboard(MSG &message)
{
	return active_keyboard != nullptr
		&& active_keyboard->Message_Handler(
			message.hwnd,
			message.message,
			static_cast<UINT>(message.wParam),
			static_cast<LONG>(message.lParam));
}

bool expect_key(WWKeyboardClass &keyboard, unsigned short expected_key, const char *label)
{
	const unsigned short key = keyboard.Get();
	if ((key & 0xff) != expected_key) {
		std::cerr << label << " key mismatch: " << (key & 0xff)
			<< " expected " << expected_key << "\n";
		return false;
	}
	return true;
}

bool expect_mouse_key(
	WWKeyboardClass &keyboard,
	unsigned short expected_key,
	bool release,
	int x,
	int y,
	const char *label)
{
	const unsigned short key = keyboard.Get();
	if ((key & 0xff) != expected_key || ((key & WWKEY_RLS_BIT) != 0) != release) {
		std::cerr << label << " mouse key mismatch: " << key << "\n";
		return false;
	}
	if (keyboard.MouseQX != x || keyboard.MouseQY != y) {
		std::cerr << label << " mouse coordinate mismatch: "
			<< keyboard.MouseQX << "," << keyboard.MouseQY
			<< " expected " << x << "," << y << "\n";
		return false;
	}
	return true;
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

	WNDCLASS window_class = {};
	window_class.lpfnWndProc = smoke_wnd_proc;
	window_class.lpszClassName = "SmokeWindow";
	if (!expect(RegisterClass(&window_class) != 0,
			"RegisterClass should accept a smoke WndProc")) {
		return 1;
	}
	HWND dispatch_window = CreateWindow(
		"SmokeWindow",
		"Smoke",
		0,
		0,
		0,
		320,
		200,
		nullptr,
		nullptr,
		nullptr,
		nullptr);
	if (!expect(dispatch_window != nullptr,
			"CreateWindow should return a faux HWND for registered classes")) {
		return 1;
	}
	MSG direct_message = {dispatch_window, WM_USER + 7, 0x44, 0x55, 0, {0, 0}};
	if (!expect(DispatchMessage(&direct_message) == 0x3456
			&& wnd_proc_calls == 1
			&& wnd_proc_last_window == dispatch_window
			&& wnd_proc_last_message == WM_USER + 7
			&& wnd_proc_last_wparam == 0x44
			&& wnd_proc_last_lparam == 0x55,
			"DispatchMessage should call the registered WndProc")) {
		return 1;
	}
	if (!expect(PostMessage(dispatch_window, WM_USER + 8, 0x66, 0x77) == TRUE,
			"PostMessage should queue registered-window messages")) {
		return 1;
	}
	Windows_Message_Handler();
	if (!expect(wnd_proc_calls == 2
			&& wnd_proc_last_window == dispatch_window
			&& wnd_proc_last_message == WM_USER + 8
			&& wnd_proc_last_wparam == 0x66
			&& wnd_proc_last_lparam == 0x77,
			"Windows_Message_Handler should dispatch queued messages to WndProc")) {
		return 1;
	}
	if (!expect(DestroyWindow(dispatch_window) == TRUE,
			"DestroyWindow should remove faux HWND records")) {
		return 1;
	}

	WasmWin32Input::Reset();
	WWKeyboardClass keyboard;
	active_keyboard = &keyboard;

	if (!expect(keyboard.To_ASCII(VK_A) == 'a',
			"WWKeyboardClass To_ASCII should translate unshifted letters")) {
		return 1;
	}
	if (!expect(keyboard.To_ASCII(static_cast<unsigned short>(VK_A | WWKEY_SHIFT_BIT)) == 'A',
			"WWKeyboardClass To_ASCII should translate shifted letters")) {
		return 1;
	}
	if (!expect(keyboard.To_ASCII(static_cast<unsigned short>(VK_1 | WWKEY_SHIFT_BIT)) == '!',
			"WWKeyboardClass To_ASCII should translate shifted digits")) {
		return 1;
	}

	BYTE key_state[256] = {};
	WasmWin32Input::SetKeyState(VK_SHIFT, true);
	if (!expect(GetKeyboardState(key_state) && (key_state[VK_SHIFT] & 0x80) != 0,
			"GetKeyboardState should expose browser-fed key-down state")) {
		return 1;
	}
	WasmWin32Input::SetKeyState(VK_SHIFT, false);

	Message_Intercept_Handler = route_message_to_keyboard;
	WasmWin32Input::SetKeyState(VK_A, true);
	if (!expect(PostMessage(window, WM_KEYDOWN, VK_A, 0) == TRUE,
			"PostMessage should queue keyboard input")) {
		return 1;
	}
	Windows_Message_Handler();
	if (!expect_key(keyboard, VK_A, "WWKeyboardClass WM_KEYDOWN")) {
		return 1;
	}

	WasmWin32Input::SetKeyState(VK_A, false);
	if (!expect(PostMessage(window, WM_KEYUP, VK_A, 0) == TRUE,
			"PostMessage should queue keyboard release input")) {
		return 1;
	}
	Windows_Message_Handler();
	const unsigned short key_release = keyboard.Get();
	if (!expect((key_release & 0xff) == VK_A && (key_release & WWKEY_RLS_BIT) != 0,
			"WWKeyboardClass should mark key release messages")) {
		return 1;
	}

	if (!expect(PostMessage(window, WM_LBUTTONDOWN, 0, MAKELPARAM(12, 34)) == TRUE,
			"PostMessage should queue mouse input")) {
		return 1;
	}
	Windows_Message_Handler();
	if (!expect_mouse_key(keyboard, VK_LBUTTON, false, 12, 34, "WWKeyboardClass WM_LBUTTONDOWN")) {
		return 1;
	}

	if (!expect(PostMessage(window, WM_LBUTTONDBLCLK, 0, MAKELPARAM(56, 78)) == TRUE,
			"PostMessage should queue mouse double-click input")) {
		return 1;
	}
	Windows_Message_Handler();
	if (!expect_mouse_key(keyboard, VK_LBUTTON, false, 56, 78, "WWKeyboardClass double-click down 1")
		|| !expect_mouse_key(keyboard, VK_LBUTTON, true, 56, 78, "WWKeyboardClass double-click up 1")
		|| !expect_mouse_key(keyboard, VK_LBUTTON, false, 56, 78, "WWKeyboardClass double-click down 2")
		|| !expect_mouse_key(keyboard, VK_LBUTTON, true, 56, 78, "WWKeyboardClass double-click up 2")) {
		return 1;
	}
	Message_Intercept_Handler = nullptr;
	active_keyboard = nullptr;
	WasmWin32Input::Reset();

	std::cout << "{\"ok\":true,\"library\":\"WWLib\","
		"\"compiled\":\"mono.cpp,_mono.cpp,msgloop.cpp,keyboard.cpp\","
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
