#ifndef WASM_PARTICLE_SYSTEM_RUNTIME_H
#define WASM_PARTICLE_SYSTEM_RUNTIME_H

#include <cstddef>
#include <string>

// Boot-time runtime ownership for GameEngine.cpp line 453:
//   initSubsystem(TheParticleSystemManager, "TheParticleSystemManager",
//     createParticleSystemManager(), NULL)
//
// This constructs the original W3DParticleSystemManager in the linked
// cnc-port runtime, assigns TheParticleSystemManager, runs the inherited
// ParticleSystemManager::init() path, and captures public template lookups
// loaded from Data\INI\ParticleSystem.ini.
struct ParticleSystemRuntimeProbeResult
{
	bool attempted = false;
	bool ok = false;
	const char *source =
		"GameEngine.cpp line 453 createParticleSystemManager -> W3DParticleSystemManager::init";
	const char *status = "not_attempted";
	const char *next_required = "runtimeArchiveSet";

	bool runtime_archive_registered = false;
	bool startup_files_ready = false;
	bool startup_singletons_ready = false;
	bool audio_manager_ready = false;
	bool function_lexicon_init_ready = false;
	bool module_factory_ready = false;
	bool memory_manager_ready = false;
	bool name_key_generator_ready = false;
	bool the_particle_system_manager_was_null = false;
	bool the_particle_system_manager_was_owned = false;

	bool constructed = false;
	bool the_particle_system_manager_owned = false;
	bool init_ran = false;
	bool init_threw = false;
	std::string init_error;

	bool w3d_manager_constructed = false;
	bool queue_particle_render_called = false;
	bool zero_live_systems = false;
	bool zero_live_particles = false;
	std::size_t template_count = 0;
	bool template_tsing_ma_trail_smoke_lookup = false;
	bool template_jet_contrail_thin_lookup = false;
	bool template_toxin_lenzflare_lookup = false;
	bool template_small_tank_struck_smoke_lookup = false;
	bool template_nuke_mushroom_ring_lookup = false;
};

const ParticleSystemRuntimeProbeResult &wasm_particle_system_runtime_install(
	bool runtime_archive_registered,
	bool startup_files_ready,
	bool audio_manager_ready,
	bool function_lexicon_init_ready,
	bool module_factory_ready);
const ParticleSystemRuntimeProbeResult &wasm_particle_system_runtime_state();
const char *wasm_particle_system_runtime_state_json();

#endif // WASM_PARTICLE_SYSTEM_RUNTIME_H
