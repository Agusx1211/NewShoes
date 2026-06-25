#include <iostream>
#include <string>
#include <vector>

#include "wwdebug.h"

namespace {
struct CapturedMessage
{
	DebugType type;
	std::string text;
};

std::vector<CapturedMessage> g_messages;
std::string g_assert_message;
int g_trigger_seen = -1;
std::vector<std::string> g_profile_events;

void capture_message(DebugType type, const char *message)
{
	g_messages.push_back({type, message ? message : ""});
}

void capture_assert(const char *message)
{
	g_assert_message = message ? message : "";
}

bool capture_trigger(int trigger_num)
{
	g_trigger_seen = trigger_num;
	return trigger_num == 42;
}

void capture_profile(const char *title)
{
	g_profile_events.emplace_back(title ? title : "");
}

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
	WWDebug_Install_Message_Handler(capture_message);
	WWDebug_Printf("info %d", 7);
	WWDebug_Printf_Warning("warning %s", "path");
	WWDebug_Printf_Error("error %.1f", 3.5);

	if (!expect(g_messages.size() == 3, "expected three WWDebug messages")) {
		return 1;
	}
	if (!expect(g_messages[0].type == WWDEBUG_TYPE_INFORMATION &&
			g_messages[0].text == "info 7",
			"information message mismatch")) {
		return 1;
	}
	if (!expect(g_messages[1].type == WWDEBUG_TYPE_WARNING &&
			g_messages[1].text == "warning path",
			"warning message mismatch")) {
		return 1;
	}
	if (!expect(g_messages[2].type == WWDEBUG_TYPE_ERROR &&
			g_messages[2].text == "error 3.5",
			"error message mismatch")) {
		return 1;
	}

	WWDebug_Install_Assert_Handler(capture_assert);
	WWDebug_Assert_Fail_Print("sample expression", "sample.cpp", 12, "details");
	if (!expect(g_assert_message.find("sample expression") != std::string::npos,
			"assert handler did not receive the expression")) {
		return 1;
	}

	WWDebug_Install_Trigger_Handler(capture_trigger);
	if (!expect(WWDebug_Check_Trigger(42), "trigger handler did not return true")) {
		return 1;
	}
	if (!expect(g_trigger_seen == 42, "trigger handler did not receive trigger id")) {
		return 1;
	}

	WWDebug_Install_Profile_Start_Handler(capture_profile);
	WWDebug_Install_Profile_Stop_Handler(capture_profile);
	WWDebug_Profile_Start("loading");
	WWDebug_Profile_Stop("loading");
	if (!expect(g_profile_events.size() == 2 &&
			g_profile_events[0] == "loading" &&
			g_profile_events[1] == "loading",
			"profile handlers were not called")) {
		return 1;
	}

	WWDebug_DBWin32_Message_Handler("ignored on wasm");

	std::cout << "{\"ok\":true,\"library\":\"WWDebug\","
		"\"compiled\":\"wwdebug.cpp\",\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
