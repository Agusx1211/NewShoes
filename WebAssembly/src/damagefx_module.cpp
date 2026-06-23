extern "C" {

static const int INPUT_CAPACITY = 2 * 1024 * 1024;
static const int MAX_TEMPLATES = 512;
static const int MAX_ASSIGNMENTS = 8192;
static const int NAME_CAPACITY = 1024 * 1024;
static const int DAMAGE_TYPE_COUNT = 38;
static const int VETERANCY_COUNT = 4;
static const int FIELD_TYPE_COUNT = 4;

enum DamageFxFieldType
{
	FIELD_AMOUNT = 0,
	FIELD_MAJOR_FX = 1,
	FIELD_MINOR_FX = 2,
	FIELD_THROTTLE = 3,
};

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

struct DamageFxCell
{
	int amountX100;
	StringField majorFx;
	StringField minorFx;
	int throttleTime;
};

struct DamageFxTemplateRecord
{
	int nameOffset;
	int nameSize;
	int line;
	int firstAssignment;
	int assignmentCount;
};

struct DamageFxAssignmentRecord
{
	int templateIndex;
	int fieldType;
	int veterancy;
	int damageType;
	int expandedCount;
	int valueX100;
	int line;
	StringField text;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_damagefx_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_damagefx_names[NAME_CAPACITY];

static DamageFxTemplateRecord g_generals_damagefx_templates[MAX_TEMPLATES];
static DamageFxAssignmentRecord g_generals_damagefx_assignments[MAX_ASSIGNMENTS];
static DamageFxCell g_generals_damagefx_cells[MAX_TEMPLATES][DAMAGE_TYPE_COUNT][VETERANCY_COUNT];
static int g_generals_damagefx_template_count = 0;
static int g_generals_damagefx_assignment_count = 0;
static int g_generals_damagefx_resolved_update_count = 0;
static int g_generals_damagefx_amount_cell_count = 0;
static int g_generals_damagefx_major_fx_cell_count = 0;
static int g_generals_damagefx_minor_fx_cell_count = 0;
static int g_generals_damagefx_throttle_cell_count = 0;
static int g_generals_damagefx_line_count = 0;
static int g_generals_damagefx_error_count = 0;
static int g_generals_damagefx_name_cursor = 0;
static int g_generals_damagefx_field_type_counts[FIELD_TYPE_COUNT];
static int g_generals_damagefx_veterancy_assignment_count = 0;

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

static const char *VETERANCY_NAMES[VETERANCY_COUNT] = {
	"REGULAR",
	"VETERAN",
	"ELITE",
	"HEROIC",
};

static const char *FIELD_TYPE_NAMES[FIELD_TYPE_COUNT] = {
	"AmountForMajorFX",
	"MajorFX",
	"MinorFX",
	"ThrottleTime",
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
	if (valueSize < 0 || g_generals_damagefx_name_cursor + valueSize + 1 > NAME_CAPACITY) {
		return -1;
	}

	const int offset = g_generals_damagefx_name_cursor;
	for (int index = 0; index < valueSize; ++index) {
		g_generals_damagefx_names[g_generals_damagefx_name_cursor++] = value[index];
	}
	g_generals_damagefx_names[g_generals_damagefx_name_cursor++] = 0;
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
		++g_generals_damagefx_error_count;
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

static int find_damage_type(const char *value, int valueSize)
{
	for (int index = 0; index < DAMAGE_TYPE_COUNT; ++index) {
		if (ascii_equal_ignore_case(value, valueSize, DAMAGE_NAMES[index])) {
			return index;
		}
	}

	return -1;
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

static int find_field_type(const char *data, int start, int end, bool *isVeterancy)
{
	*isVeterancy = false;
	if (ascii_equal_ignore_case(data + start, end - start, "AmountForMajorFX")) {
		return FIELD_AMOUNT;
	}
	if (ascii_equal_ignore_case(data + start, end - start, "MajorFX")) {
		return FIELD_MAJOR_FX;
	}
	if (ascii_equal_ignore_case(data + start, end - start, "MinorFX")) {
		return FIELD_MINOR_FX;
	}
	if (ascii_equal_ignore_case(data + start, end - start, "ThrottleTime")) {
		return FIELD_THROTTLE;
	}
	if (ascii_equal_ignore_case(data + start, end - start, "VeterancyAmountForMajorFX")) {
		*isVeterancy = true;
		return FIELD_AMOUNT;
	}
	if (ascii_equal_ignore_case(data + start, end - start, "VeterancyMajorFX")) {
		*isVeterancy = true;
		return FIELD_MAJOR_FX;
	}
	if (ascii_equal_ignore_case(data + start, end - start, "VeterancyMinorFX")) {
		*isVeterancy = true;
		return FIELD_MINOR_FX;
	}
	if (ascii_equal_ignore_case(data + start, end - start, "VeterancyThrottleTime")) {
		*isVeterancy = true;
		return FIELD_THROTTLE;
	}

	return -1;
}

static void clear_cell(DamageFxCell *cell)
{
	cell->amountX100 = 0;
	clear_string(&cell->majorFx);
	clear_string(&cell->minorFx);
	cell->throttleTime = 0;
}

static void clear_template_cells(int templateIndex)
{
	for (int damage = 0; damage < DAMAGE_TYPE_COUNT; ++damage) {
		for (int vet = 0; vet < VETERANCY_COUNT; ++vet) {
			clear_cell(&g_generals_damagefx_cells[templateIndex][damage][vet]);
		}
	}
}

static int start_template(const char *data, TokenRange name, int line)
{
	if (g_generals_damagefx_template_count >= MAX_TEMPLATES) {
		++g_generals_damagefx_error_count;
		return -1;
	}

	const int nameSize = name.end - name.start;
	const int nameOffset = store_string(data + name.start, nameSize);
	if (nameOffset < 0) {
		++g_generals_damagefx_error_count;
		return -1;
	}

	const int index = g_generals_damagefx_template_count++;
	DamageFxTemplateRecord *record = &g_generals_damagefx_templates[index];
	record->nameOffset = nameOffset;
	record->nameSize = nameSize;
	record->line = line;
	record->firstAssignment = g_generals_damagefx_assignment_count;
	record->assignmentCount = 0;
	clear_template_cells(index);
	return index;
}

static int add_assignment(
	int templateIndex,
	int fieldType,
	int veterancy,
	int damageType,
	int expandedCount,
	int valueX100,
	StringField text,
	int line
)
{
	if (g_generals_damagefx_assignment_count >= MAX_ASSIGNMENTS) {
		++g_generals_damagefx_error_count;
		return -1;
	}

	const int index = g_generals_damagefx_assignment_count++;
	DamageFxAssignmentRecord *record = &g_generals_damagefx_assignments[index];
	record->templateIndex = templateIndex;
	record->fieldType = fieldType;
	record->veterancy = veterancy;
	record->damageType = damageType;
	record->expandedCount = expandedCount;
	record->valueX100 = valueX100;
	record->line = line;
	record->text = text;
	++g_generals_damagefx_templates[templateIndex].assignmentCount;
	++g_generals_damagefx_field_type_counts[fieldType];
	if (veterancy >= 0) {
		++g_generals_damagefx_veterancy_assignment_count;
	}
	return index;
}

static void apply_assignment(
	int templateIndex,
	int fieldType,
	int firstDamage,
	int lastDamage,
	int firstVeterancy,
	int lastVeterancy,
	int valueX100,
	StringField text
)
{
	for (int damage = firstDamage; damage <= lastDamage; ++damage) {
		for (int vet = firstVeterancy; vet <= lastVeterancy; ++vet) {
			DamageFxCell *cell = &g_generals_damagefx_cells[templateIndex][damage][vet];
			if (fieldType == FIELD_AMOUNT) {
				cell->amountX100 = valueX100;
			} else if (fieldType == FIELD_MAJOR_FX) {
				cell->majorFx = text;
			} else if (fieldType == FIELD_MINOR_FX) {
				cell->minorFx = text;
			} else if (fieldType == FIELD_THROTTLE) {
				cell->throttleTime = valueX100;
			}
			++g_generals_damagefx_resolved_update_count;
		}
	}
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

	bool isVeterancy = false;
	const int fieldType = find_field_type(data, keyStart, keyEnd, &isVeterancy);
	if (fieldType < 0) {
		return;
	}

	int cursor = valueStart;
	TokenRange token;
	int firstVeterancy = 0;
	int lastVeterancy = VETERANCY_COUNT - 1;
	int assignmentVeterancy = -1;
	if (isVeterancy) {
		if (!next_token(data, &cursor, valueEnd, &token)) {
			++g_generals_damagefx_error_count;
			return;
		}
		const int vet = find_veterancy(data + token.start, token.end - token.start);
		if (vet < 0) {
			++g_generals_damagefx_error_count;
			return;
		}
		firstVeterancy = vet;
		lastVeterancy = vet;
		assignmentVeterancy = vet;
	}

	if (!next_token(data, &cursor, valueEnd, &token)) {
		++g_generals_damagefx_error_count;
		return;
	}

	int firstDamage = 0;
	int lastDamage = DAMAGE_TYPE_COUNT - 1;
	int assignmentDamage = -1;
	if (!token_equals(data, token, "Default")) {
		const int damage = find_damage_type(data + token.start, token.end - token.start);
		if (damage < 0) {
			++g_generals_damagefx_error_count;
			return;
		}
		firstDamage = damage;
		lastDamage = damage;
		assignmentDamage = damage;
	}

	if (!next_token(data, &cursor, valueEnd, &token)) {
		++g_generals_damagefx_error_count;
		return;
	}

	int valueX100 = 0;
	StringField text;
	clear_string(&text);
	if (fieldType == FIELD_AMOUNT) {
		if (!parse_real_x100(data, token.start, token.end, &valueX100)) {
			++g_generals_damagefx_error_count;
			return;
		}
	} else if (fieldType == FIELD_THROTTLE) {
		if (!parse_int(data, token.start, token.end, &valueX100)) {
			++g_generals_damagefx_error_count;
			return;
		}
	} else {
		assign_string(&text, data, token.start, token.end);
	}

	const int expandedCount = (lastDamage - firstDamage + 1) * (lastVeterancy - firstVeterancy + 1);
	add_assignment(templateIndex, fieldType, assignmentVeterancy, assignmentDamage, expandedCount, valueX100, text, line);
	apply_assignment(templateIndex, fieldType, firstDamage, lastDamage, firstVeterancy, lastVeterancy, valueX100, text);
}

static void count_resolved_cells()
{
	g_generals_damagefx_amount_cell_count = 0;
	g_generals_damagefx_major_fx_cell_count = 0;
	g_generals_damagefx_minor_fx_cell_count = 0;
	g_generals_damagefx_throttle_cell_count = 0;

	for (int templateIndex = 0; templateIndex < g_generals_damagefx_template_count; ++templateIndex) {
		for (int damage = 0; damage < DAMAGE_TYPE_COUNT; ++damage) {
			for (int vet = 0; vet < VETERANCY_COUNT; ++vet) {
				const DamageFxCell *cell = &g_generals_damagefx_cells[templateIndex][damage][vet];
				if (cell->amountX100 != 0) {
					++g_generals_damagefx_amount_cell_count;
				}
				if (cell->majorFx.offset >= 0) {
					++g_generals_damagefx_major_fx_cell_count;
				}
				if (cell->minorFx.offset >= 0) {
					++g_generals_damagefx_minor_fx_cell_count;
				}
				if (cell->throttleTime != 0) {
					++g_generals_damagefx_throttle_cell_count;
				}
			}
		}
	}
}

static void reset_parser()
{
	g_generals_damagefx_template_count = 0;
	g_generals_damagefx_assignment_count = 0;
	g_generals_damagefx_resolved_update_count = 0;
	g_generals_damagefx_amount_cell_count = 0;
	g_generals_damagefx_major_fx_cell_count = 0;
	g_generals_damagefx_minor_fx_cell_count = 0;
	g_generals_damagefx_throttle_cell_count = 0;
	g_generals_damagefx_line_count = 0;
	g_generals_damagefx_error_count = 0;
	g_generals_damagefx_name_cursor = 0;
	g_generals_damagefx_veterancy_assignment_count = 0;
	for (int index = 0; index < FIELD_TYPE_COUNT; ++index) {
		g_generals_damagefx_field_type_counts[index] = 0;
	}
}

__attribute__((used, visibility("default"))) unsigned int generals_damagefx_input_ptr()
{
	return (unsigned int)g_generals_damagefx_input;
}

__attribute__((used, visibility("default"))) int generals_damagefx_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_damagefx_parse(int size)
{
	reset_parser();
	if (size < 0 || size > INPUT_CAPACITY) {
		g_generals_damagefx_error_count = 1;
		return -1;
	}

	const char *data = (const char *)g_generals_damagefx_input;
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
				if (token_equals(data, first, "DamageFX")) {
					TokenRange name;
					if (next_token(data, &tokenCursor, contentEnd, &name)) {
						activeTemplate = start_template(data, name, line);
					} else {
						++g_generals_damagefx_error_count;
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

	g_generals_damagefx_line_count = line - 1;
	count_resolved_cells();
	return g_generals_damagefx_error_count == 0 ? g_generals_damagefx_template_count : -1;
}

__attribute__((used, visibility("default"))) int generals_damagefx_template_count()
{
	return g_generals_damagefx_template_count;
}

__attribute__((used, visibility("default"))) int generals_damagefx_assignment_count()
{
	return g_generals_damagefx_assignment_count;
}

__attribute__((used, visibility("default"))) int generals_damagefx_resolved_update_count()
{
	return g_generals_damagefx_resolved_update_count;
}

__attribute__((used, visibility("default"))) int generals_damagefx_amount_cell_count()
{
	return g_generals_damagefx_amount_cell_count;
}

__attribute__((used, visibility("default"))) int generals_damagefx_major_fx_cell_count()
{
	return g_generals_damagefx_major_fx_cell_count;
}

__attribute__((used, visibility("default"))) int generals_damagefx_minor_fx_cell_count()
{
	return g_generals_damagefx_minor_fx_cell_count;
}

__attribute__((used, visibility("default"))) int generals_damagefx_throttle_cell_count()
{
	return g_generals_damagefx_throttle_cell_count;
}

__attribute__((used, visibility("default"))) int generals_damagefx_line_count()
{
	return g_generals_damagefx_line_count;
}

__attribute__((used, visibility("default"))) int generals_damagefx_error_count()
{
	return g_generals_damagefx_error_count;
}

__attribute__((used, visibility("default"))) int generals_damagefx_field_type_count(int fieldType)
{
	if (fieldType < 0 || fieldType >= FIELD_TYPE_COUNT) {
		return -1;
	}

	return g_generals_damagefx_field_type_counts[fieldType];
}

__attribute__((used, visibility("default"))) int generals_damagefx_veterancy_assignment_count()
{
	return g_generals_damagefx_veterancy_assignment_count;
}

__attribute__((used, visibility("default"))) int generals_damagefx_damage_name_ptr(int index)
{
	if (index < 0 || index >= DAMAGE_TYPE_COUNT) {
		return 0;
	}

	return (int)DAMAGE_NAMES[index];
}

__attribute__((used, visibility("default"))) int generals_damagefx_damage_name_size(int index)
{
	if (index < 0 || index >= DAMAGE_TYPE_COUNT) {
		return -1;
	}

	return string_length(DAMAGE_NAMES[index]);
}

__attribute__((used, visibility("default"))) int generals_damagefx_veterancy_name_ptr(int index)
{
	if (index < 0 || index >= VETERANCY_COUNT) {
		return 0;
	}

	return (int)VETERANCY_NAMES[index];
}

__attribute__((used, visibility("default"))) int generals_damagefx_veterancy_name_size(int index)
{
	if (index < 0 || index >= VETERANCY_COUNT) {
		return -1;
	}

	return string_length(VETERANCY_NAMES[index]);
}

__attribute__((used, visibility("default"))) int generals_damagefx_field_type_name_ptr(int index)
{
	if (index < 0 || index >= FIELD_TYPE_COUNT) {
		return 0;
	}

	return (int)FIELD_TYPE_NAMES[index];
}

__attribute__((used, visibility("default"))) int generals_damagefx_field_type_name_size(int index)
{
	if (index < 0 || index >= FIELD_TYPE_COUNT) {
		return -1;
	}

	return string_length(FIELD_TYPE_NAMES[index]);
}

__attribute__((used, visibility("default"))) int generals_damagefx_template_name_ptr(int index)
{
	if (index < 0 || index >= g_generals_damagefx_template_count) {
		return 0;
	}

	return (int)(g_generals_damagefx_names + g_generals_damagefx_templates[index].nameOffset);
}

__attribute__((used, visibility("default"))) int generals_damagefx_template_name_size(int index)
{
	if (index < 0 || index >= g_generals_damagefx_template_count) {
		return -1;
	}

	return g_generals_damagefx_templates[index].nameSize;
}

__attribute__((used, visibility("default"))) int generals_damagefx_template_line(int index)
{
	if (index < 0 || index >= g_generals_damagefx_template_count) {
		return -1;
	}

	return g_generals_damagefx_templates[index].line;
}

__attribute__((used, visibility("default"))) int generals_damagefx_template_first_assignment(int index)
{
	if (index < 0 || index >= g_generals_damagefx_template_count) {
		return -1;
	}

	return g_generals_damagefx_templates[index].firstAssignment;
}

__attribute__((used, visibility("default"))) int generals_damagefx_template_assignment_count(int index)
{
	if (index < 0 || index >= g_generals_damagefx_template_count) {
		return -1;
	}

	return g_generals_damagefx_templates[index].assignmentCount;
}

__attribute__((used, visibility("default"))) int generals_damagefx_assignment_template_index(int index)
{
	if (index < 0 || index >= g_generals_damagefx_assignment_count) {
		return -1;
	}

	return g_generals_damagefx_assignments[index].templateIndex;
}

__attribute__((used, visibility("default"))) int generals_damagefx_assignment_field_type(int index)
{
	if (index < 0 || index >= g_generals_damagefx_assignment_count) {
		return -1;
	}

	return g_generals_damagefx_assignments[index].fieldType;
}

__attribute__((used, visibility("default"))) int generals_damagefx_assignment_veterancy(int index)
{
	if (index < 0 || index >= g_generals_damagefx_assignment_count) {
		return -1;
	}

	return g_generals_damagefx_assignments[index].veterancy;
}

__attribute__((used, visibility("default"))) int generals_damagefx_assignment_damage_type(int index)
{
	if (index < 0 || index >= g_generals_damagefx_assignment_count) {
		return -1;
	}

	return g_generals_damagefx_assignments[index].damageType;
}

__attribute__((used, visibility("default"))) int generals_damagefx_assignment_expanded_count(int index)
{
	if (index < 0 || index >= g_generals_damagefx_assignment_count) {
		return -1;
	}

	return g_generals_damagefx_assignments[index].expandedCount;
}

__attribute__((used, visibility("default"))) int generals_damagefx_assignment_value_x100(int index)
{
	if (index < 0 || index >= g_generals_damagefx_assignment_count) {
		return -1;
	}

	return g_generals_damagefx_assignments[index].valueX100;
}

__attribute__((used, visibility("default"))) int generals_damagefx_assignment_line(int index)
{
	if (index < 0 || index >= g_generals_damagefx_assignment_count) {
		return -1;
	}

	return g_generals_damagefx_assignments[index].line;
}

__attribute__((used, visibility("default"))) int generals_damagefx_assignment_text_ptr(int index)
{
	if (index < 0 || index >= g_generals_damagefx_assignment_count || g_generals_damagefx_assignments[index].text.offset < 0) {
		return 0;
	}

	return (int)(g_generals_damagefx_names + g_generals_damagefx_assignments[index].text.offset);
}

__attribute__((used, visibility("default"))) int generals_damagefx_assignment_text_size(int index)
{
	if (index < 0 || index >= g_generals_damagefx_assignment_count) {
		return -1;
	}

	return g_generals_damagefx_assignments[index].text.size;
}

static bool valid_cell_index(int templateIndex, int damageType, int veterancy)
{
	return templateIndex >= 0 &&
		templateIndex < g_generals_damagefx_template_count &&
		damageType >= 0 &&
		damageType < DAMAGE_TYPE_COUNT &&
		veterancy >= 0 &&
		veterancy < VETERANCY_COUNT;
}

__attribute__((used, visibility("default"))) int generals_damagefx_cell_amount_x100(int templateIndex, int damageType, int veterancy)
{
	if (!valid_cell_index(templateIndex, damageType, veterancy)) {
		return -1;
	}

	return g_generals_damagefx_cells[templateIndex][damageType][veterancy].amountX100;
}

__attribute__((used, visibility("default"))) int generals_damagefx_cell_major_fx_ptr(int templateIndex, int damageType, int veterancy)
{
	if (!valid_cell_index(templateIndex, damageType, veterancy)) {
		return 0;
	}

	const StringField field = g_generals_damagefx_cells[templateIndex][damageType][veterancy].majorFx;
	return field.offset >= 0 ? (int)(g_generals_damagefx_names + field.offset) : 0;
}

__attribute__((used, visibility("default"))) int generals_damagefx_cell_major_fx_size(int templateIndex, int damageType, int veterancy)
{
	if (!valid_cell_index(templateIndex, damageType, veterancy)) {
		return -1;
	}

	return g_generals_damagefx_cells[templateIndex][damageType][veterancy].majorFx.size;
}

__attribute__((used, visibility("default"))) int generals_damagefx_cell_minor_fx_ptr(int templateIndex, int damageType, int veterancy)
{
	if (!valid_cell_index(templateIndex, damageType, veterancy)) {
		return 0;
	}

	const StringField field = g_generals_damagefx_cells[templateIndex][damageType][veterancy].minorFx;
	return field.offset >= 0 ? (int)(g_generals_damagefx_names + field.offset) : 0;
}

__attribute__((used, visibility("default"))) int generals_damagefx_cell_minor_fx_size(int templateIndex, int damageType, int veterancy)
{
	if (!valid_cell_index(templateIndex, damageType, veterancy)) {
		return -1;
	}

	return g_generals_damagefx_cells[templateIndex][damageType][veterancy].minorFx.size;
}

__attribute__((used, visibility("default"))) int generals_damagefx_cell_throttle_time(int templateIndex, int damageType, int veterancy)
{
	if (!valid_cell_index(templateIndex, damageType, veterancy)) {
		return -1;
	}

	return g_generals_damagefx_cells[templateIndex][damageType][veterancy].throttleTime;
}

}
