#include "wasm_gamenetwork_probe.h"

#include "PreRTS.h"

#include "wasm_memory_manager_scope.h"

#include <cstdio>
#include <cstring>

#include "Common/GameMemory.h"
#include "GameNetwork/FrameData.h"
#include "GameNetwork/FrameDataManager.h"
#include "GameNetwork/NetCommandMsg.h"
#include "GameNetwork/NetCommandRef.h"
#include "GameNetwork/NetPacket.h"
#include "GameNetwork/NetworkUtil.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

namespace {
char g_browser_network_relay_build_json[4096] = {};
char g_browser_network_relay_receive_json[4096] = {};
char g_browser_network_relay_packet_hex[(MAX_PACKET_SIZE * 2) + 1] = {};
constexpr int kRelayExecutionFrame = 2468;
constexpr int kRelayPlayerId = 2;
constexpr int kRelayCommandId = 314;
constexpr int kRelayCommandCount = 9;
constexpr int kRelayMask = 0x05;

const char *net_command_type_name(NetCommandType type)
{
	switch (type) {
		case NETCOMMANDTYPE_FRAMEINFO:
			return "NETCOMMANDTYPE_FRAMEINFO";
		case NETCOMMANDTYPE_ACKBOTH:
			return "NETCOMMANDTYPE_ACKBOTH";
		case NETCOMMANDTYPE_GAMECOMMAND:
			return "NETCOMMANDTYPE_GAMECOMMAND";
		default:
			return "UNKNOWN";
	}
}

int hex_value(char c)
{
	if (c >= '0' && c <= '9') {
		return c - '0';
	}
	if (c >= 'a' && c <= 'f') {
		return 10 + (c - 'a');
	}
	if (c >= 'A' && c <= 'F') {
		return 10 + (c - 'A');
	}
	return -1;
}

bool encode_hex(const UnsignedByte *bytes, int length, char *out, int out_size)
{
	if (bytes == nullptr || length <= 0 || (length * 2 + 1) > out_size) {
		return false;
	}

	static const char kHex[] = "0123456789abcdef";
	for (int i = 0; i < length; ++i) {
		out[i * 2] = kHex[(bytes[i] >> 4) & 0x0f];
		out[(i * 2) + 1] = kHex[bytes[i] & 0x0f];
	}
	out[length * 2] = '\0';
	return true;
}

bool decode_hex(const char *hex, UnsignedByte *bytes, int &length)
{
	if (hex == nullptr || bytes == nullptr) {
		length = 0;
		return false;
	}

	const int hex_length = static_cast<int>(std::strlen(hex));
	if (hex_length <= 0 || (hex_length % 2) != 0 || (hex_length / 2) > MAX_PACKET_SIZE) {
		length = 0;
		return false;
	}

	length = hex_length / 2;
	for (int i = 0; i < length; ++i) {
		const int hi = hex_value(hex[i * 2]);
		const int lo = hex_value(hex[(i * 2) + 1]);
		if (hi < 0 || lo < 0) {
			length = 0;
			return false;
		}
		bytes[i] = static_cast<UnsignedByte>((hi << 4) | lo);
	}
	return true;
}

NetPacket *build_relay_packet(int execution_frame, int player_id, int command_id, int command_count, int relay)
{
	NetFrameCommandMsg *frame = newInstance(NetFrameCommandMsg);
	frame->setExecutionFrame(static_cast<UnsignedInt>(execution_frame));
	frame->setPlayerID(static_cast<UnsignedInt>(player_id));
	frame->setID(static_cast<UnsignedShort>(command_id));
	frame->setCommandCount(static_cast<UnsignedShort>(command_count));

	NetPacket *packet = newInstance(NetPacket);
	NetCommandRef *ref = NEW_NETCOMMANDREF(frame);
	ref->setRelay(static_cast<UnsignedByte>(relay));
	const Bool added = packet->addCommand(ref);
	ref->deleteInstance();
	frame->detach();

	if (!added) {
		packet->deleteInstance();
		return nullptr;
	}
	return packet;
}

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

extern "C" {

EMSCRIPTEN_KEEPALIVE const char *cnc_port_build_browser_network_relay_packet()
{
	ScopedOriginalMemoryManager memory_manager_scope;

	NetPacket *packet =
		build_relay_packet(kRelayExecutionFrame, kRelayPlayerId, kRelayCommandId, kRelayCommandCount, kRelayMask);

	if (packet == nullptr) {
		std::snprintf(g_browser_network_relay_build_json, sizeof(g_browser_network_relay_build_json),
			"{\"ok\":false,\"source\":\"GameNetwork browser relay NetPacket build probe\","
			"\"relayReady\":false,\"nextRequired\":\"browserTransportReceiveIntoConnectionManager\"}");
		return g_browser_network_relay_build_json;
	}

	const int length = packet->getLength();
	const int commands = packet->getNumCommands();
	const bool encoded = encode_hex(packet->getData(), length,
		g_browser_network_relay_packet_hex, sizeof(g_browser_network_relay_packet_hex));
	packet->deleteInstance();

	const bool ok = encoded && commands == 1 && length > 0 && length <= MAX_PACKET_SIZE;
	std::snprintf(g_browser_network_relay_build_json, sizeof(g_browser_network_relay_build_json),
		"{\"ok\":%s,"
		"\"source\":\"GameNetwork browser relay NetPacket build probe\","
		"\"relayReady\":%s,"
		"\"browserTransport\":\"harness relay queue\","
		"\"originalSerializer\":\"NetPacket::addCommand\","
		"\"nextRequired\":\"browserTransportReceiveIntoConnectionManager\","
		"\"packet\":{\"hex\":\"%s\",\"bytes\":%d,\"commands\":%d,"
		"\"commandType\":\"%s\",\"relay\":%d,\"executionFrame\":%d,"
		"\"playerId\":%d,\"commandId\":%d,\"frameCommandCount\":%d}}",
		ok ? "true" : "false",
		ok ? "true" : "false",
		encoded ? g_browser_network_relay_packet_hex : "",
		length,
		commands,
		net_command_type_name(NETCOMMANDTYPE_FRAMEINFO),
		kRelayMask,
		kRelayExecutionFrame,
		kRelayPlayerId,
		kRelayCommandId,
		kRelayCommandCount);
	return g_browser_network_relay_build_json;
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_accept_browser_network_relay_packet(const char *packet_hex)
{
	ScopedOriginalMemoryManager memory_manager_scope;

	UnsignedByte packet_bytes[MAX_PACKET_SIZE] = {};
	int length = 0;
	const bool decoded = decode_hex(packet_hex, packet_bytes, length);
	NetCommandRef *parsed = decoded
		? NetPacket::ConstructNetCommandMsgFromRawData(packet_bytes, static_cast<UnsignedShort>(length))
		: nullptr;

	bool parsed_ok = false;
	int relay = -1;
	int execution_frame = -1;
	int player_id = -1;
	int command_id = -1;
	int command_count = -1;
	const char *command_type = "UNKNOWN";

	if (parsed != nullptr && parsed->getCommand() != nullptr) {
		NetCommandMsg *command = parsed->getCommand();
		command_type = net_command_type_name(command->getNetCommandType());
		relay = parsed->getRelay();
		execution_frame = static_cast<int>(command->getExecutionFrame());
		player_id = static_cast<int>(command->getPlayerID());
		command_id = static_cast<int>(command->getID());
		if (command->getNetCommandType() == NETCOMMANDTYPE_FRAMEINFO) {
			NetFrameCommandMsg *frame = static_cast<NetFrameCommandMsg *>(command);
			command_count = static_cast<int>(frame->getCommandCount());
		}
		parsed_ok =
			command->getNetCommandType() == NETCOMMANDTYPE_FRAMEINFO &&
			relay == kRelayMask &&
			execution_frame == kRelayExecutionFrame &&
			player_id == kRelayPlayerId &&
			command_id == kRelayCommandId &&
			command_count == kRelayCommandCount;
	}

	const bool ok = decoded && parsed_ok;
	std::snprintf(g_browser_network_relay_receive_json, sizeof(g_browser_network_relay_receive_json),
		"{\"ok\":%s,"
		"\"source\":\"GameNetwork browser relay NetPacket receive probe\","
		"\"relayReady\":%s,"
		"\"browserTransport\":\"harness relay queue\","
		"\"originalParser\":\"NetPacket::ConstructNetCommandMsgFromRawData\","
		"\"nextRequired\":\"browserTransportReceiveIntoConnectionManager\","
		"\"packet\":{\"decoded\":%s,\"bytes\":%d,\"commandType\":\"%s\","
		"\"relay\":%d,\"executionFrame\":%d,\"playerId\":%d,"
		"\"commandId\":%d,\"frameCommandCount\":%d}}",
		ok ? "true" : "false",
		ok ? "true" : "false",
		decoded ? "true" : "false",
		length,
		command_type,
		relay,
		execution_frame,
		player_id,
		command_id,
		command_count);

	if (parsed != nullptr) {
		parsed->deleteInstance();
	}
	return g_browser_network_relay_receive_json;
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
