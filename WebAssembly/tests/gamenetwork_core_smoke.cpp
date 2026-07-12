#include <cmath>
#include <cstdio>
#include <cstring>
#include <cwchar>

#include "PreRTS.h"

#include "Common/CRC.h"
#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "GameNetwork/Connection.h"
#include "GameNetwork/FileTransfer.h"
#include "GameNetwork/FrameData.h"
#include "GameNetwork/FrameDataManager.h"
#include "GameNetwork/FrameMetrics.h"
#include "GameNetwork/NetCommandList.h"
#include "GameNetwork/NetCommandMsg.h"
#include "GameNetwork/NetCommandRef.h"
#include "GameNetwork/NetCommandWrapperList.h"
#include "GameNetwork/NetPacket.h"
#include "GameNetwork/NetworkUtil.h"
#include "GameNetwork/Transport.h"
#include "GameNetwork/User.h"
#include "winsock2.h"

class Display;
HWND ApplicationHWnd = nullptr;
Display *TheDisplay = nullptr;
SubsystemInterfaceList *TheSubsystemList = nullptr;

namespace {
bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::fprintf(stderr, "%s\n", message);
		return false;
	}
	return true;
}

bool expectAscii(const AsciiString &actual, const char *expected, const char *message)
{
	return expect(std::strcmp(actual.str(), expected) == 0, message);
}

bool expectLittleEndian16(const UnsignedByte *bytes, UnsignedShort value, const char *message)
{
	return expect(bytes[0] == static_cast<UnsignedByte>(value & 0xff) &&
			bytes[1] == static_cast<UnsignedByte>((value >> 8) & 0xff),
		message);
}

bool expectLittleEndian32(const UnsignedByte *bytes, UnsignedInt value, const char *message)
{
	return expect(bytes[0] == static_cast<UnsignedByte>(value & 0xff) &&
			bytes[1] == static_cast<UnsignedByte>((value >> 8) & 0xff) &&
			bytes[2] == static_cast<UnsignedByte>((value >> 16) & 0xff) &&
			bytes[3] == static_cast<UnsignedByte>((value >> 24) & 0xff),
		message);
}

UnsignedInt littleEndianWordAt(const UnsignedByte *bytes)
{
	return static_cast<UnsignedInt>(bytes[0]) |
		(static_cast<UnsignedInt>(bytes[1]) << 8) |
		(static_cast<UnsignedInt>(bytes[2]) << 16) |
		(static_cast<UnsignedInt>(bytes[3]) << 24);
}

bool expectBigEndian32(const UnsignedByte *bytes, UnsignedInt value, const char *message)
{
	return expect(bytes[0] == static_cast<UnsignedByte>((value >> 24) & 0xff) &&
			bytes[1] == static_cast<UnsignedByte>((value >> 16) & 0xff) &&
			bytes[2] == static_cast<UnsignedByte>((value >> 8) & 0xff) &&
			bytes[3] == static_cast<UnsignedByte>(value & 0xff),
		message);
}

bool expectEncryptedTransportWord(const TransportMessage &encrypted, const TransportMessage &decoded,
	Int offset, UnsignedInt mask, const char *message)
{
	const auto *wire = reinterpret_cast<const UnsignedByte *>(&encrypted);
	const auto *plain = reinterpret_cast<const UnsignedByte *>(&decoded);
	return expectBigEndian32(wire + offset, littleEndianWordAt(plain + offset) ^ mask, message);
}

class InspectableConnection : public Connection
{
public:
	void makeRetryEligible()
	{
		// Original retry logic compares elapsed time with m_retryTime; this
		// avoids sleeping in the smoke while still exercising the retry branch.
		m_retryTime = -1;
	}
};

bool transportMessageHasValidCrc(const TransportMessage &message)
{
	CRC crc;
	crc.computeCRC(&message.header.magic,
		message.length + sizeof(TransportMessageHeader) - sizeof(UnsignedInt));
	return crc.get() == message.header.crc;
}

void decryptTransportMessage(TransportMessage &message)
{
	UnsignedInt mask = 0x0000fade;
	UnsignedByte *bytes = reinterpret_cast<UnsignedByte *>(&message);
	const Int encrypted_length = message.length + sizeof(TransportMessageHeader);

	for (Int offset = 0; offset + static_cast<Int>(sizeof(UnsignedInt)) <= encrypted_length;
		 offset += sizeof(UnsignedInt)) {
		UnsignedInt word = 0;
		std::memcpy(&word, bytes + offset, sizeof(word));
		word = htonl(word);
		word ^= mask;
		std::memcpy(bytes + offset, &word, sizeof(word));
		mask += 0x00000321;
	}
}

NetCommandRef *roundTripCommand(NetCommandMsg *msg, UnsignedByte relay, const char *context)
{
	NetPacket *packet = newInstance(NetPacket);
	NetCommandRef *ref = NEW_NETCOMMANDREF(msg);
	ref->setRelay(relay);
	const Bool added = packet->addCommand(ref);
	ref->deleteInstance();
	msg->detach();

	if (!expect(added, context) ||
		!expect(packet->getNumCommands() == 1, "NetPacket did not count the encoded command") ||
		!expect(packet->getLength() > 0 && packet->getLength() <= MAX_PACKET_SIZE,
			"NetPacket encoded length out of range")) {
		packet->deleteInstance();
		return nullptr;
	}

	NetCommandRef *parsed = NetPacket::ConstructNetCommandMsgFromRawData(
		packet->getData(), static_cast<UnsignedShort>(packet->getLength()));
	packet->deleteInstance();
	if (!expect(parsed != nullptr, "NetPacket did not parse encoded command")) {
		return nullptr;
	}
	if (!expect(parsed->getRelay() == relay, "NetPacket did not preserve relay mask")) {
		parsed->deleteInstance();
		return nullptr;
	}
	return parsed;
}

bool buildPacketPayload(NetCommandMsg *msg, UnsignedByte relay, UnsignedByte *payload, Int &payload_length,
	const char *context)
{
	NetPacket *packet = newInstance(NetPacket);
	NetCommandRef *ref = NEW_NETCOMMANDREF(msg);
	ref->setRelay(relay);
	const Bool added = packet->addCommand(ref);
	ref->deleteInstance();
	msg->detach();

	if (!expect(added, context) ||
		!expect(packet->getNumCommands() == 1, "NetPacket did not count payload command") ||
		!expect(packet->getLength() > 0 && packet->getLength() <= MAX_PACKET_SIZE,
			"NetPacket payload length out of range")) {
		packet->deleteInstance();
		return false;
	}

	payload_length = packet->getLength();
	std::memcpy(payload, packet->getData(), payload_length);
	packet->deleteInstance();
	return true;
}

NetCommandRef *addAndRelease(NetCommandList &list, NetCommandMsg *msg)
{
	NetCommandRef *ref = list.addMessage(msg);
	msg->detach();
	return ref;
}

NetWrapperCommandMsg *makeWrapperChunk(UnsignedShort id, UnsignedShort wrapped_id, UnsignedByte player_id,
	UnsignedInt chunk_number, UnsignedInt num_chunks, UnsignedByte *payload, UnsignedInt payload_length,
	UnsignedInt data_offset, UnsignedInt total_length)
{
	NetWrapperCommandMsg *wrapper = newInstance(NetWrapperCommandMsg);
	wrapper->setPlayerID(player_id);
	wrapper->setID(id);
	wrapper->setWrappedCommandID(wrapped_id);
	wrapper->setChunkNumber(chunk_number);
	wrapper->setNumChunks(num_chunks);
	wrapper->setDataOffset(data_offset);
	wrapper->setTotalDataLength(total_length);
	wrapper->setData(payload + data_offset, payload_length);
	return wrapper;
}

void processAndReleaseWrapper(NetCommandWrapperList &list, NetWrapperCommandMsg *wrapper)
{
	NetCommandRef *ref = NEW_NETCOMMANDREF(wrapper);
	list.processWrapper(ref);
	ref->deleteInstance();
	wrapper->detach();
}

bool exerciseNetworkUtil()
{
	const UnsignedShort first = GenerateNextCommandID();
	const UnsignedShort second = GenerateNextCommandID();
#ifdef __EMSCRIPTEN__
	const Int expected_min_run_ahead = 4;
#else
	const Int expected_min_run_ahead = 10;
#endif

	return expect(static_cast<UnsignedShort>(first + 1) == second, "GenerateNextCommandID did not advance") &&
		expect(DoesCommandRequireACommandID(NETCOMMANDTYPE_GAMECOMMAND), "game command should require ids") &&
		expect(!DoesCommandRequireACommandID(NETCOMMANDTYPE_ACKBOTH), "ackboth should not require ids") &&
		expect(IsCommandSynchronized(NETCOMMANDTYPE_RUNAHEAD), "runahead should be synchronized") &&
		expect(!IsCommandSynchronized(NETCOMMANDTYPE_CHAT), "chat should not be synchronized") &&
		expect(std::strcmp(GetAsciiNetCommandType(NETCOMMANDTYPE_FRAMEINFO).str(), "NETCOMMANDTYPE_FRAMEINFO") == 0,
			"frameinfo command name failed") &&
		expect(std::strcmp(GetAsciiNetCommandType(NETCOMMANDTYPE_MAX).str(), "UNKNOWN") == 0,
			"unknown command name failed") &&
		expect(MAX_FRAMES_AHEAD == 128 && MIN_RUNAHEAD == expected_min_run_ahead && FRAME_DATA_LENGTH == 258 && FRAMES_TO_KEEP == 65,
			"network frame globals changed");
}

bool exerciseBrowserConnectionGrouping()
{
	Connection *connection = newInstance(Connection);
	connection->init();
	connection->setFrameGrouping(250);
#ifdef __EMSCRIPTEN__
	const bool ok = expect(connection->getBrowserDiagnosticFrameGrouping() == 33,
		"browser connection grouping exceeded one 30 Hz logic tick");
#else
	const bool ok = true;
#endif
	connection->deleteInstance();
	return ok;
}

bool exerciseFrameData()
{
	FrameData data;
	data.init();
	data.setFrame(77);
	data.setFrameCommandCount(0);

	const bool frame_data_ok =
		expect(data.getFrame() == 77, "FrameData frame assignment failed") &&
		expect(data.getCommandCount() == 0, "FrameData command count default failed") &&
		expect(data.getFrameCommandCount() == 0, "FrameData frame command count failed") &&
		expect(data.allCommandsReady(FALSE) == FRAMEDATA_READY, "FrameData ready state failed") &&
		expect(data.getCommandList() != nullptr, "FrameData command list allocation failed");
	data.destroyGameMessages();
	data.reset();

	if (!frame_data_ok) {
		return false;
	}

	FrameDataManager *manager = newInstance(FrameDataManager)(TRUE);
	if (!expect(manager != nullptr, "FrameDataManager allocation failed")) {
		return false;
	}
	manager->init();
	const bool manager_ok =
		expect(manager->getCommandCount(0) == 0, "FrameDataManager local command count failed") &&
		expect(manager->getFrameCommandCount(0) == 0, "FrameDataManager local frame command count failed");
	manager->resetFrame(3, TRUE);
	manager->zeroFrames(3, 2);
	manager->setQuitFrame(42);

	const bool ready_ok = manager_ok &&
		expect(manager->getQuitFrame() == 42, "FrameDataManager quit frame failed") &&
		expect(manager->getIsQuitting(), "FrameDataManager quit flag failed") &&
		expect(manager->allCommandsReady(3, FALSE) == FRAMEDATA_READY, "FrameDataManager ready state failed");
	manager->deleteInstance();
	return ready_ok;
}

bool exerciseNetCommandList()
{
	NetCommandList *list = newInstance(NetCommandList);
	list->init();

	NetFrameCommandMsg *late = newInstance(NetFrameCommandMsg);
	late->setPlayerID(2);
	late->setID(20);
	late->setExecutionFrame(120);
	late->setCommandCount(3);

	NetFrameCommandMsg *early = newInstance(NetFrameCommandMsg);
	early->setPlayerID(2);
	early->setID(10);
	early->setExecutionFrame(110);
	early->setCommandCount(1);

	NetFrameCommandMsg *duplicate = newInstance(NetFrameCommandMsg);
	duplicate->setPlayerID(2);
	duplicate->setID(10);
	duplicate->setExecutionFrame(111);
	duplicate->setCommandCount(7);

	NetCommandRef *late_ref = addAndRelease(*list, late);
	NetCommandRef *early_ref = addAndRelease(*list, early);
	NetCommandRef *duplicate_ref = addAndRelease(*list, duplicate);
	const bool inserted_ok =
		expect(late_ref != nullptr, "NetCommandList did not insert late frame") &&
		expect(early_ref != nullptr, "NetCommandList did not insert early frame") &&
		expect(duplicate_ref == nullptr, "NetCommandList accepted duplicate frame id") &&
		expect(list->length() == 2, "NetCommandList length changed after duplicate");

	NetCommandRef *first = list->getFirstMessage();
	const bool order_ok =
		expect(first != nullptr, "NetCommandList first message missing") &&
		expect(first->getCommand()->getID() == 10, "NetCommandList did not sort by command id") &&
		expect(first->getNext() != nullptr && first->getNext()->getCommand()->getID() == 20,
			"NetCommandList second message missing") &&
		expect(list->findMessage(20, 2) == first->getNext(), "NetCommandList find by id/player failed");

	list->reset();
	const bool reset_ok = expect(list->length() == 0, "NetCommandList reset failed");
	list->deleteInstance();
	return inserted_ok && order_ok && reset_ok;
}

bool exerciseNetPacketRoundTrip()
{
	NetFrameCommandMsg *frame = newInstance(NetFrameCommandMsg);
	frame->setExecutionFrame(1234);
	frame->setPlayerID(3);
	frame->setID(42);
	frame->setCommandCount(5);
	NetCommandRef *frame_ref = roundTripCommand(frame, 0x0f, "NetPacket did not add frame command");
	if (frame_ref == nullptr) {
		return false;
	}
	NetFrameCommandMsg *parsed_frame = static_cast<NetFrameCommandMsg *>(frame_ref->getCommand());
	const bool frame_ok =
		expect(parsed_frame->getNetCommandType() == NETCOMMANDTYPE_FRAMEINFO, "Frame command type changed") &&
		expect(parsed_frame->getExecutionFrame() == 1234, "Frame execution frame changed") &&
		expect(parsed_frame->getPlayerID() == 3, "Frame player id changed") &&
		expect(parsed_frame->getID() == 42, "Frame command id changed") &&
		expect(parsed_frame->getCommandCount() == 5, "Frame command count changed");
	frame_ref->deleteInstance();

	NetRunAheadCommandMsg *run_ahead = newInstance(NetRunAheadCommandMsg);
	run_ahead->setExecutionFrame(2000);
	run_ahead->setPlayerID(4);
	run_ahead->setID(43);
	run_ahead->setRunAhead(27);
	run_ahead->setFrameRate(31);
	NetCommandRef *run_ref = roundTripCommand(run_ahead, 0x03, "NetPacket did not add run-ahead command");
	if (run_ref == nullptr) {
		return false;
	}
	NetRunAheadCommandMsg *parsed_run = static_cast<NetRunAheadCommandMsg *>(run_ref->getCommand());
	const bool run_ok =
		expect(parsed_run->getNetCommandType() == NETCOMMANDTYPE_RUNAHEAD, "Run-ahead command type changed") &&
		expect(parsed_run->getExecutionFrame() == 2000, "Run-ahead execution frame changed") &&
		expect(parsed_run->getPlayerID() == 4, "Run-ahead player id changed") &&
		expect(parsed_run->getID() == 43, "Run-ahead command id changed") &&
		expect(parsed_run->getRunAhead() == 27, "Run-ahead value changed") &&
		expect(parsed_run->getFrameRate() == 31, "Run-ahead frame rate changed");
	run_ref->deleteInstance();

	NetChatCommandMsg *chat = newInstance(NetChatCommandMsg);
	chat->setExecutionFrame(3000);
	chat->setPlayerID(5);
	chat->setID(44);
	chat->setPlayerMask(0x35);
	chat->setText(UnicodeString(L"status"));
	NetCommandRef *chat_ref = roundTripCommand(chat, 0x07, "NetPacket did not add chat command");
	if (chat_ref == nullptr) {
		return false;
	}
	NetChatCommandMsg *parsed_chat = static_cast<NetChatCommandMsg *>(chat_ref->getCommand());
	const bool chat_ok =
		expect(parsed_chat->getNetCommandType() == NETCOMMANDTYPE_CHAT, "Chat command type changed") &&
		expect(parsed_chat->getExecutionFrame() == 3000, "Chat execution frame changed") &&
		expect(parsed_chat->getPlayerID() == 5, "Chat player id changed") &&
		expect(parsed_chat->getID() == 44, "Chat command id changed") &&
		expect(parsed_chat->getPlayerMask() == 0x35, "Chat player mask changed") &&
		expect(std::wcscmp(parsed_chat->getText().str(), L"status") == 0, "Chat text changed");
	chat_ref->deleteInstance();

	NetProgressCommandMsg *progress = newInstance(NetProgressCommandMsg);
	progress->setPlayerID(6);
	progress->setPercentage(88);
	NetCommandRef *progress_ref = roundTripCommand(progress, 0x01, "NetPacket did not add progress command");
	if (progress_ref == nullptr) {
		return false;
	}
	NetProgressCommandMsg *parsed_progress = static_cast<NetProgressCommandMsg *>(progress_ref->getCommand());
	const bool progress_ok =
		expect(parsed_progress->getNetCommandType() == NETCOMMANDTYPE_PROGRESS, "Progress command type changed") &&
		expect(parsed_progress->getPlayerID() == 6, "Progress player id changed") &&
		expect(parsed_progress->getPercentage() == 88, "Progress percentage changed");
	progress_ref->deleteInstance();

	NetFileProgressCommandMsg *file_progress = newInstance(NetFileProgressCommandMsg);
	file_progress->setPlayerID(7);
	file_progress->setID(45);
	file_progress->setFileID(321);
	file_progress->setProgress(654);
	NetCommandRef *file_ref = roundTripCommand(file_progress, 0x02, "NetPacket did not add file-progress command");
	if (file_ref == nullptr) {
		return false;
	}
	NetFileProgressCommandMsg *parsed_file = static_cast<NetFileProgressCommandMsg *>(file_ref->getCommand());
	const bool file_ok =
		expect(parsed_file->getNetCommandType() == NETCOMMANDTYPE_FILEPROGRESS,
			"File-progress command type changed") &&
		expect(parsed_file->getPlayerID() == 7, "File-progress player id changed") &&
		expect(parsed_file->getID() == 45, "File-progress command id changed") &&
		expect(parsed_file->getFileID() == 321, "File-progress file id changed") &&
		expect(parsed_file->getProgress() == 654, "File-progress value changed");
	file_ref->deleteInstance();

	return frame_ok && run_ok && chat_ok && progress_ok && file_ok;
}

bool exerciseNetPacketWireFormat()
{
	NetFrameCommandMsg *frame = newInstance(NetFrameCommandMsg);
	frame->setExecutionFrame(0x01020304u);
	frame->setPlayerID(0x05);
	frame->setID(0x2233);
	frame->setCommandCount(0x4455);

	UnsignedByte payload[MAX_PACKET_SIZE] = {};
	Int payload_length = 0;
	if (!buildPacketPayload(frame, 0x06, payload, payload_length,
			"NetPacket did not build frame wire payload")) {
		return false;
	}
	frame->detach();

	return expect(payload_length == 17, "Frame wire payload length changed") &&
		expect(payload[0] == 'T' && payload[1] == NETCOMMANDTYPE_FRAMEINFO,
			"Frame wire command marker changed") &&
		expect(payload[2] == 'F', "Frame wire frame marker changed") &&
		expectLittleEndian32(payload + 3, 0x01020304u, "Frame wire frame byte order changed") &&
		expect(payload[7] == 'R' && payload[8] == 0x06, "Frame wire relay changed") &&
		expect(payload[9] == 'P' && payload[10] == 0x05, "Frame wire player changed") &&
		expect(payload[11] == 'C', "Frame wire command-id marker changed") &&
		expectLittleEndian16(payload + 12, 0x2233, "Frame wire command-id byte order changed") &&
		expect(payload[14] == 'D', "Frame wire data marker changed") &&
		expectLittleEndian16(payload + 15, 0x4455, "Frame wire command-count byte order changed");
}

bool exerciseNetPacketAckRoundTrip()
{
	NetAckBothCommandMsg *ack_both = newInstance(NetAckBothCommandMsg);
	ack_both->setPlayerID(2);
	ack_both->setCommandID(901);
	ack_both->setOriginalPlayerID(7);
	NetCommandRef *ack_both_ref =
		roundTripCommand(ack_both, 0x00, "NetPacket did not add ack-both command");
	if (ack_both_ref == nullptr) {
		return false;
	}
	NetAckBothCommandMsg *parsed_ack_both =
		static_cast<NetAckBothCommandMsg *>(ack_both_ref->getCommand());
	const bool ack_both_ok =
		expect(parsed_ack_both->getNetCommandType() == NETCOMMANDTYPE_ACKBOTH,
			"Ack-both command type changed") &&
		expect(parsed_ack_both->getPlayerID() == 2, "Ack-both player id changed") &&
		expect(parsed_ack_both->getCommandID() == 901, "Ack-both command id changed") &&
		expect(parsed_ack_both->getOriginalPlayerID() == 7, "Ack-both original player changed");
	ack_both_ref->deleteInstance();

	NetAckStage1CommandMsg *ack_stage1 = newInstance(NetAckStage1CommandMsg);
	ack_stage1->setPlayerID(3);
	ack_stage1->setCommandID(902);
	ack_stage1->setOriginalPlayerID(8);
	NetCommandRef *ack_stage1_ref =
		roundTripCommand(ack_stage1, 0x00, "NetPacket did not add ack-stage1 command");
	if (ack_stage1_ref == nullptr) {
		return false;
	}
	NetAckStage1CommandMsg *parsed_ack_stage1 =
		static_cast<NetAckStage1CommandMsg *>(ack_stage1_ref->getCommand());
	const bool ack_stage1_ok =
		expect(parsed_ack_stage1->getNetCommandType() == NETCOMMANDTYPE_ACKSTAGE1,
			"Ack-stage1 command type changed") &&
		expect(parsed_ack_stage1->getPlayerID() == 3, "Ack-stage1 player id changed") &&
		expect(parsed_ack_stage1->getCommandID() == 902, "Ack-stage1 command id changed") &&
		expect(parsed_ack_stage1->getOriginalPlayerID() == 8, "Ack-stage1 original player changed");
	ack_stage1_ref->deleteInstance();

	NetAckStage2CommandMsg *ack_stage2 = newInstance(NetAckStage2CommandMsg);
	ack_stage2->setPlayerID(4);
	ack_stage2->setCommandID(903);
	ack_stage2->setOriginalPlayerID(9);
	NetCommandRef *ack_stage2_ref =
		roundTripCommand(ack_stage2, 0x00, "NetPacket did not add ack-stage2 command");
	if (ack_stage2_ref == nullptr) {
		return false;
	}
	NetAckStage2CommandMsg *parsed_ack_stage2 =
		static_cast<NetAckStage2CommandMsg *>(ack_stage2_ref->getCommand());
	const bool ack_stage2_ok =
		expect(parsed_ack_stage2->getNetCommandType() == NETCOMMANDTYPE_ACKSTAGE2,
			"Ack-stage2 command type changed") &&
		expect(parsed_ack_stage2->getPlayerID() == 4, "Ack-stage2 player id changed") &&
		expect(parsed_ack_stage2->getCommandID() == 903, "Ack-stage2 command id changed") &&
		expect(parsed_ack_stage2->getOriginalPlayerID() == 9, "Ack-stage2 original player changed");
	ack_stage2_ref->deleteInstance();

	return ack_both_ok && ack_stage1_ok && ack_stage2_ok;
}

bool exerciseNetPacketControlRoundTrip()
{
	NetPlayerLeaveCommandMsg *leave = newInstance(NetPlayerLeaveCommandMsg);
	leave->setExecutionFrame(3100);
	leave->setPlayerID(2);
	leave->setID(46);
	leave->setLeavingPlayerID(5);
	NetCommandRef *leave_ref = roundTripCommand(leave, 0x04, "NetPacket did not add player-leave command");
	if (leave_ref == nullptr) {
		return false;
	}
	NetPlayerLeaveCommandMsg *parsed_leave = static_cast<NetPlayerLeaveCommandMsg *>(leave_ref->getCommand());
	const bool leave_ok =
		expect(parsed_leave->getNetCommandType() == NETCOMMANDTYPE_PLAYERLEAVE,
			"Player-leave command type changed") &&
		expect(parsed_leave->getExecutionFrame() == 3100, "Player-leave execution frame changed") &&
		expect(parsed_leave->getPlayerID() == 2, "Player-leave player id changed") &&
		expect(parsed_leave->getID() == 46, "Player-leave command id changed") &&
		expect(parsed_leave->getLeavingPlayerID() == 5, "Player-leave slot changed");
	leave_ref->deleteInstance();

	NetRunAheadMetricsCommandMsg *metrics = newInstance(NetRunAheadMetricsCommandMsg);
	metrics->setPlayerID(3);
	metrics->setID(47);
	metrics->setAverageLatency(0.375f);
	metrics->setAverageFps(58);
	NetCommandRef *metrics_ref = roundTripCommand(metrics, 0x05, "NetPacket did not add run-ahead metrics command");
	if (metrics_ref == nullptr) {
		return false;
	}
	NetRunAheadMetricsCommandMsg *parsed_metrics =
		static_cast<NetRunAheadMetricsCommandMsg *>(metrics_ref->getCommand());
	const bool metrics_ok =
		expect(parsed_metrics->getNetCommandType() == NETCOMMANDTYPE_RUNAHEADMETRICS,
			"Run-ahead metrics command type changed") &&
		expect(parsed_metrics->getPlayerID() == 3, "Run-ahead metrics player id changed") &&
		expect(parsed_metrics->getID() == 47, "Run-ahead metrics command id changed") &&
		expect(std::fabs(parsed_metrics->getAverageLatency() - 0.375f) <= 0.0001f,
			"Run-ahead metrics latency changed") &&
		expect(parsed_metrics->getAverageFps() == 58, "Run-ahead metrics FPS changed");
	metrics_ref->deleteInstance();

	NetDestroyPlayerCommandMsg *destroy = newInstance(NetDestroyPlayerCommandMsg);
	destroy->setExecutionFrame(3200);
	destroy->setPlayerID(4);
	destroy->setID(48);
	destroy->setPlayerIndex(6);
	NetCommandRef *destroy_ref = roundTripCommand(destroy, 0x06, "NetPacket did not add destroy-player command");
	if (destroy_ref == nullptr) {
		return false;
	}
	NetDestroyPlayerCommandMsg *parsed_destroy =
		static_cast<NetDestroyPlayerCommandMsg *>(destroy_ref->getCommand());
	const bool destroy_ok =
		expect(parsed_destroy->getNetCommandType() == NETCOMMANDTYPE_DESTROYPLAYER,
			"Destroy-player command type changed") &&
		expect(parsed_destroy->getExecutionFrame() == 3200, "Destroy-player execution frame changed") &&
		expect(parsed_destroy->getPlayerID() == 4, "Destroy-player player id changed") &&
		expect(parsed_destroy->getID() == 48, "Destroy-player command id changed") &&
		expect(parsed_destroy->getPlayerIndex() == 6, "Destroy-player index changed");
	destroy_ref->deleteInstance();

	NetKeepAliveCommandMsg *keep_alive = newInstance(NetKeepAliveCommandMsg);
	keep_alive->setPlayerID(5);
	NetCommandRef *keep_alive_ref = roundTripCommand(keep_alive, 0x07, "NetPacket did not add keepalive command");
	if (keep_alive_ref == nullptr) {
		return false;
	}
	const bool keep_alive_ok =
		expect(keep_alive_ref->getCommand()->getNetCommandType() == NETCOMMANDTYPE_KEEPALIVE,
			"Keepalive command type changed") &&
		expect(keep_alive_ref->getCommand()->getPlayerID() == 5, "Keepalive player id changed");
	keep_alive_ref->deleteInstance();

	NetDisconnectKeepAliveCommandMsg *disconnect_keep_alive = newInstance(NetDisconnectKeepAliveCommandMsg);
	disconnect_keep_alive->setPlayerID(6);
	NetCommandRef *disconnect_keep_alive_ref =
		roundTripCommand(disconnect_keep_alive, 0x08, "NetPacket did not add disconnect-keepalive command");
	if (disconnect_keep_alive_ref == nullptr) {
		return false;
	}
	const bool disconnect_keep_alive_ok =
		expect(disconnect_keep_alive_ref->getCommand()->getNetCommandType() ==
				NETCOMMANDTYPE_DISCONNECTKEEPALIVE,
			"Disconnect-keepalive command type changed") &&
		expect(disconnect_keep_alive_ref->getCommand()->getPlayerID() == 6,
			"Disconnect-keepalive player id changed");
	disconnect_keep_alive_ref->deleteInstance();

	NetDisconnectPlayerCommandMsg *disconnect_player = newInstance(NetDisconnectPlayerCommandMsg);
	disconnect_player->setPlayerID(7);
	disconnect_player->setID(49);
	disconnect_player->setDisconnectSlot(3);
	disconnect_player->setDisconnectFrame(3300);
	NetCommandRef *disconnect_player_ref =
		roundTripCommand(disconnect_player, 0x09, "NetPacket did not add disconnect-player command");
	if (disconnect_player_ref == nullptr) {
		return false;
	}
	NetDisconnectPlayerCommandMsg *parsed_disconnect_player =
		static_cast<NetDisconnectPlayerCommandMsg *>(disconnect_player_ref->getCommand());
	const bool disconnect_player_ok =
		expect(parsed_disconnect_player->getNetCommandType() == NETCOMMANDTYPE_DISCONNECTPLAYER,
			"Disconnect-player command type changed") &&
		expect(parsed_disconnect_player->getPlayerID() == 7, "Disconnect-player player id changed") &&
		expect(parsed_disconnect_player->getID() == 49, "Disconnect-player command id changed") &&
		expect(parsed_disconnect_player->getDisconnectSlot() == 3, "Disconnect-player slot changed") &&
		expect(parsed_disconnect_player->getDisconnectFrame() == 3300,
			"Disconnect-player frame changed");
	disconnect_player_ref->deleteInstance();

	NetPacketRouterQueryCommandMsg *router_query = newInstance(NetPacketRouterQueryCommandMsg);
	router_query->setPlayerID(8);
	NetCommandRef *router_query_ref =
		roundTripCommand(router_query, 0x0a, "NetPacket did not add router-query command");
	if (router_query_ref == nullptr) {
		return false;
	}
	const bool router_query_ok =
		expect(router_query_ref->getCommand()->getNetCommandType() == NETCOMMANDTYPE_PACKETROUTERQUERY,
			"Router-query command type changed") &&
		expect(router_query_ref->getCommand()->getPlayerID() == 8, "Router-query player id changed");
	router_query_ref->deleteInstance();

	NetPacketRouterAckCommandMsg *router_ack = newInstance(NetPacketRouterAckCommandMsg);
	router_ack->setPlayerID(9);
	NetCommandRef *router_ack_ref =
		roundTripCommand(router_ack, 0x0b, "NetPacket did not add router-ack command");
	if (router_ack_ref == nullptr) {
		return false;
	}
	const bool router_ack_ok =
		expect(router_ack_ref->getCommand()->getNetCommandType() == NETCOMMANDTYPE_PACKETROUTERACK,
			"Router-ack command type changed") &&
		expect(router_ack_ref->getCommand()->getPlayerID() == 9, "Router-ack player id changed");
	router_ack_ref->deleteInstance();

	NetDisconnectChatCommandMsg *disconnect_chat = newInstance(NetDisconnectChatCommandMsg);
	disconnect_chat->setPlayerID(10);
	disconnect_chat->setText(UnicodeString(L"drop"));
	NetCommandRef *disconnect_chat_ref =
		roundTripCommand(disconnect_chat, 0x0c, "NetPacket did not add disconnect-chat command");
	if (disconnect_chat_ref == nullptr) {
		return false;
	}
	NetDisconnectChatCommandMsg *parsed_disconnect_chat =
		static_cast<NetDisconnectChatCommandMsg *>(disconnect_chat_ref->getCommand());
	const bool disconnect_chat_ok =
		expect(parsed_disconnect_chat->getNetCommandType() == NETCOMMANDTYPE_DISCONNECTCHAT,
			"Disconnect-chat command type changed") &&
		expect(parsed_disconnect_chat->getPlayerID() == 10, "Disconnect-chat player id changed") &&
		expect(std::wcscmp(parsed_disconnect_chat->getText().str(), L"drop") == 0,
			"Disconnect-chat text changed");
	disconnect_chat_ref->deleteInstance();

	NetDisconnectVoteCommandMsg *disconnect_vote = newInstance(NetDisconnectVoteCommandMsg);
	disconnect_vote->setPlayerID(11);
	disconnect_vote->setID(50);
	disconnect_vote->setSlot(4);
	disconnect_vote->setVoteFrame(3400);
	NetCommandRef *disconnect_vote_ref =
		roundTripCommand(disconnect_vote, 0x0d, "NetPacket did not add disconnect-vote command");
	if (disconnect_vote_ref == nullptr) {
		return false;
	}
	NetDisconnectVoteCommandMsg *parsed_disconnect_vote =
		static_cast<NetDisconnectVoteCommandMsg *>(disconnect_vote_ref->getCommand());
	const bool disconnect_vote_ok =
		expect(parsed_disconnect_vote->getNetCommandType() == NETCOMMANDTYPE_DISCONNECTVOTE,
			"Disconnect-vote command type changed") &&
		expect(parsed_disconnect_vote->getPlayerID() == 11, "Disconnect-vote player id changed") &&
		expect(parsed_disconnect_vote->getID() == 50, "Disconnect-vote command id changed") &&
		expect(parsed_disconnect_vote->getSlot() == 4, "Disconnect-vote slot changed") &&
		expect(parsed_disconnect_vote->getVoteFrame() == 3400, "Disconnect-vote frame changed");
	disconnect_vote_ref->deleteInstance();

	NetCommandMsg *load_complete = newInstance(NetCommandMsg);
	load_complete->setNetCommandType(NETCOMMANDTYPE_LOADCOMPLETE);
	load_complete->setPlayerID(12);
	load_complete->setID(51);
	NetCommandRef *load_complete_ref =
		roundTripCommand(load_complete, 0x0e, "NetPacket did not add load-complete command");
	if (load_complete_ref == nullptr) {
		return false;
	}
	const bool load_complete_ok =
		expect(load_complete_ref->getCommand()->getNetCommandType() == NETCOMMANDTYPE_LOADCOMPLETE,
			"Load-complete command type changed") &&
		expect(load_complete_ref->getCommand()->getPlayerID() == 12, "Load-complete player id changed") &&
		expect(load_complete_ref->getCommand()->getID() == 51, "Load-complete command id changed");
	load_complete_ref->deleteInstance();

	NetCommandMsg *timeout_start = newInstance(NetCommandMsg);
	timeout_start->setNetCommandType(NETCOMMANDTYPE_TIMEOUTSTART);
	timeout_start->setPlayerID(13);
	timeout_start->setID(52);
	NetCommandRef *timeout_start_ref =
		roundTripCommand(timeout_start, 0x0f, "NetPacket did not add timeout-start command");
	if (timeout_start_ref == nullptr) {
		return false;
	}
	const bool timeout_start_ok =
		expect(timeout_start_ref->getCommand()->getNetCommandType() == NETCOMMANDTYPE_TIMEOUTSTART,
			"Timeout-start command type changed") &&
		expect(timeout_start_ref->getCommand()->getPlayerID() == 13, "Timeout-start player id changed") &&
		expect(timeout_start_ref->getCommand()->getID() == 52, "Timeout-start command id changed");
	timeout_start_ref->deleteInstance();

	NetWrapperCommandMsg *wrapper = newInstance(NetWrapperCommandMsg);
	wrapper->setPlayerID(14);
	wrapper->setID(53);
	wrapper->setWrappedCommandID(99);
	wrapper->setChunkNumber(2);
	wrapper->setNumChunks(5);
	wrapper->setTotalDataLength(17);
	wrapper->setDataOffset(8);
	UnsignedByte wrapper_payload[] = { 0xde, 0xad, 0xbe, 0xef };
	wrapper->setData(wrapper_payload, sizeof(wrapper_payload));
	NetCommandRef *wrapper_ref = roundTripCommand(wrapper, 0x10, "NetPacket did not add wrapper command");
	if (wrapper_ref == nullptr) {
		return false;
	}
	NetWrapperCommandMsg *parsed_wrapper = static_cast<NetWrapperCommandMsg *>(wrapper_ref->getCommand());
	const bool wrapper_ok =
		expect(parsed_wrapper->getNetCommandType() == NETCOMMANDTYPE_WRAPPER,
			"Wrapper command type changed") &&
		expect(parsed_wrapper->getPlayerID() == 14, "Wrapper player id changed") &&
		expect(parsed_wrapper->getID() == 53, "Wrapper command id changed") &&
		expect(parsed_wrapper->getWrappedCommandID() == 99, "Wrapper wrapped command id changed") &&
		expect(parsed_wrapper->getChunkNumber() == 2 && parsed_wrapper->getNumChunks() == 5,
			"Wrapper chunk metadata changed") &&
		expect(parsed_wrapper->getTotalDataLength() == 17 && parsed_wrapper->getDataOffset() == 8,
			"Wrapper data span changed") &&
		expect(parsed_wrapper->getDataLength() == sizeof(wrapper_payload) &&
				std::memcmp(parsed_wrapper->getData(), wrapper_payload, sizeof(wrapper_payload)) == 0,
			"Wrapper payload changed");
	wrapper_ref->deleteInstance();

	NetFileAnnounceCommandMsg *file_announce = newInstance(NetFileAnnounceCommandMsg);
	file_announce->setPlayerID(15);
	file_announce->setID(54);
	file_announce->setPortableFilename(AsciiString("Maps/Smoke/Test.map"));
	file_announce->setFileID(501);
	file_announce->setPlayerMask(0x33);
	NetCommandRef *file_announce_ref =
		roundTripCommand(file_announce, 0x11, "NetPacket did not add file-announce command");
	if (file_announce_ref == nullptr) {
		return false;
	}
	NetFileAnnounceCommandMsg *parsed_file_announce =
		static_cast<NetFileAnnounceCommandMsg *>(file_announce_ref->getCommand());
	const bool file_announce_ok =
		expect(parsed_file_announce->getNetCommandType() == NETCOMMANDTYPE_FILEANNOUNCE,
			"File-announce command type changed") &&
		expect(parsed_file_announce->getPlayerID() == 15, "File-announce player id changed") &&
		expect(parsed_file_announce->getID() == 54, "File-announce command id changed") &&
		expect(std::strcmp(parsed_file_announce->getPortableFilename().str(), "Maps/Smoke/Test.map") == 0,
			"File-announce filename changed") &&
		expect(parsed_file_announce->getFileID() == 501, "File-announce file id changed") &&
		expect(parsed_file_announce->getPlayerMask() == 0x33, "File-announce player mask changed");
	file_announce_ref->deleteInstance();

	NetDisconnectFrameCommandMsg *disconnect_frame = newInstance(NetDisconnectFrameCommandMsg);
	disconnect_frame->setPlayerID(16);
	disconnect_frame->setID(55);
	disconnect_frame->setDisconnectFrame(3500);
	NetCommandRef *disconnect_frame_ref =
		roundTripCommand(disconnect_frame, 0x12, "NetPacket did not add disconnect-frame command");
	if (disconnect_frame_ref == nullptr) {
		return false;
	}
	NetDisconnectFrameCommandMsg *parsed_disconnect_frame =
		static_cast<NetDisconnectFrameCommandMsg *>(disconnect_frame_ref->getCommand());
	const bool disconnect_frame_ok =
		expect(parsed_disconnect_frame->getNetCommandType() == NETCOMMANDTYPE_DISCONNECTFRAME,
			"Disconnect-frame command type changed") &&
		expect(parsed_disconnect_frame->getPlayerID() == 16, "Disconnect-frame player id changed") &&
		expect(parsed_disconnect_frame->getID() == 55, "Disconnect-frame command id changed") &&
		expect(parsed_disconnect_frame->getDisconnectFrame() == 3500,
			"Disconnect-frame value changed");
	disconnect_frame_ref->deleteInstance();

	NetDisconnectScreenOffCommandMsg *screen_off = newInstance(NetDisconnectScreenOffCommandMsg);
	screen_off->setPlayerID(17);
	screen_off->setID(56);
	screen_off->setNewFrame(3600);
	NetCommandRef *screen_off_ref =
		roundTripCommand(screen_off, 0x13, "NetPacket did not add disconnect-screen-off command");
	if (screen_off_ref == nullptr) {
		return false;
	}
	NetDisconnectScreenOffCommandMsg *parsed_screen_off =
		static_cast<NetDisconnectScreenOffCommandMsg *>(screen_off_ref->getCommand());
	const bool screen_off_ok =
		expect(parsed_screen_off->getNetCommandType() == NETCOMMANDTYPE_DISCONNECTSCREENOFF,
			"Disconnect-screen-off command type changed") &&
		expect(parsed_screen_off->getPlayerID() == 17, "Disconnect-screen-off player id changed") &&
		expect(parsed_screen_off->getID() == 56, "Disconnect-screen-off command id changed") &&
		expect(parsed_screen_off->getNewFrame() == 3600, "Disconnect-screen-off frame changed");
	screen_off_ref->deleteInstance();

	NetFrameResendRequestCommandMsg *resend = newInstance(NetFrameResendRequestCommandMsg);
	resend->setPlayerID(18);
	resend->setID(57);
	resend->setFrameToResend(3700);
	NetCommandRef *resend_ref =
		roundTripCommand(resend, 0x14, "NetPacket did not add frame-resend-request command");
	if (resend_ref == nullptr) {
		return false;
	}
	NetFrameResendRequestCommandMsg *parsed_resend =
		static_cast<NetFrameResendRequestCommandMsg *>(resend_ref->getCommand());
	const bool resend_ok =
		expect(parsed_resend->getNetCommandType() == NETCOMMANDTYPE_FRAMERESENDREQUEST,
			"Frame-resend-request command type changed") &&
		expect(parsed_resend->getPlayerID() == 18, "Frame-resend-request player id changed") &&
		expect(parsed_resend->getID() == 57, "Frame-resend-request command id changed") &&
		expect(parsed_resend->getFrameToResend() == 3700, "Frame-resend-request frame changed");
	resend_ref->deleteInstance();

	return leave_ok && metrics_ok && destroy_ok && keep_alive_ok && disconnect_keep_alive_ok &&
		disconnect_player_ok && router_query_ok && router_ack_ok && disconnect_chat_ok &&
		disconnect_vote_ok && load_complete_ok && timeout_start_ok && wrapper_ok &&
		file_announce_ok && disconnect_frame_ok && screen_off_ok && resend_ok;
}

bool exerciseNetCommandWrapperList()
{
	UnsignedByte payload[MAX_PACKET_SIZE] = {};
	Int payload_length = 0;

	NetFrameCommandMsg *frame = newInstance(NetFrameCommandMsg);
	frame->setExecutionFrame(4120);
	frame->setPlayerID(6);
	frame->setID(904);
	frame->setCommandCount(12);
	if (!buildPacketPayload(frame, 0x2a, payload, payload_length,
			"NetPacket did not build wrapper-list payload")) {
		return false;
	}

	NetCommandWrapperList *wrappers = newInstance(NetCommandWrapperList);
	wrappers->init();

	const UnsignedInt first_length = static_cast<UnsignedInt>(payload_length / 2);
	const UnsignedInt second_offset = first_length;
	const UnsignedInt second_length = static_cast<UnsignedInt>(payload_length) - second_offset;
	const UnsignedShort wrapped_id = 904;
	if (!expect(first_length > 0 && second_length > 0, "Wrapper list payload split failed")) {
		wrappers->deleteInstance();
		return false;
	}

	processAndReleaseWrapper(*wrappers, makeWrapperChunk(1001, wrapped_id, 6, 0, 2, payload,
		first_length, 0, static_cast<UnsignedInt>(payload_length)));
	NetCommandList *not_ready = wrappers->getReadyCommands();
	const bool first_chunk_ok =
		expect(wrappers->getPercentComplete(wrapped_id) == 50,
			"Wrapper list first chunk percent changed") &&
		expect(not_ready->length() == 0, "Wrapper list emitted incomplete command");
	not_ready->deleteInstance();

	processAndReleaseWrapper(*wrappers, makeWrapperChunk(1002, wrapped_id, 6, 0, 2, payload,
		first_length, 0, static_cast<UnsignedInt>(payload_length)));
	NetCommandList *duplicate_ready = wrappers->getReadyCommands();
	const bool duplicate_ok =
		expect(wrappers->getPercentComplete(wrapped_id) == 50,
			"Wrapper list duplicate chunk changed progress") &&
		expect(duplicate_ready->length() == 0, "Wrapper list emitted duplicate incomplete command");
	duplicate_ready->deleteInstance();

	processAndReleaseWrapper(*wrappers, makeWrapperChunk(1003, wrapped_id, 6, 1, 2, payload,
		second_length, second_offset, static_cast<UnsignedInt>(payload_length)));
	const bool complete_before_drain_ok = expect(wrappers->getPercentComplete(wrapped_id) == 100,
		"Wrapper list complete percent changed");
	NetCommandList *ready = wrappers->getReadyCommands();
	NetCommandRef *ready_ref = ready->getFirstMessage();
	const bool ready_ok =
		expect(ready->length() == 1, "Wrapper list did not emit one ready command") &&
		expect(ready_ref != nullptr, "Wrapper list ready command missing") &&
		expect(ready_ref->getRelay() == 0x2a, "Wrapper list did not preserve relay") &&
		expect(ready_ref->getCommand()->getNetCommandType() == NETCOMMANDTYPE_FRAMEINFO,
			"Wrapper list command type changed") &&
		expect(ready_ref->getCommand()->getID() == wrapped_id, "Wrapper list command id changed") &&
		expect(ready_ref->getCommand()->getPlayerID() == 6, "Wrapper list player id changed") &&
		expect(static_cast<NetFrameCommandMsg *>(ready_ref->getCommand())->getExecutionFrame() == 4120,
			"Wrapper list execution frame changed") &&
		expect(static_cast<NetFrameCommandMsg *>(ready_ref->getCommand())->getCommandCount() == 12,
			"Wrapper list command count changed");
	ready->deleteInstance();

	const bool drained_ok = expect(wrappers->getPercentComplete(wrapped_id) == 0,
		"Wrapper list did not remove drained command");
	wrappers->deleteInstance();
	return first_chunk_ok && duplicate_ok && complete_before_drain_ok && ready_ok && drained_ok;
}

bool exerciseTransportQueue()
{
	Transport transport;
	std::memset(transport.m_outBuffer, 0, sizeof(transport.m_outBuffer));

	const UnsignedByte payload[] = {0x10, 0x20, 0x30, 0x40, 0x50};
	const bool rejects_ok =
		expect(!transport.queueSend(0x01020304u, 1234, payload, 0),
			"Transport accepted empty packet") &&
		expect(!transport.queueSend(0x01020304u, 1234, payload, MAX_PACKET_SIZE + 1),
			"Transport accepted oversized packet");

	const bool queued = transport.queueSend(0x01020304u, 1234, payload, sizeof(payload));
	const TransportMessage encrypted = transport.m_outBuffer[0];
	TransportMessage decoded = encrypted;
	decryptTransportMessage(decoded);
	const auto *wire = reinterpret_cast<const UnsignedByte *>(&encrypted);
	const bool first_ok =
		expect(queued, "Transport did not queue packet") &&
		expect(sizeof(TransportMessageHeader) == 6, "Transport header packing changed") &&
		expectEncryptedTransportWord(encrypted, decoded, 0, 0x0000fadeu,
			"Transport encrypted CRC word byte order changed") &&
		expectEncryptedTransportWord(encrypted, decoded, 4, 0x0000fdffu,
			"Transport encrypted magic/payload word byte order changed") &&
		expect(wire[8] == payload[2] && wire[9] == payload[3] && wire[10] == payload[4],
			"Transport trailing payload encryption contract changed") &&
		expect(decoded.length == static_cast<Int>(sizeof(payload)), "Transport queued length changed") &&
		expect(decoded.addr == 0x01020304u, "Transport queued address changed") &&
		expect(decoded.port == 1234, "Transport queued port changed") &&
		expect(decoded.header.magic == GENERALS_MAGIC_NUMBER, "Transport magic changed") &&
		expect(transportMessageHasValidCrc(decoded), "Transport CRC did not validate") &&
		expect(std::memcmp(decoded.data, payload, sizeof(payload)) == 0, "Transport queued payload changed");

	UnsignedByte single_byte = 0x7a;
	Bool fill_ok = TRUE;
	for (Int i = 1; i < MAX_MESSAGES; ++i) {
		fill_ok = fill_ok && transport.queueSend(0x01020304u + i, static_cast<UnsignedShort>(1234 + i),
			&single_byte, sizeof(single_byte));
	}
	const bool full_ok =
		expect(fill_ok, "Transport did not fill all queue slots") &&
		expect(!transport.queueSend(0x0a0b0c0du, 9999, &single_byte, sizeof(single_byte)),
			"Transport accepted packet after queue filled");

	return rejects_ok && first_ok && full_ok;
}

NetCommandRef *parseQueuedTransportCommand(const Transport &transport, Int slot, UnsignedInt expected_addr,
	UnsignedShort expected_port)
{
	if (!expect(slot >= 0 && slot < MAX_MESSAGES, "Transport slot index out of range")) {
		return nullptr;
	}
	if (!expect(transport.m_outBuffer[slot].length > 0, "Transport queue slot is empty") ||
		!expect(transport.m_outBuffer[slot].addr == expected_addr, "Transport queued address changed") ||
		!expect(transport.m_outBuffer[slot].port == expected_port, "Transport queued port changed")) {
		return nullptr;
	}

	TransportMessage decoded = transport.m_outBuffer[slot];
	decryptTransportMessage(decoded);
	return NetPacket::ConstructNetCommandMsgFromRawData(decoded.data,
		static_cast<UnsignedShort>(decoded.length));
}

bool exerciseConnectionQueue()
{
	Transport transport;
	std::memset(transport.m_outBuffer, 0, sizeof(transport.m_outBuffer));

	Connection *connection = newInstance(Connection);
	connection->init();
	connection->setFrameGrouping(0);
	connection->attachTransport(&transport);
	connection->setUser(newInstance(User)(UnicodeString(L"Peer"), 0x0a010203u, 4321));

	NetFrameCommandMsg *frame = newInstance(NetFrameCommandMsg);
	frame->setExecutionFrame(4321);
	frame->setPlayerID(2);
	frame->setID(610);
	frame->setCommandCount(9);
	connection->sendNetCommandMsg(frame, 0x3a);
	frame->detach();

	const bool queued_ok =
		expect(!connection->isQueueEmpty(), "Connection did not queue ack-required command") &&
		expect(connection->doSend() == 1, "Connection did not packetize queued command");

	NetCommandRef *queued = parseQueuedTransportCommand(transport, 0, 0x0a010203u, 4321);
	const bool packet_ok =
		expect(queued != nullptr, "Connection queued packet did not parse") &&
		expect(queued->getRelay() == 0x3a, "Connection queued packet did not preserve relay") &&
		expect(queued->getCommand()->getNetCommandType() == NETCOMMANDTYPE_FRAMEINFO,
			"Connection queued packet command type changed") &&
		expect(queued->getCommand()->getID() == 610, "Connection queued packet command id changed") &&
		expect(queued->getCommand()->getPlayerID() == 2, "Connection queued packet player id changed");
	if (queued != nullptr) {
		queued->deleteInstance();
	}

	NetCommandRef *acked = connection->processAck(610, 2);
	const bool ack_ok =
		expect(acked != nullptr, "Connection did not remove acked command") &&
		expect(connection->isQueueEmpty(), "Connection retained command after ack");
	if (acked != nullptr) {
		acked->deleteInstance();
	}

	std::memset(transport.m_outBuffer, 0, sizeof(transport.m_outBuffer));
	NetKeepAliveCommandMsg *keep_alive = newInstance(NetKeepAliveCommandMsg);
	keep_alive->setPlayerID(5);
	connection->sendNetCommandMsg(keep_alive, 0x11);
	keep_alive->detach();

	const bool keepalive_send_ok =
		expect(!connection->isQueueEmpty(), "Connection did not queue keepalive command") &&
		expect(connection->doSend() == 1, "Connection did not send keepalive command") &&
		expect(connection->isQueueEmpty(), "Connection retained non-ack command after send");
	NetCommandRef *keepalive_ref = parseQueuedTransportCommand(transport, 0, 0x0a010203u, 4321);
	const bool keepalive_packet_ok =
		expect(keepalive_ref != nullptr, "Connection keepalive packet did not parse") &&
		expect(keepalive_ref->getRelay() == 0x11, "Connection keepalive packet did not preserve relay") &&
		expect(keepalive_ref->getCommand()->getNetCommandType() == NETCOMMANDTYPE_KEEPALIVE,
			"Connection keepalive packet command type changed") &&
		expect(keepalive_ref->getCommand()->getPlayerID() == 5,
			"Connection keepalive packet player id changed");
	if (keepalive_ref != nullptr) {
		keepalive_ref->deleteInstance();
	}

	connection->deleteInstance();
	return queued_ok && packet_ok && ack_ok && keepalive_send_ok && keepalive_packet_ok;
}

bool exerciseConnectionRetry()
{
	Transport transport;
	std::memset(transport.m_outBuffer, 0, sizeof(transport.m_outBuffer));

	InspectableConnection connection;
	connection.init();
	connection.setFrameGrouping(0);
	connection.attachTransport(&transport);
	connection.setUser(newInstance(User)(UnicodeString(L"RetryPeer"), 0x0a010204u, 4322));

	NetFrameCommandMsg *frame = newInstance(NetFrameCommandMsg);
	frame->setExecutionFrame(4510);
	frame->setPlayerID(3);
	frame->setID(711);
	frame->setCommandCount(2);
	connection.sendNetCommandMsg(frame, 0x09);
	frame->detach();

	const bool first_send_ok =
		expect(!connection.isQueueEmpty(), "Connection retry command did not queue") &&
		expect(connection.doSend() == 1, "Connection retry first send failed") &&
		expect(!connection.isQueueEmpty(), "Connection retry command should wait for ack");

	NetCommandRef *first_packet = parseQueuedTransportCommand(transport, 0, 0x0a010204u, 4322);
	const bool first_packet_ok =
		expect(first_packet != nullptr, "Connection retry first packet did not parse") &&
		expect(first_packet->getCommand()->getNetCommandType() == NETCOMMANDTYPE_FRAMEINFO,
			"Connection retry first packet type changed") &&
		expect(first_packet->getCommand()->getID() == 711,
			"Connection retry first packet id changed") &&
		expect(first_packet->getRelay() == 0x09, "Connection retry first relay changed");
	if (first_packet != nullptr) {
		first_packet->deleteInstance();
	}

	std::memset(transport.m_outBuffer, 0, sizeof(transport.m_outBuffer));
	const bool gated_retry_ok =
		expect(connection.doSend() == 1, "Connection retry gated send accounting changed") &&
		expect(transport.m_outBuffer[0].length == 0,
			"Connection retried before the retry interval elapsed") &&
		expect(!connection.isQueueEmpty(), "Connection retry queue emptied before ack");

	connection.makeRetryEligible();
	const bool queue_still_ok = expect(connection.processAck(712, 3) == nullptr,
		"Connection removed command for mismatched ack");
	std::memset(transport.m_outBuffer, 0, sizeof(transport.m_outBuffer));
	const bool retry_send_ok = expect(connection.doSend() == 1, "Connection eligible retry send failed");
	NetCommandRef *retry_packet = parseQueuedTransportCommand(transport, 0, 0x0a010204u, 4322);
	const bool retry_packet_ok =
		expect(retry_packet != nullptr, "Connection retry packet did not parse") &&
		expect(retry_packet->getCommand()->getNetCommandType() == NETCOMMANDTYPE_FRAMEINFO,
			"Connection retry packet type changed") &&
		expect(retry_packet->getCommand()->getID() == 711,
			"Connection retry packet id changed") &&
		expect(retry_packet->getRelay() == 0x09, "Connection retry relay changed");
	if (retry_packet != nullptr) {
		retry_packet->deleteInstance();
	}

	NetAckStage1CommandMsg *ack = newInstance(NetAckStage1CommandMsg);
	ack->setCommandID(711);
	ack->setOriginalPlayerID(3);
	NetCommandRef *acked = connection.processAck(static_cast<NetCommandMsg *>(ack));
	ack->detach();
	const bool ack_ok =
		expect(acked != nullptr, "Connection retry ack did not remove command") &&
		expect(connection.isQueueEmpty(), "Connection retry command remained after ack");
	if (acked != nullptr) {
		acked->deleteInstance();
	}

	return first_send_ok && first_packet_ok && gated_retry_ok && queue_still_ok &&
		retry_send_ok && retry_packet_ok && ack_ok;
}

bool exerciseFileTransferPathHelpers()
{
	const AsciiString map("Maps\\UserMaps\\Tournament Desert\\Tournament Desert.map");

	return expectAscii(GetBasePathFromPath(map), "Maps\\UserMaps\\Tournament Desert",
			"FileTransfer base path helper changed") &&
		expectAscii(GetFileFromPath(map), "Tournament Desert.map", "FileTransfer file helper changed") &&
		expectAscii(GetExtensionFromFile(AsciiString("Tournament Desert.map")), "map",
			"FileTransfer extension helper changed") &&
		expectAscii(GetBaseFileFromFile(AsciiString("Tournament Desert.map")), "Tournament Desert",
			"FileTransfer base-file helper changed") &&
		expectAscii(GetPreviewFromMap(map), "Maps\\UserMaps\\Tournament Desert\\Tournament Desert.tga",
			"FileTransfer preview path helper changed") &&
		expectAscii(GetINIFromMap(map), "Maps\\UserMaps\\Tournament Desert\\map.ini",
			"FileTransfer map.ini path helper changed") &&
		expectAscii(GetStrFileFromMap(map), "Maps\\UserMaps\\Tournament Desert\\map.str",
			"FileTransfer map.str path helper changed") &&
		expectAscii(GetSoloINIFromMap(map), "Maps\\UserMaps\\Tournament Desert\\solo.ini",
			"FileTransfer solo.ini path helper changed") &&
		expectAscii(GetAssetUsageFromMap(map), "Maps\\UserMaps\\Tournament Desert\\assetusage.txt",
			"FileTransfer assetusage path helper changed") &&
		expectAscii(GetReadmeFromMap(map), "Maps\\UserMaps\\Tournament Desert\\readme.txt",
			"FileTransfer readme path helper changed") &&
		expectAscii(GetBasePathFromPath(AsciiString("Loose.map")), "",
			"FileTransfer loose-map base path changed") &&
		expectAscii(GetFileFromPath(AsciiString("Loose.map")), "Loose.map",
			"FileTransfer loose-map file helper changed") &&
		expectAscii(GetExtensionFromFile(AsciiString("NoExtension")), "NoExtension",
			"FileTransfer no-extension helper changed") &&
		expectAscii(GetBaseFileFromFile(AsciiString("NoExtension")), "",
			"FileTransfer no-extension base-file helper changed");
}

bool exerciseFrameMetrics()
{
	GlobalData global_data;
	global_data.m_networkFPSHistoryLength = 4;
	global_data.m_networkLatencyHistoryLength = 4;
	global_data.m_networkCushionHistoryLength = 3;
	GlobalData *old_global_data = TheWritableGlobalData;
	TheWritableGlobalData = &global_data;

	bool ok = false;
	{
		FrameMetrics metrics;
		metrics.init();
		const bool init_ok =
			expect(metrics.getAverageFPS() == 30, "FrameMetrics initial FPS changed") &&
			expect(std::fabs(metrics.getAverageLatency() - 0.2f) <= 0.0001f,
				"FrameMetrics initial latency changed") &&
			expect(metrics.getMinimumCushion() == -1, "FrameMetrics initial cushion changed");

		metrics.addCushion(6);
		const bool first_cushion_ok = expect(metrics.getMinimumCushion() == 6,
			"FrameMetrics first cushion failed");
		metrics.addCushion(4);
		const bool lower_cushion_ok = expect(metrics.getMinimumCushion() == 4,
			"FrameMetrics lower cushion failed");
		metrics.addCushion(8);
		const bool wrapped_cushion_ok = expect(metrics.getMinimumCushion() == 8,
			"FrameMetrics cushion wrap failed");

		metrics.reset();
		const bool reset_ok =
			expect(metrics.getAverageFPS() == 30, "FrameMetrics reset FPS changed") &&
			expect(std::fabs(metrics.getAverageLatency() - 0.2f) <= 0.0001f,
				"FrameMetrics reset latency changed") &&
			expect(metrics.getMinimumCushion() == -1, "FrameMetrics reset cushion changed");
		ok = init_ok && first_cushion_ok && lower_cushion_ok && wrapped_cushion_ok && reset_ok;
	}

	TheWritableGlobalData = old_global_data;
	return ok;
}

bool exerciseUser()
{
	User *first = newInstance(User)(UnicodeString(L"Commander"), 0x01020304u, 8088);
	User *second = newInstance(User);

	if (!expect(first != nullptr && second != nullptr, "User allocation failed")) {
		if (first != nullptr) {
			first->deleteInstance();
		}
		if (second != nullptr) {
			second->deleteInstance();
		}
		return false;
	}

	second->setName(UnicodeString(L"Commander"));
	second->SetIPAddr(0x0a000001u);
	second->SetPort(9000);

	const bool initial_ok =
		expect(*first == second, "User equality should compare names") &&
		expect(first->GetIPAddr() == 0x01020304u, "User IP assignment failed") &&
		expect(first->GetPort() == 8088, "User port assignment failed") &&
		expect(second->GetIPAddr() == 0x0a000001u, "User IP mutator failed") &&
		expect(second->GetPort() == 9000, "User port mutator failed");
	second->setName(UnicodeString(L"Observer"));
	const bool changed_ok =
		expect(*first != second, "User inequality should compare names");
	*second = first;
	const bool assigned_ok =
		expect(*first == second, "User pointer assignment failed") &&
		expect(second->GetIPAddr() == 0x01020304u, "User assignment IP failed") &&
		expect(second->GetPort() == 8088, "User assignment port failed");

	first->deleteInstance();
	second->deleteInstance();
	return initial_ok && changed_ok && assigned_ok;
}

bool exerciseNetCommandListMerge()
{
	// appendList(NULL) and appendList(empty) must be no-ops.
	NetCommandList *dest = newInstance(NetCommandList);
	dest->init();
	dest->appendList(NULL);
	NetCommandList *empty_source = newInstance(NetCommandList);
	empty_source->init();
	dest->appendList(empty_source);
	const bool null_append_ok = expect(dest->length() == 0, "NetCommandList empty append changed length");
	empty_source->deleteInstance();
	if (!null_append_ok) {
		dest->deleteInstance();
		return false;
	}

	// Destination seeded with one command; source carries a later command.
	NetFrameCommandMsg *dest_msg = newInstance(NetFrameCommandMsg);
	dest_msg->setPlayerID(2);
	dest_msg->setID(10);
	dest_msg->setExecutionFrame(110);
	dest_msg->setCommandCount(1);
	NetCommandRef *dest_ref = addAndRelease(*dest, dest_msg);
	dest_ref->setRelay(0x11);

	NetFrameCommandMsg *source_msg = newInstance(NetFrameCommandMsg);
	source_msg->setPlayerID(2);
	source_msg->setID(20);
	source_msg->setExecutionFrame(120);
	source_msg->setCommandCount(2);
	NetCommandList *source = newInstance(NetCommandList);
	source->init();
	NetCommandRef *source_ref = addAndRelease(*source, source_msg);
	source_ref->setRelay(0x22);

	dest->appendList(source);
	NetCommandRef *merged = dest->getFirstMessage();
	const bool append_ok =
		expect(dest->length() == 2, "NetCommandList append did not extend list") &&
		expect(merged != nullptr && merged->getCommand()->getID() == 10 &&
				merged->getRelay() == 0x11, "NetCommandList append lost destination head") &&
		expect(merged->getNext() != nullptr &&
				merged->getNext()->getCommand()->getID() == 20 &&
				merged->getNext()->getRelay() == 0x22,
			"NetCommandList append did not preserve ordering or relay") &&
		expect(source->length() == 1, "NetCommandList append drained source list");

	// Duplicates (same type/player/id) appended from another source must be rejected.
	NetFrameCommandMsg *dup_msg = newInstance(NetFrameCommandMsg);
	dup_msg->setPlayerID(2);
	dup_msg->setID(10);
	dup_msg->setExecutionFrame(110);
	dup_msg->setCommandCount(1);
	NetCommandList *dup_source = newInstance(NetCommandList);
	dup_source->init();
	addAndRelease(*dup_source, dup_msg);
	dest->appendList(dup_source);
	const bool duplicate_append_ok =
		expect(dest->length() == 2, "NetCommandList append accepted duplicate command");
	dup_source->deleteInstance();

	// removeMessage unlinks (without freeing) head, middle, and tail refs.
	NetFrameCommandMsg *third_msg = newInstance(NetFrameCommandMsg);
	third_msg->setPlayerID(2);
	third_msg->setID(30);
	third_msg->setExecutionFrame(130);
	third_msg->setCommandCount(3);
	addAndRelease(*dest, third_msg);

	const bool before_remove_ok = expect(dest->length() == 3, "NetCommandList did not hold three commands");
	NetCommandRef *middle_ref = dest->getFirstMessage()->getNext();
	dest->removeMessage(middle_ref);
	const bool middle_remove_ok =
		expect(dest->length() == 2, "NetCommandList remove did not drop middle length") &&
		expect(middle_ref->getPrev() == nullptr && middle_ref->getNext() == nullptr,
			"NetCommandList remove did not detach removed ref") &&
		expect(dest->getFirstMessage() != nullptr &&
				dest->getFirstMessage()->getCommand()->getID() == 10 &&
				dest->getFirstMessage()->getNext() != nullptr &&
				dest->getFirstMessage()->getNext()->getCommand()->getID() == 30,
			"NetCommandList remove did not relink neighbors");
	middle_ref->deleteInstance();

	NetCommandRef *head_ref = dest->getFirstMessage();
	dest->removeMessage(head_ref);
	const bool head_remove_ok =
		expect(dest->length() == 1, "NetCommandList remove did not drop head length") &&
		expect(dest->getFirstMessage() != nullptr &&
				dest->getFirstMessage()->getCommand()->getID() == 30,
			"NetCommandList remove did not promote new head");
	head_ref->deleteInstance();

	NetCommandRef *tail_ref = dest->getFirstMessage();
	dest->removeMessage(tail_ref);
	const bool tail_remove_ok =
		expect(dest->length() == 0, "NetCommandList remove did not drop final length") &&
		expect(dest->getFirstMessage() == nullptr, "NetCommandList remove did not clear head");
	tail_ref->deleteInstance();

	// Message-based find must locate a matching command and miss an absent one.
	NetFrameCommandMsg *find_msg = newInstance(NetFrameCommandMsg);
	find_msg->setPlayerID(4);
	find_msg->setID(777);
	find_msg->setExecutionFrame(500);
	find_msg->setCommandCount(0);
	addAndRelease(*dest, find_msg);

	NetFrameCommandMsg *probe_msg = newInstance(NetFrameCommandMsg);
	probe_msg->setPlayerID(4);
	probe_msg->setID(777);
	probe_msg->setExecutionFrame(600);
	NetCommandRef *found = dest->findMessage(probe_msg);
	const bool find_msg_ok =
		expect(found != nullptr && found->getCommand()->getID() == 777 &&
				found->getCommand()->getPlayerID() == 4,
			"NetCommandList findMessage(NetCommandMsg*) did not locate command");

	NetFrameCommandMsg *absent_msg = newInstance(NetFrameCommandMsg);
	absent_msg->setPlayerID(4);
	absent_msg->setID(888);
	const bool absent_ok = expect(dest->findMessage(absent_msg) == nullptr,
		"NetCommandList findMessage(NetCommandMsg*) found absent command");

	probe_msg->detach();
	absent_msg->detach();
	dest->reset();
	dest->deleteInstance();
	source->deleteInstance();

	return null_append_ok && append_ok && duplicate_append_ok && before_remove_ok &&
		middle_remove_ok && head_remove_ok && tail_remove_ok && find_msg_ok && absent_ok;
}
}

int main()
{
	initMemoryManager();
	const bool ok = exerciseNetworkUtil() && exerciseBrowserConnectionGrouping() &&
		exerciseFrameData() && exerciseNetCommandList() &&
		exerciseNetCommandListMerge() &&
		exerciseNetPacketRoundTrip() && exerciseNetPacketWireFormat() && exerciseNetPacketAckRoundTrip() &&
		exerciseNetPacketControlRoundTrip() && exerciseNetCommandWrapperList() && exerciseTransportQueue() &&
		exerciseConnectionQueue() && exerciseConnectionRetry() && exerciseFileTransferPathHelpers() && exerciseFrameMetrics() &&
		exerciseUser();
	shutdownMemoryManager();

	if (!ok) {
		return 1;
	}

	std::printf("{\"ok\":true,\"library\":\"GameNetwork/core\",\"compiled\":\"Connection,ConnectionManager,DisconnectManager,DownloadManager,FileTransfer,FirewallHelper,FrameData,FrameDataManager,FrameMetrics,GameInfo,GameMessageParser,GSConfig,GUIUtil,LANAPI,LANAPICallbacks,LANAPIhandlers,LANGameInfo,NetCommandList,NetCommandMsg,NetCommandRef,NetCommandWrapperList,NetMessageStream,NetPacket,NetworkUtil,Transport,udp,User\",\"covered\":\"connection send/ack queues and retry gating, transport packet buffering and encrypted wire bytes, command lists (insert, merge via appendList, removeMessage, and message-based find), packet round-trips and wire byte order, ack/control command values, wrapper chunk reassembly, file-transfer path helpers, and FrameMetrics init/reset/cushion behavior\",\"source\":\"GeneralsMD original\"}\n");
	return 0;
}
