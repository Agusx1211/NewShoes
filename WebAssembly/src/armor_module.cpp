extern "C" {

static const int INPUT_CAPACITY = 2 * 1024 * 1024;
static const int MAX_TEMPLATES = 1024;
static const int MAX_ASSIGNMENTS = 32768;
static const int NAME_CAPACITY = 512 * 1024;
static const int DAMAGE_TYPE_COUNT = 38;
static const int DEFAULT_PERCENT_X100 = 10000;

struct ArmorTemplateRecord
{
	int nameOffset;
	int nameSize;
	int line;
	int firstAssignment;
	int assignmentCount;
	int damagePercentX100[DAMAGE_TYPE_COUNT];
};

struct ArmorAssignmentRecord
{
	int templateIndex;
	int damageType;
	int percentX100;
	int line;
};

struct TokenRange
{
	int start;
	int end;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_armor_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_armor_names[NAME_CAPACITY];

static ArmorTemplateRecord g_generals_armor_templates[MAX_TEMPLATES];
static ArmorAssignmentRecord g_generals_armor_assignments[MAX_ASSIGNMENTS];
static int g_generals_armor_template_count = 0;
static int g_generals_armor_assignment_count = 0;
static int g_generals_armor_line_count = 0;
static int g_generals_armor_error_count = 0;
static int g_generals_armor_name_cursor = 0;

static const char *DAMAGE_NAMES[DAMAGE_TYPE_COUNT] = {
	"EXPLOSION",
	"CRUSH",
	"ARMOR_PIERCING",
	"SMALL_ARMS",
	"GATTLING",
	"RADIATION",
	"FLAME",
	"LASER",
	"SNIPER",
	"POISON",
	"HEALING",
	"UNRESISTABLE",
	"WATER",
	"DEPLOY",
	"SURRENDER",
	"HACK",
	"KILL_PILOT",
	"PENALTY",
	"FALLING",
	"MELEE",
	"DISARM",
	"HAZARD_CLEANUP",
	"PARTICLE_BEAM",
	"TOPPLING",
	"INFANTRY_MISSILE",
	"AURORA_BOMB",
	"LAND_MINE",
	"JET_MISSILES",
	"STEALTHJET_MISSILES",
	"MOLOTOV_COCKTAIL",
	"COMANCHE_VULCAN",
	"SUBDUAL_MISSILE",
	"SUBDUAL_VEHICLE",
	"SUBDUAL_BUILDING",
	"SUBDUAL_UNRESISTABLE",
	"MICROWAVE",
	"KILL_GARRISONED",
	"STATUS",
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

static bool range_has_equals(const char *data, int start, int end)
{
	bool inQuote = false;
	for (int index = start; index < end; ++index) {
		const char value = data[index];
		if (value == '"') {
			inQuote = !inQuote;
		} else if (value == '=' && !inQuote) {
			return true;
		}
	}

	return false;
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

static int store_name(const char *value, int valueSize)
{
	if (valueSize < 0 || g_generals_armor_name_cursor + valueSize + 1 > NAME_CAPACITY) {
		return -1;
	}

	const int offset = g_generals_armor_name_cursor;
	for (int index = 0; index < valueSize; ++index) {
		g_generals_armor_names[g_generals_armor_name_cursor++] = value[index];
	}
	g_generals_armor_names[g_generals_armor_name_cursor++] = 0;
	return offset;
}

static int find_damage_type(const char *value, int valueSize)
{
	for (int index = 0; index < DAMAGE_TYPE_COUNT; ++index) {
		if (ascii_equal_ignore_case(value, valueSize, DAMAGE_NAMES[index])) {
			return index;
		}
	}

	return -1;
}

static int parse_percent_x100(const char *data, int start, int end, int *percentX100)
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

	if (cursor < end && data[cursor] == '%') {
		++cursor;
	}

	if (cursor != end) {
		return 0;
	}

	int value = whole * 100 + fraction;
	if (negative) {
		value = -value;
	}

	*percentX100 = value;
	return 1;
}

static void reset_template_coefficients(ArmorTemplateRecord *record)
{
	for (int index = 0; index < DAMAGE_TYPE_COUNT; ++index) {
		record->damagePercentX100[index] = DEFAULT_PERCENT_X100;
	}
}

static int start_template(const char *data, TokenRange name, int line)
{
	if (g_generals_armor_template_count >= MAX_TEMPLATES) {
		++g_generals_armor_error_count;
		return -1;
	}

	const int nameSize = name.end - name.start;
	const int nameOffset = store_name(data + name.start, nameSize);
	if (nameOffset < 0) {
		++g_generals_armor_error_count;
		return -1;
	}

	const int templateIndex = g_generals_armor_template_count++;
	ArmorTemplateRecord *record = &g_generals_armor_templates[templateIndex];
	record->nameOffset = nameOffset;
	record->nameSize = nameSize;
	record->line = line;
	record->firstAssignment = g_generals_armor_assignment_count;
	record->assignmentCount = 0;
	reset_template_coefficients(record);
	return templateIndex;
}

static void apply_assignment(int templateIndex, const char *data, TokenRange damage, TokenRange percent, int line)
{
	if (templateIndex < 0 || templateIndex >= g_generals_armor_template_count) {
		++g_generals_armor_error_count;
		return;
	}

	int percentX100 = 0;
	if (!parse_percent_x100(data, percent.start, percent.end, &percentX100)) {
		++g_generals_armor_error_count;
		return;
	}

	int damageType = -1;
	if (!ascii_equal_ignore_case(data + damage.start, damage.end - damage.start, "Default")) {
		damageType = find_damage_type(data + damage.start, damage.end - damage.start);
		if (damageType < 0) {
			++g_generals_armor_error_count;
			return;
		}
	}

	if (g_generals_armor_assignment_count >= MAX_ASSIGNMENTS) {
		++g_generals_armor_error_count;
		return;
	}

	ArmorAssignmentRecord *assignment = &g_generals_armor_assignments[g_generals_armor_assignment_count++];
	assignment->templateIndex = templateIndex;
	assignment->damageType = damageType;
	assignment->percentX100 = percentX100;
	assignment->line = line;
	++g_generals_armor_templates[templateIndex].assignmentCount;

	if (damageType < 0) {
		for (int index = 0; index < DAMAGE_TYPE_COUNT; ++index) {
			g_generals_armor_templates[templateIndex].damagePercentX100[index] = percentX100;
		}
	} else {
		g_generals_armor_templates[templateIndex].damagePercentX100[damageType] = percentX100;
	}
}

__attribute__((used, visibility("default"))) unsigned int generals_armor_input_ptr()
{
	return (unsigned int)g_generals_armor_input;
}

__attribute__((used, visibility("default"))) int generals_armor_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_armor_damage_type_count()
{
	return DAMAGE_TYPE_COUNT;
}

__attribute__((used, visibility("default"))) int generals_armor_damage_type_name_ptr(int index)
{
	if (index < 0 || index >= DAMAGE_TYPE_COUNT) {
		return 0;
	}

	return (int)DAMAGE_NAMES[index];
}

__attribute__((used, visibility("default"))) int generals_armor_damage_type_name_size(int index)
{
	if (index < 0 || index >= DAMAGE_TYPE_COUNT) {
		return -1;
	}

	return string_length(DAMAGE_NAMES[index]);
}

__attribute__((used, visibility("default"))) int generals_armor_template_count()
{
	return g_generals_armor_template_count;
}

__attribute__((used, visibility("default"))) int generals_armor_assignment_count()
{
	return g_generals_armor_assignment_count;
}

__attribute__((used, visibility("default"))) int generals_armor_resolved_coefficient_count()
{
	return g_generals_armor_template_count * DAMAGE_TYPE_COUNT;
}

__attribute__((used, visibility("default"))) int generals_armor_line_count()
{
	return g_generals_armor_line_count;
}

__attribute__((used, visibility("default"))) int generals_armor_error_count()
{
	return g_generals_armor_error_count;
}

__attribute__((used, visibility("default"))) int generals_armor_template_name_ptr(int index)
{
	if (index < 0 || index >= g_generals_armor_template_count) {
		return 0;
	}

	return (int)(g_generals_armor_names + g_generals_armor_templates[index].nameOffset);
}

__attribute__((used, visibility("default"))) int generals_armor_template_name_size(int index)
{
	if (index < 0 || index >= g_generals_armor_template_count) {
		return -1;
	}

	return g_generals_armor_templates[index].nameSize;
}

__attribute__((used, visibility("default"))) int generals_armor_template_line(int index)
{
	if (index < 0 || index >= g_generals_armor_template_count) {
		return -1;
	}

	return g_generals_armor_templates[index].line;
}

__attribute__((used, visibility("default"))) int generals_armor_template_assignment_count(int index)
{
	if (index < 0 || index >= g_generals_armor_template_count) {
		return -1;
	}

	return g_generals_armor_templates[index].assignmentCount;
}

__attribute__((used, visibility("default"))) int generals_armor_template_first_assignment(int index)
{
	if (index < 0 || index >= g_generals_armor_template_count) {
		return -1;
	}

	return g_generals_armor_templates[index].firstAssignment;
}

__attribute__((used, visibility("default"))) int generals_armor_template_damage_percent_x100(int templateIndex, int damageType)
{
	if (templateIndex < 0 || templateIndex >= g_generals_armor_template_count ||
		damageType < 0 || damageType >= DAMAGE_TYPE_COUNT) {
		return -1;
	}

	return g_generals_armor_templates[templateIndex].damagePercentX100[damageType];
}

__attribute__((used, visibility("default"))) int generals_armor_assignment_template_index(int index)
{
	if (index < 0 || index >= g_generals_armor_assignment_count) {
		return -1;
	}

	return g_generals_armor_assignments[index].templateIndex;
}

__attribute__((used, visibility("default"))) int generals_armor_assignment_damage_type(int index)
{
	if (index < 0 || index >= g_generals_armor_assignment_count) {
		return -2;
	}

	return g_generals_armor_assignments[index].damageType;
}

__attribute__((used, visibility("default"))) int generals_armor_assignment_percent_x100(int index)
{
	if (index < 0 || index >= g_generals_armor_assignment_count) {
		return -1;
	}

	return g_generals_armor_assignments[index].percentX100;
}

__attribute__((used, visibility("default"))) int generals_armor_assignment_line(int index)
{
	if (index < 0 || index >= g_generals_armor_assignment_count) {
		return -1;
	}

	return g_generals_armor_assignments[index].line;
}

__attribute__((used, visibility("default"))) int generals_armor_parse(int inputSize)
{
	g_generals_armor_template_count = 0;
	g_generals_armor_assignment_count = 0;
	g_generals_armor_line_count = 0;
	g_generals_armor_error_count = 0;
	g_generals_armor_name_cursor = 0;

	if (inputSize < 0 || inputSize > INPUT_CAPACITY) {
		return -1;
	}

	int activeTemplate = -1;
	int lineStart = 0;
	while (lineStart < inputSize) {
		int lineEnd = lineStart;
		while (lineEnd < inputSize && g_generals_armor_input[lineEnd] != '\n') {
			++lineEnd;
		}

		++g_generals_armor_line_count;
		int contentStart = lineStart;
		int contentEnd = find_comment_start((const char *)g_generals_armor_input, lineStart, lineEnd);
		trim_range((const char *)g_generals_armor_input, &contentStart, &contentEnd);

		if (contentStart < contentEnd) {
			int cursor = contentStart;
			TokenRange first;
			if (!next_token((const char *)g_generals_armor_input, &cursor, contentEnd, &first)) {
				lineStart = lineEnd + 1;
				continue;
			}

			const bool isArmor = ascii_equal_ignore_case(
				(const char *)g_generals_armor_input + first.start,
				first.end - first.start,
				"Armor");
			const bool isEnd = ascii_equal_ignore_case(
				(const char *)g_generals_armor_input + first.start,
				first.end - first.start,
				"End");

			if (isEnd) {
				activeTemplate = -1;
			} else if (isArmor) {
				TokenRange second;
				if (!next_token((const char *)g_generals_armor_input, &cursor, contentEnd, &second)) {
					++g_generals_armor_error_count;
				} else if (range_has_equals((const char *)g_generals_armor_input, contentStart, contentEnd)) {
					TokenRange third;
					if (!next_token((const char *)g_generals_armor_input, &cursor, contentEnd, &third)) {
						++g_generals_armor_error_count;
					} else {
						apply_assignment(activeTemplate, (const char *)g_generals_armor_input, second, third, g_generals_armor_line_count);
					}
				} else {
					activeTemplate = start_template((const char *)g_generals_armor_input, second, g_generals_armor_line_count);
				}
			} else {
				++g_generals_armor_error_count;
			}
		}

		lineStart = lineEnd + 1;
	}

	return g_generals_armor_template_count;
}

}
