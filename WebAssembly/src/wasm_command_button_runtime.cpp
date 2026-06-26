#include "PreRTS.h"

#define DEFINE_COMMAND_OPTION_NAMES
#define DEFINE_GUI_COMMMAND_NAMES
#define DEFINE_RADIUSCURSOR_NAMES
#define DEFINE_WEAPONSLOTTYPE_NAMES

#include "Common/INI.h"
#include "GameClient/InGameUI.h"
#include "GameClient/ControlBar.h"
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

ControlBar::ControlBar()
{
	m_UIDirty = false;
	m_commandButtons = nullptr;
	m_commandSets = nullptr;
	m_controlBarSchemeManager = nullptr;
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
