extern "C" {

static const int INPUT_CAPACITY = 1024 * 1024;
static const int MAX_RECORDS = 1024;
static const int NAME_CAPACITY = 1024 * 1024;

enum BlockKind
{
	BLOCK_NONE = 0,
	BLOCK_UPGRADE = 1,
	BLOCK_SPECIAL_POWER = 2,
	BLOCK_SCIENCE = 3,
};

struct TokenRange
{
	int start;
	int end;
};

struct UpgradeRecord
{
	int nameOffset;
	int nameSize;
	int displayNameOffset;
	int displayNameSize;
	int typeOffset;
	int typeSize;
	int buttonImageOffset;
	int buttonImageSize;
	int researchSoundOffset;
	int researchSoundSize;
	int unitSpecificSoundOffset;
	int unitSpecificSoundSize;
	int academyOffset;
	int academySize;
	int line;
	int fieldCount;
	int buildTimeX100;
	int buildCost;
};

struct SpecialPowerRecord
{
	int nameOffset;
	int nameSize;
	int enumOffset;
	int enumSize;
	int requiredScienceOffset;
	int requiredScienceSize;
	int initiateSoundOffset;
	int initiateSoundSize;
	int initiateAtLocationSoundOffset;
	int initiateAtLocationSoundSize;
	int academyOffset;
	int academySize;
	int line;
	int fieldCount;
	int reloadTimeMs;
	int publicTimer;
	int detectionTimeMs;
	int sharedSyncedTimer;
	int viewObjectDurationMs;
	int viewObjectRangeX100;
	int radiusCursorRadiusX100;
	int shortcutPower;
};

struct ScienceRecord
{
	int nameOffset;
	int nameSize;
	int prerequisiteSciencesOffset;
	int prerequisiteSciencesSize;
	int displayNameOffset;
	int displayNameSize;
	int descriptionOffset;
	int descriptionSize;
	int line;
	int fieldCount;
	int purchasePointCost;
	int isGrantable;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_progression_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_progression_names[NAME_CAPACITY];

static UpgradeRecord g_generals_progression_upgrades[MAX_RECORDS];
static SpecialPowerRecord g_generals_progression_special_powers[MAX_RECORDS];
static ScienceRecord g_generals_progression_sciences[MAX_RECORDS];
static int g_generals_progression_upgrade_count = 0;
static int g_generals_progression_upgrade_field_count = 0;
static int g_generals_progression_special_power_count = 0;
static int g_generals_progression_special_power_field_count = 0;
static int g_generals_progression_science_count = 0;
static int g_generals_progression_science_field_count = 0;
static int g_generals_progression_line_count = 0;
static int g_generals_progression_error_count = 0;
static int g_generals_progression_name_cursor = 0;

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
	if (valueSize < 0 || g_generals_progression_name_cursor + valueSize + 1 > NAME_CAPACITY) {
		return -1;
	}

	const int offset = g_generals_progression_name_cursor;
	for (int index = 0; index < valueSize; ++index) {
		g_generals_progression_names[g_generals_progression_name_cursor++] = value[index];
	}
	g_generals_progression_names[g_generals_progression_name_cursor++] = 0;
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
		++g_generals_progression_error_count;
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

	const int value = whole * 100 + fraction;
	*realX100 = negative ? -value : value;
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

static int parse_bool(const char *data, int start, int end, int *valueOut)
{
	int cursor = start;
	TokenRange token;
	if (!next_token(data, &cursor, end, &token)) {
		return 0;
	}

	if (token_equals(data, token, "Yes") || token_equals(data, token, "True") || token_equals(data, token, "1")) {
		*valueOut = 1;
		return 1;
	}
	if (token_equals(data, token, "No") || token_equals(data, token, "False") || token_equals(data, token, "0")) {
		*valueOut = 0;
		return 1;
	}

	return 0;
}

static void clear_upgrade(UpgradeRecord *record)
{
	record->displayNameOffset = -1;
	record->displayNameSize = 0;
	record->typeOffset = -1;
	record->typeSize = 0;
	record->buttonImageOffset = -1;
	record->buttonImageSize = 0;
	record->researchSoundOffset = -1;
	record->researchSoundSize = 0;
	record->unitSpecificSoundOffset = -1;
	record->unitSpecificSoundSize = 0;
	record->academyOffset = -1;
	record->academySize = 0;
	record->fieldCount = 0;
	record->buildTimeX100 = 0;
	record->buildCost = 0;
}

static void clear_special_power(SpecialPowerRecord *record)
{
	record->enumOffset = -1;
	record->enumSize = 0;
	record->requiredScienceOffset = -1;
	record->requiredScienceSize = 0;
	record->initiateSoundOffset = -1;
	record->initiateSoundSize = 0;
	record->initiateAtLocationSoundOffset = -1;
	record->initiateAtLocationSoundSize = 0;
	record->academyOffset = -1;
	record->academySize = 0;
	record->fieldCount = 0;
	record->reloadTimeMs = 0;
	record->publicTimer = 0;
	record->detectionTimeMs = 0;
	record->sharedSyncedTimer = 0;
	record->viewObjectDurationMs = 0;
	record->viewObjectRangeX100 = 0;
	record->radiusCursorRadiusX100 = 0;
	record->shortcutPower = 0;
}

static void clear_science(ScienceRecord *record)
{
	record->prerequisiteSciencesOffset = -1;
	record->prerequisiteSciencesSize = 0;
	record->displayNameOffset = -1;
	record->displayNameSize = 0;
	record->descriptionOffset = -1;
	record->descriptionSize = 0;
	record->fieldCount = 0;
	record->purchasePointCost = 0;
	record->isGrantable = 1;
}

static int start_upgrade(const char *data, TokenRange name, int line)
{
	if (g_generals_progression_upgrade_count >= MAX_RECORDS) {
		++g_generals_progression_error_count;
		return -1;
	}

	const int nameSize = name.end - name.start;
	const int nameOffset = store_string(data + name.start, nameSize);
	if (nameOffset < 0) {
		++g_generals_progression_error_count;
		return -1;
	}

	const int index = g_generals_progression_upgrade_count++;
	UpgradeRecord *record = &g_generals_progression_upgrades[index];
	record->nameOffset = nameOffset;
	record->nameSize = nameSize;
	record->line = line;
	clear_upgrade(record);
	return index;
}

static int start_special_power(const char *data, TokenRange name, int line)
{
	if (g_generals_progression_special_power_count >= MAX_RECORDS) {
		++g_generals_progression_error_count;
		return -1;
	}

	const int nameSize = name.end - name.start;
	const int nameOffset = store_string(data + name.start, nameSize);
	if (nameOffset < 0) {
		++g_generals_progression_error_count;
		return -1;
	}

	const int index = g_generals_progression_special_power_count++;
	SpecialPowerRecord *record = &g_generals_progression_special_powers[index];
	record->nameOffset = nameOffset;
	record->nameSize = nameSize;
	record->line = line;
	clear_special_power(record);
	return index;
}

static int start_science(const char *data, TokenRange name, int line)
{
	if (g_generals_progression_science_count >= MAX_RECORDS) {
		++g_generals_progression_error_count;
		return -1;
	}

	const int nameSize = name.end - name.start;
	const int nameOffset = store_string(data + name.start, nameSize);
	if (nameOffset < 0) {
		++g_generals_progression_error_count;
		return -1;
	}

	const int index = g_generals_progression_science_count++;
	ScienceRecord *record = &g_generals_progression_sciences[index];
	record->nameOffset = nameOffset;
	record->nameSize = nameSize;
	record->line = line;
	clear_science(record);
	return index;
}

static void parse_upgrade_property(int index, const char *data, int keyStart, int keyEnd, int valueStart, int valueEnd)
{
	if (index < 0 || index >= g_generals_progression_upgrade_count) {
		++g_generals_progression_error_count;
		return;
	}

	UpgradeRecord *record = &g_generals_progression_upgrades[index];
	++record->fieldCount;
	++g_generals_progression_upgrade_field_count;

	if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "DisplayName")) {
		parse_first_token_string(&record->displayNameOffset, &record->displayNameSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Type")) {
		parse_first_token_string(&record->typeOffset, &record->typeSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "BuildTime")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->buildTimeX100)) {
			++g_generals_progression_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "BuildCost")) {
		if (!parse_first_int(data, valueStart, valueEnd, &record->buildCost)) {
			++g_generals_progression_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ButtonImage")) {
		parse_first_token_string(&record->buttonImageOffset, &record->buttonImageSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ResearchSound")) {
		assign_string(&record->researchSoundOffset, &record->researchSoundSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "UnitSpecificSound")) {
		assign_string(&record->unitSpecificSoundOffset, &record->unitSpecificSoundSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "AcademyClassify")) {
		parse_first_token_string(&record->academyOffset, &record->academySize, data, valueStart, valueEnd);
	}
}

static void parse_special_power_property(int index, const char *data, int keyStart, int keyEnd, int valueStart, int valueEnd)
{
	if (index < 0 || index >= g_generals_progression_special_power_count) {
		++g_generals_progression_error_count;
		return;
	}

	SpecialPowerRecord *record = &g_generals_progression_special_powers[index];
	++record->fieldCount;
	++g_generals_progression_special_power_field_count;

	if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ReloadTime")) {
		if (!parse_first_int(data, valueStart, valueEnd, &record->reloadTimeMs)) {
			++g_generals_progression_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "RequiredScience")) {
		parse_first_token_string(&record->requiredScienceOffset, &record->requiredScienceSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "InitiateSound")) {
		assign_string(&record->initiateSoundOffset, &record->initiateSoundSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "InitiateAtLocationSound")) {
		assign_string(&record->initiateAtLocationSoundOffset, &record->initiateAtLocationSoundSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "PublicTimer")) {
		if (!parse_bool(data, valueStart, valueEnd, &record->publicTimer)) {
			++g_generals_progression_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Enum")) {
		parse_first_token_string(&record->enumOffset, &record->enumSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "DetectionTime")) {
		if (!parse_first_int(data, valueStart, valueEnd, &record->detectionTimeMs)) {
			++g_generals_progression_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "SharedSyncedTimer")) {
		if (!parse_bool(data, valueStart, valueEnd, &record->sharedSyncedTimer)) {
			++g_generals_progression_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ViewObjectDuration")) {
		if (!parse_first_int(data, valueStart, valueEnd, &record->viewObjectDurationMs)) {
			++g_generals_progression_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ViewObjectRange")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->viewObjectRangeX100)) {
			++g_generals_progression_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "RadiusCursorRadius")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->radiusCursorRadiusX100)) {
			++g_generals_progression_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ShortcutPower")) {
		if (!parse_bool(data, valueStart, valueEnd, &record->shortcutPower)) {
			++g_generals_progression_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "AcademyClassify")) {
		parse_first_token_string(&record->academyOffset, &record->academySize, data, valueStart, valueEnd);
	}
}

static void parse_science_property(int index, const char *data, int keyStart, int keyEnd, int valueStart, int valueEnd)
{
	if (index < 0 || index >= g_generals_progression_science_count) {
		++g_generals_progression_error_count;
		return;
	}

	ScienceRecord *record = &g_generals_progression_sciences[index];
	++record->fieldCount;
	++g_generals_progression_science_field_count;

	if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "PrerequisiteSciences")) {
		assign_string(&record->prerequisiteSciencesOffset, &record->prerequisiteSciencesSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "SciencePurchasePointCost")) {
		if (!parse_first_int(data, valueStart, valueEnd, &record->purchasePointCost)) {
			++g_generals_progression_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "IsGrantable")) {
		if (!parse_bool(data, valueStart, valueEnd, &record->isGrantable)) {
			++g_generals_progression_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "DisplayName")) {
		parse_first_token_string(&record->displayNameOffset, &record->displayNameSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Description")) {
		parse_first_token_string(&record->descriptionOffset, &record->descriptionSize, data, valueStart, valueEnd);
	}
}

static void parse_assignment(BlockKind blockKind, int recordIndex, const char *data, int contentStart, int contentEnd)
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

	if (blockKind == BLOCK_UPGRADE) {
		parse_upgrade_property(recordIndex, data, keyStart, keyEnd, valueStart, valueEnd);
	} else if (blockKind == BLOCK_SPECIAL_POWER) {
		parse_special_power_property(recordIndex, data, keyStart, keyEnd, valueStart, valueEnd);
	} else if (blockKind == BLOCK_SCIENCE) {
		parse_science_property(recordIndex, data, keyStart, keyEnd, valueStart, valueEnd);
	}
}

static void reset_parser()
{
	g_generals_progression_upgrade_count = 0;
	g_generals_progression_upgrade_field_count = 0;
	g_generals_progression_special_power_count = 0;
	g_generals_progression_special_power_field_count = 0;
	g_generals_progression_science_count = 0;
	g_generals_progression_science_field_count = 0;
	g_generals_progression_line_count = 0;
	g_generals_progression_error_count = 0;
	g_generals_progression_name_cursor = 0;
}

__attribute__((used, visibility("default"))) unsigned int generals_progression_input_ptr()
{
	return (unsigned int)g_generals_progression_input;
}

__attribute__((used, visibility("default"))) int generals_progression_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_progression_parse(int inputSize)
{
	reset_parser();
	if (inputSize < 0 || inputSize > INPUT_CAPACITY) {
		g_generals_progression_error_count = 1;
		return -1;
	}

	const char *data = (const char *)g_generals_progression_input;
	int lineStart = 0;
	int line = 1;
	BlockKind blockKind = BLOCK_NONE;
	int currentRecord = -1;

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
				if (token_equals(data, first, "Upgrade")) {
					TokenRange name;
					if (next_token(data, &cursor, contentEnd, &name)) {
						currentRecord = start_upgrade(data, name, line);
						blockKind = BLOCK_UPGRADE;
					} else {
						++g_generals_progression_error_count;
					}
				} else if (token_equals(data, first, "SpecialPower")) {
					TokenRange name;
					if (next_token(data, &cursor, contentEnd, &name)) {
						currentRecord = start_special_power(data, name, line);
						blockKind = BLOCK_SPECIAL_POWER;
					} else {
						++g_generals_progression_error_count;
					}
				} else if (token_equals(data, first, "Science")) {
					TokenRange name;
					if (next_token(data, &cursor, contentEnd, &name)) {
						currentRecord = start_science(data, name, line);
						blockKind = BLOCK_SCIENCE;
					} else {
						++g_generals_progression_error_count;
					}
				} else if (token_equals(data, first, "End")) {
					blockKind = BLOCK_NONE;
					currentRecord = -1;
				} else {
					parse_assignment(blockKind, currentRecord, data, contentStart, contentEnd);
				}
			}
		}

		if (lineEnd >= inputSize) {
			break;
		}
		lineStart = lineEnd + 1;
		++line;
	}

	g_generals_progression_line_count = line;
	if (g_generals_progression_error_count != 0) {
		return -1;
	}

	return g_generals_progression_upgrade_count +
		g_generals_progression_special_power_count +
		g_generals_progression_science_count;
}

__attribute__((used, visibility("default"))) int generals_progression_upgrade_count() { return g_generals_progression_upgrade_count; }
__attribute__((used, visibility("default"))) int generals_progression_upgrade_field_count() { return g_generals_progression_upgrade_field_count; }
__attribute__((used, visibility("default"))) int generals_progression_special_power_count() { return g_generals_progression_special_power_count; }
__attribute__((used, visibility("default"))) int generals_progression_special_power_field_count() { return g_generals_progression_special_power_field_count; }
__attribute__((used, visibility("default"))) int generals_progression_science_count() { return g_generals_progression_science_count; }
__attribute__((used, visibility("default"))) int generals_progression_science_field_count() { return g_generals_progression_science_field_count; }
__attribute__((used, visibility("default"))) int generals_progression_line_count() { return g_generals_progression_line_count; }
__attribute__((used, visibility("default"))) int generals_progression_error_count() { return g_generals_progression_error_count; }

#define PROGRESSION_STRING_EXPORTS(record_type, array_name, count_name, field_name, field_offset, field_size) \
__attribute__((used, visibility("default"))) int generals_progression_##record_type##_##field_name##_ptr(int index) \
{ \
	if (index < 0 || index >= count_name || array_name[index].field_offset < 0) { \
		return 0; \
	} \
	return (int)(g_generals_progression_names + array_name[index].field_offset); \
} \
__attribute__((used, visibility("default"))) int generals_progression_##record_type##_##field_name##_size(int index) \
{ \
	if (index < 0 || index >= count_name) { \
		return -1; \
	} \
	return array_name[index].field_size; \
}

PROGRESSION_STRING_EXPORTS(upgrade, g_generals_progression_upgrades, g_generals_progression_upgrade_count, name, nameOffset, nameSize)
PROGRESSION_STRING_EXPORTS(upgrade, g_generals_progression_upgrades, g_generals_progression_upgrade_count, display_name, displayNameOffset, displayNameSize)
PROGRESSION_STRING_EXPORTS(upgrade, g_generals_progression_upgrades, g_generals_progression_upgrade_count, type, typeOffset, typeSize)
PROGRESSION_STRING_EXPORTS(upgrade, g_generals_progression_upgrades, g_generals_progression_upgrade_count, button_image, buttonImageOffset, buttonImageSize)
PROGRESSION_STRING_EXPORTS(upgrade, g_generals_progression_upgrades, g_generals_progression_upgrade_count, research_sound, researchSoundOffset, researchSoundSize)
PROGRESSION_STRING_EXPORTS(upgrade, g_generals_progression_upgrades, g_generals_progression_upgrade_count, unit_specific_sound, unitSpecificSoundOffset, unitSpecificSoundSize)
PROGRESSION_STRING_EXPORTS(upgrade, g_generals_progression_upgrades, g_generals_progression_upgrade_count, academy, academyOffset, academySize)

PROGRESSION_STRING_EXPORTS(special_power, g_generals_progression_special_powers, g_generals_progression_special_power_count, name, nameOffset, nameSize)
PROGRESSION_STRING_EXPORTS(special_power, g_generals_progression_special_powers, g_generals_progression_special_power_count, enum, enumOffset, enumSize)
PROGRESSION_STRING_EXPORTS(special_power, g_generals_progression_special_powers, g_generals_progression_special_power_count, required_science, requiredScienceOffset, requiredScienceSize)
PROGRESSION_STRING_EXPORTS(special_power, g_generals_progression_special_powers, g_generals_progression_special_power_count, initiate_sound, initiateSoundOffset, initiateSoundSize)
PROGRESSION_STRING_EXPORTS(special_power, g_generals_progression_special_powers, g_generals_progression_special_power_count, initiate_at_location_sound, initiateAtLocationSoundOffset, initiateAtLocationSoundSize)
PROGRESSION_STRING_EXPORTS(special_power, g_generals_progression_special_powers, g_generals_progression_special_power_count, academy, academyOffset, academySize)

PROGRESSION_STRING_EXPORTS(science, g_generals_progression_sciences, g_generals_progression_science_count, name, nameOffset, nameSize)
PROGRESSION_STRING_EXPORTS(science, g_generals_progression_sciences, g_generals_progression_science_count, prerequisite_sciences, prerequisiteSciencesOffset, prerequisiteSciencesSize)
PROGRESSION_STRING_EXPORTS(science, g_generals_progression_sciences, g_generals_progression_science_count, display_name, displayNameOffset, displayNameSize)
PROGRESSION_STRING_EXPORTS(science, g_generals_progression_sciences, g_generals_progression_science_count, description, descriptionOffset, descriptionSize)

#undef PROGRESSION_STRING_EXPORTS

__attribute__((used, visibility("default"))) int generals_progression_upgrade_line(int index) { return (index < 0 || index >= g_generals_progression_upgrade_count) ? -1 : g_generals_progression_upgrades[index].line; }
__attribute__((used, visibility("default"))) int generals_progression_upgrade_field_count_at(int index) { return (index < 0 || index >= g_generals_progression_upgrade_count) ? -1 : g_generals_progression_upgrades[index].fieldCount; }
__attribute__((used, visibility("default"))) int generals_progression_upgrade_build_time_x100(int index) { return (index < 0 || index >= g_generals_progression_upgrade_count) ? -1 : g_generals_progression_upgrades[index].buildTimeX100; }
__attribute__((used, visibility("default"))) int generals_progression_upgrade_build_cost(int index) { return (index < 0 || index >= g_generals_progression_upgrade_count) ? -1 : g_generals_progression_upgrades[index].buildCost; }

__attribute__((used, visibility("default"))) int generals_progression_special_power_line(int index) { return (index < 0 || index >= g_generals_progression_special_power_count) ? -1 : g_generals_progression_special_powers[index].line; }
__attribute__((used, visibility("default"))) int generals_progression_special_power_field_count_at(int index) { return (index < 0 || index >= g_generals_progression_special_power_count) ? -1 : g_generals_progression_special_powers[index].fieldCount; }
__attribute__((used, visibility("default"))) int generals_progression_special_power_reload_time_ms(int index) { return (index < 0 || index >= g_generals_progression_special_power_count) ? -1 : g_generals_progression_special_powers[index].reloadTimeMs; }
__attribute__((used, visibility("default"))) int generals_progression_special_power_public_timer(int index) { return (index < 0 || index >= g_generals_progression_special_power_count) ? -1 : g_generals_progression_special_powers[index].publicTimer; }
__attribute__((used, visibility("default"))) int generals_progression_special_power_detection_time_ms(int index) { return (index < 0 || index >= g_generals_progression_special_power_count) ? -1 : g_generals_progression_special_powers[index].detectionTimeMs; }
__attribute__((used, visibility("default"))) int generals_progression_special_power_shared_synced_timer(int index) { return (index < 0 || index >= g_generals_progression_special_power_count) ? -1 : g_generals_progression_special_powers[index].sharedSyncedTimer; }
__attribute__((used, visibility("default"))) int generals_progression_special_power_view_object_duration_ms(int index) { return (index < 0 || index >= g_generals_progression_special_power_count) ? -1 : g_generals_progression_special_powers[index].viewObjectDurationMs; }
__attribute__((used, visibility("default"))) int generals_progression_special_power_view_object_range_x100(int index) { return (index < 0 || index >= g_generals_progression_special_power_count) ? -1 : g_generals_progression_special_powers[index].viewObjectRangeX100; }
__attribute__((used, visibility("default"))) int generals_progression_special_power_radius_cursor_radius_x100(int index) { return (index < 0 || index >= g_generals_progression_special_power_count) ? -1 : g_generals_progression_special_powers[index].radiusCursorRadiusX100; }
__attribute__((used, visibility("default"))) int generals_progression_special_power_shortcut_power(int index) { return (index < 0 || index >= g_generals_progression_special_power_count) ? -1 : g_generals_progression_special_powers[index].shortcutPower; }

__attribute__((used, visibility("default"))) int generals_progression_science_line(int index) { return (index < 0 || index >= g_generals_progression_science_count) ? -1 : g_generals_progression_sciences[index].line; }
__attribute__((used, visibility("default"))) int generals_progression_science_field_count_at(int index) { return (index < 0 || index >= g_generals_progression_science_count) ? -1 : g_generals_progression_sciences[index].fieldCount; }
__attribute__((used, visibility("default"))) int generals_progression_science_purchase_point_cost(int index) { return (index < 0 || index >= g_generals_progression_science_count) ? -1 : g_generals_progression_sciences[index].purchasePointCost; }
__attribute__((used, visibility("default"))) int generals_progression_science_is_grantable(int index) { return (index < 0 || index >= g_generals_progression_science_count) ? -1 : g_generals_progression_sciences[index].isGrantable; }

}
