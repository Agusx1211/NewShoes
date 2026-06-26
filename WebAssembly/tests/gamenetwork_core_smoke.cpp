#include <cstdio>
#include <cstring>
#include <cwchar>

#include "PreRTS.h"

#include "Common/GameMemory.h"
#include "GameNetwork/FrameData.h"
#include "GameNetwork/FrameDataManager.h"
#include "GameNetwork/NetCommandList.h"
#include "GameNetwork/NetCommandMsg.h"
#include "GameNetwork/NetCommandRef.h"
#include "GameNetwork/NetPacket.h"
#include "GameNetwork/NetworkUtil.h"
#include "GameNetwork/User.h"

namespace {
bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::fprintf(stderr, "%s\n", message);
		return false;
	}
	return true;
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

NetCommandRef *addAndRelease(NetCommandList &list, NetCommandMsg *msg)
{
	NetCommandRef *ref = list.addMessage(msg);
	msg->detach();
	return ref;
}

bool exerciseNetworkUtil()
{
	const UnsignedShort first = GenerateNextCommandID();
	const UnsignedShort second = GenerateNextCommandID();

	return expect(static_cast<UnsignedShort>(first + 1) == second, "GenerateNextCommandID did not advance") &&
		expect(DoesCommandRequireACommandID(NETCOMMANDTYPE_GAMECOMMAND), "game command should require ids") &&
		expect(!DoesCommandRequireACommandID(NETCOMMANDTYPE_ACKBOTH), "ackboth should not require ids") &&
		expect(IsCommandSynchronized(NETCOMMANDTYPE_RUNAHEAD), "runahead should be synchronized") &&
		expect(!IsCommandSynchronized(NETCOMMANDTYPE_CHAT), "chat should not be synchronized") &&
		expect(std::strcmp(GetAsciiNetCommandType(NETCOMMANDTYPE_FRAMEINFO).str(), "NETCOMMANDTYPE_FRAMEINFO") == 0,
			"frameinfo command name failed") &&
		expect(std::strcmp(GetAsciiNetCommandType(NETCOMMANDTYPE_MAX).str(), "UNKNOWN") == 0,
			"unknown command name failed") &&
		expect(MAX_FRAMES_AHEAD == 128 && MIN_RUNAHEAD == 10 && FRAME_DATA_LENGTH == 258 && FRAMES_TO_KEEP == 65,
			"network frame globals changed");
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
}

int main()
{
	initMemoryManager();
	const bool ok = exerciseNetworkUtil() && exerciseFrameData() && exerciseNetCommandList() &&
		exerciseNetPacketRoundTrip() && exerciseUser();
	shutdownMemoryManager();

	if (!ok) {
		return 1;
	}

	std::printf("{\"ok\":true,\"library\":\"GameNetwork/core\",\"compiled\":\"Connection,ConnectionManager,DisconnectManager,DownloadManager,FileTransfer,FirewallHelper,FrameData,FrameDataManager,FrameMetrics,GameInfo,GameMessageParser,GSConfig,GUIUtil,LANAPI,LANAPICallbacks,LANAPIhandlers,LANGameInfo,NetCommandList,NetCommandMsg,NetCommandRef,NetCommandWrapperList,NetMessageStream,NetPacket,NetworkUtil,User\",\"covered\":\"command lists and packet round-trips\",\"source\":\"GeneralsMD original\"}\n");
	return 0;
}
