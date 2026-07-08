#include "PreRTS.h"

#define DEFINE_COMMAND_OPTION_NAMES
#define DEFINE_GUI_COMMMAND_NAMES
#define DEFINE_RADIUSCURSOR_NAMES
#define DEFINE_WEAPONSLOTTYPE_NAMES

#include <cstdint>

#include "Common/INI.h"
#include "GameClient/InGameUI.h"
#include "GameClient/ControlBar.h"
#include "GameClient/ControlBarScheme.h"
#include "GameLogic/GameLogic.h"
#include "GameLogic/WeaponSet.h"

// NOTE (special-power activation fix): This file was the pre-real-ControlBar
// INI-runtime slice.  It provided a *minimal* ControlBar/CommandButton/
// CommandSet so the object/command INI could parse before the full GUI control
// bar was ported.  The real GeneralsMD ControlBar.cpp is now compiled into the
// cnc-port runtime (via zh_gameclient_utility), and it owns the complete
// implementations that drive the special-power shortcut palette, the per-frame
// command-availability refresh, and button wiring.
//
// Both translation units define the same ControlBar/CommandButton/CommandSet
// symbols.  With two *strong* definitions the linker picks whichever archive
// resolves the reference first, and when this stub archive won it silently
// shadowed the real ControlBar::update()/init()/reset() (empty stubs below) —
// so the special-power shortcut buttons were never populated or refreshed and
// clicking a purchased power did nothing.
//
// Fix: mark every definition here that the real ControlBar.cpp also provides as
// weak, so the real strong implementation always wins wherever ControlBar.cpp
// is linked (cnc-port), while the INI-runtime-only targets that do NOT link
// ControlBar.cpp still get these weak fallbacks.  See TODO.md
// "Purchased special powers can't be activated".
#if defined(__GNUC__) || defined(__clang__)
#define CNC_PORT_CB_WEAK __attribute__((weak))
#else
#define CNC_PORT_CB_WEAK
#endif

ControlBar *TheControlBar CNC_PORT_CB_WEAK = nullptr;

const Image *ControlBar::m_rankVeteranIcon CNC_PORT_CB_WEAK = nullptr;
const Image *ControlBar::m_rankEliteIcon CNC_PORT_CB_WEAK = nullptr;
const Image *ControlBar::m_rankHeroicIcon CNC_PORT_CB_WEAK = nullptr;

CNC_PORT_CB_WEAK const FieldParse CommandButton::s_commandButtonFieldParseTable[] =
{
	{ "Command", CommandButton::parseCommand, nullptr, offsetof(CommandButton, m_command) },
	{ "Options", INI::parseBitString32, TheCommandOptionNames, offsetof(CommandButton, m_options) },
	{ "Object", INI::parseThingTemplate, nullptr, offsetof(CommandButton, m_thingTemplate) },
	{ "Upgrade", INI::parseUpgradeTemplate, nullptr, offsetof(CommandButton, m_upgradeTemplate) },
	{ "WeaponSlot", INI::parseLookupList, TheWeaponSlotTypeNamesLookupList, offsetof(CommandButton, m_weaponSlot) },
	{ "MaxShotsToFire", INI::parseInt, nullptr, offsetof(CommandButton, m_maxShotsToFire) },
	{ "Science", INI::parseScienceVector, nullptr, offsetof(CommandButton, m_science) },
	{ "SpecialPower", INI::parseSpecialPowerTemplate, nullptr, offsetof(CommandButton, m_specialPower) },
	{ "TextLabel", INI::parseAsciiString, nullptr, offsetof(CommandButton, m_textLabel) },
	{ "DescriptLabel", INI::parseAsciiString, nullptr, offsetof(CommandButton, m_descriptionLabel) },
	{ "PurchasedLabel", INI::parseAsciiString, nullptr, offsetof(CommandButton, m_purchasedLabel) },
	{ "ConflictingLabel", INI::parseAsciiString, nullptr, offsetof(CommandButton, m_conflictingLabel) },
	{ "ButtonImage", INI::parseAsciiString, nullptr, offsetof(CommandButton, m_buttonImageName) },
	{ "CursorName", INI::parseAsciiString, nullptr, offsetof(CommandButton, m_cursorName) },
	{ "InvalidCursorName", INI::parseAsciiString, nullptr, offsetof(CommandButton, m_invalidCursorName) },
	{ "ButtonBorderType", INI::parseLookupList, CommandButtonMappedBorderTypeNames, offsetof(CommandButton, m_commandButtonBorder) },
	{ "RadiusCursorType", INI::parseIndexList, TheRadiusCursorNames, offsetof(CommandButton, m_radiusCursor) },
	{ "UnitSpecificSound", INI::parseAudioEventRTS, nullptr, offsetof(CommandButton, m_unitSpecificSound) },
	{ nullptr, nullptr, nullptr, 0 }
};

CNC_PORT_CB_WEAK const FieldParse CommandSet::m_commandSetFieldParseTable[] =
{
	{ "1", CommandSet::parseCommandButton, (void *)0, offsetof(CommandSet, m_command) },
	{ "2", CommandSet::parseCommandButton, (void *)1, offsetof(CommandSet, m_command) },
	{ "3", CommandSet::parseCommandButton, (void *)2, offsetof(CommandSet, m_command) },
	{ "4", CommandSet::parseCommandButton, (void *)3, offsetof(CommandSet, m_command) },
	{ "5", CommandSet::parseCommandButton, (void *)4, offsetof(CommandSet, m_command) },
	{ "6", CommandSet::parseCommandButton, (void *)5, offsetof(CommandSet, m_command) },
	{ "7", CommandSet::parseCommandButton, (void *)6, offsetof(CommandSet, m_command) },
	{ "8", CommandSet::parseCommandButton, (void *)7, offsetof(CommandSet, m_command) },
	{ "9", CommandSet::parseCommandButton, (void *)8, offsetof(CommandSet, m_command) },
	{ "10", CommandSet::parseCommandButton, (void *)9, offsetof(CommandSet, m_command) },
	{ "11", CommandSet::parseCommandButton, (void *)10, offsetof(CommandSet, m_command) },
	{ "12", CommandSet::parseCommandButton, (void *)11, offsetof(CommandSet, m_command) },
	{ "13", CommandSet::parseCommandButton, (void *)12, offsetof(CommandSet, m_command) },
	{ "14", CommandSet::parseCommandButton, (void *)13, offsetof(CommandSet, m_command) },
	{ "15", CommandSet::parseCommandButton, (void *)14, offsetof(CommandSet, m_command) },
	{ "16", CommandSet::parseCommandButton, (void *)15, offsetof(CommandSet, m_command) },
	{ "17", CommandSet::parseCommandButton, (void *)16, offsetof(CommandSet, m_command) },
	{ "18", CommandSet::parseCommandButton, (void *)17, offsetof(CommandSet, m_command) },
	{ nullptr, nullptr, nullptr, 0 }
};

CNC_PORT_CB_WEAK void CommandButton::parseCommand(INI *ini, void *, void *store, const void *)
{
	const char *token = ini->getNextToken();

	for (Int i = 0; TheGuiCommandNames[i] != nullptr; ++i) {
		if (stricmp(TheGuiCommandNames[i], token) == 0) {
			*static_cast<GUICommandType *>(store) = static_cast<GUICommandType>(i);
			return;
		}
	}

	throw INI_INVALID_DATA;
}

CNC_PORT_CB_WEAK CommandButton::CommandButton()
{
	m_command = GUI_COMMAND_NONE;
	m_thingTemplate = nullptr;
	m_upgradeTemplate = nullptr;
	m_weaponSlot = PRIMARY_WEAPON;
	m_maxShotsToFire = 0x7fffffff;
	m_science.clear();
	m_specialPower = nullptr;
	m_buttonImage = nullptr;
	m_flashCount = 0;
	m_conflictingLabel.clear();
	m_cursorName.clear();
	m_descriptionLabel.clear();
	m_invalidCursorName.clear();
	m_name.clear();
	m_options = 0;
	m_purchasedLabel.clear();
	m_textLabel.clear();
	m_window = nullptr;
	m_commandButtonBorder = COMMAND_BUTTON_BORDER_NONE;
	m_next = nullptr;
	m_radiusCursor = RADIUSCURSOR_NONE;
}

CNC_PORT_CB_WEAK CommandButton::~CommandButton() = default;

CNC_PORT_CB_WEAK void CommandButton::cacheButtonImage()
{
	m_buttonImageName.clear();
}

CNC_PORT_CB_WEAK void CommandSet::parseCommandButton(INI *ini, void *, void *store, const void *user_data)
{
	const char *token = ini->getNextToken();
	const CommandButton *command_button =
		TheControlBar != nullptr ? TheControlBar->findCommandButton(AsciiString(token)) : nullptr;
	if (command_button == nullptr) {
		throw INI_INVALID_DATA;
	}

	const CommandButton **button_array = static_cast<const CommandButton **>(store);
	const Int button_index = static_cast<Int>(reinterpret_cast<std::intptr_t>(user_data));
	if (button_index < 0 || button_index >= MAX_COMMANDS_PER_SET) {
		throw INI_INVALID_DATA;
	}

	button_array[button_index] = command_button;
}

CNC_PORT_CB_WEAK CommandSet::CommandSet(const AsciiString &name) :
	m_name(name),
	m_next(nullptr)
{
	for (Int index = 0; index < MAX_COMMANDS_PER_SET; ++index) {
		m_command[index] = nullptr;
	}
}

CNC_PORT_CB_WEAK const CommandButton *CommandSet::getCommandButton(Int index) const
{
	if (index < 0 || index >= MAX_COMMANDS_PER_SET) {
		return nullptr;
	}

	const CommandButton *button = nullptr;
	if (TheGameLogic != nullptr && TheGameLogic->findControlBarOverride(m_name, index, button)) {
		return button;
	}

	return m_command[index];
}

Bool GameLogic::findControlBarOverride(
	const AsciiString &,
	Int,
	ConstCommandButtonPtr &command_button) const __attribute__((weak))
{
	command_button = nullptr;
	return FALSE;
}

// Live-match GameLogic bookkeeping entry points referenced by the linked
// GameLogic object modules.  They only run for real Objects created during a
// match; the object-template INI runtime never creates Objects, so these stay
// inert until the real GameLogic.cpp is linked.
void __attribute__((weak)) GameLogic::selectObject(Object *, Bool, PlayerMaskType, Bool)
{
}

void __attribute__((weak)) GameLogic::deselectObject(Object *, PlayerMaskType, Bool)
{
}

void __attribute__((weak)) GameLogic::bindObjectAndDrawable(Object *, Drawable *)
{
}

void __attribute__((weak)) GameLogic::friend_awakenUpdateModule(
	Object *,
	UpdateModulePtr,
	UnsignedInt)
{
}

// Live-match ControlBar HUD reactions referenced by Player.cpp / Radar.cpp.
// There is no in-game control bar UI in this runtime slice yet.
void __attribute__((weak)) ControlBar::onPlayerRankChanged(const Player *)
{
}

void __attribute__((weak)) ControlBar::onPlayerSciencePurchasePointsChanged(const Player *)
{
}

void __attribute__((weak)) ControlBar::triggerRadarAttackGlow()
{
}

// Live-match targeting validation referenced by Object.cpp; only used when
// issuing real in-game commands.
Bool __attribute__((weak)) CommandButton::isValidObjectTarget(const Object *, const Object *) const
{
	return FALSE;
}

CNC_PORT_CB_WEAK void CommandSet::friend_addToList(CommandSet **list_head)
{
	m_next = *list_head;
	*list_head = this;
}

CNC_PORT_CB_WEAK CommandSet::~CommandSet() = default;

CNC_PORT_CB_WEAK ControlBar::ControlBar()
{
	m_UIDirty = false;
	m_commandButtons = nullptr;
	m_commandSets = nullptr;
	m_controlBarSchemeManager = NEW ControlBarSchemeManager;
	m_currentSelectedDrawable = nullptr;
	m_currContext = CB_CONTEXT_NONE;
	m_rallyPointDrawableID = INVALID_DRAWABLE_ID;
}

CNC_PORT_CB_WEAK ControlBar::~ControlBar()
{
	while (m_commandButtons != nullptr) {
		CommandButton *button = m_commandButtons->friend_getNext();
		m_commandButtons->deleteInstance();
		m_commandButtons = button;
	}
	while (m_commandSets != nullptr) {
		CommandSet *set = m_commandSets->friend_getNext();
		m_commandSets->deleteInstance();
		m_commandSets = set;
	}
	if (m_controlBarSchemeManager != nullptr) {
		delete m_controlBarSchemeManager;
		m_controlBarSchemeManager = nullptr;
	}
}

CNC_PORT_CB_WEAK void ControlBar::init()
{
}

CNC_PORT_CB_WEAK void ControlBar::reset()
{
}

CNC_PORT_CB_WEAK void ControlBar::update()
{
}

CNC_PORT_CB_WEAK void ControlBar::markUIDirty()
{
	m_UIDirty = true;
}

CNC_PORT_CB_WEAK CommandButton *ControlBar::findNonConstCommandButton(const AsciiString &name)
{
	for (const CommandButton *command = m_commandButtons; command != nullptr; command = command->getNext()) {
		if (command->getName() == name) {
			return const_cast<CommandButton *>(static_cast<const CommandButton *>(command->getFinalOverride()));
		}
	}

	return nullptr;
}

CNC_PORT_CB_WEAK const CommandButton *ControlBar::findCommandButton(const AsciiString &name)
{
	CommandButton *button = findNonConstCommandButton(name);
	if (button != nullptr) {
		button = static_cast<CommandButton *>(button->friend_getFinalOverride());
	}
	return button;
}

CNC_PORT_CB_WEAK CommandSet *ControlBar::findNonConstCommandSet(const AsciiString &name)
{
	for (CommandSet *set = m_commandSets; set != nullptr; set = set->friend_getNext()) {
		if (set->getName() == name) {
			return const_cast<CommandSet *>(static_cast<const CommandSet *>(set));
		}
	}

	return nullptr;
}

CNC_PORT_CB_WEAK const CommandSet *ControlBar::findCommandSet(const AsciiString &name)
{
	CommandSet *set = findNonConstCommandSet(name);
	if (set != nullptr) {
		set = static_cast<CommandSet *>(set->friend_getFinalOverride());
	}
	return set;
}

CNC_PORT_CB_WEAK CommandButton *ControlBar::newCommandButton(const AsciiString &name)
{
	CommandButton *button = newInstance(CommandButton);
	button->setName(name);
	button->friend_addToList(&m_commandButtons);
	return button;
}

CNC_PORT_CB_WEAK CommandButton *ControlBar::newCommandButtonOverride(CommandButton *button_to_override)
{
	if (button_to_override == nullptr) {
		return nullptr;
	}

	CommandButton *override_button = newInstance(CommandButton);
	*override_button = *button_to_override;
	override_button->markAsOverride();
	button_to_override->setNextOverride(override_button);
	return override_button;
}

CNC_PORT_CB_WEAK CommandSet *ControlBar::newCommandSet(const AsciiString &name)
{
	CommandSet *set = newInstance(CommandSet)(name);
	set->friend_addToList(&m_commandSets);
	return set;
}

CNC_PORT_CB_WEAK CommandSet *ControlBar::newCommandSetOverride(CommandSet *set_to_override)
{
	if (set_to_override == nullptr) {
		return nullptr;
	}

	CommandSet *override_set = newInstance(CommandSet)(set_to_override->getName());
	*override_set = *set_to_override;
	override_set->markAsOverride();
	set_to_override->setNextOverride(override_set);
	return override_set;
}

CNC_PORT_CB_WEAK void ControlBar::parseCommandSetDefinition(INI *ini)
{
	const char *token = ini->getNextToken();
	AsciiString name(token);

	CommandSet *command_set = TheControlBar->findNonConstCommandSet(name);
	if (command_set == nullptr) {
		command_set = TheControlBar->newCommandSet(name);
		if (ini->getLoadType() == INI_LOAD_CREATE_OVERRIDES) {
			command_set->markAsOverride();
		}
	} else if (ini->getLoadType() != INI_LOAD_CREATE_OVERRIDES) {
		throw INI_INVALID_DATA;
	} else {
		command_set = TheControlBar->newCommandSetOverride(command_set);
	}

	if (command_set == nullptr) {
		throw INI_INVALID_DATA;
	}

	ini->initFromINI(command_set, command_set->friend_getFieldParse());
}
