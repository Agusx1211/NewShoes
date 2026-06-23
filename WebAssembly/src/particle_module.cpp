extern "C" {

static const int INPUT_CAPACITY = 3 * 1024 * 1024;
static const int MAX_TEMPLATES = 2048;
static const int NAME_CAPACITY = 4 * 1024 * 1024;
static const int SHADER_COUNT = 5;
static const int PARTICLE_TYPE_COUNT = 6;
static const int PRIORITY_COUNT = 14;
static const int VELOCITY_TYPE_COUNT = 6;
static const int VOLUME_TYPE_COUNT = 6;

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

struct RangeValue
{
	int lowX100;
	int highX100;
};

struct ParticleTemplateRecord
{
	int nameOffset;
	int nameSize;
	int particleNameOffset;
	int particleNameSize;
	int slaveSystemOffset;
	int slaveSystemSize;
	int attachedSystemOffset;
	int attachedSystemSize;
	int line;
	int fieldCount;
	int priority;
	int shader;
	int type;
	int velocityType;
	int volumeType;
	int isOneShot;
	int systemLifetime;
	RangeValue lifetime;
	RangeValue size;
	RangeValue burstDelay;
	RangeValue burstCount;
	RangeValue initialDelay;
	int gravityX100;
	int volumeRadiusX100;
	int volumeLengthX100;
	int isHollow;
	int isGroundAligned;
	int isEmitAboveGroundOnly;
	int isParticleUpTowardsEmitter;
	int finalized;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_particle_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_particle_names[NAME_CAPACITY];

static ParticleTemplateRecord g_generals_particle_templates[MAX_TEMPLATES];
static int g_generals_particle_template_count = 0;
static int g_generals_particle_field_count = 0;
static int g_generals_particle_line_count = 0;
static int g_generals_particle_error_count = 0;
static int g_generals_particle_name_cursor = 0;
static int g_generals_particle_shader_counts[SHADER_COUNT];
static int g_generals_particle_type_counts[PARTICLE_TYPE_COUNT];
static int g_generals_particle_priority_counts[PRIORITY_COUNT];
static int g_generals_particle_velocity_counts[VELOCITY_TYPE_COUNT];
static int g_generals_particle_volume_counts[VOLUME_TYPE_COUNT];

static const char *SHADER_NAMES[SHADER_COUNT] = {
	"NONE",
	"ADDITIVE",
	"ALPHA",
	"ALPHA_TEST",
	"MULTIPLY",
};

static const char *PARTICLE_TYPE_NAMES[PARTICLE_TYPE_COUNT] = {
	"NONE",
	"PARTICLE",
	"DRAWABLE",
	"STREAK",
	"VOLUME_PARTICLE",
	"SMUDGE",
};

static const char *PRIORITY_NAMES[PRIORITY_COUNT] = {
	"NONE",
	"WEAPON_EXPLOSION",
	"SCORCHMARK",
	"DUST_TRAIL",
	"BUILDUP",
	"DEBRIS_TRAIL",
	"UNIT_DAMAGE_FX",
	"DEATH_EXPLOSION",
	"SEMI_CONSTANT",
	"CONSTANT",
	"WEAPON_TRAIL",
	"AREA_EFFECT",
	"CRITICAL",
	"ALWAYS_RENDER",
};

static const char *VELOCITY_TYPE_NAMES[VELOCITY_TYPE_COUNT] = {
	"NONE",
	"ORTHO",
	"SPHERICAL",
	"HEMISPHERICAL",
	"CYLINDRICAL",
	"OUTWARD",
};

static const char *VOLUME_TYPE_NAMES[VOLUME_TYPE_COUNT] = {
	"NONE",
	"POINT",
	"LINE",
	"BOX",
	"SPHERE",
	"CYLINDER",
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
	if (valueSize < 0 || g_generals_particle_name_cursor + valueSize + 1 > NAME_CAPACITY) {
		return -1;
	}

	const int offset = g_generals_particle_name_cursor;
	for (int index = 0; index < valueSize; ++index) {
		g_generals_particle_names[g_generals_particle_name_cursor++] = value[index];
	}
	g_generals_particle_names[g_generals_particle_name_cursor++] = 0;
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
		++g_generals_particle_error_count;
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

static int parse_range_x100(const char *data, int start, int end, RangeValue *range)
{
	int cursor = start;
	TokenRange lowToken;
	TokenRange highToken;
	if (!next_token(data, &cursor, end, &lowToken)) {
		return 0;
	}
	if (!next_token(data, &cursor, end, &highToken)) {
		highToken = lowToken;
	}

	return parse_real_x100(data, lowToken.start, lowToken.end, &range->lowX100) &&
		parse_real_x100(data, highToken.start, highToken.end, &range->highX100);
}

static int parse_bool(const char *data, int start, int end, int *value)
{
	int cursor = start;
	TokenRange token;
	if (!next_token(data, &cursor, end, &token)) {
		return 0;
	}

	if (token_equals(data, token, "Yes") || token_equals(data, token, "True") || token_equals(data, token, "1")) {
		*value = 1;
		return 1;
	}
	if (token_equals(data, token, "No") || token_equals(data, token, "False") || token_equals(data, token, "0")) {
		*value = 0;
		return 1;
	}

	return 0;
}

static int lookup_name(const char *data, int start, int end, const char **names, int count)
{
	int cursor = start;
	TokenRange token;
	if (!next_token(data, &cursor, end, &token)) {
		return -1;
	}

	for (int index = 0; index < count; ++index) {
		if (token_equals(data, token, names[index])) {
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

static void init_template_defaults(ParticleTemplateRecord *record)
{
	record->particleNameOffset = -1;
	record->particleNameSize = 0;
	record->slaveSystemOffset = -1;
	record->slaveSystemSize = 0;
	record->attachedSystemOffset = -1;
	record->attachedSystemSize = 0;
	record->fieldCount = 0;
	record->priority = 0;
	record->shader = 0;
	record->type = 0;
	record->velocityType = 0;
	record->volumeType = 0;
	record->isOneShot = 0;
	record->systemLifetime = 0;
	record->lifetime = { 0, 0 };
	record->size = { 0, 0 };
	record->burstDelay = { 0, 0 };
	record->burstCount = { 0, 0 };
	record->initialDelay = { 0, 0 };
	record->gravityX100 = 0;
	record->volumeRadiusX100 = 0;
	record->volumeLengthX100 = 0;
	record->isHollow = 0;
	record->isGroundAligned = 0;
	record->isEmitAboveGroundOnly = 0;
	record->isParticleUpTowardsEmitter = 0;
	record->finalized = 0;
}

static int start_template(const char *data, TokenRange name, int line)
{
	if (g_generals_particle_template_count >= MAX_TEMPLATES) {
		++g_generals_particle_error_count;
		return -1;
	}

	const int nameSize = name.end - name.start;
	const int nameOffset = store_string(data + name.start, nameSize);
	if (nameOffset < 0) {
		++g_generals_particle_error_count;
		return -1;
	}

	const int templateIndex = g_generals_particle_template_count++;
	ParticleTemplateRecord *record = &g_generals_particle_templates[templateIndex];
	record->nameOffset = nameOffset;
	record->nameSize = nameSize;
	record->line = line;
	init_template_defaults(record);
	return templateIndex;
}

static void parse_property(int templateIndex, const char *data, int keyStart, int keyEnd, int valueStart, int valueEnd)
{
	if (templateIndex < 0 || templateIndex >= g_generals_particle_template_count) {
		++g_generals_particle_error_count;
		return;
	}

	ParticleTemplateRecord *record = &g_generals_particle_templates[templateIndex];
	++record->fieldCount;
	++g_generals_particle_field_count;

	if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Priority")) {
		record->priority = lookup_name(data, valueStart, valueEnd, PRIORITY_NAMES, PRIORITY_COUNT);
		if (record->priority < 0) {
			++g_generals_particle_error_count;
			record->priority = 0;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "IsOneShot")) {
		if (!parse_bool(data, valueStart, valueEnd, &record->isOneShot)) {
			++g_generals_particle_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Shader")) {
		record->shader = lookup_name(data, valueStart, valueEnd, SHADER_NAMES, SHADER_COUNT);
		if (record->shader < 0) {
			++g_generals_particle_error_count;
			record->shader = 0;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Type")) {
		record->type = lookup_name(data, valueStart, valueEnd, PARTICLE_TYPE_NAMES, PARTICLE_TYPE_COUNT);
		if (record->type < 0) {
			++g_generals_particle_error_count;
			record->type = 0;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ParticleName")) {
		set_string_field(&record->particleNameOffset, &record->particleNameSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "SlaveSystem")) {
		set_string_field(&record->slaveSystemOffset, &record->slaveSystemSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "PerParticleAttachedSystem")) {
		set_string_field(&record->attachedSystemOffset, &record->attachedSystemSize, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Lifetime")) {
		if (!parse_range_x100(data, valueStart, valueEnd, &record->lifetime)) {
			++g_generals_particle_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "SystemLifetime")) {
		if (!parse_first_int(data, valueStart, valueEnd, &record->systemLifetime)) {
			++g_generals_particle_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Size")) {
		if (!parse_range_x100(data, valueStart, valueEnd, &record->size)) {
			++g_generals_particle_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "BurstDelay")) {
		if (!parse_range_x100(data, valueStart, valueEnd, &record->burstDelay)) {
			++g_generals_particle_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "BurstCount")) {
		if (!parse_range_x100(data, valueStart, valueEnd, &record->burstCount)) {
			++g_generals_particle_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "InitialDelay")) {
		if (!parse_range_x100(data, valueStart, valueEnd, &record->initialDelay)) {
			++g_generals_particle_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Gravity")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->gravityX100)) {
			++g_generals_particle_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "VelocityType")) {
		record->velocityType = lookup_name(data, valueStart, valueEnd, VELOCITY_TYPE_NAMES, VELOCITY_TYPE_COUNT);
		if (record->velocityType < 0) {
			++g_generals_particle_error_count;
			record->velocityType = 0;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "VolumeType")) {
		record->volumeType = lookup_name(data, valueStart, valueEnd, VOLUME_TYPE_NAMES, VOLUME_TYPE_COUNT);
		if (record->volumeType < 0) {
			++g_generals_particle_error_count;
			record->volumeType = 0;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "VolSphereRadius") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "VolCylinderRadius")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->volumeRadiusX100)) {
			++g_generals_particle_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "VolCylinderLength")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->volumeLengthX100)) {
			++g_generals_particle_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "IsHollow")) {
		if (!parse_bool(data, valueStart, valueEnd, &record->isHollow)) {
			++g_generals_particle_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "IsGroundAligned")) {
		if (!parse_bool(data, valueStart, valueEnd, &record->isGroundAligned)) {
			++g_generals_particle_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "IsEmitAboveGroundOnly")) {
		if (!parse_bool(data, valueStart, valueEnd, &record->isEmitAboveGroundOnly)) {
			++g_generals_particle_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "IsParticleUpTowardsEmitter")) {
		if (!parse_bool(data, valueStart, valueEnd, &record->isParticleUpTowardsEmitter)) {
			++g_generals_particle_error_count;
		}
	}
}

static void parse_assignment(int templateIndex, const char *data, int contentStart, int contentEnd)
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

	parse_property(templateIndex, data, keyStart, keyEnd, valueStart, valueEnd);
}

static void reset_parser()
{
	g_generals_particle_template_count = 0;
	g_generals_particle_field_count = 0;
	g_generals_particle_line_count = 0;
	g_generals_particle_error_count = 0;
	g_generals_particle_name_cursor = 0;
	for (int index = 0; index < SHADER_COUNT; ++index) {
		g_generals_particle_shader_counts[index] = 0;
	}
	for (int index = 0; index < PARTICLE_TYPE_COUNT; ++index) {
		g_generals_particle_type_counts[index] = 0;
	}
	for (int index = 0; index < PRIORITY_COUNT; ++index) {
		g_generals_particle_priority_counts[index] = 0;
	}
	for (int index = 0; index < VELOCITY_TYPE_COUNT; ++index) {
		g_generals_particle_velocity_counts[index] = 0;
	}
	for (int index = 0; index < VOLUME_TYPE_COUNT; ++index) {
		g_generals_particle_volume_counts[index] = 0;
	}
}

static void finalize_template(int templateIndex)
{
	if (templateIndex < 0 || templateIndex >= g_generals_particle_template_count) {
		return;
	}

	ParticleTemplateRecord *record = &g_generals_particle_templates[templateIndex];
	if (record->finalized) {
		return;
	}

	record->finalized = 1;
	if (record->shader >= 0 && record->shader < SHADER_COUNT) {
		++g_generals_particle_shader_counts[record->shader];
	}
	if (record->type >= 0 && record->type < PARTICLE_TYPE_COUNT) {
		++g_generals_particle_type_counts[record->type];
	}
	if (record->priority >= 0 && record->priority < PRIORITY_COUNT) {
		++g_generals_particle_priority_counts[record->priority];
	}
	if (record->velocityType >= 0 && record->velocityType < VELOCITY_TYPE_COUNT) {
		++g_generals_particle_velocity_counts[record->velocityType];
	}
	if (record->volumeType >= 0 && record->volumeType < VOLUME_TYPE_COUNT) {
		++g_generals_particle_volume_counts[record->volumeType];
	}
}

static int enum_name_ptr(const char **names, int count, int index)
{
	if (index < 0 || index >= count) {
		return 0;
	}

	return (int)names[index];
}

static int enum_name_size(const char **names, int count, int index)
{
	if (index < 0 || index >= count) {
		return -1;
	}

	return string_length(names[index]);
}

static int template_string_ptr(int index, int offset)
{
	if (index < 0 || index >= g_generals_particle_template_count || offset < 0) {
		return 0;
	}

	return (int)(g_generals_particle_names + offset);
}

__attribute__((used, visibility("default"))) unsigned int generals_particle_input_ptr()
{
	return (unsigned int)g_generals_particle_input;
}

__attribute__((used, visibility("default"))) int generals_particle_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_particle_parse(int size)
{
	reset_parser();
	if (size < 0 || size > INPUT_CAPACITY) {
		g_generals_particle_error_count = 1;
		return -1;
	}

	const char *data = (const char *)g_generals_particle_input;
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
				if (token_equals(data, first, "ParticleSystem")) {
					if (activeTemplate >= 0) {
						finalize_template(activeTemplate);
					}
					TokenRange name;
					if (next_token(data, &tokenCursor, contentEnd, &name)) {
						activeTemplate = start_template(data, name, line);
					} else {
						++g_generals_particle_error_count;
					}
				} else if (token_equals(data, first, "End")) {
					if (activeTemplate >= 0) {
						finalize_template(activeTemplate);
						activeTemplate = -1;
					}
				} else if (activeTemplate >= 0 && find_equals(data, contentStart, contentEnd) >= 0) {
					parse_assignment(activeTemplate, data, contentStart, contentEnd);
				}
			}
		}

		lineStart = cursor + 1;
		++line;
	}

	if (activeTemplate >= 0) {
		finalize_template(activeTemplate);
	}

	g_generals_particle_line_count = line - 1;
	return g_generals_particle_error_count == 0 ? g_generals_particle_template_count : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_count()
{
	return g_generals_particle_template_count;
}

__attribute__((used, visibility("default"))) int generals_particle_field_count()
{
	return g_generals_particle_field_count;
}

__attribute__((used, visibility("default"))) int generals_particle_line_count()
{
	return g_generals_particle_line_count;
}

__attribute__((used, visibility("default"))) int generals_particle_error_count()
{
	return g_generals_particle_error_count;
}

__attribute__((used, visibility("default"))) int generals_particle_shader_count(int index)
{
	return index >= 0 && index < SHADER_COUNT ? g_generals_particle_shader_counts[index] : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_type_count(int index)
{
	return index >= 0 && index < PARTICLE_TYPE_COUNT ? g_generals_particle_type_counts[index] : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_priority_count(int index)
{
	return index >= 0 && index < PRIORITY_COUNT ? g_generals_particle_priority_counts[index] : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_velocity_count(int index)
{
	return index >= 0 && index < VELOCITY_TYPE_COUNT ? g_generals_particle_velocity_counts[index] : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_volume_count(int index)
{
	return index >= 0 && index < VOLUME_TYPE_COUNT ? g_generals_particle_volume_counts[index] : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_shader_name_ptr(int index)
{
	return enum_name_ptr(SHADER_NAMES, SHADER_COUNT, index);
}

__attribute__((used, visibility("default"))) int generals_particle_shader_name_size(int index)
{
	return enum_name_size(SHADER_NAMES, SHADER_COUNT, index);
}

__attribute__((used, visibility("default"))) int generals_particle_type_name_ptr(int index)
{
	return enum_name_ptr(PARTICLE_TYPE_NAMES, PARTICLE_TYPE_COUNT, index);
}

__attribute__((used, visibility("default"))) int generals_particle_type_name_size(int index)
{
	return enum_name_size(PARTICLE_TYPE_NAMES, PARTICLE_TYPE_COUNT, index);
}

__attribute__((used, visibility("default"))) int generals_particle_priority_name_ptr(int index)
{
	return enum_name_ptr(PRIORITY_NAMES, PRIORITY_COUNT, index);
}

__attribute__((used, visibility("default"))) int generals_particle_priority_name_size(int index)
{
	return enum_name_size(PRIORITY_NAMES, PRIORITY_COUNT, index);
}

__attribute__((used, visibility("default"))) int generals_particle_velocity_name_ptr(int index)
{
	return enum_name_ptr(VELOCITY_TYPE_NAMES, VELOCITY_TYPE_COUNT, index);
}

__attribute__((used, visibility("default"))) int generals_particle_velocity_name_size(int index)
{
	return enum_name_size(VELOCITY_TYPE_NAMES, VELOCITY_TYPE_COUNT, index);
}

__attribute__((used, visibility("default"))) int generals_particle_volume_name_ptr(int index)
{
	return enum_name_ptr(VOLUME_TYPE_NAMES, VOLUME_TYPE_COUNT, index);
}

__attribute__((used, visibility("default"))) int generals_particle_volume_name_size(int index)
{
	return enum_name_size(VOLUME_TYPE_NAMES, VOLUME_TYPE_COUNT, index);
}

__attribute__((used, visibility("default"))) int generals_particle_template_name_ptr(int index)
{
	return template_string_ptr(index, index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].nameOffset : -1);
}

__attribute__((used, visibility("default"))) int generals_particle_template_name_size(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].nameSize : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_particle_name_ptr(int index)
{
	return template_string_ptr(index, index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].particleNameOffset : -1);
}

__attribute__((used, visibility("default"))) int generals_particle_template_particle_name_size(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].particleNameSize : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_slave_system_ptr(int index)
{
	return template_string_ptr(index, index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].slaveSystemOffset : -1);
}

__attribute__((used, visibility("default"))) int generals_particle_template_slave_system_size(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].slaveSystemSize : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_attached_system_ptr(int index)
{
	return template_string_ptr(index, index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].attachedSystemOffset : -1);
}

__attribute__((used, visibility("default"))) int generals_particle_template_attached_system_size(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].attachedSystemSize : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_line(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].line : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_field_count_at(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].fieldCount : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_priority(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].priority : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_shader(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].shader : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_type(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].type : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_velocity_type(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].velocityType : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_volume_type(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].volumeType : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_is_one_shot(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].isOneShot : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_system_lifetime(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].systemLifetime : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_lifetime_low_x100(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].lifetime.lowX100 : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_lifetime_high_x100(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].lifetime.highX100 : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_size_low_x100(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].size.lowX100 : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_size_high_x100(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].size.highX100 : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_burst_delay_low_x100(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].burstDelay.lowX100 : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_burst_delay_high_x100(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].burstDelay.highX100 : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_burst_count_low_x100(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].burstCount.lowX100 : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_burst_count_high_x100(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].burstCount.highX100 : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_initial_delay_low_x100(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].initialDelay.lowX100 : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_initial_delay_high_x100(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].initialDelay.highX100 : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_gravity_x100(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].gravityX100 : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_volume_radius_x100(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].volumeRadiusX100 : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_volume_length_x100(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].volumeLengthX100 : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_is_hollow(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].isHollow : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_is_ground_aligned(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].isGroundAligned : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_is_emit_above_ground_only(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].isEmitAboveGroundOnly : -1;
}

__attribute__((used, visibility("default"))) int generals_particle_template_is_particle_up_towards_emitter(int index)
{
	return index >= 0 && index < g_generals_particle_template_count ? g_generals_particle_templates[index].isParticleUpTowardsEmitter : -1;
}

}
