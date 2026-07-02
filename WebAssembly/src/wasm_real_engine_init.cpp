// cnc-port real engine lifecycle entry.
//
// Drives the ORIGINAL boot path in the browser:
//   WinMain.cpp::CreateGameEngine() -> new Win32GameEngine (real factories)
//   -> GameEngine::init(argc, argv)  (GeneralsMD GameEngine.cpp)
// with a command line of "-noshellmap -win", against the real mounted
// archives. The frontier reported here is computed FROM THE RUN:
// SubsystemInterfaceList::initSubsystem() notes every subsystem start/finish
// through cnc_port_note_subsystem_init(), and every marker is also printed to
// stdout so the harness still sees the trace when init dies inside
// RELEASE_CRASH/_exit() where no JSON can be returned.

#include <emscripten/emscripten.h>

#include <unistd.h>

#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include <atlbase.h>
#include <mmsystem.h>
#include <windows.h>

#include "Common/GameEngine.h"
#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "Common/SubsystemInterface.h"

// The original app-level globals GameEngine.cpp expects WinMain.cpp to own.
// WinMain.cpp is only partially compiled for the browser (WndProc +
// CreateGameEngine); the ATL module object lives here.
CComModule _Module;

// TheWebBrowser is normally defined by the COM embedding in
// GameNetwork/WOLBrowser/WebBrowser.cpp, which is a true platform boundary
// (IE IDispatch); every browser TU sees the shim WebBrowser class instead.
class WebBrowser;
WebBrowser *TheWebBrowser = NULL;

namespace {

struct RealEngineInitState {
	bool attempted = false;
	bool init_returned = false;
	bool quitting_after_init = false;
	bool exception_caught = false;
	std::string exception_text;
	std::string run_directory;
	std::vector<std::string> completed;
	std::string in_flight;
	double elapsed_ms = 0.0;
};

RealEngineInitState g_state;
std::string g_state_json;

std::string json_escape(const std::string &value)
{
	std::string out;
	out.reserve(value.size() + 8);
	for (char c : value) {
		switch (c) {
		case '"': out += "\\\""; break;
		case '\\': out += "\\\\"; break;
		case '\n': out += "\\n"; break;
		case '\r': out += "\\r"; break;
		case '\t': out += "\\t"; break;
		default:
			if (static_cast<unsigned char>(c) < 0x20) {
				char buf[8];
				std::snprintf(buf, sizeof(buf), "\\u%04x", c);
				out += buf;
			} else {
				out += c;
			}
		}
	}
	return out;
}

const char *build_state_json()
{
	std::string json = "{";
	json += "\"attempted\":";
	json += g_state.attempted ? "true" : "false";
	json += ",\"source\":\"GeneralsMD/Code/GameEngine/Source/Common/GameEngine.cpp::init\"";
	json += ",\"factory\":\"GeneralsMD/Code/Main/WinMain.cpp::CreateGameEngine\"";
	json += ",\"commandLine\":\"-noshellmap -win\"";
	json += ",\"runDirectory\":\"" + json_escape(g_state.run_directory) + "\"";
	json += ",\"initReturned\":";
	json += g_state.init_returned ? "true" : "false";
	json += ",\"quittingAfterInit\":";
	json += g_state.quitting_after_init ? "true" : "false";
	json += ",\"exceptionCaught\":";
	json += g_state.exception_caught ? "true" : "false";
	json += ",\"exception\":\"" + json_escape(g_state.exception_text) + "\"";
	char elapsed[64];
	std::snprintf(elapsed, sizeof(elapsed), ",\"elapsedMs\":%.1f", g_state.elapsed_ms);
	json += elapsed;
	json += ",\"subsystemsCompleted\":[";
	for (size_t i = 0; i < g_state.completed.size(); ++i) {
		if (i != 0) {
			json += ",";
		}
		json += "\"" + json_escape(g_state.completed[i]) + "\"";
	}
	json += "]";
	json += ",\"subsystemCompletedCount\":" + std::to_string(g_state.completed.size());
	if (g_state.in_flight.empty()) {
		json += ",\"inFlightSubsystem\":null";
	} else {
		json += ",\"inFlightSubsystem\":\"" + json_escape(g_state.in_flight) + "\"";
	}
	json += "}";
	g_state_json = json;
	return g_state_json.c_str();
}

} // namespace

// Called by the real SubsystemInterfaceList::initSubsystem()
// (GameEngine/Source/Common/System/SubsystemInterface.cpp) for every
// subsystem GameEngine::init() brings up. phase 0 = starting (about to run
// sys->init() + its INI loads), phase 1 = completed.
extern "C" void cnc_port_note_subsystem_init(const char *name, int phase)
{
	const char *safe_name = name != nullptr ? name : "(unnamed)";
	if (phase == 0) {
		g_state.in_flight = safe_name;
		std::printf("cnc-port: real-init subsystem-start %s\n", safe_name);
	} else {
		g_state.in_flight.clear();
		g_state.completed.push_back(safe_name);
		std::printf("cnc-port: real-init subsystem-done %s\n", safe_name);
	}
	std::fflush(stdout);
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_frontier()
{
	return build_state_json();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_init(const char *run_directory)
{
	if (g_state.attempted) {
		return build_state_json();
	}
	g_state.attempted = true;

	if (run_directory != nullptr && run_directory[0] != '\0') {
		if (chdir(run_directory) == 0) {
			g_state.run_directory = run_directory;
		} else {
			g_state.run_directory = std::string("chdir-failed:") + run_directory;
		}
	}

	// WinMain.cpp order: memory manager first, then GameMain -> CreateGameEngine.
	if (TheMemoryPoolFactory == NULL) {
		initMemoryManager();
	}

	static const char *argv_storage[] = {"CnCGeneralsZH", "-noshellmap", "-win"};
	const int argc = 3;
	char **argv = const_cast<char **>(argv_storage);

	std::printf("cnc-port: real-init begin dir=%s argv=-noshellmap -win\n",
		g_state.run_directory.c_str());
	std::fflush(stdout);

	const double started_at = emscripten_get_now();
	try {
		TheGameEngine = CreateGameEngine();
		// browser tab has focus; WinMain mirrors focus state into the engine.
		TheGameEngine->setIsActive(TRUE);
		TheGameEngine->init(argc, argv);
		g_state.init_returned = true;
		g_state.quitting_after_init = TheGameEngine->getQuitting() != FALSE;
	} catch (const char *message) {
		g_state.exception_caught = true;
		g_state.exception_text = message != nullptr ? message : "(const char* exception)";
	} catch (...) {
		g_state.exception_caught = true;
		g_state.exception_text = "unhandled C++ exception escaping GameEngine::init";
	}
	g_state.elapsed_ms = emscripten_get_now() - started_at;

	std::printf("cnc-port: real-init end returned=%d quitting=%d completed=%zu inflight=%s\n",
		g_state.init_returned ? 1 : 0,
		g_state.quitting_after_init ? 1 : 0,
		g_state.completed.size(),
		g_state.in_flight.empty() ? "(none)" : g_state.in_flight.c_str());
	std::fflush(stdout);

	return build_state_json();
}
