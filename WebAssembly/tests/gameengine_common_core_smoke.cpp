#include <cmath>
#include <cstdio>
#include <cstring>

#include "PreRTS.h"

#include "Common/AsciiString.h"
#include "Common/ArchiveFileSystem.h"
#include "Common/BezierSegment.h"
#include "Common/CDManager.h"
#include "Common/CRC.h"
#include "Common/Dict.h"
#include "Common/DisabledTypes.h"
#include "Common/DiscreteCircle.h"
#include "Common/File.h"
#include "Common/FileSystem.h"
#include "Common/GameCommon.h"
#include "Common/Geometry.h"
#include "Common/GameMemory.h"
#include "Common/GameType.h"
#include "Common/KindOf.h"
#include "Common/Language.h"
#include "Common/List.h"
#include "Common/LocalFileSystem.h"
#include "Common/ModelState.h"
#include "Common/NameKeyGenerator.h"
#include "Common/ObjectStatusTypes.h"
#include "Common/PartitionSolver.h"
#include "Common/QuickTrig.h"
#include "Common/RAMFile.h"
#include "Common/RandomValue.h"
#include "Common/Registry.h"
#include "Common/string.h"
#include "Common/SubsystemInterface.h"
#include "Common/UnicodeString.h"
#include "Common/encrypt.h"
#include "GameClient/ClientRandomValue.h"
#include "GameLogic/ArmorSet.h"
#include "GameLogic/GameLogic.h"
#include "GameLogic/LogicRandomValue.h"
#include "Lib/Trig.h"

SubsystemInterfaceList *TheSubsystemList = nullptr;
ArchiveFileSystem *TheArchiveFileSystem = nullptr;
GameLogic *TheGameLogic = nullptr;
class AudioManager;
AudioManager *TheAudio = nullptr;

namespace {
class SmokeCDManager : public CDManager
{
protected:
	CDDriveInterface* createDrive(void) override { return NEW CDDrive; }
};

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
	File *openFile(const Char *filename, Int access = 0) override
	{
		if (std::strcmp(filename, "local-smoke.txt") != 0) {
			return nullptr;
		}
		m_file.close();
		if (!m_file.open(filename, access)) {
			return nullptr;
		}
		return &m_file;
	}
	Bool doesFileExist(const Char *filename) const override
	{
		return std::strcmp(filename, "local-smoke.txt") == 0;
	}
	void getFileListInDirectory(const AsciiString&, const AsciiString&, const AsciiString&, FilenameList&, Bool) const override {}
	Bool getFileInfo(const AsciiString&, FileInfo *) const override { return FALSE; }
	Bool createDirectory(AsciiString) override { return FALSE; }

private:
	SmokeFile m_file;
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

bool exercise_file_system_dispatch()
{
	SmokeLocalFileSystem local_file_system;
	FileSystem file_system;
	TheLocalFileSystem = &local_file_system;
	TheFileSystem = &file_system;
	TheArchiveFileSystem = nullptr;

	File *opened = file_system.openFile("local-smoke.txt", File::READ | File::BINARY);
	const bool open_ok =
		expect(opened != nullptr, "FileSystem local open dispatch failed") &&
		expect((opened->getAccess() & File::READ) != 0, "FileSystem local file access missing") &&
		expect(std::strcmp(opened->getName(), "local-smoke.txt") == 0,
			"FileSystem local file name tracking failed");
	if (opened != nullptr) {
		opened->close();
	}

	const bool missing_ok = expect(file_system.openFile("missing.txt", File::READ) == nullptr,
		"FileSystem missing local/archive file should fail");

	TheFileSystem = nullptr;
	TheLocalFileSystem = nullptr;
	return open_ok && missing_ok;
}

bool exercise_ram_file()
{
	SmokeFile source;
	if (!expect(source.open("ram-source.txt", File::READWRITE | File::TEXT | File::CREATE),
			"RAMFile source open failed")) {
		return false;
	}
	if (!expect(source.write("17 3.25 USA\nnext", 16) == 16, "RAMFile source write failed")) {
		return false;
	}
	source.seek(0, File::START);

	RAMFile *ram = newInstance(RAMFile);
	if (!expect(ram != nullptr, "RAMFile allocation failed")) {
		return false;
	}
	if (!expect(ram->open(&source), "RAMFile open from File failed")) {
		ram->deleteInstance();
		return false;
	}
	if (!expect(ram->size() == 16 && ram->position() == 0, "RAMFile size/position failed")) {
		ram->deleteInstance();
		return false;
	}

	Int integer = 0;
	Real real = 0.0f;
	AsciiString token;
	char line[16] = {};
	const bool scan_ok =
		expect(ram->scanInt(integer) && integer == 17, "RAMFile scanInt failed") &&
		expect(ram->scanReal(real) && near(real, 3.25f, 0.0001f), "RAMFile scanReal failed") &&
		expect(ram->scanString(token) && std::strcmp(token.str(), "USA") == 0,
			"RAMFile scanString failed");
	if (!scan_ok) {
		ram->deleteInstance();
		return false;
	}
	ram->seek(0, File::START);
	ram->nextLine(line, sizeof(line));
	if (!expect(std::strcmp(line, "17 3.25 USA\n") == 0, "RAMFile nextLine failed")) {
		ram->deleteInstance();
		return false;
	}

	ram->seek(0, File::START);
	char buffer[4] = {};
	if (!expect(ram->read(buffer, 3) == 3 && std::strncmp(buffer, "17 ", 3) == 0,
			"RAMFile read failed")) {
		ram->deleteInstance();
		return false;
	}
	if (!expect(ram->write("x", 1) == -1, "RAMFile write should be read-only")) {
		ram->deleteInstance();
		return false;
	}

	char *entire = ram->readEntireAndClose();
	const bool entire_ok = expect(entire != nullptr && std::strncmp(entire, "17 3.25 USA", 11) == 0,
		"RAMFile readEntireAndClose failed");
	delete[] entire;
	ram->deleteInstance();
	return entire_ok;
}

bool exercise_registry_defaults()
{
	AsciiString value("unchanged");
	UnsignedInt version = 7;

	return expect(!GetStringFromRegistry("", "Language", value), "browser registry string query should miss") &&
		expect(std::strcmp(value.str(), "unchanged") == 0, "registry miss should not mutate string value") &&
		expect(!GetUnsignedIntFromRegistry("", "Version", version), "browser registry integer query should miss") &&
		expect(version == 7, "registry miss should not mutate integer value") &&
		expect(std::strcmp(GetRegistryLanguage().str(), "english") == 0, "registry language default failed") &&
		expect(std::strcmp(GetRegistryGameName().str(), "GeneralsMPTest") == 0, "registry SKU default failed") &&
		expect(GetRegistryVersion() == 65536, "registry version default failed") &&
		expect(GetRegistryMapPackVersion() == 65536, "registry map pack default failed");
}

bool exercise_cd_manager()
{
	GameLogic logic;
	TheGameLogic = &logic;

	SmokeCDManager manager;
	TheCDManager = &manager;
	manager.init();
	if (!expect(manager.driveCount() == 0, "CDManager initial drive count failed")) {
		TheCDManager = nullptr;
		TheGameLogic = nullptr;
		return false;
	}

	CDDriveInterface *drive = manager.newDrive("D:\\");
	const bool drive_ok =
		expect(drive != nullptr, "CDManager newDrive failed") &&
		expect(manager.driveCount() == 1, "CDManager drive count failed") &&
		expect(manager.getDrive(0) == drive, "CDManager getDrive failed") &&
		expect(std::strcmp(drive->getPath().str(), "D:\\") == 0, "CDDrive path failed") &&
		expect(drive->getDisk() == CD::UNKNOWN_DISK, "CDDrive default disk failed");
	if (!drive_ok) {
		TheCDManager = nullptr;
		TheGameLogic = nullptr;
		return false;
	}

	manager.refreshDrives();
	manager.update();
	manager.reset();
	manager.destroyAllDrives();
	const bool destroyed_ok = expect(manager.driveCount() == 0, "CDManager destroyAllDrives failed");
	TheCDManager = nullptr;
	TheGameLogic = nullptr;
	return destroyed_ok;
}

bool exercise_type_masks()
{
	initDisabledMasks();
	initKindOfMasks();

	ObjectStatusMaskType status = MAKE_OBJECT_STATUS_MASK(OBJECT_STATUS_STEALTHED);
	status.set(OBJECT_STATUS_DETECTED);

	return expect(TEST_DISABLEDMASK(DISABLEDMASK_ALL, DISABLED_EMP),
			"Disabled mask all initialization failed") &&
		expect(!TEST_DISABLEDMASK(DISABLEDMASK_NONE, DISABLED_EMP),
			"Disabled mask none initialization failed") &&
		expect(TEST_KINDOFMASK(KINDOFMASK_FS, KINDOF_FS_FACTORY) &&
			TEST_KINDOFMASK(KINDOFMASK_FS, KINDOF_FS_SUPERWEAPON),
			"KindOf faction-structure mask initialization failed") &&
		expect(!TEST_KINDOFMASK(KINDOFMASK_FS, KINDOF_INFANTRY),
			"KindOf faction-structure mask rejected infantry failed") &&
		expect(TEST_OBJECT_STATUS_MASK(status, OBJECT_STATUS_STEALTHED) &&
			TEST_OBJECT_STATUS_MASK(status, OBJECT_STATUS_DETECTED),
			"ObjectStatus mask set/test failed") &&
		expect(!TEST_OBJECT_STATUS_MASK(OBJECT_STATUS_MASK_NONE, OBJECT_STATUS_STEALTHED),
			"ObjectStatus none mask failed");
}

bool exercise_bit_flags()
{
	ModelConditionFlags model_flags;
	model_flags.set(MODELCONDITION_DAMAGED);
	model_flags.set(MODELCONDITION_MOVING);

	AsciiString description;
	model_flags.buildDescription(&description);

	ArmorSetFlags armor_flags;
	armor_flags.set(ARMORSET_VETERAN);
	const bool armor_name_ok = armor_flags.setBitByName("CRATE_UPGRADE_TWO");

	return expect(model_flags.count() == 2, "ModelConditionFlags count failed") &&
		expect(std::strcmp(ModelConditionFlags::getNameFromSingleBit(MODELCONDITION_DAMAGED), "DAMAGED") == 0,
			"ModelConditionFlags name table failed") &&
		expect(ModelConditionFlags::getSingleBitFromName("moving") == MODELCONDITION_MOVING,
			"ModelConditionFlags case-insensitive lookup failed") &&
		expect(std::strstr(description.str(), "DAMAGED") != nullptr &&
			std::strstr(description.str(), "MOVING") != nullptr,
			"ModelConditionFlags description failed") &&
		expect(armor_name_ok && armor_flags.test(ARMORSET_CRATE_UPGRADE_TWO),
			"ArmorSetFlags name lookup failed") &&
		expect(std::strcmp(ArmorSetFlags::getNameFromSingleBit(ARMORSET_VETERAN), "VETERAN") == 0,
			"ArmorSetFlags name table failed");
}

bool exercise_geometry()
{
	GeometryInfo sphere(GEOMETRY_SPHERE, TRUE, 0.0f, 5.0f, 0.0f);
	if (!expect(near(sphere.getBoundingCircleRadius(), 5.0f, 0.0001f) &&
			near(sphere.getBoundingSphereRadius(), 5.0f, 0.0001f),
			"GeometryInfo sphere bounds failed")) {
		return false;
	}
	if (!expect(near(sphere.getFootprintArea(), PI * 25.0f, 0.001f),
			"GeometryInfo sphere area failed")) {
		return false;
	}

	GeometryInfo box(GEOMETRY_BOX, FALSE, 6.0f, 3.0f, 2.0f);
	const Coord3D origin = { 0.0f, 0.0f, 0.0f };
	Region2D bounds = {};
	box.get2DBounds(origin, 0.0f, bounds);
	if (!expect(near(bounds.lo.x, -3.0f, 0.0001f) && near(bounds.lo.y, -2.0f, 0.0001f) &&
			near(bounds.hi.x, 3.0f, 0.0001f) && near(bounds.hi.y, 2.0f, 0.0001f),
			"GeometryInfo box 2D bounds failed")) {
		return false;
	}

	Coord3D center = {};
	box.getCenterPosition(origin, center);
	Coord3D point = { 10.0f, -10.0f, 0.0f };
	box.clipPointToFootprint(origin, point);

	const bool box_ok =
		expect(near(box.getBoundingCircleRadius(), std::sqrt(13.0f), 0.0001f),
			"GeometryInfo box bounding circle failed") &&
		expect(near(box.getBoundingSphereRadius(), std::sqrt(22.0f), 0.0001f),
			"GeometryInfo box bounding sphere failed") &&
		expect(near(box.getFootprintArea(), 24.0f, 0.0001f), "GeometryInfo box area failed") &&
		expect(near(box.getMaxHeightAbovePosition(), 6.0f, 0.0001f) &&
			near(box.getMaxHeightBelowPosition(), 0.0f, 0.0001f) &&
			near(center.z, 3.0f, 0.0001f), "GeometryInfo box height/center failed") &&
		expect(near(point.x, 3.0f, 0.0001f) && near(point.y, -2.0f, 0.0001f),
			"GeometryInfo box footprint clipping failed") &&
		expect(box.isPointInFootprint(origin, Coord3D{ 2.5f, 1.5f, 0.0f }),
			"GeometryInfo box footprint inclusion failed") &&
		expect(!box.isPointInFootprint(origin, Coord3D{ 3.5f, 1.5f, 0.0f }),
			"GeometryInfo box footprint exclusion failed");
	if (!box_ok) {
		return false;
	}

	box.expandFootprint(1.0f);
	return expect(near(box.getMajorRadius(), 4.0f, 0.0001f) &&
			near(box.getMinorRadius(), 3.0f, 0.0001f) &&
			near(box.getFootprintArea(), 48.0f, 0.0001f),
			"GeometryInfo footprint expansion failed");
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
		exercise_file_system_dispatch() &&
		exercise_ram_file() &&
		exercise_registry_defaults() &&
		exercise_cd_manager() &&
		exercise_type_masks() &&
		exercise_bit_flags() &&
		exercise_geometry() &&
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
		"WSYS_String,File,LocalFileSystem,FileSystem,RAMFile,SubsystemInterface,CDManager,Registry,"
		"GameType,GameCommon,Trig,QuickTrig,List,DisabledTypes,KindOf,ObjectStatusTypes,"
		"BitFlags,Snapshot,Geometry,MiniLog,Dict,DiscreteCircle,BezierSegment,BezFwdIterator,MemoryInit,Language,"
		"EncryptString,PartitionSolver,NameKeyGenerator,RandomValue,crc\","
		"\"source\":\"GeneralsMD original\"}\n");
	return 0;
}
