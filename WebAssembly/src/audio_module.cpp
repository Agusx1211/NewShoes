extern "C" {

static const int INPUT_CAPACITY = 512 * 1024;
static const int MAX_EVENTS = 4096;
static const int NAME_CAPACITY = 2 * 1024 * 1024;
static const int CATEGORY_COUNT = 3;
static const int PRIORITY_COUNT = 5;
static const int SOUND_TYPE_COUNT = 9;
static const int CONTROL_COUNT = 5;

struct TokenRange
{
	int start;
	int end;
};

struct StringField
{
	int offset;
	int size;
};

struct AudioEventRecord
{
	int nameOffset;
	int nameSize;
	int filenameOffset;
	int filenameSize;
	int soundsOffset;
	int soundsSize;
	int attackOffset;
	int attackSize;
	int decayOffset;
	int decaySize;
	int line;
	int fieldCount;
	int category;
	int priority;
	int typeMask;
	int controlMask;
	int volumeX100;
	int volumeShiftX100;
	int minVolumeX100;
	int pitchShiftMinX100;
	int pitchShiftMaxX100;
	int delayMin;
	int delayMax;
	int limit;
	int loopCount;
	int minRangeX100;
	int maxRangeX100;
	int lowPassCutoffX100;
	int soundTokenCount;
	int finalized;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_audio_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_audio_names[NAME_CAPACITY];

static AudioEventRecord g_generals_audio_events[MAX_EVENTS];
static int g_generals_audio_event_count = 0;
static int g_generals_audio_field_count = 0;
static int g_generals_audio_line_count = 0;
static int g_generals_audio_error_count = 0;
static int g_generals_audio_sound_reference_count = 0;
static int g_generals_audio_name_cursor = 0;
static int g_generals_audio_category_counts[CATEGORY_COUNT];
static int g_generals_audio_priority_counts[PRIORITY_COUNT];
static int g_generals_audio_type_counts[SOUND_TYPE_COUNT];
static int g_generals_audio_control_counts[CONTROL_COUNT];

static const char *CATEGORY_NAMES[CATEGORY_COUNT] = {
	"AudioEvent",
	"MusicTrack",
	"DialogEvent",
};

static const char *PRIORITY_NAMES[PRIORITY_COUNT] = {
	"LOWEST",
	"LOW",
	"NORMAL",
	"HIGH",
	"CRITICAL",
};

static const char *SOUND_TYPE_NAMES[SOUND_TYPE_COUNT] = {
	"UI",
	"WORLD",
	"SHROUDED",
	"GLOBAL",
	"VOICE",
	"PLAYER",
	"ALLIES",
	"ENEMIES",
	"EVERYONE",
};

static const char *CONTROL_NAMES[CONTROL_COUNT] = {
	"LOOP",
	"RANDOM",
	"ALL",
	"POSTDELAY",
	"INTERRUPT",
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
	if (valueSize < 0 || g_generals_audio_name_cursor + valueSize + 1 > NAME_CAPACITY) {
		return -1;
	}

	const int offset = g_generals_audio_name_cursor;
	for (int index = 0; index < valueSize; ++index) {
		g_generals_audio_names[g_generals_audio_name_cursor++] = value[index];
	}
	g_generals_audio_names[g_generals_audio_name_cursor++] = 0;
	return offset;
}

static void clear_string(StringField *field)
{
	field->offset = -1;
	field->size = 0;
}

static void assign_string(StringField *field, const char *data, int start, int end)
{
	trim_range(data, &start, &end);
	const int size = end - start;
	if (size <= 0) {
		clear_string(field);
		return;
	}

	const int offset = store_string(data + start, size);
	if (offset < 0) {
		++g_generals_audio_error_count;
		return;
	}

	field->offset = offset;
	field->size = size;
}

static void set_string_field(int *offset, int *size, const char *data, int start, int end)
{
	StringField field;
	assign_string(&field, data, start, end);
	*offset = field.offset;
	*size = field.size;
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

	*realX100 = negative ? -(whole * 100 + fraction) : whole * 100 + fraction;
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

static int parse_first_real_x100(const char *data, int start, int end, int *realX100)
{
	int cursor = start;
	TokenRange token;
	if (!next_token(data, &cursor, end, &token)) {
		return 0;
	}

	return parse_real_x100(data, token.start, token.end, realX100);
}

static int lookup_name(const char *data, TokenRange token, const char **names, int count)
{
	for (int index = 0; index < count; ++index) {
		if (token_equals(data, token, names[index])) {
			return index;
		}
	}

	return -1;
}

static int parse_index_name(const char *data, int start, int end, const char **names, int count)
{
	int cursor = start;
	TokenRange token;
	if (!next_token(data, &cursor, end, &token)) {
		return -1;
	}

	return lookup_name(data, token, names, count);
}

static int parse_bit_mask(const char *data, int start, int end, const char **names, int count)
{
	int cursor = start;
	int mask = 0;
	TokenRange token;
	while (next_token(data, &cursor, end, &token)) {
		const int index = lookup_name(data, token, names, count);
		if (index < 0) {
			++g_generals_audio_error_count;
		} else {
			mask |= (1 << index);
		}
	}

	return mask;
}

static int count_tokens(const char *data, int start, int end)
{
	int cursor = start;
	int count = 0;
	TokenRange token;
	while (next_token(data, &cursor, end, &token)) {
		++count;
	}

	return count;
}

static int parse_two_ints(const char *data, int start, int end, int *first, int *second)
{
	int cursor = start;
	TokenRange firstToken;
	TokenRange secondToken;
	if (!next_token(data, &cursor, end, &firstToken)) {
		return 0;
	}
	if (!next_token(data, &cursor, end, &secondToken)) {
		secondToken = firstToken;
	}

	return parse_int(data, firstToken.start, firstToken.end, first) &&
		parse_int(data, secondToken.start, secondToken.end, second);
}

static int parse_two_reals_x100(const char *data, int start, int end, int *first, int *second)
{
	int cursor = start;
	TokenRange firstToken;
	TokenRange secondToken;
	if (!next_token(data, &cursor, end, &firstToken)) {
		return 0;
	}
	if (!next_token(data, &cursor, end, &secondToken)) {
		secondToken = firstToken;
	}

	return parse_real_x100(data, firstToken.start, firstToken.end, first) &&
		parse_real_x100(data, secondToken.start, secondToken.end, second);
}

static int category_from_token(const char *data, TokenRange token)
{
	for (int index = 0; index < CATEGORY_COUNT; ++index) {
		if (token_equals(data, token, CATEGORY_NAMES[index])) {
			return index;
		}
	}

	return -1;
}

static void init_event_defaults(AudioEventRecord *record)
{
	record->filenameOffset = -1;
	record->filenameSize = 0;
	record->soundsOffset = -1;
	record->soundsSize = 0;
	record->attackOffset = -1;
	record->attackSize = 0;
	record->decayOffset = -1;
	record->decaySize = 0;
	record->fieldCount = 0;
	record->priority = 2;
	record->typeMask = 0;
	record->controlMask = 0;
	record->volumeX100 = 0;
	record->volumeShiftX100 = 0;
	record->minVolumeX100 = 0;
	record->pitchShiftMinX100 = 10000;
	record->pitchShiftMaxX100 = 10000;
	record->delayMin = 0;
	record->delayMax = 0;
	record->limit = 0;
	record->loopCount = 0;
	record->minRangeX100 = 0;
	record->maxRangeX100 = 0;
	record->lowPassCutoffX100 = 0;
	record->soundTokenCount = 0;
	record->finalized = 0;
}

static int start_event(const char *data, int category, TokenRange name, int line)
{
	if (g_generals_audio_event_count >= MAX_EVENTS) {
		++g_generals_audio_error_count;
		return -1;
	}

	const int nameSize = name.end - name.start;
	const int nameOffset = store_string(data + name.start, nameSize);
	if (nameOffset < 0) {
		++g_generals_audio_error_count;
		return -1;
	}

	const int eventIndex = g_generals_audio_event_count++;
	AudioEventRecord *record = &g_generals_audio_events[eventIndex];
	record->nameOffset = nameOffset;
	record->nameSize = nameSize;
	record->category = category;
	record->line = line;
	init_event_defaults(record);
	return eventIndex;
}

static void parse_sound_list(AudioEventRecord *record, const char *data, int valueStart, int valueEnd, int *offset, int *size)
{
	set_string_field(offset, size, data, valueStart, valueEnd);
	const int tokenCount = count_tokens(data, valueStart, valueEnd);
	record->soundTokenCount += tokenCount;
	g_generals_audio_sound_reference_count += tokenCount;
}

static void parse_property(int eventIndex, const char *data, int keyStart, int keyEnd, int valueStart, int valueEnd)
{
	if (eventIndex < 0 || eventIndex >= g_generals_audio_event_count) {
		++g_generals_audio_error_count;
		return;
	}

	AudioEventRecord *record = &g_generals_audio_events[eventIndex];
	++record->fieldCount;
	++g_generals_audio_field_count;

	if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Filename")) {
		set_string_field(&record->filenameOffset, &record->filenameSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Sounds")) {
		parse_sound_list(record, data, valueStart, valueEnd, &record->soundsOffset, &record->soundsSize);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "SoundsNight") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "SoundsEvening") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "SoundsMorning")) {
		const int tokenCount = count_tokens(data, valueStart, valueEnd);
		record->soundTokenCount += tokenCount;
		g_generals_audio_sound_reference_count += tokenCount;
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Attack")) {
		parse_sound_list(record, data, valueStart, valueEnd, &record->attackOffset, &record->attackSize);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Decay")) {
		parse_sound_list(record, data, valueStart, valueEnd, &record->decayOffset, &record->decaySize);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Volume")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->volumeX100)) {
			++g_generals_audio_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "VolumeShift")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->volumeShiftX100)) {
			++g_generals_audio_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "MinVolume")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->minVolumeX100)) {
			++g_generals_audio_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "LowPassCutoff")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->lowPassCutoffX100)) {
			++g_generals_audio_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "MinRange")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->minRangeX100)) {
			++g_generals_audio_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "MaxRange")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->maxRangeX100)) {
			++g_generals_audio_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "PitchShift")) {
		int min = 0;
		int max = 0;
		if (parse_two_reals_x100(data, valueStart, valueEnd, &min, &max)) {
			record->pitchShiftMinX100 = 10000 + min;
			record->pitchShiftMaxX100 = 10000 + max;
		} else {
			++g_generals_audio_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Delay")) {
		if (!parse_two_ints(data, valueStart, valueEnd, &record->delayMin, &record->delayMax)) {
			++g_generals_audio_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Limit")) {
		if (!parse_first_int(data, valueStart, valueEnd, &record->limit)) {
			++g_generals_audio_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "LoopCount")) {
		if (!parse_first_int(data, valueStart, valueEnd, &record->loopCount)) {
			++g_generals_audio_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Priority")) {
		record->priority = parse_index_name(data, valueStart, valueEnd, PRIORITY_NAMES, PRIORITY_COUNT);
		if (record->priority < 0) {
			++g_generals_audio_error_count;
			record->priority = 2;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Type")) {
		record->typeMask = parse_bit_mask(data, valueStart, valueEnd, SOUND_TYPE_NAMES, SOUND_TYPE_COUNT);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Control")) {
		record->controlMask = parse_bit_mask(data, valueStart, valueEnd, CONTROL_NAMES, CONTROL_COUNT);
	}
}

static void parse_assignment(int eventIndex, const char *data, int contentStart, int contentEnd)
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

	parse_property(eventIndex, data, keyStart, keyEnd, valueStart, valueEnd);
}

static void reset_parser()
{
	g_generals_audio_event_count = 0;
	g_generals_audio_field_count = 0;
	g_generals_audio_line_count = 0;
	g_generals_audio_error_count = 0;
	g_generals_audio_sound_reference_count = 0;
	g_generals_audio_name_cursor = 0;
	for (int index = 0; index < CATEGORY_COUNT; ++index) {
		g_generals_audio_category_counts[index] = 0;
	}
	for (int index = 0; index < PRIORITY_COUNT; ++index) {
		g_generals_audio_priority_counts[index] = 0;
	}
	for (int index = 0; index < SOUND_TYPE_COUNT; ++index) {
		g_generals_audio_type_counts[index] = 0;
	}
	for (int index = 0; index < CONTROL_COUNT; ++index) {
		g_generals_audio_control_counts[index] = 0;
	}
}

static void finalize_event(int eventIndex)
{
	if (eventIndex < 0 || eventIndex >= g_generals_audio_event_count) {
		return;
	}

	AudioEventRecord *record = &g_generals_audio_events[eventIndex];
	if (record->finalized) {
		return;
	}

	record->finalized = 1;
	if (record->category >= 0 && record->category < CATEGORY_COUNT) {
		++g_generals_audio_category_counts[record->category];
	}
	if (record->priority >= 0 && record->priority < PRIORITY_COUNT) {
		++g_generals_audio_priority_counts[record->priority];
	}
	for (int index = 0; index < SOUND_TYPE_COUNT; ++index) {
		if (record->typeMask & (1 << index)) {
			++g_generals_audio_type_counts[index];
		}
	}
	for (int index = 0; index < CONTROL_COUNT; ++index) {
		if (record->controlMask & (1 << index)) {
			++g_generals_audio_control_counts[index];
		}
	}
}

static int enum_name_ptr(const char **names, int count, int index)
{
	if (index < 0 || index >= count) {
		return 0;
	}

	return (int)names[index];
}

static int enum_name_size(const char **names, int count, int index)
{
	if (index < 0 || index >= count) {
		return -1;
	}

	return string_length(names[index]);
}

static int event_string_ptr(int index, int offset)
{
	if (index < 0 || index >= g_generals_audio_event_count || offset < 0) {
		return 0;
	}

	return (int)(g_generals_audio_names + offset);
}

__attribute__((used, visibility("default"))) unsigned int generals_audio_input_ptr()
{
	return (unsigned int)g_generals_audio_input;
}

__attribute__((used, visibility("default"))) int generals_audio_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_audio_parse(int size)
{
	reset_parser();
	if (size < 0 || size > INPUT_CAPACITY) {
		g_generals_audio_error_count = 1;
		return -1;
	}

	const char *data = (const char *)g_generals_audio_input;
	int lineStart = 0;
	int line = 1;
	int activeEvent = -1;

	for (int cursor = 0; cursor <= size; ++cursor) {
		if (cursor != size && data[cursor] != '\n') {
			continue;
		}

		int lineEnd = cursor;
		if (lineEnd > lineStart && data[lineEnd - 1] == '\r') {
			--lineEnd;
		}

		const int commentStart = find_comment_start(data, lineStart, lineEnd);
		int contentStart = lineStart;
		int contentEnd = commentStart;
		trim_range(data, &contentStart, &contentEnd);

		if (contentStart < contentEnd) {
			TokenRange first;
			int tokenCursor = contentStart;
			if (next_token(data, &tokenCursor, contentEnd, &first)) {
				const int category = category_from_token(data, first);
				if (category >= 0) {
					if (activeEvent >= 0) {
						finalize_event(activeEvent);
					}
					TokenRange name;
					if (next_token(data, &tokenCursor, contentEnd, &name)) {
						activeEvent = start_event(data, category, name, line);
					} else {
						++g_generals_audio_error_count;
					}
				} else if (token_equals(data, first, "End")) {
					if (activeEvent >= 0) {
						finalize_event(activeEvent);
						activeEvent = -1;
					}
				} else if (activeEvent >= 0 && find_equals(data, contentStart, contentEnd) >= 0) {
					parse_assignment(activeEvent, data, contentStart, contentEnd);
				}
			}
		}

		lineStart = cursor + 1;
		++line;
	}

	if (activeEvent >= 0) {
		finalize_event(activeEvent);
	}

	g_generals_audio_line_count = line - 1;
	return g_generals_audio_error_count == 0 ? g_generals_audio_event_count : -1;
}

__attribute__((used, visibility("default"))) int generals_audio_event_count()
{
	return g_generals_audio_event_count;
}

__attribute__((used, visibility("default"))) int generals_audio_field_count()
{
	return g_generals_audio_field_count;
}

__attribute__((used, visibility("default"))) int generals_audio_line_count()
{
	return g_generals_audio_line_count;
}

__attribute__((used, visibility("default"))) int generals_audio_error_count()
{
	return g_generals_audio_error_count;
}

__attribute__((used, visibility("default"))) int generals_audio_sound_reference_count()
{
	return g_generals_audio_sound_reference_count;
}

__attribute__((used, visibility("default"))) int generals_audio_category_count(int index)
{
	return index >= 0 && index < CATEGORY_COUNT ? g_generals_audio_category_counts[index] : -1;
}

__attribute__((used, visibility("default"))) int generals_audio_priority_count(int index)
{
	return index >= 0 && index < PRIORITY_COUNT ? g_generals_audio_priority_counts[index] : -1;
}

__attribute__((used, visibility("default"))) int generals_audio_type_flag_count(int index)
{
	return index >= 0 && index < SOUND_TYPE_COUNT ? g_generals_audio_type_counts[index] : -1;
}

__attribute__((used, visibility("default"))) int generals_audio_control_flag_count(int index)
{
	return index >= 0 && index < CONTROL_COUNT ? g_generals_audio_control_counts[index] : -1;
}

__attribute__((used, visibility("default"))) int generals_audio_category_name_ptr(int index)
{
	return enum_name_ptr(CATEGORY_NAMES, CATEGORY_COUNT, index);
}

__attribute__((used, visibility("default"))) int generals_audio_category_name_size(int index)
{
	return enum_name_size(CATEGORY_NAMES, CATEGORY_COUNT, index);
}

__attribute__((used, visibility("default"))) int generals_audio_priority_name_ptr(int index)
{
	return enum_name_ptr(PRIORITY_NAMES, PRIORITY_COUNT, index);
}

__attribute__((used, visibility("default"))) int generals_audio_priority_name_size(int index)
{
	return enum_name_size(PRIORITY_NAMES, PRIORITY_COUNT, index);
}

__attribute__((used, visibility("default"))) int generals_audio_type_name_ptr(int index)
{
	return enum_name_ptr(SOUND_TYPE_NAMES, SOUND_TYPE_COUNT, index);
}

__attribute__((used, visibility("default"))) int generals_audio_type_name_size(int index)
{
	return enum_name_size(SOUND_TYPE_NAMES, SOUND_TYPE_COUNT, index);
}

__attribute__((used, visibility("default"))) int generals_audio_control_name_ptr(int index)
{
	return enum_name_ptr(CONTROL_NAMES, CONTROL_COUNT, index);
}

__attribute__((used, visibility("default"))) int generals_audio_control_name_size(int index)
{
	return enum_name_size(CONTROL_NAMES, CONTROL_COUNT, index);
}

__attribute__((used, visibility("default"))) int generals_audio_event_name_ptr(int index)
{
	return event_string_ptr(index, index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].nameOffset : -1);
}

__attribute__((used, visibility("default"))) int generals_audio_event_name_size(int index)
{
	return index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].nameSize : -1;
}

__attribute__((used, visibility("default"))) int generals_audio_event_filename_ptr(int index)
{
	return event_string_ptr(index, index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].filenameOffset : -1);
}

__attribute__((used, visibility("default"))) int generals_audio_event_filename_size(int index)
{
	return index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].filenameSize : -1;
}

__attribute__((used, visibility("default"))) int generals_audio_event_sounds_ptr(int index)
{
	return event_string_ptr(index, index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].soundsOffset : -1);
}

__attribute__((used, visibility("default"))) int generals_audio_event_sounds_size(int index)
{
	return index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].soundsSize : -1;
}

__attribute__((used, visibility("default"))) int generals_audio_event_attack_ptr(int index)
{
	return event_string_ptr(index, index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].attackOffset : -1);
}

__attribute__((used, visibility("default"))) int generals_audio_event_attack_size(int index)
{
	return index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].attackSize : -1;
}

__attribute__((used, visibility("default"))) int generals_audio_event_decay_ptr(int index)
{
	return event_string_ptr(index, index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].decayOffset : -1);
}

__attribute__((used, visibility("default"))) int generals_audio_event_decay_size(int index)
{
	return index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].decaySize : -1;
}

__attribute__((used, visibility("default"))) int generals_audio_event_line(int index)
{
	return index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].line : -1;
}

__attribute__((used, visibility("default"))) int generals_audio_event_field_count_at(int index)
{
	return index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].fieldCount : -1;
}

__attribute__((used, visibility("default"))) int generals_audio_event_category(int index)
{
	return index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].category : -1;
}

__attribute__((used, visibility("default"))) int generals_audio_event_priority(int index)
{
	return index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].priority : -1;
}

__attribute__((used, visibility("default"))) int generals_audio_event_type_mask(int index)
{
	return index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].typeMask : -1;
}

__attribute__((used, visibility("default"))) int generals_audio_event_control_mask(int index)
{
	return index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].controlMask : -1;
}

__attribute__((used, visibility("default"))) int generals_audio_event_volume_x100(int index)
{
	return index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].volumeX100 : -1;
}

__attribute__((used, visibility("default"))) int generals_audio_event_volume_shift_x100(int index)
{
	return index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].volumeShiftX100 : -1;
}

__attribute__((used, visibility("default"))) int generals_audio_event_min_volume_x100(int index)
{
	return index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].minVolumeX100 : -1;
}

__attribute__((used, visibility("default"))) int generals_audio_event_pitch_shift_min_x100(int index)
{
	return index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].pitchShiftMinX100 : -1;
}

__attribute__((used, visibility("default"))) int generals_audio_event_pitch_shift_max_x100(int index)
{
	return index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].pitchShiftMaxX100 : -1;
}

__attribute__((used, visibility("default"))) int generals_audio_event_delay_min(int index)
{
	return index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].delayMin : -1;
}

__attribute__((used, visibility("default"))) int generals_audio_event_delay_max(int index)
{
	return index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].delayMax : -1;
}

__attribute__((used, visibility("default"))) int generals_audio_event_limit(int index)
{
	return index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].limit : -1;
}

__attribute__((used, visibility("default"))) int generals_audio_event_loop_count(int index)
{
	return index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].loopCount : -1;
}

__attribute__((used, visibility("default"))) int generals_audio_event_min_range_x100(int index)
{
	return index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].minRangeX100 : -1;
}

__attribute__((used, visibility("default"))) int generals_audio_event_max_range_x100(int index)
{
	return index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].maxRangeX100 : -1;
}

__attribute__((used, visibility("default"))) int generals_audio_event_low_pass_cutoff_x100(int index)
{
	return index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].lowPassCutoffX100 : -1;
}

__attribute__((used, visibility("default"))) int generals_audio_event_sound_token_count(int index)
{
	return index >= 0 && index < g_generals_audio_event_count ? g_generals_audio_events[index].soundTokenCount : -1;
}

}
