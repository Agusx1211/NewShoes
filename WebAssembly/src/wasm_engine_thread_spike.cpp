// wasm_engine_thread_spike.cpp — P0 engine-thread spike (owner-directed
// 2026-07-10; IDEAS.md "the browser as a 2003 PC").
//
// Compiled into cnc-port ONLY when CNC_PORT_THREADS=ON (see CMakeLists.txt).
// This file is spike tooling, not architecture: it exists to prove, from the
// real linked cnc-port runtime, that
//   (a) a real pthread runs concurrently with main-thread JS
//       (cnc_port_spawn_engine_thread + cnc_port_engine_thread_heartbeat),
//   (b) the pthread worker realm does NOT see the bridge hooks the D3D8 shim
//       EM_JS bodies look up on Module (cnc_port_probe_realm_bits, callable
//       from both realms), and
//   (c) the real engine init can be started on a pthread and we can observe
//       exactly where it stops without the bridge/assets
//       (cnc_port_spawn_engine_init_thread).
//
// Emscripten 3.1.6 facts this spike already flushed at the build layer:
//   - PROXY_TO_PTHREAD + --no-entry is a hard emcc error ("proxies main()
//     for you, but no main exists"), so the engine thread must be spawned
//     explicitly — which is what this file does.
//   - EXPORT_ES6 + MODULARIZE + pthreads works at runtime in Chromium.

#include <emscripten.h>
#include <emscripten/threading.h>

#include <atomic>
#include <cstdio>
#include <cstring>
#include <pthread.h>
#include <string>

extern "C" const char *cnc_port_real_engine_init(const char *run_directory, int use_shell_map);

namespace
{

std::atomic<int> g_heartbeat{0};
std::atomic<int> g_engine_thread_spawned{0};
std::atomic<int> g_engine_thread_realm_bits{-1};
std::atomic<int> g_engine_thread_is_main_runtime{-1};
std::atomic<int> g_engine_thread_is_main_browser{-1};

// 0 = idle, 1 = running, 2 = returned, 3 = pthread_create failed
std::atomic<int> g_engine_init_state{0};
std::string g_engine_init_result;
std::string g_engine_init_run_directory;
int g_engine_init_use_shell_map = 0;

} // namespace

// Realm probe: which JS globals does the calling thread's realm see?
//  bit 0: Module object exists
//  bit 1: Module.cncPortD3D8Clear is a function (a real bridge.js hook the
//         D3D8 shim EM_JS bodies look up; the spike probe page installs a
//         stand-in on the main-realm Module to make the split observable)
//  bit 2: document exists (DOM access)
//  bit 3: this realm is a worker (WorkerGlobalScope)
EM_JS(int, cnc_port_spike_realm_bits, (), {
	let bits = 0;
	if (typeof Module !== "undefined" && Module !== null) {
		bits |= 1;
		if (typeof Module.cncPortD3D8Clear === "function") {
			bits |= 2;
		}
	}
	if (typeof document !== "undefined") {
		bits |= 4;
	}
	if (typeof importScripts === "function") {
		bits |= 8;
	}
	return bits;
});

namespace
{

void *engine_thread_main(void *)
{
	g_engine_thread_realm_bits.store(cnc_port_spike_realm_bits());
	g_engine_thread_is_main_runtime.store(emscripten_is_main_runtime_thread() ? 1 : 0);
	g_engine_thread_is_main_browser.store(emscripten_is_main_browser_thread() ? 1 : 0);
	std::printf(
		"cnc-port: engine-thread-spike thread running realmBits=%d mainRuntime=%d mainBrowser=%d\n",
		g_engine_thread_realm_bits.load(),
		g_engine_thread_is_main_runtime.load(),
		g_engine_thread_is_main_browser.load());
	std::fflush(stdout);
	// Heartbeat forever: a genuinely blocking sleep loop, exactly what the
	// engine's original Sleep()-style model needs. The main thread samples
	// cnc_port_engine_thread_heartbeat() to prove concurrency.
	for (;;) {
		g_heartbeat.fetch_add(1);
		emscripten_thread_sleep(100);
	}
	return nullptr;
}

void *engine_init_thread_main(void *)
{
	std::printf("cnc-port: engine-thread-spike real_engine_init starting on pthread\n");
	std::fflush(stdout);
	const char *result = cnc_port_real_engine_init(
		g_engine_init_run_directory.empty() ? nullptr : g_engine_init_run_directory.c_str(),
		g_engine_init_use_shell_map);
	g_engine_init_result = result != nullptr ? result : "(null)";
	g_engine_init_state.store(2);
	std::printf("cnc-port: engine-thread-spike real_engine_init returned (%zu bytes of state json)\n",
		g_engine_init_result.size());
	std::fflush(stdout);
	return nullptr;
}

} // namespace

extern "C" {

// Spawn the idle heartbeat engine thread. Returns pthread_create's rc (0 on
// success). Safe to call once; subsequent calls return -1.
EMSCRIPTEN_KEEPALIVE int cnc_port_spawn_engine_thread(void)
{
	int expected = 0;
	if (!g_engine_thread_spawned.compare_exchange_strong(expected, 1)) {
		return -1;
	}
	pthread_t thread;
	pthread_attr_t attr;
	pthread_attr_init(&attr);
	pthread_attr_setdetachstate(&attr, PTHREAD_CREATE_DETACHED);
	const int rc = pthread_create(&thread, &attr, engine_thread_main, nullptr);
	pthread_attr_destroy(&attr);
	if (rc != 0) {
		g_engine_thread_spawned.store(0);
	}
	return rc;
}

EMSCRIPTEN_KEEPALIVE int cnc_port_engine_thread_heartbeat(void)
{
	return g_heartbeat.load();
}

// Realm bits as seen by whichever thread calls this export (main-thread JS
// calls land on the main runtime thread because cnc-port has no
// PROXY_TO_PTHREAD).
EMSCRIPTEN_KEEPALIVE int cnc_port_probe_realm_bits(void)
{
	return cnc_port_spike_realm_bits();
}

// Realm bits observed by the spawned engine thread (-1 until it has run).
EMSCRIPTEN_KEEPALIVE int cnc_port_engine_thread_realm_bits(void)
{
	return g_engine_thread_realm_bits.load();
}

EMSCRIPTEN_KEEPALIVE int cnc_port_engine_thread_is_main_runtime(void)
{
	return g_engine_thread_is_main_runtime.load();
}

EMSCRIPTEN_KEEPALIVE int cnc_port_engine_thread_is_main_browser(void)
{
	return g_engine_thread_is_main_browser.load();
}

// Kick off the REAL monolithic engine init (cnc_port_real_engine_init) on a
// dedicated pthread. Returns pthread_create's rc, or -1 if already attempted.
// Poll cnc_port_engine_init_thread_state / _result from the main thread.
EMSCRIPTEN_KEEPALIVE int cnc_port_spawn_engine_init_thread(const char *run_directory, int use_shell_map)
{
	int expected = 0;
	if (!g_engine_init_state.compare_exchange_strong(expected, 1)) {
		return -1;
	}
	g_engine_init_run_directory = run_directory != nullptr ? run_directory : "";
	g_engine_init_use_shell_map = use_shell_map;
	pthread_t thread;
	pthread_attr_t attr;
	pthread_attr_init(&attr);
	pthread_attr_setdetachstate(&attr, PTHREAD_CREATE_DETACHED);
	const int rc = pthread_create(&thread, &attr, engine_init_thread_main, nullptr);
	pthread_attr_destroy(&attr);
	if (rc != 0) {
		g_engine_init_state.store(3);
	}
	return rc;
}

// 0 idle, 1 running, 2 returned, 3 spawn failed.
EMSCRIPTEN_KEEPALIVE int cnc_port_engine_init_thread_state(void)
{
	return g_engine_init_state.load();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_engine_init_thread_result(void)
{
	if (g_engine_init_state.load() != 2) {
		return "";
	}
	return g_engine_init_result.c_str();
}

} // extern "C"
