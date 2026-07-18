#include "wasm_gamenetwork_probe.h"

#include "PreRTS.h"

#include "wasm_memory_manager_scope.h"

#include <cstdio>
#include <cstring>
#include <string>

#include "Common/GameMemory.h"
#include "Common/CRC.h"
#include "Common/MessageStream.h"
#include "Common/GameState.h"
#include "Common/GlobalData.h"
#include "Common/MultiplayerSettings.h"
#include "Common/Player.h"
#include "Common/PlayerTemplate.h"
#include "Common/RandomValue.h"
#include "Common/Recorder.h"
#include "Common/UserPreferences.h"
#include "GameClient/DisconnectMenu.h"
#include "GameClient/GameText.h"
#include "GameClient/LoadScreen.h"
#include "GameClient/MapUtil.h"
#include "GameClient/MessageBox.h"
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
#include "GameNetwork/RankPointValue.h"
#include "GameNetwork/Transport.h"

#define private public
#include "GameNetwork/ConnectionManager.h"
#undef private

#include "GameNetwork/LANAPI.h"
#include "GameNetwork/LANAPICallbacks.h"
#include "GameNetwork/LANGameInfo.h"
#include "GameNetwork/GameSpy/ThreadUtils.h"
#include "GameNetwork/NetworkUtil.h"
#define private public
#include "GameLogic/GameLogic.h"
#undef private

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

class PingerInterface;
class GameSpyStagingRoom;
class ScriptActionsInterface;
class ScriptEngine;
class WindowLayout;

extern DisconnectMenu *TheDisconnectMenu;
extern GameState *TheGameState;
extern NetworkInterface *TheNetwork;
extern PingerInterface *ThePinger;
extern RecorderClass *TheRecorder;
extern GameSpyStagingRoom *TheGameSpyGame;
extern RankPoints *TheRankPointValues;
extern ScriptActionsInterface *TheScriptActions;
extern ScriptEngine *TheScriptEngine;
extern Bool LANbuttonPushed;
extern Bool LANSocketErrorDetected;
extern Int NET_CRC_INTERVAL;
extern NameKeyType listboxChatWindowID;
extern GameWindow *listboxChatWindow;
extern GameWindow *listboxPlayers;
extern NameKeyType listboxGamesID;
extern GameWindow *listboxGames;
extern NameKeyType listboxChatWindowLanGameID;
extern GameWindow *listboxChatWindowLanGame;
extern WindowLayout *mapSelectLayout;
extern NameKeyType listboxChatWindowScoreScreenID;
extern GameWindow *listboxChatWindowScoreScreen;

#ifndef CNC_PORT_LINKS_REAL_GAMENETWORK_OWNERS
DisconnectMenu *TheDisconnectMenu __attribute__((weak)) = nullptr;
GameState *TheGameState __attribute__((weak)) = nullptr;
NetworkInterface *TheNetwork __attribute__((weak)) = nullptr;
PingerInterface *ThePinger __attribute__((weak)) = nullptr;
RecorderClass *TheRecorder __attribute__((weak)) = nullptr;
GameSpyStagingRoom *TheGameSpyGame __attribute__((weak)) = nullptr;
RankPoints *TheRankPointValues __attribute__((weak)) = nullptr;
#ifndef CNC_PORT_LINKS_REAL_SCRIPT_ACTIONS_SINGLETON
ScriptActionsInterface *TheScriptActions __attribute__((weak)) = nullptr;
#endif
#ifndef CNC_PORT_LINKS_REAL_SCRIPT_ENGINE_SINGLETON
ScriptEngine *TheScriptEngine __attribute__((weak)) = nullptr;
#endif
Bool LANbuttonPushed __attribute__((weak)) = false;
Bool LANSocketErrorDetected __attribute__((weak)) = FALSE;
Int NET_CRC_INTERVAL __attribute__((weak)) = 100;
NameKeyType listboxChatWindowID __attribute__((weak)) = NAMEKEY_INVALID;
GameWindow *listboxChatWindow __attribute__((weak)) = nullptr;
GameWindow *listboxPlayers __attribute__((weak)) = nullptr;
NameKeyType listboxGamesID __attribute__((weak)) = NAMEKEY_INVALID;
GameWindow *listboxGames __attribute__((weak)) = nullptr;
NameKeyType listboxChatWindowLanGameID __attribute__((weak)) = NAMEKEY_INVALID;
GameWindow *listboxChatWindowLanGame __attribute__((weak)) = nullptr;
WindowLayout *mapSelectLayout __attribute__((weak)) = nullptr;
NameKeyType listboxChatWindowScoreScreenID __attribute__((weak)) = NAMEKEY_INVALID;
GameWindow *listboxChatWindowScoreScreen __attribute__((weak)) = nullptr;
#endif

extern "C" {
void cnc_port_browser_udp_adapter_clear();
Int cnc_port_browser_udp_adapter_push_incoming(
	const UnsignedByte *bytes,
	Int length,
	UnsignedInt ip,
	UnsignedShort port);
Int cnc_port_browser_udp_adapter_pop_outgoing(
	UnsignedByte *bytes,
	Int capacity,
	UnsignedInt *ip,
	UnsignedShort *port);
Int cnc_port_browser_udp_adapter_outgoing_count();
Int cnc_port_browser_udp_adapter_incoming_count();
Int cnc_port_browser_udp_adapter_write_count();
Int cnc_port_browser_udp_adapter_read_count();
Int cnc_port_browser_udp_adapter_dropped_count();
}

#ifndef CNC_PORT_LINKS_REAL_GAMENETWORK_OWNERS
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
__attribute__((weak)) void RecorderClass::logCRCMismatch() {}
__attribute__((weak)) AsciiString GameState::portableMapPathToRealMapPath(const AsciiString& in) const
{
	return in;
}
__attribute__((weak)) Bool Player::isPlayerActive(void) const
{
	return TRUE;
}
__attribute__((weak)) AsciiString GameState::realMapPathToPortableMapPath(const AsciiString& in) const
{
	return in;
}
__attribute__((weak)) AsciiString GameState::getMapLeafName(const AsciiString& in) const
{
	const char *path = in.str();
	const char *leaf = path;
	for (const char *cursor = path; cursor != nullptr && *cursor != '\0'; ++cursor) {
		if (*cursor == '\\' || *cursor == '/') {
			leaf = cursor + 1;
		}
	}
	return AsciiString(leaf);
}
__attribute__((weak)) AsciiString MapCache::getMapExtension() const
{
	return AsciiString("map");
}
__attribute__((weak)) const MapMetaData *MapCache::findMap(AsciiString map)
{
	if (map.compare("Maps\\TournamentDesert\\TournamentDesert.map") != 0 &&
		map.compare("Maps/TournamentDesert/TournamentDesert.map") != 0) {
		return nullptr;
	}
	static MapMetaData metadata;
	static bool initialized = false;
	if (!initialized) {
		metadata.m_displayName = UnicodeString(L"Browser LAN Tournament Desert");
		metadata.m_numPlayers = 2;
		metadata.m_isMultiplayer = TRUE;
		metadata.m_isOfficial = TRUE;
		metadata.m_filesize = 43210;
		metadata.m_CRC = 0x1234abcd;
		metadata.m_fileName = AsciiString("Maps\\TournamentDesert\\TournamentDesert.map");
		initialized = true;
	}
	return &metadata;
}
__attribute__((weak)) void MapCache::updateCache()
{
}
__attribute__((weak)) GameWindow *MessageBoxOk(UnicodeString, UnicodeString, GameWinMsgBoxFunc)
{
	return nullptr;
}
__attribute__((weak)) Bool WouldMapTransfer(const AsciiString&)
{
	return FALSE;
}
__attribute__((weak)) void lanUpdateSlotList()
{
}

__attribute__((weak)) void StartPatchCheck()
{
}

__attribute__((weak)) void CancelPatchCheckCallback()
{
}

__attribute__((weak)) void HTTPThinkWrapper()
{
}

__attribute__((weak)) void StopAsyncDNSCheck()
{
}

__attribute__((weak)) void StartDownloadingPatches()
{
}

__attribute__((weak)) void deleteNotificationBox()
{
}

__attribute__((weak)) void DownloadMenuUpdate(WindowLayout *, void *)
{
}

__attribute__((weak)) Bool IsFirstCDPresent()
{
	return TRUE;
}
__attribute__((weak)) void updateGameOptions()
{
}
__attribute__((weak)) void HideGameInfoWindow(Bool)
{
}
__attribute__((weak)) void LANEnableStartButton(Bool)
{
}
__attribute__((weak)) void outputCRCDebugLines()
{
}
__attribute__((weak)) void outputCRCDumpLines()
{
}
__attribute__((weak)) void PopulateInGameDiplomacyPopup()
{
}
__attribute__((weak)) LANPreferences::LANPreferences()
{
}
__attribute__((weak)) LANPreferences::~LANPreferences()
{
}
__attribute__((weak)) Int LANPreferences::getPreferredColor()
{
	return -1;
}
__attribute__((weak)) Int LANPreferences::getPreferredFaction()
{
	return -1;
}
__attribute__((weak)) AsciiString LANPreferences::getPreferredMap()
{
	return AsciiString("Maps/TournamentDesert");
}
__attribute__((weak)) Bool LANPreferences::usesSystemMapDir()
{
	return TRUE;
}
__attribute__((weak)) void LANPreferences::setSuperweaponRestricted(Bool)
{
}
__attribute__((weak)) void LANPreferences::setStartingCash(const Money&)
{
}
// LoadScreen/MapTransferLoadScreen are owned by the real
// GameEngine/Source/GameClient/GUI/LoadScreen.cpp linked through
// zh_gameengine_real_lifecycle_runtime.
__attribute__((weak)) void Shell::push(AsciiString, Bool)
{
}
__attribute__((weak)) void Shell::pop()
{
}
__attribute__((weak)) void Shell::showShell(Bool)
{
}
__attribute__((weak)) void Shell::hideShell()
{
}
__attribute__((weak)) std::wstring MultiByteToWideCharSingleLine(const char *orig)
{
	std::wstring out;
	if (orig == nullptr) {
		return out;
	}
	for (const char *cursor = orig; *cursor != '\0' && *cursor != '\n' && *cursor != '\r'; ++cursor) {
		out.push_back(static_cast<unsigned char>(*cursor));
	}
	return out;
}
__attribute__((weak)) std::string WideCharStringToMultiByte(const WideChar *orig)
{
	std::string out;
	if (orig == nullptr) {
		return out;
	}
	for (const WideChar *cursor = orig; *cursor != 0; ++cursor) {
		out.push_back(static_cast<char>(*cursor & 0xff));
	}
	return out;
}
#endif

namespace {
void set_probe_logic_frame(GameLogic *logic, UnsignedInt frame)
{
	if (logic != nullptr) {
		logic->m_frame = frame;
	}
}

char g_browser_network_relay_build_json[4096] = {};
char g_browser_network_relay_receive_json[4096] = {};
char g_browser_network_relay_packet_hex[(MAX_PACKET_SIZE * 2) + 1] = {};
char g_browser_network_transport_build_json[4096] = {};
char g_browser_network_transport_receive_json[8192] = {};
char g_browser_network_transport_packet_hex[(MAX_PACKET_SIZE * 2) + 1] = {};
char g_browser_network_transport_wire_build_json[12000] = {};
char g_browser_network_transport_wire_receive_json[30000] = {};
char g_browser_network_transport_live_send_json[12000] = {};
char g_browser_network_transport_live_receive_json[30000] = {};
char g_browser_network_transport_wire_hex[((MAX_MESSAGE_LEN + sizeof(TransportMessageHeader)) * 2) + 1] = {};
char g_browser_network_transport_wire_payload_hex[(MAX_PACKET_SIZE * 2) + 1] = {};
char g_browser_lanapi_build_json[8192] = {};
char g_browser_lanapi_receive_json[8192] = {};
char g_browser_lanapi_packet_hex[(sizeof(LANMessage) * 2) + 1] = {};
char g_browser_lanapi_join_build_json[8192] = {};
char g_browser_lanapi_join_host_json[16384] = {};
char g_browser_lanapi_join_client_json[16384] = {};
char g_browser_lanapi_join_request_hex[(sizeof(LANMessage) * 2) + 1] = {};
char g_browser_lanapi_join_accept_hex[(sizeof(LANMessage) * 2) + 1] = {};
char g_browser_lanapi_game_options_hex[(sizeof(LANMessage) * 2) + 1] = {};
char g_browser_lanapi_game_start_build_json[16384] = {};
char g_browser_lanapi_game_start_client_json[16384] = {};
char g_browser_lanapi_live_game_start_send_json[18000] = {};
char g_browser_lanapi_live_game_start_receive_json[22000] = {};
char g_browser_lanapi_game_start_hex[(sizeof(LANMessage) * 2) + 1] = {};
char g_browser_lanapi_network_update_json[20000] = {};
char g_browser_network_multiframe_lockstep_json[30000] = {};
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
constexpr UnsignedInt kNetworkMultiFrameCount = 3;
constexpr UnsignedInt kNetworkDesyncNotReadyFrame = 9001;
constexpr UnsignedInt kNetworkDesyncResendFrame = 9002;
constexpr UnsignedInt kTransportWireRemoteIp = 0x7f000002;
constexpr UnsignedShort kTransportWireRemotePort = NETWORK_BASE_PORT_NUMBER;
constexpr UnsignedInt kLanApiLocalIp = 0x7f000001;
constexpr UnsignedInt kLanApiRemoteIp = 0x7f000002;
constexpr UnsignedInt kLanApiJoinerIp = 0x7f000003;
constexpr UnsignedShort kLanApiLobbyPort = 8086;
constexpr UnsignedInt kLanApiSeed = 98765;
constexpr UnsignedInt kLanApiMapCrc = 0x1234abcd;
constexpr UnsignedInt kLanApiMapSize = 43210;
constexpr UnsignedInt kLanApiCrcInterval = 100;
constexpr UnsignedInt kLanApiStartingCash = 0;
constexpr const char *kLanApiPortableMap = "Maps/TournamentDesert";
constexpr const char *kLanApiParsedMap = "Maps\\TournamentDesert\\TournamentDesert.map";
constexpr const char *kLanApiParsedMapJson = "Maps/TournamentDesert/TournamentDesert.map";
constexpr const WideChar kLanApiGameName[] = L"Browser LAN Game";
constexpr const WideChar kLanApiPlayerName[] = L"Browser Host";
constexpr const WideChar kLanApiJoinerName[] = L"Guest";
constexpr const char *kLanApiUserName = "browser-host";
constexpr const char *kLanApiHostName = "browser-client-0";
constexpr const char *kLanApiJoinerUserName = "browser-guest";
constexpr const char *kLanApiJoinerHostName = "browser-client-1";

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

const char *lan_message_type_name(int type)
{
	switch (type) {
		case LANMessage::MSG_REQUEST_LOCATIONS:
			return "MSG_REQUEST_LOCATIONS";
		case LANMessage::MSG_GAME_ANNOUNCE:
			return "MSG_GAME_ANNOUNCE";
		case LANMessage::MSG_LOBBY_ANNOUNCE:
			return "MSG_LOBBY_ANNOUNCE";
		case LANMessage::MSG_REQUEST_JOIN:
			return "MSG_REQUEST_JOIN";
		case LANMessage::MSG_JOIN_ACCEPT:
			return "MSG_JOIN_ACCEPT";
		case LANMessage::MSG_JOIN_DENY:
			return "MSG_JOIN_DENY";
		case LANMessage::MSG_REQUEST_GAME_LEAVE:
			return "MSG_REQUEST_GAME_LEAVE";
		case LANMessage::MSG_REQUEST_LOBBY_LEAVE:
			return "MSG_REQUEST_LOBBY_LEAVE";
		case LANMessage::MSG_SET_ACCEPT:
			return "MSG_SET_ACCEPT";
		case LANMessage::MSG_MAP_AVAILABILITY:
			return "MSG_MAP_AVAILABILITY";
		case LANMessage::MSG_CHAT:
			return "MSG_CHAT";
		case LANMessage::MSG_GAME_START:
			return "MSG_GAME_START";
		case LANMessage::MSG_GAME_START_TIMER:
			return "MSG_GAME_START_TIMER";
		case LANMessage::MSG_GAME_OPTIONS:
			return "MSG_GAME_OPTIONS";
		case LANMessage::MSG_INACTIVE:
			return "MSG_INACTIVE";
		case LANMessage::MSG_REQUEST_GAME_INFO:
			return "MSG_REQUEST_GAME_INFO";
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

bool decode_hex_with_capacity(const char *hex, UnsignedByte *bytes, int capacity, int &length)
{
	if (hex == nullptr || bytes == nullptr || capacity <= 0) {
		length = 0;
		return false;
	}

	const int hex_length = static_cast<int>(std::strlen(hex));
	if (hex_length <= 0 || (hex_length % 2) != 0 || (hex_length / 2) > capacity) {
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

bool decode_hex(const char *hex, UnsignedByte *bytes, int &length)
{
	return decode_hex_with_capacity(hex, bytes, MAX_PACKET_SIZE, length);
}

void decrypt_transport_message_copy(TransportMessage &message)
{
	UnsignedInt mask = 0x0000fade;
	const int encrypted_length = message.length + static_cast<int>(sizeof(TransportMessageHeader));
	UnsignedByte *bytes = reinterpret_cast<UnsignedByte *>(&message);
	for (int offset = 0; offset + 4 <= encrypted_length; offset += 4) {
		UnsignedInt word = 0;
		std::memcpy(&word, bytes + offset, sizeof(word));
		word = htonl(word);
		word ^= mask;
		std::memcpy(bytes + offset, &word, sizeof(word));
		mask += 0x00000321;
	}
}

bool transport_message_has_valid_crc(const TransportMessage &message)
{
	if (message.length < 0 || message.length > MAX_MESSAGE_LEN) {
		return false;
	}

	CRC crc;
	crc.computeCRC(
		&(message.header.magic),
		message.length + static_cast<Int>(sizeof(TransportMessageHeader)) - static_cast<Int>(sizeof(UnsignedInt)));
	return crc.get() == message.header.crc &&
		message.header.magic == GENERALS_MAGIC_NUMBER;
}

bool decode_queued_lan_message(
	Transport *transport,
	int message_type,
	LANMessage &out,
	char *hex_out,
	int hex_out_size,
	UnsignedInt *addr = nullptr,
	UnsignedShort *port = nullptr,
	Int *active_length = nullptr)
{
	if (transport == nullptr) {
		return false;
	}

	for (Int i = 0; i < MAX_MESSAGES; ++i) {
		const TransportMessage &queued = transport->m_outBuffer[i];
		if (queued.length <= 0 || queued.length > static_cast<Int>(sizeof(LANMessage))) {
			continue;
		}

		TransportMessage decoded = queued;
		decrypt_transport_message_copy(decoded);
		LANMessage message = {};
		std::memcpy(&message, decoded.data, static_cast<size_t>(decoded.length));
		if (message.LANMessageType != message_type) {
			continue;
		}

		out = message;
		if (addr != nullptr) {
			*addr = queued.addr;
		}
		if (port != nullptr) {
			*port = queued.port;
		}
		if (active_length != nullptr) {
			*active_length = queued.length;
		}
		return encode_hex(
			reinterpret_cast<const UnsignedByte *>(&out),
			static_cast<int>(sizeof(out)),
			hex_out,
			hex_out_size);
	}
	return false;
}

bool inject_lan_message(Transport *transport, const LANMessage &lan_message, UnsignedInt addr, UnsignedShort port)
{
	if (transport == nullptr) {
		return false;
	}

	std::memset(transport->m_inBuffer, 0, sizeof(transport->m_inBuffer));
	TransportMessage &message = transport->m_inBuffer[0];
	std::memcpy(message.data, &lan_message, sizeof(lan_message));
	message.length = static_cast<Int>(sizeof(lan_message));
	message.addr = addr;
	message.port = port;
	return message.length == static_cast<Int>(sizeof(lan_message)) &&
		message.addr == addr &&
		message.port == port;
}

Int active_lan_message_length(Int message_type)
{
	LANMessage message = {};
	const char *base = reinterpret_cast<const char *>(&message);
	switch (message_type) {
		case LANMessage::MSG_REQUEST_JOIN:
			return static_cast<Int>(
				reinterpret_cast<const char *>(&message.GameToJoin) - base + sizeof(message.GameToJoin));
		case LANMessage::MSG_JOIN_ACCEPT:
			return static_cast<Int>(
				reinterpret_cast<const char *>(&message.GameJoined) - base + sizeof(message.GameJoined));
		case LANMessage::MSG_JOIN_DENY:
			return static_cast<Int>(
				reinterpret_cast<const char *>(&message.GameNotJoined) - base + sizeof(message.GameNotJoined));
		case LANMessage::MSG_REQUEST_LOCATIONS:
		case LANMessage::MSG_LOBBY_ANNOUNCE:
		case LANMessage::MSG_REQUEST_LOBBY_LEAVE:
		case LANMessage::MSG_GAME_START:
			return static_cast<Int>(
				reinterpret_cast<const char *>(message.hostName) - base + sizeof(message.hostName));
		case LANMessage::MSG_GAME_START_TIMER:
			return static_cast<Int>(
				reinterpret_cast<const char *>(&message.StartTimer) - base + sizeof(message.StartTimer));
		case LANMessage::MSG_GAME_OPTIONS:
			return static_cast<Int>(
				reinterpret_cast<const char *>(message.GameOptions.options) - base + 1);
		default:
			return static_cast<Int>(sizeof(message));
	}
}

bool transport_out_buffer_empty(Transport *transport)
{
	if (transport == nullptr) {
		return false;
	}
	for (Int i = 0; i < MAX_MESSAGES; ++i) {
		if (transport->m_outBuffer[i].length != 0) {
			return false;
		}
	}
	return true;
}

bool transport_in_buffer_empty(Transport *transport)
{
	if (transport == nullptr) {
		return false;
	}
	for (Int i = 0; i < MAX_MESSAGES; ++i) {
		if (transport->m_inBuffer[i].length != 0) {
			return false;
		}
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

void copy_wide_string(WideChar *target, int target_chars, const WideChar *source)
{
	if (target == nullptr || target_chars <= 0) {
		return;
	}
	int index = 0;
	if (source != nullptr) {
		while (source[index] != 0 && index < target_chars - 1) {
			target[index] = source[index];
			++index;
		}
	}
	target[index] = 0;
}

void copy_ascii_string(char *target, int target_chars, const char *source)
{
	if (target == nullptr || target_chars <= 0) {
		return;
	}
	std::snprintf(target, static_cast<size_t>(target_chars), "%s", source != nullptr ? source : "");
}

void copy_json_path(char *target, int target_chars, const char *source)
{
	if (target == nullptr || target_chars <= 0) {
		return;
	}
	int index = 0;
	if (source != nullptr) {
		while (source[index] != 0 && index < target_chars - 1) {
			target[index] = source[index] == '\\' ? '/' : source[index];
			++index;
		}
	}
	target[index] = 0;
}

class ProbeGameText final : public GameTextInterface
{
public:
	void init() override {}
	void reset() override {}
	void update() override {}

	UnicodeString fetch(const Char *label, Bool *exists = nullptr) override
	{
		if (exists != nullptr) {
			*exists = TRUE;
		}
		UnicodeString text;
		text.translate(AsciiString(label != nullptr ? label : ""));
		return text;
	}

	UnicodeString fetch(AsciiString label, Bool *exists = nullptr) override
	{
		return fetch(label.str(), exists);
	}

	AsciiStringVec& getStringsWithLabelPrefix(AsciiString label) override
	{
		m_labels.clear();
		m_labels.push_back(label);
		return m_labels;
	}

	void initMapStringFile(const AsciiString&) override {}

private:
	AsciiStringVec m_labels;
};

class ProbeLANAPI final : public LANAPI
{
public:
	void setLocalAddress(UnsignedInt ip)
	{
		m_localIP = ip;
	}

	void setIdentity(const WideChar *name, const char *userName, const char *hostName)
	{
		m_name = name != nullptr ? name : L"";
		m_userName = userName != nullptr ? userName : "";
		m_hostName = hostName != nullptr ? hostName : "";
	}

	Transport *transportForProbe()
	{
		return m_transport;
	}

	int gameCount() const
	{
		int count = 0;
		for (LANGameInfo *game = m_games; game != nullptr; game = game->getNext()) {
			++count;
		}
		return count;
	}

	LANGameInfo *firstGame() const
	{
		return m_games;
	}

	void forceUpdateDelayElapsed()
	{
		while (timeGetTime() < 202) {
		}
		const UnsignedInt now = timeGetTime();
		m_lastUpdate = now > 201 ? now - 201 : 0;
	}

	void OnGameList(LANGameInfo *gameList) override
	{
		++m_onGameListCalls;
		m_lastGameList = gameList;
	}

	int onGameListCalls() const
	{
		return m_onGameListCalls;
	}

	LANGameInfo *lastGameList() const
	{
		return m_lastGameList;
	}

	void installGame(LANGameInfo *game, Bool currentGame, Bool inLobby)
	{
		if (game == nullptr) {
			return;
		}
		addGame(game);
		if (currentGame) {
			m_currentGame = game;
		}
		m_inLobby = inLobby;
	}

	void markPendingJoin()
	{
		m_pendingAction = ACT_JOIN;
		m_expiration = timeGetTime() + m_actionTimeout;
	}

	LANGameInfo *currentGameForProbe() const
	{
		return m_currentGame;
	}

	Bool inLobbyForProbe() const
	{
		return m_inLobby;
	}

	void OnGameJoin(ReturnType ret, LANGameInfo *theGame) override
	{
		++m_onGameJoinCalls;
		m_lastGameJoinReturn = ret;
		m_lastJoinedGame = theGame;
	}

	void OnPlayerJoin(Int slot, UnicodeString playerName) override
	{
		++m_onPlayerJoinCalls;
		m_lastPlayerJoinSlot = slot;
		m_lastPlayerJoinName = playerName;
		LANAPI::OnPlayerJoin(slot, playerName);
	}

	void OnGameOptions(UnsignedInt playerIP, Int playerSlot, AsciiString options) override
	{
		++m_onGameOptionsCalls;
		m_lastGameOptionsPlayerIP = playerIP;
		m_lastGameOptionsPlayerSlot = playerSlot;
		m_lastGameOptions = options;
		LANAPI::OnGameOptions(playerIP, playerSlot, options);
	}

	void OnGameStart() override
	{
		++m_onGameStartCalls;
		LANAPI::OnGameStart();
	}

	void OnGameCreate(ReturnType ret) override
	{
		++m_onGameCreateCalls;
		m_lastGameCreateReturn = ret;
	}

	int onGameJoinCalls() const { return m_onGameJoinCalls; }
	ReturnType lastGameJoinReturn() const { return m_lastGameJoinReturn; }
	LANGameInfo *lastJoinedGame() const { return m_lastJoinedGame; }
	int onPlayerJoinCalls() const { return m_onPlayerJoinCalls; }
	Int lastPlayerJoinSlot() const { return m_lastPlayerJoinSlot; }
	UnicodeString lastPlayerJoinName() const { return m_lastPlayerJoinName; }
	int onGameOptionsCalls() const { return m_onGameOptionsCalls; }
	UnsignedInt lastGameOptionsPlayerIP() const { return m_lastGameOptionsPlayerIP; }
	Int lastGameOptionsPlayerSlot() const { return m_lastGameOptionsPlayerSlot; }
	AsciiString lastGameOptions() const { return m_lastGameOptions; }
	int onGameStartCalls() const { return m_onGameStartCalls; }
	int onGameCreateCalls() const { return m_onGameCreateCalls; }
	ReturnType lastGameCreateReturn() const { return m_lastGameCreateReturn; }

private:
	int m_onGameListCalls = 0;
	LANGameInfo *m_lastGameList = nullptr;
	int m_onGameJoinCalls = 0;
	ReturnType m_lastGameJoinReturn = RET_UNKNOWN;
	LANGameInfo *m_lastJoinedGame = nullptr;
	int m_onPlayerJoinCalls = 0;
	Int m_lastPlayerJoinSlot = -1;
	UnicodeString m_lastPlayerJoinName;
	int m_onGameOptionsCalls = 0;
	UnsignedInt m_lastGameOptionsPlayerIP = 0;
	Int m_lastGameOptionsPlayerSlot = -1;
	AsciiString m_lastGameOptions;
	int m_onGameStartCalls = 0;
	int m_onGameCreateCalls = 0;
	ReturnType m_lastGameCreateReturn = RET_UNKNOWN;
};

AsciiString build_lanapi_options_string()
{
	AsciiString options;
	options.format(
		"US=1;M=00%s;MC=%X;MS=%u;SD=%u;C=%u;SR=0;SC=%u;O=N;S=X:X:X:X:X:X:X:X:;",
		kLanApiPortableMap,
		kLanApiMapCrc,
		kLanApiMapSize,
		kLanApiSeed,
		kLanApiCrcInterval,
		kLanApiStartingCash);
	return options;
}

bool build_lanapi_announce_message(LANMessage &message, AsciiString &options)
{
	options = build_lanapi_options_string();
	if (options.getLength() <= 0 || options.getLength() > m_lanMaxOptionsLength) {
		return false;
	}

	std::memset(&message, 0, sizeof(message));
	message.LANMessageType = LANMessage::MSG_GAME_ANNOUNCE;
	copy_wide_string(message.name, g_lanPlayerNameLength + 1, kLanApiPlayerName);
	copy_ascii_string(message.userName, g_lanLoginNameLength + 1, kLanApiUserName);
	copy_ascii_string(message.hostName, g_lanHostNameLength + 1, kLanApiHostName);
	copy_wide_string(message.GameInfo.gameName, g_lanGameNameLength + 1, kLanApiGameName);
	message.GameInfo.inProgress = FALSE;
	copy_ascii_string(message.GameInfo.options, m_lanMaxOptionsLength + 1, options.str());
	message.GameInfo.isDirectConnect = FALSE;
	return true;
}

GlobalData *probe_global_data()
{
	static GlobalData global_data;
	static bool initialized = false;
	if (!initialized) {
		global_data.m_defaultStartingCash.init();
		global_data.m_networkFPSHistoryLength = 30;
		global_data.m_networkLatencyHistoryLength = 200;
		global_data.m_networkRunAheadMetricsTime = 500;
		global_data.m_networkCushionHistoryLength = 10;
		global_data.m_networkRunAheadSlack = 10;
		global_data.m_networkKeepAliveDelay = 20;
		global_data.m_networkDisconnectTime = 5000;
		global_data.m_networkPlayerTimeoutTime = 60000;
		global_data.m_networkDisconnectScreenNotifyTime = 15000;
		initialized = true;
	}
	return &global_data;
}

MapCache *probe_map_cache()
{
	static MapCache map_cache;
	return &map_cache;
}

ProbeGameText *probe_game_text()
{
	static ProbeGameText game_text;
	return &game_text;
}

MultiplayerSettings *probe_multiplayer_settings()
{
	static MultiplayerSettings settings;
	return &settings;
}

PlayerTemplateStore *probe_player_template_store()
{
	static PlayerTemplateStore player_template_store;
	return &player_template_store;
}

class ScopedLANProbeGlobals
{
public:
	explicit ScopedLANProbeGlobals(LANAPI *lan) :
		m_oldGameText(TheGameText),
		m_oldGameState(TheGameState),
		m_oldGlobalData(TheWritableGlobalData),
		m_oldMapCache(TheMapCache),
		m_oldMultiplayerSettings(TheMultiplayerSettings),
		m_oldPlayerTemplateStore(ThePlayerTemplateStore),
		m_oldLAN(TheLAN),
		m_oldButtonPushed(LANbuttonPushed)
	{
		GlobalData *global_data = probe_global_data();
		global_data->m_iniCRC = 0x13572468;
		global_data->m_exeCRC = 0x24681357;
		TheGameText = probe_game_text();
		TheGameState = TheGameState != nullptr ? TheGameState : reinterpret_cast<GameState *>(1);
		TheWritableGlobalData = global_data;
		TheMapCache = probe_map_cache();
		TheMultiplayerSettings = probe_multiplayer_settings();
		ThePlayerTemplateStore = probe_player_template_store();
		TheLAN = lan;
		LANbuttonPushed = false;
	}

	~ScopedLANProbeGlobals()
	{
		TheGameText = m_oldGameText;
		TheGameState = m_oldGameState;
		TheWritableGlobalData = m_oldGlobalData;
		TheMapCache = m_oldMapCache;
		TheMultiplayerSettings = m_oldMultiplayerSettings;
		ThePlayerTemplateStore = m_oldPlayerTemplateStore;
		TheLAN = m_oldLAN;
		LANbuttonPushed = m_oldButtonPushed;
	}

private:
	GameTextInterface *m_oldGameText;
	GameState *m_oldGameState;
	GlobalData *m_oldGlobalData;
	MapCache *m_oldMapCache;
	MultiplayerSettings *m_oldMultiplayerSettings;
	PlayerTemplateStore *m_oldPlayerTemplateStore;
	LANAPI *m_oldLAN;
	Bool m_oldButtonPushed;
};

class ScopedLANGameStartGlobals
{
public:
	ScopedLANGameStartGlobals() :
		m_oldGameLogic(TheGameLogic),
		m_oldMessageStream(TheMessageStream),
		m_oldCommandList(TheCommandList),
		m_oldNetwork(TheNetwork)
	{
		if (s_probeLogic == nullptr) {
			s_probeLogic = new GameLogic;
		}
		s_probeLogic->setGameMode(GAME_NONE);
		set_probe_logic_frame(s_probeLogic, 0);
		m_messageStream.init();
		m_commandList.init();
		TheGameLogic = s_probeLogic;
		TheMessageStream = &m_messageStream;
		TheCommandList = &m_commandList;
		TheNetwork = nullptr;
	}

	~ScopedLANGameStartGlobals()
	{
		if (TheNetwork != nullptr && TheNetwork != m_oldNetwork) {
			delete TheNetwork;
		}
		TheNetwork = m_oldNetwork;
		TheCommandList = m_oldCommandList;
		TheMessageStream = m_oldMessageStream;
		TheGameLogic = m_oldGameLogic;
	}

	MessageStream *messageStream()
	{
		return &m_messageStream;
	}

	CommandList *commandList()
	{
		return &m_commandList;
	}

	void setLogicFrame(UnsignedInt frame)
	{
		if (s_probeLogic != nullptr) {
			set_probe_logic_frame(s_probeLogic, frame);
		}
	}

private:
	GameLogic *m_oldGameLogic;
	MessageStream *m_oldMessageStream;
	CommandList *m_oldCommandList;
	NetworkInterface *m_oldNetwork;
	MessageStream m_messageStream;
	CommandList m_commandList;
	static GameLogic *s_probeLogic;
};

GameLogic *ScopedLANGameStartGlobals::s_probeLogic = nullptr;

void configure_probe_slot(LANGameSlot &slot, SlotState state, const WideChar *name, UnsignedInt ip)
{
	slot.setState(state, UnicodeString(name != nullptr ? name : L""), ip);
	slot.setPort(NETWORK_BASE_PORT_NUMBER);
	slot.setLastHeard(timeGetTime());
	slot.setLogin(state == SLOT_PLAYER && ip == kLanApiJoinerIp ? kLanApiJoinerUserName : kLanApiUserName);
	slot.setHost(state == SLOT_PLAYER && ip == kLanApiJoinerIp ? kLanApiJoinerHostName : kLanApiHostName);
	slot.setColor(-1);
	slot.setPlayerTemplate(PLAYERTEMPLATE_OBSERVER);
	slot.setStartPos(-1);
	slot.setTeamNumber(-1);
	slot.setNATBehavior(FirewallHelperClass::FIREWALL_TYPE_SIMPLE);
}

LANGameInfo *create_probe_lan_game(Bool in_game, Bool include_joiner = FALSE)
{
	LANGameInfo *game = NEW LANGameInfo;
	if (game == nullptr) {
		return nullptr;
	}

	if (in_game) {
		game->enterGame();
	}

	game->setName(UnicodeString(kLanApiGameName));
	game->setIsDirectConnect(FALSE);
	game->setMap(AsciiString(kLanApiParsedMap));
	game->setMapCRC(kLanApiMapCrc);
	game->setMapSize(kLanApiMapSize);
	game->setMapContentsMask(0);
	game->setSeed(static_cast<Int>(kLanApiSeed));
	game->setCRCInterval(static_cast<Int>(kLanApiCrcInterval));
	game->setUseStats(1);
	game->setSuperweaponRestriction(0);
	Money starting_cash;
	starting_cash.init();
	starting_cash.deposit(kLanApiStartingCash, FALSE);
	game->setStartingCash(starting_cash);
	game->setOldFactionsOnly(FALSE);
	game->setLastHeard(timeGetTime());

	LANGameSlot host_slot;
	configure_probe_slot(host_slot, SLOT_PLAYER, kLanApiPlayerName, kLanApiRemoteIp);
	host_slot.setAccept();
	host_slot.setMapAvailability(TRUE);
	game->setSlot(0, host_slot);

	LANGameSlot second_slot;
	if (include_joiner) {
		configure_probe_slot(second_slot, SLOT_PLAYER, kLanApiJoinerName, kLanApiJoinerIp);
		second_slot.setAccept();
		second_slot.setMapAvailability(TRUE);
	} else {
		configure_probe_slot(second_slot, SLOT_OPEN, nullptr, 0);
	}
	game->setSlot(1, second_slot);

	for (Int slot = 2; slot < MAX_SLOTS; ++slot) {
		LANGameSlot closed_slot;
		configure_probe_slot(closed_slot, SLOT_CLOSED, nullptr, 0);
		game->setSlot(slot, closed_slot);
	}

	return game;
}

struct LANGameStartState
{
	bool network_created = false;
	bool network_setup_ready = false;
	bool callback_side_effects_ready = false;
	bool game_in_progress = false;
	bool pending_file_ready = false;
	bool use_fps_limit_disabled = false;
	bool message_new_game = false;
	bool message_argument_ready = false;
	bool random_seed_ready = false;
	bool map_cache_ready = false;
	bool remote_name_ready = false;
	bool frame_data_ready = false;
	Int local_slot = -1;
	Int num_players = -1;
	UnsignedInt run_ahead = 0;
	UnsignedInt frame_rate = 0;
	UnsignedInt packet_arrival_cushion = 0;
	Int message_type = -1;
	Int message_argument_count = -1;
	Int message_argument_type = -1;
	Int message_argument = -1;
};

void collect_lan_game_start_state(
	LANGameInfo *game,
	Int expected_local_slot,
	Int expected_remote_slot,
	const WideChar *expected_remote_name,
	ScopedLANGameStartGlobals &globals,
	LANGameStartState &state)
{
	state.network_created = TheNetwork != nullptr;
	if (TheNetwork != nullptr) {
		state.local_slot = static_cast<Int>(TheNetwork->getLocalPlayerID());
		state.num_players = TheNetwork->getNumPlayers();
		state.run_ahead = TheNetwork->getRunAhead();
		state.frame_rate = TheNetwork->getFrameRate();
		state.packet_arrival_cushion = TheNetwork->getPacketArrivalCushion();
		state.frame_data_ready = TheNetwork->isFrameDataReady();
		UnicodeString remote_name = TheNetwork->getPlayerName(expected_remote_slot);
		state.remote_name_ready = remote_name.compare(UnicodeString(expected_remote_name)) == 0;
	}

	GameMessage *message = globals.messageStream()->getFirstMessage();
	if (message != nullptr) {
		state.message_type = static_cast<Int>(message->getType());
		state.message_argument_count = static_cast<Int>(message->getArgumentCount());
		state.message_new_game = message->getType() == GameMessage::MSG_NEW_GAME;
		if (message->getArgumentCount() == 1) {
			state.message_argument_type = static_cast<Int>(message->getArgumentDataType(0));
			const GameMessageArgumentType *argument = message->getArgument(0);
			if (argument != nullptr) {
				state.message_argument = argument->integer;
			}
		}
	}

	state.message_argument_ready =
		state.message_new_game &&
		state.message_argument_count == 1 &&
		state.message_argument_type == ARGUMENTDATATYPE_INTEGER &&
		state.message_argument == GAME_LAN;
	state.game_in_progress = game != nullptr && game->isGameInProgress();
	state.pending_file_ready = TheGlobalData != nullptr &&
		std::strcmp(TheGlobalData->m_pendingFile.str(), kLanApiParsedMap) == 0;
	state.use_fps_limit_disabled = TheGlobalData != nullptr && TheGlobalData->m_useFpsLimit == FALSE;
	state.random_seed_ready = GetGameLogicRandomSeed() == kLanApiSeed;
	state.map_cache_ready = TheMapCache != nullptr &&
		game != nullptr &&
		TheMapCache->findMap(game->getMap()) != nullptr;
	state.network_setup_ready =
		state.network_created &&
		state.local_slot == expected_local_slot &&
		state.num_players == 2 &&
		state.run_ahead == 30 &&
		state.frame_rate == 30 &&
		state.remote_name_ready;
	state.callback_side_effects_ready =
		state.game_in_progress &&
		state.pending_file_ready &&
		state.use_fps_limit_disabled &&
		state.message_argument_ready &&
		state.random_seed_ready &&
		state.map_cache_ready;
}

unsigned int count_probe_game_messages(GameMessage *first)
{
	unsigned int count = 0;
	for (GameMessage *message = first; message != nullptr; message = message->next()) {
		++count;
	}
	return count;
}

struct LANNetworkUpdateState
{
	bool command_list_reset_before = false;
	bool command_list_injected = false;
	bool update_driven = false;
	bool before_frame_data_ready = false;
	bool after_frame_data_ready = false;
	bool local_connected_before = false;
	bool local_connected_after = false;
	bool readiness_transition = false;
	bool in_game_promoted = false;
	Int logic_frame_before = -1;
	Int logic_frame_for_update = -1;
	Int command_list_count_before = -1;
	Int command_list_count_after = -1;
	Int tick_message_type = -1;
	Int local_slot = -1;
	Int num_players = -1;
	UnsignedInt run_ahead = 0;
	UnsignedInt frame_rate = 0;
	UnsignedInt packet_arrival_cushion_after = 0;
};

void drive_lan_network_update_frame_readiness(
	ScopedLANGameStartGlobals &globals,
	LANNetworkUpdateState &state,
	Int expected_local_slot,
	UnsignedInt logic_frame = 1,
	Bool reset_command_list_before = FALSE)
{
	state.logic_frame_before = TheGameLogic != nullptr ? TheGameLogic->getFrame() : -1;
	state.before_frame_data_ready = TheNetwork != nullptr && TheNetwork->isFrameDataReady();
	state.local_connected_before = TheNetwork != nullptr && TheNetwork->isPlayerConnected(expected_local_slot);
	if (TheNetwork != nullptr) {
		state.local_slot = static_cast<Int>(TheNetwork->getLocalPlayerID());
		state.num_players = TheNetwork->getNumPlayers();
		state.run_ahead = TheNetwork->getRunAhead();
		state.frame_rate = TheNetwork->getFrameRate();
	}

	if (reset_command_list_before && globals.commandList() != nullptr) {
		globals.commandList()->reset();
		state.command_list_reset_before = true;
	}

	globals.setLogicFrame(logic_frame);
	GameMessage *tick = newInstance(GameMessage)(GameMessage::MSG_FRAME_TICK);
	if (tick != nullptr) {
		globals.commandList()->appendMessage(tick);
		state.command_list_injected = true;
		state.tick_message_type = static_cast<Int>(tick->getType());
	}
	state.command_list_count_before =
		static_cast<Int>(count_probe_game_messages(globals.commandList()->getFirstMessage()));

	if (TheNetwork != nullptr) {
		TheNetwork->update();
		state.update_driven = true;
	}

	state.logic_frame_for_update = TheGameLogic != nullptr ? TheGameLogic->getFrame() : -1;
	state.command_list_count_after =
		static_cast<Int>(count_probe_game_messages(globals.commandList()->getFirstMessage()));
	state.after_frame_data_ready = TheNetwork != nullptr && TheNetwork->isFrameDataReady();
	state.local_connected_after = TheNetwork != nullptr && TheNetwork->isPlayerConnected(expected_local_slot);
	state.packet_arrival_cushion_after = TheNetwork != nullptr ? TheNetwork->getPacketArrivalCushion() : 0;
	state.readiness_transition = !state.before_frame_data_ready && state.after_frame_data_ready;
	state.in_game_promoted = !state.local_connected_before && state.local_connected_after;
}

struct FrameDataDesyncProbeState
{
	bool not_ready_ok = false;
	bool resend_ok = false;
	bool extra_command_inserted = false;
	Int not_ready_result = -1;
	Int resend_result = -1;
	UnsignedInt not_ready_frame = 0;
	UnsignedInt not_ready_command_count = 0;
	UnsignedInt not_ready_frame_command_count = 0;
	UnsignedInt resend_frame = 0;
	UnsignedInt resend_command_count_before = 0;
	UnsignedInt resend_frame_command_count_before = 0;
	UnsignedInt resend_command_count_after = 0;
	UnsignedInt resend_frame_command_count_after = 0;
	Int resend_command_type = NETCOMMANDTYPE_UNKNOWN;
};

FrameDataDesyncProbeState probe_original_frame_data_desync_states()
{
	FrameDataDesyncProbeState state;

	FrameData not_ready;
	not_ready.init();
	not_ready.setFrame(kNetworkDesyncNotReadyFrame);
	not_ready.setFrameCommandCount(1);
	state.not_ready_frame = not_ready.getFrame();
	state.not_ready_command_count = not_ready.getCommandCount();
	state.not_ready_frame_command_count = not_ready.getFrameCommandCount();
	state.not_ready_result = static_cast<Int>(not_ready.allCommandsReady(FALSE));
	state.not_ready_ok =
		state.not_ready_frame == kNetworkDesyncNotReadyFrame &&
		state.not_ready_command_count == 0 &&
		state.not_ready_frame_command_count == 1 &&
		state.not_ready_result == FRAMEDATA_NOTREADY;
	not_ready.destroyGameMessages();

	FrameData resend;
	resend.init();
	resend.setFrame(kNetworkDesyncResendFrame);
	resend.setFrameCommandCount(0);
	NetRunAheadCommandMsg *extra = newInstance(NetRunAheadCommandMsg);
	if (extra != nullptr) {
		extra->setExecutionFrame(kNetworkDesyncResendFrame);
		extra->setPlayerID(kTransportPlayerId);
		extra->setID(kTransportRunAheadCommandId);
		extra->setRunAhead(kTransportRunAhead);
		extra->setFrameRate(kTransportFrameRate);
		resend.addCommand(extra);
		extra->detach();
		state.extra_command_inserted = true;
		state.resend_command_type = NETCOMMANDTYPE_RUNAHEAD;
	}
	state.resend_frame = resend.getFrame();
	state.resend_command_count_before = resend.getCommandCount();
	state.resend_frame_command_count_before = resend.getFrameCommandCount();
	state.resend_result = static_cast<Int>(resend.allCommandsReady(FALSE));
	state.resend_command_count_after = resend.getCommandCount();
	state.resend_frame_command_count_after = resend.getFrameCommandCount();
	state.resend_ok =
		state.resend_frame == kNetworkDesyncResendFrame &&
		state.extra_command_inserted &&
		state.resend_command_count_before == 1 &&
		state.resend_frame_command_count_before == 0 &&
		state.resend_result == FRAMEDATA_RESEND &&
		state.resend_command_count_after == 0;
	resend.destroyGameMessages();

	return state;
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
		result.min_run_ahead == 4 &&
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

bool probe_lan_host_dispatch()
{
	ProbeLANAPI lan;
	ScopedLANProbeGlobals globals(&lan);
	lan.setLocalAddress(kLanApiLocalIp);

	LANGameInfo game;
	game.enterGame();
	lan.setLocalAddress(kLanApiRemoteIp);
	LANGameSlot host_slot;
	host_slot.setState(SLOT_PLAYER, UnicodeString(L"Host"), kLanApiRemoteIp);
	game.setSlot(0, host_slot);

	const GameInfo *game_info = &game;
	return game.amIHost() && game_info->amIHost();
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

EMSCRIPTEN_KEEPALIVE const char *cnc_port_build_browser_network_transport_wire_packet()
{
	if (!isMemoryManagerOfficiallyInited()) {
		initMemoryManager();
	}

	cnc_port_browser_udp_adapter_clear();

	NetPacket *packet = build_transport_connection_packet();
	if (packet == nullptr) {
		std::snprintf(g_browser_network_transport_wire_build_json, sizeof(g_browser_network_transport_wire_build_json),
			"{\"ok\":false,\"source\":\"GameNetwork browser production Transport UDP adapter send probe\","
			"\"transportReady\":false,\"productionTransport\":true,\"productionTransportWire\":false,"
			"\"nextRequired\":\"buildOriginalNetPacketBeforeTransportQueue\"}");
		return g_browser_network_transport_wire_build_json;
	}

	const int packet_length = packet->getLength();
	const int commands = packet->getNumCommands();

	Transport transport;
	const bool initialized = transport.init(kLanApiLocalIp, NETWORK_BASE_PORT_NUMBER);
	bool queued = false;
	bool sent = false;
	int queued_slot = -1;
	if (initialized) {
		queued = transport.queueSend(
			kTransportWireRemoteIp,
			kTransportWireRemotePort,
			packet->getData(),
			packet_length);
		for (Int i = 0; i < MAX_MESSAGES; ++i) {
			if (transport.m_outBuffer[i].length > 0) {
				queued_slot = i;
				break;
			}
		}
		sent = queued && transport.doSend();
	}
	packet->deleteInstance();
	packet = nullptr;

	UnsignedByte wire_bytes[MAX_MESSAGE_LEN + sizeof(TransportMessageHeader)] = {};
	UnsignedInt adapter_addr = 0;
	UnsignedShort adapter_port = 0;
	const int adapter_writes = cnc_port_browser_udp_adapter_write_count();
	const int outgoing_before_pop = cnc_port_browser_udp_adapter_outgoing_count();
	const int wire_length = cnc_port_browser_udp_adapter_pop_outgoing(
		wire_bytes,
		static_cast<Int>(sizeof(wire_bytes)),
		&adapter_addr,
		&adapter_port);
	const int outgoing_after_pop = cnc_port_browser_udp_adapter_outgoing_count();
	const int adapter_dropped = cnc_port_browser_udp_adapter_dropped_count();
	TransportMessage decoded = {};
	bool wire_encoded = false;
	bool payload_encoded = false;
	bool crc_valid = false;
	bool encrypted = false;
	if (wire_length > static_cast<int>(sizeof(TransportMessageHeader))) {
		wire_encoded = encode_hex(
			wire_bytes,
			wire_length,
			g_browser_network_transport_wire_hex,
			sizeof(g_browser_network_transport_wire_hex));
		std::memcpy(&decoded, wire_bytes, static_cast<size_t>(wire_length));
		decoded.length = wire_length - static_cast<int>(sizeof(TransportMessageHeader));
		decoded.addr = adapter_addr;
		decoded.port = adapter_port;
		decrypt_transport_message_copy(decoded);
		crc_valid = transport_message_has_valid_crc(decoded);
		payload_encoded = encode_hex(
			decoded.data,
			decoded.length,
			g_browser_network_transport_wire_payload_hex,
			sizeof(g_browser_network_transport_wire_payload_hex));
		encrypted = wire_length >= static_cast<int>(sizeof(UnsignedInt)) &&
			std::memcmp(wire_bytes, &(decoded.header.crc), sizeof(UnsignedInt)) != 0;
	}

	const bool ok = initialized &&
		queued &&
		sent &&
		queued_slot == 0 &&
		adapter_writes == 1 &&
		outgoing_before_pop == 1 &&
		outgoing_after_pop == 0 &&
		adapter_dropped == 0 &&
		wire_encoded &&
		payload_encoded &&
		crc_valid &&
		encrypted &&
		commands == 2 &&
		decoded.length == packet_length &&
		wire_length == packet_length + static_cast<int>(sizeof(TransportMessageHeader)) &&
		decoded.addr == kTransportWireRemoteIp &&
		decoded.port == kTransportWireRemotePort;

	std::snprintf(g_browser_network_transport_wire_build_json, sizeof(g_browser_network_transport_wire_build_json),
		"{\"ok\":%s,"
		"\"source\":\"GameNetwork browser production Transport UDP adapter send probe\","
		"\"transportReady\":%s,"
		"\"browserTransport\":\"browser WebSocket binary relay\","
		"\"productionTransport\":true,"
		"\"productionTransportWire\":true,"
		"\"originalSerializer\":\"Transport::queueSend\","
		"\"originalWireSend\":\"Transport::doSend -> browser UDP adapter Write\","
		"\"nextRequired\":\"browserWebSocketRelayIntoTransportDoRecv\","
		"\"packet\":{\"hex\":\"%s\",\"bytes\":%d,\"commands\":%d,"
		"\"commandType\":\"NETCOMMANDTYPE_FRAMEINFO+NETCOMMANDTYPE_RUNAHEAD\","
		"\"relay\":%d,\"executionFrame\":%d,\"playerId\":%d,"
		"\"commandId\":%d,\"frameCommandCount\":%d,"
		"\"runAheadCommandId\":%d,\"runAhead\":%d,\"frameRate\":%d},"
		"\"transport\":{\"initialized\":%s,\"queued\":%s,\"doSendDriven\":%s,"
		"\"adapterWrites\":%d,\"outgoingBeforePop\":%d,\"outgoingAfterPop\":%d,"
		"\"adapterDropped\":%d},"
		"\"wire\":{\"hex\":\"%s\",\"bytes\":%d,\"headerBytes\":%zu,"
		"\"queuedSlot\":%d,\"encrypted\":%s,\"crcValidAfterDecrypt\":%s,"
		"\"magic\":\"0x%04x\",\"addr\":%u,\"port\":%u}}",
		ok ? "true" : "false",
		ok ? "true" : "false",
		payload_encoded ? g_browser_network_transport_wire_payload_hex : "",
		decoded.length,
		commands,
		kTransportRelayMask,
		kTransportExecutionFrame,
		kTransportPlayerId,
		kTransportFrameInfoCommandId,
		kTransportFrameCommandCount,
		kTransportRunAheadCommandId,
		kTransportRunAhead,
		kTransportFrameRate,
		initialized ? "true" : "false",
		queued ? "true" : "false",
		sent ? "true" : "false",
		adapter_writes,
		outgoing_before_pop,
		outgoing_after_pop,
		adapter_dropped,
		wire_encoded ? g_browser_network_transport_wire_hex : "",
		wire_length,
		sizeof(TransportMessageHeader),
		queued_slot,
		encrypted ? "true" : "false",
		crc_valid ? "true" : "false",
		static_cast<unsigned int>(decoded.header.magic),
		adapter_addr,
		adapter_port);
	return g_browser_network_transport_wire_build_json;
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_browser_network_transport_live_send(UnsignedInt remote_ip)
{
	if (!isMemoryManagerOfficiallyInited()) {
		initMemoryManager();
	}

	cnc_port_browser_udp_adapter_clear();

	NetPacket *packet = build_transport_connection_packet();
	if (packet == nullptr) {
		std::snprintf(g_browser_network_transport_live_send_json, sizeof(g_browser_network_transport_live_send_json),
			"{\"ok\":false,\"source\":\"GameNetwork browser live WebSocket Transport send probe\","
			"\"transportReady\":false,\"productionTransport\":true,"
			"\"nextRequired\":\"buildOriginalNetPacketBeforeTransportQueue\"}");
		return g_browser_network_transport_live_send_json;
	}

	const int packet_length = packet->getLength();
	const int commands = packet->getNumCommands();
	if (remote_ip == 0) {
		remote_ip = kTransportWireRemoteIp;
	}
	const bool payload_encoded = encode_hex(
		packet->getData(),
		packet_length,
		g_browser_network_transport_wire_payload_hex,
		sizeof(g_browser_network_transport_wire_payload_hex));

	Transport transport;
	const bool initialized = transport.init(kLanApiLocalIp, NETWORK_BASE_PORT_NUMBER);
	bool queued = false;
	bool sent = false;
	bool out_buffer_cleared = false;
	int queued_slot = -1;
	if (initialized) {
		queued = transport.queueSend(
			remote_ip,
			kTransportWireRemotePort,
			packet->getData(),
			packet_length);
		for (Int i = 0; i < MAX_MESSAGES; ++i) {
			if (transport.m_outBuffer[i].length > 0) {
				queued_slot = i;
				break;
			}
		}
		sent = queued && transport.doSend();
		out_buffer_cleared = true;
		for (Int i = 0; i < MAX_MESSAGES; ++i) {
			if (transport.m_outBuffer[i].length != 0) {
				out_buffer_cleared = false;
				break;
			}
		}
	}
	packet->deleteInstance();
	packet = nullptr;

	const int adapter_writes = cnc_port_browser_udp_adapter_write_count();
	const int fallback_outgoing = cnc_port_browser_udp_adapter_outgoing_count();
	const int adapter_dropped = cnc_port_browser_udp_adapter_dropped_count();
	const bool ok = initialized &&
		queued &&
		sent &&
		out_buffer_cleared &&
		queued_slot == 0 &&
		adapter_writes == 1 &&
		fallback_outgoing == 0 &&
		adapter_dropped == 0 &&
		payload_encoded &&
		commands == 2 &&
		packet_length > 0 &&
		packet_length <= MAX_PACKET_SIZE;

	std::snprintf(g_browser_network_transport_live_send_json, sizeof(g_browser_network_transport_live_send_json),
		"{\"ok\":%s,"
		"\"source\":\"GameNetwork browser live WebSocket Transport send probe\","
		"\"transportReady\":%s,"
		"\"browserTransport\":\"browser WebSocket live UDP endpoint\","
		"\"productionTransport\":true,"
		"\"productionTransportWire\":true,"
		"\"originalSerializer\":\"Transport::queueSend\","
		"\"originalWireSend\":\"Transport::doSend -> Module.cncPortBrowserUdpSend\","
		"\"nextRequired\":\"browserWebSocketLiveEndpointIntoTransportDoRecv\","
		"\"packet\":{\"hex\":\"%s\",\"bytes\":%d,\"commands\":%d,"
		"\"commandType\":\"NETCOMMANDTYPE_FRAMEINFO+NETCOMMANDTYPE_RUNAHEAD\","
		"\"relay\":%d,\"executionFrame\":%d,\"playerId\":%d,"
		"\"commandId\":%d,\"frameCommandCount\":%d,"
		"\"runAheadCommandId\":%d,\"runAhead\":%d,\"frameRate\":%d},"
		"\"transport\":{\"initialized\":%s,\"queued\":%s,\"doSendDriven\":%s,"
		"\"queuedSlot\":%d,\"outBufferCleared\":%s,"
		"\"adapterWrites\":%d,\"fallbackOutgoing\":%d,\"adapterDropped\":%d,"
		"\"addr\":%u,\"port\":%u}}",
		ok ? "true" : "false",
		ok ? "true" : "false",
		payload_encoded ? g_browser_network_transport_wire_payload_hex : "",
		packet_length,
		commands,
		kTransportRelayMask,
		kTransportExecutionFrame,
		kTransportPlayerId,
		kTransportFrameInfoCommandId,
		kTransportFrameCommandCount,
		kTransportRunAheadCommandId,
		kTransportRunAhead,
		kTransportFrameRate,
		initialized ? "true" : "false",
		queued ? "true" : "false",
		sent ? "true" : "false",
		queued_slot,
		out_buffer_cleared ? "true" : "false",
		adapter_writes,
		fallback_outgoing,
		adapter_dropped,
		remote_ip,
		kTransportWireRemotePort);
	return g_browser_network_transport_live_send_json;
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_accept_browser_network_transport_wire_packet(const char *wire_hex)
{
	if (!isMemoryManagerOfficiallyInited()) {
		initMemoryManager();
	}

	cnc_port_browser_udp_adapter_clear();

	UnsignedByte wire_bytes[MAX_MESSAGE_LEN + sizeof(TransportMessageHeader)] = {};
	int length = 0;
	const int input_hex_length = wire_hex != nullptr ? static_cast<int>(std::strlen(wire_hex)) : -1;
	const int invalid_hex_index = first_invalid_hex_index(wire_hex);
	const bool decoded_hex = decode_hex_with_capacity(
		wire_hex,
		wire_bytes,
		static_cast<int>(sizeof(wire_bytes)),
		length);

	TransportMessage message = {};
	Transport *transport = nullptr;
	Int push_result = 0;
	int incoming_before_recv = 0;
	int incoming_after_recv = 0;
	int adapter_reads = 0;
	int adapter_dropped = 0;
	int buffered_slot = -1;
	bool transport_initialized = false;
	bool recv_driven = false;
	bool transport_buffered = false;
	bool transport_cleared = false;
	bool decrypted = false;
	bool crc_valid = false;
	bool payload_encoded = false;
	bool relay_driven = false;
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

	if (decoded_hex && length > static_cast<int>(sizeof(TransportMessageHeader))) {
		push_result = cnc_port_browser_udp_adapter_push_incoming(
			wire_bytes,
			length,
			kLanApiLocalIp,
			NETWORK_BASE_PORT_NUMBER);
		incoming_before_recv = cnc_port_browser_udp_adapter_incoming_count();
		transport = new Transport;
		transport_initialized = transport->init(kTransportWireRemoteIp, kTransportWireRemotePort);
		recv_driven = transport_initialized && push_result == length && transport->doRecv();
		incoming_after_recv = cnc_port_browser_udp_adapter_incoming_count();
		adapter_reads = cnc_port_browser_udp_adapter_read_count();
		adapter_dropped = cnc_port_browser_udp_adapter_dropped_count();

		for (Int i = 0; i < MAX_MESSAGES; ++i) {
			if (transport->m_inBuffer[i].length > 0) {
				message = transport->m_inBuffer[i];
				buffered_slot = i;
				transport_buffered = true;
				break;
			}
		}
		if (transport_buffered) {
			decrypted = true;
			crc_valid = transport_message_has_valid_crc(message);
			payload_encoded = encode_hex(
				message.data,
				message.length,
				g_browser_network_transport_wire_payload_hex,
				sizeof(g_browser_network_transport_wire_payload_hex));
		}
	}

	if (transport_buffered && crc_valid && payload_encoded && transport != nullptr) {
		static GameLogic *probe_logic = nullptr;
		alignas(GlobalData) static UnsignedByte probe_global_data_storage[sizeof(GlobalData)] = {};
		GameLogic *old_game_logic = TheGameLogic;
		GlobalData *old_global_data = TheWritableGlobalData;
		if (probe_logic == nullptr) {
			probe_logic = new GameLogic;
		}
		TheGameLogic = probe_logic;
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
			manager->m_localAddr = kTransportWireRemoteIp;
			manager->m_localPort = kTransportWireRemotePort;
			manager->m_minFpsPlayer = -1;
			manager->m_minFps = -1;
			manager->m_smallestPacketArrivalCushion = static_cast<UnsignedInt>(-1);
			manager->m_didSelfSlug = FALSE;
			manager->m_frameMetrics.init();
			manager->m_transport = transport;

			manager->m_pendingCommands = newInstance(NetCommandList);
			manager->m_pendingCommands->init();
			manager->m_relayedCommands = newInstance(NetCommandList);
			manager->m_relayedCommands->init();
			manager->m_netCommandWrapperList = newInstance(NetCommandWrapperList);
			manager->m_netCommandWrapperList->init();

			FrameDataManager *frame_data = newInstance(FrameDataManager)(FALSE);
			frame_data->init();
			manager->m_frameData[kTransportPlayerId] = frame_data;

			manager->doRelay();
			relay_driven = true;
			transport_cleared = true;
			for (Int i = 0; i < MAX_MESSAGES; ++i) {
				if (transport->m_inBuffer[i].length != 0) {
					transport_cleared = false;
					break;
				}
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
	const bool ok = decoded_hex &&
		push_result == length &&
		incoming_before_recv == 1 &&
		incoming_after_recv == 0 &&
		adapter_reads == 1 &&
		adapter_dropped == 0 &&
		transport_initialized &&
		recv_driven &&
		transport_buffered &&
		transport_cleared &&
		decrypted &&
		crc_valid &&
		payload_encoded &&
		message.length > 0 &&
		message.length <= MAX_PACKET_SIZE &&
		relay_driven &&
		frame_data_ready &&
		stored_command_ok;

	std::snprintf(g_browser_network_transport_wire_receive_json, sizeof(g_browser_network_transport_wire_receive_json),
		"{\"ok\":%s,"
		"\"source\":\"GameNetwork browser production Transport UDP adapter receive probe\","
		"\"transportReady\":%s,"
		"\"browserTransport\":\"browser WebSocket binary relay\","
		"\"productionTransport\":true,"
		"\"productionTransportWire\":true,"
		"\"originalWireReceive\":\"browser UDP adapter Read -> Transport::doRecv decryptBuf/isGeneralsPacket\","
		"\"originalTransport\":\"Transport::m_inBuffer\","
		"\"originalRelay\":\"ConnectionManager::doRelay\","
		"\"originalFrameData\":\"NetPacket::getCommandList -> FrameDataManager::addNetCommandMsg/allCommandsReady\","
		"\"nextRequired\":\"twoBrowserClientsShareProductionTransportAdapter\","
		"\"wire\":{\"decoded\":%s,\"inputHexLength\":%d,\"invalidHexIndex\":%d,"
		"\"bytes\":%d,\"headerBytes\":%zu,\"pushResult\":%d,"
		"\"incomingBeforeRecv\":%d,\"incomingAfterRecv\":%d,"
		"\"adapterReads\":%d,\"adapterDropped\":%d,"
		"\"doRecvDriven\":%s,\"decrypted\":%s,"
		"\"crcValid\":%s,\"magic\":\"0x%04x\"},"
		"\"packet\":{\"hex\":\"%s\",\"bytes\":%d,\"decoded\":%s,"
		"\"commands\":2,\"commandType\":\"NETCOMMANDTYPE_FRAMEINFO+NETCOMMANDTYPE_RUNAHEAD\","
		"\"relay\":%d,\"executionFrame\":%d,\"playerId\":%d,"
		"\"commandId\":%d,\"frameCommandCount\":%d,"
		"\"runAheadCommandId\":%d,\"runAhead\":%d,\"frameRate\":%d},"
		"\"transport\":{\"initialized\":%s,\"buffered\":%s,\"bufferedSlot\":%d,"
		"\"cleared\":%s,\"addr\":%u,\"port\":%u},"
		"\"connectionManager\":{\"doRelayDriven\":%s,\"smallestPacketArrivalCushion\":%u},"
		"\"frameData\":{\"ready\":%s,\"managerReady\":%s,\"readyState\":%d,"
		"\"frameCommandCount\":%d,\"commandCount\":%d,"
		"\"storedCommandType\":\"%s\",\"storedCommandId\":%d,"
		"\"storedExecutionFrame\":%d,\"storedPlayerId\":%d,"
		"\"storedRunAhead\":%d,\"storedFrameRate\":%d}}",
		ok ? "true" : "false",
		ok ? "true" : "false",
		decoded_hex ? "true" : "false",
		input_hex_length,
		invalid_hex_index,
		length,
		sizeof(TransportMessageHeader),
		push_result,
		incoming_before_recv,
		incoming_after_recv,
		adapter_reads,
		adapter_dropped,
		recv_driven ? "true" : "false",
		decrypted ? "true" : "false",
		crc_valid ? "true" : "false",
		static_cast<unsigned int>(message.header.magic),
		payload_encoded ? g_browser_network_transport_wire_payload_hex : "",
		message.length,
		payload_encoded ? "true" : "false",
		kTransportRelayMask,
		kTransportExecutionFrame,
		kTransportPlayerId,
		kTransportFrameInfoCommandId,
		kTransportFrameCommandCount,
		kTransportRunAheadCommandId,
		kTransportRunAhead,
		kTransportFrameRate,
		transport_initialized ? "true" : "false",
		transport_buffered ? "true" : "false",
		buffered_slot,
		transport_cleared ? "true" : "false",
		message.addr,
		message.port,
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
	return g_browser_network_transport_wire_receive_json;
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_browser_network_transport_live_receive()
{
	if (!isMemoryManagerOfficiallyInited()) {
		initMemoryManager();
	}

	TransportMessage message = {};
	Transport *transport = new Transport;
	const bool transport_initialized = transport->init(kTransportWireRemoteIp, kTransportWireRemotePort);
	const bool recv_driven = transport_initialized && transport->doRecv();
	const int adapter_reads = cnc_port_browser_udp_adapter_read_count();
	const int fallback_incoming = cnc_port_browser_udp_adapter_incoming_count();
	const int adapter_dropped = cnc_port_browser_udp_adapter_dropped_count();
	int buffered_slot = -1;
	bool transport_buffered = false;
	bool transport_cleared = false;
	bool crc_valid = false;
	bool payload_encoded = false;
	bool relay_driven = false;
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

	if (recv_driven) {
		for (Int i = 0; i < MAX_MESSAGES; ++i) {
			if (transport->m_inBuffer[i].length > 0) {
				message = transport->m_inBuffer[i];
				buffered_slot = i;
				transport_buffered = true;
				break;
			}
		}
		if (transport_buffered) {
			crc_valid = transport_message_has_valid_crc(message);
			payload_encoded = encode_hex(
				message.data,
				message.length,
				g_browser_network_transport_wire_payload_hex,
				sizeof(g_browser_network_transport_wire_payload_hex));
		}
	}

	if (transport_buffered && crc_valid && payload_encoded) {
		static GameLogic *probe_logic = nullptr;
		alignas(GlobalData) static UnsignedByte probe_global_data_storage[sizeof(GlobalData)] = {};
		GameLogic *old_game_logic = TheGameLogic;
		GlobalData *old_global_data = TheWritableGlobalData;
		if (probe_logic == nullptr) {
			probe_logic = new GameLogic;
		}
		TheGameLogic = probe_logic;
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
			manager->m_localAddr = kTransportWireRemoteIp;
			manager->m_localPort = kTransportWireRemotePort;
			manager->m_minFpsPlayer = -1;
			manager->m_minFps = -1;
			manager->m_smallestPacketArrivalCushion = static_cast<UnsignedInt>(-1);
			manager->m_didSelfSlug = FALSE;
			manager->m_frameMetrics.init();
			manager->m_transport = transport;

			manager->m_pendingCommands = newInstance(NetCommandList);
			manager->m_pendingCommands->init();
			manager->m_relayedCommands = newInstance(NetCommandList);
			manager->m_relayedCommands->init();
			manager->m_netCommandWrapperList = newInstance(NetCommandWrapperList);
			manager->m_netCommandWrapperList->init();

			FrameDataManager *frame_data = newInstance(FrameDataManager)(FALSE);
			frame_data->init();
			manager->m_frameData[kTransportPlayerId] = frame_data;

			manager->doRelay();
			relay_driven = true;
			transport_cleared = true;
			for (Int i = 0; i < MAX_MESSAGES; ++i) {
				if (transport->m_inBuffer[i].length != 0) {
					transport_cleared = false;
					break;
				}
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
	const bool ok = transport_initialized &&
		recv_driven &&
		transport_buffered &&
		transport_cleared &&
		adapter_reads == 1 &&
		fallback_incoming == 0 &&
		adapter_dropped == 0 &&
		crc_valid &&
		payload_encoded &&
		message.length > 0 &&
		message.length <= MAX_PACKET_SIZE &&
		relay_driven &&
		frame_data_ready &&
		stored_command_ok;

	std::snprintf(g_browser_network_transport_live_receive_json, sizeof(g_browser_network_transport_live_receive_json),
		"{\"ok\":%s,"
		"\"source\":\"GameNetwork browser live WebSocket Transport receive probe\","
		"\"transportReady\":%s,"
		"\"browserTransport\":\"browser WebSocket live UDP endpoint\","
		"\"productionTransport\":true,"
		"\"productionTransportWire\":true,"
		"\"originalWireReceive\":\"Module.cncPortBrowserUdpRecv -> Transport::doRecv decryptBuf/isGeneralsPacket\","
		"\"originalTransport\":\"Transport::m_inBuffer\","
		"\"originalRelay\":\"ConnectionManager::doRelay\","
		"\"originalFrameData\":\"NetPacket::getCommandList -> FrameDataManager::addNetCommandMsg/allCommandsReady\","
		"\"nextRequired\":\"twoBrowserClientsShareProductionTransportAdapterForNetworkUpdate\","
		"\"packet\":{\"hex\":\"%s\",\"bytes\":%d,\"decoded\":%s,"
		"\"commands\":2,\"commandType\":\"NETCOMMANDTYPE_FRAMEINFO+NETCOMMANDTYPE_RUNAHEAD\","
		"\"relay\":%d,\"executionFrame\":%d,\"playerId\":%d,"
		"\"commandId\":%d,\"frameCommandCount\":%d,"
		"\"runAheadCommandId\":%d,\"runAhead\":%d,\"frameRate\":%d},"
		"\"transport\":{\"initialized\":%s,\"doRecvDriven\":%s,"
		"\"buffered\":%s,\"bufferedSlot\":%d,\"cleared\":%s,"
		"\"adapterReads\":%d,\"fallbackIncoming\":%d,\"adapterDropped\":%d,"
		"\"crcValid\":%s,\"addr\":%u,\"port\":%u},"
		"\"connectionManager\":{\"doRelayDriven\":%s,\"smallestPacketArrivalCushion\":%u},"
		"\"frameData\":{\"ready\":%s,\"managerReady\":%s,\"readyState\":%d,"
		"\"frameCommandCount\":%d,\"commandCount\":%d,"
		"\"storedCommandType\":\"%s\",\"storedCommandId\":%d,"
		"\"storedExecutionFrame\":%d,\"storedPlayerId\":%d,"
		"\"storedRunAhead\":%d,\"storedFrameRate\":%d}}",
		ok ? "true" : "false",
		ok ? "true" : "false",
		payload_encoded ? g_browser_network_transport_wire_payload_hex : "",
		message.length,
		payload_encoded ? "true" : "false",
		kTransportRelayMask,
		kTransportExecutionFrame,
		kTransportPlayerId,
		kTransportFrameInfoCommandId,
		kTransportFrameCommandCount,
		kTransportRunAheadCommandId,
		kTransportRunAhead,
		kTransportFrameRate,
		transport_initialized ? "true" : "false",
		recv_driven ? "true" : "false",
		transport_buffered ? "true" : "false",
		buffered_slot,
		transport_cleared ? "true" : "false",
		adapter_reads,
		fallback_incoming,
		adapter_dropped,
		crc_valid ? "true" : "false",
		message.addr,
		message.port,
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
	return g_browser_network_transport_live_receive_json;
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_build_browser_lanapi_announce_packet()
{
	if (!isMemoryManagerOfficiallyInited()) {
		initMemoryManager();
	}

	LANMessage message;
	AsciiString options;
	const bool built = build_lanapi_announce_message(message, options);
	const bool encoded = built && encode_hex(reinterpret_cast<const UnsignedByte *>(&message), sizeof(message),
		g_browser_lanapi_packet_hex, sizeof(g_browser_lanapi_packet_hex));
	const bool ok = built && encoded;

	std::snprintf(g_browser_lanapi_build_json, sizeof(g_browser_lanapi_build_json),
		"{\"ok\":%s,"
		"\"source\":\"GameNetwork browser LANAPI announce build probe\","
		"\"lanApiReady\":%s,"
		"\"browserTransport\":\"harness relay queue\","
		"\"originalMessage\":\"LANMessage::MSG_GAME_ANNOUNCE\","
		"\"originalSerializer\":\"LANMessage struct byte payload\","
		"\"nextRequired\":\"lanApiJoinOrProductionTransport\","
		"\"packet\":{\"hex\":\"%s\",\"bytes\":%zu,\"messageType\":\"MSG_GAME_ANNOUNCE\","
		"\"remoteIp\":%u,\"localIp\":%u,\"port\":%u,"
		"\"gameName\":\"Browser LAN Game\",\"playerName\":\"Browser Host\","
		"\"optionsLength\":%d,\"options\":\"%s\","
		"\"map\":\"%s\",\"parsedMap\":\"%s\",\"seed\":%u,\"mapCRC\":%u,"
		"\"mapSize\":%u,\"crcInterval\":%u,\"startingCash\":%u,"
		"\"slotList\":\"X:X:X:X:X:X:X:X\"}}",
		ok ? "true" : "false",
		ok ? "true" : "false",
		encoded ? g_browser_lanapi_packet_hex : "",
		sizeof(message),
		kLanApiRemoteIp,
		kLanApiLocalIp,
		kLanApiLobbyPort,
		options.getLength(),
		options.str(),
		kLanApiPortableMap,
		kLanApiParsedMapJson,
		kLanApiSeed,
		kLanApiMapCrc,
		kLanApiMapSize,
		kLanApiCrcInterval,
		kLanApiStartingCash);
	return g_browser_lanapi_build_json;
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_accept_browser_lanapi_announce_packet(const char *packet_hex)
{
	if (!isMemoryManagerOfficiallyInited()) {
		initMemoryManager();
	}

	UnsignedByte packet_bytes[sizeof(LANMessage)] = {};
	int length = 0;
	const int input_hex_length = packet_hex != nullptr ? static_cast<int>(std::strlen(packet_hex)) : -1;
	const int invalid_hex_index = first_invalid_hex_index(packet_hex);
	const bool decoded = decode_hex_with_capacity(packet_hex, packet_bytes, sizeof(packet_bytes), length);

	GameTextInterface *old_game_text = TheGameText;
	GameState *old_game_state = TheGameState;
	GlobalData *old_global_data = TheWritableGlobalData;
	MapCache *old_map_cache = TheMapCache;
	LANAPI *old_lan = TheLAN;

	bool transport_injected = false;
	bool transport_cleared = false;
	bool update_driven = false;
	bool callback_recorded = false;
	bool game_recorded = false;
	bool map_ok = false;
	bool slots_closed = false;
	bool globals_ready = false;
	bool game_text_ready = false;
	bool game_state_ready = false;
	bool global_data_ready = false;
	bool map_cache_ready = false;
	int games_seen = 0;
	int on_game_list_calls = 0;
	int parsed_slots_closed = 0;
	int parsed_seed = -1;
	int parsed_map_crc = -1;
	int parsed_map_size = -1;
	int parsed_crc_interval = -1;
	int parsed_starting_cash = -1;
	int message_type = -1;
	const char *parsed_map = "";
	char parsed_map_json[256] = {};

	if (decoded && length == static_cast<int>(sizeof(LANMessage))) {
		ScopedOriginalMemoryManager memory_manager_scope;
		TheGameText = probe_game_text();
		TheGameState = TheGameState != nullptr ? TheGameState : reinterpret_cast<GameState *>(1);
		TheWritableGlobalData = probe_global_data();
		TheMapCache = probe_map_cache();
		game_text_ready = TheGameText != nullptr;
		game_state_ready = TheGameState != nullptr;
		global_data_ready = TheGlobalData != nullptr;
		map_cache_ready = TheMapCache != nullptr;
		globals_ready = game_text_ready && game_state_ready && global_data_ready && map_cache_ready;

		ProbeLANAPI lan;
		TheLAN = &lan;
		lan.setLocalAddress(kLanApiLocalIp);
		Transport *transport = lan.transportForProbe();
		if (transport != nullptr) {
			std::memset(transport->m_inBuffer, 0, sizeof(transport->m_inBuffer));
			TransportMessage &message = transport->m_inBuffer[0];
			std::memcpy(message.data, packet_bytes, static_cast<size_t>(length));
			message.length = length;
			message.addr = kLanApiRemoteIp;
			message.port = kLanApiLobbyPort;
			transport_injected = message.length == static_cast<int>(sizeof(LANMessage)) &&
				message.addr == kLanApiRemoteIp &&
				message.port == kLanApiLobbyPort;
			LANMessage *decoded_message = reinterpret_cast<LANMessage *>(message.data);
			message_type = decoded_message->LANMessageType;
		}

		lan.forceUpdateDelayElapsed();
		lan.update();
		update_driven = true;
		transport_cleared = transport != nullptr && transport->m_inBuffer[0].length == 0;
		callback_recorded = lan.onGameListCalls() > 0 && lan.lastGameList() != nullptr;
		on_game_list_calls = lan.onGameListCalls();
		games_seen = lan.gameCount();

		LANGameInfo *game = lan.firstGame();
		if (game != nullptr) {
			parsed_map = game->getMap().str();
			copy_json_path(parsed_map_json, sizeof(parsed_map_json), parsed_map);
			parsed_seed = game->getSeed();
			parsed_map_crc = static_cast<int>(game->getMapCRC());
			parsed_map_size = static_cast<int>(game->getMapSize());
			parsed_crc_interval = game->getCRCInterval();
			parsed_starting_cash = static_cast<int>(game->getStartingCash().countMoney());
			map_ok = game->getMap().compare(kLanApiParsedMap) == 0;
			for (Int i = 0; i < MAX_SLOTS; ++i) {
				GameSlot *slot = game->getSlot(i);
				if (slot != nullptr && slot->getState() == SLOT_CLOSED) {
					++parsed_slots_closed;
				}
			}
			slots_closed = parsed_slots_closed == MAX_SLOTS;
			game_recorded =
				games_seen == 1 &&
				!game->getName().compare(kLanApiGameName) &&
				!game->isGameInProgress() &&
				!game->getIsDirectConnect() &&
				game->getSeed() == static_cast<Int>(kLanApiSeed) &&
				game->getMapCRC() == kLanApiMapCrc &&
				game->getMapSize() == kLanApiMapSize &&
				game->getCRCInterval() == static_cast<Int>(kLanApiCrcInterval) &&
				game->getStartingCash().countMoney() == kLanApiStartingCash &&
				map_ok &&
				slots_closed;
		}

		TheLAN = old_lan;
		TheMapCache = old_map_cache;
		TheWritableGlobalData = old_global_data;
		TheGameState = old_game_state;
		TheGameText = old_game_text;
	}

	const bool ok = decoded &&
		length == static_cast<int>(sizeof(LANMessage)) &&
		globals_ready &&
		transport_injected &&
		update_driven &&
		transport_cleared &&
		callback_recorded &&
		game_recorded &&
		message_type == LANMessage::MSG_GAME_ANNOUNCE;

	std::snprintf(g_browser_lanapi_receive_json, sizeof(g_browser_lanapi_receive_json),
		"{\"ok\":%s,"
		"\"source\":\"GameNetwork browser LANAPI announce relay probe\","
		"\"lanApiReady\":%s,"
		"\"browserTransport\":\"harness relay queue\","
		"\"originalTransport\":\"Transport::m_inBuffer\","
		"\"originalDispatch\":\"LANAPI::update\","
		"\"originalHandler\":\"LANAPI::handleGameAnnounce\","
		"\"originalParser\":\"ParseGameOptionsString\","
		"\"originalCallback\":\"LANAPI::OnGameList\","
		"\"nextRequired\":\"lanApiJoinOrProductionTransport\","
		"\"packet\":{\"decoded\":%s,\"inputHexLength\":%d,\"invalidHexIndex\":%d,"
		"\"bytes\":%d,\"messageType\":\"%s\",\"remoteIp\":%u,\"localIp\":%u,\"port\":%u},"
		"\"globals\":{\"ready\":%s,\"gameText\":%s,\"gameState\":%s,"
		"\"globalData\":%s,\"mapCache\":%s},"
		"\"transport\":{\"injected\":%s,\"cleared\":%s},"
		"\"lanApi\":{\"updateDriven\":%s,\"handleGameAnnounceRecorded\":%s,"
		"\"onGameListCalls\":%d,\"gamesSeen\":%d},"
		"\"game\":{\"recorded\":%s,\"gameName\":\"Browser LAN Game\","
		"\"map\":\"%s\",\"mapOk\":%s,\"seed\":%d,\"mapCRC\":%d,"
		"\"mapSize\":%d,\"crcInterval\":%d,\"startingCash\":%d,"
		"\"closedSlots\":%d,\"slotsClosed\":%s,"
		"\"inProgress\":false,\"directConnect\":false}}",
		ok ? "true" : "false",
		ok ? "true" : "false",
		decoded ? "true" : "false",
		input_hex_length,
		invalid_hex_index,
		length,
		message_type == LANMessage::MSG_GAME_ANNOUNCE ? "MSG_GAME_ANNOUNCE" : "UNKNOWN",
		kLanApiRemoteIp,
		kLanApiLocalIp,
		kLanApiLobbyPort,
		globals_ready ? "true" : "false",
		game_text_ready ? "true" : "false",
		game_state_ready ? "true" : "false",
		global_data_ready ? "true" : "false",
		map_cache_ready ? "true" : "false",
		transport_injected ? "true" : "false",
		transport_cleared ? "true" : "false",
		update_driven ? "true" : "false",
		callback_recorded ? "true" : "false",
		on_game_list_calls,
		games_seen,
		game_recorded ? "true" : "false",
		parsed_map_json,
		map_ok ? "true" : "false",
		parsed_seed,
		parsed_map_crc,
		parsed_map_size,
		parsed_crc_interval,
		parsed_starting_cash,
		parsed_slots_closed,
		slots_closed ? "true" : "false");
	return g_browser_lanapi_receive_json;
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_build_browser_lanapi_join_request_packet()
{
	if (!isMemoryManagerOfficiallyInited()) {
		initMemoryManager();
	}

	ScopedOriginalMemoryManager memory_manager_scope;
	ProbeLANAPI joiner;
	ScopedLANProbeGlobals globals(&joiner);
	joiner.setLocalAddress(kLanApiJoinerIp);
	joiner.setIdentity(kLanApiJoinerName, kLanApiJoinerUserName, kLanApiJoinerHostName);
	LANGameInfo *game = create_probe_lan_game(FALSE);
	joiner.installGame(game, FALSE, TRUE);
	joiner.RequestGameJoin(game, kLanApiRemoteIp);

	LANMessage request_message = {};
	UnsignedInt request_addr = 0;
	UnsignedShort request_port = 0;
	const bool request_decoded = decode_queued_lan_message(
		joiner.transportForProbe(),
		LANMessage::MSG_REQUEST_JOIN,
		request_message,
		g_browser_lanapi_join_request_hex,
		sizeof(g_browser_lanapi_join_request_hex),
		&request_addr,
		&request_port);

	const bool ok = game != nullptr &&
		joiner.gameCount() == 1 &&
		request_decoded &&
		request_message.GameToJoin.gameIP == kLanApiRemoteIp &&
		request_message.GameToJoin.iniCRC == probe_global_data()->m_iniCRC &&
		request_message.GameToJoin.exeCRC == probe_global_data()->m_exeCRC &&
		request_addr == kLanApiRemoteIp &&
		request_port == kLanApiLobbyPort;

	std::snprintf(g_browser_lanapi_join_build_json, sizeof(g_browser_lanapi_join_build_json),
		"{\"ok\":%s,"
		"\"source\":\"GameNetwork browser LANAPI join request build probe\","
		"\"lanApiReady\":%s,"
		"\"browserTransport\":\"harness relay queue\","
		"\"originalRequest\":\"LANAPI::RequestGameJoin\","
		"\"originalSerializer\":\"LANMessage::MSG_REQUEST_JOIN\","
		"\"originalTransport\":\"Transport::queueSend\","
		"\"nextRequired\":\"lanApiJoinAcceptAndGameOptions\","
		"\"packet\":{\"hex\":\"%s\",\"bytes\":%zu,\"messageType\":\"%s\","
		"\"remoteIp\":%u,\"localIp\":%u,\"port\":%u,"
		"\"gameIP\":%u,\"iniCRC\":%u,\"exeCRC\":%u,"
		"\"gameName\":\"Browser LAN Game\",\"playerName\":\"Guest\"},"
		"\"lanApi\":{\"gamesSeen\":%d,\"pendingJoinQueued\":%s}}",
		ok ? "true" : "false",
		ok ? "true" : "false",
		request_decoded ? g_browser_lanapi_join_request_hex : "",
		sizeof(request_message),
		lan_message_type_name(request_message.LANMessageType),
		request_addr,
		kLanApiJoinerIp,
		request_port,
		request_message.GameToJoin.gameIP,
		request_message.GameToJoin.iniCRC,
		request_message.GameToJoin.exeCRC,
		joiner.gameCount(),
		request_decoded ? "true" : "false");
	return g_browser_lanapi_join_build_json;
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_accept_browser_lanapi_join_request_packet(const char *packet_hex)
{
	if (!isMemoryManagerOfficiallyInited()) {
		initMemoryManager();
	}

	UnsignedByte packet_bytes[sizeof(LANMessage)] = {};
	int length = 0;
	const int input_hex_length = packet_hex != nullptr ? static_cast<int>(std::strlen(packet_hex)) : -1;
	const int invalid_hex_index = first_invalid_hex_index(packet_hex);
	const bool decoded = decode_hex_with_capacity(packet_hex, packet_bytes, sizeof(packet_bytes), length);

	LANMessage request_message = {};
	if (decoded && length == static_cast<int>(sizeof(LANMessage))) {
		std::memcpy(&request_message, packet_bytes, sizeof(request_message));
	}

	bool transport_injected = false;
	bool transport_cleared = false;
	bool update_driven = false;
	bool join_accept_decoded = false;
	bool game_options_decoded = false;
	bool host_game_ready = false;
	bool joiner_added = false;
	bool callback_recorded = false;
	int games_seen = 0;
	int on_player_join_calls = 0;
	int joined_slot = -1;
	int game_options_length = 0;
	UnsignedInt join_accept_addr = 0;
	UnsignedShort join_accept_port = 0;
	UnsignedInt game_options_addr = 0;
	UnsignedShort game_options_port = 0;
	LANMessage join_accept_message = {};
	LANMessage game_options_message = {};

	if (decoded && length == static_cast<int>(sizeof(LANMessage))) {
		ScopedOriginalMemoryManager memory_manager_scope;
		ProbeLANAPI host;
		ScopedLANProbeGlobals globals(&host);
		host.setLocalAddress(kLanApiRemoteIp);
		host.setIdentity(kLanApiPlayerName, kLanApiUserName, kLanApiHostName);
		LANGameInfo *game = create_probe_lan_game(TRUE);
		host.installGame(game, TRUE, FALSE);
		host_game_ready = game != nullptr && game->isInGame() && !game->isGameInProgress() &&
			game->getIP(0) == kLanApiRemoteIp && game->getLANSlot(1)->isOpen();

		transport_injected = inject_lan_message(
			host.transportForProbe(),
			request_message,
			kLanApiJoinerIp,
			kLanApiLobbyPort);
		host.forceUpdateDelayElapsed();
		host.update();
		update_driven = true;
		transport_cleared = host.transportForProbe() != nullptr &&
			host.transportForProbe()->m_inBuffer[0].length == 0;

		join_accept_decoded = decode_queued_lan_message(
			host.transportForProbe(),
			LANMessage::MSG_JOIN_ACCEPT,
			join_accept_message,
			g_browser_lanapi_join_accept_hex,
			sizeof(g_browser_lanapi_join_accept_hex),
			&join_accept_addr,
			&join_accept_port);
		game_options_decoded = decode_queued_lan_message(
			host.transportForProbe(),
			LANMessage::MSG_GAME_OPTIONS,
			game_options_message,
			g_browser_lanapi_game_options_hex,
			sizeof(g_browser_lanapi_game_options_hex),
			&game_options_addr,
			&game_options_port);
		game_options_length = game_options_decoded ?
			static_cast<int>(std::strlen(game_options_message.GameOptions.options)) : 0;

		games_seen = host.gameCount();
		on_player_join_calls = host.onPlayerJoinCalls();
		joined_slot = join_accept_decoded ? join_accept_message.GameJoined.slotPosition : -1;
		LANGameInfo *current_game = host.currentGameForProbe();
		LANGameSlot *slot = current_game != nullptr && joined_slot >= 0 && joined_slot < MAX_SLOTS ?
			current_game->getLANSlot(joined_slot) : nullptr;
		joiner_added = slot != nullptr &&
			slot->isHuman() &&
			slot->getIP() == kLanApiJoinerIp &&
			slot->getName().compare(kLanApiJoinerName) == 0;
		callback_recorded = on_player_join_calls > 0 &&
			host.lastPlayerJoinSlot() == joined_slot &&
			host.lastPlayerJoinName().compare(kLanApiJoinerName) == 0;
	}

	const bool ok = decoded &&
		length == static_cast<int>(sizeof(LANMessage)) &&
		request_message.LANMessageType == LANMessage::MSG_REQUEST_JOIN &&
		request_message.GameToJoin.gameIP == kLanApiRemoteIp &&
		host_game_ready &&
		transport_injected &&
		update_driven &&
		transport_cleared &&
		join_accept_decoded &&
		game_options_decoded &&
		join_accept_message.GameJoined.playerIP == kLanApiJoinerIp &&
		join_accept_message.GameJoined.gameIP == kLanApiRemoteIp &&
		joined_slot == 1 &&
		joiner_added &&
		callback_recorded &&
		game_options_length > 0;

	std::snprintf(g_browser_lanapi_join_host_json, sizeof(g_browser_lanapi_join_host_json),
		"{\"ok\":%s,"
		"\"source\":\"GameNetwork browser LANAPI join request relay probe\","
		"\"lanApiReady\":%s,"
		"\"browserTransport\":\"harness relay queue\","
		"\"originalTransport\":\"Transport::m_inBuffer\","
		"\"originalDispatch\":\"LANAPI::update\","
		"\"originalHandler\":\"LANAPI::handleRequestJoin\","
		"\"originalCallback\":\"LANAPI::OnPlayerJoin\","
		"\"originalReply\":\"LANAPI::RequestGameOptions\","
		"\"nextRequired\":\"lanApiJoinAcceptIntoClient\","
		"\"packet\":{\"decoded\":%s,\"inputHexLength\":%d,\"invalidHexIndex\":%d,"
		"\"bytes\":%d,\"messageType\":\"%s\",\"remoteIp\":%u,\"localIp\":%u,\"port\":%u,"
		"\"gameIP\":%u,\"iniCRC\":%u,\"exeCRC\":%u},"
		"\"transport\":{\"injected\":%s,\"cleared\":%s},"
		"\"lanApi\":{\"updateDriven\":%s,\"gamesSeen\":%d,\"onPlayerJoinCalls\":%d,"
		"\"hostGameReady\":%s},"
		"\"game\":{\"joinerAdded\":%s,\"slotPosition\":%d,\"playerIP\":%u,"
		"\"playerName\":\"Guest\"},"
		"\"reply\":{\"joinAcceptHex\":\"%s\",\"gameOptionsHex\":\"%s\","
		"\"joinAcceptType\":\"%s\",\"gameOptionsType\":\"%s\","
		"\"joinAcceptAddr\":%u,\"joinAcceptPort\":%u,"
		"\"gameOptionsAddr\":%u,\"gameOptionsPort\":%u,"
		"\"optionsLength\":%d}}",
		ok ? "true" : "false",
		ok ? "true" : "false",
		decoded ? "true" : "false",
		input_hex_length,
		invalid_hex_index,
		length,
		lan_message_type_name(request_message.LANMessageType),
		kLanApiJoinerIp,
		kLanApiRemoteIp,
		kLanApiLobbyPort,
		request_message.GameToJoin.gameIP,
		request_message.GameToJoin.iniCRC,
		request_message.GameToJoin.exeCRC,
		transport_injected ? "true" : "false",
		transport_cleared ? "true" : "false",
		update_driven ? "true" : "false",
		games_seen,
		on_player_join_calls,
		host_game_ready ? "true" : "false",
		joiner_added ? "true" : "false",
		joined_slot,
		kLanApiJoinerIp,
		join_accept_decoded ? g_browser_lanapi_join_accept_hex : "",
		game_options_decoded ? g_browser_lanapi_game_options_hex : "",
		lan_message_type_name(join_accept_message.LANMessageType),
		lan_message_type_name(game_options_message.LANMessageType),
		join_accept_addr,
		join_accept_port,
		game_options_addr,
		game_options_port,
		game_options_length);
	return g_browser_lanapi_join_host_json;
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_accept_browser_lanapi_join_accept_packet(
	const char *accept_hex,
	const char *options_hex)
{
	if (!isMemoryManagerOfficiallyInited()) {
		initMemoryManager();
	}

	UnsignedByte accept_bytes[sizeof(LANMessage)] = {};
	UnsignedByte options_bytes[sizeof(LANMessage)] = {};
	int accept_length = 0;
	int options_length = 0;
	const int accept_hex_length = accept_hex != nullptr ? static_cast<int>(std::strlen(accept_hex)) : -1;
	const int options_hex_length = options_hex != nullptr ? static_cast<int>(std::strlen(options_hex)) : -1;
	const int accept_invalid_hex_index = first_invalid_hex_index(accept_hex);
	const int options_invalid_hex_index = first_invalid_hex_index(options_hex);
	const bool accept_decoded = decode_hex_with_capacity(accept_hex, accept_bytes, sizeof(accept_bytes), accept_length);
	const bool options_decoded = decode_hex_with_capacity(options_hex, options_bytes, sizeof(options_bytes), options_length);

	LANMessage accept_message = {};
	LANMessage options_message = {};
	if (accept_decoded && accept_length == static_cast<int>(sizeof(LANMessage))) {
		std::memcpy(&accept_message, accept_bytes, sizeof(accept_message));
	}
	if (options_decoded && options_length == static_cast<int>(sizeof(LANMessage))) {
		std::memcpy(&options_message, options_bytes, sizeof(options_message));
	}

	bool accept_injected = false;
	bool accept_cleared = false;
	bool options_injected = false;
	bool options_cleared = false;
	bool accept_update_driven = false;
	bool options_update_driven = false;
	bool discovered_game_ready = false;
	bool join_recorded = false;
	bool options_recorded = false;
	bool options_parsed = false;
	bool joiner_slot_ready = false;
	bool host_slot_ready = false;
	bool in_lobby = true;
	int games_seen = 0;
	int local_slot = -1;
	int on_game_join_calls = 0;
	int on_game_options_calls = 0;
	int last_game_join_return = -1;
	int last_game_options_slot = -1;
	UnsignedInt last_game_options_ip = 0;
	int parsed_map_crc = -1;
	int parsed_map_size = -1;
	int parsed_seed = -1;
	int parsed_crc_interval = -1;
	int parsed_options_length = 0;
	char parsed_map_json[256] = {};

	if (accept_decoded && options_decoded &&
		accept_length == static_cast<int>(sizeof(LANMessage)) &&
		options_length == static_cast<int>(sizeof(LANMessage))) {
		ScopedOriginalMemoryManager memory_manager_scope;
		ProbeLANAPI joiner;
		ScopedLANProbeGlobals globals(&joiner);
		joiner.setLocalAddress(kLanApiJoinerIp);
		joiner.setIdentity(kLanApiJoinerName, kLanApiJoinerUserName, kLanApiJoinerHostName);
		LANGameInfo *game = create_probe_lan_game(FALSE);
		joiner.installGame(game, FALSE, TRUE);
		joiner.markPendingJoin();
		discovered_game_ready = game != nullptr && !game->isInGame() &&
			game->getIP(0) == kLanApiRemoteIp && game->getLANSlot(1)->isOpen();

		accept_injected = inject_lan_message(
			joiner.transportForProbe(),
			accept_message,
			kLanApiRemoteIp,
			kLanApiLobbyPort);
		joiner.forceUpdateDelayElapsed();
		joiner.update();
		accept_update_driven = true;
		accept_cleared = joiner.transportForProbe() != nullptr &&
			joiner.transportForProbe()->m_inBuffer[0].length == 0;

		options_injected = inject_lan_message(
			joiner.transportForProbe(),
			options_message,
			kLanApiRemoteIp,
			kLanApiLobbyPort);
		joiner.forceUpdateDelayElapsed();
		joiner.update();
		options_update_driven = true;
		options_cleared = joiner.transportForProbe() != nullptr &&
			joiner.transportForProbe()->m_inBuffer[0].length == 0;

		LANGameInfo *current_game = joiner.currentGameForProbe();
		games_seen = joiner.gameCount();
		in_lobby = joiner.inLobbyForProbe();
		on_game_join_calls = joiner.onGameJoinCalls();
		on_game_options_calls = joiner.onGameOptionsCalls();
		last_game_join_return = joiner.lastGameJoinReturn();
		last_game_options_slot = joiner.lastGameOptionsPlayerSlot();
		last_game_options_ip = joiner.lastGameOptionsPlayerIP();
		parsed_options_length = joiner.lastGameOptions().getLength();

		if (current_game != nullptr) {
			local_slot = current_game->getLocalSlotNum();
			copy_json_path(parsed_map_json, sizeof(parsed_map_json), current_game->getMap().str());
			parsed_map_crc = static_cast<int>(current_game->getMapCRC());
			parsed_map_size = static_cast<int>(current_game->getMapSize());
			parsed_seed = current_game->getSeed();
			parsed_crc_interval = current_game->getCRCInterval();
			LANGameSlot *host_slot = current_game->getLANSlot(0);
			LANGameSlot *joiner_slot = current_game->getLANSlot(1);
			host_slot_ready = host_slot != nullptr &&
				host_slot->isHuman() &&
				host_slot->getIP() == kLanApiRemoteIp;
			joiner_slot_ready = joiner_slot != nullptr &&
				joiner_slot->isHuman() &&
				joiner_slot->getIP() == kLanApiJoinerIp &&
				joiner_slot->getName().compare(kLanApiJoinerName) == 0;
			options_parsed =
				current_game->isInGame() &&
				!current_game->isGameInProgress() &&
				parsed_map_crc == static_cast<int>(kLanApiMapCrc) &&
				parsed_map_size == static_cast<int>(kLanApiMapSize) &&
				parsed_seed == static_cast<int>(kLanApiSeed) &&
				parsed_crc_interval == static_cast<int>(kLanApiCrcInterval) &&
				host_slot_ready &&
				joiner_slot_ready;
		}

		join_recorded = on_game_join_calls == 1 &&
			last_game_join_return == LANAPIInterface::RET_OK &&
			joiner.lastJoinedGame() == current_game &&
			!in_lobby &&
			local_slot == 1;
		options_recorded = on_game_options_calls > 0 &&
			last_game_options_ip == kLanApiRemoteIp &&
			last_game_options_slot == 0 &&
			parsed_options_length > 0;
	}

	const bool ok = accept_decoded &&
		options_decoded &&
		accept_length == static_cast<int>(sizeof(LANMessage)) &&
		options_length == static_cast<int>(sizeof(LANMessage)) &&
		accept_message.LANMessageType == LANMessage::MSG_JOIN_ACCEPT &&
		options_message.LANMessageType == LANMessage::MSG_GAME_OPTIONS &&
		accept_message.GameJoined.playerIP == kLanApiJoinerIp &&
		accept_message.GameJoined.gameIP == kLanApiRemoteIp &&
		accept_message.GameJoined.slotPosition == 1 &&
		discovered_game_ready &&
		accept_injected &&
		accept_cleared &&
		accept_update_driven &&
		options_injected &&
		options_cleared &&
		options_update_driven &&
		join_recorded &&
		options_recorded &&
		options_parsed;

	std::snprintf(g_browser_lanapi_join_client_json, sizeof(g_browser_lanapi_join_client_json),
		"{\"ok\":%s,"
		"\"source\":\"GameNetwork browser LANAPI join accept/options relay probe\","
		"\"lanApiReady\":%s,"
		"\"browserTransport\":\"harness relay queue\","
		"\"originalTransport\":\"Transport::m_inBuffer\","
		"\"originalDispatch\":\"LANAPI::update\","
		"\"originalHandlers\":\"LANAPI::handleJoinAccept+LANAPI::handleGameOptions\","
		"\"originalParser\":\"GameInfoToAsciiString -> ParseAsciiStringToGameInfo\","
		"\"originalCallbacks\":\"LANAPI::OnGameJoin+LANAPI::OnGameOptions\","
		"\"nextRequired\":\"lanApiGameStartOrProductionTransport\","
		"\"packets\":{\"joinAcceptDecoded\":%s,\"gameOptionsDecoded\":%s,"
		"\"joinAcceptHexLength\":%d,\"gameOptionsHexLength\":%d,"
		"\"joinAcceptInvalidHexIndex\":%d,\"gameOptionsInvalidHexIndex\":%d,"
		"\"joinAcceptBytes\":%d,\"gameOptionsBytes\":%d,"
		"\"joinAcceptType\":\"%s\",\"gameOptionsType\":\"%s\","
		"\"slotPosition\":%d,\"playerIP\":%u,\"gameIP\":%u},"
		"\"transport\":{\"joinAcceptInjected\":%s,\"joinAcceptCleared\":%s,"
		"\"gameOptionsInjected\":%s,\"gameOptionsCleared\":%s},"
		"\"lanApi\":{\"acceptUpdateDriven\":%s,\"optionsUpdateDriven\":%s,"
		"\"gamesSeen\":%d,\"inLobby\":%s,\"onGameJoinCalls\":%d,"
		"\"lastGameJoinReturn\":%d,\"onGameOptionsCalls\":%d,"
		"\"lastGameOptionsPlayerIP\":%u,\"lastGameOptionsPlayerSlot\":%d,"
		"\"lastGameOptionsLength\":%d},"
		"\"game\":{\"joinRecorded\":%s,\"optionsRecorded\":%s,\"optionsParsed\":%s,"
		"\"localSlot\":%d,\"hostSlotReady\":%s,\"joinerSlotReady\":%s,"
		"\"map\":\"%s\",\"mapCRC\":%d,\"mapSize\":%d,\"seed\":%d,\"crcInterval\":%d}}",
		ok ? "true" : "false",
		ok ? "true" : "false",
		accept_decoded ? "true" : "false",
		options_decoded ? "true" : "false",
		accept_hex_length,
		options_hex_length,
		accept_invalid_hex_index,
		options_invalid_hex_index,
		accept_length,
		options_length,
		lan_message_type_name(accept_message.LANMessageType),
		lan_message_type_name(options_message.LANMessageType),
		accept_message.GameJoined.slotPosition,
		accept_message.GameJoined.playerIP,
		accept_message.GameJoined.gameIP,
		accept_injected ? "true" : "false",
		accept_cleared ? "true" : "false",
		options_injected ? "true" : "false",
		options_cleared ? "true" : "false",
		accept_update_driven ? "true" : "false",
		options_update_driven ? "true" : "false",
		games_seen,
		in_lobby ? "true" : "false",
		on_game_join_calls,
		last_game_join_return,
		on_game_options_calls,
		last_game_options_ip,
		last_game_options_slot,
		parsed_options_length,
		join_recorded ? "true" : "false",
		options_recorded ? "true" : "false",
		options_parsed ? "true" : "false",
		local_slot,
		host_slot_ready ? "true" : "false",
		joiner_slot_ready ? "true" : "false",
		parsed_map_json,
		parsed_map_crc,
		parsed_map_size,
		parsed_seed,
		parsed_crc_interval);
	return g_browser_lanapi_join_client_json;
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_build_browser_lanapi_game_start_packet()
{
	if (!isMemoryManagerOfficiallyInited()) {
		initMemoryManager();
	}

	bool host_game_ready = false;
	bool game_start_decoded = false;
	Int game_start_active_length = 0;
	UnsignedInt game_start_addr = 0;
	UnsignedShort game_start_port = 0;
	int on_game_start_calls = 0;
	LANMessage game_start_message = {};
	LANGameStartState state;

	{
		ScopedOriginalMemoryManager memory_manager_scope;
		ProbeLANAPI host;
		ScopedLANProbeGlobals globals(&host);
		ScopedLANGameStartGlobals game_start_globals;
		host.setLocalAddress(kLanApiRemoteIp);
		host.setIdentity(kLanApiPlayerName, kLanApiUserName, kLanApiHostName);
		probe_global_data()->m_pendingFile = AsciiString("");
		probe_global_data()->m_useFpsLimit = TRUE;
		LANGameInfo *game = create_probe_lan_game(TRUE, TRUE);
		host.installGame(game, TRUE, FALSE);
		host_game_ready = game != nullptr &&
			game->isInGame() &&
			!game->isGameInProgress() &&
			game->getLocalSlotNum() == 0 &&
			game->getIP(0) == kLanApiRemoteIp &&
			game->getLANSlot(1)->isHuman() &&
			game->getLANSlot(1)->getIP() == kLanApiJoinerIp;

		host.RequestGameStart();
		on_game_start_calls = host.onGameStartCalls();

		game_start_decoded = decode_queued_lan_message(
			host.transportForProbe(),
			LANMessage::MSG_GAME_START,
			game_start_message,
			g_browser_lanapi_game_start_hex,
			sizeof(g_browser_lanapi_game_start_hex),
			&game_start_addr,
			&game_start_port,
			&game_start_active_length);
		collect_lan_game_start_state(
			game,
			0,
			1,
			kLanApiJoinerName,
			game_start_globals,
			state);
	}

	const bool ok = host_game_ready &&
		game_start_decoded &&
		game_start_message.LANMessageType == LANMessage::MSG_GAME_START &&
		game_start_port == kLanApiLobbyPort &&
		on_game_start_calls == 1 &&
		state.network_setup_ready &&
		state.callback_side_effects_ready;

	std::snprintf(g_browser_lanapi_game_start_build_json, sizeof(g_browser_lanapi_game_start_build_json),
		"{\"ok\":%s,"
		"\"source\":\"GameNetwork browser LANAPI game-start host probe\","
		"\"lanApiReady\":%s,"
		"\"browserTransport\":\"harness relay queue\","
		"\"originalRequest\":\"LANAPI::RequestGameStart\","
		"\"originalSerializer\":\"LANMessage::MSG_GAME_START\","
		"\"originalTransport\":\"Transport::queueSend\","
		"\"originalCallback\":\"LANAPI::OnGameStart\","
		"\"originalNetwork\":\"NetworkInterface::createNetwork -> Network::init/initTransport/parseUserList\","
		"\"nextRequired\":\"networkUpdateFrameReadinessOrProductionWebSocketWebRTCTransport\","
		"\"packet\":{\"hex\":\"%s\",\"bytes\":%zu,\"activeBytes\":%d,"
		"\"messageType\":\"%s\",\"remoteIp\":%u,\"localIp\":%u,\"port\":%u},"
		"\"lanApi\":{\"hostGameReady\":%s,\"onGameStartCalls\":%d},"
		"\"network\":{\"created\":%s,\"setupReady\":%s,\"localSlot\":%d,"
		"\"numPlayers\":%d,\"runAhead\":%u,\"frameRate\":%u,"
		"\"packetArrivalCushion\":%u,\"frameDataReady\":%s,"
		"\"remoteNameReady\":%s},"
		"\"callback\":{\"sideEffectsReady\":%s,\"gameInProgress\":%s,"
		"\"pendingFileReady\":%s,\"useFpsLimitDisabled\":%s,"
		"\"messageNewGame\":%s,\"messageArgumentReady\":%s,"
		"\"messageType\":%d,\"messageArgumentCount\":%d,"
		"\"messageArgumentType\":%d,\"messageArgument\":%d,"
		"\"randomSeedReady\":%s,\"mapCacheReady\":%s}}",
		ok ? "true" : "false",
		ok ? "true" : "false",
		game_start_decoded ? g_browser_lanapi_game_start_hex : "",
		sizeof(game_start_message),
		game_start_active_length,
		lan_message_type_name(game_start_message.LANMessageType),
		game_start_addr,
		kLanApiRemoteIp,
		game_start_port,
		host_game_ready ? "true" : "false",
		on_game_start_calls,
		state.network_created ? "true" : "false",
		state.network_setup_ready ? "true" : "false",
		state.local_slot,
		state.num_players,
		state.run_ahead,
		state.frame_rate,
		state.packet_arrival_cushion,
		state.frame_data_ready ? "true" : "false",
		state.remote_name_ready ? "true" : "false",
		state.callback_side_effects_ready ? "true" : "false",
		state.game_in_progress ? "true" : "false",
		state.pending_file_ready ? "true" : "false",
		state.use_fps_limit_disabled ? "true" : "false",
		state.message_new_game ? "true" : "false",
		state.message_argument_ready ? "true" : "false",
		state.message_type,
		state.message_argument_count,
		state.message_argument_type,
		state.message_argument,
		state.random_seed_ready ? "true" : "false",
		state.map_cache_ready ? "true" : "false");
	return g_browser_lanapi_game_start_build_json;
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_accept_browser_lanapi_game_start_packet(const char *packet_hex)
{
	if (!isMemoryManagerOfficiallyInited()) {
		initMemoryManager();
	}

	UnsignedByte packet_bytes[sizeof(LANMessage)] = {};
	int length = 0;
	const int input_hex_length = packet_hex != nullptr ? static_cast<int>(std::strlen(packet_hex)) : -1;
	const int invalid_hex_index = first_invalid_hex_index(packet_hex);
	const bool decoded = decode_hex_with_capacity(packet_hex, packet_bytes, sizeof(packet_bytes), length);

	LANMessage game_start_message = {};
	if (decoded && length == static_cast<int>(sizeof(LANMessage))) {
		std::memcpy(&game_start_message, packet_bytes, sizeof(game_start_message));
	}

	bool joined_game_ready = false;
	bool transport_injected = false;
	bool transport_cleared = false;
	bool update_driven = false;
	int on_game_start_calls = 0;
	LANGameStartState state;

	if (decoded && length == static_cast<int>(sizeof(LANMessage))) {
		ScopedOriginalMemoryManager memory_manager_scope;
		ProbeLANAPI joiner;
		ScopedLANProbeGlobals globals(&joiner);
		ScopedLANGameStartGlobals game_start_globals;
		joiner.setLocalAddress(kLanApiJoinerIp);
		joiner.setIdentity(kLanApiJoinerName, kLanApiJoinerUserName, kLanApiJoinerHostName);
		probe_global_data()->m_pendingFile = AsciiString("");
		probe_global_data()->m_useFpsLimit = TRUE;
		LANGameInfo *game = create_probe_lan_game(TRUE, TRUE);
		joiner.installGame(game, TRUE, FALSE);
		joined_game_ready = game != nullptr &&
			game->isInGame() &&
			!game->isGameInProgress() &&
			game->getLocalSlotNum() == 1 &&
			game->getIP(0) == kLanApiRemoteIp &&
			game->getLANSlot(1)->isHuman() &&
			game->getLANSlot(1)->getIP() == kLanApiJoinerIp;

		transport_injected = inject_lan_message(
			joiner.transportForProbe(),
			game_start_message,
			kLanApiRemoteIp,
			kLanApiLobbyPort);
		joiner.forceUpdateDelayElapsed();
		joiner.update();
		update_driven = true;
		transport_cleared = joiner.transportForProbe() != nullptr &&
			joiner.transportForProbe()->m_inBuffer[0].length == 0;
		on_game_start_calls = joiner.onGameStartCalls();

		collect_lan_game_start_state(
			game,
			1,
			0,
			kLanApiPlayerName,
			game_start_globals,
			state);
	}

	const bool ok = decoded &&
		length == static_cast<int>(sizeof(LANMessage)) &&
		game_start_message.LANMessageType == LANMessage::MSG_GAME_START &&
		joined_game_ready &&
		transport_injected &&
		transport_cleared &&
		update_driven &&
		on_game_start_calls == 1 &&
		state.network_setup_ready &&
		state.callback_side_effects_ready;

	std::snprintf(g_browser_lanapi_game_start_client_json, sizeof(g_browser_lanapi_game_start_client_json),
		"{\"ok\":%s,"
		"\"source\":\"GameNetwork browser LANAPI game-start client probe\","
		"\"lanApiReady\":%s,"
		"\"browserTransport\":\"harness relay queue\","
		"\"originalTransport\":\"Transport::m_inBuffer\","
		"\"originalDispatch\":\"LANAPI::update\","
		"\"originalHandler\":\"LANAPI::handleGameStart\","
		"\"originalCallback\":\"LANAPI::OnGameStart\","
		"\"originalNetwork\":\"NetworkInterface::createNetwork -> Network::init/initTransport/parseUserList\","
		"\"nextRequired\":\"networkUpdateFrameReadinessOrProductionWebSocketWebRTCTransport\","
		"\"packet\":{\"decoded\":%s,\"inputHexLength\":%d,\"invalidHexIndex\":%d,"
		"\"bytes\":%d,\"messageType\":\"%s\",\"remoteIp\":%u,\"localIp\":%u,"
		"\"port\":%u},"
		"\"transport\":{\"injected\":%s,\"cleared\":%s},"
		"\"lanApi\":{\"updateDriven\":%s,\"joinedGameReady\":%s,"
		"\"onGameStartCalls\":%d},"
		"\"network\":{\"created\":%s,\"setupReady\":%s,\"localSlot\":%d,"
		"\"numPlayers\":%d,\"runAhead\":%u,\"frameRate\":%u,"
		"\"packetArrivalCushion\":%u,\"frameDataReady\":%s,"
		"\"remoteNameReady\":%s},"
		"\"callback\":{\"sideEffectsReady\":%s,\"gameInProgress\":%s,"
		"\"pendingFileReady\":%s,\"useFpsLimitDisabled\":%s,"
		"\"messageNewGame\":%s,\"messageArgumentReady\":%s,"
		"\"messageType\":%d,\"messageArgumentCount\":%d,"
		"\"messageArgumentType\":%d,\"messageArgument\":%d,"
		"\"randomSeedReady\":%s,\"mapCacheReady\":%s}}",
		ok ? "true" : "false",
		ok ? "true" : "false",
		decoded ? "true" : "false",
		input_hex_length,
		invalid_hex_index,
		length,
		lan_message_type_name(game_start_message.LANMessageType),
		kLanApiRemoteIp,
		kLanApiJoinerIp,
		kLanApiLobbyPort,
		transport_injected ? "true" : "false",
		transport_cleared ? "true" : "false",
		update_driven ? "true" : "false",
		joined_game_ready ? "true" : "false",
		on_game_start_calls,
		state.network_created ? "true" : "false",
		state.network_setup_ready ? "true" : "false",
		state.local_slot,
		state.num_players,
		state.run_ahead,
		state.frame_rate,
		state.packet_arrival_cushion,
		state.frame_data_ready ? "true" : "false",
		state.remote_name_ready ? "true" : "false",
		state.callback_side_effects_ready ? "true" : "false",
		state.game_in_progress ? "true" : "false",
		state.pending_file_ready ? "true" : "false",
		state.use_fps_limit_disabled ? "true" : "false",
		state.message_new_game ? "true" : "false",
		state.message_argument_ready ? "true" : "false",
		state.message_type,
		state.message_argument_count,
		state.message_argument_type,
		state.message_argument,
		state.random_seed_ready ? "true" : "false",
		state.map_cache_ready ? "true" : "false");
	return g_browser_lanapi_game_start_client_json;
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_browser_lanapi_live_game_start_send()
{
	if (!isMemoryManagerOfficiallyInited()) {
		initMemoryManager();
	}

	cnc_port_browser_udp_adapter_clear();

	bool host_game_ready = false;
	bool lan_transport_initialized = false;
	bool lan_transport_out_cleared = false;
	int on_game_start_calls = 0;
	LANGameStartState state;
	const Int active_length = active_lan_message_length(LANMessage::MSG_GAME_START);
	const Int wire_length = active_length + static_cast<Int>(sizeof(TransportMessageHeader));

	{
		ScopedOriginalMemoryManager memory_manager_scope;
		ProbeLANAPI host;
		ScopedLANProbeGlobals globals(&host);
		ScopedLANGameStartGlobals game_start_globals;
		host.setLocalAddress(kLanApiRemoteIp);
		host.setIdentity(kLanApiPlayerName, kLanApiUserName, kLanApiHostName);
		lan_transport_initialized = host.transportForProbe() != nullptr &&
			host.transportForProbe()->init(kLanApiRemoteIp, kLanApiLobbyPort);
		probe_global_data()->m_pendingFile = AsciiString("");
		probe_global_data()->m_useFpsLimit = TRUE;
		LANGameInfo *game = create_probe_lan_game(TRUE, TRUE);
		host.installGame(game, TRUE, FALSE);
		host_game_ready = game != nullptr &&
			game->isInGame() &&
			!game->isGameInProgress() &&
			game->getLocalSlotNum() == 0 &&
			game->getIP(0) == kLanApiRemoteIp &&
			game->getLANSlot(1)->isHuman() &&
			game->getLANSlot(1)->getIP() == kLanApiJoinerIp;

		host.RequestGameStart();
		on_game_start_calls = host.onGameStartCalls();
		lan_transport_out_cleared = transport_out_buffer_empty(host.transportForProbe());

		collect_lan_game_start_state(
			game,
			0,
			1,
			kLanApiJoinerName,
			game_start_globals,
			state);
	}

	const int adapter_writes = cnc_port_browser_udp_adapter_write_count();
	const int fallback_outgoing = cnc_port_browser_udp_adapter_outgoing_count();
	const int adapter_dropped = cnc_port_browser_udp_adapter_dropped_count();
	const bool ok = host_game_ready &&
		lan_transport_initialized &&
		lan_transport_out_cleared &&
		adapter_writes == 1 &&
		fallback_outgoing == 0 &&
		adapter_dropped == 0 &&
		on_game_start_calls == 1 &&
		active_length > 0 &&
		wire_length > active_length &&
		state.network_setup_ready &&
		state.callback_side_effects_ready;

	std::snprintf(g_browser_lanapi_live_game_start_send_json, sizeof(g_browser_lanapi_live_game_start_send_json),
		"{\"ok\":%s,"
		"\"source\":\"GameNetwork browser LANAPI live game-start send probe\","
		"\"lanApiReady\":%s,"
		"\"browserTransport\":\"browser WebSocket live UDP endpoint\","
		"\"productionTransport\":true,"
		"\"relayTransport\":true,"
		"\"originalRequest\":\"LANAPI::RequestGameStart\","
		"\"originalSerializer\":\"LANAPI::sendMessage -> Transport::queueSend\","
		"\"originalTransport\":\"Transport::update\","
		"\"originalWireSend\":\"Transport::doSend -> Module.cncPortBrowserUdpSend\","
		"\"originalCallback\":\"LANAPI::OnGameStart\","
		"\"originalNetwork\":\"NetworkInterface::createNetwork -> Network::init/initTransport/parseUserList\","
		"\"nextRequired\":\"liveEndpointLanApiGameStartReceiveIntoNetworkUpdate\","
		"\"packet\":{\"messageType\":\"MSG_GAME_START\",\"activeBytes\":%d,"
		"\"wireBytes\":%d,\"remoteIp\":%u,\"localIp\":%u,\"port\":%u},"
		"\"transport\":{\"initialized\":%s,\"updateDriven\":true,"
		"\"outBufferCleared\":%s,\"adapterWrites\":%d,"
		"\"fallbackOutgoing\":%d,\"adapterDropped\":%d},"
		"\"lanApi\":{\"hostGameReady\":%s,\"onGameStartCalls\":%d},"
		"\"network\":{\"created\":%s,\"setupReady\":%s,\"localSlot\":%d,"
		"\"numPlayers\":%d,\"runAhead\":%u,\"frameRate\":%u,"
		"\"packetArrivalCushion\":%u,\"frameDataReady\":%s,"
		"\"remoteNameReady\":%s},"
		"\"callback\":{\"sideEffectsReady\":%s,\"gameInProgress\":%s,"
		"\"pendingFileReady\":%s,\"useFpsLimitDisabled\":%s,"
		"\"messageNewGame\":%s,\"messageArgumentReady\":%s,"
		"\"messageType\":%d,\"messageArgument\":%d,"
		"\"randomSeedReady\":%s,\"mapCacheReady\":%s}}",
		ok ? "true" : "false",
		ok ? "true" : "false",
		active_length,
		wire_length,
		INADDR_BROADCAST,
		kLanApiRemoteIp,
		kLanApiLobbyPort,
		lan_transport_initialized ? "true" : "false",
		lan_transport_out_cleared ? "true" : "false",
		adapter_writes,
		fallback_outgoing,
		adapter_dropped,
		host_game_ready ? "true" : "false",
		on_game_start_calls,
		state.network_created ? "true" : "false",
		state.network_setup_ready ? "true" : "false",
		state.local_slot,
		state.num_players,
		state.run_ahead,
		state.frame_rate,
		state.packet_arrival_cushion,
		state.frame_data_ready ? "true" : "false",
		state.remote_name_ready ? "true" : "false",
		state.callback_side_effects_ready ? "true" : "false",
		state.game_in_progress ? "true" : "false",
		state.pending_file_ready ? "true" : "false",
		state.use_fps_limit_disabled ? "true" : "false",
		state.message_new_game ? "true" : "false",
		state.message_argument_ready ? "true" : "false",
		state.message_type,
		state.message_argument,
		state.random_seed_ready ? "true" : "false",
		state.map_cache_ready ? "true" : "false");
	return g_browser_lanapi_live_game_start_send_json;
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_browser_lanapi_live_game_start_receive()
{
	if (!isMemoryManagerOfficiallyInited()) {
		initMemoryManager();
	}

	cnc_port_browser_udp_adapter_clear();

	bool joined_game_ready = false;
	bool lan_transport_initialized = false;
	bool transport_cleared = false;
	bool update_driven = false;
	int on_game_start_calls = 0;
	LANGameStartState state;
	const Int active_length = active_lan_message_length(LANMessage::MSG_GAME_START);
	const Int wire_length = active_length + static_cast<Int>(sizeof(TransportMessageHeader));

	{
		ScopedOriginalMemoryManager memory_manager_scope;
		ProbeLANAPI joiner;
		ScopedLANProbeGlobals globals(&joiner);
		ScopedLANGameStartGlobals game_start_globals;
		joiner.setLocalAddress(kLanApiJoinerIp);
		joiner.setIdentity(kLanApiJoinerName, kLanApiJoinerUserName, kLanApiJoinerHostName);
		lan_transport_initialized = joiner.transportForProbe() != nullptr &&
			joiner.transportForProbe()->init(kLanApiJoinerIp, kLanApiLobbyPort);
		probe_global_data()->m_pendingFile = AsciiString("");
		probe_global_data()->m_useFpsLimit = TRUE;
		LANGameInfo *game = create_probe_lan_game(TRUE, TRUE);
		joiner.installGame(game, TRUE, FALSE);
		joined_game_ready = game != nullptr &&
			game->isInGame() &&
			!game->isGameInProgress() &&
			game->getLocalSlotNum() == 1 &&
			game->getIP(0) == kLanApiRemoteIp &&
			game->getLANSlot(1)->isHuman() &&
			game->getLANSlot(1)->getIP() == kLanApiJoinerIp;

		joiner.forceUpdateDelayElapsed();
		joiner.update();
		update_driven = true;
		transport_cleared = transport_in_buffer_empty(joiner.transportForProbe());
		on_game_start_calls = joiner.onGameStartCalls();

		collect_lan_game_start_state(
			game,
			1,
			0,
			kLanApiPlayerName,
			game_start_globals,
			state);
	}

	const int adapter_reads = cnc_port_browser_udp_adapter_read_count();
	const int fallback_incoming = cnc_port_browser_udp_adapter_incoming_count();
	const int adapter_dropped = cnc_port_browser_udp_adapter_dropped_count();
	const bool ok = joined_game_ready &&
		lan_transport_initialized &&
		transport_cleared &&
		update_driven &&
		adapter_reads == 1 &&
		fallback_incoming == 0 &&
		adapter_dropped == 0 &&
		on_game_start_calls == 1 &&
		active_length > 0 &&
		wire_length > active_length &&
		state.network_setup_ready &&
		state.callback_side_effects_ready;

	std::snprintf(g_browser_lanapi_live_game_start_receive_json, sizeof(g_browser_lanapi_live_game_start_receive_json),
		"{\"ok\":%s,"
		"\"source\":\"GameNetwork browser LANAPI live game-start receive probe\","
		"\"lanApiReady\":%s,"
		"\"browserTransport\":\"browser WebSocket live UDP endpoint\","
		"\"productionTransport\":true,"
		"\"relayTransport\":true,"
		"\"originalWireReceive\":\"Module.cncPortBrowserUdpRecv -> Transport::doRecv decryptBuf/isGeneralsPacket\","
		"\"originalTransport\":\"Transport::m_inBuffer\","
		"\"originalDispatch\":\"LANAPI::update\","
		"\"originalHandler\":\"LANAPI::handleGameStart\","
		"\"originalCallback\":\"LANAPI::OnGameStart\","
		"\"originalNetwork\":\"NetworkInterface::createNetwork -> Network::init/initTransport/parseUserList\","
		"\"nextRequired\":\"liveEndpointNetworkUpdateTwoClientFrameSync\","
		"\"packet\":{\"messageType\":\"MSG_GAME_START\",\"activeBytes\":%d,"
		"\"wireBytes\":%d,\"remoteIp\":%u,\"localIp\":%u,\"port\":%u},"
		"\"transport\":{\"initialized\":%s,\"updateDriven\":%s,"
		"\"cleared\":%s,\"adapterReads\":%d,\"fallbackIncoming\":%d,"
		"\"adapterDropped\":%d},"
		"\"lanApi\":{\"joinedGameReady\":%s,\"onGameStartCalls\":%d},"
		"\"network\":{\"created\":%s,\"setupReady\":%s,\"localSlot\":%d,"
		"\"numPlayers\":%d,\"runAhead\":%u,\"frameRate\":%u,"
		"\"packetArrivalCushion\":%u,\"frameDataReady\":%s,"
		"\"remoteNameReady\":%s},"
		"\"callback\":{\"sideEffectsReady\":%s,\"gameInProgress\":%s,"
		"\"pendingFileReady\":%s,\"useFpsLimitDisabled\":%s,"
		"\"messageNewGame\":%s,\"messageArgumentReady\":%s,"
		"\"messageType\":%d,\"messageArgument\":%d,"
		"\"randomSeedReady\":%s,\"mapCacheReady\":%s}}",
		ok ? "true" : "false",
		ok ? "true" : "false",
		active_length,
		wire_length,
		kLanApiRemoteIp,
		kLanApiJoinerIp,
		kLanApiLobbyPort,
		lan_transport_initialized ? "true" : "false",
		update_driven ? "true" : "false",
		transport_cleared ? "true" : "false",
		adapter_reads,
		fallback_incoming,
		adapter_dropped,
		joined_game_ready ? "true" : "false",
		on_game_start_calls,
		state.network_created ? "true" : "false",
		state.network_setup_ready ? "true" : "false",
		state.local_slot,
		state.num_players,
		state.run_ahead,
		state.frame_rate,
		state.packet_arrival_cushion,
		state.frame_data_ready ? "true" : "false",
		state.remote_name_ready ? "true" : "false",
		state.callback_side_effects_ready ? "true" : "false",
		state.game_in_progress ? "true" : "false",
		state.pending_file_ready ? "true" : "false",
		state.use_fps_limit_disabled ? "true" : "false",
		state.message_new_game ? "true" : "false",
		state.message_argument_ready ? "true" : "false",
		state.message_type,
		state.message_argument,
		state.random_seed_ready ? "true" : "false",
		state.map_cache_ready ? "true" : "false");
	return g_browser_lanapi_live_game_start_receive_json;
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_browser_lanapi_network_update()
{
	if (!isMemoryManagerOfficiallyInited()) {
		initMemoryManager();
	}

	bool host_game_ready = false;
	bool game_start_decoded = false;
	Int game_start_active_length = 0;
	UnsignedInt game_start_addr = 0;
	UnsignedShort game_start_port = 0;
	int on_game_start_calls = 0;
	LANMessage game_start_message = {};
	char game_start_hex[(sizeof(LANMessage) * 2) + 1] = {};
	LANGameStartState before_state;
	LANGameStartState after_state;
	LANNetworkUpdateState update_state;

	{
		ScopedOriginalMemoryManager memory_manager_scope;
		ProbeLANAPI host;
		ScopedLANProbeGlobals globals(&host);
		ScopedLANGameStartGlobals game_start_globals;
		host.setLocalAddress(kLanApiRemoteIp);
		host.setIdentity(kLanApiPlayerName, kLanApiUserName, kLanApiHostName);
		probe_global_data()->m_pendingFile = AsciiString("");
		probe_global_data()->m_useFpsLimit = TRUE;
		LANGameInfo *game = create_probe_lan_game(TRUE, TRUE);
		host.installGame(game, TRUE, FALSE);
		host_game_ready = game != nullptr &&
			game->isInGame() &&
			!game->isGameInProgress() &&
			game->getLocalSlotNum() == 0 &&
			game->getIP(0) == kLanApiRemoteIp &&
			game->getLANSlot(1)->isHuman() &&
			game->getLANSlot(1)->getIP() == kLanApiJoinerIp;

		host.RequestGameStart();
		on_game_start_calls = host.onGameStartCalls();
		game_start_decoded = decode_queued_lan_message(
			host.transportForProbe(),
			LANMessage::MSG_GAME_START,
			game_start_message,
			game_start_hex,
			sizeof(game_start_hex),
			&game_start_addr,
			&game_start_port,
			&game_start_active_length);

		collect_lan_game_start_state(
			game,
			0,
			1,
			kLanApiJoinerName,
			game_start_globals,
			before_state);
		drive_lan_network_update_frame_readiness(game_start_globals, update_state, 0);
		collect_lan_game_start_state(
			game,
			0,
			1,
			kLanApiJoinerName,
			game_start_globals,
			after_state);
	}

	const bool setup_ready = host_game_ready &&
		game_start_decoded &&
		game_start_message.LANMessageType == LANMessage::MSG_GAME_START &&
		game_start_port == kLanApiLobbyPort &&
		on_game_start_calls == 1 &&
		before_state.network_setup_ready &&
		before_state.callback_side_effects_ready &&
		!before_state.frame_data_ready;
	const bool update_ready =
		update_state.command_list_injected &&
		update_state.update_driven &&
		update_state.logic_frame_before == 0 &&
		update_state.logic_frame_for_update == 1 &&
		update_state.tick_message_type == GameMessage::MSG_FRAME_TICK &&
		update_state.command_list_count_before == 1 &&
		update_state.command_list_count_after == 1 &&
		update_state.local_slot == 0 &&
		update_state.num_players == 2 &&
		update_state.run_ahead == 30 &&
		update_state.frame_rate == 30 &&
		!update_state.local_connected_before &&
		update_state.local_connected_after &&
		update_state.readiness_transition &&
		update_state.in_game_promoted;
	const bool after_ready =
		after_state.network_setup_ready &&
		after_state.callback_side_effects_ready &&
		after_state.frame_data_ready &&
		after_state.local_slot == 0 &&
		after_state.num_players == 2 &&
		after_state.run_ahead == 30 &&
		after_state.frame_rate == 30;
	const bool ok = setup_ready && update_ready && after_ready;

	std::snprintf(g_browser_lanapi_network_update_json, sizeof(g_browser_lanapi_network_update_json),
		"{\"ok\":%s,"
		"\"source\":\"GameNetwork browser LANAPI Network::update frame-readiness probe\","
		"\"lanApiReady\":%s,"
		"\"browserTransport\":\"harness relay queue\","
		"\"productionTransport\":false,"
		"\"relayTransport\":true,"
		"\"originalSetup\":\"LANAPI::RequestGameStart -> LANAPI::OnGameStart\","
		"\"originalUpdate\":\"Network::update\","
		"\"originalCommandPath\":\"Network::GetCommandsFromCommandList -> Network::processCommand\","
		"\"originalFrameReadiness\":\"Network::AllCommandsReady -> ConnectionManager::allCommandsReady -> FrameDataManager::allCommandsReady\","
		"\"originalTiming\":\"Network::timeForNewFrame\","
		"\"originalRelay\":\"Network::RelayCommandsToCommandList\","
		"\"nextRequired\":\"productionWebSocketWebRTCTransportOrTwoClientMatchSync\","
		"\"lanApi\":{\"hostGameReady\":%s,\"onGameStartCalls\":%d,"
		"\"gameStartMessageDecoded\":%s,\"messageType\":\"%s\","
		"\"activeBytes\":%d,\"remoteIp\":%u,\"localIp\":%u,\"port\":%u},"
		"\"before\":{\"network\":{\"created\":%s,\"setupReady\":%s,"
		"\"localSlot\":%d,\"numPlayers\":%d,\"runAhead\":%u,\"frameRate\":%u,"
		"\"packetArrivalCushion\":%u,\"frameDataReady\":%s,"
		"\"remoteNameReady\":%s},"
		"\"callback\":{\"sideEffectsReady\":%s,\"gameInProgress\":%s,"
		"\"pendingFileReady\":%s,\"useFpsLimitDisabled\":%s,"
		"\"messageNewGame\":%s,\"messageArgumentReady\":%s,"
		"\"messageType\":%d,\"messageArgument\":%d,"
		"\"randomSeedReady\":%s,\"mapCacheReady\":%s}},"
		"\"update\":{\"commandListInjected\":%s,\"updateDriven\":%s,"
		"\"logicFrameBefore\":%d,\"logicFrameForUpdate\":%d,"
		"\"tickMessageType\":%d,\"commandListCountBefore\":%d,"
		"\"commandListCountAfter\":%d,\"localSlot\":%d,\"numPlayers\":%d,"
		"\"runAhead\":%u,\"frameRate\":%u,\"packetArrivalCushionAfter\":%u,"
		"\"beforeFrameDataReady\":%s,\"afterFrameDataReady\":%s,"
		"\"localConnectedBefore\":%s,\"localConnectedAfter\":%s,"
		"\"readinessTransition\":%s,\"inGamePromoted\":%s},"
		"\"after\":{\"network\":{\"created\":%s,\"setupReady\":%s,"
		"\"localSlot\":%d,\"numPlayers\":%d,\"runAhead\":%u,\"frameRate\":%u,"
		"\"packetArrivalCushion\":%u,\"frameDataReady\":%s,"
		"\"remoteNameReady\":%s},"
		"\"callback\":{\"sideEffectsReady\":%s,\"gameInProgress\":%s,"
		"\"pendingFileReady\":%s,\"useFpsLimitDisabled\":%s,"
		"\"messageNewGame\":%s,\"messageArgumentReady\":%s,"
		"\"messageType\":%d,\"messageArgument\":%d,"
		"\"randomSeedReady\":%s,\"mapCacheReady\":%s}}}",
		ok ? "true" : "false",
		ok ? "true" : "false",
		host_game_ready ? "true" : "false",
		on_game_start_calls,
		game_start_decoded ? "true" : "false",
		lan_message_type_name(game_start_message.LANMessageType),
		game_start_active_length,
		game_start_addr,
		kLanApiRemoteIp,
		game_start_port,
		before_state.network_created ? "true" : "false",
		before_state.network_setup_ready ? "true" : "false",
		before_state.local_slot,
		before_state.num_players,
		before_state.run_ahead,
		before_state.frame_rate,
		before_state.packet_arrival_cushion,
		before_state.frame_data_ready ? "true" : "false",
		before_state.remote_name_ready ? "true" : "false",
		before_state.callback_side_effects_ready ? "true" : "false",
		before_state.game_in_progress ? "true" : "false",
		before_state.pending_file_ready ? "true" : "false",
		before_state.use_fps_limit_disabled ? "true" : "false",
		before_state.message_new_game ? "true" : "false",
		before_state.message_argument_ready ? "true" : "false",
		before_state.message_type,
		before_state.message_argument,
		before_state.random_seed_ready ? "true" : "false",
		before_state.map_cache_ready ? "true" : "false",
		update_state.command_list_injected ? "true" : "false",
		update_state.update_driven ? "true" : "false",
		update_state.logic_frame_before,
		update_state.logic_frame_for_update,
		update_state.tick_message_type,
		update_state.command_list_count_before,
		update_state.command_list_count_after,
		update_state.local_slot,
		update_state.num_players,
		update_state.run_ahead,
		update_state.frame_rate,
		update_state.packet_arrival_cushion_after,
		update_state.before_frame_data_ready ? "true" : "false",
		update_state.after_frame_data_ready ? "true" : "false",
		update_state.local_connected_before ? "true" : "false",
		update_state.local_connected_after ? "true" : "false",
		update_state.readiness_transition ? "true" : "false",
		update_state.in_game_promoted ? "true" : "false",
		after_state.network_created ? "true" : "false",
		after_state.network_setup_ready ? "true" : "false",
		after_state.local_slot,
		after_state.num_players,
		after_state.run_ahead,
		after_state.frame_rate,
		after_state.packet_arrival_cushion,
		after_state.frame_data_ready ? "true" : "false",
		after_state.remote_name_ready ? "true" : "false",
		after_state.callback_side_effects_ready ? "true" : "false",
		after_state.game_in_progress ? "true" : "false",
		after_state.pending_file_ready ? "true" : "false",
		after_state.use_fps_limit_disabled ? "true" : "false",
		after_state.message_new_game ? "true" : "false",
		after_state.message_argument_ready ? "true" : "false",
		after_state.message_type,
		after_state.message_argument,
		after_state.random_seed_ready ? "true" : "false",
		after_state.map_cache_ready ? "true" : "false");
	return g_browser_lanapi_network_update_json;
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_browser_network_multiframe_lockstep()
{
	if (!isMemoryManagerOfficiallyInited()) {
		initMemoryManager();
	}

	bool host_game_ready = false;
	bool game_start_decoded = false;
	Int game_start_active_length = 0;
	UnsignedInt game_start_addr = 0;
	UnsignedShort game_start_port = 0;
	int on_game_start_calls = 0;
	LANMessage game_start_message = {};
	char game_start_hex[(sizeof(LANMessage) * 2) + 1] = {};
	LANGameStartState before_state;
	LANGameStartState after_state;
	LANNetworkUpdateState frame_states[kNetworkMultiFrameCount];
	bool frame_ready[kNetworkMultiFrameCount] = {};
	FrameDataDesyncProbeState desync_state;

	{
		ScopedOriginalMemoryManager memory_manager_scope;
		ProbeLANAPI host;
		ScopedLANProbeGlobals globals(&host);
		ScopedLANGameStartGlobals game_start_globals;
		host.setLocalAddress(kLanApiRemoteIp);
		host.setIdentity(kLanApiPlayerName, kLanApiUserName, kLanApiHostName);
		probe_global_data()->m_pendingFile = AsciiString("");
		probe_global_data()->m_useFpsLimit = TRUE;
		LANGameInfo *game = create_probe_lan_game(TRUE, TRUE);
		host.installGame(game, TRUE, FALSE);
		host_game_ready = game != nullptr &&
			game->isInGame() &&
			!game->isGameInProgress() &&
			game->getLocalSlotNum() == 0 &&
			game->getIP(0) == kLanApiRemoteIp &&
			game->getLANSlot(1)->isHuman() &&
			game->getLANSlot(1)->getIP() == kLanApiJoinerIp;

		host.RequestGameStart();
		on_game_start_calls = host.onGameStartCalls();
		game_start_decoded = decode_queued_lan_message(
			host.transportForProbe(),
			LANMessage::MSG_GAME_START,
			game_start_message,
			game_start_hex,
			sizeof(game_start_hex),
			&game_start_addr,
			&game_start_port,
			&game_start_active_length);

		collect_lan_game_start_state(
			game,
			0,
			1,
			kLanApiJoinerName,
			game_start_globals,
			before_state);

		for (UnsignedInt index = 0; index < kNetworkMultiFrameCount; ++index) {
			drive_lan_network_update_frame_readiness(
				game_start_globals,
				frame_states[index],
				0,
				index + 1,
				TRUE);
		}

		collect_lan_game_start_state(
			game,
			0,
			1,
			kLanApiJoinerName,
			game_start_globals,
			after_state);
		desync_state = probe_original_frame_data_desync_states();
	}

	const bool setup_ready = host_game_ready &&
		game_start_decoded &&
		game_start_message.LANMessageType == LANMessage::MSG_GAME_START &&
		game_start_port == kLanApiLobbyPort &&
		on_game_start_calls == 1 &&
		before_state.network_setup_ready &&
		before_state.callback_side_effects_ready &&
		!before_state.frame_data_ready;
	bool frames_ready = true;
	for (UnsignedInt index = 0; index < kNetworkMultiFrameCount; ++index) {
		const LANNetworkUpdateState &state = frame_states[index];
		const Int frame = static_cast<Int>(index + 1);
		frame_ready[index] =
			state.command_list_reset_before &&
			state.command_list_injected &&
			state.update_driven &&
			state.logic_frame_before == static_cast<Int>(index) &&
			state.logic_frame_for_update == frame &&
			state.tick_message_type == GameMessage::MSG_FRAME_TICK &&
			state.command_list_count_before == 1 &&
			state.command_list_count_after == 1 &&
			state.local_slot == 0 &&
			state.num_players == 2 &&
			state.run_ahead == 30 &&
			state.frame_rate == 30 &&
			state.local_connected_after;
		if (index == 0) {
			frame_ready[index] =
				frame_ready[index] &&
				state.after_frame_data_ready &&
				!state.before_frame_data_ready &&
				!state.local_connected_before &&
				state.readiness_transition &&
				state.in_game_promoted;
		} else {
			frame_ready[index] =
				frame_ready[index] &&
				state.local_connected_before &&
				!state.readiness_transition &&
				!state.in_game_promoted;
		}
		frames_ready = frames_ready && frame_ready[index];
	}
	const bool after_ready =
		after_state.network_setup_ready &&
		after_state.callback_side_effects_ready &&
		after_state.local_slot == 0 &&
		after_state.num_players == 2 &&
		after_state.run_ahead == 30 &&
		after_state.frame_rate == 30;
	const bool desync_ready = desync_state.not_ready_ok && desync_state.resend_ok;
	const bool ok = setup_ready && frames_ready && after_ready && desync_ready;

	char frame_json[kNetworkMultiFrameCount][1600] = {};
	for (UnsignedInt index = 0; index < kNetworkMultiFrameCount; ++index) {
		const LANNetworkUpdateState &state = frame_states[index];
		std::snprintf(frame_json[index], sizeof(frame_json[index]),
			"{\"frame\":%u,\"ready\":%s,\"commandListResetBefore\":%s,"
			"\"commandListInjected\":%s,\"updateDriven\":%s,"
			"\"logicFrameBefore\":%d,\"logicFrameForUpdate\":%d,"
			"\"tickMessageType\":%d,\"commandListCountBefore\":%d,"
			"\"commandListCountAfter\":%d,\"localSlot\":%d,\"numPlayers\":%d,"
			"\"runAhead\":%u,\"frameRate\":%u,\"packetArrivalCushionAfter\":%u,"
			"\"beforeFrameDataReady\":%s,\"afterFrameDataReady\":%s,"
			"\"localConnectedBefore\":%s,\"localConnectedAfter\":%s,"
			"\"readinessTransition\":%s,\"inGamePromoted\":%s}",
			index + 1,
			frame_ready[index] ? "true" : "false",
			state.command_list_reset_before ? "true" : "false",
			state.command_list_injected ? "true" : "false",
			state.update_driven ? "true" : "false",
			state.logic_frame_before,
			state.logic_frame_for_update,
			state.tick_message_type,
			state.command_list_count_before,
			state.command_list_count_after,
			state.local_slot,
			state.num_players,
			state.run_ahead,
			state.frame_rate,
			state.packet_arrival_cushion_after,
			state.before_frame_data_ready ? "true" : "false",
			state.after_frame_data_ready ? "true" : "false",
			state.local_connected_before ? "true" : "false",
			state.local_connected_after ? "true" : "false",
			state.readiness_transition ? "true" : "false",
			state.in_game_promoted ? "true" : "false");
	}

	std::snprintf(g_browser_network_multiframe_lockstep_json, sizeof(g_browser_network_multiframe_lockstep_json),
		"{\"ok\":%s,"
		"\"source\":\"GameNetwork browser multi-frame Network::update/desync probe\","
		"\"lanApiReady\":%s,"
		"\"browserTransport\":\"harness relay queue\","
		"\"productionTransport\":false,"
		"\"relayTransport\":true,"
		"\"framesDriven\":%u,"
		"\"originalSetup\":\"LANAPI::RequestGameStart -> LANAPI::OnGameStart\","
		"\"originalUpdate\":\"Network::update\","
		"\"originalCommandPath\":\"Network::GetCommandsFromCommandList -> Network::processCommand\","
		"\"originalFrameReadiness\":\"Network::AllCommandsReady -> ConnectionManager::allCommandsReady -> FrameDataManager::allCommandsReady\","
		"\"originalTiming\":\"Network::timeForNewFrame\","
		"\"originalRelay\":\"Network::RelayCommandsToCommandList\","
		"\"originalDesync\":\"FrameData::allCommandsReady FRAMEDATA_NOTREADY/FRAMEDATA_RESEND\","
		"\"nextRequired\":\"productionWebSocketWebRTCTransportOrTwoClientMatchSync\","
		"\"lanApi\":{\"hostGameReady\":%s,\"onGameStartCalls\":%d,"
		"\"gameStartMessageDecoded\":%s,\"messageType\":\"%s\","
		"\"activeBytes\":%d,\"remoteIp\":%u,\"localIp\":%u,\"port\":%u},"
		"\"before\":{\"network\":{\"created\":%s,\"setupReady\":%s,"
		"\"localSlot\":%d,\"numPlayers\":%d,\"runAhead\":%u,\"frameRate\":%u,"
		"\"packetArrivalCushion\":%u,\"frameDataReady\":%s,"
		"\"remoteNameReady\":%s},"
		"\"callback\":{\"sideEffectsReady\":%s,\"gameInProgress\":%s,"
		"\"pendingFileReady\":%s,\"useFpsLimitDisabled\":%s,"
		"\"messageNewGame\":%s,\"messageArgumentReady\":%s,"
		"\"messageType\":%d,\"messageArgument\":%d,"
		"\"randomSeedReady\":%s,\"mapCacheReady\":%s}},"
		"\"frames\":[%s,%s,%s],"
		"\"after\":{\"network\":{\"created\":%s,\"setupReady\":%s,"
		"\"localSlot\":%d,\"numPlayers\":%d,\"runAhead\":%u,\"frameRate\":%u,"
		"\"packetArrivalCushion\":%u,\"frameDataReady\":%s,"
		"\"remoteNameReady\":%s},"
		"\"callback\":{\"sideEffectsReady\":%s,\"gameInProgress\":%s,"
		"\"pendingFileReady\":%s,\"useFpsLimitDisabled\":%s,"
		"\"messageNewGame\":%s,\"messageArgumentReady\":%s,"
		"\"messageType\":%d,\"messageArgument\":%d,"
		"\"randomSeedReady\":%s,\"mapCacheReady\":%s}},"
		"\"desync\":{\"ok\":%s,\"source\":\"FrameData::allCommandsReady\","
		"\"frameDataNotReady\":%d,\"frameDataResend\":%d,\"frameDataReady\":%d,"
		"\"notReady\":{\"ok\":%s,\"frame\":%u,\"result\":%d,"
		"\"commandCount\":%u,\"frameCommandCount\":%u},"
		"\"resend\":{\"ok\":%s,\"frame\":%u,\"result\":%d,"
		"\"commandType\":\"NETCOMMANDTYPE_RUNAHEAD\",\"commandTypeValue\":%d,"
		"\"commandInserted\":%s,\"commandCountBefore\":%u,"
		"\"frameCommandCountBefore\":%u,\"commandCountAfter\":%u,"
		"\"frameCommandCountAfter\":%u}}}",
		ok ? "true" : "false",
		ok ? "true" : "false",
		kNetworkMultiFrameCount,
		host_game_ready ? "true" : "false",
		on_game_start_calls,
		game_start_decoded ? "true" : "false",
		lan_message_type_name(game_start_message.LANMessageType),
		game_start_active_length,
		game_start_addr,
		kLanApiRemoteIp,
		game_start_port,
		before_state.network_created ? "true" : "false",
		before_state.network_setup_ready ? "true" : "false",
		before_state.local_slot,
		before_state.num_players,
		before_state.run_ahead,
		before_state.frame_rate,
		before_state.packet_arrival_cushion,
		before_state.frame_data_ready ? "true" : "false",
		before_state.remote_name_ready ? "true" : "false",
		before_state.callback_side_effects_ready ? "true" : "false",
		before_state.game_in_progress ? "true" : "false",
		before_state.pending_file_ready ? "true" : "false",
		before_state.use_fps_limit_disabled ? "true" : "false",
		before_state.message_new_game ? "true" : "false",
		before_state.message_argument_ready ? "true" : "false",
		before_state.message_type,
		before_state.message_argument,
		before_state.random_seed_ready ? "true" : "false",
		before_state.map_cache_ready ? "true" : "false",
		frame_json[0],
		frame_json[1],
		frame_json[2],
		after_state.network_created ? "true" : "false",
		after_state.network_setup_ready ? "true" : "false",
		after_state.local_slot,
		after_state.num_players,
		after_state.run_ahead,
		after_state.frame_rate,
		after_state.packet_arrival_cushion,
		after_state.frame_data_ready ? "true" : "false",
		after_state.remote_name_ready ? "true" : "false",
		after_state.callback_side_effects_ready ? "true" : "false",
		after_state.game_in_progress ? "true" : "false",
		after_state.pending_file_ready ? "true" : "false",
		after_state.use_fps_limit_disabled ? "true" : "false",
		after_state.message_new_game ? "true" : "false",
		after_state.message_argument_ready ? "true" : "false",
		after_state.message_type,
		after_state.message_argument,
		after_state.random_seed_ready ? "true" : "false",
		after_state.map_cache_ready ? "true" : "false",
		desync_ready ? "true" : "false",
		FRAMEDATA_NOTREADY,
		FRAMEDATA_RESEND,
		FRAMEDATA_READY,
		desync_state.not_ready_ok ? "true" : "false",
		desync_state.not_ready_frame,
		desync_state.not_ready_result,
		desync_state.not_ready_command_count,
		desync_state.not_ready_frame_command_count,
		desync_state.resend_ok ? "true" : "false",
		desync_state.resend_frame,
		desync_state.resend_result,
		desync_state.resend_command_type,
		desync_state.extra_command_inserted ? "true" : "false",
		desync_state.resend_command_count_before,
		desync_state.resend_frame_command_count_before,
		desync_state.resend_command_count_after,
		desync_state.resend_frame_command_count_after);
	return g_browser_network_multiframe_lockstep_json;
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
		result.lan_host_dispatch_ok = probe_lan_host_dispatch();
		result.ok =
			result.command_ids_ok &&
			result.frame_data_ok &&
			result.frame_data_manager_ok &&
			result.packet_round_trip_ok &&
			result.lan_host_dispatch_ok;
	} catch (...) {
		result.ok = false;
	}
	return result;
}
