extern "C" {

static const int INPUT_CAPACITY = 2 * 1024 * 1024;
static const int MAX_COMMAND_BUTTONS = 2048;
static const int MAX_COMMAND_SETS = 1024;
static const int MAX_COMMAND_SET_ENTRIES = 8192;
static const int NAME_CAPACITY = 2 * 1024 * 1024;

enum BlockKind
{
	BLOCK_NONE = 0,
	BLOCK_COMMAND_BUTTON = 1,
	BLOCK_COMMAND_SET = 2,
};

struct TokenRange
{
	int start;
	int end;
};

struct CommandButtonRecord
{
	int nameOffset;
	int nameSize;
	int line;
	int fieldCount;
	int commandOffset;
	int commandSize;
	int optionsOffset;
	int optionsSize;
	int objectOffset;
	int objectSize;
	int upgradeOffset;
	int upgradeSize;
	int weaponSlotOffset;
	int weaponSlotSize;
	int scienceOffset;
	int scienceSize;
	int specialPowerOffset;
	int specialPowerSize;
	int textLabelOffset;
	int textLabelSize;
	int descriptLabelOffset;
	int descriptLabelSize;
	int purchasedLabelOffset;
	int purchasedLabelSize;
	int conflictingLabelOffset;
	int conflictingLabelSize;
	int buttonImageOffset;
	int buttonImageSize;
	int cursorNameOffset;
	int cursorNameSize;
	int invalidCursorNameOffset;
	int invalidCursorNameSize;
	int buttonBorderTypeOffset;
	int buttonBorderTypeSize;
	int radiusCursorTypeOffset;
	int radiusCursorTypeSize;
	int unitSpecificSoundOffset;
	int unitSpecificSoundSize;
	int maxShotsToFire;
};

struct CommandSetRecord
{
	int nameOffset;
	int nameSize;
	int line;
	int entryCount;
	int firstEntry;
};

struct CommandSetEntryRecord
{
	int setIndex;
	int slot;
	int buttonOffset;
	int buttonSize;
	int line;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_command_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_command_names[NAME_CAPACITY];

static CommandButtonRecord g_generals_command_buttons[MAX_COMMAND_BUTTONS];
static CommandSetRecord g_generals_command_sets[MAX_COMMAND_SETS];
static CommandSetEntryRecord g_generals_command_entries[MAX_COMMAND_SET_ENTRIES];
static int g_generals_command_button_count = 0;
static int g_generals_command_button_field_count = 0;
static int g_generals_command_set_count = 0;
static int g_generals_command_set_entry_count = 0;
static int g_generals_command_line_count = 0;
static int g_generals_command_error_count = 0;
static int g_generals_command_name_cursor = 0;

static bool is_space(char value)
{
	return value == ' ' || value == '\t' || value == '\r' || value == '\n';
}

static bool is_token_separator(char value)
{
	return is_space(value) || value == '=';
}

static char lower_ascii(char value)
{
	if (value >= 'A' && value <= 'Z') {
		return (char)(value - 'A' + 'a');
	}

	return value;
}

static bool ascii_equal_ignore_case(const char *left, int leftSize, const char *right)
{
	int index = 0;
	while (index < leftSize && right[index] != 0) {
		if (lower_ascii(left[index]) != lower_ascii(right[index])) {
			return false;
		}
		++index;
	}

	return index == leftSize && right[index] == 0;
}

static void trim_range(const char *data, int *start, int *end)
{
	while (*start < *end && is_space(data[*start])) {
		++(*start);
	}
	while (*end > *start && is_space(data[*end - 1])) {
		--(*end);
	}
}

static int find_comment_start(const char *data, int start, int end)
{
	bool inQuote = false;
	for (int index = start; index < end; ++index) {
		const char value = data[index];
		if (value == '"') {
			inQuote = !inQuote;
		} else if (value == ';' && !inQuote) {
			return index;
		}
	}

	return end;
}

static int find_equals(const char *data, int start, int end)
{
	bool inQuote = false;
	for (int index = start; index < end; ++index) {
		const char value = data[index];
		if (value == '"') {
			inQuote = !inQuote;
		} else if (value == '=' && !inQuote) {
			return index;
		}
	}

	return -1;
}

static bool next_token(const char *data, int *cursor, int end, TokenRange *token)
{
	while (*cursor < end && is_token_separator(data[*cursor])) {
		++(*cursor);
	}

	if (*cursor >= end) {
		return false;
	}

	token->start = *cursor;
	while (*cursor < end && !is_token_separator(data[*cursor])) {
		++(*cursor);
	}
	token->end = *cursor;
	return token->end > token->start;
}

static bool token_equals(const char *data, TokenRange token, const char *value)
{
	return ascii_equal_ignore_case(data + token.start, token.end - token.start, value);
}

static int store_string(const char *value, int valueSize)
{
	if (valueSize < 0 || g_generals_command_name_cursor + valueSize + 1 > NAME_CAPACITY) {
		return -1;
	}

	const int offset = g_generals_command_name_cursor;
	for (int index = 0; index < valueSize; ++index) {
		g_generals_command_names[g_generals_command_name_cursor++] = value[index];
	}
	g_generals_command_names[g_generals_command_name_cursor++] = 0;
	return offset;
}

static void assign_string(int *offsetOut, int *sizeOut, const char *data, int start, int end)
{
	trim_range(data, &start, &end);
	const int size = end - start;
	if (size <= 0) {
		*offsetOut = -1;
		*sizeOut = 0;
		return;
	}

	const int offset = store_string(data + start, size);
	if (offset < 0) {
		++g_generals_command_error_count;
		return;
	}

	*offsetOut = offset;
	*sizeOut = size;
}

static bool parse_first_token_string(int *offsetOut, int *sizeOut, const char *data, int start, int end)
{
	int cursor = start;
	TokenRange token;
	if (!next_token(data, &cursor, end, &token)) {
		return false;
	}

	assign_string(offsetOut, sizeOut, data, token.start, token.end);
	return true;
}

static int parse_int(const char *data, int start, int end, int *integer)
{
	if (start >= end) {
		return 0;
	}

	int cursor = start;
	bool negative = false;
	if (data[cursor] == '-' || data[cursor] == '+') {
		negative = data[cursor] == '-';
		++cursor;
	}

	int value = 0;
	bool sawDigit = false;
	while (cursor < end && data[cursor] >= '0' && data[cursor] <= '9') {
		sawDigit = true;
		value = value * 10 + (data[cursor] - '0');
		++cursor;
	}

	if (!sawDigit) {
		return 0;
	}

	*integer = negative ? -value : value;
	return 1;
}

static int parse_first_int(const char *data, int start, int end, int *integer)
{
	int cursor = start;
	TokenRange token;
	if (!next_token(data, &cursor, end, &token)) {
		return 0;
	}

	return parse_int(data, token.start, token.end, integer);
}

static void clear_button(CommandButtonRecord *record)
{
	record->fieldCount = 0;
	record->commandOffset = -1;
	record->commandSize = 0;
	record->optionsOffset = -1;
	record->optionsSize = 0;
	record->objectOffset = -1;
	record->objectSize = 0;
	record->upgradeOffset = -1;
	record->upgradeSize = 0;
	record->weaponSlotOffset = -1;
	record->weaponSlotSize = 0;
	record->scienceOffset = -1;
	record->scienceSize = 0;
	record->specialPowerOffset = -1;
	record->specialPowerSize = 0;
	record->textLabelOffset = -1;
	record->textLabelSize = 0;
	record->descriptLabelOffset = -1;
	record->descriptLabelSize = 0;
	record->purchasedLabelOffset = -1;
	record->purchasedLabelSize = 0;
	record->conflictingLabelOffset = -1;
	record->conflictingLabelSize = 0;
	record->buttonImageOffset = -1;
	record->buttonImageSize = 0;
	record->cursorNameOffset = -1;
	record->cursorNameSize = 0;
	record->invalidCursorNameOffset = -1;
	record->invalidCursorNameSize = 0;
	record->buttonBorderTypeOffset = -1;
	record->buttonBorderTypeSize = 0;
	record->radiusCursorTypeOffset = -1;
	record->radiusCursorTypeSize = 0;
	record->unitSpecificSoundOffset = -1;
	record->unitSpecificSoundSize = 0;
	record->maxShotsToFire = 0x7fffffff;
}

static int start_button(const char *data, TokenRange name, int line)
{
	if (g_generals_command_button_count >= MAX_COMMAND_BUTTONS) {
		++g_generals_command_error_count;
		return -1;
	}

	const int nameSize = name.end - name.start;
	const int nameOffset = store_string(data + name.start, nameSize);
	if (nameOffset < 0) {
		++g_generals_command_error_count;
		return -1;
	}

	const int buttonIndex = g_generals_command_button_count++;
	CommandButtonRecord *record = &g_generals_command_buttons[buttonIndex];
	record->nameOffset = nameOffset;
	record->nameSize = nameSize;
	record->line = line;
	clear_button(record);
	return buttonIndex;
}

static int start_command_set(const char *data, TokenRange name, int line)
{
	if (g_generals_command_set_count >= MAX_COMMAND_SETS) {
		++g_generals_command_error_count;
		return -1;
	}

	const int nameSize = name.end - name.start;
	const int nameOffset = store_string(data + name.start, nameSize);
	if (nameOffset < 0) {
		++g_generals_command_error_count;
		return -1;
	}

	const int setIndex = g_generals_command_set_count++;
	CommandSetRecord *record = &g_generals_command_sets[setIndex];
	record->nameOffset = nameOffset;
	record->nameSize = nameSize;
	record->line = line;
	record->entryCount = 0;
	record->firstEntry = g_generals_command_set_entry_count;
	return setIndex;
}

static void parse_button_property(int buttonIndex, const char *data, int keyStart, int keyEnd, int valueStart, int valueEnd)
{
	if (buttonIndex < 0 || buttonIndex >= g_generals_command_button_count) {
		++g_generals_command_error_count;
		return;
	}

	CommandButtonRecord *record = &g_generals_command_buttons[buttonIndex];
	++record->fieldCount;
	++g_generals_command_button_field_count;

	if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Command")) {
		parse_first_token_string(&record->commandOffset, &record->commandSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Options")) {
		assign_string(&record->optionsOffset, &record->optionsSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Object")) {
		parse_first_token_string(&record->objectOffset, &record->objectSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Upgrade")) {
		parse_first_token_string(&record->upgradeOffset, &record->upgradeSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "WeaponSlot")) {
		parse_first_token_string(&record->weaponSlotOffset, &record->weaponSlotSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "MaxShotsToFire")) {
		if (!parse_first_int(data, valueStart, valueEnd, &record->maxShotsToFire)) {
			++g_generals_command_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Science")) {
		assign_string(&record->scienceOffset, &record->scienceSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "SpecialPower")) {
		parse_first_token_string(&record->specialPowerOffset, &record->specialPowerSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "TextLabel")) {
		parse_first_token_string(&record->textLabelOffset, &record->textLabelSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "DescriptLabel")) {
		parse_first_token_string(&record->descriptLabelOffset, &record->descriptLabelSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "PurchasedLabel")) {
		parse_first_token_string(&record->purchasedLabelOffset, &record->purchasedLabelSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ConflictingLabel")) {
		parse_first_token_string(&record->conflictingLabelOffset, &record->conflictingLabelSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ButtonImage")) {
		parse_first_token_string(&record->buttonImageOffset, &record->buttonImageSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "CursorName")) {
		parse_first_token_string(&record->cursorNameOffset, &record->cursorNameSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "InvalidCursorName")) {
		parse_first_token_string(&record->invalidCursorNameOffset, &record->invalidCursorNameSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ButtonBorderType")) {
		parse_first_token_string(&record->buttonBorderTypeOffset, &record->buttonBorderTypeSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "RadiusCursorType")) {
		parse_first_token_string(&record->radiusCursorTypeOffset, &record->radiusCursorTypeSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "UnitSpecificSound")) {
		assign_string(&record->unitSpecificSoundOffset, &record->unitSpecificSoundSize, data, valueStart, valueEnd);
	}
}

static void parse_command_set_property(int setIndex, const char *data, int keyStart, int keyEnd, int valueStart, int valueEnd, int line)
{
	if (setIndex < 0 || setIndex >= g_generals_command_set_count) {
		++g_generals_command_error_count;
		return;
	}

	int slot = -1;
	if (!parse_int(data, keyStart, keyEnd, &slot) || slot < 1 || slot > 18) {
		return;
	}

	if (g_generals_command_set_entry_count >= MAX_COMMAND_SET_ENTRIES) {
		++g_generals_command_error_count;
		return;
	}

	int cursor = valueStart;
	TokenRange button;
	if (!next_token(data, &cursor, valueEnd, &button)) {
		++g_generals_command_error_count;
		return;
	}

	const int nameOffset = store_string(data + button.start, button.end - button.start);
	if (nameOffset < 0) {
		++g_generals_command_error_count;
		return;
	}

	const int entryIndex = g_generals_command_set_entry_count++;
	CommandSetEntryRecord *entry = &g_generals_command_entries[entryIndex];
	entry->setIndex = setIndex;
	entry->slot = slot;
	entry->buttonOffset = nameOffset;
	entry->buttonSize = button.end - button.start;
	entry->line = line;
	++g_generals_command_sets[setIndex].entryCount;
}

static void parse_assignment(BlockKind blockKind, int buttonIndex, int setIndex, const char *data, int contentStart, int contentEnd, int line)
{
	const int equalsIndex = find_equals(data, contentStart, contentEnd);
	if (equalsIndex < 0) {
		return;
	}

	int keyStart = contentStart;
	int keyEnd = equalsIndex;
	int valueStart = equalsIndex + 1;
	int valueEnd = contentEnd;
	trim_range(data, &keyStart, &keyEnd);
	trim_range(data, &valueStart, &valueEnd);

	if (blockKind == BLOCK_COMMAND_BUTTON) {
		parse_button_property(buttonIndex, data, keyStart, keyEnd, valueStart, valueEnd);
	} else if (blockKind == BLOCK_COMMAND_SET) {
		parse_command_set_property(setIndex, data, keyStart, keyEnd, valueStart, valueEnd, line);
	}
}

static void reset_parser()
{
	g_generals_command_button_count = 0;
	g_generals_command_button_field_count = 0;
	g_generals_command_set_count = 0;
	g_generals_command_set_entry_count = 0;
	g_generals_command_line_count = 0;
	g_generals_command_error_count = 0;
	g_generals_command_name_cursor = 0;
}

__attribute__((used, visibility("default"))) unsigned int generals_command_input_ptr()
{
	return (unsigned int)g_generals_command_input;
}

__attribute__((used, visibility("default"))) int generals_command_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_command_parse(int inputSize)
{
	reset_parser();
	if (inputSize < 0 || inputSize > INPUT_CAPACITY) {
		g_generals_command_error_count = 1;
		return -1;
	}

	const char *data = (const char *)g_generals_command_input;
	int lineStart = 0;
	int line = 1;
	BlockKind blockKind = BLOCK_NONE;
	int currentButton = -1;
	int currentSet = -1;

	while (lineStart < inputSize) {
		int lineEnd = lineStart;
		while (lineEnd < inputSize && data[lineEnd] != '\n') {
			++lineEnd;
		}

		int contentStart = lineStart;
		int contentEnd = find_comment_start(data, contentStart, lineEnd);
		trim_range(data, &contentStart, &contentEnd);

		if (contentStart < contentEnd) {
			int cursor = contentStart;
			TokenRange first;
			if (next_token(data, &cursor, contentEnd, &first)) {
				if (token_equals(data, first, "CommandButton")) {
					TokenRange name;
					if (next_token(data, &cursor, contentEnd, &name)) {
						currentButton = start_button(data, name, line);
						currentSet = -1;
						blockKind = BLOCK_COMMAND_BUTTON;
					} else {
						++g_generals_command_error_count;
					}
				} else if (token_equals(data, first, "CommandSet")) {
					TokenRange name;
					if (next_token(data, &cursor, contentEnd, &name)) {
						currentSet = start_command_set(data, name, line);
						currentButton = -1;
						blockKind = BLOCK_COMMAND_SET;
					} else {
						++g_generals_command_error_count;
					}
				} else if (token_equals(data, first, "End")) {
					blockKind = BLOCK_NONE;
					currentButton = -1;
					currentSet = -1;
				} else {
					parse_assignment(blockKind, currentButton, currentSet, data, contentStart, contentEnd, line);
				}
			}
		}

		if (lineEnd >= inputSize) {
			break;
		}
		lineStart = lineEnd + 1;
		++line;
	}

	g_generals_command_line_count = line;
	if (g_generals_command_error_count != 0) {
		return -1;
	}

	return g_generals_command_button_count + g_generals_command_set_count;
}

__attribute__((used, visibility("default"))) int generals_command_button_count()
{
	return g_generals_command_button_count;
}

__attribute__((used, visibility("default"))) int generals_command_button_field_count()
{
	return g_generals_command_button_field_count;
}

__attribute__((used, visibility("default"))) int generals_command_set_count()
{
	return g_generals_command_set_count;
}

__attribute__((used, visibility("default"))) int generals_command_set_entry_count()
{
	return g_generals_command_set_entry_count;
}

__attribute__((used, visibility("default"))) int generals_command_line_count()
{
	return g_generals_command_line_count;
}

__attribute__((used, visibility("default"))) int generals_command_error_count()
{
	return g_generals_command_error_count;
}

#define COMMAND_BUTTON_STRING_EXPORTS(field_name, field_offset, field_size) \
__attribute__((used, visibility("default"))) int generals_command_button_##field_name##_ptr(int index) \
{ \
	if (index < 0 || index >= g_generals_command_button_count || g_generals_command_buttons[index].field_offset < 0) { \
		return 0; \
	} \
	return (int)(g_generals_command_names + g_generals_command_buttons[index].field_offset); \
} \
__attribute__((used, visibility("default"))) int generals_command_button_##field_name##_size(int index) \
{ \
	if (index < 0 || index >= g_generals_command_button_count) { \
		return -1; \
	} \
	return g_generals_command_buttons[index].field_size; \
}

COMMAND_BUTTON_STRING_EXPORTS(name, nameOffset, nameSize)
COMMAND_BUTTON_STRING_EXPORTS(command, commandOffset, commandSize)
COMMAND_BUTTON_STRING_EXPORTS(options, optionsOffset, optionsSize)
COMMAND_BUTTON_STRING_EXPORTS(object, objectOffset, objectSize)
COMMAND_BUTTON_STRING_EXPORTS(upgrade, upgradeOffset, upgradeSize)
COMMAND_BUTTON_STRING_EXPORTS(weapon_slot, weaponSlotOffset, weaponSlotSize)
COMMAND_BUTTON_STRING_EXPORTS(science, scienceOffset, scienceSize)
COMMAND_BUTTON_STRING_EXPORTS(special_power, specialPowerOffset, specialPowerSize)
COMMAND_BUTTON_STRING_EXPORTS(text_label, textLabelOffset, textLabelSize)
COMMAND_BUTTON_STRING_EXPORTS(descript_label, descriptLabelOffset, descriptLabelSize)
COMMAND_BUTTON_STRING_EXPORTS(purchased_label, purchasedLabelOffset, purchasedLabelSize)
COMMAND_BUTTON_STRING_EXPORTS(conflicting_label, conflictingLabelOffset, conflictingLabelSize)
COMMAND_BUTTON_STRING_EXPORTS(button_image, buttonImageOffset, buttonImageSize)
COMMAND_BUTTON_STRING_EXPORTS(cursor_name, cursorNameOffset, cursorNameSize)
COMMAND_BUTTON_STRING_EXPORTS(invalid_cursor_name, invalidCursorNameOffset, invalidCursorNameSize)
COMMAND_BUTTON_STRING_EXPORTS(button_border_type, buttonBorderTypeOffset, buttonBorderTypeSize)
COMMAND_BUTTON_STRING_EXPORTS(radius_cursor_type, radiusCursorTypeOffset, radiusCursorTypeSize)
COMMAND_BUTTON_STRING_EXPORTS(unit_specific_sound, unitSpecificSoundOffset, unitSpecificSoundSize)

#undef COMMAND_BUTTON_STRING_EXPORTS

__attribute__((used, visibility("default"))) int generals_command_button_line(int index)
{
	if (index < 0 || index >= g_generals_command_button_count) {
		return -1;
	}

	return g_generals_command_buttons[index].line;
}

__attribute__((used, visibility("default"))) int generals_command_button_field_count_at(int index)
{
	if (index < 0 || index >= g_generals_command_button_count) {
		return -1;
	}

	return g_generals_command_buttons[index].fieldCount;
}

__attribute__((used, visibility("default"))) int generals_command_button_max_shots_to_fire(int index)
{
	if (index < 0 || index >= g_generals_command_button_count) {
		return -1;
	}

	return g_generals_command_buttons[index].maxShotsToFire;
}

__attribute__((used, visibility("default"))) int generals_command_set_name_ptr(int index)
{
	if (index < 0 || index >= g_generals_command_set_count || g_generals_command_sets[index].nameOffset < 0) {
		return 0;
	}

	return (int)(g_generals_command_names + g_generals_command_sets[index].nameOffset);
}

__attribute__((used, visibility("default"))) int generals_command_set_name_size(int index)
{
	if (index < 0 || index >= g_generals_command_set_count) {
		return -1;
	}

	return g_generals_command_sets[index].nameSize;
}

__attribute__((used, visibility("default"))) int generals_command_set_line(int index)
{
	if (index < 0 || index >= g_generals_command_set_count) {
		return -1;
	}

	return g_generals_command_sets[index].line;
}

__attribute__((used, visibility("default"))) int generals_command_set_entry_count_at(int index)
{
	if (index < 0 || index >= g_generals_command_set_count) {
		return -1;
	}

	return g_generals_command_sets[index].entryCount;
}

__attribute__((used, visibility("default"))) int generals_command_set_first_entry(int index)
{
	if (index < 0 || index >= g_generals_command_set_count) {
		return -1;
	}

	return g_generals_command_sets[index].firstEntry;
}

__attribute__((used, visibility("default"))) int generals_command_set_entry_set_index(int index)
{
	if (index < 0 || index >= g_generals_command_set_entry_count) {
		return -1;
	}

	return g_generals_command_entries[index].setIndex;
}

__attribute__((used, visibility("default"))) int generals_command_set_entry_slot(int index)
{
	if (index < 0 || index >= g_generals_command_set_entry_count) {
		return -1;
	}

	return g_generals_command_entries[index].slot;
}

__attribute__((used, visibility("default"))) int generals_command_set_entry_button_ptr(int index)
{
	if (index < 0 || index >= g_generals_command_set_entry_count || g_generals_command_entries[index].buttonOffset < 0) {
		return 0;
	}

	return (int)(g_generals_command_names + g_generals_command_entries[index].buttonOffset);
}

__attribute__((used, visibility("default"))) int generals_command_set_entry_button_size(int index)
{
	if (index < 0 || index >= g_generals_command_set_entry_count) {
		return -1;
	}

	return g_generals_command_entries[index].buttonSize;
}

__attribute__((used, visibility("default"))) int generals_command_set_entry_line(int index)
{
	if (index < 0 || index >= g_generals_command_set_entry_count) {
		return -1;
	}

	return g_generals_command_entries[index].line;
}

}
