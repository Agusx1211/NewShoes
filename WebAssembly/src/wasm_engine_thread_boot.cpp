// wasm_engine_thread_boot.cpp — P1a engine-thread runtime scaffold (design:
// WebAssembly/notes/p1-engine-thread.md; supersedes-nothing: the P0 spike in
// wasm_engine_thread_spike.cpp stays as-is as a regression probe).
//
// Compiled into cnc-port ONLY when CNC_PORT_THREADS=ON (see CMakeLists.txt).
//
// What this proves (driven by harness/p1_scaffold_probe.{html,mjs}):
//   - the engine pthread can be spawned onto the single pool worker AFTER the
//     main realm has prepared that worker's realm (executor module imported,
//     OffscreenCanvas adopted, Module.cncPortD3D8Clear installed),
//   - `emscripten_set_main_loop` works ON a pthread with emsdk 3.1.6:
//     simulate_infinite_loop=1 throws 'unwind', which cnc-port.worker.js
//     catches ("keeping the worker alive for asynchronous operation") and the
//     worker returns to its event loop; fps=0 installs an rAF-driven
//     scheduler (`Browser.mainLoop` is realm-local JS state, and Chromium
//     dedicated workers have requestAnimationFrame), so ticks run in the
//     worker realm on the pthread's wasm stack,
//   - a tick on the engine thread reaches the D3D8 shim's EM_JS presentation
//     path: EM_JS bodies execute in the CALLING thread's realm, so
//     wasm_d3d8_browser_clear_target looks up Module.cncPortD3D8Clear on the
//     WORKER-realm Module — the hook the executor installed — and the clear
//     lands on the transferred OffscreenCanvas (auto-presented at worker rAF
//     boundaries).
//
// Handshake order (main realm drives; see the probe):
//   1. main prepares the worker realm (`connect`/`setup` via the pre-js stub
//      in threads_realm_stub.pre.js),
//   2. main calls cnc_port_engine_thread_boot()  → pthread starts, polls the
//      atomic go flag with a genuinely blocking emscripten_thread_sleep(10),
//   3. main calls cnc_port_engine_thread_go()    → thread installs the rAF
//      main loop and unwinds; ticks advance the heartbeat and clear the
//      canvas with a heartbeat-derived color (animated proof).

#include <emscripten.h>
#include <emscripten/threading.h>

#include <atomic>
#include <cstdio>
#include <pthread.h>

// The real presentation seam: EM_JS defined in wasm_d3d8_shim.cpp.
// bridge signature on the JS side: Module.cncPortD3D8Clear(flags, r, g, b, a,
// z, stencil).
extern "C" void wasm_d3d8_browser_clear_target(
	unsigned int flags, unsigned int color, double z, unsigned int stencil);

// P1c: dispatch one main-loop tick to the engine-realm controller
// (harness/engine_realm_boot.mjs installs Module.cncPortEngineThreadTick on
// the WORKER-realm Module during the realm-setup handshake). The controller
// owns the whole frame policy — stepped real init, the paced client/logic
// frame loop, input/RPC draining — all executed on this pthread's wasm stack.
// Returns 1 when a controller handled the tick, 0 when none is installed
// (then the C side falls back to the P1a color-cycling clear so
// harness/p1_scaffold_probe.mjs keeps proving the raw scaffold).
EM_JS(int, cnc_port_engine_thread_tick_js, (int heartbeat), {
	const hook = typeof Module !== "undefined" ? Module.cncPortEngineThreadTick : null;
	if (typeof hook !== "function") {
		return 0;
	}
	try {
		hook(heartbeat);
	} catch (error) {
		console.error("cnc-port: engine-thread tick hook failed", error);
	}
	return 1;
});

namespace
{

constexpr unsigned int kD3DClearTarget = 0x00000001u; // D3DCLEAR_TARGET (shims/d3d8.h)

// 0 idle, 1 thread spawned (polling go flag), 2 go seen / main loop
// installing, 3 pthread_create failed.
std::atomic<int> g_boot_state{0};
std::atomic<int> g_go_flag{0};
std::atomic<int> g_tick_heartbeat{0};

void engine_thread_tick()
{
	const int heartbeat = g_tick_heartbeat.fetch_add(1) + 1;
	// P1c controller first: when the engine-realm boot module installed
	// Module.cncPortEngineThreadTick, that JS drives the REAL engine (stepped
	// init, paced frames). Only when no controller exists (the P1a scaffold
	// probe) fall back to the animated proof clear below.
	if (cnc_port_engine_thread_tick_js(heartbeat) != 0) {
		return;
	}
	// Color-cycling clear derived from the heartbeat: at worker-rAF rates the
	// canvas visibly animates, so two probe screenshots ~500ms apart must be
	// non-black AND differ if (and only if) the engine-thread loop is really
	// presenting through the executor hook.
	const unsigned int r = static_cast<unsigned int>((heartbeat * 2) & 0xff);
	const unsigned int g = static_cast<unsigned int>((heartbeat * 5) & 0xff);
	const unsigned int b = static_cast<unsigned int>(255 - ((heartbeat * 3) & 0xff));
	const unsigned int color = 0xff000000u | (r << 16) | (g << 8) | b;
	wasm_d3d8_browser_clear_target(kD3DClearTarget, color, 1.0, 0);
}

void *engine_thread_main(void *)
{
	std::printf("cnc-port: engine-thread-boot pthread running, polling go flag\n");
	std::fflush(stdout);
	// Genuinely blocking poll — the original engine's Sleep()-style model.
	// Main sets the go flag only after the worker realm is fully prepared.
	while (g_go_flag.load() == 0) {
		emscripten_thread_sleep(10);
	}
	g_boot_state.store(2);
	std::printf("cnc-port: engine-thread-boot go seen; installing rAF main loop on pthread\n");
	std::fflush(stdout);
	// fps=0 → rAF-driven; simulate_infinite_loop=1 → throws 'unwind' (a JS
	// string exception that passes through the wasm frames), caught by
	// cnc-port.worker.js which keeps the pthread alive for async operation.
	// The C stack frame below this point is intentionally leaked (documented
	// emscripten behavior for this pattern).
	emscripten_set_main_loop(engine_thread_tick, 0, 1);
	return nullptr; // unreachable: set_main_loop(simulate_infinite_loop=1) never returns.
}

} // namespace

extern "C" {

// Spawn the engine thread onto the (single, PTHREAD_POOL_SIZE=1) pool worker.
// Returns pthread_create's rc (0 on success); -1 if already booted.
EMSCRIPTEN_KEEPALIVE int cnc_port_engine_thread_boot(void)
{
	int expected = 0;
	if (!g_boot_state.compare_exchange_strong(expected, 1)) {
		return -1;
	}
	pthread_t thread;
	pthread_attr_t attr;
	pthread_attr_init(&attr);
	pthread_attr_setdetachstate(&attr, PTHREAD_CREATE_DETACHED);
	const int rc = pthread_create(&thread, &attr, engine_thread_main, nullptr);
	pthread_attr_destroy(&attr);
	if (rc != 0) {
		g_boot_state.store(3);
	}
	return rc;
}

// Release the engine thread's go flag. Call ONLY after the worker realm has
// been prepared (connect/setup through the realm stub) — the whole point of
// the handshake is that the first tick already finds the executor hooks.
EMSCRIPTEN_KEEPALIVE void cnc_port_engine_thread_go(void)
{
	g_go_flag.store(1);
}

// Ticks completed by the engine-thread main loop (0 until go).
EMSCRIPTEN_KEEPALIVE int cnc_port_engine_thread_boot_heartbeat(void)
{
	return g_tick_heartbeat.load();
}

// 0 idle, 1 spawned/polling, 2 main loop installed, 3 spawn failed.
EMSCRIPTEN_KEEPALIVE int cnc_port_engine_thread_boot_state(void)
{
	return g_boot_state.load();
}

} // extern "C"
