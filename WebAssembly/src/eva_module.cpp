extern "C" {

// Parses Eva.INI EvaEvent blocks and their nested SideSounds sub-blocks.
// Each EvaEvent carries Priority, TimeBetweenChecksMS, and ExpirationTimeMS
// (EvaCheckInfo::s_evaEventInfo) and a list of SideSounds, where each
// SideSounds group binds a Side name to a sound list (EvaSideSounds::
// s_evaSideSounds) in GeneralsMD/Code/GameEngine/Source/GameClient/Eva.cpp.
// SideSounds groups are stored in a flat array keyed back to their owning
// event so the wasm ABI stays integer-only.

static const int INPUT_CAPACITY = 128 * 1024;
static const int NAME_CAPACITY = 256 * 1024;
static const int MAX_EVENTS = 128;
static const int MAX_SIDE_SOUNDS = 1024;

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

struct EvaEventRecord
{
	StringField name;
	int priority;
	int timeBetweenChecksMs;
	int expirationTimeMs;
	int sideSoundsCount;
	int firstSideSound;
	int line;
	int fieldCount;
};

struct SideSoundsRecord
{
	int eventIndex;
	StringField side;
	StringField firstSound;
	int soundCount;
	int line;
	int fieldCount;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_eva_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_eva_names[NAME_CAPACITY];

static EvaEventRecord g_events[MAX_EVENTS];
static SideSoundsRecord g_side_sounds[MAX_SIDE_SOUNDS];
static int g_event_count = 0;
static int g_side_sound_count = 0;
static int g_field_count = 0;
static int g_line_count = 0;
static int g_error_count = 0;
static int g_name_cursor = 0;
static int g_current_event = -1;
static int g_current_side_sound = -1;

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

static bool string_equals(const char *data, int start, int end, const char *value)
{
	return ascii_equal_ignore_case(data + start, end - start, value);
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
	if (valueSize < 0 || g_name_cursor + valueSize + 1 > NAME_CAPACITY) {
		return -1;
	}

	const int offset = g_name_cursor;
	for (int index = 0; index < valueSize; ++index) {
		g_generals_eva_names[g_name_cursor++] = value[index];
	}
	g_generals_eva_names[g_name_cursor++] = 0;
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
		++g_error_count;
		return;
	}

	field->offset = offset;
	field->size = size;
}

static void assign_token_string(StringField *field, const char *data, int start, int end)
{
	TokenRange token;
	int cursor = start;
	if (!next_token(data, &cursor, end, &token)) {
		clear_string(field);
		return;
	}

	assign_string(field, data, token.start, token.end);
}

static int parse_int_token(const char *data, int start, int end, int *valueOut)
{
	TokenRange token;
	int cursor = start;
	if (!next_token(data, &cursor, end, &token)) {
		return 0;
	}

	int pos = token.start;
	bool negative = false;
	if (pos < token.end && (data[pos] == '-' || data[pos] == '+')) {
		negative = data[pos] == '-';
		++pos;
	}

	int value = 0;
	bool sawDigit = false;
	while (pos < token.end && data[pos] >= '0' && data[pos] <= '9') {
		sawDigit = true;
		value = value * 10 + (data[pos] - '0');
		++pos;
	}

	if (!sawDigit) {
		return 0;
	}

	*valueOut = negative ? -value : value;
	return 1;
}

static void reset_state()
{
	g_event_count = 0;
	g_side_sound_count = 0;
	g_field_count = 0;
	g_line_count = 0;
	g_error_count = 0;
	g_name_cursor = 0;
	g_current_event = -1;
	g_current_side_sound = -1;
}

static void create_event(const char *data, int nameStart, int nameEnd, int line)
{
	if (g_event_count >= MAX_EVENTS) {
		++g_error_count;
		return;
	}

	EvaEventRecord *event = &g_events[g_event_count];
	clear_string(&event->name);
	assign_string(&event->name, data, nameStart, nameEnd);
	event->priority = 0;
	event->timeBetweenChecksMs = 0;
	event->expirationTimeMs = 0;
	event->sideSoundsCount = 0;
	event->firstSideSound = -1;
	event->line = line;
	event->fieldCount = 0;
	g_current_event = g_event_count++;
	g_current_side_sound = -1;
}

static void create_side_sound(int line)
{
	if (g_current_event < 0) {
		return;
	}
	if (g_side_sound_count >= MAX_SIDE_SOUNDS) {
		++g_error_count;
		return;
	}

	SideSoundsRecord *record = &g_side_sounds[g_side_sound_count];
	record->eventIndex = g_current_event;
	clear_string(&record->side);
	clear_string(&record->firstSound);
	record->soundCount = 0;
	record->line = line;
	record->fieldCount = 0;

	EvaEventRecord *event = &g_events[g_current_event];
	if (event->firstSideSound < 0) {
		event->firstSideSound = g_side_sound_count;
	}
	event->sideSoundsCount += 1;
	g_current_side_sound = g_side_sound_count++;
}

static void parse_block_line(const char *data, int start, int end, int line)
{
	TokenRange token;
	int cursor = start;
	if (!next_token(data, &cursor, end, &token)) {
		return;
	}

	if (token_equals(data, token, "End")) {
		if (g_current_side_sound >= 0) {
			g_current_side_sound = -1;
		} else if (g_current_event >= 0) {
			g_current_event = -1;
		}
		return;
	}

	if (token_equals(data, token, "EvaEvent")) {
		create_event(data, token.end, end, line);
	} else if (token_equals(data, token, "SideSounds")) {
		create_side_sound(line);
	}
}

static void assign_sound_list(SideSoundsRecord *record, const char *data, int valueStart, int valueEnd)
{
	int cursor = valueStart;
	TokenRange token;
	int count = 0;
	while (next_token(data, &cursor, valueEnd, &token)) {
		if (count == 0) {
			assign_string(&record->firstSound, data, token.start, token.end);
		}
		++count;
	}
	record->soundCount = count;
}

static void parse_side_sound_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd)
{
	SideSoundsRecord *record = &g_side_sounds[g_current_side_sound];
	int parsed = 1;
	if (string_equals(data, fieldStart, fieldEnd, "Side")) {
		assign_token_string(&record->side, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "Sounds")) {
		assign_sound_list(record, data, valueStart, valueEnd);
	} else {
		parsed = 0;
	}

	if (parsed) {
		record->fieldCount += 1;
		++g_field_count;
	}
}

static void parse_event_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd)
{
	EvaEventRecord *event = &g_events[g_current_event];
	int parsed = 1;
	if (string_equals(data, fieldStart, fieldEnd, "Priority")) {
		parse_int_token(data, valueStart, valueEnd, &event->priority);
	} else if (string_equals(data, fieldStart, fieldEnd, "TimeBetweenChecksMS")) {
		parse_int_token(data, valueStart, valueEnd, &event->timeBetweenChecksMs);
	} else if (string_equals(data, fieldStart, fieldEnd, "ExpirationTimeMS")) {
		parse_int_token(data, valueStart, valueEnd, &event->expirationTimeMs);
	} else {
		parsed = 0;
	}

	if (parsed) {
		event->fieldCount += 1;
		++g_field_count;
	}
}

static void parse_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd)
{
	trim_range(data, &fieldStart, &fieldEnd);
	trim_range(data, &valueStart, &valueEnd);

	if (g_current_side_sound >= 0) {
		parse_side_sound_assignment(data, fieldStart, fieldEnd, valueStart, valueEnd);
	} else if (g_current_event >= 0) {
		parse_event_assignment(data, fieldStart, fieldEnd, valueStart, valueEnd);
	}
}

static int string_field_ptr(StringField field)
{
	return field.offset >= 0 ? (int)(g_generals_eva_names + field.offset) : 0;
}

__attribute__((used, visibility("default"))) int generals_eva_input_ptr()
{
	return (int)g_generals_eva_input;
}

__attribute__((used, visibility("default"))) int generals_eva_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_eva_parse(int inputSize)
{
	reset_state();

	if (inputSize < 0 || inputSize > INPUT_CAPACITY) {
		g_error_count = 1;
		return -1;
	}

	const char *data = (const char *)g_generals_eva_input;
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

		++g_line_count;
		lineEnd = find_comment_start(data, lineStart, lineEnd);
		trim_range(data, &lineStart, &lineEnd);
		if (lineStart >= lineEnd) {
			++line;
			continue;
		}

		const int equals = find_equals(data, lineStart, lineEnd);
		if (equals >= 0) {
			parse_assignment(data, lineStart, equals, equals + 1, lineEnd);
		} else {
			parse_block_line(data, lineStart, lineEnd, line);
		}

		++line;
	}

	return g_event_count;
}

__attribute__((used, visibility("default"))) int generals_eva_count()
{
	return g_event_count;
}

__attribute__((used, visibility("default"))) int generals_eva_side_sounds_total()
{
	return g_side_sound_count;
}

__attribute__((used, visibility("default"))) int generals_eva_field_count()
{
	return g_field_count;
}

__attribute__((used, visibility("default"))) int generals_eva_line_count()
{
	return g_line_count;
}

__attribute__((used, visibility("default"))) int generals_eva_error_count()
{
	return g_error_count;
}

#define EVA_EVENT_GUARD(expr, fallback) (index >= 0 && index < g_event_count ? (expr) : (fallback))

__attribute__((used, visibility("default"))) int generals_eva_name_ptr(int index)
{
	return EVA_EVENT_GUARD(string_field_ptr(g_events[index].name), 0);
}

__attribute__((used, visibility("default"))) int generals_eva_name_size(int index)
{
	return EVA_EVENT_GUARD(g_events[index].name.size, -1);
}

__attribute__((used, visibility("default"))) int generals_eva_priority(int index)
{
	return EVA_EVENT_GUARD(g_events[index].priority, -1);
}

__attribute__((used, visibility("default"))) int generals_eva_time_between_checks_ms(int index)
{
	return EVA_EVENT_GUARD(g_events[index].timeBetweenChecksMs, -1);
}

__attribute__((used, visibility("default"))) int generals_eva_expiration_time_ms(int index)
{
	return EVA_EVENT_GUARD(g_events[index].expirationTimeMs, -1);
}

__attribute__((used, visibility("default"))) int generals_eva_side_sounds_count(int index)
{
	return EVA_EVENT_GUARD(g_events[index].sideSoundsCount, -1);
}

__attribute__((used, visibility("default"))) int generals_eva_first_side_sound(int index)
{
	return EVA_EVENT_GUARD(g_events[index].firstSideSound, -1);
}

__attribute__((used, visibility("default"))) int generals_eva_line(int index)
{
	return EVA_EVENT_GUARD(g_events[index].line, -1);
}

__attribute__((used, visibility("default"))) int generals_eva_field_count_at(int index)
{
	return EVA_EVENT_GUARD(g_events[index].fieldCount, -1);
}

#define EVA_SOUND_GUARD(expr, fallback) (index >= 0 && index < g_side_sound_count ? (expr) : (fallback))

__attribute__((used, visibility("default"))) int generals_eva_side_sound_event_index(int index)
{
	return EVA_SOUND_GUARD(g_side_sounds[index].eventIndex, -1);
}

__attribute__((used, visibility("default"))) int generals_eva_side_sound_side_ptr(int index)
{
	return EVA_SOUND_GUARD(string_field_ptr(g_side_sounds[index].side), 0);
}

__attribute__((used, visibility("default"))) int generals_eva_side_sound_side_size(int index)
{
	return EVA_SOUND_GUARD(g_side_sounds[index].side.size, -1);
}

__attribute__((used, visibility("default"))) int generals_eva_side_sound_first_sound_ptr(int index)
{
	return EVA_SOUND_GUARD(string_field_ptr(g_side_sounds[index].firstSound), 0);
}

__attribute__((used, visibility("default"))) int generals_eva_side_sound_first_sound_size(int index)
{
	return EVA_SOUND_GUARD(g_side_sounds[index].firstSound.size, -1);
}

__attribute__((used, visibility("default"))) int generals_eva_side_sound_count_at(int index)
{
	return EVA_SOUND_GUARD(g_side_sounds[index].soundCount, -1);
}

__attribute__((used, visibility("default"))) int generals_eva_side_sound_line(int index)
{
	return EVA_SOUND_GUARD(g_side_sounds[index].line, -1);
}

}
