extern "C" {

static const int INPUT_CAPACITY = 64 * 1024;
static const int SLOT_COUNT = 36;
static const int NAME_CAPACITY = 64 * 1024;

struct TokenRange
{
	int start;
	int end;
};

struct MiscAudioSlot
{
	int eventOffset;
	int eventSize;
	int line;
	int assigned;
	int hasEvent;
	int noSound;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_miscaudio_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_miscaudio_names[NAME_CAPACITY];

static MiscAudioSlot g_generals_miscaudio_slots[SLOT_COUNT];
static int g_generals_miscaudio_name_cursor = 0;
static int g_generals_miscaudio_field_count = 0;
static int g_generals_miscaudio_assigned_count = 0;
static int g_generals_miscaudio_event_count = 0;
static int g_generals_miscaudio_no_sound_count = 0;
static int g_generals_miscaudio_missing_count = 0;
static int g_generals_miscaudio_line_count = 0;
static int g_generals_miscaudio_error_count = 0;

static const char *FIELD_NAMES[SLOT_COUNT] = {
	"RadarNotifyUnitUnderAttackSound",
	"RadarNotifyHarvesterUnderAttackSound",
	"RadarNotifyStructureUnderAttackSound",
	"RadarNotifyUnderAttackSound",
	"RadarNotifyInfiltrationSound",
	"RadarNotifyOnlineSound",
	"RadarNotifyOfflineSound",
	"DefectorTimerTickSound",
	"DefectorTimerDingSound",
	"LockonTickSound",
	"AllCheerSound",
	"BattleCrySound",
	"GUIClickSound",
	"NoCanDoSound",
	"StealthDiscoveredSound",
	"StealthNeutralizedSound",
	"MoneyDepositSound",
	"MoneyWithdrawSound",
	"BuildingDisabled",
	"BuildingReenabled",
	"VehicleDisabled",
	"VehicleReenabled",
	"SplatterVehiclePilotsBrain",
	"TerroristInCarMoveVoice",
	"TerroristInCarAttackVoice",
	"TerroristInCarSelectVoice",
	"CrateHeal",
	"CrateShroud",
	"CrateSalvage",
	"CrateFreeUnit",
	"CrateMoney",
	"UnitPromoted",
	"RepairSparks",
	"SabotageShutDownBuilding",
	"SabotageResetTimeBuilding",
	"AircraftWheelScreech",
};

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

static int string_length(const char *value)
{
	int size = 0;
	while (value[size] != 0) {
		++size;
	}

	return size;
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
	if (valueSize < 0 || g_generals_miscaudio_name_cursor + valueSize + 1 > NAME_CAPACITY) {
		return -1;
	}

	const int offset = g_generals_miscaudio_name_cursor;
	for (int index = 0; index < valueSize; ++index) {
		g_generals_miscaudio_names[g_generals_miscaudio_name_cursor++] = value[index];
	}
	g_generals_miscaudio_names[g_generals_miscaudio_name_cursor++] = 0;
	return offset;
}

static int find_slot(const char *data, int start, int end)
{
	trim_range(data, &start, &end);
	for (int index = 0; index < SLOT_COUNT; ++index) {
		if (ascii_equal_ignore_case(data + start, end - start, FIELD_NAMES[index])) {
			return index;
		}
	}

	return -1;
}

static void reset_state()
{
	g_generals_miscaudio_name_cursor = 0;
	g_generals_miscaudio_field_count = 0;
	g_generals_miscaudio_assigned_count = 0;
	g_generals_miscaudio_event_count = 0;
	g_generals_miscaudio_no_sound_count = 0;
	g_generals_miscaudio_missing_count = 0;
	g_generals_miscaudio_line_count = 0;
	g_generals_miscaudio_error_count = 0;

	for (int index = 0; index < SLOT_COUNT; ++index) {
		g_generals_miscaudio_slots[index].eventOffset = -1;
		g_generals_miscaudio_slots[index].eventSize = 0;
		g_generals_miscaudio_slots[index].line = -1;
		g_generals_miscaudio_slots[index].assigned = 0;
		g_generals_miscaudio_slots[index].hasEvent = 0;
		g_generals_miscaudio_slots[index].noSound = 0;
	}
}

static void assign_slot(int slotIndex, const char *data, int start, int end, int line)
{
	trim_range(data, &start, &end);

	TokenRange valueToken;
	int cursor = start;
	if (!next_token(data, &cursor, end, &valueToken)) {
		++g_generals_miscaudio_error_count;
		return;
	}

	MiscAudioSlot *slot = &g_generals_miscaudio_slots[slotIndex];
	slot->assigned = 1;
	slot->line = line;
	slot->eventOffset = -1;
	slot->eventSize = 0;
	slot->hasEvent = 0;
	slot->noSound = 0;
	++g_generals_miscaudio_field_count;

	if (token_equals(data, valueToken, "NoSound")) {
		slot->noSound = 1;
		return;
	}

	const int valueSize = valueToken.end - valueToken.start;
	const int offset = store_string(data + valueToken.start, valueSize);
	if (offset < 0) {
		++g_generals_miscaudio_error_count;
		return;
	}

	slot->eventOffset = offset;
	slot->eventSize = valueSize;
	slot->hasEvent = 1;
}

static void finalize_counts()
{
	for (int index = 0; index < SLOT_COUNT; ++index) {
		const MiscAudioSlot *slot = &g_generals_miscaudio_slots[index];
		if (slot->assigned) {
			++g_generals_miscaudio_assigned_count;
		}
		if (slot->hasEvent) {
			++g_generals_miscaudio_event_count;
		}
		if (slot->noSound) {
			++g_generals_miscaudio_no_sound_count;
		}
		if (!slot->hasEvent) {
			++g_generals_miscaudio_missing_count;
		}
	}
}

__attribute__((used, visibility("default"))) int generals_miscaudio_input_ptr()
{
	return (int)g_generals_miscaudio_input;
}

__attribute__((used, visibility("default"))) int generals_miscaudio_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_miscaudio_parse(int inputSize)
{
	reset_state();

	if (inputSize < 0 || inputSize > INPUT_CAPACITY) {
		g_generals_miscaudio_error_count = 1;
		return -1;
	}

	const char *data = (const char *)g_generals_miscaudio_input;
	bool sawMiscAudio = false;
	bool activeMiscAudio = false;
	int cursor = 0;
	int line = 1;

	while (cursor < inputSize) {
		int lineStart = cursor;
		while (cursor < inputSize && data[cursor] != '\n' && data[cursor] != '\r') {
			++cursor;
		}
		int lineEnd = cursor;
		if (cursor < inputSize && data[cursor] == '\r') {
			++cursor;
			if (cursor < inputSize && data[cursor] == '\n') {
				++cursor;
			}
		} else if (cursor < inputSize && data[cursor] == '\n') {
			++cursor;
		}

		++g_generals_miscaudio_line_count;
		const int commentStart = find_comment_start(data, lineStart, lineEnd);
		lineEnd = commentStart;
		trim_range(data, &lineStart, &lineEnd);
		if (lineStart >= lineEnd) {
			++line;
			continue;
		}

		const int equals = find_equals(data, lineStart, lineEnd);
		if (equals < 0) {
			TokenRange token;
			int tokenCursor = lineStart;
			if (next_token(data, &tokenCursor, lineEnd, &token)) {
				if (token_equals(data, token, "MiscAudio")) {
					sawMiscAudio = true;
					activeMiscAudio = true;
				} else if (token_equals(data, token, "End")) {
					activeMiscAudio = false;
				} else if (sawMiscAudio) {
					activeMiscAudio = false;
				}
			}

			++line;
			continue;
		}

		if (activeMiscAudio || !sawMiscAudio) {
			const int slotIndex = find_slot(data, lineStart, equals);
			if (slotIndex >= 0) {
				assign_slot(slotIndex, data, equals + 1, lineEnd, line);
			}
		}

		++line;
	}

	finalize_counts();
	return g_generals_miscaudio_event_count;
}

__attribute__((used, visibility("default"))) int generals_miscaudio_slot_count()
{
	return SLOT_COUNT;
}

__attribute__((used, visibility("default"))) int generals_miscaudio_field_count()
{
	return g_generals_miscaudio_field_count;
}

__attribute__((used, visibility("default"))) int generals_miscaudio_assigned_count()
{
	return g_generals_miscaudio_assigned_count;
}

__attribute__((used, visibility("default"))) int generals_miscaudio_event_count()
{
	return g_generals_miscaudio_event_count;
}

__attribute__((used, visibility("default"))) int generals_miscaudio_no_sound_count()
{
	return g_generals_miscaudio_no_sound_count;
}

__attribute__((used, visibility("default"))) int generals_miscaudio_missing_count()
{
	return g_generals_miscaudio_missing_count;
}

__attribute__((used, visibility("default"))) int generals_miscaudio_line_count()
{
	return g_generals_miscaudio_line_count;
}

__attribute__((used, visibility("default"))) int generals_miscaudio_error_count()
{
	return g_generals_miscaudio_error_count;
}

__attribute__((used, visibility("default"))) int generals_miscaudio_slot_field_ptr(int index)
{
	if (index < 0 || index >= SLOT_COUNT) {
		return 0;
	}

	return (int)FIELD_NAMES[index];
}

__attribute__((used, visibility("default"))) int generals_miscaudio_slot_field_size(int index)
{
	if (index < 0 || index >= SLOT_COUNT) {
		return -1;
	}

	return string_length(FIELD_NAMES[index]);
}

__attribute__((used, visibility("default"))) int generals_miscaudio_slot_event_ptr(int index)
{
	if (index < 0 || index >= SLOT_COUNT || !g_generals_miscaudio_slots[index].hasEvent) {
		return 0;
	}

	return (int)(g_generals_miscaudio_names + g_generals_miscaudio_slots[index].eventOffset);
}

__attribute__((used, visibility("default"))) int generals_miscaudio_slot_event_size(int index)
{
	if (index < 0 || index >= SLOT_COUNT) {
		return -1;
	}

	return g_generals_miscaudio_slots[index].eventSize;
}

__attribute__((used, visibility("default"))) int generals_miscaudio_slot_line(int index)
{
	if (index < 0 || index >= SLOT_COUNT) {
		return -1;
	}

	return g_generals_miscaudio_slots[index].line;
}

__attribute__((used, visibility("default"))) int generals_miscaudio_slot_assigned(int index)
{
	if (index < 0 || index >= SLOT_COUNT) {
		return -1;
	}

	return g_generals_miscaudio_slots[index].assigned;
}

__attribute__((used, visibility("default"))) int generals_miscaudio_slot_has_event(int index)
{
	if (index < 0 || index >= SLOT_COUNT) {
		return -1;
	}

	return g_generals_miscaudio_slots[index].hasEvent;
}

__attribute__((used, visibility("default"))) int generals_miscaudio_slot_no_sound(int index)
{
	if (index < 0 || index >= SLOT_COUNT) {
		return -1;
	}

	return g_generals_miscaudio_slots[index].noSound;
}

}
