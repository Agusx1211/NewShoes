extern "C" {

// Parses ChallengeMode.INI: a single ChallengeGenerals block whose fields are
// GeneralPersonaN sub-blocks (one per Generals' Challenge opponent). Each
// persona carries a player template, bio strings, portraits, and taunt/win
// sounds, following GeneralPersona's dataFieldParse and
// ChallengeGenerals::s_fieldParseTable in
// GeneralsMD/Code/GameEngine/Source/GameClient/GUI/ChallengeGenerals.cpp.
// ChallengeMode.INI uses the whitespace/'='-separated field style, so each
// content line is "<token> <value...>".

static const int INPUT_CAPACITY = 64 * 1024;
static const int NAME_CAPACITY = 64 * 1024;
static const int MAX_PERSONAS = 32;

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

struct PersonaRecord
{
	int position;
	int startsEnabled;
	StringField playerTemplate;
	StringField bioName;
	StringField bioRank;
	StringField bioStrategy;
	StringField campaign;
	StringField portraitLarge;
	StringField selectionSound;
	int line;
	int fieldCount;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_challenge_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_challenge_names[NAME_CAPACITY];

static PersonaRecord g_personas[MAX_PERSONAS];
static int g_persona_count = 0;
static int g_field_count = 0;
static int g_line_count = 0;
static int g_error_count = 0;
static int g_name_cursor = 0;
static int g_has_challenge = 0;
static int g_in_challenge = 0;
static int g_current_persona = -1;

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

// Case-insensitive prefix test for the left token against a C string.
static bool ascii_starts_with_ignore_case(const char *left, int leftSize, const char *prefix)
{
	int index = 0;
	while (prefix[index] != 0) {
		if (index >= leftSize || lower_ascii(left[index]) != lower_ascii(prefix[index])) {
			return false;
		}
		++index;
	}

	return true;
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

static bool field_equals(const char *data, TokenRange token, const char *value)
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
		g_generals_challenge_names[g_name_cursor++] = value[index];
	}
	g_generals_challenge_names[g_name_cursor++] = 0;
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

	int valueStart = token.start;
	int valueEnd = token.end;
	const int size = valueEnd - valueStart;
	if (size <= 0) {
		clear_string(field);
		return;
	}

	const int offset = store_string(data + valueStart, size);
	if (offset < 0) {
		++g_error_count;
		return;
	}

	field->offset = offset;
	field->size = size;
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

// Reads the integer suffix of a "GeneralPersonaN" keyword (returns -1 if none).
static int parse_persona_position(const char *data, TokenRange token)
{
	int pos = token.start + 14; // length of "GeneralPersona"
	if (pos >= token.end) {
		return -1;
	}

	int value = 0;
	bool sawDigit = false;
	while (pos < token.end && data[pos] >= '0' && data[pos] <= '9') {
		sawDigit = true;
		value = value * 10 + (data[pos] - '0');
		++pos;
	}

	return sawDigit ? value : -1;
}

static void reset_state()
{
	g_persona_count = 0;
	g_field_count = 0;
	g_line_count = 0;
	g_error_count = 0;
	g_name_cursor = 0;
	g_has_challenge = 0;
	g_in_challenge = 0;
	g_current_persona = -1;
}

static void create_persona(int position, int line)
{
	if (g_persona_count >= MAX_PERSONAS) {
		++g_error_count;
		g_current_persona = -1;
		return;
	}

	PersonaRecord *persona = &g_personas[g_persona_count];
	persona->position = position;
	persona->startsEnabled = 0;
	clear_string(&persona->playerTemplate);
	clear_string(&persona->bioName);
	clear_string(&persona->bioRank);
	clear_string(&persona->bioStrategy);
	clear_string(&persona->campaign);
	clear_string(&persona->portraitLarge);
	clear_string(&persona->selectionSound);
	persona->line = line;
	persona->fieldCount = 0;
	g_current_persona = g_persona_count++;
}

static void parse_persona_field(const char *data, TokenRange field, int valueStart, int valueEnd)
{
	PersonaRecord *persona = &g_personas[g_current_persona];
	int parsed = 1;
	if (field_equals(data, field, "PlayerTemplate")) {
		assign_token_string(&persona->playerTemplate, data, valueStart, valueEnd);
	} else if (field_equals(data, field, "StartsEnabled")) {
		persona->startsEnabled = parse_bool_token(data, valueStart, valueEnd);
	} else if (field_equals(data, field, "BioNameString")) {
		assign_token_string(&persona->bioName, data, valueStart, valueEnd);
	} else if (field_equals(data, field, "BioRankString")) {
		assign_token_string(&persona->bioRank, data, valueStart, valueEnd);
	} else if (field_equals(data, field, "BioStrategyString")) {
		assign_token_string(&persona->bioStrategy, data, valueStart, valueEnd);
	} else if (field_equals(data, field, "Campaign")) {
		assign_token_string(&persona->campaign, data, valueStart, valueEnd);
	} else if (field_equals(data, field, "BioPortraitLarge")) {
		assign_token_string(&persona->portraitLarge, data, valueStart, valueEnd);
	} else if (field_equals(data, field, "SelectionSound")) {
		assign_token_string(&persona->selectionSound, data, valueStart, valueEnd);
	} else if (field_equals(data, field, "BioDOBString") ||
			   field_equals(data, field, "BioBirthplaceString") ||
			   field_equals(data, field, "BioBranchString") ||
			   field_equals(data, field, "BioClassNumberString") ||
			   field_equals(data, field, "BioPortraitSmall") ||
			   field_equals(data, field, "PortraitMovieLeftName") ||
			   field_equals(data, field, "PortraitMovieRightName") ||
			   field_equals(data, field, "DefeatedImage") ||
			   field_equals(data, field, "VictoriousImage") ||
			   field_equals(data, field, "DefeatedString") ||
			   field_equals(data, field, "VictoriousString") ||
			   field_equals(data, field, "TauntSound1") ||
			   field_equals(data, field, "TauntSound2") ||
			   field_equals(data, field, "TauntSound3") ||
			   field_equals(data, field, "WinSound") ||
			   field_equals(data, field, "LossSound") ||
			   field_equals(data, field, "PreviewSound") ||
			   field_equals(data, field, "NameSound")) {
		// Recognized persona fields not individually exposed; counted for fidelity.
	} else {
		parsed = 0;
	}

	if (parsed) {
		persona->fieldCount += 1;
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
		if (g_current_persona >= 0) {
			g_current_persona = -1;
		} else if (g_in_challenge) {
			g_in_challenge = 0;
		}
		return;
	}

	if (token_equals(data, first, "ChallengeGenerals")) {
		g_has_challenge = 1;
		g_in_challenge = 1;
		g_current_persona = -1;
		return;
	}

	if (ascii_starts_with_ignore_case(data + first.start, first.end - first.start, "GeneralPersona") && g_in_challenge) {
		create_persona(parse_persona_position(data, first), line);
		return;
	}

	if (g_current_persona >= 0) {
		parse_persona_field(data, first, valueStart, end);
	}
}

static int string_field_ptr(StringField field)
{
	return field.offset >= 0 ? (int)(g_generals_challenge_names + field.offset) : 0;
}

__attribute__((used, visibility("default"))) int generals_challenge_input_ptr()
{
	return (int)g_generals_challenge_input;
}

__attribute__((used, visibility("default"))) int generals_challenge_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_challenge_parse(int inputSize)
{
	reset_state();

	if (inputSize < 0 || inputSize > INPUT_CAPACITY) {
		g_error_count = 1;
		return -1;
	}

	const char *data = (const char *)g_generals_challenge_input;
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

	return g_persona_count;
}

__attribute__((used, visibility("default"))) int generals_challenge_has_block()
{
	return g_has_challenge;
}

__attribute__((used, visibility("default"))) int generals_challenge_count()
{
	return g_persona_count;
}

__attribute__((used, visibility("default"))) int generals_challenge_field_count()
{
	return g_field_count;
}

__attribute__((used, visibility("default"))) int generals_challenge_line_count()
{
	return g_line_count;
}

__attribute__((used, visibility("default"))) int generals_challenge_error_count()
{
	return g_error_count;
}

__attribute__((used, visibility("default"))) int generals_challenge_enabled_count()
{
	int count = 0;
	for (int index = 0; index < g_persona_count; ++index) {
		if (g_personas[index].startsEnabled) {
			++count;
		}
	}
	return count;
}

#define PERSONA_GUARD(expr, fallback) (index >= 0 && index < g_persona_count ? (expr) : (fallback))

__attribute__((used, visibility("default"))) int generals_challenge_position(int index)
{
	return PERSONA_GUARD(g_personas[index].position, -1);
}

__attribute__((used, visibility("default"))) int generals_challenge_starts_enabled(int index)
{
	return PERSONA_GUARD(g_personas[index].startsEnabled, -1);
}

__attribute__((used, visibility("default"))) int generals_challenge_player_template_ptr(int index)
{
	return PERSONA_GUARD(string_field_ptr(g_personas[index].playerTemplate), 0);
}

__attribute__((used, visibility("default"))) int generals_challenge_player_template_size(int index)
{
	return PERSONA_GUARD(g_personas[index].playerTemplate.size, -1);
}

__attribute__((used, visibility("default"))) int generals_challenge_bio_name_ptr(int index)
{
	return PERSONA_GUARD(string_field_ptr(g_personas[index].bioName), 0);
}

__attribute__((used, visibility("default"))) int generals_challenge_bio_name_size(int index)
{
	return PERSONA_GUARD(g_personas[index].bioName.size, -1);
}

__attribute__((used, visibility("default"))) int generals_challenge_bio_rank_ptr(int index)
{
	return PERSONA_GUARD(string_field_ptr(g_personas[index].bioRank), 0);
}

__attribute__((used, visibility("default"))) int generals_challenge_bio_rank_size(int index)
{
	return PERSONA_GUARD(g_personas[index].bioRank.size, -1);
}

__attribute__((used, visibility("default"))) int generals_challenge_bio_strategy_ptr(int index)
{
	return PERSONA_GUARD(string_field_ptr(g_personas[index].bioStrategy), 0);
}

__attribute__((used, visibility("default"))) int generals_challenge_bio_strategy_size(int index)
{
	return PERSONA_GUARD(g_personas[index].bioStrategy.size, -1);
}

__attribute__((used, visibility("default"))) int generals_challenge_campaign_ptr(int index)
{
	return PERSONA_GUARD(string_field_ptr(g_personas[index].campaign), 0);
}

__attribute__((used, visibility("default"))) int generals_challenge_campaign_size(int index)
{
	return PERSONA_GUARD(g_personas[index].campaign.size, -1);
}

__attribute__((used, visibility("default"))) int generals_challenge_portrait_large_ptr(int index)
{
	return PERSONA_GUARD(string_field_ptr(g_personas[index].portraitLarge), 0);
}

__attribute__((used, visibility("default"))) int generals_challenge_portrait_large_size(int index)
{
	return PERSONA_GUARD(g_personas[index].portraitLarge.size, -1);
}

__attribute__((used, visibility("default"))) int generals_challenge_selection_sound_ptr(int index)
{
	return PERSONA_GUARD(string_field_ptr(g_personas[index].selectionSound), 0);
}

__attribute__((used, visibility("default"))) int generals_challenge_selection_sound_size(int index)
{
	return PERSONA_GUARD(g_personas[index].selectionSound.size, -1);
}

__attribute__((used, visibility("default"))) int generals_challenge_line(int index)
{
	return PERSONA_GUARD(g_personas[index].line, -1);
}

__attribute__((used, visibility("default"))) int generals_challenge_field_count_at(int index)
{
	return PERSONA_GUARD(g_personas[index].fieldCount, -1);
}

}
