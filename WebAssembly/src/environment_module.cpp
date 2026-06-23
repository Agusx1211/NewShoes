extern "C" {

static const int INPUT_CAPACITY = 256 * 1024;
static const int NAME_CAPACITY = 128 * 1024;
static const int MAX_WATER_SETS = 16;
static const int MAX_TRANSPARENCY_SETTINGS = 8;
static const int MAX_WEATHER_SETTINGS = 8;
static const int REAL_SCALE = 10000;

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

struct Color
{
	int r;
	int g;
	int b;
	int a;
};

struct WaterSetRecord
{
	StringField name;
	StringField skyTexture;
	StringField waterTexture;
	Color vertices[4];
	Color diffuse;
	Color transparentDiffuse;
	int uScrollPerMsX10000;
	int vScrollPerMsX10000;
	int skyTexelsPerUnitX10000;
	int waterRepeatCount;
	int line;
	int fieldCount;
};

struct TransparencyRecord
{
	StringField standingWaterTexture;
	StringField skyboxTextureN;
	StringField skyboxTextureE;
	StringField skyboxTextureS;
	StringField skyboxTextureW;
	StringField skyboxTextureT;
	Color standingWaterColor;
	Color radarWaterColor;
	int transparentWaterDepthX10000;
	int minWaterOpacityX10000;
	int additiveBlending;
	int line;
	int fieldCount;
};

struct WeatherRecord
{
	StringField snowTexture;
	int snowFrequencyScaleXX10000;
	int snowFrequencyScaleYX10000;
	int snowAmplitudeX10000;
	int snowPointSizeX10000;
	int snowMaxPointSizeX10000;
	int snowMinPointSizeX10000;
	int snowQuadSizeX10000;
	int snowBoxDimensionsX10000;
	int snowBoxDensityX10000;
	int snowVelocityX10000;
	int usePointSprites;
	int snowEnabled;
	int line;
	int fieldCount;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_environment_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_environment_names[NAME_CAPACITY];

static WaterSetRecord g_water_sets[MAX_WATER_SETS];
static TransparencyRecord g_transparencies[MAX_TRANSPARENCY_SETTINGS];
static WeatherRecord g_weathers[MAX_WEATHER_SETTINGS];
static int g_water_set_count = 0;
static int g_transparency_count = 0;
static int g_weather_count = 0;
static int g_field_count = 0;
static int g_line_count = 0;
static int g_error_count = 0;
static int g_name_cursor = 0;
static int g_current_block_type = 0;
static int g_current_index = -1;

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
		g_generals_environment_names[g_name_cursor++] = value[index];
	}
	g_generals_environment_names[g_name_cursor++] = 0;
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

static void assign_literal(StringField *field, const char *value)
{
	assign_string(field, value, 0, string_length(value));
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

static int parse_int(const char *data, int start, int end, int *integer)
{
	trim_range(data, &start, &end);
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

static int parse_real_scaled(const char *data, int start, int end, int *scaled)
{
	trim_range(data, &start, &end);
	if (start >= end) {
		return 0;
	}

	int cursor = start;
	bool negative = false;
	if (data[cursor] == '-' || data[cursor] == '+') {
		negative = data[cursor] == '-';
		++cursor;
	}

	int integerPart = 0;
	bool sawDigit = false;
	while (cursor < end && data[cursor] >= '0' && data[cursor] <= '9') {
		sawDigit = true;
		integerPart = integerPart * 10 + (data[cursor] - '0');
		++cursor;
	}

	int fractionalPart = 0;
	int fractionalScale = REAL_SCALE;
	if (cursor < end && data[cursor] == '.') {
		++cursor;
		while (cursor < end && data[cursor] >= '0' && data[cursor] <= '9') {
			sawDigit = true;
			if (fractionalScale > 1) {
				fractionalScale /= 10;
				fractionalPart += (data[cursor] - '0') * fractionalScale;
			}
			++cursor;
		}
	}

	if (!sawDigit) {
		return 0;
	}

	int value = integerPart * REAL_SCALE + fractionalPart;
	*scaled = negative ? -value : value;
	return 1;
}

static int parse_labeled_int(const char *data, TokenRange token, const char *label, int *value)
{
	const int labelSize = string_length(label);
	if (token.end - token.start <= labelSize || data[token.start + labelSize] != ':') {
		return 0;
	}
	if (!ascii_equal_ignore_case(data + token.start, labelSize, label)) {
		return 0;
	}

	return parse_int(data, token.start + labelSize + 1, token.end, value);
}

static void init_color(Color *color, int r, int g, int b, int a)
{
	color->r = r;
	color->g = g;
	color->b = b;
	color->a = a;
}

static int parse_color(const char *data, int start, int end, Color *color, bool allowAlpha)
{
	int r = -1;
	int g = -1;
	int b = -1;
	int a = allowAlpha ? 255 : 0;
	TokenRange token;
	int cursor = start;
	while (next_token(data, &cursor, end, &token)) {
		parse_labeled_int(data, token, "R", &r);
		parse_labeled_int(data, token, "G", &g);
		parse_labeled_int(data, token, "B", &b);
		if (allowAlpha) {
			parse_labeled_int(data, token, "A", &a);
		}
	}

	if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255 || a < 0 || a > 255) {
		++g_error_count;
		return 0;
	}

	init_color(color, r, g, b, a);
	return 1;
}

static int parse_bool_value(const char *data, int start, int end, int *value)
{
	TokenRange token;
	int cursor = start;
	if (!next_token(data, &cursor, end, &token)) {
		return 0;
	}

	if (token_equals(data, token, "yes") || token_equals(data, token, "true") || token_equals(data, token, "1")) {
		*value = 1;
		return 1;
	}
	if (token_equals(data, token, "no") || token_equals(data, token, "false") || token_equals(data, token, "0")) {
		*value = 0;
		return 1;
	}

	++g_error_count;
	return 0;
}

static void init_water_set(WaterSetRecord *water)
{
	clear_string(&water->name);
	clear_string(&water->skyTexture);
	clear_string(&water->waterTexture);
	for (int index = 0; index < 4; ++index) {
		init_color(&water->vertices[index], 0, 0, 0, 0);
	}
	init_color(&water->diffuse, 0, 0, 0, 0);
	init_color(&water->transparentDiffuse, 0, 0, 0, 0);
	water->uScrollPerMsX10000 = 0;
	water->vScrollPerMsX10000 = 0;
	water->skyTexelsPerUnitX10000 = 0;
	water->waterRepeatCount = 0;
	water->line = -1;
	water->fieldCount = 0;
}

static void init_transparency(TransparencyRecord *transparency)
{
	assign_literal(&transparency->standingWaterTexture, "TWWater01.tga");
	assign_literal(&transparency->skyboxTextureN, "TSMorningN.tga");
	assign_literal(&transparency->skyboxTextureE, "TSMorningE.tga");
	assign_literal(&transparency->skyboxTextureS, "TSMorningS.tga");
	assign_literal(&transparency->skyboxTextureW, "TSMorningW.tga");
	assign_literal(&transparency->skyboxTextureT, "TSMorningT.tga");
	init_color(&transparency->standingWaterColor, 255, 255, 255, 0);
	init_color(&transparency->radarWaterColor, 140, 140, 255, 0);
	transparency->transparentWaterDepthX10000 = 30000;
	transparency->minWaterOpacityX10000 = 10000;
	transparency->additiveBlending = 0;
	transparency->line = -1;
	transparency->fieldCount = 0;
}

static void init_weather(WeatherRecord *weather)
{
	assign_literal(&weather->snowTexture, "EXSnowFlake.tga");
	weather->snowFrequencyScaleXX10000 = 533;
	weather->snowFrequencyScaleYX10000 = 275;
	weather->snowAmplitudeX10000 = 50000;
	weather->snowPointSizeX10000 = 10000;
	weather->snowMaxPointSizeX10000 = 640000;
	weather->snowMinPointSizeX10000 = 0;
	weather->snowQuadSizeX10000 = 5000;
	weather->snowBoxDimensionsX10000 = 2000000;
	weather->snowBoxDensityX10000 = 10000;
	weather->snowVelocityX10000 = 40000;
	weather->usePointSprites = 1;
	weather->snowEnabled = 0;
	weather->line = -1;
	weather->fieldCount = 0;
}

static void reset_state()
{
	g_water_set_count = 0;
	g_transparency_count = 0;
	g_weather_count = 0;
	g_field_count = 0;
	g_line_count = 0;
	g_error_count = 0;
	g_name_cursor = 0;
	g_current_block_type = 0;
	g_current_index = -1;
}

static void create_water_set(const char *data, int nameStart, int nameEnd, int line)
{
	if (g_water_set_count >= MAX_WATER_SETS) {
		++g_error_count;
		return;
	}

	WaterSetRecord *water = &g_water_sets[g_water_set_count];
	init_water_set(water);
	assign_string(&water->name, data, nameStart, nameEnd);
	water->line = line;
	g_current_block_type = 1;
	g_current_index = g_water_set_count++;
}

static void create_transparency(int line)
{
	if (g_transparency_count >= MAX_TRANSPARENCY_SETTINGS) {
		++g_error_count;
		return;
	}

	TransparencyRecord *transparency = &g_transparencies[g_transparency_count];
	init_transparency(transparency);
	transparency->line = line;
	g_current_block_type = 2;
	g_current_index = g_transparency_count++;
}

static void create_weather(int line)
{
	if (g_weather_count >= MAX_WEATHER_SETTINGS) {
		++g_error_count;
		return;
	}

	WeatherRecord *weather = &g_weathers[g_weather_count];
	init_weather(weather);
	weather->line = line;
	g_current_block_type = 3;
	g_current_index = g_weather_count++;
}

static void parse_block_line(const char *data, int start, int end, int line)
{
	TokenRange token;
	int cursor = start;
	if (!next_token(data, &cursor, end, &token)) {
		return;
	}

	if (token_equals(data, token, "End")) {
		g_current_block_type = 0;
		g_current_index = -1;
		return;
	}

	if (token_equals(data, token, "WaterSet")) {
		create_water_set(data, token.end, end, line);
	} else if (token_equals(data, token, "WaterTransparency")) {
		create_transparency(line);
	} else if (token_equals(data, token, "Weather")) {
		create_weather(line);
	}
}

static void count_field(int *blockFieldCount)
{
	*blockFieldCount += 1;
	++g_field_count;
}

static void parse_water_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd)
{
	WaterSetRecord *water = &g_water_sets[g_current_index];
	int parsed = 1;
	if (string_equals(data, fieldStart, fieldEnd, "SkyTexture")) {
		assign_token_string(&water->skyTexture, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "WaterTexture")) {
		assign_token_string(&water->waterTexture, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "Vertex00Color")) {
		parse_color(data, valueStart, valueEnd, &water->vertices[0], true);
	} else if (string_equals(data, fieldStart, fieldEnd, "Vertex10Color")) {
		parse_color(data, valueStart, valueEnd, &water->vertices[1], true);
	} else if (string_equals(data, fieldStart, fieldEnd, "Vertex01Color")) {
		parse_color(data, valueStart, valueEnd, &water->vertices[2], true);
	} else if (string_equals(data, fieldStart, fieldEnd, "Vertex11Color")) {
		parse_color(data, valueStart, valueEnd, &water->vertices[3], true);
	} else if (string_equals(data, fieldStart, fieldEnd, "DiffuseColor")) {
		parse_color(data, valueStart, valueEnd, &water->diffuse, true);
	} else if (string_equals(data, fieldStart, fieldEnd, "TransparentDiffuseColor")) {
		parse_color(data, valueStart, valueEnd, &water->transparentDiffuse, true);
	} else if (string_equals(data, fieldStart, fieldEnd, "UScrollPerMS")) {
		parse_real_scaled(data, valueStart, valueEnd, &water->uScrollPerMsX10000);
	} else if (string_equals(data, fieldStart, fieldEnd, "VScrollPerMS")) {
		parse_real_scaled(data, valueStart, valueEnd, &water->vScrollPerMsX10000);
	} else if (string_equals(data, fieldStart, fieldEnd, "SkyTexelsPerUnit")) {
		parse_real_scaled(data, valueStart, valueEnd, &water->skyTexelsPerUnitX10000);
	} else if (string_equals(data, fieldStart, fieldEnd, "WaterRepeatCount")) {
		parse_int(data, valueStart, valueEnd, &water->waterRepeatCount);
	} else {
		parsed = 0;
	}

	if (parsed) {
		count_field(&water->fieldCount);
	}
}

static void parse_transparency_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd)
{
	TransparencyRecord *transparency = &g_transparencies[g_current_index];
	int parsed = 1;
	if (string_equals(data, fieldStart, fieldEnd, "TransparentWaterDepth")) {
		parse_real_scaled(data, valueStart, valueEnd, &transparency->transparentWaterDepthX10000);
	} else if (string_equals(data, fieldStart, fieldEnd, "TransparentWaterMinOpacity")) {
		parse_real_scaled(data, valueStart, valueEnd, &transparency->minWaterOpacityX10000);
	} else if (string_equals(data, fieldStart, fieldEnd, "StandingWaterColor")) {
		parse_color(data, valueStart, valueEnd, &transparency->standingWaterColor, false);
	} else if (string_equals(data, fieldStart, fieldEnd, "StandingWaterTexture")) {
		assign_token_string(&transparency->standingWaterTexture, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "AdditiveBlending")) {
		parse_bool_value(data, valueStart, valueEnd, &transparency->additiveBlending);
	} else if (string_equals(data, fieldStart, fieldEnd, "RadarWaterColor")) {
		parse_color(data, valueStart, valueEnd, &transparency->radarWaterColor, false);
	} else if (string_equals(data, fieldStart, fieldEnd, "SkyboxTextureN")) {
		assign_token_string(&transparency->skyboxTextureN, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "SkyboxTextureE")) {
		assign_token_string(&transparency->skyboxTextureE, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "SkyboxTextureS")) {
		assign_token_string(&transparency->skyboxTextureS, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "SkyboxTextureW")) {
		assign_token_string(&transparency->skyboxTextureW, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "SkyboxTextureT")) {
		assign_token_string(&transparency->skyboxTextureT, data, valueStart, valueEnd);
	} else {
		parsed = 0;
	}

	if (parsed) {
		count_field(&transparency->fieldCount);
	}
}

static void parse_weather_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd)
{
	WeatherRecord *weather = &g_weathers[g_current_index];
	int parsed = 1;
	if (string_equals(data, fieldStart, fieldEnd, "SnowTexture")) {
		assign_token_string(&weather->snowTexture, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "SnowFrequencyScaleX")) {
		parse_real_scaled(data, valueStart, valueEnd, &weather->snowFrequencyScaleXX10000);
	} else if (string_equals(data, fieldStart, fieldEnd, "SnowFrequencyScaleY")) {
		parse_real_scaled(data, valueStart, valueEnd, &weather->snowFrequencyScaleYX10000);
	} else if (string_equals(data, fieldStart, fieldEnd, "SnowAmplitude")) {
		parse_real_scaled(data, valueStart, valueEnd, &weather->snowAmplitudeX10000);
	} else if (string_equals(data, fieldStart, fieldEnd, "SnowPointSize")) {
		parse_real_scaled(data, valueStart, valueEnd, &weather->snowPointSizeX10000);
	} else if (string_equals(data, fieldStart, fieldEnd, "SnowMaxPointSize")) {
		parse_real_scaled(data, valueStart, valueEnd, &weather->snowMaxPointSizeX10000);
	} else if (string_equals(data, fieldStart, fieldEnd, "SnowMinPointSize")) {
		parse_real_scaled(data, valueStart, valueEnd, &weather->snowMinPointSizeX10000);
	} else if (string_equals(data, fieldStart, fieldEnd, "SnowQuadSize")) {
		parse_real_scaled(data, valueStart, valueEnd, &weather->snowQuadSizeX10000);
	} else if (string_equals(data, fieldStart, fieldEnd, "SnowBoxDimensions")) {
		parse_real_scaled(data, valueStart, valueEnd, &weather->snowBoxDimensionsX10000);
	} else if (string_equals(data, fieldStart, fieldEnd, "SnowBoxDensity")) {
		parse_real_scaled(data, valueStart, valueEnd, &weather->snowBoxDensityX10000);
	} else if (string_equals(data, fieldStart, fieldEnd, "SnowVelocity")) {
		parse_real_scaled(data, valueStart, valueEnd, &weather->snowVelocityX10000);
	} else if (string_equals(data, fieldStart, fieldEnd, "SnowPointSprites")) {
		parse_bool_value(data, valueStart, valueEnd, &weather->usePointSprites);
	} else if (string_equals(data, fieldStart, fieldEnd, "SnowEnabled")) {
		parse_bool_value(data, valueStart, valueEnd, &weather->snowEnabled);
	} else {
		parsed = 0;
	}

	if (parsed) {
		count_field(&weather->fieldCount);
	}
}

static void parse_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd)
{
	if (g_current_block_type == 0 || g_current_index < 0) {
		return;
	}

	trim_range(data, &fieldStart, &fieldEnd);
	trim_range(data, &valueStart, &valueEnd);
	if (fieldStart >= fieldEnd) {
		return;
	}

	if (g_current_block_type == 1) {
		parse_water_assignment(data, fieldStart, fieldEnd, valueStart, valueEnd);
	} else if (g_current_block_type == 2) {
		parse_transparency_assignment(data, fieldStart, fieldEnd, valueStart, valueEnd);
	} else if (g_current_block_type == 3) {
		parse_weather_assignment(data, fieldStart, fieldEnd, valueStart, valueEnd);
	}
}

static int string_field_ptr(StringField field)
{
	return field.offset >= 0 ? (int)(g_generals_environment_names + field.offset) : 0;
}

static StringField empty_string()
{
	StringField field;
	clear_string(&field);
	return field;
}

static StringField water_string(int index, int field)
{
	if (index < 0 || index >= g_water_set_count) {
		return empty_string();
	}
	if (field == 0) {
		return g_water_sets[index].name;
	}
	if (field == 1) {
		return g_water_sets[index].skyTexture;
	}
	return g_water_sets[index].waterTexture;
}

static StringField transparency_string(int index, int field)
{
	if (index < 0 || index >= g_transparency_count) {
		return empty_string();
	}
	if (field == 0) {
		return g_transparencies[index].standingWaterTexture;
	}
	if (field == 1) {
		return g_transparencies[index].skyboxTextureN;
	}
	if (field == 2) {
		return g_transparencies[index].skyboxTextureE;
	}
	if (field == 3) {
		return g_transparencies[index].skyboxTextureS;
	}
	if (field == 4) {
		return g_transparencies[index].skyboxTextureW;
	}
	return g_transparencies[index].skyboxTextureT;
}

__attribute__((used, visibility("default"))) int generals_environment_input_ptr()
{
	return (int)g_generals_environment_input;
}

__attribute__((used, visibility("default"))) int generals_environment_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_environment_parse(int inputSize)
{
	reset_state();

	if (inputSize < 0 || inputSize > INPUT_CAPACITY) {
		g_error_count = 1;
		return -1;
	}

	const char *data = (const char *)g_generals_environment_input;
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

	return g_water_set_count + g_transparency_count + g_weather_count;
}

__attribute__((used, visibility("default"))) int generals_environment_water_set_count()
{
	return g_water_set_count;
}

__attribute__((used, visibility("default"))) int generals_environment_transparency_count()
{
	return g_transparency_count;
}

__attribute__((used, visibility("default"))) int generals_environment_weather_count()
{
	return g_weather_count;
}

__attribute__((used, visibility("default"))) int generals_environment_field_count()
{
	return g_field_count;
}

__attribute__((used, visibility("default"))) int generals_environment_line_count()
{
	return g_line_count;
}

__attribute__((used, visibility("default"))) int generals_environment_error_count()
{
	return g_error_count;
}

__attribute__((used, visibility("default"))) int generals_environment_water_set_name_ptr(int index)
{
	return string_field_ptr(water_string(index, 0));
}

__attribute__((used, visibility("default"))) int generals_environment_water_set_name_size(int index)
{
	return water_string(index, 0).size;
}

__attribute__((used, visibility("default"))) int generals_environment_water_set_sky_texture_ptr(int index)
{
	return string_field_ptr(water_string(index, 1));
}

__attribute__((used, visibility("default"))) int generals_environment_water_set_sky_texture_size(int index)
{
	return water_string(index, 1).size;
}

__attribute__((used, visibility("default"))) int generals_environment_water_set_water_texture_ptr(int index)
{
	return string_field_ptr(water_string(index, 2));
}

__attribute__((used, visibility("default"))) int generals_environment_water_set_water_texture_size(int index)
{
	return water_string(index, 2).size;
}

__attribute__((used, visibility("default"))) int generals_environment_water_set_line(int index)
{
	return index >= 0 && index < g_water_set_count ? g_water_sets[index].line : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_water_set_field_count_at(int index)
{
	return index >= 0 && index < g_water_set_count ? g_water_sets[index].fieldCount : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_water_set_vertex_r(int index, int corner)
{
	return index >= 0 && index < g_water_set_count && corner >= 0 && corner < 4 ? g_water_sets[index].vertices[corner].r : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_water_set_vertex_g(int index, int corner)
{
	return index >= 0 && index < g_water_set_count && corner >= 0 && corner < 4 ? g_water_sets[index].vertices[corner].g : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_water_set_vertex_b(int index, int corner)
{
	return index >= 0 && index < g_water_set_count && corner >= 0 && corner < 4 ? g_water_sets[index].vertices[corner].b : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_water_set_vertex_a(int index, int corner)
{
	return index >= 0 && index < g_water_set_count && corner >= 0 && corner < 4 ? g_water_sets[index].vertices[corner].a : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_water_set_diffuse_r(int index)
{
	return index >= 0 && index < g_water_set_count ? g_water_sets[index].diffuse.r : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_water_set_diffuse_g(int index)
{
	return index >= 0 && index < g_water_set_count ? g_water_sets[index].diffuse.g : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_water_set_diffuse_b(int index)
{
	return index >= 0 && index < g_water_set_count ? g_water_sets[index].diffuse.b : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_water_set_diffuse_a(int index)
{
	return index >= 0 && index < g_water_set_count ? g_water_sets[index].diffuse.a : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_water_set_transparent_diffuse_r(int index)
{
	return index >= 0 && index < g_water_set_count ? g_water_sets[index].transparentDiffuse.r : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_water_set_transparent_diffuse_g(int index)
{
	return index >= 0 && index < g_water_set_count ? g_water_sets[index].transparentDiffuse.g : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_water_set_transparent_diffuse_b(int index)
{
	return index >= 0 && index < g_water_set_count ? g_water_sets[index].transparentDiffuse.b : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_water_set_transparent_diffuse_a(int index)
{
	return index >= 0 && index < g_water_set_count ? g_water_sets[index].transparentDiffuse.a : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_water_set_u_scroll_per_ms_x10000(int index)
{
	return index >= 0 && index < g_water_set_count ? g_water_sets[index].uScrollPerMsX10000 : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_water_set_v_scroll_per_ms_x10000(int index)
{
	return index >= 0 && index < g_water_set_count ? g_water_sets[index].vScrollPerMsX10000 : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_water_set_sky_texels_per_unit_x10000(int index)
{
	return index >= 0 && index < g_water_set_count ? g_water_sets[index].skyTexelsPerUnitX10000 : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_water_set_repeat_count(int index)
{
	return index >= 0 && index < g_water_set_count ? g_water_sets[index].waterRepeatCount : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_transparency_standing_water_texture_ptr(int index)
{
	return string_field_ptr(transparency_string(index, 0));
}

__attribute__((used, visibility("default"))) int generals_environment_transparency_standing_water_texture_size(int index)
{
	return transparency_string(index, 0).size;
}

__attribute__((used, visibility("default"))) int generals_environment_transparency_skybox_texture_ptr(int index, int face)
{
	return string_field_ptr(transparency_string(index, face + 1));
}

__attribute__((used, visibility("default"))) int generals_environment_transparency_skybox_texture_size(int index, int face)
{
	return transparency_string(index, face + 1).size;
}

__attribute__((used, visibility("default"))) int generals_environment_transparency_line(int index)
{
	return index >= 0 && index < g_transparency_count ? g_transparencies[index].line : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_transparency_field_count_at(int index)
{
	return index >= 0 && index < g_transparency_count ? g_transparencies[index].fieldCount : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_transparency_depth_x10000(int index)
{
	return index >= 0 && index < g_transparency_count ? g_transparencies[index].transparentWaterDepthX10000 : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_transparency_min_opacity_x10000(int index)
{
	return index >= 0 && index < g_transparency_count ? g_transparencies[index].minWaterOpacityX10000 : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_transparency_standing_color_r(int index)
{
	return index >= 0 && index < g_transparency_count ? g_transparencies[index].standingWaterColor.r : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_transparency_standing_color_g(int index)
{
	return index >= 0 && index < g_transparency_count ? g_transparencies[index].standingWaterColor.g : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_transparency_standing_color_b(int index)
{
	return index >= 0 && index < g_transparency_count ? g_transparencies[index].standingWaterColor.b : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_transparency_radar_color_r(int index)
{
	return index >= 0 && index < g_transparency_count ? g_transparencies[index].radarWaterColor.r : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_transparency_radar_color_g(int index)
{
	return index >= 0 && index < g_transparency_count ? g_transparencies[index].radarWaterColor.g : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_transparency_radar_color_b(int index)
{
	return index >= 0 && index < g_transparency_count ? g_transparencies[index].radarWaterColor.b : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_transparency_additive_blending(int index)
{
	return index >= 0 && index < g_transparency_count ? g_transparencies[index].additiveBlending : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_weather_snow_texture_ptr(int index)
{
	return index >= 0 && index < g_weather_count ? string_field_ptr(g_weathers[index].snowTexture) : 0;
}

__attribute__((used, visibility("default"))) int generals_environment_weather_snow_texture_size(int index)
{
	return index >= 0 && index < g_weather_count ? g_weathers[index].snowTexture.size : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_weather_line(int index)
{
	return index >= 0 && index < g_weather_count ? g_weathers[index].line : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_weather_field_count_at(int index)
{
	return index >= 0 && index < g_weather_count ? g_weathers[index].fieldCount : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_weather_snow_frequency_scale_x_x10000(int index)
{
	return index >= 0 && index < g_weather_count ? g_weathers[index].snowFrequencyScaleXX10000 : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_weather_snow_frequency_scale_y_x10000(int index)
{
	return index >= 0 && index < g_weather_count ? g_weathers[index].snowFrequencyScaleYX10000 : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_weather_snow_amplitude_x10000(int index)
{
	return index >= 0 && index < g_weather_count ? g_weathers[index].snowAmplitudeX10000 : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_weather_snow_point_size_x10000(int index)
{
	return index >= 0 && index < g_weather_count ? g_weathers[index].snowPointSizeX10000 : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_weather_snow_max_point_size_x10000(int index)
{
	return index >= 0 && index < g_weather_count ? g_weathers[index].snowMaxPointSizeX10000 : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_weather_snow_min_point_size_x10000(int index)
{
	return index >= 0 && index < g_weather_count ? g_weathers[index].snowMinPointSizeX10000 : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_weather_snow_quad_size_x10000(int index)
{
	return index >= 0 && index < g_weather_count ? g_weathers[index].snowQuadSizeX10000 : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_weather_snow_box_dimensions_x10000(int index)
{
	return index >= 0 && index < g_weather_count ? g_weathers[index].snowBoxDimensionsX10000 : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_weather_snow_box_density_x10000(int index)
{
	return index >= 0 && index < g_weather_count ? g_weathers[index].snowBoxDensityX10000 : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_weather_snow_velocity_x10000(int index)
{
	return index >= 0 && index < g_weather_count ? g_weathers[index].snowVelocityX10000 : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_weather_use_point_sprites(int index)
{
	return index >= 0 && index < g_weather_count ? g_weathers[index].usePointSprites : -1;
}

__attribute__((used, visibility("default"))) int generals_environment_weather_snow_enabled(int index)
{
	return index >= 0 && index < g_weather_count ? g_weathers[index].snowEnabled : -1;
}

}
