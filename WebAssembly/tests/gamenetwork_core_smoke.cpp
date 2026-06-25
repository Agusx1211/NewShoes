#include <cstdio>
#include <cstring>

#include "PreRTS.h"

#include "Common/GameMemory.h"
#include "GameNetwork/FrameData.h"
#include "GameNetwork/FrameDataManager.h"
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
	const bool ok = exerciseNetworkUtil() && exerciseFrameData() && exerciseUser();
	shutdownMemoryManager();

	if (!ok) {
		return 1;
	}

	std::printf("{\"ok\":true,\"library\":\"GameNetwork/core\",\"compiled\":\"Connection,FileTransfer,FirewallHelper,FrameData,FrameDataManager,FrameMetrics,GameMessageParser,NetCommandList,NetCommandMsg,NetCommandRef,NetCommandWrapperList,NetMessageStream,NetworkUtil,User\",\"source\":\"GeneralsMD original\"}\n");
	return 0;
}
