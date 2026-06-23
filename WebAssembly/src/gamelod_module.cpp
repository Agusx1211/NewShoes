extern "C" {

static const int INPUT_CAPACITY = 128 * 1024;
static const int NAME_CAPACITY = 64 * 1024;
static const int MAX_STATIC_LODS = 8;
static const int MAX_DYNAMIC_LODS = 8;

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

struct StaticLodRecord
{
	StringField name;
	int line;
	int fieldCount;
	int minimumFps;
	int minimumProcessorFps;
	int sampleCount2D;
	int sampleCount3D;
	int streamCount;
	int maxParticleCount;
	int useShadowVolumes;
	int useShadowDecals;
	int useCloudMap;
	int useLightMap;
	int showSoftWaterEdge;
	int maxTankTrackEdges;
	int maxTankTrackOpaqueEdges;
	int maxTankTrackFadeDelay;
	int useBuildupScaffolds;
	int useTreeSway;
	int useEmissiveNightMaterials;
	int useHeatEffects;
	int textureReductionFactor;
};

struct DynamicLodRecord
{
	StringField name;
	StringField minParticlePriority;
	StringField minParticleSkipPriority;
	int line;
	int fieldCount;
	int minimumFps;
	int particleSkipMask;
	int debrisSkipMask;
	int slowDeathScaleX100;
};

enum BlockKind
{
	BLOCK_NONE = 0,
	BLOCK_STATIC_LOD = 1,
	BLOCK_DYNAMIC_LOD = 2,
};

__attribute__((used, visibility("default"))) unsigned char g_generals_gamelod_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_gamelod_names[NAME_CAPACITY];

static StaticLodRecord g_static_lods[MAX_STATIC_LODS];
static DynamicLodRecord g_dynamic_lods[MAX_DYNAMIC_LODS];
static int g_static_lod_count = 0;
static int g_dynamic_lod_count = 0;
static int g_parsed_count = 0;
static int g_field_count = 0;
static int g_line_count = 0;
static int g_error_count = 0;
static int g_name_cursor = 0;
static int g_current_block = BLOCK_NONE;
static int g_current_static = -1;
static int g_current_dynamic = -1;

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
		g_generals_gamelod_names[g_name_cursor++] = value[index];
	}
	g_generals_gamelod_names[g_name_cursor++] = 0;
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

static int parse_real_x100(const char *data, int start, int end)
{
	trim_range(data, &start, &end);
	int sign = 1;
	if (start < end && data[start] == '-') {
		sign = -1;
		++start;
	}

	int whole = 0;
	while (start < end && data[start] >= '0' && data[start] <= '9') {
		whole = whole * 10 + (data[start] - '0');
		++start;
	}

	int fraction = 0;
	int scale = 10;
	if (start < end && data[start] == '.') {
		++start;
		while (start < end && data[start] >= '0' && data[start] <= '9' && scale <= 100) {
			fraction += (data[start] - '0') * (100 / scale);
			scale *= 10;
			++start;
		}
	}

	return sign * (whole * 100 + fraction);
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

static void init_static_lod(StaticLodRecord *record)
{
	clear_string(&record->name);
	record->line = -1;
	record->fieldCount = 0;
	record->minimumFps = 0;
	record->minimumProcessorFps = 0;
	record->sampleCount2D = 0;
	record->sampleCount3D = 0;
	record->streamCount = 0;
	record->maxParticleCount = 0;
	record->useShadowVolumes = 0;
	record->useShadowDecals = 0;
	record->useCloudMap = 0;
	record->useLightMap = 0;
	record->showSoftWaterEdge = 0;
	record->maxTankTrackEdges = 0;
	record->maxTankTrackOpaqueEdges = 0;
	record->maxTankTrackFadeDelay = 0;
	record->useBuildupScaffolds = 0;
	record->useTreeSway = 0;
	record->useEmissiveNightMaterials = 0;
	record->useHeatEffects = 0;
	record->textureReductionFactor = 0;
}

static void init_dynamic_lod(DynamicLodRecord *record)
{
	clear_string(&record->name);
	clear_string(&record->minParticlePriority);
	clear_string(&record->minParticleSkipPriority);
	record->line = -1;
	record->fieldCount = 0;
	record->minimumFps = 0;
	record->particleSkipMask = 0;
	record->debrisSkipMask = 0;
	record->slowDeathScaleX100 = 100;
}

static void reset_state()
{
	g_static_lod_count = 0;
	g_dynamic_lod_count = 0;
	g_parsed_count = 0;
	g_field_count = 0;
	g_line_count = 0;
	g_error_count = 0;
	g_name_cursor = 0;
	g_current_block = BLOCK_NONE;
	g_current_static = -1;
	g_current_dynamic = -1;
}

static void start_static_lod(const char *data, int nameStart, int nameEnd, int line)
{
	if (g_static_lod_count >= MAX_STATIC_LODS) {
		++g_error_count;
		g_current_block = BLOCK_NONE;
		return;
	}

	StaticLodRecord *record = &g_static_lods[g_static_lod_count];
	init_static_lod(record);
	assign_token_string(&record->name, data, nameStart, nameEnd);
	record->line = line;
	g_current_static = g_static_lod_count++;
	g_current_dynamic = -1;
	g_current_block = BLOCK_STATIC_LOD;
	++g_parsed_count;
}

static void start_dynamic_lod(const char *data, int nameStart, int nameEnd, int line)
{
	if (g_dynamic_lod_count >= MAX_DYNAMIC_LODS) {
		++g_error_count;
		g_current_block = BLOCK_NONE;
		return;
	}

	DynamicLodRecord *record = &g_dynamic_lods[g_dynamic_lod_count];
	init_dynamic_lod(record);
	assign_token_string(&record->name, data, nameStart, nameEnd);
	record->line = line;
	g_current_dynamic = g_dynamic_lod_count++;
	g_current_static = -1;
	g_current_block = BLOCK_DYNAMIC_LOD;
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
		g_current_static = -1;
		g_current_dynamic = -1;
		return;
	}

	if (token_equals(data, token, "StaticGameLOD")) {
		start_static_lod(data, token.end, end, line);
	} else if (token_equals(data, token, "DynamicGameLOD")) {
		start_dynamic_lod(data, token.end, end, line);
	}
}

static void parse_static_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd)
{
	if (g_current_static < 0 || g_current_static >= g_static_lod_count) {
		return;
	}

	StaticLodRecord *record = &g_static_lods[g_current_static];
	int parsed = 1;
	if (string_equals(data, fieldStart, fieldEnd, "MinimumFPS")) {
		record->minimumFps = parse_int(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "MinimumProcessorFps")) {
		record->minimumProcessorFps = parse_int(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "SampleCount2D")) {
		record->sampleCount2D = parse_int(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "SampleCount3D")) {
		record->sampleCount3D = parse_int(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "StreamCount")) {
		record->streamCount = parse_int(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "MaxParticleCount")) {
		record->maxParticleCount = parse_int(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "UseShadowVolumes")) {
		record->useShadowVolumes = parse_bool(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "UseShadowDecals")) {
		record->useShadowDecals = parse_bool(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "UseCloudMap")) {
		record->useCloudMap = parse_bool(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "UseLightMap")) {
		record->useLightMap = parse_bool(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "ShowSoftWaterEdge")) {
		record->showSoftWaterEdge = parse_bool(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "MaxTankTrackEdges")) {
		record->maxTankTrackEdges = parse_int(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "MaxTankTrackOpaqueEdges")) {
		record->maxTankTrackOpaqueEdges = parse_int(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "MaxTankTrackFadeDelay")) {
		record->maxTankTrackFadeDelay = parse_int(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "UseBuildupScaffolds")) {
		record->useBuildupScaffolds = parse_bool(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "UseTreeSway")) {
		record->useTreeSway = parse_bool(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "UseEmissiveNightMaterials")) {
		record->useEmissiveNightMaterials = parse_bool(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "UseHeatEffects")) {
		record->useHeatEffects = parse_bool(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "TextureReductionFactor")) {
		record->textureReductionFactor = parse_int(data, valueStart, valueEnd);
	} else {
		parsed = 0;
	}

	if (parsed) {
		++record->fieldCount;
		++g_field_count;
	}
}

static void parse_dynamic_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd)
{
	if (g_current_dynamic < 0 || g_current_dynamic >= g_dynamic_lod_count) {
		return;
	}

	DynamicLodRecord *record = &g_dynamic_lods[g_current_dynamic];
	int parsed = 1;
	if (string_equals(data, fieldStart, fieldEnd, "MinimumFPS")) {
		record->minimumFps = parse_int(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "ParticleSkipMask")) {
		record->particleSkipMask = parse_int(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "DebrisSkipMask")) {
		record->debrisSkipMask = parse_int(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "SlowDeathScale")) {
		record->slowDeathScaleX100 = parse_real_x100(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "MinParticlePriority")) {
		assign_token_string(&record->minParticlePriority, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "MinParticleSkipPriority")) {
		assign_token_string(&record->minParticleSkipPriority, data, valueStart, valueEnd);
	} else {
		parsed = 0;
	}

	if (parsed) {
		++record->fieldCount;
		++g_field_count;
	}
}

static bool parse_lod_header_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd, int line)
{
	if (string_equals(data, fieldStart, fieldEnd, "StaticGameLOD")) {
		start_static_lod(data, valueStart, valueEnd, line);
		return true;
	}
	if (string_equals(data, fieldStart, fieldEnd, "DynamicGameLOD")) {
		start_dynamic_lod(data, valueStart, valueEnd, line);
		return true;
	}

	return false;
}

static void parse_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd, int line)
{
	trim_range(data, &fieldStart, &fieldEnd);
	trim_range(data, &valueStart, &valueEnd);

	if (parse_lod_header_assignment(data, fieldStart, fieldEnd, valueStart, valueEnd, line)) {
		return;
	}

	if (g_current_block == BLOCK_STATIC_LOD) {
		parse_static_assignment(data, fieldStart, fieldEnd, valueStart, valueEnd);
	} else if (g_current_block == BLOCK_DYNAMIC_LOD) {
		parse_dynamic_assignment(data, fieldStart, fieldEnd, valueStart, valueEnd);
	}
}

static int string_field_ptr(StringField field)
{
	return field.offset >= 0 ? (int)(g_generals_gamelod_names + field.offset) : 0;
}

__attribute__((used, visibility("default"))) int generals_gamelod_input_ptr()
{
	return (int)g_generals_gamelod_input;
}

__attribute__((used, visibility("default"))) int generals_gamelod_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_gamelod_parse(int inputSize)
{
	reset_state();

	if (inputSize < 0 || inputSize > INPUT_CAPACITY) {
		g_error_count = 1;
		return -1;
	}

	const char *data = (const char *)g_generals_gamelod_input;
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

__attribute__((used, visibility("default"))) int generals_gamelod_parsed_count()
{
	return g_parsed_count;
}

__attribute__((used, visibility("default"))) int generals_gamelod_field_count()
{
	return g_field_count;
}

__attribute__((used, visibility("default"))) int generals_gamelod_line_count()
{
	return g_line_count;
}

__attribute__((used, visibility("default"))) int generals_gamelod_error_count()
{
	return g_error_count;
}

__attribute__((used, visibility("default"))) int generals_gamelod_static_count()
{
	return g_static_lod_count;
}

__attribute__((used, visibility("default"))) int generals_gamelod_dynamic_count()
{
	return g_dynamic_lod_count;
}

__attribute__((used, visibility("default"))) int generals_gamelod_static_name_ptr(int index)
{
	return index >= 0 && index < g_static_lod_count ? string_field_ptr(g_static_lods[index].name) : 0;
}

__attribute__((used, visibility("default"))) int generals_gamelod_static_name_size(int index)
{
	return index >= 0 && index < g_static_lod_count ? g_static_lods[index].name.size : -1;
}

__attribute__((used, visibility("default"))) int generals_gamelod_static_line(int index)
{
	return index >= 0 && index < g_static_lod_count ? g_static_lods[index].line : -1;
}

__attribute__((used, visibility("default"))) int generals_gamelod_static_field_count_at(int index)
{
	return index >= 0 && index < g_static_lod_count ? g_static_lods[index].fieldCount : -1;
}

#define STATIC_GETTER(name, field) \
	__attribute__((used, visibility("default"))) int generals_gamelod_static_##name(int index) \
	{ \
		return index >= 0 && index < g_static_lod_count ? g_static_lods[index].field : -1; \
	}

STATIC_GETTER(minimum_fps, minimumFps)
STATIC_GETTER(minimum_processor_fps, minimumProcessorFps)
STATIC_GETTER(sample_count_2d, sampleCount2D)
STATIC_GETTER(sample_count_3d, sampleCount3D)
STATIC_GETTER(stream_count, streamCount)
STATIC_GETTER(max_particle_count, maxParticleCount)
STATIC_GETTER(use_shadow_volumes, useShadowVolumes)
STATIC_GETTER(use_shadow_decals, useShadowDecals)
STATIC_GETTER(use_cloud_map, useCloudMap)
STATIC_GETTER(use_light_map, useLightMap)
STATIC_GETTER(show_soft_water_edge, showSoftWaterEdge)
STATIC_GETTER(max_tank_track_edges, maxTankTrackEdges)
STATIC_GETTER(max_tank_track_opaque_edges, maxTankTrackOpaqueEdges)
STATIC_GETTER(max_tank_track_fade_delay, maxTankTrackFadeDelay)
STATIC_GETTER(use_buildup_scaffolds, useBuildupScaffolds)
STATIC_GETTER(use_tree_sway, useTreeSway)
STATIC_GETTER(use_emissive_night_materials, useEmissiveNightMaterials)
STATIC_GETTER(use_heat_effects, useHeatEffects)
STATIC_GETTER(texture_reduction_factor, textureReductionFactor)

#undef STATIC_GETTER

__attribute__((used, visibility("default"))) int generals_gamelod_dynamic_name_ptr(int index)
{
	return index >= 0 && index < g_dynamic_lod_count ? string_field_ptr(g_dynamic_lods[index].name) : 0;
}

__attribute__((used, visibility("default"))) int generals_gamelod_dynamic_name_size(int index)
{
	return index >= 0 && index < g_dynamic_lod_count ? g_dynamic_lods[index].name.size : -1;
}

__attribute__((used, visibility("default"))) int generals_gamelod_dynamic_min_particle_priority_ptr(int index)
{
	return index >= 0 && index < g_dynamic_lod_count ? string_field_ptr(g_dynamic_lods[index].minParticlePriority) : 0;
}

__attribute__((used, visibility("default"))) int generals_gamelod_dynamic_min_particle_priority_size(int index)
{
	return index >= 0 && index < g_dynamic_lod_count ? g_dynamic_lods[index].minParticlePriority.size : -1;
}

__attribute__((used, visibility("default"))) int generals_gamelod_dynamic_min_particle_skip_priority_ptr(int index)
{
	return index >= 0 && index < g_dynamic_lod_count ? string_field_ptr(g_dynamic_lods[index].minParticleSkipPriority) : 0;
}

__attribute__((used, visibility("default"))) int generals_gamelod_dynamic_min_particle_skip_priority_size(int index)
{
	return index >= 0 && index < g_dynamic_lod_count ? g_dynamic_lods[index].minParticleSkipPriority.size : -1;
}

__attribute__((used, visibility("default"))) int generals_gamelod_dynamic_line(int index)
{
	return index >= 0 && index < g_dynamic_lod_count ? g_dynamic_lods[index].line : -1;
}

__attribute__((used, visibility("default"))) int generals_gamelod_dynamic_field_count_at(int index)
{
	return index >= 0 && index < g_dynamic_lod_count ? g_dynamic_lods[index].fieldCount : -1;
}

__attribute__((used, visibility("default"))) int generals_gamelod_dynamic_minimum_fps(int index)
{
	return index >= 0 && index < g_dynamic_lod_count ? g_dynamic_lods[index].minimumFps : -1;
}

__attribute__((used, visibility("default"))) int generals_gamelod_dynamic_particle_skip_mask(int index)
{
	return index >= 0 && index < g_dynamic_lod_count ? g_dynamic_lods[index].particleSkipMask : -1;
}

__attribute__((used, visibility("default"))) int generals_gamelod_dynamic_debris_skip_mask(int index)
{
	return index >= 0 && index < g_dynamic_lod_count ? g_dynamic_lods[index].debrisSkipMask : -1;
}

__attribute__((used, visibility("default"))) int generals_gamelod_dynamic_slow_death_scale_x100(int index)
{
	return index >= 0 && index < g_dynamic_lod_count ? g_dynamic_lods[index].slowDeathScaleX100 : -1;
}

}
