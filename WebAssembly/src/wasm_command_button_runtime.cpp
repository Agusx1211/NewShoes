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

ControlBar *TheControlBar = nullptr;

const Image *ControlBar::m_rankVeteranIcon = nullptr;
const Image *ControlBar::m_rankEliteIcon = nullptr;
const Image *ControlBar::m_rankHeroicIcon = nullptr;

const FieldParse CommandButton::s_commandButtonFieldParseTable[] =
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

const FieldParse CommandSet::m_commandSetFieldParseTable[] =
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

void CommandButton::parseCommand(INI *ini, void *, void *store, const void *)
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

CommandButton::CommandButton()
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

CommandButton::~CommandButton() = default;

void CommandButton::cacheButtonImage()
{
	m_buttonImageName.clear();
}

void CommandSet::parseCommandButton(INI *ini, void *, void *store, const void *user_data)
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

CommandSet::CommandSet(const AsciiString &name) :
	m_name(name),
	m_next(nullptr)
{
	for (Int index = 0; index < MAX_COMMANDS_PER_SET; ++index) {
		m_command[index] = nullptr;
	}
}

const CommandButton *CommandSet::getCommandButton(Int index) const
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

void CommandSet::friend_addToList(CommandSet **list_head)
{
	m_next = *list_head;
	*list_head = this;
}

CommandSet::~CommandSet() = default;

ControlBar::ControlBar()
{
	m_UIDirty = false;
	m_commandButtons = nullptr;
	m_commandSets = nullptr;
	m_controlBarSchemeManager = NEW ControlBarSchemeManager;
	m_currentSelectedDrawable = nullptr;
	m_currContext = CB_CONTEXT_NONE;
	m_rallyPointDrawableID = INVALID_DRAWABLE_ID;
}

ControlBar::~ControlBar()
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

void ControlBar::init()
{
}

void ControlBar::reset()
{
}

void ControlBar::update()
{
}

void ControlBar::markUIDirty()
{
	m_UIDirty = true;
}

CommandButton *ControlBar::findNonConstCommandButton(const AsciiString &name)
{
	for (const CommandButton *command = m_commandButtons; command != nullptr; command = command->getNext()) {
		if (command->getName() == name) {
			return const_cast<CommandButton *>(static_cast<const CommandButton *>(command->getFinalOverride()));
		}
	}

	return nullptr;
}

const CommandButton *ControlBar::findCommandButton(const AsciiString &name)
{
	CommandButton *button = findNonConstCommandButton(name);
	if (button != nullptr) {
		button = static_cast<CommandButton *>(button->friend_getFinalOverride());
	}
	return button;
}

CommandSet *ControlBar::findNonConstCommandSet(const AsciiString &name)
{
	for (CommandSet *set = m_commandSets; set != nullptr; set = set->friend_getNext()) {
		if (set->getName() == name) {
			return const_cast<CommandSet *>(static_cast<const CommandSet *>(set));
		}
	}

	return nullptr;
}

const CommandSet *ControlBar::findCommandSet(const AsciiString &name)
{
	CommandSet *set = findNonConstCommandSet(name);
	if (set != nullptr) {
		set = static_cast<CommandSet *>(set->friend_getFinalOverride());
	}
	return set;
}

CommandButton *ControlBar::newCommandButton(const AsciiString &name)
{
	CommandButton *button = newInstance(CommandButton);
	button->setName(name);
	button->friend_addToList(&m_commandButtons);
	return button;
}

CommandButton *ControlBar::newCommandButtonOverride(CommandButton *button_to_override)
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

CommandSet *ControlBar::newCommandSet(const AsciiString &name)
{
	CommandSet *set = newInstance(CommandSet)(name);
	set->friend_addToList(&m_commandSets);
	return set;
}

CommandSet *ControlBar::newCommandSetOverride(CommandSet *set_to_override)
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

void ControlBar::parseCommandSetDefinition(INI *ini)
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
