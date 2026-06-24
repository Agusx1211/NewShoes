extern "C" {

// Parses WindowTransitions.INI WindowTransition groups and their nested Window
// sub-blocks. Each group carries a FireOnce flag and a list of Windows, where
// each Window binds a WinName to a transition Style (a lookup-list value) and a
// FrameDelay, following m_gameWindowTransitionsFieldParseTable and the Window
// field table in
// GeneralsMD/Code/GameEngine/Source/GameClient/GUI/GameWindowTransitions.cpp.
// Window sub-blocks are stored in a flat array keyed back to their owning group.

static const int INPUT_CAPACITY = 128 * 1024;
static const int NAME_CAPACITY = 128 * 1024;
static const int MAX_GROUPS = 128;
static const int MAX_WINDOWS = 1024;

// Transition style names in TransitionStyleNames[] order, which matches the
// sequential transition enum (TRANSITION_FLASH = 0 ...) so the lookup index is
// the stored style value.
static const char *const TRANSITION_STYLE_NAMES[] = {
	"FLASH",
	"BUTTONFLASH",
	"WINFADE",
	"WINSCALEUP",
	"MAINMENUSCALEUP",
	"TYPETEXT",
	"SCREENFADE",
	"COUNTUP",
	"FULLFADE",
	"TEXTONFRAME",
	"MAINMENUMEDIUMSCALEUP",
	"MAINMENUSMALLSCALEDOWN",
	"CONTROLBARARROW",
	"SCORESCALEUP",
	"REVERSESOUND",
};
static const int TRANSITION_STYLE_COUNT = (int)(sizeof(TRANSITION_STYLE_NAMES) / sizeof(TRANSITION_STYLE_NAMES[0]));

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

struct GroupRecord
{
	StringField name;
	int fireOnce;
	int windowCount;
	int firstWindow;
	int line;
	int fieldCount;
};

struct WindowRecord
{
	int groupIndex;
	StringField winName;
	int style;
	int frameDelay;
	int line;
	int fieldCount;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_transition_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_transition_names[NAME_CAPACITY];

static GroupRecord g_groups[MAX_GROUPS];
static WindowRecord g_windows[MAX_WINDOWS];
static int g_group_count = 0;
static int g_window_count = 0;
static int g_field_count = 0;
static int g_line_count = 0;
static int g_error_count = 0;
static int g_name_cursor = 0;
static int g_current_group = -1;
static int g_current_window = -1;

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

static int string_length(const char *value)
{
	int length = 0;
	while (value[length] != 0) {
		++length;
	}

	return length;
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

static int find_named_index(const char *data, TokenRange token, const char *const *names, int nameCount)
{
	for (int index = 0; index < nameCount; ++index) {
		if (ascii_equal_ignore_case(data + token.start, token.end - token.start, names[index])) {
			return index;
		}
	}

	return -1;
}

static int store_string(const char *value, int valueSize)
{
	if (valueSize < 0 || g_name_cursor + valueSize + 1 > NAME_CAPACITY) {
		return -1;
	}

	const int offset = g_name_cursor;
	for (int index = 0; index < valueSize; ++index) {
		g_generals_transition_names[g_name_cursor++] = value[index];
	}
	g_generals_transition_names[g_name_cursor++] = 0;
	return offset;
}

static void clear_string(StringField *field)
{
	field->offset = -1;
	field->size = 0;
}

static void assign_token_string(StringField *field, const char *data, int start, int end)
{
	TokenRange token;
	int cursor = start;
	if (!next_token(data, &cursor, end, &token)) {
		clear_string(field);
		return;
	}

	const int size = token.end - token.start;
	const int offset = store_string(data + token.start, size);
	if (offset < 0) {
		++g_error_count;
		clear_string(field);
		return;
	}

	field->offset = offset;
	field->size = size;
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

static int parse_bool_token(const char *data, int start, int end)
{
	TokenRange token;
	int cursor = start;
	if (!next_token(data, &cursor, end, &token)) {
		return 0;
	}

	if (token_equals(data, token, "Yes") || token_equals(data, token, "True") || token_equals(data, token, "1")) {
		return 1;
	}

	return 0;
}

static void reset_state()
{
	g_group_count = 0;
	g_window_count = 0;
	g_field_count = 0;
	g_line_count = 0;
	g_error_count = 0;
	g_name_cursor = 0;
	g_current_group = -1;
	g_current_window = -1;
}

static void create_group(const char *data, int nameStart, int nameEnd, int line)
{
	if (g_group_count >= MAX_GROUPS) {
		++g_error_count;
		return;
	}

	GroupRecord *group = &g_groups[g_group_count];
	clear_string(&group->name);
	assign_token_string(&group->name, data, nameStart, nameEnd);
	group->fireOnce = 0;
	group->windowCount = 0;
	group->firstWindow = -1;
	group->line = line;
	group->fieldCount = 0;
	g_current_group = g_group_count++;
	g_current_window = -1;
}

static void create_window(int line)
{
	if (g_current_group < 0) {
		return;
	}
	if (g_window_count >= MAX_WINDOWS) {
		++g_error_count;
		return;
	}

	WindowRecord *window = &g_windows[g_window_count];
	window->groupIndex = g_current_group;
	clear_string(&window->winName);
	window->style = -1;
	window->frameDelay = 0;
	window->line = line;
	window->fieldCount = 0;

	GroupRecord *group = &g_groups[g_current_group];
	if (group->firstWindow < 0) {
		group->firstWindow = g_window_count;
	}
	group->windowCount += 1;
	// Window is itself a field of the group in the engine's parse table.
	group->fieldCount += 1;
	++g_field_count;
	g_current_window = g_window_count++;
}

static void parse_window_field(const char *data, TokenRange field, int valueStart, int valueEnd)
{
	WindowRecord *window = &g_windows[g_current_window];
	int parsed = 1;
	if (token_equals(data, field, "WinName")) {
		assign_token_string(&window->winName, data, valueStart, valueEnd);
	} else if (token_equals(data, field, "Style")) {
		TokenRange styleToken;
		int cursor = valueStart;
		if (next_token(data, &cursor, valueEnd, &styleToken)) {
			const int styleIndex = find_named_index(data, styleToken, TRANSITION_STYLE_NAMES, TRANSITION_STYLE_COUNT);
			window->style = styleIndex;
			if (styleIndex < 0) {
				++g_error_count;
			}
		}
	} else if (token_equals(data, field, "FrameDelay")) {
		parse_int_token(data, valueStart, valueEnd, &window->frameDelay);
	} else {
		parsed = 0;
	}

	if (parsed) {
		window->fieldCount += 1;
		++g_field_count;
	}
}

static void parse_group_field(const char *data, TokenRange field, int valueStart, int valueEnd)
{
	GroupRecord *group = &g_groups[g_current_group];
	int parsed = 1;
	if (token_equals(data, field, "FireOnce")) {
		group->fireOnce = parse_bool_token(data, valueStart, valueEnd);
	} else {
		parsed = 0;
	}

	if (parsed) {
		group->fieldCount += 1;
		++g_field_count;
	}
}

static void parse_line(const char *data, int start, int end, int line)
{
	TokenRange first;
	int cursor = start;
	if (!next_token(data, &cursor, end, &first)) {
		return;
	}

	const int valueStart = cursor;

	if (token_equals(data, first, "End")) {
		if (g_current_window >= 0) {
			g_current_window = -1;
		} else if (g_current_group >= 0) {
			g_current_group = -1;
		}
		return;
	}

	if (token_equals(data, first, "WindowTransition")) {
		create_group(data, valueStart, end, line);
		return;
	}

	if (token_equals(data, first, "Window")) {
		create_window(line);
		return;
	}

	if (g_current_window >= 0) {
		parse_window_field(data, first, valueStart, end);
	} else if (g_current_group >= 0) {
		parse_group_field(data, first, valueStart, end);
	}
}

static int string_field_ptr(StringField field)
{
	return field.offset >= 0 ? (int)(g_generals_transition_names + field.offset) : 0;
}

__attribute__((used, visibility("default"))) int generals_transition_input_ptr()
{
	return (int)g_generals_transition_input;
}

__attribute__((used, visibility("default"))) int generals_transition_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_transition_parse(int inputSize)
{
	reset_state();

	if (inputSize < 0 || inputSize > INPUT_CAPACITY) {
		g_error_count = 1;
		return -1;
	}

	const char *data = (const char *)g_generals_transition_input;
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
		if (lineStart < lineEnd) {
			parse_line(data, lineStart, lineEnd, line);
		}

		++line;
	}

	return g_group_count;
}

__attribute__((used, visibility("default"))) int generals_transition_count()
{
	return g_group_count;
}

__attribute__((used, visibility("default"))) int generals_transition_window_total()
{
	return g_window_count;
}

__attribute__((used, visibility("default"))) int generals_transition_field_count()
{
	return g_field_count;
}

__attribute__((used, visibility("default"))) int generals_transition_line_count()
{
	return g_line_count;
}

__attribute__((used, visibility("default"))) int generals_transition_error_count()
{
	return g_error_count;
}

__attribute__((used, visibility("default"))) int generals_transition_style_count()
{
	return TRANSITION_STYLE_COUNT;
}

__attribute__((used, visibility("default"))) int generals_transition_style_name_ptr(int index)
{
	return index >= 0 && index < TRANSITION_STYLE_COUNT ? (int)TRANSITION_STYLE_NAMES[index] : 0;
}

__attribute__((used, visibility("default"))) int generals_transition_style_name_size(int index)
{
	return index >= 0 && index < TRANSITION_STYLE_COUNT ? string_length(TRANSITION_STYLE_NAMES[index]) : -1;
}

#define GROUP_GUARD(expr, fallback) (index >= 0 && index < g_group_count ? (expr) : (fallback))

__attribute__((used, visibility("default"))) int generals_transition_name_ptr(int index)
{
	return GROUP_GUARD(string_field_ptr(g_groups[index].name), 0);
}

__attribute__((used, visibility("default"))) int generals_transition_name_size(int index)
{
	return GROUP_GUARD(g_groups[index].name.size, -1);
}

__attribute__((used, visibility("default"))) int generals_transition_fire_once(int index)
{
	return GROUP_GUARD(g_groups[index].fireOnce, -1);
}

__attribute__((used, visibility("default"))) int generals_transition_window_count(int index)
{
	return GROUP_GUARD(g_groups[index].windowCount, -1);
}

__attribute__((used, visibility("default"))) int generals_transition_first_window(int index)
{
	return GROUP_GUARD(g_groups[index].firstWindow, -1);
}

__attribute__((used, visibility("default"))) int generals_transition_line(int index)
{
	return GROUP_GUARD(g_groups[index].line, -1);
}

__attribute__((used, visibility("default"))) int generals_transition_field_count_at(int index)
{
	return GROUP_GUARD(g_groups[index].fieldCount, -1);
}

#define WINDOW_GUARD(expr, fallback) (index >= 0 && index < g_window_count ? (expr) : (fallback))

__attribute__((used, visibility("default"))) int generals_transition_window_group_index(int index)
{
	return WINDOW_GUARD(g_windows[index].groupIndex, -1);
}

__attribute__((used, visibility("default"))) int generals_transition_window_name_ptr(int index)
{
	return WINDOW_GUARD(string_field_ptr(g_windows[index].winName), 0);
}

__attribute__((used, visibility("default"))) int generals_transition_window_name_size(int index)
{
	return WINDOW_GUARD(g_windows[index].winName.size, -1);
}

__attribute__((used, visibility("default"))) int generals_transition_window_style(int index)
{
	return WINDOW_GUARD(g_windows[index].style, -1);
}

__attribute__((used, visibility("default"))) int generals_transition_window_style_name_ptr(int index)
{
	if (index < 0 || index >= g_window_count) {
		return 0;
	}
	const int style = g_windows[index].style;
	return style >= 0 && style < TRANSITION_STYLE_COUNT ? (int)TRANSITION_STYLE_NAMES[style] : 0;
}

__attribute__((used, visibility("default"))) int generals_transition_window_style_name_size(int index)
{
	if (index < 0 || index >= g_window_count) {
		return -1;
	}
	const int style = g_windows[index].style;
	return style >= 0 && style < TRANSITION_STYLE_COUNT ? string_length(TRANSITION_STYLE_NAMES[style]) : 0;
}

__attribute__((used, visibility("default"))) int generals_transition_window_frame_delay(int index)
{
	return WINDOW_GUARD(g_windows[index].frameDelay, -1);
}

__attribute__((used, visibility("default"))) int generals_transition_window_line(int index)
{
	return WINDOW_GUARD(g_windows[index].line, -1);
}

__attribute__((used, visibility("default"))) int generals_transition_window_field_count_at(int index)
{
	return WINDOW_GUARD(g_windows[index].fieldCount, -1);
}

}
