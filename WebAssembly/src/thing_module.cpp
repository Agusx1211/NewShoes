extern "C" {

static const int INPUT_CAPACITY = 2 * 1024 * 1024;
static const int MAX_TEMPLATES = 4096;
static const int MAX_ARMOR_SETS = 8192;
static const int MAX_WEAPON_SETS = 8192;
static const int MAX_PREREQUISITES = 8192;
static const int NAME_CAPACITY = 4 * 1024 * 1024;

enum DirectBlock
{
	BLOCK_NONE = 0,
	BLOCK_ARMOR_SET = 1,
	BLOCK_WEAPON_SET = 2,
	BLOCK_PREREQUISITES = 3,
	BLOCK_SKIP = 4,
};

enum ThingKindFlag
{
	THING_KIND_SELECTABLE = 1 << 0,
	THING_KIND_CAN_ATTACK = 1 << 1,
	THING_KIND_STRUCTURE = 1 << 2,
	THING_KIND_INFANTRY = 1 << 3,
	THING_KIND_VEHICLE = 1 << 4,
	THING_KIND_AIRCRAFT = 1 << 5,
	THING_KIND_PROJECTILE = 1 << 6,
	THING_KIND_IMMOBILE = 1 << 7,
	THING_KIND_DRAWABLE_ONLY = 1 << 8,
};

struct TokenRange
{
	int start;
	int end;
};

struct ThingTemplateRecord
{
	int nameOffset;
	int nameSize;
	int displayNameOffset;
	int displayNameSize;
	int sideOffset;
	int sideSize;
	int editorSortingOffset;
	int editorSortingSize;
	int commandSetOffset;
	int commandSetSize;
	int kindOfOffset;
	int kindOfSize;
	int line;
	int fieldCount;
	int armorSetCount;
	int firstArmorSet;
	int weaponSetCount;
	int firstWeaponSet;
	int prerequisiteCount;
	int firstPrerequisite;
	int moduleCount;
	int buildCost;
	int buildTimeX100;
	int visionRangeX100;
	int shroudClearingRangeX100;
	int transportSlotCount;
	int kindTokenCount;
	int kindFlags;
};

struct ArmorSetRecord
{
	int objectIndex;
	int conditionsOffset;
	int conditionsSize;
	int armorOffset;
	int armorSize;
	int damageFxOffset;
	int damageFxSize;
	int line;
};

struct WeaponSetRecord
{
	int objectIndex;
	int conditionsOffset;
	int conditionsSize;
	int primaryOffset;
	int primarySize;
	int secondaryOffset;
	int secondarySize;
	int tertiaryOffset;
	int tertiarySize;
	int line;
};

struct PrerequisiteRecord
{
	int objectIndex;
	int kind;
	int valueOffset;
	int valueSize;
	int tokenCount;
	int line;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_thing_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_thing_names[NAME_CAPACITY];

static ThingTemplateRecord g_generals_thing_templates[MAX_TEMPLATES];
static ArmorSetRecord g_generals_thing_armor_sets[MAX_ARMOR_SETS];
static WeaponSetRecord g_generals_thing_weapon_sets[MAX_WEAPON_SETS];
static PrerequisiteRecord g_generals_thing_prerequisites[MAX_PREREQUISITES];
static int g_generals_thing_template_count = 0;
static int g_generals_thing_field_count = 0;
static int g_generals_thing_armor_set_count = 0;
static int g_generals_thing_weapon_set_count = 0;
static int g_generals_thing_prerequisite_count = 0;
static int g_generals_thing_module_count = 0;
static int g_generals_thing_line_count = 0;
static int g_generals_thing_error_count = 0;
static int g_generals_thing_name_cursor = 0;

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

static int leading_indent(const char *data, int start, int end)
{
	int indent = 0;
	while (start < end) {
		if (data[start] == ' ') {
			++indent;
		} else if (data[start] == '\t') {
			indent += 2;
		} else {
			break;
		}
		++start;
	}

	return indent;
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

static int store_string(const char *value, int valueSize)
{
	if (valueSize < 0 || g_generals_thing_name_cursor + valueSize + 1 > NAME_CAPACITY) {
		return -1;
	}

	const int offset = g_generals_thing_name_cursor;
	for (int index = 0; index < valueSize; ++index) {
		g_generals_thing_names[g_generals_thing_name_cursor++] = value[index];
	}
	g_generals_thing_names[g_generals_thing_name_cursor++] = 0;
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
		++g_generals_thing_error_count;
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

static int parse_real_x100(const char *data, int start, int end, int *realX100)
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

	int whole = 0;
	bool sawDigit = false;
	while (cursor < end && data[cursor] >= '0' && data[cursor] <= '9') {
		sawDigit = true;
		whole = whole * 10 + (data[cursor] - '0');
		++cursor;
	}

	int fraction = 0;
	int fractionDigits = 0;
	if (cursor < end && data[cursor] == '.') {
		++cursor;
		while (cursor < end && data[cursor] >= '0' && data[cursor] <= '9') {
			sawDigit = true;
			if (fractionDigits < 2) {
				fraction = fraction * 10 + (data[cursor] - '0');
				++fractionDigits;
			}
			++cursor;
		}
	}

	while (fractionDigits < 2) {
		fraction *= 10;
		++fractionDigits;
	}

	if (!sawDigit) {
		return 0;
	}

	int value = whole * 100 + fraction;
	if (negative) {
		value = -value;
	}

	*realX100 = value;
	return 1;
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

	if (negative) {
		value = -value;
	}

	*integer = value;
	return 1;
}

static int parse_first_real_x100(const char *data, int start, int end, int *realX100)
{
	int cursor = start;
	TokenRange token;
	if (!next_token(data, &cursor, end, &token)) {
		return 0;
	}

	return parse_real_x100(data, token.start, token.end, realX100);
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

static int kind_flag_for_token(const char *data, int start, int end)
{
	if (ascii_equal_ignore_case(data + start, end - start, "SELECTABLE")) {
		return THING_KIND_SELECTABLE;
	}
	if (ascii_equal_ignore_case(data + start, end - start, "CAN_ATTACK")) {
		return THING_KIND_CAN_ATTACK;
	}
	if (ascii_equal_ignore_case(data + start, end - start, "STRUCTURE")) {
		return THING_KIND_STRUCTURE;
	}
	if (ascii_equal_ignore_case(data + start, end - start, "INFANTRY")) {
		return THING_KIND_INFANTRY;
	}
	if (ascii_equal_ignore_case(data + start, end - start, "VEHICLE")) {
		return THING_KIND_VEHICLE;
	}
	if (ascii_equal_ignore_case(data + start, end - start, "AIRCRAFT")) {
		return THING_KIND_AIRCRAFT;
	}
	if (ascii_equal_ignore_case(data + start, end - start, "PROJECTILE")) {
		return THING_KIND_PROJECTILE;
	}
	if (ascii_equal_ignore_case(data + start, end - start, "IMMOBILE")) {
		return THING_KIND_IMMOBILE;
	}
	if (ascii_equal_ignore_case(data + start, end - start, "DRAWABLE_ONLY")) {
		return THING_KIND_DRAWABLE_ONLY;
	}

	return 0;
}

static bool is_end_token(const char *data, int start, int end)
{
	return ascii_equal_ignore_case(data + start, end - start, "End");
}

static bool token_equals(const char *data, TokenRange token, const char *value)
{
	return ascii_equal_ignore_case(data + token.start, token.end - token.start, value);
}

static bool is_direct_nested_block(const char *data, TokenRange token)
{
	static const char *blocks[] = {
		"Draw", "Body", "Behavior", "ClientUpdate", "UnitSpecificSounds",
		"UnitSpecificFX", "InheritableModule", "AddModule",
		"ReplaceModule", 0
	};

	for (int index = 0; blocks[index] != 0; ++index) {
		if (token_equals(data, token, blocks[index])) {
			return true;
		}
	}

	return false;
}

static void clear_template(ThingTemplateRecord *record)
{
	record->displayNameOffset = -1;
	record->displayNameSize = 0;
	record->sideOffset = -1;
	record->sideSize = 0;
	record->editorSortingOffset = -1;
	record->editorSortingSize = 0;
	record->commandSetOffset = -1;
	record->commandSetSize = 0;
	record->kindOfOffset = -1;
	record->kindOfSize = 0;
	record->fieldCount = 0;
	record->armorSetCount = 0;
	record->firstArmorSet = g_generals_thing_armor_set_count;
	record->weaponSetCount = 0;
	record->firstWeaponSet = g_generals_thing_weapon_set_count;
	record->prerequisiteCount = 0;
	record->firstPrerequisite = g_generals_thing_prerequisite_count;
	record->moduleCount = 0;
	record->buildCost = 0;
	record->buildTimeX100 = 100;
	record->visionRangeX100 = 0;
	record->shroudClearingRangeX100 = -100;
	record->transportSlotCount = 0;
	record->kindTokenCount = 0;
	record->kindFlags = 0;
}

static int start_template(const char *data, TokenRange name, int line)
{
	if (g_generals_thing_template_count >= MAX_TEMPLATES) {
		++g_generals_thing_error_count;
		return -1;
	}

	const int nameSize = name.end - name.start;
	const int nameOffset = store_string(data + name.start, nameSize);
	if (nameOffset < 0) {
		++g_generals_thing_error_count;
		return -1;
	}

	const int templateIndex = g_generals_thing_template_count++;
	ThingTemplateRecord *record = &g_generals_thing_templates[templateIndex];
	record->nameOffset = nameOffset;
	record->nameSize = nameSize;
	record->line = line;
	clear_template(record);
	return templateIndex;
}

static int start_armor_set(int objectIndex, int line)
{
	if (objectIndex < 0 || objectIndex >= g_generals_thing_template_count ||
		g_generals_thing_armor_set_count >= MAX_ARMOR_SETS) {
		++g_generals_thing_error_count;
		return -1;
	}

	const int setIndex = g_generals_thing_armor_set_count++;
	ArmorSetRecord *record = &g_generals_thing_armor_sets[setIndex];
	record->objectIndex = objectIndex;
	record->conditionsOffset = -1;
	record->conditionsSize = 0;
	record->armorOffset = -1;
	record->armorSize = 0;
	record->damageFxOffset = -1;
	record->damageFxSize = 0;
	record->line = line;
	++g_generals_thing_templates[objectIndex].armorSetCount;
	return setIndex;
}

static int start_weapon_set(int objectIndex, int line)
{
	if (objectIndex < 0 || objectIndex >= g_generals_thing_template_count ||
		g_generals_thing_weapon_set_count >= MAX_WEAPON_SETS) {
		++g_generals_thing_error_count;
		return -1;
	}

	const int setIndex = g_generals_thing_weapon_set_count++;
	WeaponSetRecord *record = &g_generals_thing_weapon_sets[setIndex];
	record->objectIndex = objectIndex;
	record->conditionsOffset = -1;
	record->conditionsSize = 0;
	record->primaryOffset = -1;
	record->primarySize = 0;
	record->secondaryOffset = -1;
	record->secondarySize = 0;
	record->tertiaryOffset = -1;
	record->tertiarySize = 0;
	record->line = line;
	++g_generals_thing_templates[objectIndex].weaponSetCount;
	return setIndex;
}

static int token_count(const char *data, int start, int end)
{
	int cursor = start;
	TokenRange token;
	int count = 0;
	while (next_token(data, &cursor, end, &token)) {
		++count;
	}

	return count;
}

static int start_prerequisite(int objectIndex, int kind, const char *data, int valueStart, int valueEnd, int line, bool firstTokenOnly)
{
	if (objectIndex < 0 || objectIndex >= g_generals_thing_template_count ||
		g_generals_thing_prerequisite_count >= MAX_PREREQUISITES) {
		++g_generals_thing_error_count;
		return -1;
	}

	int storeStart = valueStart;
	int storeEnd = valueEnd;
	int count = token_count(data, valueStart, valueEnd);
	if (firstTokenOnly) {
		int cursor = valueStart;
		TokenRange token;
		if (!next_token(data, &cursor, valueEnd, &token)) {
			++g_generals_thing_error_count;
			return -1;
		}
		storeStart = token.start;
		storeEnd = token.end;
		count = 1;
	}

	const int valueOffset = store_string(data + storeStart, storeEnd - storeStart);
	if (valueOffset < 0) {
		++g_generals_thing_error_count;
		return -1;
	}

	const int prereqIndex = g_generals_thing_prerequisite_count++;
	PrerequisiteRecord *record = &g_generals_thing_prerequisites[prereqIndex];
	record->objectIndex = objectIndex;
	record->kind = kind;
	record->valueOffset = valueOffset;
	record->valueSize = storeEnd - storeStart;
	record->tokenCount = count;
	record->line = line;
	++g_generals_thing_templates[objectIndex].prerequisiteCount;
	return prereqIndex;
}

static void count_field(int objectIndex)
{
	if (objectIndex >= 0 && objectIndex < g_generals_thing_template_count) {
		++g_generals_thing_templates[objectIndex].fieldCount;
		++g_generals_thing_field_count;
	}
}

static void parse_kind_of(ThingTemplateRecord *record, const char *data, int start, int end)
{
	assign_string(&record->kindOfOffset, &record->kindOfSize, data, start, end);

	int cursor = start;
	TokenRange token;
	record->kindTokenCount = 0;
	record->kindFlags = 0;
	while (next_token(data, &cursor, end, &token)) {
		if (!token_equals(data, token, "NONE")) {
			++record->kindTokenCount;
		}
		record->kindFlags |= kind_flag_for_token(data, token.start, token.end);
	}
}

static void parse_direct_property(int objectIndex, const char *data, int keyStart, int keyEnd, int valueStart, int valueEnd)
{
	if (objectIndex < 0 || objectIndex >= g_generals_thing_template_count) {
		++g_generals_thing_error_count;
		return;
	}

	ThingTemplateRecord *record = &g_generals_thing_templates[objectIndex];
	count_field(objectIndex);

	if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "DisplayName")) {
		parse_first_token_string(&record->displayNameOffset, &record->displayNameSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Side")) {
		parse_first_token_string(&record->sideOffset, &record->sideSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "EditorSorting")) {
		parse_first_token_string(&record->editorSortingOffset, &record->editorSortingSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "CommandSet")) {
		parse_first_token_string(&record->commandSetOffset, &record->commandSetSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "BuildCost")) {
		if (!parse_first_int(data, valueStart, valueEnd, &record->buildCost)) {
			++g_generals_thing_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "BuildTime")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->buildTimeX100)) {
			++g_generals_thing_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "VisionRange")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->visionRangeX100)) {
			++g_generals_thing_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ShroudClearingRange")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->shroudClearingRangeX100)) {
			++g_generals_thing_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "TransportSlotCount")) {
		if (!parse_first_int(data, valueStart, valueEnd, &record->transportSlotCount)) {
			++g_generals_thing_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "KindOf")) {
		parse_kind_of(record, data, valueStart, valueEnd);
	}
}

static void parse_armor_property(int setIndex, const char *data, int keyStart, int keyEnd, int valueStart, int valueEnd)
{
	if (setIndex < 0 || setIndex >= g_generals_thing_armor_set_count) {
		++g_generals_thing_error_count;
		return;
	}

	ArmorSetRecord *record = &g_generals_thing_armor_sets[setIndex];
	if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Conditions")) {
		assign_string(&record->conditionsOffset, &record->conditionsSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Armor")) {
		parse_first_token_string(&record->armorOffset, &record->armorSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "DamageFX")) {
		parse_first_token_string(&record->damageFxOffset, &record->damageFxSize, data, valueStart, valueEnd);
	}
}

static void assign_weapon_slot(WeaponSetRecord *record, const char *data, TokenRange slot, int valueStart, int valueEnd)
{
	int *offset = 0;
	int *size = 0;
	if (token_equals(data, slot, "PRIMARY")) {
		offset = &record->primaryOffset;
		size = &record->primarySize;
	} else if (token_equals(data, slot, "SECONDARY")) {
		offset = &record->secondaryOffset;
		size = &record->secondarySize;
	} else if (token_equals(data, slot, "TERTIARY")) {
		offset = &record->tertiaryOffset;
		size = &record->tertiarySize;
	}

	if (offset == 0 || size == 0 || !parse_first_token_string(offset, size, data, valueStart, valueEnd)) {
		++g_generals_thing_error_count;
	}
}

static void parse_weapon_property(int setIndex, const char *data, int keyStart, int keyEnd, int valueStart, int valueEnd)
{
	if (setIndex < 0 || setIndex >= g_generals_thing_weapon_set_count) {
		++g_generals_thing_error_count;
		return;
	}

	WeaponSetRecord *record = &g_generals_thing_weapon_sets[setIndex];
	if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Conditions")) {
		assign_string(&record->conditionsOffset, &record->conditionsSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Weapon")) {
		int cursor = valueStart;
		TokenRange slot;
		if (!next_token(data, &cursor, valueEnd, &slot)) {
			++g_generals_thing_error_count;
			return;
		}
		assign_weapon_slot(record, data, slot, cursor, valueEnd);
	}
}

static void parse_prerequisite_property(int objectIndex, const char *data, int keyStart, int keyEnd, int valueStart, int valueEnd, int line)
{
	if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Object")) {
		start_prerequisite(objectIndex, 1, data, valueStart, valueEnd, line, false);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Science")) {
		start_prerequisite(objectIndex, 2, data, valueStart, valueEnd, line, true);
	}
}

static void parse_assignment(DirectBlock directBlock, int objectIndex, int armorSetIndex, int weaponSetIndex, const char *data, int contentStart, int contentEnd)
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

	if (directBlock == BLOCK_ARMOR_SET) {
		parse_armor_property(armorSetIndex, data, keyStart, keyEnd, valueStart, valueEnd);
	} else if (directBlock == BLOCK_WEAPON_SET) {
		parse_weapon_property(weaponSetIndex, data, keyStart, keyEnd, valueStart, valueEnd);
	} else if (directBlock == BLOCK_PREREQUISITES) {
		parse_prerequisite_property(objectIndex, data, keyStart, keyEnd, valueStart, valueEnd, g_generals_thing_line_count);
	} else if (directBlock == BLOCK_NONE) {
		parse_direct_property(objectIndex, data, keyStart, keyEnd, valueStart, valueEnd);
	}
}

static void count_nested_block(int objectIndex)
{
	count_field(objectIndex);
	if (objectIndex >= 0 && objectIndex < g_generals_thing_template_count) {
		++g_generals_thing_templates[objectIndex].moduleCount;
		++g_generals_thing_module_count;
	}
}

__attribute__((used, visibility("default"))) unsigned int generals_thing_input_ptr()
{
	return (unsigned int)g_generals_thing_input;
}

__attribute__((used, visibility("default"))) int generals_thing_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_thing_template_count()
{
	return g_generals_thing_template_count;
}

__attribute__((used, visibility("default"))) int generals_thing_field_count()
{
	return g_generals_thing_field_count;
}

__attribute__((used, visibility("default"))) int generals_thing_armor_set_count()
{
	return g_generals_thing_armor_set_count;
}

__attribute__((used, visibility("default"))) int generals_thing_weapon_set_count()
{
	return g_generals_thing_weapon_set_count;
}

__attribute__((used, visibility("default"))) int generals_thing_prerequisite_count()
{
	return g_generals_thing_prerequisite_count;
}

__attribute__((used, visibility("default"))) int generals_thing_module_count()
{
	return g_generals_thing_module_count;
}

__attribute__((used, visibility("default"))) int generals_thing_line_count()
{
	return g_generals_thing_line_count;
}

__attribute__((used, visibility("default"))) int generals_thing_error_count()
{
	return g_generals_thing_error_count;
}

__attribute__((used, visibility("default"))) int generals_thing_template_name_ptr(int index)
{
	if (index < 0 || index >= g_generals_thing_template_count) {
		return 0;
	}

	return (int)(g_generals_thing_names + g_generals_thing_templates[index].nameOffset);
}

__attribute__((used, visibility("default"))) int generals_thing_template_name_size(int index)
{
	if (index < 0 || index >= g_generals_thing_template_count) {
		return -1;
	}

	return g_generals_thing_templates[index].nameSize;
}

__attribute__((used, visibility("default"))) int generals_thing_template_line(int index)
{
	if (index < 0 || index >= g_generals_thing_template_count) {
		return -1;
	}

	return g_generals_thing_templates[index].line;
}

__attribute__((used, visibility("default"))) int generals_thing_template_field_count(int index)
{
	if (index < 0 || index >= g_generals_thing_template_count) {
		return -1;
	}

	return g_generals_thing_templates[index].fieldCount;
}

__attribute__((used, visibility("default"))) int generals_thing_template_display_name_ptr(int index)
{
	if (index < 0 || index >= g_generals_thing_template_count || g_generals_thing_templates[index].displayNameOffset < 0) {
		return 0;
	}

	return (int)(g_generals_thing_names + g_generals_thing_templates[index].displayNameOffset);
}

__attribute__((used, visibility("default"))) int generals_thing_template_display_name_size(int index)
{
	if (index < 0 || index >= g_generals_thing_template_count) {
		return -1;
	}

	return g_generals_thing_templates[index].displayNameSize;
}

__attribute__((used, visibility("default"))) int generals_thing_template_side_ptr(int index)
{
	if (index < 0 || index >= g_generals_thing_template_count || g_generals_thing_templates[index].sideOffset < 0) {
		return 0;
	}

	return (int)(g_generals_thing_names + g_generals_thing_templates[index].sideOffset);
}

__attribute__((used, visibility("default"))) int generals_thing_template_side_size(int index)
{
	if (index < 0 || index >= g_generals_thing_template_count) {
		return -1;
	}

	return g_generals_thing_templates[index].sideSize;
}

__attribute__((used, visibility("default"))) int generals_thing_template_editor_sorting_ptr(int index)
{
	if (index < 0 || index >= g_generals_thing_template_count || g_generals_thing_templates[index].editorSortingOffset < 0) {
		return 0;
	}

	return (int)(g_generals_thing_names + g_generals_thing_templates[index].editorSortingOffset);
}

__attribute__((used, visibility("default"))) int generals_thing_template_editor_sorting_size(int index)
{
	if (index < 0 || index >= g_generals_thing_template_count) {
		return -1;
	}

	return g_generals_thing_templates[index].editorSortingSize;
}

__attribute__((used, visibility("default"))) int generals_thing_template_command_set_ptr(int index)
{
	if (index < 0 || index >= g_generals_thing_template_count || g_generals_thing_templates[index].commandSetOffset < 0) {
		return 0;
	}

	return (int)(g_generals_thing_names + g_generals_thing_templates[index].commandSetOffset);
}

__attribute__((used, visibility("default"))) int generals_thing_template_command_set_size(int index)
{
	if (index < 0 || index >= g_generals_thing_template_count) {
		return -1;
	}

	return g_generals_thing_templates[index].commandSetSize;
}

__attribute__((used, visibility("default"))) int generals_thing_template_kind_of_ptr(int index)
{
	if (index < 0 || index >= g_generals_thing_template_count || g_generals_thing_templates[index].kindOfOffset < 0) {
		return 0;
	}

	return (int)(g_generals_thing_names + g_generals_thing_templates[index].kindOfOffset);
}

__attribute__((used, visibility("default"))) int generals_thing_template_kind_of_size(int index)
{
	if (index < 0 || index >= g_generals_thing_template_count) {
		return -1;
	}

	return g_generals_thing_templates[index].kindOfSize;
}

__attribute__((used, visibility("default"))) int generals_thing_template_kind_token_count(int index)
{
	if (index < 0 || index >= g_generals_thing_template_count) {
		return -1;
	}

	return g_generals_thing_templates[index].kindTokenCount;
}

__attribute__((used, visibility("default"))) int generals_thing_template_kind_flags(int index)
{
	if (index < 0 || index >= g_generals_thing_template_count) {
		return -1;
	}

	return g_generals_thing_templates[index].kindFlags;
}

__attribute__((used, visibility("default"))) int generals_thing_template_build_cost(int index)
{
	if (index < 0 || index >= g_generals_thing_template_count) {
		return -1;
	}

	return g_generals_thing_templates[index].buildCost;
}

__attribute__((used, visibility("default"))) int generals_thing_template_build_time_x100(int index)
{
	if (index < 0 || index >= g_generals_thing_template_count) {
		return -1;
	}

	return g_generals_thing_templates[index].buildTimeX100;
}

__attribute__((used, visibility("default"))) int generals_thing_template_vision_range_x100(int index)
{
	if (index < 0 || index >= g_generals_thing_template_count) {
		return -1;
	}

	return g_generals_thing_templates[index].visionRangeX100;
}

__attribute__((used, visibility("default"))) int generals_thing_template_shroud_clearing_range_x100(int index)
{
	if (index < 0 || index >= g_generals_thing_template_count) {
		return -1;
	}

	return g_generals_thing_templates[index].shroudClearingRangeX100;
}

__attribute__((used, visibility("default"))) int generals_thing_template_transport_slot_count(int index)
{
	if (index < 0 || index >= g_generals_thing_template_count) {
		return -1;
	}

	return g_generals_thing_templates[index].transportSlotCount;
}

__attribute__((used, visibility("default"))) int generals_thing_template_module_count(int index)
{
	if (index < 0 || index >= g_generals_thing_template_count) {
		return -1;
	}

	return g_generals_thing_templates[index].moduleCount;
}

__attribute__((used, visibility("default"))) int generals_thing_template_first_armor_set(int index)
{
	if (index < 0 || index >= g_generals_thing_template_count) {
		return -1;
	}

	return g_generals_thing_templates[index].firstArmorSet;
}

__attribute__((used, visibility("default"))) int generals_thing_template_armor_set_count(int index)
{
	if (index < 0 || index >= g_generals_thing_template_count) {
		return -1;
	}

	return g_generals_thing_templates[index].armorSetCount;
}

__attribute__((used, visibility("default"))) int generals_thing_template_first_weapon_set(int index)
{
	if (index < 0 || index >= g_generals_thing_template_count) {
		return -1;
	}

	return g_generals_thing_templates[index].firstWeaponSet;
}

__attribute__((used, visibility("default"))) int generals_thing_template_weapon_set_count(int index)
{
	if (index < 0 || index >= g_generals_thing_template_count) {
		return -1;
	}

	return g_generals_thing_templates[index].weaponSetCount;
}

__attribute__((used, visibility("default"))) int generals_thing_template_first_prerequisite(int index)
{
	if (index < 0 || index >= g_generals_thing_template_count) {
		return -1;
	}

	return g_generals_thing_templates[index].firstPrerequisite;
}

__attribute__((used, visibility("default"))) int generals_thing_template_prerequisite_count(int index)
{
	if (index < 0 || index >= g_generals_thing_template_count) {
		return -1;
	}

	return g_generals_thing_templates[index].prerequisiteCount;
}

__attribute__((used, visibility("default"))) int generals_thing_armor_set_object_index(int index)
{
	if (index < 0 || index >= g_generals_thing_armor_set_count) {
		return -1;
	}

	return g_generals_thing_armor_sets[index].objectIndex;
}

__attribute__((used, visibility("default"))) int generals_thing_armor_set_conditions_ptr(int index)
{
	if (index < 0 || index >= g_generals_thing_armor_set_count || g_generals_thing_armor_sets[index].conditionsOffset < 0) {
		return 0;
	}

	return (int)(g_generals_thing_names + g_generals_thing_armor_sets[index].conditionsOffset);
}

__attribute__((used, visibility("default"))) int generals_thing_armor_set_conditions_size(int index)
{
	if (index < 0 || index >= g_generals_thing_armor_set_count) {
		return -1;
	}

	return g_generals_thing_armor_sets[index].conditionsSize;
}

__attribute__((used, visibility("default"))) int generals_thing_armor_set_armor_ptr(int index)
{
	if (index < 0 || index >= g_generals_thing_armor_set_count || g_generals_thing_armor_sets[index].armorOffset < 0) {
		return 0;
	}

	return (int)(g_generals_thing_names + g_generals_thing_armor_sets[index].armorOffset);
}

__attribute__((used, visibility("default"))) int generals_thing_armor_set_armor_size(int index)
{
	if (index < 0 || index >= g_generals_thing_armor_set_count) {
		return -1;
	}

	return g_generals_thing_armor_sets[index].armorSize;
}

__attribute__((used, visibility("default"))) int generals_thing_armor_set_damage_fx_ptr(int index)
{
	if (index < 0 || index >= g_generals_thing_armor_set_count || g_generals_thing_armor_sets[index].damageFxOffset < 0) {
		return 0;
	}

	return (int)(g_generals_thing_names + g_generals_thing_armor_sets[index].damageFxOffset);
}

__attribute__((used, visibility("default"))) int generals_thing_armor_set_damage_fx_size(int index)
{
	if (index < 0 || index >= g_generals_thing_armor_set_count) {
		return -1;
	}

	return g_generals_thing_armor_sets[index].damageFxSize;
}

__attribute__((used, visibility("default"))) int generals_thing_weapon_set_object_index(int index)
{
	if (index < 0 || index >= g_generals_thing_weapon_set_count) {
		return -1;
	}

	return g_generals_thing_weapon_sets[index].objectIndex;
}

__attribute__((used, visibility("default"))) int generals_thing_weapon_set_conditions_ptr(int index)
{
	if (index < 0 || index >= g_generals_thing_weapon_set_count || g_generals_thing_weapon_sets[index].conditionsOffset < 0) {
		return 0;
	}

	return (int)(g_generals_thing_names + g_generals_thing_weapon_sets[index].conditionsOffset);
}

__attribute__((used, visibility("default"))) int generals_thing_weapon_set_conditions_size(int index)
{
	if (index < 0 || index >= g_generals_thing_weapon_set_count) {
		return -1;
	}

	return g_generals_thing_weapon_sets[index].conditionsSize;
}

static int weapon_slot_ptr(int index, int slot)
{
	if (index < 0 || index >= g_generals_thing_weapon_set_count) {
		return 0;
	}

	int offset = -1;
	if (slot == 0) {
		offset = g_generals_thing_weapon_sets[index].primaryOffset;
	} else if (slot == 1) {
		offset = g_generals_thing_weapon_sets[index].secondaryOffset;
	} else if (slot == 2) {
		offset = g_generals_thing_weapon_sets[index].tertiaryOffset;
	}

	if (offset < 0) {
		return 0;
	}

	return (int)(g_generals_thing_names + offset);
}

static int weapon_slot_size(int index, int slot)
{
	if (index < 0 || index >= g_generals_thing_weapon_set_count) {
		return -1;
	}

	if (slot == 0) {
		return g_generals_thing_weapon_sets[index].primarySize;
	}
	if (slot == 1) {
		return g_generals_thing_weapon_sets[index].secondarySize;
	}
	if (slot == 2) {
		return g_generals_thing_weapon_sets[index].tertiarySize;
	}

	return -1;
}

__attribute__((used, visibility("default"))) int generals_thing_weapon_set_primary_ptr(int index)
{
	return weapon_slot_ptr(index, 0);
}

__attribute__((used, visibility("default"))) int generals_thing_weapon_set_primary_size(int index)
{
	return weapon_slot_size(index, 0);
}

__attribute__((used, visibility("default"))) int generals_thing_weapon_set_secondary_ptr(int index)
{
	return weapon_slot_ptr(index, 1);
}

__attribute__((used, visibility("default"))) int generals_thing_weapon_set_secondary_size(int index)
{
	return weapon_slot_size(index, 1);
}

__attribute__((used, visibility("default"))) int generals_thing_weapon_set_tertiary_ptr(int index)
{
	return weapon_slot_ptr(index, 2);
}

__attribute__((used, visibility("default"))) int generals_thing_weapon_set_tertiary_size(int index)
{
	return weapon_slot_size(index, 2);
}

__attribute__((used, visibility("default"))) int generals_thing_prerequisite_object_index(int index)
{
	if (index < 0 || index >= g_generals_thing_prerequisite_count) {
		return -1;
	}

	return g_generals_thing_prerequisites[index].objectIndex;
}

__attribute__((used, visibility("default"))) int generals_thing_prerequisite_kind(int index)
{
	if (index < 0 || index >= g_generals_thing_prerequisite_count) {
		return -1;
	}

	return g_generals_thing_prerequisites[index].kind;
}

__attribute__((used, visibility("default"))) int generals_thing_prerequisite_value_ptr(int index)
{
	if (index < 0 || index >= g_generals_thing_prerequisite_count || g_generals_thing_prerequisites[index].valueOffset < 0) {
		return 0;
	}

	return (int)(g_generals_thing_names + g_generals_thing_prerequisites[index].valueOffset);
}

__attribute__((used, visibility("default"))) int generals_thing_prerequisite_value_size(int index)
{
	if (index < 0 || index >= g_generals_thing_prerequisite_count) {
		return -1;
	}

	return g_generals_thing_prerequisites[index].valueSize;
}

__attribute__((used, visibility("default"))) int generals_thing_prerequisite_token_count(int index)
{
	if (index < 0 || index >= g_generals_thing_prerequisite_count) {
		return -1;
	}

	return g_generals_thing_prerequisites[index].tokenCount;
}

__attribute__((used, visibility("default"))) int generals_thing_prerequisite_line(int index)
{
	if (index < 0 || index >= g_generals_thing_prerequisite_count) {
		return -1;
	}

	return g_generals_thing_prerequisites[index].line;
}

__attribute__((used, visibility("default"))) int generals_thing_parse(int inputSize)
{
	g_generals_thing_template_count = 0;
	g_generals_thing_field_count = 0;
	g_generals_thing_armor_set_count = 0;
	g_generals_thing_weapon_set_count = 0;
	g_generals_thing_prerequisite_count = 0;
	g_generals_thing_module_count = 0;
	g_generals_thing_line_count = 0;
	g_generals_thing_error_count = 0;
	g_generals_thing_name_cursor = 0;

	if (inputSize < 0 || inputSize > INPUT_CAPACITY) {
		return -1;
	}

	int activeObject = -1;
	int activeArmorSet = -1;
	int activeWeaponSet = -1;
	DirectBlock directBlock = BLOCK_NONE;
	int lineStart = 0;

	while (lineStart < inputSize) {
		int lineEnd = lineStart;
		while (lineEnd < inputSize && g_generals_thing_input[lineEnd] != '\n') {
			++lineEnd;
		}

		++g_generals_thing_line_count;
		const int indent = leading_indent((const char *)g_generals_thing_input, lineStart, lineEnd);
		int contentStart = lineStart;
		int contentEnd = find_comment_start((const char *)g_generals_thing_input, lineStart, lineEnd);
		trim_range((const char *)g_generals_thing_input, &contentStart, &contentEnd);

		if (contentStart < contentEnd) {
			int cursor = contentStart;
			TokenRange first;
			if (next_token((const char *)g_generals_thing_input, &cursor, contentEnd, &first)) {
				if (activeObject < 0) {
					if (token_equals((const char *)g_generals_thing_input, first, "Object") &&
						find_equals((const char *)g_generals_thing_input, contentStart, contentEnd) < 0) {
						TokenRange name;
						if (next_token((const char *)g_generals_thing_input, &cursor, contentEnd, &name)) {
							activeObject = start_template((const char *)g_generals_thing_input, name, g_generals_thing_line_count);
						} else {
							++g_generals_thing_error_count;
						}
					}
				} else if (directBlock != BLOCK_NONE) {
					if (is_end_token((const char *)g_generals_thing_input, first.start, first.end) && indent <= 2) {
						directBlock = BLOCK_NONE;
						activeArmorSet = -1;
						activeWeaponSet = -1;
					} else if (directBlock == BLOCK_ARMOR_SET || directBlock == BLOCK_WEAPON_SET || directBlock == BLOCK_PREREQUISITES) {
						parse_assignment(directBlock, activeObject, activeArmorSet, activeWeaponSet, (const char *)g_generals_thing_input, contentStart, contentEnd);
					}
				} else if (is_end_token((const char *)g_generals_thing_input, first.start, first.end)) {
					activeObject = -1;
				} else if (indent <= 2 && token_equals((const char *)g_generals_thing_input, first, "ArmorSet")) {
					count_field(activeObject);
					activeArmorSet = start_armor_set(activeObject, g_generals_thing_line_count);
					directBlock = BLOCK_ARMOR_SET;
				} else if (indent <= 2 && token_equals((const char *)g_generals_thing_input, first, "WeaponSet")) {
					count_field(activeObject);
					activeWeaponSet = start_weapon_set(activeObject, g_generals_thing_line_count);
					directBlock = BLOCK_WEAPON_SET;
				} else if (indent <= 2 && token_equals((const char *)g_generals_thing_input, first, "Prerequisites")) {
					count_nested_block(activeObject);
					directBlock = BLOCK_PREREQUISITES;
				} else if (indent <= 2 && is_direct_nested_block((const char *)g_generals_thing_input, first)) {
					count_nested_block(activeObject);
					directBlock = BLOCK_SKIP;
				} else if (indent <= 2) {
					parse_assignment(BLOCK_NONE, activeObject, -1, -1, (const char *)g_generals_thing_input, contentStart, contentEnd);
				}
			}
		}

		lineStart = lineEnd + 1;
	}

	return g_generals_thing_template_count;
}

}
