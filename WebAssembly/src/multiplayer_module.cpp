extern "C" {

static const int INPUT_CAPACITY = 128 * 1024;
static const int NAME_CAPACITY = 64 * 1024;
static const int MAX_CHAT_COLORS = 32;
static const int MAX_MULTIPLAYER_COLORS = 32;
static const int MAX_MONEY_CHOICES = 16;

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

struct ColorValue
{
	int r;
	int g;
	int b;
};

struct ChatColorRecord
{
	StringField name;
	ColorValue color;
	int line;
};

struct MultiplayerColorRecord
{
	StringField name;
	StringField tooltipName;
	ColorValue color;
	ColorValue nightColor;
	int line;
	int fieldCount;
};

struct MoneyChoiceRecord
{
	int value;
	int isDefault;
	int line;
	int fieldCount;
};

enum BlockKind
{
	BLOCK_NONE = 0,
	BLOCK_CHAT_COLORS = 1,
	BLOCK_SETTINGS = 2,
	BLOCK_MULTIPLAYER_COLOR = 3,
	BLOCK_MONEY_CHOICE = 4,
};

__attribute__((used, visibility("default"))) unsigned char g_generals_multiplayer_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_multiplayer_names[NAME_CAPACITY];

static ChatColorRecord g_chat_colors[MAX_CHAT_COLORS];
static MultiplayerColorRecord g_multiplayer_colors[MAX_MULTIPLAYER_COLORS];
static MoneyChoiceRecord g_money_choices[MAX_MONEY_CHOICES];

static int g_parsed_count = 0;
static int g_field_count = 0;
static int g_line_count = 0;
static int g_error_count = 0;
static int g_name_cursor = 0;
static int g_current_block = BLOCK_NONE;
static int g_current_color = -1;
static int g_current_money = -1;

static int g_chat_color_count = 0;
static int g_multiplayer_color_count = 0;
static int g_money_choice_count = 0;

static int g_settings_field_count = 0;
static int g_start_countdown_timer = 0;
static int g_max_beacons_per_player = 3;
static int g_use_shroud = 1;
static int g_show_random_player_template = 1;
static int g_show_random_start_pos = 1;
static int g_show_random_color = 1;
static int g_default_starting_money = 0;

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
		g_generals_multiplayer_names[g_name_cursor++] = value[index];
	}
	g_generals_multiplayer_names[g_name_cursor++] = 0;
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

static int parse_int(const char *data, int start, int end)
{
	trim_range(data, &start, &end);
	int sign = 1;
	if (start < end && data[start] == '-') {
		sign = -1;
		++start;
	}

	int value = 0;
	while (start < end && data[start] >= '0' && data[start] <= '9') {
		value = value * 10 + (data[start] - '0');
		++start;
	}

	return value * sign;
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

static int parse_labeled_component(const char *data, int *cursor, int end)
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

static ColorValue parse_rgb(const char *data, int start, int end)
{
	ColorValue color;
	color.r = 0;
	color.g = 0;
	color.b = 0;

	for (int cursor = start; cursor < end; ++cursor) {
		const char label = lower_ascii(data[cursor]);
		if ((label == 'r' || label == 'g' || label == 'b') && cursor + 1 < end && data[cursor + 1] == ':') {
			++cursor;
			const int value = parse_labeled_component(data, &cursor, end);
			if (label == 'r') {
				color.r = value;
			} else if (label == 'g') {
				color.g = value;
			} else {
				color.b = value;
			}
		}
	}

	return color;
}

static int parse_bool(const char *data, int start, int end)
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

static bool is_chat_color_field(const char *data, int start, int end)
{
	static const char *fields[] = {
		"Default",
		"CurrentRoom",
		"ChatRoom",
		"Game",
		"GameFull",
		"GameCRCMismatch",
		"PlayerNormal",
		"PlayerOwner",
		"PlayerBuddy",
		"PlayerSelf",
		"PlayerIgnored",
		"ChatNormal",
		"ChatEmote",
		"ChatOwner",
		"ChatOwnerEmote",
		"ChatPriv",
		"ChatPrivEmote",
		"ChatPrivOwner",
		"ChatPrivOwnerEmote",
		"ChatBuddy",
		"ChatSelf",
		"AcceptTrue",
		"AcceptFalse",
		"MapSelected",
		"MapUnselected",
		"MOTD",
		"MOTDHeading",
	};

	for (int index = 0; index < 27; ++index) {
		if (string_equals(data, start, end, fields[index])) {
			return true;
		}
	}

	return false;
}

static void init_chat_color(ChatColorRecord *record)
{
	clear_string(&record->name);
	record->color.r = 0;
	record->color.g = 0;
	record->color.b = 0;
	record->line = -1;
}

static void init_multiplayer_color(MultiplayerColorRecord *record)
{
	clear_string(&record->name);
	clear_string(&record->tooltipName);
	record->color.r = 0;
	record->color.g = 0;
	record->color.b = 0;
	record->nightColor.r = 0;
	record->nightColor.g = 0;
	record->nightColor.b = 0;
	record->line = -1;
	record->fieldCount = 0;
}

static void init_money_choice(MoneyChoiceRecord *record)
{
	record->value = 0;
	record->isDefault = 0;
	record->line = -1;
	record->fieldCount = 0;
}

static void reset_state()
{
	g_parsed_count = 0;
	g_field_count = 0;
	g_line_count = 0;
	g_error_count = 0;
	g_name_cursor = 0;
	g_current_block = BLOCK_NONE;
	g_current_color = -1;
	g_current_money = -1;
	g_chat_color_count = 0;
	g_multiplayer_color_count = 0;
	g_money_choice_count = 0;
	g_settings_field_count = 0;
	g_start_countdown_timer = 0;
	g_max_beacons_per_player = 3;
	g_use_shroud = 1;
	g_show_random_player_template = 1;
	g_show_random_start_pos = 1;
	g_show_random_color = 1;
	g_default_starting_money = 0;
}

static void start_block(int blockKind)
{
	g_current_block = blockKind;
	g_current_color = -1;
	g_current_money = -1;
	++g_parsed_count;
}

static void start_multiplayer_color(const char *data, int nameStart, int nameEnd, int line)
{
	if (g_multiplayer_color_count >= MAX_MULTIPLAYER_COLORS) {
		++g_error_count;
		g_current_block = BLOCK_NONE;
		return;
	}

	MultiplayerColorRecord *record = &g_multiplayer_colors[g_multiplayer_color_count];
	init_multiplayer_color(record);
	assign_string(&record->name, data, nameStart, nameEnd);
	record->line = line;
	g_current_color = g_multiplayer_color_count++;
	g_current_money = -1;
	g_current_block = BLOCK_MULTIPLAYER_COLOR;
	++g_parsed_count;
}

static void start_money_choice(int line)
{
	if (g_money_choice_count >= MAX_MONEY_CHOICES) {
		++g_error_count;
		g_current_block = BLOCK_NONE;
		return;
	}

	MoneyChoiceRecord *record = &g_money_choices[g_money_choice_count];
	init_money_choice(record);
	record->line = line;
	g_current_money = g_money_choice_count++;
	g_current_color = -1;
	g_current_block = BLOCK_MONEY_CHOICE;
	++g_parsed_count;
}

static void parse_block_line(const char *data, int start, int end, int line)
{
	TokenRange token;
	int cursor = start;
	if (!next_token(data, &cursor, end, &token)) {
		return;
	}

	if (token_equals(data, token, "End")) {
		g_current_block = BLOCK_NONE;
		g_current_color = -1;
		g_current_money = -1;
		return;
	}

	if (token_equals(data, token, "OnlineChatColors")) {
		start_block(BLOCK_CHAT_COLORS);
	} else if (token_equals(data, token, "MultiplayerSettings")) {
		start_block(BLOCK_SETTINGS);
	} else if (token_equals(data, token, "MultiplayerColor")) {
		start_multiplayer_color(data, token.end, end, line);
	} else if (token_equals(data, token, "MultiplayerStartingMoneyChoice")) {
		start_money_choice(line);
	}
}

static void parse_chat_color_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd, int line)
{
	if (!is_chat_color_field(data, fieldStart, fieldEnd)) {
		return;
	}

	if (g_chat_color_count >= MAX_CHAT_COLORS) {
		++g_error_count;
		return;
	}

	ChatColorRecord *record = &g_chat_colors[g_chat_color_count++];
	init_chat_color(record);
	assign_string(&record->name, data, fieldStart, fieldEnd);
	record->color = parse_rgb(data, valueStart, valueEnd);
	record->line = line;
	++g_field_count;
}

static void parse_settings_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd)
{
	int parsed = 1;
	if (string_equals(data, fieldStart, fieldEnd, "StartCountdownTimer")) {
		g_start_countdown_timer = parse_int(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "MaxBeaconsPerPlayer")) {
		g_max_beacons_per_player = parse_int(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "UseShroud")) {
		g_use_shroud = parse_bool(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "ShowRandomPlayerTemplate")) {
		g_show_random_player_template = parse_bool(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "ShowRandomStartPos")) {
		g_show_random_start_pos = parse_bool(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "ShowRandomColor")) {
		g_show_random_color = parse_bool(data, valueStart, valueEnd);
	} else {
		parsed = 0;
	}

	if (parsed) {
		++g_settings_field_count;
		++g_field_count;
	}
}

static void parse_multiplayer_color_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd)
{
	if (g_current_color < 0 || g_current_color >= g_multiplayer_color_count) {
		return;
	}

	MultiplayerColorRecord *record = &g_multiplayer_colors[g_current_color];
	int parsed = 1;
	if (string_equals(data, fieldStart, fieldEnd, "TooltipName")) {
		assign_string(&record->tooltipName, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "RGBColor")) {
		record->color = parse_rgb(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "RGBNightColor")) {
		record->nightColor = parse_rgb(data, valueStart, valueEnd);
	} else {
		parsed = 0;
	}

	if (parsed) {
		++record->fieldCount;
		++g_field_count;
	}
}

static void parse_money_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd)
{
	if (g_current_money < 0 || g_current_money >= g_money_choice_count) {
		return;
	}

	MoneyChoiceRecord *record = &g_money_choices[g_current_money];
	int parsed = 1;
	if (string_equals(data, fieldStart, fieldEnd, "Value")) {
		record->value = parse_int(data, valueStart, valueEnd);
		if (record->isDefault) {
			g_default_starting_money = record->value;
		}
	} else if (string_equals(data, fieldStart, fieldEnd, "Default")) {
		record->isDefault = parse_bool(data, valueStart, valueEnd);
		if (record->isDefault) {
			g_default_starting_money = record->value;
		}
	} else {
		parsed = 0;
	}

	if (parsed) {
		++record->fieldCount;
		++g_field_count;
	}
}

static void parse_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd, int line)
{
	trim_range(data, &fieldStart, &fieldEnd);
	trim_range(data, &valueStart, &valueEnd);

	if (g_current_block == BLOCK_CHAT_COLORS) {
		parse_chat_color_assignment(data, fieldStart, fieldEnd, valueStart, valueEnd, line);
	} else if (g_current_block == BLOCK_SETTINGS) {
		parse_settings_assignment(data, fieldStart, fieldEnd, valueStart, valueEnd);
	} else if (g_current_block == BLOCK_MULTIPLAYER_COLOR) {
		parse_multiplayer_color_assignment(data, fieldStart, fieldEnd, valueStart, valueEnd);
	} else if (g_current_block == BLOCK_MONEY_CHOICE) {
		parse_money_assignment(data, fieldStart, fieldEnd, valueStart, valueEnd);
	}
}

static int string_field_ptr(StringField field)
{
	return field.offset >= 0 ? (int)(g_generals_multiplayer_names + field.offset) : 0;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_input_ptr()
{
	return (int)g_generals_multiplayer_input;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_parse(int inputSize)
{
	reset_state();

	if (inputSize < 0 || inputSize > INPUT_CAPACITY) {
		g_error_count = 1;
		return -1;
	}

	const char *data = (const char *)g_generals_multiplayer_input;
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
			parse_assignment(data, lineStart, equals, equals + 1, lineEnd, line);
		} else {
			parse_block_line(data, lineStart, lineEnd, line);
		}

		++line;
	}

	return g_parsed_count;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_parsed_count()
{
	return g_parsed_count;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_field_count()
{
	return g_field_count;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_line_count()
{
	return g_line_count;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_error_count()
{
	return g_error_count;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_settings_field_count()
{
	return g_settings_field_count;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_start_countdown_timer()
{
	return g_start_countdown_timer;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_max_beacons_per_player()
{
	return g_max_beacons_per_player;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_use_shroud()
{
	return g_use_shroud;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_show_random_player_template()
{
	return g_show_random_player_template;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_show_random_start_pos()
{
	return g_show_random_start_pos;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_show_random_color()
{
	return g_show_random_color;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_chat_color_count()
{
	return g_chat_color_count;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_chat_color_name_ptr(int index)
{
	return index >= 0 && index < g_chat_color_count ? string_field_ptr(g_chat_colors[index].name) : 0;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_chat_color_name_size(int index)
{
	return index >= 0 && index < g_chat_color_count ? g_chat_colors[index].name.size : -1;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_chat_color_r(int index)
{
	return index >= 0 && index < g_chat_color_count ? g_chat_colors[index].color.r : -1;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_chat_color_g(int index)
{
	return index >= 0 && index < g_chat_color_count ? g_chat_colors[index].color.g : -1;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_chat_color_b(int index)
{
	return index >= 0 && index < g_chat_color_count ? g_chat_colors[index].color.b : -1;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_chat_color_line(int index)
{
	return index >= 0 && index < g_chat_color_count ? g_chat_colors[index].line : -1;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_color_count()
{
	return g_multiplayer_color_count;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_color_name_ptr(int index)
{
	return index >= 0 && index < g_multiplayer_color_count ? string_field_ptr(g_multiplayer_colors[index].name) : 0;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_color_name_size(int index)
{
	return index >= 0 && index < g_multiplayer_color_count ? g_multiplayer_colors[index].name.size : -1;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_color_tooltip_ptr(int index)
{
	return index >= 0 && index < g_multiplayer_color_count ? string_field_ptr(g_multiplayer_colors[index].tooltipName) : 0;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_color_tooltip_size(int index)
{
	return index >= 0 && index < g_multiplayer_color_count ? g_multiplayer_colors[index].tooltipName.size : -1;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_color_r(int index)
{
	return index >= 0 && index < g_multiplayer_color_count ? g_multiplayer_colors[index].color.r : -1;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_color_g(int index)
{
	return index >= 0 && index < g_multiplayer_color_count ? g_multiplayer_colors[index].color.g : -1;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_color_b(int index)
{
	return index >= 0 && index < g_multiplayer_color_count ? g_multiplayer_colors[index].color.b : -1;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_color_night_r(int index)
{
	return index >= 0 && index < g_multiplayer_color_count ? g_multiplayer_colors[index].nightColor.r : -1;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_color_night_g(int index)
{
	return index >= 0 && index < g_multiplayer_color_count ? g_multiplayer_colors[index].nightColor.g : -1;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_color_night_b(int index)
{
	return index >= 0 && index < g_multiplayer_color_count ? g_multiplayer_colors[index].nightColor.b : -1;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_color_line(int index)
{
	return index >= 0 && index < g_multiplayer_color_count ? g_multiplayer_colors[index].line : -1;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_color_field_count_at(int index)
{
	return index >= 0 && index < g_multiplayer_color_count ? g_multiplayer_colors[index].fieldCount : -1;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_money_choice_count()
{
	return g_money_choice_count;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_money_value(int index)
{
	return index >= 0 && index < g_money_choice_count ? g_money_choices[index].value : -1;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_money_is_default(int index)
{
	return index >= 0 && index < g_money_choice_count ? g_money_choices[index].isDefault : -1;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_money_line(int index)
{
	return index >= 0 && index < g_money_choice_count ? g_money_choices[index].line : -1;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_money_field_count_at(int index)
{
	return index >= 0 && index < g_money_choice_count ? g_money_choices[index].fieldCount : -1;
}

__attribute__((used, visibility("default"))) int generals_multiplayer_default_starting_money()
{
	return g_default_starting_money;
}

}
