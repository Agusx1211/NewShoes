#include "wasm_gamenetwork_probe.h"

#include "PreRTS.h"

#include "wasm_memory_manager_scope.h"

#include "Common/GameMemory.h"
#include "GameNetwork/FrameData.h"
#include "GameNetwork/FrameDataManager.h"
#include "GameNetwork/NetCommandMsg.h"
#include "GameNetwork/NetCommandRef.h"
#include "GameNetwork/NetPacket.h"
#include "GameNetwork/NetworkUtil.h"

namespace {
bool probe_command_ids(GameNetworkProbeResult &result)
{
	result.first_command_id = GenerateNextCommandID();
	result.second_command_id = GenerateNextCommandID();
	result.max_frames_ahead = MAX_FRAMES_AHEAD;
	result.min_run_ahead = MIN_RUNAHEAD;
	result.frame_data_length = FRAME_DATA_LENGTH;
	result.frames_to_keep = FRAMES_TO_KEEP;
	return static_cast<unsigned short>(result.first_command_id + 1) == result.second_command_id &&
		DoesCommandRequireACommandID(NETCOMMANDTYPE_GAMECOMMAND) &&
		!DoesCommandRequireACommandID(NETCOMMANDTYPE_ACKBOTH) &&
		IsCommandSynchronized(NETCOMMANDTYPE_RUNAHEAD) &&
		!IsCommandSynchronized(NETCOMMANDTYPE_CHAT) &&
		result.max_frames_ahead == 128 &&
		result.min_run_ahead == 10 &&
		result.frame_data_length == 258 &&
		result.frames_to_keep == 65;
}

bool probe_frame_data(GameNetworkProbeResult &result)
{
	FrameData data;
	data.init();
	data.setFrame(77);
	data.setFrameCommandCount(0);

	result.frame = data.getFrame();
	result.frame_command_count = data.getFrameCommandCount();
	result.frame_ready_state = data.allCommandsReady(FALSE);
	const bool ok =
		result.frame == 77 &&
		data.getCommandCount() == 0 &&
		result.frame_command_count == 0 &&
		result.frame_ready_state == FRAMEDATA_READY &&
		data.getCommandList() != nullptr;

	data.destroyGameMessages();
	data.reset();
	return ok;
}

bool probe_frame_data_manager(GameNetworkProbeResult &result)
{
	FrameDataManager *manager = newInstance(FrameDataManager)(TRUE);
	if (manager == nullptr) {
		return false;
	}

	manager->init();
	const bool counts_ok =
		manager->getCommandCount(0) == 0 &&
		manager->getFrameCommandCount(0) == 0;
	manager->resetFrame(3, TRUE);
	manager->zeroFrames(3, 2);
	manager->setQuitFrame(42);

	result.manager_quit_frame = manager->getQuitFrame();
	result.manager_ready_state = manager->allCommandsReady(3, FALSE);
	const bool ok =
		counts_ok &&
		result.manager_quit_frame == 42 &&
		manager->getIsQuitting() &&
		result.manager_ready_state == FRAMEDATA_READY;
	manager->deleteInstance();
	return ok;
}

bool probe_packet_round_trip(GameNetworkProbeResult &result)
{
	NetFrameCommandMsg *frame = newInstance(NetFrameCommandMsg);
	frame->setExecutionFrame(1234);
	frame->setPlayerID(3);
	frame->setID(42);
	frame->setCommandCount(5);

	NetPacket *packet = newInstance(NetPacket);
	NetCommandRef *ref = NEW_NETCOMMANDREF(frame);
	ref->setRelay(0x0f);
	const Bool added = packet->addCommand(ref);
	ref->deleteInstance();
	frame->detach();

	result.packet_command_count = packet->getNumCommands();
	result.packet_length = packet->getLength();
	if (!added || result.packet_command_count != 1 ||
		result.packet_length <= 0 || result.packet_length > MAX_PACKET_SIZE) {
		packet->deleteInstance();
		return false;
	}

	NetCommandRef *parsed = NetPacket::ConstructNetCommandMsgFromRawData(
		packet->getData(), static_cast<UnsignedShort>(packet->getLength()));
	packet->deleteInstance();
	if (parsed == nullptr) {
		return false;
	}
	if (parsed->getCommand() == nullptr) {
		parsed->deleteInstance();
		return false;
	}

	NetFrameCommandMsg *parsed_frame = static_cast<NetFrameCommandMsg *>(parsed->getCommand());
	result.packet_relay = parsed->getRelay();
	result.packet_execution_frame = parsed_frame->getExecutionFrame();
	result.packet_player_id = parsed_frame->getPlayerID();
	result.packet_command_id = parsed_frame->getID();
	result.packet_frame_command_count = parsed_frame->getCommandCount();
	const bool ok =
		parsed_frame->getNetCommandType() == NETCOMMANDTYPE_FRAMEINFO &&
		result.packet_relay == 0x0f &&
		result.packet_execution_frame == 1234 &&
		result.packet_player_id == 3 &&
		result.packet_command_id == 42 &&
		result.packet_frame_command_count == 5;
	parsed->deleteInstance();
	return ok;
}

}

GameNetworkProbeResult probe_original_game_network()
{
	GameNetworkProbeResult result;
	result.attempted = true;
	result.source = "GameEngine/GameNetwork";

	ScopedOriginalMemoryManager memory_manager_scope;
	try {
		result.command_ids_ok = probe_command_ids(result);
		result.frame_data_ok = probe_frame_data(result);
		result.frame_data_manager_ok = probe_frame_data_manager(result);
		result.packet_round_trip_ok = probe_packet_round_trip(result);
		result.ok =
			result.command_ids_ok &&
			result.frame_data_ok &&
			result.frame_data_manager_ok &&
			result.packet_round_trip_ok;
	} catch (...) {
		result.ok = false;
	}
	return result;
}
