extern "C" {

static const int INPUT_CAPACITY = 1024 * 1024;
static const int MAX_PLAYER_TEMPLATES = 128;
static const int MAX_STARTING_UNITS = 10;
static const int NAME_CAPACITY = 1024 * 1024;

struct TokenRange
{
	int start;
	int end;
};

struct PlayerTemplateRecord
{
	int nameOffset;
	int nameSize;
	int sideOffset;
	int sideSize;
	int baseSideOffset;
	int baseSideSize;
	int displayNameOffset;
	int displayNameSize;
	int preferredColorOffset;
	int preferredColorSize;
	int startingBuildingOffset;
	int startingBuildingSize;
	int startingUnitOffset[MAX_STARTING_UNITS];
	int startingUnitSize[MAX_STARTING_UNITS];
	int intrinsicSciencesOffset;
	int intrinsicSciencesSize;
	int purchaseScienceCommandSetRank1Offset;
	int purchaseScienceCommandSetRank1Size;
	int purchaseScienceCommandSetRank3Offset;
	int purchaseScienceCommandSetRank3Size;
	int purchaseScienceCommandSetRank8Offset;
	int purchaseScienceCommandSetRank8Size;
	int specialPowerShortcutCommandSetOffset;
	int specialPowerShortcutCommandSetSize;
	int specialPowerShortcutWinNameOffset;
	int specialPowerShortcutWinNameSize;
	int scoreScreenImageOffset;
	int scoreScreenImageSize;
	int loadScreenImageOffset;
	int loadScreenImageSize;
	int loadScreenMusicOffset;
	int loadScreenMusicSize;
	int scoreScreenMusicOffset;
	int scoreScreenMusicSize;
	int headWaterMarkOffset;
	int headWaterMarkSize;
	int flagWaterMarkOffset;
	int flagWaterMarkSize;
	int enabledImageOffset;
	int enabledImageSize;
	int sideIconImageOffset;
	int sideIconImageSize;
	int generalImageOffset;
	int generalImageSize;
	int beaconNameOffset;
	int beaconNameSize;
	int armyTooltipOffset;
	int armyTooltipSize;
	int featuresOffset;
	int featuresSize;
	int medallionRegularOffset;
	int medallionRegularSize;
	int medallionHiliteOffset;
	int medallionHiliteSize;
	int medallionSelectOffset;
	int medallionSelectSize;
	int line;
	int fieldCount;
	int playableSide;
	int observer;
	int oldFaction;
	int startMoney;
	int preferredColorR;
	int preferredColorG;
	int preferredColorB;
	int intrinsicSciencePurchasePoints;
	int intrinsicScienceTokenCount;
	int purchaseScienceCommandSetCount;
	int specialPowerShortcutButtonCount;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_player_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_player_names[NAME_CAPACITY];

static PlayerTemplateRecord g_generals_player_templates[MAX_PLAYER_TEMPLATES];
static int g_generals_player_template_count = 0;
static int g_generals_player_field_count = 0;
static int g_generals_player_playable_count = 0;
static int g_generals_player_observer_count = 0;
static int g_generals_player_old_faction_count = 0;
static int g_generals_player_intrinsic_science_count = 0;
static int g_generals_player_purchase_science_command_set_count = 0;
static int g_generals_player_line_count = 0;
static int g_generals_player_error_count = 0;
static int g_generals_player_name_cursor = 0;

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

static bool ascii_starts_with_ignore_case(const char *left, int leftSize, const char *prefix)
{
	int index = 0;
	while (index < leftSize && prefix[index] != 0) {
		if (lower_ascii(left[index]) != lower_ascii(prefix[index])) {
			return false;
		}
		++index;
	}

	return prefix[index] == 0;
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
	if (valueSize < 0 || g_generals_player_name_cursor + valueSize + 1 > NAME_CAPACITY) {
		return -1;
	}

	const int offset = g_generals_player_name_cursor;
	for (int index = 0; index < valueSize; ++index) {
		g_generals_player_names[g_generals_player_name_cursor++] = value[index];
	}
	g_generals_player_names[g_generals_player_name_cursor++] = 0;
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
		++g_generals_player_error_count;
		return;
	}

	*offsetOut = offset;
	*sizeOut = size;
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

static int parse_starting_unit_slot(const char *data, int start, int end)
{
	static const char prefix[] = "StartingUnit";
	const int prefixSize = 12;
	if (!ascii_starts_with_ignore_case(data + start, end - start, prefix)) {
		return -1;
	}

	int slot = 0;
	bool sawDigit = false;
	for (int cursor = start + prefixSize; cursor < end; ++cursor) {
		if (data[cursor] < '0' || data[cursor] > '9') {
			return -1;
		}
		sawDigit = true;
		slot = slot * 10 + (data[cursor] - '0');
	}

	if (!sawDigit || slot < 0 || slot >= MAX_STARTING_UNITS) {
		return -1;
	}

	return slot;
}

static int parse_rgb_component(const char *data, TokenRange token, char component, int *valueOut)
{
	if (token.end - token.start < 3 || lower_ascii(data[token.start]) != lower_ascii(component) || data[token.start + 1] != ':') {
		return 0;
	}

	return parse_int(data, token.start + 2, token.end, valueOut);
}

static int parse_rgb_color(const char *data, int start, int end, int *red, int *green, int *blue)
{
	int cursor = start;
	TokenRange token;
	int sawRed = 0;
	int sawGreen = 0;
	int sawBlue = 0;

	while (next_token(data, &cursor, end, &token)) {
		if (parse_rgb_component(data, token, 'R', red)) {
			sawRed = 1;
		} else if (parse_rgb_component(data, token, 'G', green)) {
			sawGreen = 1;
		} else if (parse_rgb_component(data, token, 'B', blue)) {
			sawBlue = 1;
		}
	}

	return sawRed && sawGreen && sawBlue;
}

static int count_science_tokens(const char *data, int start, int end)
{
	int cursor = start;
	TokenRange token;
	int count = 0;
	while (next_token(data, &cursor, end, &token)) {
		if (!token_equals(data, token, "None")) {
			++count;
		}
	}

	return count;
}

static void clear_template(PlayerTemplateRecord *record)
{
	record->sideOffset = -1;
	record->sideSize = 0;
	record->baseSideOffset = -1;
	record->baseSideSize = 0;
	record->displayNameOffset = -1;
	record->displayNameSize = 0;
	record->preferredColorOffset = -1;
	record->preferredColorSize = 0;
	record->startingBuildingOffset = -1;
	record->startingBuildingSize = 0;
	for (int index = 0; index < MAX_STARTING_UNITS; ++index) {
		record->startingUnitOffset[index] = -1;
		record->startingUnitSize[index] = 0;
	}
	record->intrinsicSciencesOffset = -1;
	record->intrinsicSciencesSize = 0;
	record->purchaseScienceCommandSetRank1Offset = -1;
	record->purchaseScienceCommandSetRank1Size = 0;
	record->purchaseScienceCommandSetRank3Offset = -1;
	record->purchaseScienceCommandSetRank3Size = 0;
	record->purchaseScienceCommandSetRank8Offset = -1;
	record->purchaseScienceCommandSetRank8Size = 0;
	record->specialPowerShortcutCommandSetOffset = -1;
	record->specialPowerShortcutCommandSetSize = 0;
	record->specialPowerShortcutWinNameOffset = -1;
	record->specialPowerShortcutWinNameSize = 0;
	record->scoreScreenImageOffset = -1;
	record->scoreScreenImageSize = 0;
	record->loadScreenImageOffset = -1;
	record->loadScreenImageSize = 0;
	record->loadScreenMusicOffset = -1;
	record->loadScreenMusicSize = 0;
	record->scoreScreenMusicOffset = -1;
	record->scoreScreenMusicSize = 0;
	record->headWaterMarkOffset = -1;
	record->headWaterMarkSize = 0;
	record->flagWaterMarkOffset = -1;
	record->flagWaterMarkSize = 0;
	record->enabledImageOffset = -1;
	record->enabledImageSize = 0;
	record->sideIconImageOffset = -1;
	record->sideIconImageSize = 0;
	record->generalImageOffset = -1;
	record->generalImageSize = 0;
	record->beaconNameOffset = -1;
	record->beaconNameSize = 0;
	record->armyTooltipOffset = -1;
	record->armyTooltipSize = 0;
	record->featuresOffset = -1;
	record->featuresSize = 0;
	record->medallionRegularOffset = -1;
	record->medallionRegularSize = 0;
	record->medallionHiliteOffset = -1;
	record->medallionHiliteSize = 0;
	record->medallionSelectOffset = -1;
	record->medallionSelectSize = 0;
	record->fieldCount = 0;
	record->playableSide = 0;
	record->observer = 0;
	record->oldFaction = 0;
	record->startMoney = 0;
	record->preferredColorR = 0;
	record->preferredColorG = 0;
	record->preferredColorB = 0;
	record->intrinsicSciencePurchasePoints = 0;
	record->intrinsicScienceTokenCount = 0;
	record->purchaseScienceCommandSetCount = 0;
	record->specialPowerShortcutButtonCount = 0;
}

static int start_player_template(const char *data, TokenRange name, int line)
{
	if (g_generals_player_template_count >= MAX_PLAYER_TEMPLATES) {
		++g_generals_player_error_count;
		return -1;
	}

	const int nameSize = name.end - name.start;
	const int nameOffset = store_string(data + name.start, nameSize);
	if (nameOffset < 0) {
		++g_generals_player_error_count;
		return -1;
	}

	const int index = g_generals_player_template_count++;
	PlayerTemplateRecord *record = &g_generals_player_templates[index];
	record->nameOffset = nameOffset;
	record->nameSize = nameSize;
	record->line = line;
	clear_template(record);
	return index;
}

static void note_purchase_science_command_set(PlayerTemplateRecord *record)
{
	++record->purchaseScienceCommandSetCount;
}

static void parse_template_property(int index, const char *data, int keyStart, int keyEnd, int valueStart, int valueEnd)
{
	if (index < 0 || index >= g_generals_player_template_count) {
		return;
	}

	PlayerTemplateRecord *record = &g_generals_player_templates[index];
	++record->fieldCount;
	++g_generals_player_field_count;

	if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Side")) {
		assign_string(&record->sideOffset, &record->sideSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "BaseSide")) {
		assign_string(&record->baseSideOffset, &record->baseSideSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "PlayableSide")) {
		if (!parse_bool(data, valueStart, valueEnd, &record->playableSide)) {
			++g_generals_player_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "DisplayName")) {
		assign_string(&record->displayNameOffset, &record->displayNameSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "StartMoney")) {
		if (!parse_first_int(data, valueStart, valueEnd, &record->startMoney)) {
			++g_generals_player_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "PreferredColor")) {
		assign_string(&record->preferredColorOffset, &record->preferredColorSize, data, valueStart, valueEnd);
		if (!parse_rgb_color(data, valueStart, valueEnd, &record->preferredColorR, &record->preferredColorG, &record->preferredColorB)) {
			++g_generals_player_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "StartingBuilding")) {
		assign_string(&record->startingBuildingOffset, &record->startingBuildingSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "IntrinsicSciences")) {
		assign_string(&record->intrinsicSciencesOffset, &record->intrinsicSciencesSize, data, valueStart, valueEnd);
		record->intrinsicScienceTokenCount = count_science_tokens(data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "PurchaseScienceCommandSetRank1")) {
		assign_string(&record->purchaseScienceCommandSetRank1Offset, &record->purchaseScienceCommandSetRank1Size, data, valueStart, valueEnd);
		note_purchase_science_command_set(record);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "PurchaseScienceCommandSetRank3")) {
		assign_string(&record->purchaseScienceCommandSetRank3Offset, &record->purchaseScienceCommandSetRank3Size, data, valueStart, valueEnd);
		note_purchase_science_command_set(record);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "PurchaseScienceCommandSetRank8")) {
		assign_string(&record->purchaseScienceCommandSetRank8Offset, &record->purchaseScienceCommandSetRank8Size, data, valueStart, valueEnd);
		note_purchase_science_command_set(record);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "SpecialPowerShortcutCommandSet")) {
		assign_string(&record->specialPowerShortcutCommandSetOffset, &record->specialPowerShortcutCommandSetSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "SpecialPowerShortcutWinName")) {
		assign_string(&record->specialPowerShortcutWinNameOffset, &record->specialPowerShortcutWinNameSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "SpecialPowerShortcutButtonCount")) {
		if (!parse_first_int(data, valueStart, valueEnd, &record->specialPowerShortcutButtonCount)) {
			++g_generals_player_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "IsObserver")) {
		if (!parse_bool(data, valueStart, valueEnd, &record->observer)) {
			++g_generals_player_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "OldFaction")) {
		if (!parse_bool(data, valueStart, valueEnd, &record->oldFaction)) {
			++g_generals_player_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "IntrinsicSciencePurchasePoints")) {
		if (!parse_first_int(data, valueStart, valueEnd, &record->intrinsicSciencePurchasePoints)) {
			++g_generals_player_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ScoreScreenImage")) {
		assign_string(&record->scoreScreenImageOffset, &record->scoreScreenImageSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "LoadScreenImage")) {
		assign_string(&record->loadScreenImageOffset, &record->loadScreenImageSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "LoadScreenMusic")) {
		assign_string(&record->loadScreenMusicOffset, &record->loadScreenMusicSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ScoreScreenMusic")) {
		assign_string(&record->scoreScreenMusicOffset, &record->scoreScreenMusicSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "HeadWaterMark")) {
		assign_string(&record->headWaterMarkOffset, &record->headWaterMarkSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "FlagWaterMark")) {
		assign_string(&record->flagWaterMarkOffset, &record->flagWaterMarkSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "EnabledImage")) {
		assign_string(&record->enabledImageOffset, &record->enabledImageSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "SideIconImage")) {
		assign_string(&record->sideIconImageOffset, &record->sideIconImageSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "GeneralImage")) {
		assign_string(&record->generalImageOffset, &record->generalImageSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "BeaconName")) {
		assign_string(&record->beaconNameOffset, &record->beaconNameSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ArmyTooltip")) {
		assign_string(&record->armyTooltipOffset, &record->armyTooltipSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Features")) {
		assign_string(&record->featuresOffset, &record->featuresSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "MedallionRegular")) {
		assign_string(&record->medallionRegularOffset, &record->medallionRegularSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "MedallionHilite")) {
		assign_string(&record->medallionHiliteOffset, &record->medallionHiliteSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "MedallionSelect")) {
		assign_string(&record->medallionSelectOffset, &record->medallionSelectSize, data, valueStart, valueEnd);
	} else {
		const int startingUnitSlot = parse_starting_unit_slot(data, keyStart, keyEnd);
		if (startingUnitSlot >= 0) {
			assign_string(&record->startingUnitOffset[startingUnitSlot], &record->startingUnitSize[startingUnitSlot], data, valueStart, valueEnd);
		}
	}
}

static void parse_assignment(int recordIndex, const char *data, int contentStart, int contentEnd)
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

	parse_template_property(recordIndex, data, keyStart, keyEnd, valueStart, valueEnd);
}

static void reset_parser()
{
	g_generals_player_template_count = 0;
	g_generals_player_field_count = 0;
	g_generals_player_playable_count = 0;
	g_generals_player_observer_count = 0;
	g_generals_player_old_faction_count = 0;
	g_generals_player_intrinsic_science_count = 0;
	g_generals_player_purchase_science_command_set_count = 0;
	g_generals_player_line_count = 0;
	g_generals_player_error_count = 0;
	g_generals_player_name_cursor = 0;
}

static void compute_totals()
{
	g_generals_player_playable_count = 0;
	g_generals_player_observer_count = 0;
	g_generals_player_old_faction_count = 0;
	g_generals_player_intrinsic_science_count = 0;
	g_generals_player_purchase_science_command_set_count = 0;

	for (int index = 0; index < g_generals_player_template_count; ++index) {
		PlayerTemplateRecord *record = &g_generals_player_templates[index];
		g_generals_player_playable_count += record->playableSide ? 1 : 0;
		g_generals_player_observer_count += record->observer ? 1 : 0;
		g_generals_player_old_faction_count += record->oldFaction ? 1 : 0;
		g_generals_player_intrinsic_science_count += record->intrinsicScienceTokenCount;
		g_generals_player_purchase_science_command_set_count += record->purchaseScienceCommandSetCount;
	}
}

__attribute__((used, visibility("default"))) unsigned int generals_player_input_ptr()
{
	return (unsigned int)g_generals_player_input;
}

__attribute__((used, visibility("default"))) int generals_player_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_player_parse(int inputSize)
{
	reset_parser();
	if (inputSize < 0 || inputSize > INPUT_CAPACITY) {
		g_generals_player_error_count = 1;
		return -1;
	}

	const char *data = (const char *)g_generals_player_input;
	int lineStart = 0;
	int line = 1;
	int currentRecord = -1;
	bool inPlayerTemplate = false;

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
				if (token_equals(data, first, "PlayerTemplate")) {
					TokenRange name;
					if (next_token(data, &cursor, contentEnd, &name)) {
						currentRecord = start_player_template(data, name, line);
						inPlayerTemplate = currentRecord >= 0;
					} else {
						++g_generals_player_error_count;
					}
				} else if (token_equals(data, first, "End")) {
					currentRecord = -1;
					inPlayerTemplate = false;
				} else if (inPlayerTemplate) {
					parse_assignment(currentRecord, data, contentStart, contentEnd);
				}
			}
		}

		if (lineEnd >= inputSize) {
			break;
		}
		lineStart = lineEnd + 1;
		++line;
	}

	g_generals_player_line_count = line;
	compute_totals();
	if (g_generals_player_error_count != 0) {
		return -1;
	}

	return g_generals_player_template_count;
}

__attribute__((used, visibility("default"))) int generals_player_template_count() { return g_generals_player_template_count; }
__attribute__((used, visibility("default"))) int generals_player_field_count() { return g_generals_player_field_count; }
__attribute__((used, visibility("default"))) int generals_player_playable_count() { return g_generals_player_playable_count; }
__attribute__((used, visibility("default"))) int generals_player_observer_count() { return g_generals_player_observer_count; }
__attribute__((used, visibility("default"))) int generals_player_old_faction_count() { return g_generals_player_old_faction_count; }
__attribute__((used, visibility("default"))) int generals_player_intrinsic_science_count() { return g_generals_player_intrinsic_science_count; }
__attribute__((used, visibility("default"))) int generals_player_purchase_science_command_set_count() { return g_generals_player_purchase_science_command_set_count; }
__attribute__((used, visibility("default"))) int generals_player_line_count() { return g_generals_player_line_count; }
__attribute__((used, visibility("default"))) int generals_player_error_count() { return g_generals_player_error_count; }

#define PLAYER_STRING_EXPORTS(field_name, field_offset, field_size) \
__attribute__((used, visibility("default"))) int generals_player_template_##field_name##_ptr(int index) \
{ \
	if (index < 0 || index >= g_generals_player_template_count || g_generals_player_templates[index].field_offset < 0) { \
		return 0; \
	} \
	return (int)(g_generals_player_names + g_generals_player_templates[index].field_offset); \
} \
__attribute__((used, visibility("default"))) int generals_player_template_##field_name##_size(int index) \
{ \
	if (index < 0 || index >= g_generals_player_template_count) { \
		return -1; \
	} \
	return g_generals_player_templates[index].field_size; \
}

PLAYER_STRING_EXPORTS(name, nameOffset, nameSize)
PLAYER_STRING_EXPORTS(side, sideOffset, sideSize)
PLAYER_STRING_EXPORTS(base_side, baseSideOffset, baseSideSize)
PLAYER_STRING_EXPORTS(display_name, displayNameOffset, displayNameSize)
PLAYER_STRING_EXPORTS(preferred_color, preferredColorOffset, preferredColorSize)
PLAYER_STRING_EXPORTS(starting_building, startingBuildingOffset, startingBuildingSize)
PLAYER_STRING_EXPORTS(intrinsic_sciences, intrinsicSciencesOffset, intrinsicSciencesSize)
PLAYER_STRING_EXPORTS(purchase_science_command_set_rank1, purchaseScienceCommandSetRank1Offset, purchaseScienceCommandSetRank1Size)
PLAYER_STRING_EXPORTS(purchase_science_command_set_rank3, purchaseScienceCommandSetRank3Offset, purchaseScienceCommandSetRank3Size)
PLAYER_STRING_EXPORTS(purchase_science_command_set_rank8, purchaseScienceCommandSetRank8Offset, purchaseScienceCommandSetRank8Size)
PLAYER_STRING_EXPORTS(special_power_shortcut_command_set, specialPowerShortcutCommandSetOffset, specialPowerShortcutCommandSetSize)
PLAYER_STRING_EXPORTS(special_power_shortcut_win_name, specialPowerShortcutWinNameOffset, specialPowerShortcutWinNameSize)
PLAYER_STRING_EXPORTS(score_screen_image, scoreScreenImageOffset, scoreScreenImageSize)
PLAYER_STRING_EXPORTS(load_screen_image, loadScreenImageOffset, loadScreenImageSize)
PLAYER_STRING_EXPORTS(load_screen_music, loadScreenMusicOffset, loadScreenMusicSize)
PLAYER_STRING_EXPORTS(score_screen_music, scoreScreenMusicOffset, scoreScreenMusicSize)
PLAYER_STRING_EXPORTS(head_water_mark, headWaterMarkOffset, headWaterMarkSize)
PLAYER_STRING_EXPORTS(flag_water_mark, flagWaterMarkOffset, flagWaterMarkSize)
PLAYER_STRING_EXPORTS(enabled_image, enabledImageOffset, enabledImageSize)
PLAYER_STRING_EXPORTS(side_icon_image, sideIconImageOffset, sideIconImageSize)
PLAYER_STRING_EXPORTS(general_image, generalImageOffset, generalImageSize)
PLAYER_STRING_EXPORTS(beacon_name, beaconNameOffset, beaconNameSize)
PLAYER_STRING_EXPORTS(army_tooltip, armyTooltipOffset, armyTooltipSize)
PLAYER_STRING_EXPORTS(features, featuresOffset, featuresSize)
PLAYER_STRING_EXPORTS(medallion_regular, medallionRegularOffset, medallionRegularSize)
PLAYER_STRING_EXPORTS(medallion_hilite, medallionHiliteOffset, medallionHiliteSize)
PLAYER_STRING_EXPORTS(medallion_select, medallionSelectOffset, medallionSelectSize)

#undef PLAYER_STRING_EXPORTS

__attribute__((used, visibility("default"))) int generals_player_template_starting_unit_ptr(int index, int slot)
{
	if (index < 0 || index >= g_generals_player_template_count || slot < 0 || slot >= MAX_STARTING_UNITS || g_generals_player_templates[index].startingUnitOffset[slot] < 0) {
		return 0;
	}
	return (int)(g_generals_player_names + g_generals_player_templates[index].startingUnitOffset[slot]);
}

__attribute__((used, visibility("default"))) int generals_player_template_starting_unit_size(int index, int slot)
{
	if (index < 0 || index >= g_generals_player_template_count || slot < 0 || slot >= MAX_STARTING_UNITS) {
		return -1;
	}
	return g_generals_player_templates[index].startingUnitSize[slot];
}

__attribute__((used, visibility("default"))) int generals_player_template_line(int index) { return (index < 0 || index >= g_generals_player_template_count) ? -1 : g_generals_player_templates[index].line; }
__attribute__((used, visibility("default"))) int generals_player_template_field_count_at(int index) { return (index < 0 || index >= g_generals_player_template_count) ? -1 : g_generals_player_templates[index].fieldCount; }
__attribute__((used, visibility("default"))) int generals_player_template_playable_side(int index) { return (index < 0 || index >= g_generals_player_template_count) ? -1 : g_generals_player_templates[index].playableSide; }
__attribute__((used, visibility("default"))) int generals_player_template_observer(int index) { return (index < 0 || index >= g_generals_player_template_count) ? -1 : g_generals_player_templates[index].observer; }
__attribute__((used, visibility("default"))) int generals_player_template_old_faction(int index) { return (index < 0 || index >= g_generals_player_template_count) ? -1 : g_generals_player_templates[index].oldFaction; }
__attribute__((used, visibility("default"))) int generals_player_template_start_money(int index) { return (index < 0 || index >= g_generals_player_template_count) ? -1 : g_generals_player_templates[index].startMoney; }
__attribute__((used, visibility("default"))) int generals_player_template_preferred_color_r(int index) { return (index < 0 || index >= g_generals_player_template_count) ? -1 : g_generals_player_templates[index].preferredColorR; }
__attribute__((used, visibility("default"))) int generals_player_template_preferred_color_g(int index) { return (index < 0 || index >= g_generals_player_template_count) ? -1 : g_generals_player_templates[index].preferredColorG; }
__attribute__((used, visibility("default"))) int generals_player_template_preferred_color_b(int index) { return (index < 0 || index >= g_generals_player_template_count) ? -1 : g_generals_player_templates[index].preferredColorB; }
__attribute__((used, visibility("default"))) int generals_player_template_intrinsic_science_purchase_points(int index) { return (index < 0 || index >= g_generals_player_template_count) ? -1 : g_generals_player_templates[index].intrinsicSciencePurchasePoints; }
__attribute__((used, visibility("default"))) int generals_player_template_intrinsic_science_token_count(int index) { return (index < 0 || index >= g_generals_player_template_count) ? -1 : g_generals_player_templates[index].intrinsicScienceTokenCount; }
__attribute__((used, visibility("default"))) int generals_player_template_purchase_science_command_set_count(int index) { return (index < 0 || index >= g_generals_player_template_count) ? -1 : g_generals_player_templates[index].purchaseScienceCommandSetCount; }
__attribute__((used, visibility("default"))) int generals_player_template_special_power_shortcut_button_count(int index) { return (index < 0 || index >= g_generals_player_template_count) ? -1 : g_generals_player_templates[index].specialPowerShortcutButtonCount; }

}
