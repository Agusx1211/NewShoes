#include "PreRTS.h"

#define DEFINE_WEAPONBONUSCONDITION_NAMES
#define DEFINE_WEAPONBONUSFIELD_NAMES

#include "Common/GlobalData.h"
#include "Common/INI.h"
#include "Common/ThingFactory.h"
#include "Common/UserPreferences.h"
#include "GameClient/Drawable.h"
#include "GameClient/FXList.h"
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
FXListStore *TheFXListStore __attribute__((weak)) = nullptr;

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

ThingTemplate *__attribute__((weak)) ThingFactory::findTemplateInternal(
	const AsciiString &,
	Bool)
{
	return nullptr;
}

OptionPreferences::OptionPreferences(void)
{
}

OptionPreferences::~OptionPreferences()
{
}

UnsignedInt OptionPreferences::getLANIPAddress(void)
{
	return TheGlobalData != nullptr ? TheGlobalData->m_defaultIP : 0;
}

UnsignedInt OptionPreferences::getOnlineIPAddress(void)
{
	return TheGlobalData != nullptr ? TheGlobalData->m_defaultIP : 0;
}

void OptionPreferences::setLANIPAddress(AsciiString)
{
}

void OptionPreferences::setOnlineIPAddress(AsciiString)
{
}

void OptionPreferences::setLANIPAddress(UnsignedInt)
{
}

void OptionPreferences::setOnlineIPAddress(UnsignedInt)
{
}

Bool OptionPreferences::getAlternateMouseModeEnabled(void)
{
	return TheGlobalData != nullptr ? TheGlobalData->m_useAlternateMouse : FALSE;
}

Bool OptionPreferences::getRetaliationModeEnabled()
{
	return TheGlobalData != nullptr ? TheGlobalData->m_clientRetaliationModeEnabled : TRUE;
}

Bool OptionPreferences::getDoubleClickAttackMoveEnabled(void)
{
	return TheGlobalData != nullptr ? TheGlobalData->m_doubleClickAttackMove : FALSE;
}

Real OptionPreferences::getScrollFactor(void)
{
	return TheGlobalData != nullptr ? TheGlobalData->m_keyboardDefaultScrollFactor : 0.5f;
}

Bool OptionPreferences::getSendDelay(void)
{
	return TheGlobalData != nullptr ? TheGlobalData->m_firewallSendDelay : FALSE;
}

Int OptionPreferences::getFirewallBehavior(void)
{
	return TheGlobalData != nullptr ? TheGlobalData->m_firewallBehavior : 0;
}

Short OptionPreferences::getFirewallPortAllocationDelta(void)
{
	return TheGlobalData != nullptr ? TheGlobalData->m_firewallPortAllocationDelta : 0;
}

UnsignedShort OptionPreferences::getFirewallPortOverride(void)
{
	return TheGlobalData != nullptr ? static_cast<UnsignedShort>(TheGlobalData->m_firewallPortOverride) : 0;
}

Bool OptionPreferences::getFirewallNeedToRefresh(void)
{
	return FALSE;
}

Bool OptionPreferences::usesSystemMapDir(void)
{
	return TRUE;
}

AsciiString OptionPreferences::getPreferred3DProvider(void)
{
	return AsciiString::TheEmptyString;
}

AsciiString OptionPreferences::getSpeakerType(void)
{
	return AsciiString::TheEmptyString;
}

Real OptionPreferences::getSoundVolume(void)
{
	return 100.0f;
}

Real OptionPreferences::get3DSoundVolume(void)
{
	return 100.0f;
}

Real OptionPreferences::getSpeechVolume(void)
{
	return 100.0f;
}

Real OptionPreferences::getMusicVolume(void)
{
	return 100.0f;
}

Bool OptionPreferences::saveCameraInReplays(void)
{
	return TRUE;
}

Bool OptionPreferences::useCameraInReplays(void)
{
	return TRUE;
}

Int OptionPreferences::getStaticGameDetail(void)
{
	return -1;
}

Int OptionPreferences::getIdealStaticGameDetail(void)
{
	return -1;
}

Real OptionPreferences::getGammaValue(void)
{
	return 50.0f;
}

Int OptionPreferences::getTextureReduction(void)
{
	return -1;
}

void OptionPreferences::getResolution(Int *xres, Int *yres)
{
	if (xres != nullptr) {
		*xres = TheGlobalData != nullptr ? TheGlobalData->m_xResolution : 800;
	}
	if (yres != nullptr) {
		*yres = TheGlobalData != nullptr ? TheGlobalData->m_yResolution : 600;
	}
}

Bool OptionPreferences::get3DShadowsEnabled(void)
{
	return TheGlobalData != nullptr ? TheGlobalData->m_useShadowVolumes : FALSE;
}

Bool OptionPreferences::get2DShadowsEnabled(void)
{
	return TheGlobalData != nullptr ? TheGlobalData->m_useShadowDecals : FALSE;
}

Bool OptionPreferences::getCloudShadowsEnabled(void)
{
	return TheGlobalData != nullptr ? TheGlobalData->m_useCloudMap : FALSE;
}

Bool OptionPreferences::getLightmapEnabled(void)
{
	return TheGlobalData != nullptr ? TheGlobalData->m_useLightMap : FALSE;
}

Bool OptionPreferences::getSmoothWaterEnabled(void)
{
	return TheGlobalData != nullptr ? TheGlobalData->m_showSoftWaterEdge : FALSE;
}

Bool OptionPreferences::getTreesEnabled(void)
{
	return TheGlobalData != nullptr ? TheGlobalData->m_useTrees : FALSE;
}

Bool OptionPreferences::getExtraAnimationsDisabled(void)
{
	return TheGlobalData != nullptr ? TheGlobalData->m_useDrawModuleLOD : FALSE;
}

Bool OptionPreferences::getUseHeatEffects(void)
{
	return TheGlobalData != nullptr ? TheGlobalData->m_useHeatEffects : FALSE;
}

Bool OptionPreferences::getDynamicLODEnabled(void)
{
	return TheGlobalData != nullptr ? TheGlobalData->m_enableDynamicLOD : FALSE;
}

Bool OptionPreferences::getFPSLimitEnabled(void)
{
	return TheGlobalData != nullptr ? TheGlobalData->m_useFpsLimit : FALSE;
}

Bool OptionPreferences::getNoDynamicLODEnabled(void)
{
	return TheGlobalData != nullptr ? !TheGlobalData->m_enableDynamicLOD : FALSE;
}

Bool OptionPreferences::getBuildingOcclusionEnabled(void)
{
	return TheGlobalData != nullptr ? TheGlobalData->m_enableBehindBuildingMarkers : FALSE;
}

Int OptionPreferences::getParticleCap(void)
{
	return TheGlobalData != nullptr ? TheGlobalData->m_maxParticleCount : 0;
}

Int OptionPreferences::getCampaignDifficulty(void)
{
	return 1;
}

void OptionPreferences::setCampaignDifficulty(Int)
{
}

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
UNUSED_INI_BLOCK_PARSER(parseFXListDefinition)
UNUSED_INI_BLOCK_PARSER(parseInGameUIDefinition)
UNUSED_INI_BLOCK_PARSER(parseLanguageDefinition)
UNUSED_INI_BLOCK_PARSER(parseMapDataDefinition)
UNUSED_INI_BLOCK_PARSER(parseMiscAudio)
UNUSED_INI_BLOCK_PARSER(parseMouseDefinition)
UNUSED_INI_BLOCK_PARSER(parseMouseCursorDefinition)
UNUSED_INI_BLOCK_PARSER(parseMusicTrackDefinition)
UNUSED_INI_BLOCK_PARSER(parseObjectDefinition)
UNUSED_INI_BLOCK_PARSER(parseObjectCreationListDefinition)
UNUSED_INI_BLOCK_PARSER(parseObjectReskinDefinition)
UNUSED_INI_BLOCK_PARSER(parseRankDefinition)
UNUSED_INI_BLOCK_PARSER(parseShellMenuSchemeDefinition)
UNUSED_INI_BLOCK_PARSER(parseWebpageURLDefinition)
UNUSED_INI_BLOCK_PARSER(parseHeaderTemplateDefinition)
UNUSED_INI_BLOCK_PARSER(parseStaticGameLODDefinition)
UNUSED_INI_BLOCK_PARSER(parseDynamicGameLODDefinition)
UNUSED_INI_BLOCK_PARSER(parseLODPreset)
UNUSED_INI_BLOCK_PARSER(parseBenchProfile)

#undef UNUSED_INI_BLOCK_PARSER
