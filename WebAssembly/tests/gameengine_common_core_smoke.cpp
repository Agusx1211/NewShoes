#include <cmath>
#include <cstdio>
#include <cstring>

#include "PreRTS.h"

#include "Common/AsciiString.h"
#include "Common/BezierSegment.h"
#include "Common/CRC.h"
#include "Common/Dict.h"
#include "Common/DiscreteCircle.h"
#include "Common/File.h"
#include "Common/FileSystem.h"
#include "Common/GameCommon.h"
#include "Common/GameMemory.h"
#include "Common/GameType.h"
#include "Common/Language.h"
#include "Common/List.h"
#include "Common/LocalFileSystem.h"
#include "Common/NameKeyGenerator.h"
#include "Common/PartitionSolver.h"
#include "Common/QuickTrig.h"
#include "Common/RandomValue.h"
#include "Common/string.h"
#include "Common/SubsystemInterface.h"
#include "Common/UnicodeString.h"
#include "Common/encrypt.h"
#include "GameClient/ClientRandomValue.h"
#include "GameLogic/LogicRandomValue.h"
#include "Lib/Trig.h"

SubsystemInterfaceList *TheSubsystemList = nullptr;

namespace {
class SmokeFile : public File
{
public:
	SmokeFile() : m_position(0) {}

	Int read(void *buffer, Int bytes) override
	{
		if (buffer == nullptr || bytes <= 0) {
			return 0;
		}
		const Int remaining = static_cast<Int>(m_data.size()) - m_position;
		const Int bytes_to_read = remaining <= 0 ? 0 : (bytes < remaining ? bytes : remaining);
		if (bytes_to_read > 0) {
			std::memcpy(buffer, m_data.data() + m_position, static_cast<std::size_t>(bytes_to_read));
			m_position += bytes_to_read;
		}
		return bytes_to_read;
	}

	Int write(const void *buffer, Int bytes) override
	{
		if (buffer == nullptr || bytes <= 0) {
			return 0;
		}
		const auto *source = static_cast<const char *>(buffer);
		const Int required_size = m_position + bytes;
		if (required_size > static_cast<Int>(m_data.size())) {
			m_data.resize(static_cast<std::size_t>(required_size));
		}
		std::memcpy(m_data.data() + m_position, source, static_cast<std::size_t>(bytes));
		m_position += bytes;
		return bytes;
	}

	Int seek(Int bytes, seekMode mode = CURRENT) override
	{
		Int base = 0;
		if (mode == CURRENT) {
			base = m_position;
		} else if (mode == END) {
			base = static_cast<Int>(m_data.size());
		}

		const Int limit = static_cast<Int>(m_data.size());
		const Int next = base + bytes;
		m_position = next < 0 ? 0 : (next > limit ? limit : next);
		return m_position;
	}

	void nextLine(Char *buf = nullptr, Int bufSize = 0) override
	{
		if (buf != nullptr && bufSize > 0) {
			buf[0] = 0;
		}
	}

	Bool scanInt(Int &) override { return FALSE; }
	Bool scanReal(Real &) override { return FALSE; }
	Bool scanString(AsciiString &) override { return FALSE; }

	char* readEntireAndClose() override
	{
		char *buffer = NEW char[m_data.size() + 1];
		if (buffer != nullptr) {
			std::memcpy(buffer, m_data.data(), m_data.size());
			buffer[m_data.size()] = 0;
		}
		close();
		return buffer;
	}

	File* convertToRAMFile() override { return this; }

private:
	std::vector<char> m_data;
	Int m_position;
};

class SmokeLocalFileSystem : public LocalFileSystem
{
public:
	void init() override { LocalFileSystem::init(); }
	void reset() override { LocalFileSystem::reset(); }
	void update() override { LocalFileSystem::update(); }
	File *openFile(const Char *, Int = 0) override { return nullptr; }
	Bool doesFileExist(const Char *) const override { return FALSE; }
	void getFileListInDirectory(const AsciiString&, const AsciiString&, const AsciiString&, FilenameList&, Bool) const override {}
	Bool getFileInfo(const AsciiString&, FileInfo *) const override { return FALSE; }
	Bool createDirectory(AsciiString) override { return FALSE; }
};

struct Scanline
{
	Int x_start;
	Int x_end;
	Int y;
};

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::fprintf(stderr, "%s\n", message);
		return false;
	}
	return true;
}

void collect_scanline(Int x_start, Int x_end, Int y, void *context)
{
	auto *lines = static_cast<std::vector<Scanline> *>(context);
	lines->push_back({ x_start, x_end, y });
}

bool near(Real actual, Real expected, Real epsilon = 0.015f)
{
	return std::fabs(actual - expected) <= epsilon;
}

bool exercise_memory_init()
{
	return expect(TheDynamicMemoryAllocator != nullptr, "dynamic memory allocator missing") &&
		expect(TheDynamicMemoryAllocator->getDmaMemoryPoolCount() == 7,
			"original MemoryInit DMA pool table was not linked") &&
		expect(TheDynamicMemoryAllocator->getNthDmaMemoryPool(0)->getAllocationSize() == 16,
			"original MemoryInit first DMA pool size changed");
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
	if (!expect(std::strcmp(round_trip.str(), text.str()) == 0, "AsciiString translate failed")) {
		return false;
	}

	WSYS_String wsys("zero");
	wsys += " hour";
	wsys.makeUpperCase();
	if (!expect(std::strcmp(wsys.get(), "ZERO HOUR") == 0, "WSYS_String append/upper failed")) {
		return false;
	}

	wsys.format("%s-%d", "GLA", 3);
	wsys.makeLowerCase();
	return expect(std::strcmp(wsys.get(), "gla-3") == 0, "WSYS_String format/lower failed");
}

bool exercise_language_and_encrypt()
{
	OurLanguage = LANGUAGE_ID_GERMAN;
	if (!expect(OurLanguage == LANGUAGE_ID_GERMAN, "Language global state failed")) {
		return false;
	}
	OurLanguage = LANGUAGE_ID_US;

	return expect(std::strcmp(EncryptString("China007"), "aFqEaEzO") == 0,
			"EncryptString China007 vector failed") &&
		expect(std::strcmp(EncryptString("ZeroHour"), "AchoaoIx") == 0,
			"EncryptString ZeroHour vector failed") &&
		expect(std::strlen(EncryptString("abcdefghi")) == MAX_ENCRYPTED_STRING,
			"EncryptString length clamp failed");
}

bool exercise_file_interfaces()
{
	SmokeFile invalid;
	if (!expect(!invalid.open("bad.dat", File::STREAMING | File::WRITE),
			"File rejected streaming writes failed")) {
		return false;
	}

	SmokeFile file;
	if (!expect(file.open("smoke.txt", File::TEXT | File::WRITE),
			"File open failed")) {
		return false;
	}

	const bool access_ok =
		expect((file.getAccess() & File::WRITE) != 0, "File write access missing") &&
		expect((file.getAccess() & File::TRUNCATE) != 0, "File truncate default missing") &&
		expect((file.getAccess() & File::TEXT) != 0, "File text access missing") &&
		expect(std::strcmp(file.getName(), "smoke.txt") == 0, "File name tracking failed");
	if (!access_ok) {
		return false;
	}

	if (!expect(file.print("%s-%d", "ZH", 5), "File print failed")) {
		return false;
	}
	if (!expect(file.size() == 4 && file.position() == 4, "File size/position failed")) {
		return false;
	}

	char buffer[5] = {};
	file.seek(0, File::START);
	const Int read = file.read(buffer, 4);
	if (!expect(read == 4 && std::strcmp(buffer, "ZH-5") == 0, "File readback failed")) {
		return false;
	}

	char *entire = file.readEntireAndClose();
	const bool entire_ok = expect(entire != nullptr && std::strcmp(entire, "ZH-5") == 0,
		"File readEntireAndClose failed");
	delete[] entire;
	if (!entire_ok) {
		return false;
	}

	SmokeFile default_read;
	if (!expect(default_read.open("read.bin"),
			"File default open failed")) {
		return false;
	}
	if (!expect((default_read.getAccess() & File::READ) != 0 &&
			(default_read.getAccess() & File::BINARY) != 0,
			"File read/binary defaults failed")) {
		return false;
	}

	FilenameList filenames;
	filenames.insert(AsciiString("zeta.ini"));
	filenames.insert(AsciiString("Alpha.ini"));
	filenames.insert(AsciiString("alpha.ini"));
	if (!expect(filenames.size() == 2, "FilenameList no-case uniqueness failed")) {
		return false;
	}
	if (!expect(std::strcmp(filenames.begin()->str(), "Alpha.ini") == 0,
			"FilenameList no-case ordering failed")) {
		return false;
	}

	SmokeLocalFileSystem local_file_system;
	TheLocalFileSystem = &local_file_system;
	local_file_system.init();
	local_file_system.update();
	local_file_system.reset();
	const bool global_ok = expect(TheLocalFileSystem == &local_file_system,
		"LocalFileSystem global pointer failed");
	TheLocalFileSystem = nullptr;
	return global_ok;
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
	MemoryPool *bucket_pool = TheMemoryPoolFactory->findMemoryPool("NameKeyBucketPool");

	const bool ok =
		expect(command_center == command_center_again, "NameKeyGenerator stable lookup failed") &&
		expect(command_center != barracks, "NameKeyGenerator unique key allocation failed") &&
		expect(lowercase == lowercase_again, "NameKeyGenerator lowercase lookup failed") &&
		expect(bucket_pool != nullptr, "NameKeyGenerator memory pool missing") &&
		expect(bucket_pool->getInitialBlockCount() == 9000, "original MemoryInit NameKey pool sizing was not applied") &&
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

bool exercise_game_common()
{
	return expect(std::strcmp(TheVeterancyNames[LEVEL_HEROIC], "HEROIC") == 0,
			"GameCommon veterancy names failed") &&
		expect(std::strcmp(TheRelationshipNames[ALLIES], "ALLIES") == 0,
			"GameCommon relationship names failed") &&
		expect(near(normalizeAngle(3.0f * PI), PI, 0.0001f), "normalizeAngle positive wrap failed") &&
		expect(near(std::fabs(normalizeAngle(-3.0f * PI)), PI, 0.0001f),
			"normalizeAngle negative wrap failed");
}

bool exercise_list_and_circle()
{
	Int first = 1;
	Int second = 2;
	LList list;
	list.addItemToHead(&first);
	list.addItemToTail(&second);
	const bool list_ok =
		expect(list.nodeCount() == 2, "LList node count failed") &&
		expect(list.firstNode()->item() == &first, "LList head insertion failed") &&
		expect(list.lastNode()->item() == &second, "LList tail insertion failed") &&
		expect(list.hasItem(&second), "LList item lookup failed");
	list.clear();
	if (!list_ok) {
		return false;
	}

	DiscreteCircle circle(0, 0, 2);
	std::vector<Scanline> lines;
	circle.drawCircle(collect_scanline, &lines);
	return expect(circle.getEdgeCount() == 3, "DiscreteCircle edge generation failed") &&
		expect(lines.size() == 5, "DiscreteCircle mirrored scanline draw failed") &&
		expect(lines.front().y == 2 && lines.front().x_start == -1 && lines.front().x_end == 1,
			"DiscreteCircle top scanline changed") &&
		expect(lines.back().y == 0 && lines.back().x_start == -2 && lines.back().x_end == 2,
			"DiscreteCircle center scanline changed");
}

bool exercise_bezier()
{
	BezierSegment segment(
		0.0f, 0.0f, 0.0f,
		1.0f, 0.0f, 0.0f,
		2.0f, 0.0f, 0.0f,
		3.0f, 0.0f, 0.0f);

	Coord3D midpoint;
	segment.evaluateBezSegmentAtT(0.5f, &midpoint);

	VecCoord3D points;
	segment.getSegmentPoints(4, &points);

	BezierSegment left;
	BezierSegment right;
	segment.splitSegmentAtT(0.5f, left, right);
	Coord3D split_left_end;
	Coord3D split_right_start;
	left.evaluateBezSegmentAtT(1.0f, &split_left_end);
	right.evaluateBezSegmentAtT(0.0f, &split_right_start);

	return expect(near(midpoint.x, 1.5f, 0.0001f) && near(midpoint.y, 0.0f, 0.0001f),
			"BezierSegment midpoint evaluation failed") &&
		expect(points.size() == 4 && near(points[0].x, 0.0f, 0.0001f) &&
			near(points[3].x, 3.0f, 0.0001f), "BezFwdIterator point generation failed") &&
		expect(near(segment.getApproximateLength(0.001f), 3.0f, 0.0001f),
			"BezierSegment approximate length failed") &&
		expect(near(split_left_end.x, split_right_start.x, 0.0001f) &&
			near(split_left_end.x, midpoint.x, 0.0001f), "BezierSegment split failed");
}

bool exercise_partition_solver()
{
	EntriesVec entries;
	entries.push_back(std::make_pair(static_cast<ObjectID>(11), 7U));
	entries.push_back(std::make_pair(static_cast<ObjectID>(12), 4U));
	entries.push_back(std::make_pair(static_cast<ObjectID>(13), 2U));

	SpacesVec spaces;
	spaces.push_back(std::make_pair(static_cast<ObjectID>(21), 8U));
	spaces.push_back(std::make_pair(static_cast<ObjectID>(22), 6U));

	PartitionSolver solver(entries, spaces, PREFER_FAST_SOLUTION);
	solver.solve();
	const SolutionVec &solution = solver.getSolution();
	return expect(solution.size() == 3, "PartitionSolver solution size failed") &&
		expect(solution[0].first == static_cast<ObjectID>(11) &&
			solution[0].second == static_cast<ObjectID>(21), "PartitionSolver first assignment failed") &&
		expect(solution[1].first == static_cast<ObjectID>(12) &&
			solution[1].second == static_cast<ObjectID>(22), "PartitionSolver second assignment failed") &&
		expect(solution[2].first == static_cast<ObjectID>(13) &&
			solution[2].second == static_cast<ObjectID>(22), "PartitionSolver residual assignment failed");
}

bool exercise_dict()
{
	const NameKeyType bool_key = static_cast<NameKeyType>(10);
	const NameKeyType int_key = static_cast<NameKeyType>(20);
	const NameKeyType real_key = static_cast<NameKeyType>(30);
	const NameKeyType ascii_key = static_cast<NameKeyType>(40);
	const NameKeyType unicode_key = static_cast<NameKeyType>(50);

	Dict dict;
	dict.setBool(bool_key, true);
	dict.setInt(int_key, 42);
	dict.setReal(real_key, 3.5f);
	dict.setAsciiString(ascii_key, AsciiString("supply"));

	UnicodeString wide;
	wide.translate(AsciiString("command"));
	dict.setUnicodeString(unicode_key, wide);

	Bool exists = false;
	const bool typed_ok =
		expect(dict.getPairCount() == 5, "Dict pair count failed") &&
		expect(dict.getBool(bool_key, &exists) == true && exists, "Dict bool lookup failed") &&
		expect(dict.getInt(int_key, &exists) == 42 && exists, "Dict int lookup failed") &&
		expect(near(dict.getReal(real_key, &exists), 3.5f, 0.0001f) && exists,
			"Dict real lookup failed") &&
		expect(std::strcmp(dict.getAsciiString(ascii_key, &exists).str(), "supply") == 0 && exists,
			"Dict AsciiString lookup failed") &&
		expect(dict.getUnicodeString(unicode_key, &exists).getLength() == wide.getLength() && exists,
			"Dict UnicodeString lookup failed");
	if (!typed_ok) {
		return false;
	}

	Dict shared = dict;
	shared.setInt(int_key, 7);
	shared.remove(bool_key);

	return expect(dict.getInt(int_key, &exists) == 42 && exists, "Dict copy-on-write source changed") &&
		expect(shared.getInt(int_key, &exists) == 7 && exists, "Dict copy-on-write update failed") &&
		expect(shared.getBool(bool_key, &exists) == false && !exists, "Dict remove failed") &&
		expect(shared.getNthKey(0) == int_key, "Dict sorted key order failed") &&
		expect(shared.getNthType(0) == Dict::DICT_INT, "Dict nth type failed");
}
}

int main()
{
	initMemoryManager();

	const bool ok = exercise_memory_init() &&
		exercise_strings() &&
		exercise_file_interfaces() &&
		exercise_name_keys() &&
		exercise_language_and_encrypt() &&
		exercise_random_and_crc() &&
		exercise_dict() &&
		exercise_trig() &&
		exercise_game_common() &&
		exercise_list_and_circle() &&
		exercise_bezier() &&
		exercise_partition_solver();

	shutdownMemoryManager();

	if (!ok) {
		return 1;
	}

	std::printf("{\"ok\":true,\"library\":\"GameEngine/Common\","
		"\"compiled\":\"GameMemory,CriticalSection,AsciiString,UnicodeString,"
		"WSYS_String,File,LocalFileSystem,SubsystemInterface,GameType,GameCommon,"
		"Trig,QuickTrig,List,Dict,DiscreteCircle,BezierSegment,BezFwdIterator,MemoryInit,Language,"
		"EncryptString,PartitionSolver,NameKeyGenerator,RandomValue,crc\","
		"\"source\":\"GeneralsMD original\"}\n");
	return 0;
}
