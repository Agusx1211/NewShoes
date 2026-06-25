#include <cmath>
#include <cstdio>
#include <cstring>

#include "PreRTS.h"

#include "Common/AsciiString.h"
#include "Common/CRC.h"
#include "Common/GameMemory.h"
#include "Common/GameType.h"
#include "Common/NameKeyGenerator.h"
#include "Common/QuickTrig.h"
#include "Common/RandomValue.h"
#include "Common/SubsystemInterface.h"
#include "Common/UnicodeString.h"
#include "GameClient/ClientRandomValue.h"
#include "GameLogic/LogicRandomValue.h"
#include "Lib/Trig.h"

SubsystemInterfaceList *TheSubsystemList = nullptr;

void userMemoryManagerGetDmaParms(Int *numSubPools, const PoolInitRec **pParms)
{
	*numSubPools = 0;
	*pParms = nullptr;
}

void userMemoryManagerInitPools()
{
}

void userMemoryAdjustPoolSize(const char *, Int &initialAllocationCount, Int &overflowAllocationCount)
{
	if (initialAllocationCount <= 0) {
		initialAllocationCount = 64;
	}
	if (overflowAllocationCount < 0) {
		overflowAllocationCount = 64;
	}
}

namespace {
bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::fprintf(stderr, "%s\n", message);
		return false;
	}
	return true;
}

bool near(Real actual, Real expected, Real epsilon = 0.015f)
{
	return std::fabs(actual - expected) <= epsilon;
}

bool exercise_strings()
{
	AsciiString text("  Zero");
	text.concat(" Hour  ");
	text.trim();
	text.toLower();
	if (!expect(std::strcmp(text.str(), "zero hour") == 0, "AsciiString trim/lower/concat failed")) {
		return false;
	}

	AsciiString formatted;
	formatted.format("%s-%d", "GLA", 7);
	if (!expect(std::strcmp(formatted.str(), "GLA-7") == 0, "AsciiString format failed")) {
		return false;
	}

	UnicodeString wide;
	wide.translate(text);
	if (!expect(wide.getLength() == text.getLength() && wide.getCharAt(0) == L'z',
			"UnicodeString translate failed")) {
		return false;
	}

	AsciiString round_trip;
	round_trip.translate(wide);
	return expect(std::strcmp(round_trip.str(), text.str()) == 0, "AsciiString translate failed");
}

bool exercise_name_keys()
{
	NameKeyGenerator generator;
	TheNameKeyGenerator = &generator;
	generator.init();

	const NameKeyType command_center = generator.nameToKey("CommandCenter");
	const NameKeyType command_center_again = generator.nameToKey("CommandCenter");
	const NameKeyType barracks = generator.nameToKey("Barracks");
	const NameKeyType lowercase = generator.nameToLowercaseKey("warfactory");
	const NameKeyType lowercase_again = generator.nameToLowercaseKey("WarFactory");

	const bool ok =
		expect(command_center == command_center_again, "NameKeyGenerator stable lookup failed") &&
		expect(command_center != barracks, "NameKeyGenerator unique key allocation failed") &&
		expect(lowercase == lowercase_again, "NameKeyGenerator lowercase lookup failed") &&
		expect(std::strcmp(generator.keyToName(barracks).str(), "Barracks") == 0,
			"NameKeyGenerator reverse lookup failed");

	generator.reset();
	TheNameKeyGenerator = nullptr;
	return ok;
}

bool exercise_random_and_crc()
{
	InitRandom(0x12345678U);
	char file[] = "gameengine_common_core_smoke";
	const Int logic_a = GetGameLogicRandomValue(10, 100, file, 1);
	const Real logic_real_a = GetGameLogicRandomValueReal(-1.0f, 1.0f, file, 2);
	const Int client_a = GetGameClientRandomValue(10, 100, file, 3);
	const UnsignedInt seed_crc_a = GetGameLogicRandomSeedCRC();

	InitRandom(0x12345678U);
	const Int logic_b = GetGameLogicRandomValue(10, 100, file, 1);
	const Real logic_real_b = GetGameLogicRandomValueReal(-1.0f, 1.0f, file, 2);
	const Int client_b = GetGameClientRandomValue(10, 100, file, 3);
	const UnsignedInt seed_crc_b = GetGameLogicRandomSeedCRC();

	CRC crc;
	const char payload[] = "ZeroHour";
	crc.computeCRC(payload, static_cast<Int>(std::strlen(payload)));

	return expect(GetGameLogicRandomSeed() == 0x12345678U, "logic seed tracking failed") &&
		expect(logic_a == logic_b && client_a == client_b, "random integer replay failed") &&
		expect(near(logic_real_a, logic_real_b, 0.00001f), "random real replay failed") &&
		expect(seed_crc_a == seed_crc_b, "random seed CRC replay failed") &&
		expect(crc.get() == 0x60c8U, "GameEngine CRC vector failed");
}

bool exercise_trig()
{
	return expect(near(Sin(PI / 2.0f), 1.0f, 0.002f), "Sin lookup failed") &&
		expect(near(Cos(PI), -1.0f, 0.002f), "Cos lookup failed") &&
		expect(near(QSin(PI / 4.0f), std::sinf(PI / 4.0f), 0.01f), "QSin lookup failed") &&
		expect(near(QMag(3.0f, 4.0f, 0.0f), 4.75f, 0.001f), "QMag estimate failed");
}
}

int main()
{
	initMemoryManager();

	const bool ok = exercise_strings() &&
		exercise_name_keys() &&
		exercise_random_and_crc() &&
		exercise_trig();

	shutdownMemoryManager();

	if (!ok) {
		return 1;
	}

	std::printf("{\"ok\":true,\"library\":\"GameEngine/Common\","
		"\"compiled\":\"GameMemory,CriticalSection,AsciiString,UnicodeString,"
		"SubsystemInterface,GameType,Trig,QuickTrig,NameKeyGenerator,RandomValue,crc\","
		"\"source\":\"GeneralsMD original\"}\n");
	return 0;
}
