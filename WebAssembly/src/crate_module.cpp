extern "C" {

static const int INPUT_CAPACITY = 1024 * 1024;
static const int MAX_TEMPLATES = 256;
static const int MAX_OBJECTS = 1024;
static const int NAME_CAPACITY = 256 * 1024;
static const int VETERANCY_COUNT = 4;

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

struct CrateTemplateRecord
{
	int nameOffset;
	int nameSize;
	int line;
	int fieldCount;
	int creationChanceX100;
	int veterancyLevel;
	StringField killedByType;
	StringField killerScience;
	int ownedByMaker;
	int firstObject;
	int objectCount;
};

struct CrateObjectRecord
{
	int templateIndex;
	int nameOffset;
	int nameSize;
	int chanceX100;
	int line;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_crate_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_crate_names[NAME_CAPACITY];

static CrateTemplateRecord g_generals_crate_templates[MAX_TEMPLATES];
static CrateObjectRecord g_generals_crate_objects[MAX_OBJECTS];
static int g_generals_crate_template_count = 0;
static int g_generals_crate_object_count = 0;
static int g_generals_crate_field_count = 0;
static int g_generals_crate_owned_by_maker_count = 0;
static int g_generals_crate_veterancy_condition_count = 0;
static int g_generals_crate_kindof_condition_count = 0;
static int g_generals_crate_science_condition_count = 0;
static int g_generals_crate_line_count = 0;
static int g_generals_crate_error_count = 0;
static int g_generals_crate_name_cursor = 0;

static const char *VETERANCY_NAMES[VETERANCY_COUNT] = {
	"REGULAR",
	"VETERAN",
	"ELITE",
	"HEROIC",
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
	if (valueSize < 0 || g_generals_crate_name_cursor + valueSize + 1 > NAME_CAPACITY) {
		return -1;
	}

	const int offset = g_generals_crate_name_cursor;
	for (int index = 0; index < valueSize; ++index) {
		g_generals_crate_names[g_generals_crate_name_cursor++] = value[index];
	}
	g_generals_crate_names[g_generals_crate_name_cursor++] = 0;
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
		++g_generals_crate_error_count;
		return;
	}

	field->offset = offset;
	field->size = size;
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
	int places = 0;
	if (cursor < end && data[cursor] == '.') {
		++cursor;
		while (cursor < end && data[cursor] >= '0' && data[cursor] <= '9') {
			if (places < 2) {
				fraction = fraction * 10 + (data[cursor] - '0');
				++places;
			}
			sawDigit = true;
			++cursor;
		}
	}

	while (places < 2) {
		fraction *= 10;
		++places;
	}

	if (!sawDigit) {
		return 0;
	}

	const int value = whole * 100 + fraction;
	*realX100 = negative ? -value : value;
	return 1;
}

static int parse_bool(const char *data, int start, int end)
{
	if (ascii_equal_ignore_case(data + start, end - start, "Yes") ||
		ascii_equal_ignore_case(data + start, end - start, "True") ||
		ascii_equal_ignore_case(data + start, end - start, "1")) {
		return 1;
	}

	return 0;
}

static int find_veterancy(const char *value, int valueSize)
{
	for (int index = 0; index < VETERANCY_COUNT; ++index) {
		if (ascii_equal_ignore_case(value, valueSize, VETERANCY_NAMES[index])) {
			return index;
		}
	}

	return -1;
}

static int start_template(const char *data, TokenRange name, int line)
{
	if (g_generals_crate_template_count >= MAX_TEMPLATES) {
		++g_generals_crate_error_count;
		return -1;
	}

	const int nameSize = name.end - name.start;
	const int nameOffset = store_string(data + name.start, nameSize);
	if (nameOffset < 0) {
		++g_generals_crate_error_count;
		return -1;
	}

	const int index = g_generals_crate_template_count++;
	CrateTemplateRecord *record = &g_generals_crate_templates[index];
	record->nameOffset = nameOffset;
	record->nameSize = nameSize;
	record->line = line;
	record->fieldCount = 0;
	record->creationChanceX100 = 0;
	record->veterancyLevel = -1;
	clear_string(&record->killedByType);
	clear_string(&record->killerScience);
	record->ownedByMaker = 0;
	record->firstObject = g_generals_crate_object_count;
	record->objectCount = 0;
	return index;
}

static void add_object(int templateIndex, const char *data, TokenRange name, int chanceX100, int line)
{
	if (g_generals_crate_object_count >= MAX_OBJECTS) {
		++g_generals_crate_error_count;
		return;
	}

	const int nameSize = name.end - name.start;
	const int nameOffset = store_string(data + name.start, nameSize);
	if (nameOffset < 0) {
		++g_generals_crate_error_count;
		return;
	}

	const int index = g_generals_crate_object_count++;
	CrateObjectRecord *record = &g_generals_crate_objects[index];
	record->templateIndex = templateIndex;
	record->nameOffset = nameOffset;
	record->nameSize = nameSize;
	record->chanceX100 = chanceX100;
	record->line = line;
	++g_generals_crate_templates[templateIndex].objectCount;
}

static void parse_assignment(int templateIndex, const char *data, int contentStart, int contentEnd, int line)
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

	if (keyStart >= keyEnd || valueStart >= valueEnd) {
		return;
	}

	CrateTemplateRecord *record = &g_generals_crate_templates[templateIndex];
	++record->fieldCount;
	++g_generals_crate_field_count;

	if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "CreationChance")) {
		int chance = 0;
		if (!parse_real_x100(data, valueStart, valueEnd, &chance)) {
			++g_generals_crate_error_count;
			return;
		}
		record->creationChanceX100 = chance;
		return;
	}

	if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "VeterancyLevel")) {
		TokenRange token;
		int cursor = valueStart;
		if (!next_token(data, &cursor, valueEnd, &token)) {
			++g_generals_crate_error_count;
			return;
		}
		const int veterancy = find_veterancy(data + token.start, token.end - token.start);
		if (veterancy < 0) {
			++g_generals_crate_error_count;
			return;
		}
		record->veterancyLevel = veterancy;
		++g_generals_crate_veterancy_condition_count;
		return;
	}

	if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "KilledByType")) {
		assign_string(&record->killedByType, data, valueStart, valueEnd);
		++g_generals_crate_kindof_condition_count;
		return;
	}

	if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "KillerScience")) {
		assign_string(&record->killerScience, data, valueStart, valueEnd);
		++g_generals_crate_science_condition_count;
		return;
	}

	if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "OwnedByMaker")) {
		record->ownedByMaker = parse_bool(data, valueStart, valueEnd);
		if (record->ownedByMaker) {
			++g_generals_crate_owned_by_maker_count;
		}
		return;
	}

	if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "CrateObject")) {
		TokenRange objectName;
		TokenRange chanceToken;
		int cursor = valueStart;
		if (!next_token(data, &cursor, valueEnd, &objectName) ||
			!next_token(data, &cursor, valueEnd, &chanceToken)) {
			++g_generals_crate_error_count;
			return;
		}

		int chance = 0;
		if (!parse_real_x100(data, chanceToken.start, chanceToken.end, &chance)) {
			++g_generals_crate_error_count;
			return;
		}
		add_object(templateIndex, data, objectName, chance, line);
		return;
	}
}

static void reset_parser()
{
	g_generals_crate_template_count = 0;
	g_generals_crate_object_count = 0;
	g_generals_crate_field_count = 0;
	g_generals_crate_owned_by_maker_count = 0;
	g_generals_crate_veterancy_condition_count = 0;
	g_generals_crate_kindof_condition_count = 0;
	g_generals_crate_science_condition_count = 0;
	g_generals_crate_line_count = 0;
	g_generals_crate_error_count = 0;
	g_generals_crate_name_cursor = 0;
}

__attribute__((used, visibility("default"))) unsigned int generals_crate_input_ptr()
{
	return (unsigned int)g_generals_crate_input;
}

__attribute__((used, visibility("default"))) int generals_crate_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_crate_parse(int size)
{
	reset_parser();
	if (size < 0 || size > INPUT_CAPACITY) {
		g_generals_crate_error_count = 1;
		return -1;
	}

	const char *data = (const char *)g_generals_crate_input;
	int lineStart = 0;
	int line = 1;
	int activeTemplate = -1;

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
				if (token_equals(data, first, "CrateData")) {
					TokenRange name;
					if (next_token(data, &tokenCursor, contentEnd, &name)) {
						activeTemplate = start_template(data, name, line);
					} else {
						++g_generals_crate_error_count;
					}
				} else if (token_equals(data, first, "End")) {
					activeTemplate = -1;
				} else if (activeTemplate >= 0) {
					parse_assignment(activeTemplate, data, contentStart, contentEnd, line);
				}
			}
		}

		lineStart = cursor + 1;
		++line;
	}

	g_generals_crate_line_count = line - 1;
	return g_generals_crate_error_count == 0 ? g_generals_crate_template_count : -1;
}

__attribute__((used, visibility("default"))) int generals_crate_template_count()
{
	return g_generals_crate_template_count;
}

__attribute__((used, visibility("default"))) int generals_crate_object_count()
{
	return g_generals_crate_object_count;
}

__attribute__((used, visibility("default"))) int generals_crate_field_count()
{
	return g_generals_crate_field_count;
}

__attribute__((used, visibility("default"))) int generals_crate_owned_by_maker_count()
{
	return g_generals_crate_owned_by_maker_count;
}

__attribute__((used, visibility("default"))) int generals_crate_veterancy_condition_count()
{
	return g_generals_crate_veterancy_condition_count;
}

__attribute__((used, visibility("default"))) int generals_crate_kindof_condition_count()
{
	return g_generals_crate_kindof_condition_count;
}

__attribute__((used, visibility("default"))) int generals_crate_science_condition_count()
{
	return g_generals_crate_science_condition_count;
}

__attribute__((used, visibility("default"))) int generals_crate_line_count()
{
	return g_generals_crate_line_count;
}

__attribute__((used, visibility("default"))) int generals_crate_error_count()
{
	return g_generals_crate_error_count;
}

__attribute__((used, visibility("default"))) int generals_crate_veterancy_name_ptr(int index)
{
	if (index < 0 || index >= VETERANCY_COUNT) {
		return 0;
	}

	return (int)VETERANCY_NAMES[index];
}

__attribute__((used, visibility("default"))) int generals_crate_veterancy_name_size(int index)
{
	if (index < 0 || index >= VETERANCY_COUNT) {
		return -1;
	}

	return string_length(VETERANCY_NAMES[index]);
}

__attribute__((used, visibility("default"))) int generals_crate_template_name_ptr(int index)
{
	if (index < 0 || index >= g_generals_crate_template_count) {
		return 0;
	}

	return (int)(g_generals_crate_names + g_generals_crate_templates[index].nameOffset);
}

__attribute__((used, visibility("default"))) int generals_crate_template_name_size(int index)
{
	if (index < 0 || index >= g_generals_crate_template_count) {
		return -1;
	}

	return g_generals_crate_templates[index].nameSize;
}

__attribute__((used, visibility("default"))) int generals_crate_template_line(int index)
{
	if (index < 0 || index >= g_generals_crate_template_count) {
		return -1;
	}

	return g_generals_crate_templates[index].line;
}

__attribute__((used, visibility("default"))) int generals_crate_template_field_count_at(int index)
{
	if (index < 0 || index >= g_generals_crate_template_count) {
		return -1;
	}

	return g_generals_crate_templates[index].fieldCount;
}

__attribute__((used, visibility("default"))) int generals_crate_template_creation_chance_x100(int index)
{
	if (index < 0 || index >= g_generals_crate_template_count) {
		return -1;
	}

	return g_generals_crate_templates[index].creationChanceX100;
}

__attribute__((used, visibility("default"))) int generals_crate_template_veterancy_level(int index)
{
	if (index < 0 || index >= g_generals_crate_template_count) {
		return -1;
	}

	return g_generals_crate_templates[index].veterancyLevel;
}

__attribute__((used, visibility("default"))) int generals_crate_template_killed_by_type_ptr(int index)
{
	if (index < 0 || index >= g_generals_crate_template_count || g_generals_crate_templates[index].killedByType.offset < 0) {
		return 0;
	}

	return (int)(g_generals_crate_names + g_generals_crate_templates[index].killedByType.offset);
}

__attribute__((used, visibility("default"))) int generals_crate_template_killed_by_type_size(int index)
{
	if (index < 0 || index >= g_generals_crate_template_count) {
		return -1;
	}

	return g_generals_crate_templates[index].killedByType.size;
}

__attribute__((used, visibility("default"))) int generals_crate_template_killer_science_ptr(int index)
{
	if (index < 0 || index >= g_generals_crate_template_count || g_generals_crate_templates[index].killerScience.offset < 0) {
		return 0;
	}

	return (int)(g_generals_crate_names + g_generals_crate_templates[index].killerScience.offset);
}

__attribute__((used, visibility("default"))) int generals_crate_template_killer_science_size(int index)
{
	if (index < 0 || index >= g_generals_crate_template_count) {
		return -1;
	}

	return g_generals_crate_templates[index].killerScience.size;
}

__attribute__((used, visibility("default"))) int generals_crate_template_owned_by_maker(int index)
{
	if (index < 0 || index >= g_generals_crate_template_count) {
		return -1;
	}

	return g_generals_crate_templates[index].ownedByMaker;
}

__attribute__((used, visibility("default"))) int generals_crate_template_first_object(int index)
{
	if (index < 0 || index >= g_generals_crate_template_count) {
		return -1;
	}

	return g_generals_crate_templates[index].firstObject;
}

__attribute__((used, visibility("default"))) int generals_crate_template_object_count(int index)
{
	if (index < 0 || index >= g_generals_crate_template_count) {
		return -1;
	}

	return g_generals_crate_templates[index].objectCount;
}

__attribute__((used, visibility("default"))) int generals_crate_object_template_index(int index)
{
	if (index < 0 || index >= g_generals_crate_object_count) {
		return -1;
	}

	return g_generals_crate_objects[index].templateIndex;
}

__attribute__((used, visibility("default"))) int generals_crate_object_name_ptr(int index)
{
	if (index < 0 || index >= g_generals_crate_object_count) {
		return 0;
	}

	return (int)(g_generals_crate_names + g_generals_crate_objects[index].nameOffset);
}

__attribute__((used, visibility("default"))) int generals_crate_object_name_size(int index)
{
	if (index < 0 || index >= g_generals_crate_object_count) {
		return -1;
	}

	return g_generals_crate_objects[index].nameSize;
}

__attribute__((used, visibility("default"))) int generals_crate_object_chance_x100(int index)
{
	if (index < 0 || index >= g_generals_crate_object_count) {
		return -1;
	}

	return g_generals_crate_objects[index].chanceX100;
}

__attribute__((used, visibility("default"))) int generals_crate_object_line(int index)
{
	if (index < 0 || index >= g_generals_crate_object_count) {
		return -1;
	}

	return g_generals_crate_objects[index].line;
}

}
