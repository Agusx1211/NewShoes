#include <cstdio>
#include <cstring>

#include "PreRTS.h"

#include "Common/GameMemory.h"
#include "GameNetwork/FrameData.h"
#include "GameNetwork/FrameDataManager.h"
#include "GameNetwork/NetworkUtil.h"

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
}

int main()
{
	initMemoryManager();
	const bool ok = exerciseNetworkUtil() && exerciseFrameData();
	shutdownMemoryManager();

	if (!ok) {
		return 1;
	}

	std::printf("{\"ok\":true,\"library\":\"GameNetwork/core\",\"compiled\":\"NetworkUtil,NetCommandList,FrameData,FrameDataManager,GameMessageParser,NetCommandRef,NetCommandWrapperList\",\"source\":\"GeneralsMD original\"}\n");
	return 0;
}
