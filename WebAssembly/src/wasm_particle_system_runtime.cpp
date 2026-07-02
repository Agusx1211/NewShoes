#include "wasm_particle_system_runtime.h"

#include "PreRTS.h"

#include "wasm_startup_singletons_probe.h"

#include "Common/Errors.h"
#include "Common/GameMemory.h"
#include "Common/NameKeyGenerator.h"
#include "GameClient/ParticleSys.h"
#include "W3DDevice/GameClient/W3DParticleSys.h"

#include <cstdio>
#include <string>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

namespace {

ParticleSystemRuntimeProbeResult g_particle_system_state;
W3DParticleSystemManager *g_particle_system_manager = nullptr;
bool g_particle_system_init_ran = false;

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

bool template_lookup(ParticleSystemManager &manager, const char *name)
{
	return manager.findTemplate(AsciiString(name)) != nullptr;
}

void capture_template_state(ParticleSystemRuntimeProbeResult &result)
{
	if (TheParticleSystemManager == nullptr) {
		return;
	}

	for (ParticleSystemManager::TemplateMap::const_iterator it =
			TheParticleSystemManager->beginParticleSystemTemplate();
			it != TheParticleSystemManager->endParticleSystemTemplate();
			++it) {
		++result.template_count;
	}

	result.template_tsing_ma_trail_smoke_lookup =
		template_lookup(*TheParticleSystemManager, "TsingMaTrailSmoke");
	result.template_jet_contrail_thin_lookup =
		template_lookup(*TheParticleSystemManager, "JetContrailThin");
	result.template_toxin_lenzflare_lookup =
		template_lookup(*TheParticleSystemManager, "ToxinLenzflare");
	result.template_small_tank_struck_smoke_lookup =
		template_lookup(*TheParticleSystemManager, "SmallTankStruckSmoke");
	result.template_nuke_mushroom_ring_lookup =
		template_lookup(*TheParticleSystemManager, "NukeMushroomRing");
	result.zero_live_systems =
		TheParticleSystemManager->getParticleSystemCount() == 0;
	result.zero_live_particles =
		TheParticleSystemManager->getParticleCount() == 0;
}

bool template_state_ready(const ParticleSystemRuntimeProbeResult &result)
{
	return result.template_count > 100 &&
		result.template_tsing_ma_trail_smoke_lookup &&
		result.template_jet_contrail_thin_lookup &&
		result.template_toxin_lenzflare_lookup &&
		result.template_small_tank_struck_smoke_lookup &&
		result.template_nuke_mushroom_ring_lookup &&
		result.zero_live_systems &&
		result.zero_live_particles;
}

void finish_status(ParticleSystemRuntimeProbeResult &result)
{
	if (!result.runtime_archive_registered) {
		result.status = "missing_runtime_archives";
		result.next_required = "runtimeArchiveSet";
		return;
	}
	if (!result.startup_files_ready) {
		result.status = "startup_files_not_ready";
		result.next_required = "startupFiles";
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
	if (!result.module_factory_ready) {
		result.status = "module_factory_not_ready";
		result.next_required = "createModuleFactory";
		return;
	}
	if (!result.memory_manager_ready || !result.name_key_generator_ready) {
		result.status = "startup_singletons_incomplete";
		result.next_required = "startupSingletonOwnership";
		return;
	}
	if (!result.the_particle_system_manager_was_null &&
		!result.the_particle_system_manager_was_owned) {
		result.status = "foreign_particle_system_manager_already_installed";
		result.next_required = "createParticleSystemManager";
		return;
	}
	if (result.init_threw) {
		result.status = "original_particle_system_init_threw";
		result.next_required = "createParticleSystemManager";
		return;
	}
	if (!result.constructed ||
		!result.w3d_manager_constructed ||
		!result.the_particle_system_manager_owned ||
		!result.init_ran) {
		result.status = "original_particle_system_init_incomplete";
		result.next_required = "createParticleSystemManager";
		return;
	}
	if (!template_state_ready(result)) {
		result.status = "particle_system_template_mismatch";
		result.next_required = "createParticleSystemManager";
		return;
	}

	result.ok = true;
	result.status = "ready";
	result.next_required = "createThingFactory";
}

} // namespace

const ParticleSystemRuntimeProbeResult &wasm_particle_system_runtime_install(
	bool runtime_archive_registered,
	bool startup_files_ready,
	bool audio_manager_ready,
	bool function_lexicon_init_ready,
	bool module_factory_ready)
{
	ParticleSystemRuntimeProbeResult result;
	result.attempted = true;
	result.runtime_archive_registered = runtime_archive_registered;
	result.startup_files_ready = startup_files_ready;
	result.startup_singletons_ready = wasm_startup_singletons_state().ok;
	result.audio_manager_ready = audio_manager_ready;
	result.function_lexicon_init_ready = function_lexicon_init_ready;
	result.module_factory_ready = module_factory_ready;
	result.memory_manager_ready = isMemoryManagerOfficiallyInited();
	result.name_key_generator_ready = TheNameKeyGenerator != nullptr;
	result.the_particle_system_manager_was_null =
		TheParticleSystemManager == nullptr;
	result.the_particle_system_manager_was_owned =
		g_particle_system_manager != nullptr &&
		TheParticleSystemManager == g_particle_system_manager;

	const bool preconditions_ready =
		result.runtime_archive_registered &&
		result.startup_files_ready &&
		result.startup_singletons_ready &&
		result.audio_manager_ready &&
		result.function_lexicon_init_ready &&
		result.module_factory_ready &&
		result.memory_manager_ready &&
		result.name_key_generator_ready &&
		(result.the_particle_system_manager_was_null ||
			result.the_particle_system_manager_was_owned);

	if (!preconditions_ready) {
		finish_status(result);
		g_particle_system_state = result;
		return g_particle_system_state;
	}

	try {
		if (g_particle_system_manager == nullptr) {
			// GameEngine.cpp line 453:
			// Win32GameEngine::createParticleSystemManager() returns NEW
			// W3DParticleSystemManager.
			g_particle_system_manager = NEW W3DParticleSystemManager;
			result.constructed = true;
			result.w3d_manager_constructed = true;
			TheParticleSystemManager = g_particle_system_manager;
			result.the_particle_system_manager_owned =
				TheParticleSystemManager == g_particle_system_manager;

			// SubsystemInterfaceList::initSubsystem() ->
			// ParticleSystemManager::init(), inherited by
			// W3DParticleSystemManager. This loads Data\INI\ParticleSystem.ini.
			g_particle_system_manager->init();
			g_particle_system_init_ran = true;
		} else {
			TheParticleSystemManager = g_particle_system_manager;
			result.constructed = true;
			result.w3d_manager_constructed = true;
			result.the_particle_system_manager_owned = true;
		}
		result.init_ran = g_particle_system_init_ran;
		g_particle_system_manager->queueParticleRender();
		result.queue_particle_render_called = true;
		capture_template_state(result);
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
		result.init_error =
			"W3DParticleSystemManager init raised an exception";
	}

	if (result.init_threw && g_particle_system_manager != nullptr) {
		if (TheParticleSystemManager == g_particle_system_manager) {
			TheParticleSystemManager = nullptr;
		}
		delete g_particle_system_manager;
		g_particle_system_manager = nullptr;
		g_particle_system_init_ran = false;
		result.the_particle_system_manager_owned = false;
	}

	finish_status(result);
	g_particle_system_state = result;
	return g_particle_system_state;
}

const ParticleSystemRuntimeProbeResult &wasm_particle_system_runtime_state()
{
	return g_particle_system_state;
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_particle_system_runtime()
{
	return wasm_particle_system_runtime_state_json();
}

const char *wasm_particle_system_runtime_state_json()
{
	const ParticleSystemRuntimeProbeResult &state = g_particle_system_state;
	const std::string source_json = json_escape(state.source);
	const std::string status_json = json_escape(state.status);
	const std::string next_required_json = json_escape(state.next_required);
	const std::string init_error_json = json_escape(state.init_error);

	static char json[10000];
	std::snprintf(json, sizeof(json),
		"{\"attempted\":%s,\"ok\":%s,\"source\":\"%s\","
		"\"status\":\"%s\",\"nextRequired\":\"%s\","
		"\"gameEngineInit\":{\"factory\":\"createParticleSystemManager\","
		"\"line\":453,\"originalConcrete\":\"W3DParticleSystemManager\"},"
		"\"runtimeArchiveRegistered\":%s,"
		"\"startupFilesReady\":%s,"
		"\"startupSingletonsReady\":%s,"
		"\"audioManagerReady\":%s,"
		"\"functionLexiconInitReady\":%s,"
		"\"moduleFactoryReady\":%s,"
		"\"memoryManagerReady\":%s,"
		"\"nameKeyGeneratorReady\":%s,"
		"\"theParticleSystemManagerWasNull\":%s,"
		"\"theParticleSystemManagerWasOwned\":%s,"
		"\"constructed\":%s,\"w3dManagerConstructed\":%s,"
		"\"theParticleSystemManagerOwned\":%s,"
		"\"initRan\":%s,\"initThrew\":%s,\"initError\":\"%s\","
		"\"queueParticleRenderCalled\":%s,"
		"\"templateCount\":%zu,"
		"\"zeroLiveSystems\":%s,"
		"\"zeroLiveParticles\":%s,"
		"\"templates\":{\"tsingMaTrailSmoke\":%s,"
		"\"jetContrailThin\":%s,"
		"\"toxinLenzflare\":%s,"
		"\"smallTankStruckSmoke\":%s,"
		"\"nukeMushroomRing\":%s}}",
		json_bool(state.attempted),
		json_bool(state.ok),
		source_json.c_str(),
		status_json.c_str(),
		next_required_json.c_str(),
		json_bool(state.runtime_archive_registered),
		json_bool(state.startup_files_ready),
		json_bool(state.startup_singletons_ready),
		json_bool(state.audio_manager_ready),
		json_bool(state.function_lexicon_init_ready),
		json_bool(state.module_factory_ready),
		json_bool(state.memory_manager_ready),
		json_bool(state.name_key_generator_ready),
		json_bool(state.the_particle_system_manager_was_null),
		json_bool(state.the_particle_system_manager_was_owned),
		json_bool(state.constructed),
		json_bool(state.w3d_manager_constructed),
		json_bool(state.the_particle_system_manager_owned),
		json_bool(state.init_ran),
		json_bool(state.init_threw),
		init_error_json.c_str(),
		json_bool(state.queue_particle_render_called),
		state.template_count,
		json_bool(state.zero_live_systems),
		json_bool(state.zero_live_particles),
		json_bool(state.template_tsing_ma_trail_smoke_lookup),
		json_bool(state.template_jet_contrail_thin_lookup),
		json_bool(state.template_toxin_lenzflare_lookup),
		json_bool(state.template_small_tank_struck_smoke_lookup),
		json_bool(state.template_nuke_mushroom_ring_lookup));
	return json;
}
