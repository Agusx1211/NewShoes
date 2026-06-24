extern "C" {

static const int INPUT_CAPACITY = 256 * 1024;
static const int NAME_CAPACITY = 128 * 1024;
static const int MAX_TERRAINS = 512;

// Terrain classification names, kept in sync with terrainTypeNames[] from
// GeneralsMD/Code/GameEngine/Include/Common/TerrainTypes.h. Index 0 is "NONE"
// (TERRAIN_NONE), matching the INI::parseIndexList contract used by the
// "Class" field in TerrainType::m_terrainTypeFieldParseTable.
static const char *const TERRAIN_CLASS_NAMES[] = {
	"NONE",
	"DESERT_1",
	"DESERT_2",
	"DESERT_3",
	"EASTERN_EUROPE_1",
	"EASTERN_EUROPE_2",
	"EASTERN_EUROPE_3",
	"SWISS_1",
	"SWISS_2",
	"SWISS_3",
	"SNOW_1",
	"SNOW_2",
	"SNOW_3",
	"DIRT",
	"GRASS",
	"TRANSITION",
	"ROCK",
	"SAND",
	"CLIFF",
	"WOOD",
	"BLEND_EDGE",
	"DESERT_LIVE",
	"DESERT_DRY",
	"SAND_ACCENT",
	"BEACH_TROPICAL",
	"BEACH_PARK",
	"MOUNTAIN_RUGGED",
	"GRASS_COBBLESTONE",
	"GRASS_ACCENT",
	"RESIDENTIAL",
	"SNOW_RUGGED",
	"SNOW_FLAT",
	"FIELD",
	"ASPHALT",
	"CONCRETE",
	"CHINA",
	"ROCK_ACCENT",
	"URBAN",
};
static const int TERRAIN_CLASS_COUNT = (int)(sizeof(TERRAIN_CLASS_NAMES) / sizeof(TERRAIN_CLASS_NAMES[0]));

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

struct TerrainRecord
{
	StringField name;
	StringField texture;
	int blendEdges;
	int terrainClass;
	int restrictConstruction;
	int line;
	int fieldCount;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_terrain_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_terrain_names[NAME_CAPACITY];

static TerrainRecord g_terrains[MAX_TERRAINS];
static int g_terrain_count = 0;
static int g_field_count = 0;
static int g_line_count = 0;
static int g_error_count = 0;
static int g_name_cursor = 0;
static int g_current_terrain = -1;

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
		g_generals_terrain_names[g_name_cursor++] = value[index];
	}
	g_generals_terrain_names[g_name_cursor++] = 0;
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

static void reset_state()
{
	g_terrain_count = 0;
	g_field_count = 0;
	g_line_count = 0;
	g_error_count = 0;
	g_name_cursor = 0;
	g_current_terrain = -1;
}

static void init_terrain(TerrainRecord *terrain)
{
	clear_string(&terrain->name);
	clear_string(&terrain->texture);
	terrain->blendEdges = 0;
	terrain->terrainClass = 0;
	terrain->restrictConstruction = 0;
	terrain->line = -1;
	terrain->fieldCount = 0;
}

static void create_terrain(const char *data, int nameStart, int nameEnd, int line)
{
	if (g_terrain_count >= MAX_TERRAINS) {
		++g_error_count;
		g_current_terrain = -1;
		return;
	}

	TerrainRecord *terrain = &g_terrains[g_terrain_count];
	init_terrain(terrain);
	assign_string(&terrain->name, data, nameStart, nameEnd);
	terrain->line = line;
	g_current_terrain = g_terrain_count++;
}

static void parse_block_line(const char *data, int start, int end, int line)
{
	TokenRange token;
	int cursor = start;
	if (!next_token(data, &cursor, end, &token)) {
		return;
	}

	if (token_equals(data, token, "End")) {
		g_current_terrain = -1;
		return;
	}

	if (token_equals(data, token, "Terrain")) {
		create_terrain(data, token.end, end, line);
	}
}

static void parse_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd)
{
	if (g_current_terrain < 0) {
		return;
	}

	trim_range(data, &fieldStart, &fieldEnd);
	trim_range(data, &valueStart, &valueEnd);
	TerrainRecord *terrain = &g_terrains[g_current_terrain];
	int parsed = 1;
	if (string_equals(data, fieldStart, fieldEnd, "Texture")) {
		assign_token_string(&terrain->texture, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "BlendEdges")) {
		terrain->blendEdges = parse_bool(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "Class")) {
		TokenRange token;
		int cursor = valueStart;
		if (next_token(data, &cursor, valueEnd, &token)) {
			const int classIndex = find_named_index(data, token, TERRAIN_CLASS_NAMES, TERRAIN_CLASS_COUNT);
			terrain->terrainClass = classIndex < 0 ? -1 : classIndex;
			if (classIndex < 0) {
				++g_error_count;
			}
		}
	} else if (string_equals(data, fieldStart, fieldEnd, "RestrictConstruction")) {
		terrain->restrictConstruction = parse_bool(data, valueStart, valueEnd);
	} else {
		parsed = 0;
	}

	if (parsed) {
		terrain->fieldCount += 1;
		++g_field_count;
	}
}

static int string_field_ptr(StringField field)
{
	return field.offset >= 0 ? (int)(g_generals_terrain_names + field.offset) : 0;
}

__attribute__((used, visibility("default"))) int generals_terrain_input_ptr()
{
	return (int)g_generals_terrain_input;
}

__attribute__((used, visibility("default"))) int generals_terrain_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_terrain_parse(int inputSize)
{
	reset_state();

	if (inputSize < 0 || inputSize > INPUT_CAPACITY) {
		g_error_count = 1;
		return -1;
	}

	const char *data = (const char *)g_generals_terrain_input;
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

	return g_terrain_count;
}

__attribute__((used, visibility("default"))) int generals_terrain_count()
{
	return g_terrain_count;
}

__attribute__((used, visibility("default"))) int generals_terrain_field_count()
{
	return g_field_count;
}

__attribute__((used, visibility("default"))) int generals_terrain_line_count()
{
	return g_line_count;
}

__attribute__((used, visibility("default"))) int generals_terrain_error_count()
{
	return g_error_count;
}

__attribute__((used, visibility("default"))) int generals_terrain_class_count()
{
	return TERRAIN_CLASS_COUNT;
}

__attribute__((used, visibility("default"))) int generals_terrain_class_name_ptr(int index)
{
	return index >= 0 && index < TERRAIN_CLASS_COUNT ? (int)TERRAIN_CLASS_NAMES[index] : 0;
}

__attribute__((used, visibility("default"))) int generals_terrain_class_name_size(int index)
{
	return index >= 0 && index < TERRAIN_CLASS_COUNT ? string_length(TERRAIN_CLASS_NAMES[index]) : -1;
}

__attribute__((used, visibility("default"))) int generals_terrain_name_ptr(int index)
{
	return index >= 0 && index < g_terrain_count ? string_field_ptr(g_terrains[index].name) : 0;
}

__attribute__((used, visibility("default"))) int generals_terrain_name_size(int index)
{
	return index >= 0 && index < g_terrain_count ? g_terrains[index].name.size : -1;
}

__attribute__((used, visibility("default"))) int generals_terrain_texture_ptr(int index)
{
	return index >= 0 && index < g_terrain_count ? string_field_ptr(g_terrains[index].texture) : 0;
}

__attribute__((used, visibility("default"))) int generals_terrain_texture_size(int index)
{
	return index >= 0 && index < g_terrain_count ? g_terrains[index].texture.size : -1;
}

__attribute__((used, visibility("default"))) int generals_terrain_blend_edges(int index)
{
	return index >= 0 && index < g_terrain_count ? g_terrains[index].blendEdges : -1;
}

__attribute__((used, visibility("default"))) int generals_terrain_class(int index)
{
	return index >= 0 && index < g_terrain_count ? g_terrains[index].terrainClass : -1;
}

__attribute__((used, visibility("default"))) int generals_terrain_class_name_for_ptr(int index)
{
	if (index < 0 || index >= g_terrain_count) {
		return 0;
	}
	const int classIndex = g_terrains[index].terrainClass;
	return classIndex >= 0 && classIndex < TERRAIN_CLASS_COUNT ? (int)TERRAIN_CLASS_NAMES[classIndex] : 0;
}

__attribute__((used, visibility("default"))) int generals_terrain_class_name_for_size(int index)
{
	if (index < 0 || index >= g_terrain_count) {
		return -1;
	}
	const int classIndex = g_terrains[index].terrainClass;
	return classIndex >= 0 && classIndex < TERRAIN_CLASS_COUNT ? string_length(TERRAIN_CLASS_NAMES[classIndex]) : 0;
}

__attribute__((used, visibility("default"))) int generals_terrain_restrict_construction(int index)
{
	return index >= 0 && index < g_terrain_count ? g_terrains[index].restrictConstruction : -1;
}

__attribute__((used, visibility("default"))) int generals_terrain_line(int index)
{
	return index >= 0 && index < g_terrain_count ? g_terrains[index].line : -1;
}

__attribute__((used, visibility("default"))) int generals_terrain_field_count_at(int index)
{
	return index >= 0 && index < g_terrain_count ? g_terrains[index].fieldCount : -1;
}

}
