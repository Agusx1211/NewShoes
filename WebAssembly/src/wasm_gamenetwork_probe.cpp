#include "wasm_gamenetwork_probe.h"

#include "PreRTS.h"

#include "wasm_memory_manager_scope.h"

#include <cstdio>
#include <cstring>
#include <string>

#include "Common/GameMemory.h"
#include "Common/GameState.h"
#include "Common/GlobalData.h"
#include "Common/Player.h"
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
#include "GameNetwork/Transport.h"

#define private public
#include "GameNetwork/ConnectionManager.h"
#undef private

#include "GameNetwork/LANAPI.h"
#include "GameNetwork/LANAPICallbacks.h"
#include "GameNetwork/LANGameInfo.h"
#include "GameNetwork/GameSpy/ThreadUtils.h"
#include "GameNetwork/NetworkUtil.h"
#include "GameLogic/GameLogic.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

class PingerInterface;
class GameSpyStagingRoom;

DisconnectMenu *TheDisconnectMenu __attribute__((weak)) = nullptr;
GameState *TheGameState __attribute__((weak)) = nullptr;
NetworkInterface *TheNetwork __attribute__((weak)) = nullptr;
PingerInterface *ThePinger __attribute__((weak)) = nullptr;
RecorderClass *TheRecorder __attribute__((weak)) = nullptr;
GameSpyStagingRoom *TheGameSpyGame __attribute__((weak)) = nullptr;
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
__attribute__((weak)) const MapMetaData *MapCache::findMap(AsciiString)
{
	return nullptr;
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
__attribute__((weak)) void updateGameOptions()
{
}
__attribute__((weak)) void HideGameInfoWindow(Bool)
{
}
__attribute__((weak)) void LANEnableStartButton(Bool)
{
}
__attribute__((weak)) NetworkInterface *NetworkInterface::createNetwork()
{
	return nullptr;
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
__attribute__((weak)) void LANPreferences::setSuperweaponRestricted(Bool)
{
}
__attribute__((weak)) void LANPreferences::setStartingCash(const Money&)
{
}
__attribute__((weak)) LoadScreen::LoadScreen() :
	m_loadScreen(nullptr)
{
}
__attribute__((weak)) LoadScreen::~LoadScreen()
{
}
__attribute__((weak)) void LoadScreen::update(Int)
{
}
__attribute__((weak)) MapTransferLoadScreen::MapTransferLoadScreen()
{
}
__attribute__((weak)) MapTransferLoadScreen::~MapTransferLoadScreen()
{
}
__attribute__((weak)) void MapTransferLoadScreen::init(GameInfo *)
{
}
__attribute__((weak)) void MapTransferLoadScreen::reset()
{
}
__attribute__((weak)) void MapTransferLoadScreen::update(Int)
{
}
__attribute__((weak)) void MapTransferLoadScreen::processProgress(Int, Int, AsciiString)
{
}
__attribute__((weak)) void MapTransferLoadScreen::processTimeout(Int)
{
}
__attribute__((weak)) void MapTransferLoadScreen::setCurrentFilename(AsciiString)
{
}
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

namespace {
char g_browser_network_relay_build_json[4096] = {};
char g_browser_network_relay_receive_json[4096] = {};
char g_browser_network_relay_packet_hex[(MAX_PACKET_SIZE * 2) + 1] = {};
char g_browser_network_transport_build_json[4096] = {};
char g_browser_network_transport_receive_json[8192] = {};
char g_browser_network_transport_packet_hex[(MAX_PACKET_SIZE * 2) + 1] = {};
char g_browser_lanapi_build_json[8192] = {};
char g_browser_lanapi_receive_json[8192] = {};
char g_browser_lanapi_packet_hex[(sizeof(LANMessage) * 2) + 1] = {};
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
constexpr UnsignedInt kLanApiLocalIp = 0x7f000001;
constexpr UnsignedInt kLanApiRemoteIp = 0x7f000002;
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
constexpr const char *kLanApiUserName = "browser-host";
constexpr const char *kLanApiHostName = "browser-client-0";

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

private:
	int m_onGameListCalls = 0;
	LANGameInfo *m_lastGameList = nullptr;
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
		global_data.m_networkCushionHistoryLength = 10;
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
