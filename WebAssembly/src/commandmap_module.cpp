extern "C" {

// Parses CommandMap.INI key-binding blocks (the MetaMap). Each CommandMap block
// names a meta message and binds it to a Key, Transition, Modifiers, UseableIn
// flag string, optional Category, and translated Description / DisplayName
// labels, following TheMetaMapFieldParseTable in
// GeneralsMD/Code/GameEngine/Source/GameClient/MessageStream/MetaEvent.cpp.
// Lookup-list / bit-string values are stored verbatim as strings so the heavy
// KeyNames / TransitionNames / ModifierNames tables do not need to be embedded.
// CommandMap.INI uses the whitespace/'='-separated field style.

static const int INPUT_CAPACITY = 64 * 1024;
static const int NAME_CAPACITY = 128 * 1024;
static const int MAX_COMMANDS = 1024;

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

struct CommandRecord
{
	StringField name;
	StringField key;
	StringField transition;
	StringField modifiers;
	StringField useableIn;
	StringField category;
	StringField description;
	StringField displayName;
	int line;
	int fieldCount;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_commandmap_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_commandmap_names[NAME_CAPACITY];

static CommandRecord g_commands[MAX_COMMANDS];
static int g_command_count = 0;
static int g_field_count = 0;
static int g_line_count = 0;
static int g_error_count = 0;
static int g_name_cursor = 0;
static int g_current_command = -1;

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
		g_generals_commandmap_names[g_name_cursor++] = value[index];
	}
	g_generals_commandmap_names[g_name_cursor++] = 0;
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

// Stores the first whitespace/'='-delimited token of the value range.
static void assign_token_string(StringField *field, const char *data, int start, int end)
{
	TokenRange token;
	int cursor = start;
	if (!next_token(data, &cursor, end, &token)) {
		clear_string(field);
		return;
	}

	store_field(field, data, token.start, token.end);
}

// Stores the whole value range (skipping a leading '=' and surrounding space),
// used for multi-token fields such as the UseableIn bit string.
static void assign_rest_string(StringField *field, const char *data, int start, int end)
{
	int cursor = start;
	while (cursor < end && is_space(data[cursor])) {
		++cursor;
	}
	if (cursor < end && data[cursor] == '=') {
		++cursor;
		while (cursor < end && is_space(data[cursor])) {
			++cursor;
		}
	}
	int valueEnd = end;
	trim_range(data, &cursor, &valueEnd);
	store_field(field, data, cursor, valueEnd);
}

static void reset_state()
{
	g_command_count = 0;
	g_field_count = 0;
	g_line_count = 0;
	g_error_count = 0;
	g_name_cursor = 0;
	g_current_command = -1;
}

static void create_command(const char *data, int nameStart, int nameEnd, int line)
{
	if (g_command_count >= MAX_COMMANDS) {
		++g_error_count;
		return;
	}

	CommandRecord *command = &g_commands[g_command_count];
	clear_string(&command->name);
	assign_token_string(&command->name, data, nameStart, nameEnd);
	clear_string(&command->key);
	clear_string(&command->transition);
	clear_string(&command->modifiers);
	clear_string(&command->useableIn);
	clear_string(&command->category);
	clear_string(&command->description);
	clear_string(&command->displayName);
	command->line = line;
	command->fieldCount = 0;
	g_current_command = g_command_count++;
}

static void parse_command_field(const char *data, TokenRange field, int valueStart, int valueEnd)
{
	CommandRecord *command = &g_commands[g_current_command];
	int parsed = 1;
	if (token_equals(data, field, "Key")) {
		assign_token_string(&command->key, data, valueStart, valueEnd);
	} else if (token_equals(data, field, "Transition")) {
		assign_token_string(&command->transition, data, valueStart, valueEnd);
	} else if (token_equals(data, field, "Modifiers")) {
		assign_token_string(&command->modifiers, data, valueStart, valueEnd);
	} else if (token_equals(data, field, "UseableIn")) {
		assign_rest_string(&command->useableIn, data, valueStart, valueEnd);
	} else if (token_equals(data, field, "Category")) {
		assign_token_string(&command->category, data, valueStart, valueEnd);
	} else if (token_equals(data, field, "Description")) {
		assign_token_string(&command->description, data, valueStart, valueEnd);
	} else if (token_equals(data, field, "DisplayName")) {
		assign_token_string(&command->displayName, data, valueStart, valueEnd);
	} else {
		parsed = 0;
	}

	if (parsed) {
		command->fieldCount += 1;
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
		g_current_command = -1;
		return;
	}

	if (token_equals(data, first, "CommandMap")) {
		create_command(data, valueStart, end, line);
		return;
	}

	if (g_current_command >= 0) {
		parse_command_field(data, first, valueStart, end);
	}
}

static int string_field_ptr(StringField field)
{
	return field.offset >= 0 ? (int)(g_generals_commandmap_names + field.offset) : 0;
}

__attribute__((used, visibility("default"))) int generals_commandmap_input_ptr()
{
	return (int)g_generals_commandmap_input;
}

__attribute__((used, visibility("default"))) int generals_commandmap_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_commandmap_parse(int inputSize)
{
	reset_state();

	if (inputSize < 0 || inputSize > INPUT_CAPACITY) {
		g_error_count = 1;
		return -1;
	}

	const char *data = (const char *)g_generals_commandmap_input;
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

	return g_command_count;
}

__attribute__((used, visibility("default"))) int generals_commandmap_count()
{
	return g_command_count;
}

__attribute__((used, visibility("default"))) int generals_commandmap_field_count()
{
	return g_field_count;
}

__attribute__((used, visibility("default"))) int generals_commandmap_line_count()
{
	return g_line_count;
}

__attribute__((used, visibility("default"))) int generals_commandmap_error_count()
{
	return g_error_count;
}

#define COMMAND_GUARD(expr, fallback) (index >= 0 && index < g_command_count ? (expr) : (fallback))

__attribute__((used, visibility("default"))) int generals_commandmap_name_ptr(int index)
{
	return COMMAND_GUARD(string_field_ptr(g_commands[index].name), 0);
}

__attribute__((used, visibility("default"))) int generals_commandmap_name_size(int index)
{
	return COMMAND_GUARD(g_commands[index].name.size, -1);
}

__attribute__((used, visibility("default"))) int generals_commandmap_key_ptr(int index)
{
	return COMMAND_GUARD(string_field_ptr(g_commands[index].key), 0);
}

__attribute__((used, visibility("default"))) int generals_commandmap_key_size(int index)
{
	return COMMAND_GUARD(g_commands[index].key.size, -1);
}

__attribute__((used, visibility("default"))) int generals_commandmap_transition_ptr(int index)
{
	return COMMAND_GUARD(string_field_ptr(g_commands[index].transition), 0);
}

__attribute__((used, visibility("default"))) int generals_commandmap_transition_size(int index)
{
	return COMMAND_GUARD(g_commands[index].transition.size, -1);
}

__attribute__((used, visibility("default"))) int generals_commandmap_modifiers_ptr(int index)
{
	return COMMAND_GUARD(string_field_ptr(g_commands[index].modifiers), 0);
}

__attribute__((used, visibility("default"))) int generals_commandmap_modifiers_size(int index)
{
	return COMMAND_GUARD(g_commands[index].modifiers.size, -1);
}

__attribute__((used, visibility("default"))) int generals_commandmap_useable_in_ptr(int index)
{
	return COMMAND_GUARD(string_field_ptr(g_commands[index].useableIn), 0);
}

__attribute__((used, visibility("default"))) int generals_commandmap_useable_in_size(int index)
{
	return COMMAND_GUARD(g_commands[index].useableIn.size, -1);
}

__attribute__((used, visibility("default"))) int generals_commandmap_category_ptr(int index)
{
	return COMMAND_GUARD(string_field_ptr(g_commands[index].category), 0);
}

__attribute__((used, visibility("default"))) int generals_commandmap_category_size(int index)
{
	return COMMAND_GUARD(g_commands[index].category.size, -1);
}

__attribute__((used, visibility("default"))) int generals_commandmap_description_ptr(int index)
{
	return COMMAND_GUARD(string_field_ptr(g_commands[index].description), 0);
}

__attribute__((used, visibility("default"))) int generals_commandmap_description_size(int index)
{
	return COMMAND_GUARD(g_commands[index].description.size, -1);
}

__attribute__((used, visibility("default"))) int generals_commandmap_display_name_ptr(int index)
{
	return COMMAND_GUARD(string_field_ptr(g_commands[index].displayName), 0);
}

__attribute__((used, visibility("default"))) int generals_commandmap_display_name_size(int index)
{
	return COMMAND_GUARD(g_commands[index].displayName.size, -1);
}

__attribute__((used, visibility("default"))) int generals_commandmap_line(int index)
{
	return COMMAND_GUARD(g_commands[index].line, -1);
}

__attribute__((used, visibility("default"))) int generals_commandmap_field_count_at(int index)
{
	return COMMAND_GUARD(g_commands[index].fieldCount, -1);
}

}
