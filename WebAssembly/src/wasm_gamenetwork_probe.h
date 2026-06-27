#pragma once

#include <string>

struct GameNetworkProbeResult
{
	bool attempted = false;
	bool ok = false;
	bool command_ids_ok = false;
	bool frame_data_ok = false;
	bool frame_data_manager_ok = false;
	bool packet_round_trip_ok = false;
	unsigned short first_command_id = 0;
	unsigned short second_command_id = 0;
	int frame = 0;
	int frame_command_count = 0;
	int frame_ready_state = 0;
	int manager_quit_frame = 0;
	int manager_ready_state = 0;
	int packet_length = 0;
	int packet_command_count = 0;
	int packet_relay = 0;
	int packet_execution_frame = 0;
	int packet_player_id = 0;
	int packet_command_id = 0;
	int packet_frame_command_count = 0;
	int max_frames_ahead = 0;
	int min_run_ahead = 0;
	int frame_data_length = 0;
	int frames_to_keep = 0;
	std::string source;
};

GameNetworkProbeResult probe_original_game_network();
