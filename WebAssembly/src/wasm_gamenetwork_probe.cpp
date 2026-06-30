#include "wasm_gamenetwork_probe.h"

#include "PreRTS.h"

#include "wasm_memory_manager_scope.h"

#include <cstdio>
#include <cstring>

#include "Common/GameMemory.h"
#include "Common/GameState.h"
#include "Common/GlobalData.h"
#include "Common/Player.h"
#include "Common/Recorder.h"
#include "GameClient/DisconnectMenu.h"
#include "GameNetwork/Connection.h"
#include "GameNetwork/DisconnectManager.h"
#include "GameNetwork/FrameData.h"
#include "GameNetwork/FrameDataManager.h"
#include "GameNetwork/FrameMetrics.h"
#include "GameNetwork/NetCommandList.h"
#include "GameNetwork/NetCommandMsg.h"
#include "GameNetwork/NetCommandRef.h"
#include "GameNetwork/NetCommandWrapperList.h"
#include "GameNetwork/NetPacket.h"
#include "GameNetwork/Transport.h"

#define private public
#include "GameNetwork/ConnectionManager.h"
#undef private

#include "GameNetwork/NetworkUtil.h"
#include "GameLogic/GameLogic.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

class PingerInterface;

DisconnectMenu *TheDisconnectMenu __attribute__((weak)) = nullptr;
GameState *TheGameState __attribute__((weak)) = nullptr;
NetworkInterface *TheNetwork __attribute__((weak)) = nullptr;
PingerInterface *ThePinger __attribute__((weak)) = nullptr;
RecorderClass *TheRecorder __attribute__((weak)) = nullptr;

__attribute__((weak)) DisconnectMenu::DisconnectMenu() :
	m_disconnectManager(nullptr),
	m_menuState(DISCONNECTMENUSTATETYPE_SCREENOFF)
{
}

__attribute__((weak)) DisconnectMenu::~DisconnectMenu() {}
__attribute__((weak)) void DisconnectMenu::init() {}
__attribute__((weak)) void DisconnectMenu::attachDisconnectManager(DisconnectManager *disconnectManager)
{
	m_disconnectManager = disconnectManager;
}
__attribute__((weak)) void DisconnectMenu::showScreen() { m_menuState = DISCONNECTMENUSTATETYPE_SCREENON; }
__attribute__((weak)) void DisconnectMenu::hideScreen() { m_menuState = DISCONNECTMENUSTATETYPE_SCREENOFF; }
__attribute__((weak)) void DisconnectMenu::setPlayerName(Int, UnicodeString) {}
__attribute__((weak)) void DisconnectMenu::setPlayerTimeoutTime(Int, time_t) {}
__attribute__((weak)) void DisconnectMenu::hidePacketRouterTimeout() {}
__attribute__((weak)) void DisconnectMenu::showChat(UnicodeString) {}
__attribute__((weak)) void DisconnectMenu::removePlayer(Int, UnicodeString) {}
__attribute__((weak)) void DisconnectMenu::updateVotes(Int, Int) {}
__attribute__((weak)) void RecorderClass::logPlayerDisconnect(UnicodeString, Int) {}
__attribute__((weak)) AsciiString GameState::portableMapPathToRealMapPath(const AsciiString& in) const
{
	return in;
}
__attribute__((weak)) Bool Player::isPlayerActive(void) const
{
	return TRUE;
}

namespace {
char g_browser_network_relay_build_json[4096] = {};
char g_browser_network_relay_receive_json[4096] = {};
char g_browser_network_relay_packet_hex[(MAX_PACKET_SIZE * 2) + 1] = {};
char g_browser_network_transport_build_json[4096] = {};
char g_browser_network_transport_receive_json[8192] = {};
char g_browser_network_transport_packet_hex[(MAX_PACKET_SIZE * 2) + 1] = {};
constexpr int kRelayExecutionFrame = 2468;
constexpr int kRelayPlayerId = 2;
constexpr int kRelayCommandId = 314;
constexpr int kRelayCommandCount = 9;
constexpr int kRelayMask = 0x05;
constexpr int kTransportExecutionFrame = 2470;
constexpr int kTransportPlayerId = 2;
constexpr int kTransportFrameInfoCommandId = 315;
constexpr int kTransportRunAheadCommandId = 316;
constexpr int kTransportFrameCommandCount = 1;
constexpr int kTransportRunAhead = 20;
constexpr int kTransportFrameRate = 30;
constexpr int kTransportRelayMask = 1 << kTransportPlayerId;

const char *net_command_type_name(NetCommandType type)
{
	switch (type) {
		case NETCOMMANDTYPE_FRAMEINFO:
			return "NETCOMMANDTYPE_FRAMEINFO";
		case NETCOMMANDTYPE_ACKBOTH:
			return "NETCOMMANDTYPE_ACKBOTH";
		case NETCOMMANDTYPE_GAMECOMMAND:
			return "NETCOMMANDTYPE_GAMECOMMAND";
		case NETCOMMANDTYPE_RUNAHEAD:
			return "NETCOMMANDTYPE_RUNAHEAD";
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

int first_invalid_hex_index(const char *hex)
{
	if (hex == nullptr) {
		return -1;
	}

	for (int i = 0; hex[i] != '\0'; ++i) {
		if (hex_value(hex[i]) < 0) {
			return i;
		}
	}
	return -1;
}

bool add_command_to_packet(NetPacket *packet, NetCommandMsg *message, int relay)
{
	if (packet == nullptr || message == nullptr) {
		return false;
	}

	NetCommandRef *ref = NEW_NETCOMMANDREF(message);
	ref->setRelay(static_cast<UnsignedByte>(relay));
	const Bool added = packet->addCommand(ref);
	ref->deleteInstance();
	message->detach();
	return added;
}

NetPacket *build_relay_packet(int execution_frame, int player_id, int command_id, int command_count, int relay)
{
	NetFrameCommandMsg *frame = newInstance(NetFrameCommandMsg);
	frame->setExecutionFrame(static_cast<UnsignedInt>(execution_frame));
	frame->setPlayerID(static_cast<UnsignedInt>(player_id));
	frame->setID(static_cast<UnsignedShort>(command_id));
	frame->setCommandCount(static_cast<UnsignedShort>(command_count));

	NetPacket *packet = newInstance(NetPacket);
	const Bool added = add_command_to_packet(packet, frame, relay);

	if (!added) {
		packet->deleteInstance();
		return nullptr;
	}
	return packet;
}

NetPacket *build_transport_connection_packet()
{
	NetPacket *packet = newInstance(NetPacket);

	NetFrameCommandMsg *frame = newInstance(NetFrameCommandMsg);
	frame->setExecutionFrame(static_cast<UnsignedInt>(kTransportExecutionFrame));
	frame->setPlayerID(static_cast<UnsignedInt>(kTransportPlayerId));
	frame->setID(static_cast<UnsignedShort>(kTransportFrameInfoCommandId));
	frame->setCommandCount(static_cast<UnsignedShort>(kTransportFrameCommandCount));

	NetRunAheadCommandMsg *run_ahead = newInstance(NetRunAheadCommandMsg);
	run_ahead->setExecutionFrame(static_cast<UnsignedInt>(kTransportExecutionFrame));
	run_ahead->setPlayerID(static_cast<UnsignedInt>(kTransportPlayerId));
	run_ahead->setID(static_cast<UnsignedShort>(kTransportRunAheadCommandId));
	run_ahead->setRunAhead(static_cast<UnsignedShort>(kTransportRunAhead));
	run_ahead->setFrameRate(static_cast<UnsignedByte>(kTransportFrameRate));

	const Bool frame_added = add_command_to_packet(packet, frame, kTransportRelayMask);
	const Bool run_ahead_added = add_command_to_packet(packet, run_ahead, kTransportRelayMask);
	if (!frame_added || !run_ahead_added) {
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

EMSCRIPTEN_KEEPALIVE const char *cnc_port_build_browser_network_transport_packet()
{
	if (!isMemoryManagerOfficiallyInited()) {
		initMemoryManager();
	}

	NetPacket *packet = build_transport_connection_packet();
	if (packet == nullptr) {
		std::snprintf(g_browser_network_transport_build_json, sizeof(g_browser_network_transport_build_json),
			"{\"ok\":false,\"source\":\"GameNetwork browser Transport/FrameData packet build probe\","
			"\"transportReady\":false,\"nextRequired\":\"twoBrowserContextsOrLanApiRelay\"}");
		return g_browser_network_transport_build_json;
	}

	const int length = packet->getLength();
	const int commands = packet->getNumCommands();
	const bool encoded = encode_hex(packet->getData(), length,
		g_browser_network_transport_packet_hex, sizeof(g_browser_network_transport_packet_hex));
	packet->deleteInstance();

	const bool ok = encoded && commands == 2 && length > 0 && length <= MAX_PACKET_SIZE;
	std::snprintf(g_browser_network_transport_build_json, sizeof(g_browser_network_transport_build_json),
		"{\"ok\":%s,"
		"\"source\":\"GameNetwork browser Transport/FrameData packet build probe\","
		"\"transportReady\":%s,"
		"\"browserTransport\":\"harness relay queue\","
		"\"originalSerializer\":\"NetPacket::addCommand\","
		"\"nextRequired\":\"twoBrowserContextsOrLanApiRelay\","
		"\"packet\":{\"hex\":\"%s\",\"bytes\":%d,\"commands\":%d,"
		"\"commandType\":\"NETCOMMANDTYPE_FRAMEINFO+NETCOMMANDTYPE_RUNAHEAD\","
		"\"relay\":%d,\"executionFrame\":%d,\"playerId\":%d,"
		"\"commandId\":%d,\"frameCommandCount\":%d,"
		"\"runAheadCommandId\":%d,\"runAhead\":%d,\"frameRate\":%d}}",
		ok ? "true" : "false",
		ok ? "true" : "false",
		encoded ? g_browser_network_transport_packet_hex : "",
		length,
		commands,
		kTransportRelayMask,
		kTransportExecutionFrame,
		kTransportPlayerId,
		kTransportFrameInfoCommandId,
		kTransportFrameCommandCount,
		kTransportRunAheadCommandId,
		kTransportRunAhead,
		kTransportFrameRate);
	return g_browser_network_transport_build_json;
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_accept_browser_network_transport_packet(const char *packet_hex)
{
	if (!isMemoryManagerOfficiallyInited()) {
		initMemoryManager();
	}

	UnsignedByte packet_bytes[MAX_PACKET_SIZE] = {};
	int length = 0;
	const int input_hex_length = packet_hex != nullptr ? static_cast<int>(std::strlen(packet_hex)) : -1;
	const int invalid_hex_index = first_invalid_hex_index(packet_hex);
	const bool decoded = decode_hex(packet_hex, packet_bytes, length);

	bool transport_injected = false;
	bool relay_driven = false;
	bool transport_cleared = false;
	bool manager_ready = false;
	int frame_command_count = -1;
	int command_count = -1;
	int ready_state = -1;
	int stored_command_type = -1;
	int stored_execution_frame = -1;
	int stored_player_id = -1;
	int stored_command_id = -1;
	int stored_run_ahead = -1;
	int stored_frame_rate = -1;
	unsigned int smallest_cushion = 0;

	if (decoded) {
		static GameLogic *probe_logic = nullptr;
		alignas(GlobalData) static UnsignedByte probe_global_data_storage[sizeof(GlobalData)] = {};
		GameLogic *old_game_logic = TheGameLogic;
		GlobalData *old_global_data = TheWritableGlobalData;
		if (probe_logic == nullptr) {
			probe_logic = new GameLogic;
		}
		TheGameLogic = probe_logic;
		// The partial networking probe only reads these GlobalData network lengths.
		// Avoid constructing a full GlobalData late in the long smoke page.
		TheWritableGlobalData = reinterpret_cast<GlobalData *>(probe_global_data_storage);
		TheWritableGlobalData->m_networkFPSHistoryLength = 30;
		TheWritableGlobalData->m_networkLatencyHistoryLength = 200;
		TheWritableGlobalData->m_networkCushionHistoryLength = 10;

		{
			ConnectionManager *manager = new ConnectionManager;
			for (Int i = 0; i < MAX_SLOTS; ++i) {
				manager->m_connections[i] = nullptr;
				manager->m_frameData[i] = nullptr;
				manager->m_packetRouterFallback[i] = static_cast<UnsignedInt>(-1);
				manager->m_latencyAverages[i] = 0.0f;
				manager->m_fpsAverages[i] = -1;
			}
			manager->m_localSlot = kTransportPlayerId;
			manager->m_packetRouterSlot = kTransportPlayerId;
			manager->m_localAddr = 0x7f000001;
			manager->m_localPort = 8088;
			manager->m_minFpsPlayer = -1;
			manager->m_minFps = -1;
			manager->m_smallestPacketArrivalCushion = static_cast<UnsignedInt>(-1);
			manager->m_didSelfSlug = FALSE;
			manager->m_frameMetrics.init();

			manager->m_transport = new Transport;
			std::memset(manager->m_transport->m_inBuffer, 0, sizeof(manager->m_transport->m_inBuffer));
			std::memset(manager->m_transport->m_outBuffer, 0, sizeof(manager->m_transport->m_outBuffer));
			manager->m_transport->m_port = 8088;

			manager->m_pendingCommands = newInstance(NetCommandList);
			manager->m_pendingCommands->init();
			manager->m_relayedCommands = newInstance(NetCommandList);
			manager->m_relayedCommands->init();
			manager->m_netCommandWrapperList = newInstance(NetCommandWrapperList);
			manager->m_netCommandWrapperList->init();

			FrameDataManager *frame_data = newInstance(FrameDataManager)(FALSE);
			frame_data->init();
			manager->m_frameData[kTransportPlayerId] = frame_data;

			NetPacket *frame_info_packet = build_relay_packet(
				kTransportExecutionFrame,
				kTransportPlayerId,
				kTransportFrameInfoCommandId,
				kTransportFrameCommandCount,
				kTransportRelayMask);
			TransportMessage &message = manager->m_transport->m_inBuffer[0];
			message.header.magic = GENERALS_MAGIC_NUMBER;
			message.header.crc = 0;
			const int frame_info_packet_length = frame_info_packet != nullptr ? frame_info_packet->getLength() : 0;
			if (frame_info_packet != nullptr) {
				std::memcpy(message.data, frame_info_packet->getData(), static_cast<size_t>(frame_info_packet_length));
				frame_info_packet->deleteInstance();
				frame_info_packet = nullptr;
			}
			message.length = frame_info_packet_length;
			message.addr = 0x7f000001;
			message.port = 8088;
			transport_injected = frame_info_packet_length > 0 && message.length == frame_info_packet_length;

			manager->doRelay();
			relay_driven = true;
			transport_cleared = manager->m_transport->m_inBuffer[0].length == 0;

			TransportMessage delivered_message = {};
			delivered_message.header.magic = GENERALS_MAGIC_NUMBER;
			delivered_message.header.crc = 0;
			std::memcpy(delivered_message.data, packet_bytes, static_cast<size_t>(length));
			delivered_message.length = length;
			delivered_message.addr = 0x7f000001;
			delivered_message.port = 8088;
			NetPacket *delivered_packet = newInstance(NetPacket)(&delivered_message);
			NetCommandList *delivered_commands = delivered_packet != nullptr ? delivered_packet->getCommandList() : nullptr;
			for (NetCommandRef *ref = delivered_commands != nullptr ? delivered_commands->getFirstMessage() : nullptr;
				ref != nullptr;
				ref = ref->getNext()) {
				NetCommandMsg *command = ref->getCommand();
				if (command != nullptr &&
					command->getNetCommandType() == NETCOMMANDTYPE_RUNAHEAD &&
					static_cast<int>(command->getExecutionFrame()) == kTransportExecutionFrame &&
					static_cast<int>(command->getPlayerID()) == kTransportPlayerId) {
					frame_data->addNetCommandMsg(command);
					break;
				}
			}
			if (delivered_commands != nullptr) {
				delivered_commands->deleteInstance();
				delivered_commands = nullptr;
			}
			if (delivered_packet != nullptr) {
				delivered_packet->deleteInstance();
				delivered_packet = nullptr;
			}

			frame_command_count = static_cast<int>(frame_data->getFrameCommandCount(kTransportExecutionFrame));
			command_count = static_cast<int>(frame_data->getCommandCount(kTransportExecutionFrame));
			ready_state = static_cast<int>(frame_data->allCommandsReady(kTransportExecutionFrame, FALSE));
			manager_ready = manager->allCommandsReady(kTransportExecutionFrame, TRUE);
			smallest_cushion = manager->m_smallestPacketArrivalCushion;

			NetCommandList *frame_commands = frame_data->getFrameCommandList(kTransportExecutionFrame);
			NetCommandRef *first = frame_commands != nullptr ? frame_commands->getFirstMessage() : nullptr;
			NetCommandMsg *stored = first != nullptr ? first->getCommand() : nullptr;
			if (stored != nullptr) {
				stored_command_type = static_cast<int>(stored->getNetCommandType());
				stored_execution_frame = static_cast<int>(stored->getExecutionFrame());
				stored_player_id = static_cast<int>(stored->getPlayerID());
				stored_command_id = static_cast<int>(stored->getID());
				if (stored->getNetCommandType() == NETCOMMANDTYPE_RUNAHEAD) {
					NetRunAheadCommandMsg *run_ahead = static_cast<NetRunAheadCommandMsg *>(stored);
					stored_run_ahead = static_cast<int>(run_ahead->getRunAhead());
					stored_frame_rate = static_cast<int>(run_ahead->getFrameRate());
				}
			}
			// Keep this probe-owned partial ConnectionManager alive for the page lifetime.
			// Its destructor expects a fuller network runtime than this vertical smoke builds.
		}

		TheWritableGlobalData = old_global_data;
		TheGameLogic = old_game_logic;
	}

	const bool frame_data_ready =
		frame_command_count == kTransportFrameCommandCount &&
		command_count == kTransportFrameCommandCount &&
		ready_state == FRAMEDATA_READY &&
		manager_ready;
	const bool stored_command_ok =
		stored_command_type == NETCOMMANDTYPE_RUNAHEAD &&
		stored_execution_frame == kTransportExecutionFrame &&
		stored_player_id == kTransportPlayerId &&
		stored_command_id == kTransportRunAheadCommandId &&
		stored_run_ahead == kTransportRunAhead &&
		stored_frame_rate == kTransportFrameRate;
	const bool ok = decoded && transport_injected && relay_driven && transport_cleared &&
		frame_data_ready && stored_command_ok;

	std::snprintf(g_browser_network_transport_receive_json, sizeof(g_browser_network_transport_receive_json),
		"{\"ok\":%s,"
		"\"source\":\"GameNetwork browser Transport/FrameData relay probe\","
		"\"transportReady\":%s,"
		"\"browserTransport\":\"harness relay queue\","
		"\"originalTransport\":\"Transport::m_inBuffer\","
		"\"originalRelay\":\"ConnectionManager::doRelay\","
		"\"originalFrameData\":\"NetPacket::getCommandList -> FrameDataManager::addNetCommandMsg/allCommandsReady\","
		"\"nextRequired\":\"twoBrowserContextsOrLanApiRelay\","
		"\"packet\":{\"decoded\":%s,\"inputHexLength\":%d,\"invalidHexIndex\":%d,"
		"\"bytes\":%d,\"commands\":2,"
		"\"commandType\":\"NETCOMMANDTYPE_FRAMEINFO+NETCOMMANDTYPE_RUNAHEAD\","
		"\"relay\":%d,\"executionFrame\":%d,\"playerId\":%d,"
		"\"commandId\":%d,\"frameCommandCount\":%d,"
		"\"runAheadCommandId\":%d,\"runAhead\":%d,\"frameRate\":%d},"
		"\"transport\":{\"injected\":%s,\"cleared\":%s,\"addr\":%u,\"port\":%u},"
		"\"connectionManager\":{\"doRelayDriven\":%s,\"smallestPacketArrivalCushion\":%u},"
		"\"frameData\":{\"ready\":%s,\"managerReady\":%s,\"readyState\":%d,"
		"\"frameCommandCount\":%d,\"commandCount\":%d,"
		"\"storedCommandType\":\"%s\",\"storedCommandId\":%d,"
		"\"storedExecutionFrame\":%d,\"storedPlayerId\":%d,"
		"\"storedRunAhead\":%d,\"storedFrameRate\":%d}}",
		ok ? "true" : "false",
		ok ? "true" : "false",
		decoded ? "true" : "false",
		input_hex_length,
		invalid_hex_index,
		length,
		kTransportRelayMask,
		kTransportExecutionFrame,
		kTransportPlayerId,
		kTransportFrameInfoCommandId,
		kTransportFrameCommandCount,
		kTransportRunAheadCommandId,
		kTransportRunAhead,
		kTransportFrameRate,
		transport_injected ? "true" : "false",
		transport_cleared ? "true" : "false",
		0x7f000001u,
		8088u,
		relay_driven ? "true" : "false",
		smallest_cushion,
		frame_data_ready ? "true" : "false",
		manager_ready ? "true" : "false",
		ready_state,
		frame_command_count,
		command_count,
		net_command_type_name(static_cast<NetCommandType>(stored_command_type)),
		stored_command_id,
		stored_execution_frame,
		stored_player_id,
		stored_run_ahead,
		stored_frame_rate);
	return g_browser_network_transport_receive_json;
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
