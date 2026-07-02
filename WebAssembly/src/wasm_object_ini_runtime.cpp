// Real ThingFactory / ThingTemplate object-template runtime probe.
//
// Mirrors the GameEngine::init() TheThingFactory bring-up
// (GeneralsMD/Code/GameEngine/Source/Common/GameEngine.cpp:482):
//   initSubsystem(TheThingFactory, createThingFactory(), &xferCRC,
//                 "Data\\INI\\Default\\Object.ini", NULL, "Data\\INI\\Object");
// using the real W3DModuleFactory / W3DThingFactory device factories and the
// original INI::load / INI::parseObjectDefinition parse path against the real
// shipped archives.

#include <cstddef>
#include <string>

#include "PreRTS.h"

#include "wasm_memory_manager_scope.h"

#include "Common/ArchiveFileSystem.h"
#include "Common/AudioEventRTS.h"
#include "Common/DamageFX.h"
#include "Common/File.h"
#include "Common/FileSystem.h"
#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "Common/Errors.h"
#include "Common/INI.h"
#include "Common/INIException.h"
#include "Common/LocalFileSystem.h"
#include "Common/ModuleFactory.h"
#include "Common/NameKeyGenerator.h"
#include "Common/Science.h"
#include "Common/SpecialPower.h"
#include "Common/ThingFactory.h"
#include "Common/ThingTemplate.h"
#include "Common/Xfer.h"
#include "Common/XferCRC.h"
#include "GameClient/FXList.h"
#include "GameClient/GameText.h"
#include "GameClient/ParticleSys.h"
#include "GameLogic/Armor.h"
#include "GameLogic/Damage.h"
#include "GameLogic/Locomotor.h"
#include "GameLogic/ObjectCreationList.h"
#include "GameLogic/Weapon.h"
#include "W3DDevice/Common/W3DModuleFactory.h"
#include "W3DDevice/Common/W3DThingFactory.h"
#include "Win32Device/Common/Win32BIGFileSystem.h"
#include "Win32Device/Common/Win32LocalFileSystem.h"

#include <emscripten/emscripten.h>

namespace {

constexpr const char DEFAULT_OBJECT_INI_PATH[] = "Data\\INI\\Default\\Object.ini";
constexpr const char OBJECT_INI_DIRECTORY[] = "Data\\INI\\Object";
constexpr const char GAME_DATA_INI_PATH[] = "Data\\INI\\GameData.ini";
constexpr const char SCIENCE_INI_PATH[] = "Data\\INI\\Science.ini";
constexpr const char FX_LIST_INI_PATH[] = "Data\\INI\\FXList.ini";
constexpr const char WEAPON_INI_PATH[] = "Data\\INI\\Weapon.ini";
constexpr const char OBJECT_CREATION_LIST_INI_PATH[] = "Data\\INI\\ObjectCreationList.ini";
constexpr const char LOCOMOTOR_INI_PATH[] = "Data\\INI\\Locomotor.ini";
constexpr const char SPECIAL_POWER_INI_PATH[] = "Data\\INI\\SpecialPower.ini";
constexpr const char DAMAGE_FX_INI_PATH[] = "Data\\INI\\DamageFX.ini";
constexpr const char ARMOR_INI_PATH[] = "Data\\INI\\Armor.ini";

class ObjectProbeParticleSystemManager final : public ParticleSystemManager
{
public:
	Int getOnScreenParticleCount(void) override { return 0; }
	void doParticles(RenderInfoClass &) override {}
	void queueParticleRender() override {}
};

void split_archive_path(const char *archive_path, AsciiString &directory, AsciiString &file_mask)
{
	std::string normalized = archive_path != nullptr ? archive_path : "";
	for (char &character : normalized) {
		if (character == '\\') {
			character = '/';
		}
	}

	const std::string::size_type separator = normalized.find_last_of('/');
	if (separator == std::string::npos) {
		directory = "";
		file_mask = normalized.c_str();
		return;
	}

	directory = std::string(normalized, 0, separator + 1).c_str();
	file_mask = std::string(normalized, separator + 1).c_str();
}

void append_json_escaped(std::string &out, const char *text)
{
	for (const char *p = text != nullptr ? text : ""; *p != '\0'; ++p) {
		const unsigned char c = static_cast<unsigned char>(*p);
		switch (c) {
		case '"': out += "\\\""; break;
		case '\\': out += "\\\\"; break;
		case '\n': out += "\\n"; break;
		case '\r': out += "\\r"; break;
		case '\t': out += "\\t"; break;
		default:
			if (c < 0x20 || c > 0x7e) {
				char buffer[8];
				std::snprintf(buffer, sizeof(buffer), "\\u%04x", c);
				out += buffer;
			} else {
				out += static_cast<char>(c);
			}
			break;
		}
	}
}

struct TemplateLookupReport
{
	std::string name;
	bool found = false;
	std::string side;
	int buildCost = 0;
	int transportSlotCount = 0;
	bool isVehicle = false;
	bool isInfantry = false;
	bool isSelectable = false;
	std::string displayName;
	unsigned templateID = 0;
};

struct ObjectIniProbeReport
{
	bool attempted = false;
	std::string stage = "not_started";
	std::string error;
	std::string archivePath;
	bool loadedArchives = false;
	bool defaultObjectIniExists = false;
	std::size_t defaultObjectIniBytes = 0;
	bool gameDataLoaded = false;
	bool gameTextCsfLoaded = false;
	bool scienceLoaded = false;
	bool particleSystemLoaded = false;
	bool fxListLoaded = false;
	bool weaponLoaded = false;
	bool objectCreationListLoaded = false;
	bool locomotorLoaded = false;
	bool specialPowerLoaded = false;
	bool damageFXLoaded = false;
	bool armorLoaded = false;
	bool moduleFactoryInitialized = false;
	bool moduleFactoryIsW3D = false;
	bool hasW3DDefaultDraw = false;
	bool hasW3DModelDraw = false;
	bool hasDestroyDie = false;
	bool hasInactiveBody = false;
	bool hasAIUpdateInterface = false;
	bool hasGarrisonContain = false;
	bool thingFactoryIsW3D = false;
	bool defaultObjectIniLoaded = false;
	std::size_t objectIniFileCount = 0;
	std::size_t fileSystemObjectIniFileCount = 0;
	std::size_t objectIniFilesLoaded = 0;
	std::string firstObjectIniFile;
	bool objectDirectoryLoaded = false;
	std::string failingObjectIniFile;
	int failingObjectIniLine = 0;
	std::string failingObjectIniError;
	std::size_t templateCount = 0;
	unsigned xferCRC = 0;
	TemplateLookupReport lookups[5];
	bool ok = false;
};

std::size_t count_templates(ThingFactory &factory)
{
	std::size_t count = 0;
	for (const ThingTemplate *tmpl = factory.firstTemplate(); tmpl != nullptr;
			tmpl = tmpl->friend_getNextTemplate()) {
		++count;
	}
	return count;
}

void inspect_template(ThingFactory &factory, const char *name, TemplateLookupReport &out)
{
	out.name = name;
	const ThingTemplate *tmpl = factory.findTemplate(AsciiString(name), FALSE);
	out.found = tmpl != nullptr;
	if (tmpl == nullptr) {
		return;
	}
	out.side = tmpl->getDefaultOwningSide().str();
	out.buildCost = tmpl->friend_getBuildCost();
	out.transportSlotCount = static_cast<int>(tmpl->getRawTransportSlotCount());
	out.isVehicle = tmpl->isKindOf(KINDOF_VEHICLE) != 0;
	out.isInfantry = tmpl->isKindOf(KINDOF_INFANTRY) != 0;
	out.isSelectable = tmpl->isKindOf(KINDOF_SELECTABLE) != 0;
	out.templateID = tmpl->getTemplateID();

	const UnicodeString &display = tmpl->getDisplayName();
	AsciiString narrowed;
	narrowed.translate(display);
	out.displayName = narrowed.str();
}

void serialize_report(const ObjectIniProbeReport &report, std::string &out)
{
	char buffer[256];
	out.clear();
	out += "{";
	out += "\"attempted\":";
	out += report.attempted ? "true" : "false";
	out += ",\"source\":\"GameEngine.cpp::init initSubsystem(TheThingFactory) + "
		"W3DModuleFactory::init + ThingFactory::parseObjectDefinition + INI.cpp::load/loadDirectory\"";
	out += ",\"stage\":\"";
	append_json_escaped(out, report.stage.c_str());
	out += "\",\"error\":\"";
	append_json_escaped(out, report.error.c_str());
	out += "\",\"archivePath\":\"";
	append_json_escaped(out, report.archivePath.c_str());
	out += "\"";

	std::snprintf(
		buffer,
		sizeof(buffer),
		",\"loadedArchives\":%s,\"defaultObjectIniExists\":%s,\"defaultObjectIniBytes\":%zu",
		report.loadedArchives ? "true" : "false",
		report.defaultObjectIniExists ? "true" : "false",
		report.defaultObjectIniBytes);
	out += buffer;

	const struct { const char *key; bool value; } flags[] = {
		{ "gameDataLoaded", report.gameDataLoaded },
		{ "gameTextCsfLoaded", report.gameTextCsfLoaded },
		{ "scienceLoaded", report.scienceLoaded },
		{ "particleSystemLoaded", report.particleSystemLoaded },
		{ "fxListLoaded", report.fxListLoaded },
		{ "weaponLoaded", report.weaponLoaded },
		{ "objectCreationListLoaded", report.objectCreationListLoaded },
		{ "locomotorLoaded", report.locomotorLoaded },
		{ "specialPowerLoaded", report.specialPowerLoaded },
		{ "damageFXLoaded", report.damageFXLoaded },
		{ "armorLoaded", report.armorLoaded },
		{ "moduleFactoryInitialized", report.moduleFactoryInitialized },
		{ "moduleFactoryIsW3D", report.moduleFactoryIsW3D },
		{ "hasW3DDefaultDraw", report.hasW3DDefaultDraw },
		{ "hasW3DModelDraw", report.hasW3DModelDraw },
		{ "hasDestroyDie", report.hasDestroyDie },
		{ "hasInactiveBody", report.hasInactiveBody },
		{ "hasAIUpdateInterface", report.hasAIUpdateInterface },
		{ "hasGarrisonContain", report.hasGarrisonContain },
		{ "thingFactoryIsW3D", report.thingFactoryIsW3D },
		{ "defaultObjectIniLoaded", report.defaultObjectIniLoaded },
		{ "objectDirectoryLoaded", report.objectDirectoryLoaded },
		{ "ok", report.ok },
	};
	for (const auto &flag : flags) {
		out += ",\"";
		out += flag.key;
		out += "\":";
		out += flag.value ? "true" : "false";
	}

	std::snprintf(
		buffer,
		sizeof(buffer),
		",\"objectIniFileCount\":%zu,\"fileSystemObjectIniFileCount\":%zu,"
		"\"objectIniFilesLoaded\":%zu,\"templateCount\":%zu,\"xferCRC\":%u",
		report.objectIniFileCount,
		report.fileSystemObjectIniFileCount,
		report.objectIniFilesLoaded,
		report.templateCount,
		report.xferCRC);
	out += buffer;
	out += ",\"firstObjectIniFile\":\"";
	append_json_escaped(out, report.firstObjectIniFile.c_str());
	out += "\",\"failingObjectIniFile\":\"";
	append_json_escaped(out, report.failingObjectIniFile.c_str());
	out += "\",\"failingObjectIniError\":\"";
	append_json_escaped(out, report.failingObjectIniError.c_str());
	std::snprintf(buffer, sizeof(buffer), "\",\"failingObjectIniLine\":%d", report.failingObjectIniLine);
	out += buffer;

	out += ",\"lookups\":[";
	bool first = true;
	for (const TemplateLookupReport &lookup : report.lookups) {
		if (lookup.name.empty()) {
			continue;
		}
		if (!first) {
			out += ",";
		}
		first = false;
		out += "{\"name\":\"";
		append_json_escaped(out, lookup.name.c_str());
		out += "\",\"found\":";
		out += lookup.found ? "true" : "false";
		out += ",\"side\":\"";
		append_json_escaped(out, lookup.side.c_str());
		out += "\",\"displayName\":\"";
		append_json_escaped(out, lookup.displayName.c_str());
		std::snprintf(
			buffer,
			sizeof(buffer),
			"\",\"buildCost\":%d,\"transportSlotCount\":%d,\"isVehicle\":%s,\"isInfantry\":%s,"
			"\"isSelectable\":%s,\"templateID\":%u}",
			lookup.buildCost,
			lookup.transportSlotCount,
			lookup.isVehicle ? "true" : "false",
			lookup.isInfantry ? "true" : "false",
			lookup.isSelectable ? "true" : "false",
			lookup.templateID);
		out += buffer;
	}
	out += "]}";
}

void run_object_ini_probe(
	const char *archive_path,
	ObjectIniProbeReport &report,
	const char *snippet_path = nullptr)
{
	report.attempted = true;
	report.archivePath = archive_path != nullptr ? archive_path : "";
	report.stage = "split_archive_path";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		report.error = "empty archive mask";
		return;
	}

	ScopedOriginalMemoryManager memory_manager_scope;

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	GlobalData *old_global_data = TheWritableGlobalData;
	GameTextInterface *old_game_text = TheGameText;
	ScienceStore *old_science_store = TheScienceStore;
	ParticleSystemManager *old_particle_system_manager = TheParticleSystemManager;
	FXListStore *old_fx_list_store = TheFXListStore;
	WeaponStore *old_weapon_store = TheWeaponStore;
	ObjectCreationListStore *old_object_creation_list_store = TheObjectCreationListStore;
	LocomotorStore *old_locomotor_store = TheLocomotorStore;
	SpecialPowerStore *old_special_power_store = TheSpecialPowerStore;
	DamageFXStore *old_damage_fx_store = TheDamageFXStore;
	ArmorStore *old_armor_store = TheArmorStore;
	ModuleFactory *old_module_factory = TheModuleFactory;
	ThingFactory *old_thing_factory = TheThingFactory;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	NameKeyGenerator *name_key_generator = nullptr;
	GlobalData *global_data = nullptr;
	GameTextInterface *game_text = nullptr;
	ScienceStore *science_store = nullptr;
	ObjectProbeParticleSystemManager *particle_system_manager = nullptr;
	FXListStore *fx_list_store = nullptr;
	WeaponStore *weapon_store = nullptr;
	ObjectCreationListStore *object_creation_list_store = nullptr;
	LocomotorStore *locomotor_store = nullptr;
	SpecialPowerStore *special_power_store = nullptr;
	DamageFXStore *damage_fx_store = nullptr;
	ArmorStore *armor_store = nullptr;
	W3DModuleFactory *module_factory = nullptr;
	W3DThingFactory *thing_factory = nullptr;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

		report.stage = "load_archives";
		report.loadedArchives =
			archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (!report.loadedArchives) {
			report.error = "loadBigFilesFromDirectory failed";
			return;
		}

		FileInfo default_object_file_info = {};
		report.defaultObjectIniExists =
			archive_file_system.getFileInfo(
				AsciiString(DEFAULT_OBJECT_INI_PATH), &default_object_file_info) &&
			default_object_file_info.sizeHigh == 0 &&
			default_object_file_info.sizeLow > 0;
		report.defaultObjectIniBytes = report.defaultObjectIniExists ?
			static_cast<std::size_t>(default_object_file_info.sizeLow) : 0U;

		FilenameList object_ini_files;
		AsciiString archive_object_directory(OBJECT_INI_DIRECTORY);
		archive_object_directory.concat('\\');
		archive_file_system.getFileListInDirectory(
			AsciiString(""),
			archive_object_directory,
			AsciiString("*.ini"),
			object_ini_files,
			TRUE);
		report.objectIniFileCount = object_ini_files.size();
		if (!object_ini_files.empty()) {
			report.firstObjectIniFile = object_ini_files.begin()->str();
		}

		{
			// Mirror INI::loadDirectory's own enumeration (FileSystem combines
			// the local and archive file systems) as a cross-check.
			FilenameList fs_object_ini_files;
			AsciiString fs_directory(OBJECT_INI_DIRECTORY);
			fs_directory.concat('\\');
			file_system.getFileListInDirectory(
				fs_directory,
				AsciiString("*.ini"),
				fs_object_ini_files,
				TRUE);
			report.fileSystemObjectIniFileCount = fs_object_ini_files.size();
		}

		// GameEngine.cpp:314 TheNameKeyGenerator
		report.stage = "name_key_generator";
		name_key_generator = NEW NameKeyGenerator;
		TheNameKeyGenerator = name_key_generator;
		name_key_generator->init();

		// GameEngine.cpp:338 xferCRC.open("lightCRC")
		XferCRC xferCRC;
		xferCRC.open("lightCRC");

		// GameEngine.cpp:363 TheWritableGlobalData + GameData.ini
		// (Data\INI\Default\GameData.ini is not shipped inside INIZH.big.)
		report.stage = "global_data";
		global_data = NEW GlobalData;
		TheWritableGlobalData = global_data;
		{
			INI ini;
			ini.load(AsciiString(GAME_DATA_INI_PATH), INI_LOAD_OVERWRITE, &xferCRC);
		}
		report.gameDataLoaded = true;

		// GameEngine.cpp:412 TheGameText (DisplayName labels resolve through it).
		report.stage = "game_text";
		game_text = CreateGameTextInterface();
		TheGameText = game_text;
		game_text->init();
		{
			// When no CSF/STR data is present every fetch returns the same
			// "string manager failed" placeholder; distinct real labels only
			// resolve to distinct text when the shipped string file loaded.
			const UnicodeString humvee = game_text->fetch("OBJECT:Humvee");
			const UnicodeString rebel = game_text->fetch("OBJECT:Rebel");
			report.gameTextCsfLoaded = humvee.compare(rebel) != 0;
		}

		// GameEngine.cpp:422 TheScienceStore + Science.ini
		report.stage = "science";
		science_store = NEW ScienceStore;
		TheScienceStore = science_store;
		science_store->init();
		{
			INI ini;
			ini.load(AsciiString(SCIENCE_INI_PATH), INI_LOAD_OVERWRITE, &xferCRC);
		}
		report.scienceLoaded = true;

		// GameEngine.cpp:447 TheModuleFactory = createModuleFactory() → W3DModuleFactory
		report.stage = "module_factory";
		module_factory = NEW W3DModuleFactory;
		TheModuleFactory = module_factory;
		module_factory->init();
		report.moduleFactoryInitialized = true;
		report.moduleFactoryIsW3D = true;
		report.hasW3DDefaultDraw =
			module_factory->findModuleInterfaceMask(
				AsciiString("W3DDefaultDraw"), MODULETYPE_DRAW) != 0;
		report.hasW3DModelDraw =
			module_factory->findModuleInterfaceMask(
				AsciiString("W3DModelDraw"), MODULETYPE_DRAW) != 0;
		report.hasDestroyDie =
			module_factory->findModuleInterfaceMask(
				AsciiString("DestroyDie"), MODULETYPE_BEHAVIOR) != 0;
		report.hasInactiveBody =
			module_factory->findModuleInterfaceMask(
				AsciiString("InactiveBody"), MODULETYPE_BEHAVIOR) != 0;
		report.hasAIUpdateInterface =
			module_factory->findModuleInterfaceMask(
				AsciiString("AIUpdateInterface"), MODULETYPE_BEHAVIOR) != 0;
		report.hasGarrisonContain =
			module_factory->findModuleInterfaceMask(
				AsciiString("GarrisonContain"), MODULETYPE_BEHAVIOR) != 0;

		// GameEngine.cpp:453 TheParticleSystemManager (init loads ParticleSystem.ini)
		report.stage = "particle_system";
		particle_system_manager = NEW ObjectProbeParticleSystemManager;
		TheParticleSystemManager = particle_system_manager;
		particle_system_manager->init();
		report.particleSystemLoaded = true;

		// GameEngine.cpp:463 TheFXListStore + FXList.ini
		report.stage = "fx_list";
		fx_list_store = NEW FXListStore;
		TheFXListStore = fx_list_store;
		fx_list_store->init();
		{
			INI ini;
			ini.load(AsciiString(FX_LIST_INI_PATH), INI_LOAD_OVERWRITE, &xferCRC);
		}
		report.fxListLoaded = true;

		// GameEngine.cpp:464 TheWeaponStore + Weapon.ini
		report.stage = "weapon";
		weapon_store = NEW WeaponStore;
		TheWeaponStore = weapon_store;
		weapon_store->init();
		initDamageTypeFlags();
		{
			INI ini;
			ini.load(AsciiString(WEAPON_INI_PATH), INI_LOAD_OVERWRITE, &xferCRC);
		}
		report.weaponLoaded = true;

		// GameEngine.cpp:465 TheObjectCreationListStore + ObjectCreationList.ini
		report.stage = "object_creation_list";
		object_creation_list_store = NEW ObjectCreationListStore;
		TheObjectCreationListStore = object_creation_list_store;
		object_creation_list_store->init();
		{
			INI ini;
			ini.load(AsciiString(OBJECT_CREATION_LIST_INI_PATH), INI_LOAD_OVERWRITE, &xferCRC);
		}
		report.objectCreationListLoaded = true;

		// GameEngine.cpp:466 TheLocomotorStore + Locomotor.ini
		report.stage = "locomotor";
		locomotor_store = NEW LocomotorStore;
		TheLocomotorStore = locomotor_store;
		locomotor_store->init();
		{
			INI ini;
			ini.load(AsciiString(LOCOMOTOR_INI_PATH), INI_LOAD_OVERWRITE, &xferCRC);
		}
		report.locomotorLoaded = true;

		// GameEngine.cpp:467 TheSpecialPowerStore + SpecialPower.ini
		report.stage = "special_power";
		special_power_store = NEW SpecialPowerStore;
		TheSpecialPowerStore = special_power_store;
		special_power_store->init();
		{
			INI ini;
			ini.load(AsciiString(SPECIAL_POWER_INI_PATH), INI_LOAD_OVERWRITE, &xferCRC);
		}
		report.specialPowerLoaded = true;

		// GameEngine.cpp:468 TheDamageFXStore + DamageFX.ini
		report.stage = "damage_fx";
		damage_fx_store = NEW DamageFXStore;
		TheDamageFXStore = damage_fx_store;
		damage_fx_store->init();
		{
			INI ini;
			ini.load(AsciiString(DAMAGE_FX_INI_PATH), INI_LOAD_OVERWRITE, &xferCRC);
		}
		report.damageFXLoaded = true;

		// GameEngine.cpp:469 TheArmorStore + Armor.ini
		report.stage = "armor";
		armor_store = NEW ArmorStore;
		TheArmorStore = armor_store;
		armor_store->init();
		{
			INI ini;
			ini.load(AsciiString(ARMOR_INI_PATH), INI_LOAD_OVERWRITE, &xferCRC);
		}
		report.armorLoaded = true;

		// GameEngine.cpp:482 TheThingFactory = createThingFactory() → W3DThingFactory
		report.stage = "thing_factory_init";
		thing_factory = NEW W3DThingFactory;
		TheThingFactory = thing_factory;
		thing_factory->init();
		report.thingFactoryIsW3D = true;

		report.stage = "default_object_ini";
		{
			INI ini;
			ini.load(AsciiString(DEFAULT_OBJECT_INI_PATH), INI_LOAD_OVERWRITE, &xferCRC);
		}
		report.defaultObjectIniLoaded = true;

		if (snippet_path != nullptr && snippet_path[0] != '\0') {
			report.stage = "snippet";
			{
				INI ini;
				ini.load(AsciiString(snippet_path), INI_LOAD_OVERWRITE, nullptr);
			}
			report.objectDirectoryLoaded = true;
			report.stage = "template_lookups";
			report.templateCount = count_templates(*thing_factory);
			if (thing_factory->firstTemplate() != nullptr) {
				// Most recently parsed template (the template list is LIFO).
				inspect_template(
					*thing_factory,
					thing_factory->firstTemplate()->getName().str(),
					report.lookups[0]);
			}
			report.stage = "done";
			report.ok = true;
		} else {
		report.stage = "object_ini_directory";
		try {
			INI ini;
			ini.loadDirectory(AsciiString(OBJECT_INI_DIRECTORY), TRUE, INI_LOAD_OVERWRITE, &xferCRC);
			report.objectDirectoryLoaded = true;
			report.objectIniFilesLoaded = report.objectIniFileCount;
		} catch (...) {
			// Re-run the same sorted per-file sequence INI::loadDirectory uses so
			// the failing file and line number can be reported precisely.
			FilenameList fs_object_ini_files;
			AsciiString fs_directory(OBJECT_INI_DIRECTORY);
			fs_directory.concat('\\');
			file_system.getFileListInDirectory(
				fs_directory,
				AsciiString("*.ini"),
				fs_object_ini_files,
				TRUE);
			for (FilenameList::const_iterator it = fs_object_ini_files.begin();
					it != fs_object_ini_files.end(); ++it) {
				INI per_file_ini;
				try {
					per_file_ini.load(*it, INI_LOAD_OVERWRITE, nullptr);
				} catch (INIException &exception) {
					report.failingObjectIniFile = it->str();
					report.failingObjectIniLine = per_file_ini.getLineNum();
					report.failingObjectIniError = exception.mFailureMessage != nullptr ?
						exception.mFailureMessage : "INIException";
					break;
				} catch (...) {
					report.failingObjectIniFile = it->str();
					report.failingObjectIniLine = per_file_ini.getLineNum();
					report.failingObjectIniError = "unknown exception";
					break;
				}
			}
			throw;
		}

		xferCRC.close();
		report.xferCRC = static_cast<unsigned>(xferCRC.getCRC());

		report.stage = "template_lookups";
		report.templateCount = count_templates(*thing_factory);

		inspect_template(*thing_factory, "DefaultThingTemplate", report.lookups[0]);
		inspect_template(*thing_factory, "AmericaVehicleHumvee", report.lookups[1]);
		inspect_template(*thing_factory, "GLAInfantryRebel", report.lookups[2]);
		inspect_template(*thing_factory, "AmericaJetRaptor", report.lookups[3]);
		inspect_template(*thing_factory, "ChinaTankOverlord", report.lookups[4]);

		report.stage = "done";
		report.ok =
			report.defaultObjectIniLoaded &&
			report.objectDirectoryLoaded &&
			report.objectIniFileCount == 43 &&
			report.templateCount > 1000 &&
			report.lookups[1].found &&
			report.lookups[2].found;
		}
	} catch (INIException &exception) {
		report.error = exception.mFailureMessage != nullptr ?
			exception.mFailureMessage : "INIException without message";
	} catch (ErrorCode code) {
		char buffer[64];
		std::snprintf(buffer, sizeof(buffer), "ErrorCode 0x%08x", static_cast<unsigned>(code));
		report.error = buffer;
	} catch (const char *message) {
		report.error = message != nullptr ? message : "const char* exception";
	} catch (...) {
		report.error = "exception at stage " + report.stage;
	}

	report.stage = "cleanup:" + report.stage;

	TheThingFactory = old_thing_factory;
	TheModuleFactory = old_module_factory;
	TheArmorStore = old_armor_store;
	TheDamageFXStore = old_damage_fx_store;
	TheSpecialPowerStore = old_special_power_store;
	TheLocomotorStore = old_locomotor_store;
	TheObjectCreationListStore = old_object_creation_list_store;
	TheWeaponStore = old_weapon_store;
	TheFXListStore = old_fx_list_store;
	TheParticleSystemManager = old_particle_system_manager;
	TheScienceStore = old_science_store;
	TheGameText = old_game_text;
	TheWritableGlobalData = old_global_data;
	TheNameKeyGenerator = old_name_key_generator;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	delete thing_factory;
	delete module_factory;
	delete armor_store;
	delete damage_fx_store;
	delete special_power_store;
	delete locomotor_store;
	delete object_creation_list_store;
	delete weapon_store;
	delete fx_list_store;
	delete particle_system_manager;
	delete science_store;
	delete game_text;
	delete global_data;
	delete name_key_generator;

	if (!report.error.empty()) {
		return;
	}
	report.stage = report.ok ? "done" : report.stage;
}

std::string g_object_ini_probe_json;

} // namespace

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_object_ini(const char *archive_path)
{
	ObjectIniProbeReport report;
	run_object_ini_probe(archive_path, report);
	serialize_report(report, g_object_ini_probe_json);
	return g_object_ini_probe_json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_object_ini_snippet(
	const char *archive_path,
	const char *snippet_path)
{
	ObjectIniProbeReport report;
	run_object_ini_probe(archive_path, report, snippet_path);
	serialize_report(report, g_object_ini_probe_json);
	return g_object_ini_probe_json.c_str();
}
