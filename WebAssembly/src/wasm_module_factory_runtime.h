#ifndef WASM_MODULE_FACTORY_RUNTIME_H
#define WASM_MODULE_FACTORY_RUNTIME_H

#include <string>

// Boot-time runtime ownership for GameEngine.cpp line 447:
//   initSubsystem(TheModuleFactory, "TheModuleFactory",
//     createModuleFactory(), NULL)
//
// This constructs the original W3DModuleFactory in the linked cnc-port runtime,
// assigns TheModuleFactory, runs W3DModuleFactory::init(), and captures public
// ModuleFactory lookup results for representative base gameplay modules,
// client-update modules, and W3D draw modules.
struct ModuleFactoryRuntimeProbeResult
{
	bool attempted = false;
	bool ok = false;
	const char *source =
		"GameEngine.cpp line 447 createModuleFactory -> W3DModuleFactory::init";
	const char *status = "not_attempted";
	const char *next_required = "runtimeArchiveSet";

	bool runtime_archive_registered = false;
	bool startup_singletons_ready = false;
	bool audio_manager_ready = false;
	bool function_lexicon_init_ready = false;
	bool memory_manager_ready = false;
	bool name_key_generator_ready = false;
	bool the_module_factory_was_null = false;
	bool the_module_factory_was_owned = false;

	bool constructed = false;
	bool the_module_factory_owned = false;
	bool init_ran = false;
	bool init_threw = false;
	std::string init_error;

	bool active_body_lookup = false;
	bool destroy_die_lookup = false;
	bool inactive_body_lookup = false;
	bool beacon_client_update_lookup = false;
	bool w3d_default_draw_lookup = false;
	bool w3d_model_draw_lookup = false;
	bool w3d_laser_draw_lookup = false;
	bool w3d_prop_draw_lookup = false;
};

const ModuleFactoryRuntimeProbeResult &wasm_module_factory_runtime_install(
	bool runtime_archive_registered,
	bool audio_manager_ready,
	bool function_lexicon_init_ready);
const ModuleFactoryRuntimeProbeResult &wasm_module_factory_runtime_state();
const char *wasm_module_factory_runtime_state_json();

#endif // WASM_MODULE_FACTORY_RUNTIME_H
