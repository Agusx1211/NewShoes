#include "PreRTS.h"

#define DEFINE_WEAPONBONUSCONDITION_NAMES
#define DEFINE_WEAPONBONUSFIELD_NAMES

#include "Common/AudioSettings.h"
#include "Common/GameAudio.h"
#include "Common/GlobalData.h"
#include "Common/INI.h"
#include "Common/ThingFactory.h"
#include "Common/UserPreferences.h"
#include "GameClient/Drawable.h"
#include "GameClient/FXList.h"
#include "GameClient/InGameUI.h"
#include "GameLogic/GameLogic.h"
#include "GameLogic/Object.h"
#include "GameLogic/ScriptEngine.h"
#include "GameLogic/Weapon.h"

#include <cstdlib>

class AudioManager;
class ControlBar;
class Display;
class GameClient;
class GameLODManager;
class ObjectCreationListStore;
class PartitionManager;
class TerrainLogic;

AudioManager *TheAudio __attribute__((weak)) = nullptr;
ControlBar *TheControlBar __attribute__((weak)) = nullptr;
Display *TheDisplay __attribute__((weak)) = nullptr;
GameClient *TheGameClient __attribute__((weak)) = nullptr;
GameLogic *TheGameLogic __attribute__((weak)) = nullptr;
GameLODManager *TheGameLODManager __attribute__((weak)) = nullptr;
ObjectCreationListStore *TheObjectCreationListStore __attribute__((weak)) = nullptr;
PartitionManager *ThePartitionManager __attribute__((weak)) = nullptr;
TerrainLogic *TheTerrainLogic __attribute__((weak)) = nullptr;
ThingFactory *TheThingFactory __attribute__((weak)) = nullptr;
#ifndef WASM_REAL_INI_FXLIST_METADATA_ONLY
FXListStore *TheFXListStore __attribute__((weak)) = nullptr;
#endif

#define UNUSED_INI_BLOCK_PARSER(name) \
	void __attribute__((weak)) INI::name(INI *) \
	{ \
		throw INI_UNKNOWN_TOKEN; \
	}

void __attribute__((weak)) setFPMode(void)
{
}

void __attribute__((weak)) parseReallyLowMHz(INI *)
{
	throw INI_UNKNOWN_TOKEN;
}

#ifndef WASM_REAL_INI_FXLIST_METADATA_ONLY
FXList::FXList()
{
}

FXList::~FXList()
{
}

void FXList::clear()
{
}

void FXList::doFXPos(
	const Coord3D *,
	const Matrix3D *,
	const Real,
	const Coord3D *,
	const Real) const
{
}

void FXList::doFXObj(const Object *, const Object *) const
{
}

FXListStore::FXListStore()
{
}

FXListStore::~FXListStore()
{
}

const FXList *FXListStore::findFXList(const char *name) const
{
	if (name != nullptr && stricmp(name, "None") == 0) {
		return nullptr;
	}
	return nullptr;
}
#endif

// Live-match world-overlay animation referenced by the linked GameLogic
// object modules (Object.cpp / CrateCollide.cpp / AutoHealBehavior.cpp).
// It only fires for Objects in a running match; the real InGameUI is not part
// of this runtime slice yet.
void __attribute__((weak)) InGameUI::addWorldAnimation(
	Anim2DTemplate *,
	const Coord3D *,
	WorldAnimationOptions,
	Real,
	Real)
{
}

VeterancyLevel __attribute__((weak)) Object::getVeterancyLevel() const
{
	return LEVEL_REGULAR;
}

ObjectShroudStatus __attribute__((weak)) Object::getShroudedStatus(Int) const
{
	return OBJECTSHROUD_CLEAR;
}

const Matrix3D *__attribute__((weak)) Drawable::getTransformMatrix(void) const
{
	static Matrix3D identity(TRUE);
	return &identity;
}

void __attribute__((weak)) ScriptEngine::parseScriptAction(INI *)
{
	throw INI_UNKNOWN_TOKEN;
}

void __attribute__((weak)) ScriptEngine::parseScriptCondition(INI *)
{
	throw INI_UNKNOWN_TOKEN;
}

#ifndef WASM_REAL_INI_OBJECT_RUNTIME
// The real Common/UserPreferences.cpp is linked through
// zh_gameengine_real_object_ini_runtime when the object-template runtime is
// enabled; these focused fallbacks only exist for builds without it.
UserPreferences::UserPreferences(void)
{
}

UserPreferences::~UserPreferences()
{
}

Bool UserPreferences::load(AsciiString fname)
{
	m_filename = fname;
	return FALSE;
}

Bool UserPreferences::write(void)
{
	return FALSE;
}

Bool UserPreferences::getBool(AsciiString key, Bool defaultValue) const
{
	const AsciiString value = getAsciiString(key, AsciiString::TheEmptyString);
	if (value.isEmpty()) {
		return defaultValue;
	}

	return value.compareNoCase("1") == 0 ||
		value.compareNoCase("t") == 0 ||
		value.compareNoCase("true") == 0 ||
		value.compareNoCase("y") == 0 ||
		value.compareNoCase("yes") == 0 ||
		value.compareNoCase("ok") == 0;
}

Real UserPreferences::getReal(AsciiString key, Real defaultValue) const
{
	const AsciiString value = getAsciiString(key, AsciiString::TheEmptyString);
	return value.isEmpty() ? defaultValue : static_cast<Real>(std::atof(value.str()));
}

Int UserPreferences::getInt(AsciiString key, Int defaultValue) const
{
	const AsciiString value = getAsciiString(key, AsciiString::TheEmptyString);
	return value.isEmpty() ? defaultValue : std::atoi(value.str());
}

AsciiString UserPreferences::getAsciiString(AsciiString key, AsciiString defaultValue) const
{
	UserPreferences::const_iterator it = find(key);
	return it == end() ? defaultValue : it->second;
}

void UserPreferences::setBool(AsciiString key, Bool value)
{
	setAsciiString(key, value ? "1" : "0");
}

void UserPreferences::setReal(AsciiString key, Real value)
{
	AsciiString formatted;
	formatted.format("%g", value);
	setAsciiString(key, formatted);
}

void UserPreferences::setInt(AsciiString key, Int value)
{
	AsciiString formatted;
	formatted.format("%d", value);
	setAsciiString(key, formatted);
}

void UserPreferences::setAsciiString(AsciiString key, AsciiString value)
{
	(*this)[key] = value;
}
#endif // WASM_REAL_INI_OBJECT_RUNTIME

#ifndef WASM_REAL_INI_OBJECT_RUNTIME
ThingTemplate *__attribute__((weak)) ThingFactory::findTemplateInternal(
	const AsciiString &,
	Bool)
{
	return nullptr;
}
#endif

UNUSED_INI_BLOCK_PARSER(parseAnim2DDefinition)
UNUSED_INI_BLOCK_PARSER(parseAudioEventDefinition)
UNUSED_INI_BLOCK_PARSER(parseAudioSettingsDefinition)
UNUSED_INI_BLOCK_PARSER(parseCampaignDefinition)
UNUSED_INI_BLOCK_PARSER(parseChallengeModeDefinition)
UNUSED_INI_BLOCK_PARSER(parseMetaMapDefinition)
UNUSED_INI_BLOCK_PARSER(parseControlBarResizerDefinition)
UNUSED_INI_BLOCK_PARSER(parseCredits)
UNUSED_INI_BLOCK_PARSER(parseWindowTransitions)
UNUSED_INI_BLOCK_PARSER(parseDialogDefinition)
UNUSED_INI_BLOCK_PARSER(parseEvaEvent)
#ifndef WASM_REAL_INI_FXLIST_METADATA_ONLY
UNUSED_INI_BLOCK_PARSER(parseFXListDefinition)
#endif
UNUSED_INI_BLOCK_PARSER(parseInGameUIDefinition)
UNUSED_INI_BLOCK_PARSER(parseLanguageDefinition)
UNUSED_INI_BLOCK_PARSER(parseMapDataDefinition)
UNUSED_INI_BLOCK_PARSER(parseMiscAudio)
UNUSED_INI_BLOCK_PARSER(parseMouseDefinition)
UNUSED_INI_BLOCK_PARSER(parseMouseCursorDefinition)
UNUSED_INI_BLOCK_PARSER(parseMusicTrackDefinition)
#ifndef WASM_REAL_INI_OBJECT_RUNTIME
UNUSED_INI_BLOCK_PARSER(parseObjectDefinition)
#endif
#ifndef WASM_REAL_INI_OBJECT_CREATION_LIST_METADATA_ONLY
UNUSED_INI_BLOCK_PARSER(parseObjectCreationListDefinition)
#endif
#ifndef WASM_REAL_INI_OBJECT_RUNTIME
UNUSED_INI_BLOCK_PARSER(parseObjectReskinDefinition)
#endif
UNUSED_INI_BLOCK_PARSER(parseRankDefinition)
UNUSED_INI_BLOCK_PARSER(parseShellMenuSchemeDefinition)
UNUSED_INI_BLOCK_PARSER(parseWebpageURLDefinition)
UNUSED_INI_BLOCK_PARSER(parseHeaderTemplateDefinition)
UNUSED_INI_BLOCK_PARSER(parseStaticGameLODDefinition)
UNUSED_INI_BLOCK_PARSER(parseDynamicGameLODDefinition)
UNUSED_INI_BLOCK_PARSER(parseLODPreset)
UNUSED_INI_BLOCK_PARSER(parseBenchProfile)

#undef UNUSED_INI_BLOCK_PARSER
