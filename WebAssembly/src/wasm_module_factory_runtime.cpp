#include "wasm_module_factory_runtime.h"

#include "PreRTS.h"

#include "wasm_startup_singletons_probe.h"

#include "Common/Errors.h"
#include "Common/GameMemory.h"
#include "Common/ModuleFactory.h"
#include "Common/NameKeyGenerator.h"
#include "W3DDevice/Common/W3DModuleFactory.h"

#include <cstdio>
#include <string>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

namespace {

ModuleFactoryRuntimeProbeResult g_module_factory_state;
W3DModuleFactory *g_module_factory = nullptr;
bool g_module_factory_init_ran = false;

const char *json_bool(bool value)
{
	return value ? "true" : "false";
}

std::string json_escape(const std::string &value)
{
	std::string escaped;
	escaped.reserve(value.size());
	for (char ch : value) {
		switch (ch) {
			case '\\':
				escaped += "\\\\";
				break;
			case '"':
				escaped += "\\\"";
				break;
			case '\n':
				escaped += "\\n";
				break;
			case '\r':
				escaped += "\\r";
				break;
			case '\t':
				escaped += "\\t";
				break;
			default:
				escaped += ch;
				break;
		}
	}
	return escaped;
}

bool module_lookup(ModuleFactory &factory, const char *name, ModuleType type)
{
	return factory.findModuleInterfaceMask(AsciiString(name), type) != 0;
}

void capture_lookup_state(ModuleFactoryRuntimeProbeResult &result)
{
	if (TheModuleFactory == nullptr) {
		return;
	}

	result.active_body_lookup =
		module_lookup(*TheModuleFactory, "ActiveBody", MODULETYPE_BEHAVIOR);
	result.destroy_die_lookup =
		module_lookup(*TheModuleFactory, "DestroyDie", MODULETYPE_BEHAVIOR);
	result.inactive_body_lookup =
		module_lookup(*TheModuleFactory, "InactiveBody", MODULETYPE_BEHAVIOR);
	result.beacon_client_update_lookup =
		module_lookup(*TheModuleFactory, "BeaconClientUpdate",
			MODULETYPE_CLIENT_UPDATE);
	result.w3d_default_draw_lookup =
		module_lookup(*TheModuleFactory, "W3DDefaultDraw", MODULETYPE_DRAW);
	result.w3d_model_draw_lookup =
		module_lookup(*TheModuleFactory, "W3DModelDraw", MODULETYPE_DRAW);
	result.w3d_laser_draw_lookup =
		module_lookup(*TheModuleFactory, "W3DLaserDraw", MODULETYPE_DRAW);
	result.w3d_prop_draw_lookup =
		module_lookup(*TheModuleFactory, "W3DPropDraw", MODULETYPE_DRAW);
}

bool lookup_state_ready(const ModuleFactoryRuntimeProbeResult &result)
{
	return result.active_body_lookup &&
		result.destroy_die_lookup &&
		result.inactive_body_lookup &&
		result.beacon_client_update_lookup &&
		result.w3d_default_draw_lookup &&
		result.w3d_model_draw_lookup &&
		result.w3d_laser_draw_lookup &&
		result.w3d_prop_draw_lookup;
}

void finish_status(ModuleFactoryRuntimeProbeResult &result)
{
	if (!result.runtime_archive_registered) {
		result.status = "missing_runtime_archives";
		result.next_required = "runtimeArchiveSet";
		return;
	}
	if (!result.startup_singletons_ready) {
		result.status = "startup_singletons_not_ready";
		result.next_required = "startupSingletonOwnership";
		return;
	}
	if (!result.audio_manager_ready) {
		result.status = "audio_manager_not_ready";
		result.next_required = "createAudioManager";
		return;
	}
	if (!result.function_lexicon_init_ready) {
		result.status = "function_lexicon_not_ready";
		result.next_required = "createFunctionLexicon";
		return;
	}
	if (!result.memory_manager_ready || !result.name_key_generator_ready) {
		result.status = "startup_singletons_incomplete";
		result.next_required = "startupSingletonOwnership";
		return;
	}
	if (!result.the_module_factory_was_null &&
		!result.the_module_factory_was_owned) {
		result.status = "foreign_module_factory_already_installed";
		result.next_required = "createModuleFactory";
		return;
	}
	if (result.init_threw) {
		result.status = "original_module_factory_init_threw";
		result.next_required = "createModuleFactory";
		return;
	}
	if (!result.constructed ||
		!result.the_module_factory_owned ||
		!result.init_ran) {
		result.status = "original_module_factory_init_incomplete";
		result.next_required = "createModuleFactory";
		return;
	}
	if (!lookup_state_ready(result)) {
		result.status = "module_factory_lookup_mismatch";
		result.next_required = "createModuleFactory";
		return;
	}

	result.ok = true;
	result.status = "ready";
	result.next_required = "createParticleSystemManager";
}

} // namespace

const ModuleFactoryRuntimeProbeResult &wasm_module_factory_runtime_install(
	bool runtime_archive_registered,
	bool audio_manager_ready,
	bool function_lexicon_init_ready)
{
	ModuleFactoryRuntimeProbeResult result;
	result.attempted = true;
	result.runtime_archive_registered = runtime_archive_registered;
	result.startup_singletons_ready = wasm_startup_singletons_state().ok;
	result.audio_manager_ready = audio_manager_ready;
	result.function_lexicon_init_ready = function_lexicon_init_ready;
	result.memory_manager_ready = isMemoryManagerOfficiallyInited();
	result.name_key_generator_ready = TheNameKeyGenerator != nullptr;
	result.the_module_factory_was_null = TheModuleFactory == nullptr;
	result.the_module_factory_was_owned =
		g_module_factory != nullptr && TheModuleFactory == g_module_factory;

	const bool preconditions_ready =
		result.runtime_archive_registered &&
		result.startup_singletons_ready &&
		result.audio_manager_ready &&
		result.function_lexicon_init_ready &&
		result.memory_manager_ready &&
		result.name_key_generator_ready &&
		(result.the_module_factory_was_null ||
			result.the_module_factory_was_owned);

	if (!preconditions_ready) {
		finish_status(result);
		g_module_factory_state = result;
		return g_module_factory_state;
	}

	try {
		if (g_module_factory == nullptr) {
			// GameEngine.cpp line 447:
			// Win32GameEngine::createModuleFactory() returns NEW
			// W3DModuleFactory.
			g_module_factory = NEW W3DModuleFactory;
			result.constructed = true;
			TheModuleFactory = g_module_factory;
			result.the_module_factory_owned = TheModuleFactory == g_module_factory;

			// SubsystemInterfaceList::initSubsystem() ->
			// W3DModuleFactory::init().
			g_module_factory->init();
			g_module_factory_init_ran = true;
		} else {
			TheModuleFactory = g_module_factory;
			result.constructed = true;
			result.the_module_factory_owned = true;
		}
		result.init_ran = g_module_factory_init_ran;
		capture_lookup_state(result);
	} catch (ErrorCode code) {
		result.init_threw = true;
		char buffer[64];
		std::snprintf(buffer, sizeof(buffer), "ErrorCode 0x%08x",
			static_cast<unsigned>(code));
		result.init_error = buffer;
	} catch (int code) {
		result.init_threw = true;
		char buffer[64];
		std::snprintf(buffer, sizeof(buffer), "int %d", code);
		result.init_error = buffer;
	} catch (unsigned code) {
		result.init_threw = true;
		char buffer[64];
		std::snprintf(buffer, sizeof(buffer), "unsigned %u", code);
		result.init_error = buffer;
	} catch (const char *msg) {
		result.init_threw = true;
		result.init_error = std::string("cstr ") + msg;
	} catch (...) {
		result.init_threw = true;
		result.init_error = "W3DModuleFactory init raised an exception";
	}

	if (result.init_threw && g_module_factory != nullptr) {
		if (TheModuleFactory == g_module_factory) {
			TheModuleFactory = nullptr;
		}
		delete g_module_factory;
		g_module_factory = nullptr;
		g_module_factory_init_ran = false;
		result.the_module_factory_owned = false;
	}

	finish_status(result);
	g_module_factory_state = result;
	return g_module_factory_state;
}

const ModuleFactoryRuntimeProbeResult &wasm_module_factory_runtime_state()
{
	return g_module_factory_state;
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_module_factory_runtime()
{
	return wasm_module_factory_runtime_state_json();
}

const char *wasm_module_factory_runtime_state_json()
{
	const ModuleFactoryRuntimeProbeResult &state = g_module_factory_state;
	const std::string source_json = json_escape(state.source);
	const std::string status_json = json_escape(state.status);
	const std::string next_required_json = json_escape(state.next_required);
	const std::string init_error_json = json_escape(state.init_error);

	static char json[10000];
	std::snprintf(json, sizeof(json),
		"{\"attempted\":%s,\"ok\":%s,\"source\":\"%s\","
		"\"status\":\"%s\",\"nextRequired\":\"%s\","
		"\"gameEngineInit\":{\"factory\":\"createModuleFactory\","
		"\"line\":447,\"originalConcrete\":\"W3DModuleFactory\"},"
		"\"runtimeArchiveRegistered\":%s,"
		"\"startupSingletonsReady\":%s,"
		"\"audioManagerReady\":%s,"
		"\"functionLexiconInitReady\":%s,"
		"\"memoryManagerReady\":%s,"
		"\"nameKeyGeneratorReady\":%s,"
		"\"theModuleFactoryWasNull\":%s,"
		"\"theModuleFactoryWasOwned\":%s,"
		"\"constructed\":%s,\"theModuleFactoryOwned\":%s,"
		"\"initRan\":%s,\"initThrew\":%s,\"initError\":\"%s\","
		"\"lookups\":{\"activeBody\":%s,"
		"\"destroyDie\":%s,"
		"\"inactiveBody\":%s,"
		"\"beaconClientUpdate\":%s,"
		"\"w3dDefaultDraw\":%s,"
		"\"w3dModelDraw\":%s,"
		"\"w3dLaserDraw\":%s,"
		"\"w3dPropDraw\":%s}}",
		json_bool(state.attempted),
		json_bool(state.ok),
		source_json.c_str(),
		status_json.c_str(),
		next_required_json.c_str(),
		json_bool(state.runtime_archive_registered),
		json_bool(state.startup_singletons_ready),
		json_bool(state.audio_manager_ready),
		json_bool(state.function_lexicon_init_ready),
		json_bool(state.memory_manager_ready),
		json_bool(state.name_key_generator_ready),
		json_bool(state.the_module_factory_was_null),
		json_bool(state.the_module_factory_was_owned),
		json_bool(state.constructed),
		json_bool(state.the_module_factory_owned),
		json_bool(state.init_ran),
		json_bool(state.init_threw),
		init_error_json.c_str(),
		json_bool(state.active_body_lookup),
		json_bool(state.destroy_die_lookup),
		json_bool(state.inactive_body_lookup),
		json_bool(state.beacon_client_update_lookup),
		json_bool(state.w3d_default_draw_lookup),
		json_bool(state.w3d_model_draw_lookup),
		json_bool(state.w3d_laser_draw_lookup),
		json_bool(state.w3d_prop_draw_lookup));
	return json;
}
