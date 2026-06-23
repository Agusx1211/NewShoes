extern "C" {

static const int INPUT_CAPACITY = 2 * 1024 * 1024;
static const int MAX_LISTS = 2048;
static const int MAX_NUGGETS = 4096;
static const int NAME_CAPACITY = 2 * 1024 * 1024;
static const int FX_NUGGET_TYPE_COUNT = 8;

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

struct FXListRecord
{
	int nameOffset;
	int nameSize;
	int line;
	int firstNugget;
	int nuggetCount;
};

struct FXNuggetRecord
{
	int listIndex;
	int type;
	int line;
	int fieldCount;
	int targetOffset;
	int targetSize;
	int secondaryOffset;
	int secondarySize;
	int count;
	int radiusX100;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_fxlist_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_fxlist_names[NAME_CAPACITY];

static FXListRecord g_generals_fxlist_lists[MAX_LISTS];
static FXNuggetRecord g_generals_fxlist_nuggets[MAX_NUGGETS];
static int g_generals_fxlist_list_count = 0;
static int g_generals_fxlist_nugget_count = 0;
static int g_generals_fxlist_field_count = 0;
static int g_generals_fxlist_line_count = 0;
static int g_generals_fxlist_error_count = 0;
static int g_generals_fxlist_name_cursor = 0;
static int g_generals_fxlist_type_counts[FX_NUGGET_TYPE_COUNT];

static const char *FX_NUGGET_TYPE_NAMES[FX_NUGGET_TYPE_COUNT] = {
	"Sound",
	"RayEffect",
	"Tracer",
	"LightPulse",
	"ViewShake",
	"TerrainScorch",
	"ParticleSystem",
	"FXListAtBonePos",
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
	if (valueSize < 0 || g_generals_fxlist_name_cursor + valueSize + 1 > NAME_CAPACITY) {
		return -1;
	}

	const int offset = g_generals_fxlist_name_cursor;
	for (int index = 0; index < valueSize; ++index) {
		g_generals_fxlist_names[g_generals_fxlist_name_cursor++] = value[index];
	}
	g_generals_fxlist_names[g_generals_fxlist_name_cursor++] = 0;
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
		++g_generals_fxlist_error_count;
		return;
	}

	field->offset = offset;
	field->size = size;
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

	*realX100 = negative ? -(whole * 100 + fraction) : whole * 100 + fraction;
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

static int find_nugget_type(const char *data, TokenRange token)
{
	for (int index = 0; index < FX_NUGGET_TYPE_COUNT; ++index) {
		if (ascii_equal_ignore_case(data + token.start, token.end - token.start, FX_NUGGET_TYPE_NAMES[index])) {
			return index;
		}
	}

	return -1;
}

static void set_string_field(int *offset, int *size, const char *data, int start, int end)
{
	StringField field;
	assign_string(&field, data, start, end);
	*offset = field.offset;
	*size = field.size;
}

static int start_list(const char *data, TokenRange name, int line)
{
	if (g_generals_fxlist_list_count >= MAX_LISTS) {
		++g_generals_fxlist_error_count;
		return -1;
	}

	const int nameSize = name.end - name.start;
	const int nameOffset = store_string(data + name.start, nameSize);
	if (nameOffset < 0) {
		++g_generals_fxlist_error_count;
		return -1;
	}

	const int listIndex = g_generals_fxlist_list_count++;
	FXListRecord *record = &g_generals_fxlist_lists[listIndex];
	record->nameOffset = nameOffset;
	record->nameSize = nameSize;
	record->line = line;
	record->firstNugget = g_generals_fxlist_nugget_count;
	record->nuggetCount = 0;
	return listIndex;
}

static int start_nugget(int listIndex, int type, int line)
{
	if (listIndex < 0 || listIndex >= g_generals_fxlist_list_count || g_generals_fxlist_nugget_count >= MAX_NUGGETS) {
		++g_generals_fxlist_error_count;
		return -1;
	}

	const int nuggetIndex = g_generals_fxlist_nugget_count++;
	FXNuggetRecord *record = &g_generals_fxlist_nuggets[nuggetIndex];
	record->listIndex = listIndex;
	record->type = type;
	record->line = line;
	record->fieldCount = 0;
	record->targetOffset = -1;
	record->targetSize = 0;
	record->secondaryOffset = -1;
	record->secondarySize = 0;
	record->count = 1;
	record->radiusX100 = 0;

	++g_generals_fxlist_lists[listIndex].nuggetCount;
	++g_generals_fxlist_type_counts[type];
	return nuggetIndex;
}

static void parse_property(int nuggetIndex, const char *data, int keyStart, int keyEnd, int valueStart, int valueEnd)
{
	if (nuggetIndex < 0 || nuggetIndex >= g_generals_fxlist_nugget_count) {
		++g_generals_fxlist_error_count;
		return;
	}

	FXNuggetRecord *record = &g_generals_fxlist_nuggets[nuggetIndex];
	++record->fieldCount;
	++g_generals_fxlist_field_count;

	if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Name") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "TracerName") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Type") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "FX")) {
		if (record->targetOffset < 0) {
			set_string_field(&record->targetOffset, &record->targetSize, data, valueStart, valueEnd);
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "BoneName")) {
		if (record->secondaryOffset < 0) {
			set_string_field(&record->secondaryOffset, &record->secondarySize, data, valueStart, valueEnd);
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Count")) {
		if (!parse_first_int(data, valueStart, valueEnd, &record->count)) {
			++g_generals_fxlist_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Radius")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->radiusX100)) {
			++g_generals_fxlist_error_count;
		}
	}
}

static void parse_assignment(int nuggetIndex, const char *data, int contentStart, int contentEnd)
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

	parse_property(nuggetIndex, data, keyStart, keyEnd, valueStart, valueEnd);
}

static void reset_parser()
{
	g_generals_fxlist_list_count = 0;
	g_generals_fxlist_nugget_count = 0;
	g_generals_fxlist_field_count = 0;
	g_generals_fxlist_line_count = 0;
	g_generals_fxlist_error_count = 0;
	g_generals_fxlist_name_cursor = 0;
	for (int index = 0; index < FX_NUGGET_TYPE_COUNT; ++index) {
		g_generals_fxlist_type_counts[index] = 0;
	}
}

__attribute__((used, visibility("default"))) unsigned int generals_fxlist_input_ptr()
{
	return (unsigned int)g_generals_fxlist_input;
}

__attribute__((used, visibility("default"))) int generals_fxlist_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_fxlist_parse(int size)
{
	reset_parser();
	if (size < 0 || size > INPUT_CAPACITY) {
		g_generals_fxlist_error_count = 1;
		return -1;
	}

	const char *data = (const char *)g_generals_fxlist_input;
	int lineStart = 0;
	int line = 1;
	int activeList = -1;
	int activeNugget = -1;

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
				if (token_equals(data, first, "FXList")) {
					TokenRange name;
					if (next_token(data, &tokenCursor, contentEnd, &name)) {
						activeList = start_list(data, name, line);
						activeNugget = -1;
					} else {
						++g_generals_fxlist_error_count;
					}
				} else if (token_equals(data, first, "End")) {
					if (activeNugget >= 0) {
						activeNugget = -1;
					} else {
						activeList = -1;
					}
				} else if (activeList >= 0 && activeNugget < 0) {
					const int nuggetType = find_nugget_type(data, first);
					if (nuggetType >= 0) {
						activeNugget = start_nugget(activeList, nuggetType, line);
					}
				} else if (activeNugget >= 0 && find_equals(data, contentStart, contentEnd) >= 0) {
					parse_assignment(activeNugget, data, contentStart, contentEnd);
				}
			}
		}

		lineStart = cursor + 1;
		++line;
	}

	g_generals_fxlist_line_count = line - 1;
	return g_generals_fxlist_error_count == 0 ? g_generals_fxlist_list_count : -1;
}

__attribute__((used, visibility("default"))) int generals_fxlist_list_count()
{
	return g_generals_fxlist_list_count;
}

__attribute__((used, visibility("default"))) int generals_fxlist_nugget_count()
{
	return g_generals_fxlist_nugget_count;
}

__attribute__((used, visibility("default"))) int generals_fxlist_field_count()
{
	return g_generals_fxlist_field_count;
}

__attribute__((used, visibility("default"))) int generals_fxlist_line_count()
{
	return g_generals_fxlist_line_count;
}

__attribute__((used, visibility("default"))) int generals_fxlist_error_count()
{
	return g_generals_fxlist_error_count;
}

__attribute__((used, visibility("default"))) int generals_fxlist_type_count(int type)
{
	if (type < 0 || type >= FX_NUGGET_TYPE_COUNT) {
		return -1;
	}

	return g_generals_fxlist_type_counts[type];
}

__attribute__((used, visibility("default"))) int generals_fxlist_type_name_ptr(int type)
{
	if (type < 0 || type >= FX_NUGGET_TYPE_COUNT) {
		return 0;
	}

	return (int)FX_NUGGET_TYPE_NAMES[type];
}

__attribute__((used, visibility("default"))) int generals_fxlist_type_name_size(int type)
{
	if (type < 0 || type >= FX_NUGGET_TYPE_COUNT) {
		return -1;
	}

	return string_length(FX_NUGGET_TYPE_NAMES[type]);
}

__attribute__((used, visibility("default"))) int generals_fxlist_list_name_ptr(int index)
{
	if (index < 0 || index >= g_generals_fxlist_list_count) {
		return 0;
	}

	return (int)(g_generals_fxlist_names + g_generals_fxlist_lists[index].nameOffset);
}

__attribute__((used, visibility("default"))) int generals_fxlist_list_name_size(int index)
{
	if (index < 0 || index >= g_generals_fxlist_list_count) {
		return -1;
	}

	return g_generals_fxlist_lists[index].nameSize;
}

__attribute__((used, visibility("default"))) int generals_fxlist_list_line(int index)
{
	if (index < 0 || index >= g_generals_fxlist_list_count) {
		return -1;
	}

	return g_generals_fxlist_lists[index].line;
}

__attribute__((used, visibility("default"))) int generals_fxlist_list_first_nugget(int index)
{
	if (index < 0 || index >= g_generals_fxlist_list_count) {
		return -1;
	}

	return g_generals_fxlist_lists[index].firstNugget;
}

__attribute__((used, visibility("default"))) int generals_fxlist_list_nugget_count(int index)
{
	if (index < 0 || index >= g_generals_fxlist_list_count) {
		return -1;
	}

	return g_generals_fxlist_lists[index].nuggetCount;
}

__attribute__((used, visibility("default"))) int generals_fxlist_nugget_list_index(int index)
{
	if (index < 0 || index >= g_generals_fxlist_nugget_count) {
		return -1;
	}

	return g_generals_fxlist_nuggets[index].listIndex;
}

__attribute__((used, visibility("default"))) int generals_fxlist_nugget_type(int index)
{
	if (index < 0 || index >= g_generals_fxlist_nugget_count) {
		return -1;
	}

	return g_generals_fxlist_nuggets[index].type;
}

__attribute__((used, visibility("default"))) int generals_fxlist_nugget_line(int index)
{
	if (index < 0 || index >= g_generals_fxlist_nugget_count) {
		return -1;
	}

	return g_generals_fxlist_nuggets[index].line;
}

__attribute__((used, visibility("default"))) int generals_fxlist_nugget_field_count(int index)
{
	if (index < 0 || index >= g_generals_fxlist_nugget_count) {
		return -1;
	}

	return g_generals_fxlist_nuggets[index].fieldCount;
}

__attribute__((used, visibility("default"))) int generals_fxlist_nugget_target_ptr(int index)
{
	if (index < 0 || index >= g_generals_fxlist_nugget_count || g_generals_fxlist_nuggets[index].targetOffset < 0) {
		return 0;
	}

	return (int)(g_generals_fxlist_names + g_generals_fxlist_nuggets[index].targetOffset);
}

__attribute__((used, visibility("default"))) int generals_fxlist_nugget_target_size(int index)
{
	if (index < 0 || index >= g_generals_fxlist_nugget_count) {
		return -1;
	}

	return g_generals_fxlist_nuggets[index].targetSize;
}

__attribute__((used, visibility("default"))) int generals_fxlist_nugget_secondary_ptr(int index)
{
	if (index < 0 || index >= g_generals_fxlist_nugget_count || g_generals_fxlist_nuggets[index].secondaryOffset < 0) {
		return 0;
	}

	return (int)(g_generals_fxlist_names + g_generals_fxlist_nuggets[index].secondaryOffset);
}

__attribute__((used, visibility("default"))) int generals_fxlist_nugget_secondary_size(int index)
{
	if (index < 0 || index >= g_generals_fxlist_nugget_count) {
		return -1;
	}

	return g_generals_fxlist_nuggets[index].secondarySize;
}

__attribute__((used, visibility("default"))) int generals_fxlist_nugget_count_value(int index)
{
	if (index < 0 || index >= g_generals_fxlist_nugget_count) {
		return -1;
	}

	return g_generals_fxlist_nuggets[index].count;
}

__attribute__((used, visibility("default"))) int generals_fxlist_nugget_radius_x100(int index)
{
	if (index < 0 || index >= g_generals_fxlist_nugget_count) {
		return -1;
	}

	return g_generals_fxlist_nuggets[index].radiusX100;
}

}
