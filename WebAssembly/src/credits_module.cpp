extern "C" {

// Parses Credits.INI: the single Credits block carrying scroll settings, RGBA
// colors, and an ordered run of Style mode switches, Text lines, and Blank
// lines, following CreditsManager::m_creditsFieldParseTable in
// GeneralsMD/Code/GameEngine/Source/GameClient/Credits.cpp. Each Text line is
// captured with the Style active at the time (parseText uses
// getNextQuotedAsciiString, so quoted multi-word strings are supported); Blank
// lines carry the CREDIT_STYLE_BLANK style. Lines are stored in a flat array.

static const int INPUT_CAPACITY = 64 * 1024;
static const int NAME_CAPACITY = 96 * 1024;
static const int MAX_LINES = 2048;

// Credit style names in CreditStyleNames[] order, which matches the enum
// (CREDIT_STYLE_TITLE = 0 ... CREDIT_STYLE_COLUMN = 3) so the lookup index is
// the stored style value. CREDIT_STYLE_BLANK = 4 is used for Blank lines.
static const char *const CREDIT_STYLE_NAMES[] = {
	"TITLE",
	"MINORTITLE",
	"NORMAL",
	"COLUMN",
	"BLANK",
};
static const int CREDIT_STYLE_COUNT = (int)(sizeof(CREDIT_STYLE_NAMES) / sizeof(CREDIT_STYLE_NAMES[0]));
static const int CREDIT_STYLE_LOOKUP_COUNT = 4; // TITLE..COLUMN are selectable via Style
static const int CREDIT_STYLE_NORMAL = 2;
static const int CREDIT_STYLE_BLANK = 4;

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

struct CreditLine
{
	int type; // 0 = text, 1 = blank
	int style;
	StringField text;
	int line;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_credits_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_credits_names[NAME_CAPACITY];

static CreditLine g_lines[MAX_LINES];
static int g_line_total = 0;
static int g_text_count = 0;
static int g_blank_count = 0;
static int g_style_decl_count = 0;
static int g_field_count = 0;
static int g_line_count = 0;
static int g_error_count = 0;
static int g_name_cursor = 0;
static int g_has_credits = 0;
static int g_in_credits = 0;
static int g_current_style = CREDIT_STYLE_NORMAL;

// Credits settings.
static int g_scroll_rate = 0;
static int g_scroll_rate_every_frames = 0;
static int g_scroll_down = 0;
static int g_title_color_r = 0, g_title_color_g = 0, g_title_color_b = 0, g_title_color_a = 255;
static int g_minor_color_r = 0, g_minor_color_g = 0, g_minor_color_b = 0, g_minor_color_a = 255;
static int g_normal_color_r = 0, g_normal_color_g = 0, g_normal_color_b = 0, g_normal_color_a = 255;
static int g_settings_field_count = 0;

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
		g_generals_credits_names[g_name_cursor++] = value[index];
	}
	g_generals_credits_names[g_name_cursor++] = 0;
	return offset;
}

static void clear_string(StringField *field)
{
	field->offset = -1;
	field->size = 0;
}

static void store_field(StringField *field, const char *data, int start, int end)
{
	const int size = end - start;
	if (size <= 0) {
		clear_string(field);
		return;
	}

	const int offset = store_string(data + start, size);
	if (offset < 0) {
		++g_error_count;
		clear_string(field);
		return;
	}

	field->offset = offset;
	field->size = size;
}

// Advances past leading whitespace and a single optional '=' separator.
static int skip_value_intro(const char *data, int cursor, int end)
{
	while (cursor < end && is_space(data[cursor])) {
		++cursor;
	}
	if (cursor < end && data[cursor] == '=') {
		++cursor;
		while (cursor < end && is_space(data[cursor])) {
			++cursor;
		}
	}
	return cursor;
}

// Mirrors getNextQuotedAsciiString: a leading '"' captures everything up to the
// next '"', otherwise a single whitespace/'='-delimited token is captured.
static void assign_quoted_string(StringField *field, const char *data, int valueStart, int valueEnd)
{
	int cursor = skip_value_intro(data, valueStart, valueEnd);
	if (cursor >= valueEnd) {
		clear_string(field);
		return;
	}

	if (data[cursor] == '"') {
		++cursor;
		const int start = cursor;
		while (cursor < valueEnd && data[cursor] != '"') {
			++cursor;
		}
		store_field(field, data, start, cursor);
		return;
	}

	const int start = cursor;
	while (cursor < valueEnd && !is_token_separator(data[cursor])) {
		++cursor;
	}
	store_field(field, data, start, cursor);
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

static int clamp_color(int value)
{
	if (value < 0) {
		return 0;
	}
	if (value > 255) {
		return 255;
	}
	return value;
}

static int parse_labeled_value(const char *data, int *cursor, int end)
{
	while (*cursor < end && (is_space(data[*cursor]) || data[*cursor] == ':')) {
		++(*cursor);
	}

	int value = 0;
	while (*cursor < end && data[*cursor] >= '0' && data[*cursor] <= '9') {
		value = value * 10 + (data[*cursor] - '0');
		++(*cursor);
	}

	return clamp_color(value);
}

static void parse_rgba(const char *data, int start, int end, int *r, int *g, int *b, int *a)
{
	*r = 0;
	*g = 0;
	*b = 0;
	*a = 255;
	for (int cursor = start; cursor < end; ++cursor) {
		const char label = lower_ascii(data[cursor]);
		if ((label == 'r' || label == 'g' || label == 'b' || label == 'a') && cursor + 1 < end && data[cursor + 1] == ':') {
			++cursor;
			const int value = parse_labeled_value(data, &cursor, end);
			if (label == 'r') {
				*r = value;
			} else if (label == 'g') {
				*g = value;
			} else if (label == 'b') {
				*b = value;
			} else {
				*a = value;
			}
		}
	}
}

static void reset_state()
{
	g_line_total = 0;
	g_text_count = 0;
	g_blank_count = 0;
	g_style_decl_count = 0;
	g_field_count = 0;
	g_line_count = 0;
	g_error_count = 0;
	g_name_cursor = 0;
	g_has_credits = 0;
	g_in_credits = 0;
	g_current_style = CREDIT_STYLE_NORMAL;

	g_scroll_rate = 0;
	g_scroll_rate_every_frames = 0;
	g_scroll_down = 0;
	g_title_color_r = 0; g_title_color_g = 0; g_title_color_b = 0; g_title_color_a = 255;
	g_minor_color_r = 0; g_minor_color_g = 0; g_minor_color_b = 0; g_minor_color_a = 255;
	g_normal_color_r = 0; g_normal_color_g = 0; g_normal_color_b = 0; g_normal_color_a = 255;
	g_settings_field_count = 0;
}

static void add_text_line(const char *data, int valueStart, int valueEnd, int line)
{
	if (g_line_total >= MAX_LINES) {
		++g_error_count;
		return;
	}

	CreditLine *entry = &g_lines[g_line_total];
	entry->type = 0;
	entry->style = g_current_style;
	clear_string(&entry->text);
	assign_quoted_string(&entry->text, data, valueStart, valueEnd);
	entry->line = line;
	++g_line_total;
	++g_text_count;
}

static void add_blank_line(int line)
{
	if (g_line_total >= MAX_LINES) {
		++g_error_count;
		return;
	}

	CreditLine *entry = &g_lines[g_line_total];
	entry->type = 1;
	entry->style = CREDIT_STYLE_BLANK;
	clear_string(&entry->text);
	entry->line = line;
	++g_line_total;
	++g_blank_count;
}

static void parse_credits_field(const char *data, TokenRange field, int valueStart, int valueEnd, int line)
{
	int parsed = 1;
	int r = 0, g = 0, b = 0, a = 0;
	if (token_equals(data, field, "ScrollRate")) {
		parse_int_token(data, valueStart, valueEnd, &g_scroll_rate);
	} else if (token_equals(data, field, "ScrollRateEveryFrames")) {
		parse_int_token(data, valueStart, valueEnd, &g_scroll_rate_every_frames);
	} else if (token_equals(data, field, "ScrollDown")) {
		g_scroll_down = parse_bool_token(data, valueStart, valueEnd);
	} else if (token_equals(data, field, "TitleColor")) {
		parse_rgba(data, valueStart, valueEnd, &g_title_color_r, &g_title_color_g, &g_title_color_b, &g_title_color_a);
	} else if (token_equals(data, field, "MinorTitleColor")) {
		parse_rgba(data, valueStart, valueEnd, &g_minor_color_r, &g_minor_color_g, &g_minor_color_b, &g_minor_color_a);
	} else if (token_equals(data, field, "NormalColor")) {
		parse_rgba(data, valueStart, valueEnd, &g_normal_color_r, &g_normal_color_g, &g_normal_color_b, &g_normal_color_a);
	} else if (token_equals(data, field, "Style")) {
		TokenRange styleToken;
		int cursor = valueStart;
		if (next_token(data, &cursor, valueEnd, &styleToken)) {
			const int styleIndex = find_named_index(data, styleToken, CREDIT_STYLE_NAMES, CREDIT_STYLE_LOOKUP_COUNT);
			if (styleIndex >= 0) {
				g_current_style = styleIndex;
			} else {
				++g_error_count;
			}
		}
		++g_style_decl_count;
	} else if (token_equals(data, field, "Text")) {
		add_text_line(data, valueStart, valueEnd, line);
	} else if (token_equals(data, field, "Blank")) {
		add_blank_line(line);
	} else {
		parsed = 0;
	}

	if (parsed) {
		++g_field_count;
		if (!token_equals(data, field, "Text") && !token_equals(data, field, "Blank") && !token_equals(data, field, "Style")) {
			++g_settings_field_count;
		}
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
		g_in_credits = 0;
		return;
	}

	if (token_equals(data, first, "Credits")) {
		g_has_credits = 1;
		g_in_credits = 1;
		return;
	}

	if (g_in_credits) {
		parse_credits_field(data, first, valueStart, end, line);
	}
}

static int string_field_ptr(StringField field)
{
	return field.offset >= 0 ? (int)(g_generals_credits_names + field.offset) : 0;
}

__attribute__((used, visibility("default"))) int generals_credits_input_ptr()
{
	return (int)g_generals_credits_input;
}

__attribute__((used, visibility("default"))) int generals_credits_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_credits_parse(int inputSize)
{
	reset_state();

	if (inputSize < 0 || inputSize > INPUT_CAPACITY) {
		g_error_count = 1;
		return -1;
	}

	const char *data = (const char *)g_generals_credits_input;
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

	return g_line_total;
}

__attribute__((used, visibility("default"))) int generals_credits_has_block()
{
	return g_has_credits;
}

__attribute__((used, visibility("default"))) int generals_credits_line_total()
{
	return g_line_total;
}

__attribute__((used, visibility("default"))) int generals_credits_text_count()
{
	return g_text_count;
}

__attribute__((used, visibility("default"))) int generals_credits_blank_count()
{
	return g_blank_count;
}

__attribute__((used, visibility("default"))) int generals_credits_style_decl_count()
{
	return g_style_decl_count;
}

__attribute__((used, visibility("default"))) int generals_credits_field_count()
{
	return g_field_count;
}

__attribute__((used, visibility("default"))) int generals_credits_settings_field_count()
{
	return g_settings_field_count;
}

__attribute__((used, visibility("default"))) int generals_credits_line_count()
{
	return g_line_count;
}

__attribute__((used, visibility("default"))) int generals_credits_error_count()
{
	return g_error_count;
}

__attribute__((used, visibility("default"))) int generals_credits_scroll_rate()
{
	return g_scroll_rate;
}

__attribute__((used, visibility("default"))) int generals_credits_scroll_rate_every_frames()
{
	return g_scroll_rate_every_frames;
}

__attribute__((used, visibility("default"))) int generals_credits_scroll_down()
{
	return g_scroll_down;
}

__attribute__((used, visibility("default"))) int generals_credits_title_color_r() { return g_title_color_r; }
__attribute__((used, visibility("default"))) int generals_credits_title_color_g() { return g_title_color_g; }
__attribute__((used, visibility("default"))) int generals_credits_title_color_b() { return g_title_color_b; }
__attribute__((used, visibility("default"))) int generals_credits_title_color_a() { return g_title_color_a; }
__attribute__((used, visibility("default"))) int generals_credits_minor_color_r() { return g_minor_color_r; }
__attribute__((used, visibility("default"))) int generals_credits_minor_color_g() { return g_minor_color_g; }
__attribute__((used, visibility("default"))) int generals_credits_minor_color_b() { return g_minor_color_b; }
__attribute__((used, visibility("default"))) int generals_credits_minor_color_a() { return g_minor_color_a; }
__attribute__((used, visibility("default"))) int generals_credits_normal_color_r() { return g_normal_color_r; }
__attribute__((used, visibility("default"))) int generals_credits_normal_color_g() { return g_normal_color_g; }
__attribute__((used, visibility("default"))) int generals_credits_normal_color_b() { return g_normal_color_b; }
__attribute__((used, visibility("default"))) int generals_credits_normal_color_a() { return g_normal_color_a; }

__attribute__((used, visibility("default"))) int generals_credits_style_count()
{
	return CREDIT_STYLE_COUNT;
}

__attribute__((used, visibility("default"))) int generals_credits_style_name_ptr(int index)
{
	return index >= 0 && index < CREDIT_STYLE_COUNT ? (int)CREDIT_STYLE_NAMES[index] : 0;
}

__attribute__((used, visibility("default"))) int generals_credits_style_name_size(int index)
{
	return index >= 0 && index < CREDIT_STYLE_COUNT ? string_length(CREDIT_STYLE_NAMES[index]) : -1;
}

#define LINE_GUARD(expr, fallback) (index >= 0 && index < g_line_total ? (expr) : (fallback))

__attribute__((used, visibility("default"))) int generals_credits_line_type(int index)
{
	return LINE_GUARD(g_lines[index].type, -1);
}

__attribute__((used, visibility("default"))) int generals_credits_line_style(int index)
{
	return LINE_GUARD(g_lines[index].style, -1);
}

__attribute__((used, visibility("default"))) int generals_credits_line_style_name_ptr(int index)
{
	if (index < 0 || index >= g_line_total) {
		return 0;
	}
	const int style = g_lines[index].style;
	return style >= 0 && style < CREDIT_STYLE_COUNT ? (int)CREDIT_STYLE_NAMES[style] : 0;
}

__attribute__((used, visibility("default"))) int generals_credits_line_style_name_size(int index)
{
	if (index < 0 || index >= g_line_total) {
		return -1;
	}
	const int style = g_lines[index].style;
	return style >= 0 && style < CREDIT_STYLE_COUNT ? string_length(CREDIT_STYLE_NAMES[style]) : 0;
}

__attribute__((used, visibility("default"))) int generals_credits_line_text_ptr(int index)
{
	return LINE_GUARD(string_field_ptr(g_lines[index].text), 0);
}

__attribute__((used, visibility("default"))) int generals_credits_line_text_size(int index)
{
	return LINE_GUARD(g_lines[index].text.size, -1);
}

__attribute__((used, visibility("default"))) int generals_credits_line_at(int index)
{
	return LINE_GUARD(g_lines[index].line, -1);
}

}
