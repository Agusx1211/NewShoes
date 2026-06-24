extern "C" {

// Parses Campaign.INI Campaign blocks and their nested Mission sub-blocks.
// Campaign.INI uses the whitespace-separated field/value style (no '='), so
// each content line is "<token> <value...>" where the leading token is either a
// block keyword (Campaign / Mission / End) or a field name. Fields follow
// CampaignManager::m_campaignFieldParseTable and the Mission field table in
// GeneralsMD/Code/GameEngine/Source/GameClient/System/CampaignManager.cpp.
// Mission sub-blocks are stored in a flat array keyed back to their owning
// campaign so the wasm ABI stays integer-only.

static const int INPUT_CAPACITY = 64 * 1024;
static const int NAME_CAPACITY = 128 * 1024;
static const int MAX_CAMPAIGNS = 64;
static const int MAX_MISSIONS = 256;

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

struct CampaignRecord
{
	StringField name;
	StringField campaignNameLabel;
	StringField firstMission;
	StringField finalVictoryMovie;
	StringField playerFaction;
	int isChallengeCampaign;
	int missionCount;
	int firstMission_index;
	int line;
	int fieldCount;
};

struct MissionRecord
{
	int campaignIndex;
	StringField name;
	StringField map;
	StringField nextMission;
	StringField introMovie;
	StringField generalName;
	StringField locationNameLabel;
	StringField objectiveLine0;
	StringField briefingVoice;
	StringField unitNames0;
	int voiceLength;
	int line;
	int fieldCount;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_campaign_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_campaign_names[NAME_CAPACITY];

static CampaignRecord g_campaigns[MAX_CAMPAIGNS];
static MissionRecord g_missions[MAX_MISSIONS];
static int g_campaign_count = 0;
static int g_mission_count = 0;
static int g_field_count = 0;
static int g_line_count = 0;
static int g_error_count = 0;
static int g_name_cursor = 0;
static int g_current_campaign = -1;
static int g_current_mission = -1;

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
		g_generals_campaign_names[g_name_cursor++] = value[index];
	}
	g_generals_campaign_names[g_name_cursor++] = 0;
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

// Assigns the first whitespace/'='-delimited token of the value range, matching
// INI::parseAsciiString semantics.
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
	g_campaign_count = 0;
	g_mission_count = 0;
	g_field_count = 0;
	g_line_count = 0;
	g_error_count = 0;
	g_name_cursor = 0;
	g_current_campaign = -1;
	g_current_mission = -1;
}

static void create_campaign(const char *data, int nameStart, int nameEnd, int line)
{
	if (g_campaign_count >= MAX_CAMPAIGNS) {
		++g_error_count;
		g_current_campaign = -1;
		g_current_mission = -1;
		return;
	}

	CampaignRecord *campaign = &g_campaigns[g_campaign_count];
	clear_string(&campaign->name);
	assign_token_string(&campaign->name, data, nameStart, nameEnd);
	clear_string(&campaign->campaignNameLabel);
	clear_string(&campaign->firstMission);
	clear_string(&campaign->finalVictoryMovie);
	clear_string(&campaign->playerFaction);
	campaign->isChallengeCampaign = 0;
	campaign->missionCount = 0;
	campaign->firstMission_index = -1;
	campaign->line = line;
	campaign->fieldCount = 0;
	g_current_campaign = g_campaign_count++;
	g_current_mission = -1;
}

static void create_mission(const char *data, int nameStart, int nameEnd, int line)
{
	if (g_current_campaign < 0) {
		return;
	}
	if (g_mission_count >= MAX_MISSIONS) {
		++g_error_count;
		g_current_mission = -1;
		return;
	}

	MissionRecord *mission = &g_missions[g_mission_count];
	mission->campaignIndex = g_current_campaign;
	clear_string(&mission->name);
	assign_token_string(&mission->name, data, nameStart, nameEnd);
	clear_string(&mission->map);
	clear_string(&mission->nextMission);
	clear_string(&mission->introMovie);
	clear_string(&mission->generalName);
	clear_string(&mission->locationNameLabel);
	clear_string(&mission->objectiveLine0);
	clear_string(&mission->briefingVoice);
	clear_string(&mission->unitNames0);
	mission->voiceLength = 0;
	mission->line = line;
	mission->fieldCount = 0;

	CampaignRecord *campaign = &g_campaigns[g_current_campaign];
	if (campaign->firstMission_index < 0) {
		campaign->firstMission_index = g_mission_count;
	}
	campaign->missionCount += 1;
	// Mission is itself a field of the campaign in the engine's parse table.
	campaign->fieldCount += 1;
	++g_field_count;
	g_current_mission = g_mission_count++;
}

static void parse_mission_field(const char *data, TokenRange field, int valueStart, int valueEnd)
{
	MissionRecord *mission = &g_missions[g_current_mission];
	int parsed = 1;
	if (field_equals(data, field, "Map")) {
		assign_token_string(&mission->map, data, valueStart, valueEnd);
	} else if (field_equals(data, field, "NextMission")) {
		assign_token_string(&mission->nextMission, data, valueStart, valueEnd);
	} else if (field_equals(data, field, "IntroMovie")) {
		assign_token_string(&mission->introMovie, data, valueStart, valueEnd);
	} else if (field_equals(data, field, "GeneralName")) {
		assign_token_string(&mission->generalName, data, valueStart, valueEnd);
	} else if (field_equals(data, field, "LocationNameLabel")) {
		assign_token_string(&mission->locationNameLabel, data, valueStart, valueEnd);
	} else if (field_equals(data, field, "ObjectiveLine0")) {
		assign_token_string(&mission->objectiveLine0, data, valueStart, valueEnd);
	} else if (field_equals(data, field, "BriefingVoice")) {
		assign_token_string(&mission->briefingVoice, data, valueStart, valueEnd);
	} else if (field_equals(data, field, "UnitNames0")) {
		assign_token_string(&mission->unitNames0, data, valueStart, valueEnd);
	} else if (field_equals(data, field, "VoiceLength")) {
		parse_int_token(data, valueStart, valueEnd, &mission->voiceLength);
	} else if (field_equals(data, field, "ObjectiveLine1") ||
			   field_equals(data, field, "ObjectiveLine2") ||
			   field_equals(data, field, "ObjectiveLine3") ||
			   field_equals(data, field, "ObjectiveLine4") ||
			   field_equals(data, field, "UnitNames1") ||
			   field_equals(data, field, "UnitNames2")) {
		// Recognized but not individually exposed; counted for fidelity.
	} else {
		parsed = 0;
	}

	if (parsed) {
		mission->fieldCount += 1;
		++g_field_count;
	}
}

static void parse_campaign_field(const char *data, TokenRange field, int valueStart, int valueEnd)
{
	CampaignRecord *campaign = &g_campaigns[g_current_campaign];
	int parsed = 1;
	if (field_equals(data, field, "FirstMission")) {
		assign_token_string(&campaign->firstMission, data, valueStart, valueEnd);
	} else if (field_equals(data, field, "CampaignNameLabel")) {
		assign_token_string(&campaign->campaignNameLabel, data, valueStart, valueEnd);
	} else if (field_equals(data, field, "FinalVictoryMovie")) {
		assign_token_string(&campaign->finalVictoryMovie, data, valueStart, valueEnd);
	} else if (field_equals(data, field, "PlayerFaction")) {
		assign_token_string(&campaign->playerFaction, data, valueStart, valueEnd);
	} else if (field_equals(data, field, "IsChallengeCampaign")) {
		campaign->isChallengeCampaign = parse_bool_token(data, valueStart, valueEnd);
	} else {
		parsed = 0;
	}

	if (parsed) {
		campaign->fieldCount += 1;
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
		if (g_current_mission >= 0) {
			g_current_mission = -1;
		} else if (g_current_campaign >= 0) {
			g_current_campaign = -1;
		}
		return;
	}

	if (token_equals(data, first, "Campaign")) {
		create_campaign(data, valueStart, end, line);
		return;
	}

	if (token_equals(data, first, "Mission")) {
		create_mission(data, valueStart, end, line);
		return;
	}

	if (g_current_mission >= 0) {
		parse_mission_field(data, first, valueStart, end);
	} else if (g_current_campaign >= 0) {
		parse_campaign_field(data, first, valueStart, end);
	}
}

static int string_field_ptr(StringField field)
{
	return field.offset >= 0 ? (int)(g_generals_campaign_names + field.offset) : 0;
}

__attribute__((used, visibility("default"))) int generals_campaign_input_ptr()
{
	return (int)g_generals_campaign_input;
}

__attribute__((used, visibility("default"))) int generals_campaign_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_campaign_parse(int inputSize)
{
	reset_state();

	if (inputSize < 0 || inputSize > INPUT_CAPACITY) {
		g_error_count = 1;
		return -1;
	}

	const char *data = (const char *)g_generals_campaign_input;
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

	return g_campaign_count;
}

__attribute__((used, visibility("default"))) int generals_campaign_count()
{
	return g_campaign_count;
}

__attribute__((used, visibility("default"))) int generals_campaign_mission_total()
{
	return g_mission_count;
}

__attribute__((used, visibility("default"))) int generals_campaign_field_count()
{
	return g_field_count;
}

__attribute__((used, visibility("default"))) int generals_campaign_line_count()
{
	return g_line_count;
}

__attribute__((used, visibility("default"))) int generals_campaign_error_count()
{
	return g_error_count;
}

#define CAMPAIGN_GUARD(expr, fallback) (index >= 0 && index < g_campaign_count ? (expr) : (fallback))

__attribute__((used, visibility("default"))) int generals_campaign_name_ptr(int index)
{
	return CAMPAIGN_GUARD(string_field_ptr(g_campaigns[index].name), 0);
}

__attribute__((used, visibility("default"))) int generals_campaign_name_size(int index)
{
	return CAMPAIGN_GUARD(g_campaigns[index].name.size, -1);
}

__attribute__((used, visibility("default"))) int generals_campaign_name_label_ptr(int index)
{
	return CAMPAIGN_GUARD(string_field_ptr(g_campaigns[index].campaignNameLabel), 0);
}

__attribute__((used, visibility("default"))) int generals_campaign_name_label_size(int index)
{
	return CAMPAIGN_GUARD(g_campaigns[index].campaignNameLabel.size, -1);
}

__attribute__((used, visibility("default"))) int generals_campaign_first_mission_ptr(int index)
{
	return CAMPAIGN_GUARD(string_field_ptr(g_campaigns[index].firstMission), 0);
}

__attribute__((used, visibility("default"))) int generals_campaign_first_mission_size(int index)
{
	return CAMPAIGN_GUARD(g_campaigns[index].firstMission.size, -1);
}

__attribute__((used, visibility("default"))) int generals_campaign_final_movie_ptr(int index)
{
	return CAMPAIGN_GUARD(string_field_ptr(g_campaigns[index].finalVictoryMovie), 0);
}

__attribute__((used, visibility("default"))) int generals_campaign_final_movie_size(int index)
{
	return CAMPAIGN_GUARD(g_campaigns[index].finalVictoryMovie.size, -1);
}

__attribute__((used, visibility("default"))) int generals_campaign_player_faction_ptr(int index)
{
	return CAMPAIGN_GUARD(string_field_ptr(g_campaigns[index].playerFaction), 0);
}

__attribute__((used, visibility("default"))) int generals_campaign_player_faction_size(int index)
{
	return CAMPAIGN_GUARD(g_campaigns[index].playerFaction.size, -1);
}

__attribute__((used, visibility("default"))) int generals_campaign_is_challenge(int index)
{
	return CAMPAIGN_GUARD(g_campaigns[index].isChallengeCampaign, -1);
}

__attribute__((used, visibility("default"))) int generals_campaign_mission_count(int index)
{
	return CAMPAIGN_GUARD(g_campaigns[index].missionCount, -1);
}

__attribute__((used, visibility("default"))) int generals_campaign_first_mission_index(int index)
{
	return CAMPAIGN_GUARD(g_campaigns[index].firstMission_index, -1);
}

__attribute__((used, visibility("default"))) int generals_campaign_line(int index)
{
	return CAMPAIGN_GUARD(g_campaigns[index].line, -1);
}

__attribute__((used, visibility("default"))) int generals_campaign_field_count_at(int index)
{
	return CAMPAIGN_GUARD(g_campaigns[index].fieldCount, -1);
}

#define MISSION_GUARD(expr, fallback) (index >= 0 && index < g_mission_count ? (expr) : (fallback))

__attribute__((used, visibility("default"))) int generals_campaign_mission_campaign_index(int index)
{
	return MISSION_GUARD(g_missions[index].campaignIndex, -1);
}

__attribute__((used, visibility("default"))) int generals_campaign_mission_name_ptr(int index)
{
	return MISSION_GUARD(string_field_ptr(g_missions[index].name), 0);
}

__attribute__((used, visibility("default"))) int generals_campaign_mission_name_size(int index)
{
	return MISSION_GUARD(g_missions[index].name.size, -1);
}

__attribute__((used, visibility("default"))) int generals_campaign_mission_map_ptr(int index)
{
	return MISSION_GUARD(string_field_ptr(g_missions[index].map), 0);
}

__attribute__((used, visibility("default"))) int generals_campaign_mission_map_size(int index)
{
	return MISSION_GUARD(g_missions[index].map.size, -1);
}

__attribute__((used, visibility("default"))) int generals_campaign_mission_next_ptr(int index)
{
	return MISSION_GUARD(string_field_ptr(g_missions[index].nextMission), 0);
}

__attribute__((used, visibility("default"))) int generals_campaign_mission_next_size(int index)
{
	return MISSION_GUARD(g_missions[index].nextMission.size, -1);
}

__attribute__((used, visibility("default"))) int generals_campaign_mission_intro_movie_ptr(int index)
{
	return MISSION_GUARD(string_field_ptr(g_missions[index].introMovie), 0);
}

__attribute__((used, visibility("default"))) int generals_campaign_mission_intro_movie_size(int index)
{
	return MISSION_GUARD(g_missions[index].introMovie.size, -1);
}

__attribute__((used, visibility("default"))) int generals_campaign_mission_general_name_ptr(int index)
{
	return MISSION_GUARD(string_field_ptr(g_missions[index].generalName), 0);
}

__attribute__((used, visibility("default"))) int generals_campaign_mission_general_name_size(int index)
{
	return MISSION_GUARD(g_missions[index].generalName.size, -1);
}

__attribute__((used, visibility("default"))) int generals_campaign_mission_location_label_ptr(int index)
{
	return MISSION_GUARD(string_field_ptr(g_missions[index].locationNameLabel), 0);
}

__attribute__((used, visibility("default"))) int generals_campaign_mission_location_label_size(int index)
{
	return MISSION_GUARD(g_missions[index].locationNameLabel.size, -1);
}

__attribute__((used, visibility("default"))) int generals_campaign_mission_objective0_ptr(int index)
{
	return MISSION_GUARD(string_field_ptr(g_missions[index].objectiveLine0), 0);
}

__attribute__((used, visibility("default"))) int generals_campaign_mission_objective0_size(int index)
{
	return MISSION_GUARD(g_missions[index].objectiveLine0.size, -1);
}

__attribute__((used, visibility("default"))) int generals_campaign_mission_voice_length(int index)
{
	return MISSION_GUARD(g_missions[index].voiceLength, -1);
}

__attribute__((used, visibility("default"))) int generals_campaign_mission_line(int index)
{
	return MISSION_GUARD(g_missions[index].line, -1);
}

__attribute__((used, visibility("default"))) int generals_campaign_mission_field_count_at(int index)
{
	return MISSION_GUARD(g_missions[index].fieldCount, -1);
}

}
