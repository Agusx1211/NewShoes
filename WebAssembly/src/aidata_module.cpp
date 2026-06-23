extern "C" {

static const int INPUT_CAPACITY = 128 * 1024;
static const int NAME_CAPACITY = 512 * 1024;
static const int SCALAR_FIELD_COUNT = 43;
static const int MAX_SIDES = 64;
static const int MAX_SKILL_SETS = 256;
static const int MAX_SCIENCES = 2048;
static const int MAX_BUILD_LISTS = 64;
static const int MAX_STRUCTURES = 1024;
static const int CONTEXT_CAPACITY = 16;

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

struct ScalarFieldRecord
{
	StringField raw;
	int valueX100;
	int line;
	int assigned;
};

struct SideRecord
{
	StringField name;
	StringField baseDefense;
	int line;
	int fieldCount;
	int easy;
	int normal;
	int hard;
	int firstSkillSet;
	int skillSetCount;
};

struct SkillSetRecord
{
	int sideIndex;
	int slot;
	int line;
	int firstScience;
	int scienceCount;
};

struct ScienceRecord
{
	int skillSetIndex;
	StringField name;
	int line;
};

struct BuildListRecord
{
	StringField side;
	int line;
	int firstStructure;
	int structureCount;
};

struct StructureRecord
{
	int buildListIndex;
	StringField templateName;
	StringField name;
	int line;
	int fieldCount;
	int xX100;
	int yX100;
	int rallyX100;
	int rallyY100;
	int rebuilds;
	int angleX100;
	int initiallyBuilt;
	int automaticallyBuild;
};

enum Context
{
	CONTEXT_NONE = 0,
	CONTEXT_AIDATA = 1,
	CONTEXT_SIDE = 2,
	CONTEXT_SKILL_SET = 3,
	CONTEXT_BUILD_LIST = 4,
	CONTEXT_STRUCTURE = 5,
};

__attribute__((used, visibility("default"))) unsigned char g_generals_aidata_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_aidata_names[NAME_CAPACITY];

static ScalarFieldRecord g_generals_aidata_scalars[SCALAR_FIELD_COUNT];
static SideRecord g_generals_aidata_sides[MAX_SIDES];
static SkillSetRecord g_generals_aidata_skill_sets[MAX_SKILL_SETS];
static ScienceRecord g_generals_aidata_sciences[MAX_SCIENCES];
static BuildListRecord g_generals_aidata_build_lists[MAX_BUILD_LISTS];
static StructureRecord g_generals_aidata_structures[MAX_STRUCTURES];
static int g_generals_aidata_contexts[CONTEXT_CAPACITY];
static int g_generals_aidata_context_count = 0;
static int g_generals_aidata_name_cursor = 0;
static int g_generals_aidata_line_count = 0;
static int g_generals_aidata_error_count = 0;
static int g_generals_aidata_scalar_assignment_count = 0;
static int g_generals_aidata_scalar_assigned_count = 0;
static int g_generals_aidata_side_count = 0;
static int g_generals_aidata_side_field_count = 0;
static int g_generals_aidata_skill_set_count = 0;
static int g_generals_aidata_science_count = 0;
static int g_generals_aidata_build_list_count = 0;
static int g_generals_aidata_structure_count = 0;
static int g_generals_aidata_structure_field_count = 0;
static int g_generals_aidata_auto_build_count = 0;
static int g_generals_aidata_initially_built_count = 0;
static int g_current_side = -1;
static int g_current_skill_set = -1;
static int g_current_build_list = -1;
static int g_current_structure = -1;

static const char *SCALAR_FIELD_NAMES[SCALAR_FIELD_COUNT] = {
	"StructureSeconds",
	"TeamSeconds",
	"Wealthy",
	"Poor",
	"ForceIdleMSEC",
	"StructuresWealthyRate",
	"TeamsWealthyRate",
	"StructuresPoorRate",
	"TeamsPoorRate",
	"TeamResourcesToStart",
	"GuardInnerModifierAI",
	"GuardOuterModifierAI",
	"GuardInnerModifierHuman",
	"GuardOuterModifierHuman",
	"GuardChaseUnitsDuration",
	"GuardEnemyScanRate",
	"GuardEnemyReturnScanRate",
	"SkirmishGroupFudgeDistance",
	"RepulsedDistance",
	"EnableRepulsors",
	"AlertRangeModifier",
	"AggressiveRangeModifier",
	"ForceSkirmishAI",
	"RotateSkirmishBases",
	"AttackUsesLineOfSight",
	"AttackIgnoreInsignificantBuildings",
	"AttackPriorityDistanceModifier",
	"MaxRecruitRadius",
	"SkirmishBaseDefenseExtraDistance",
	"WallHeight",
	"MinInfantryForGroup",
	"MinVehiclesForGroup",
	"MinDistanceForGroup",
	"DistanceRequiresGroup",
	"MinClumpDensity",
	"InfantryPathfindDiameter",
	"VehiclePathfindDiameter",
	"RebuildDelayTimeSeconds",
	"SupplyCenterSafeRadius",
	"AIDozerBoredRadiusModifier",
	"AICrushesInfantry",
	"MaxRetaliationDistance",
	"RetaliationFriendsRadius",
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
	if (valueSize < 0 || g_generals_aidata_name_cursor + valueSize + 1 > NAME_CAPACITY) {
		return -1;
	}

	const int offset = g_generals_aidata_name_cursor;
	for (int index = 0; index < valueSize; ++index) {
		g_generals_aidata_names[g_generals_aidata_name_cursor++] = value[index];
	}
	g_generals_aidata_names[g_generals_aidata_name_cursor++] = 0;
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
		++g_generals_aidata_error_count;
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

static int parse_real_x100(const char *data, int start, int end, int *realX100)
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

static int parse_bool(const char *data, int start, int end, int *value)
{
	trim_range(data, &start, &end);
	TokenRange token;
	int cursor = start;
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

static int parse_coord_component_x100(const char *data, TokenRange token, char axis, int *value)
{
	if (token.end - token.start < 3 || lower_ascii(data[token.start]) != lower_ascii(axis) || data[token.start + 1] != ':') {
		return 0;
	}

	return parse_real_x100(data, token.start + 2, token.end, value);
}

static void parse_coord2d_x100(const char *data, int start, int end, int *x, int *y)
{
	TokenRange token;
	int cursor = start;
	while (next_token(data, &cursor, end, &token)) {
		if (parse_coord_component_x100(data, token, 'X', x)) {
			continue;
		}
		parse_coord_component_x100(data, token, 'Y', y);
	}
}

static int find_scalar_field(const char *data, int start, int end)
{
	trim_range(data, &start, &end);
	for (int index = 0; index < SCALAR_FIELD_COUNT; ++index) {
		if (ascii_equal_ignore_case(data + start, end - start, SCALAR_FIELD_NAMES[index])) {
			return index;
		}
	}

	return -1;
}

static int current_context()
{
	return g_generals_aidata_context_count > 0
		? g_generals_aidata_contexts[g_generals_aidata_context_count - 1]
		: CONTEXT_NONE;
}

static void push_context(int context)
{
	if (g_generals_aidata_context_count >= CONTEXT_CAPACITY) {
		++g_generals_aidata_error_count;
		return;
	}

	g_generals_aidata_contexts[g_generals_aidata_context_count++] = context;
}

static void pop_context()
{
	if (g_generals_aidata_context_count <= 0) {
		return;
	}

	const int context = g_generals_aidata_contexts[--g_generals_aidata_context_count];
	if (context == CONTEXT_SIDE) {
		g_current_side = -1;
	} else if (context == CONTEXT_SKILL_SET) {
		g_current_skill_set = -1;
	} else if (context == CONTEXT_BUILD_LIST) {
		g_current_build_list = -1;
	} else if (context == CONTEXT_STRUCTURE) {
		g_current_structure = -1;
	}
}

static void init_structure(StructureRecord *record)
{
	record->buildListIndex = -1;
	clear_string(&record->templateName);
	clear_string(&record->name);
	record->line = -1;
	record->fieldCount = 0;
	record->xX100 = 0;
	record->yX100 = 0;
	record->rallyX100 = 0;
	record->rallyY100 = 0;
	record->rebuilds = 0;
	record->angleX100 = 0;
	record->initiallyBuilt = 0;
	record->automaticallyBuild = 1;
}

static void reset_state()
{
	g_generals_aidata_name_cursor = 0;
	g_generals_aidata_line_count = 0;
	g_generals_aidata_error_count = 0;
	g_generals_aidata_scalar_assignment_count = 0;
	g_generals_aidata_scalar_assigned_count = 0;
	g_generals_aidata_side_count = 0;
	g_generals_aidata_side_field_count = 0;
	g_generals_aidata_skill_set_count = 0;
	g_generals_aidata_science_count = 0;
	g_generals_aidata_build_list_count = 0;
	g_generals_aidata_structure_count = 0;
	g_generals_aidata_structure_field_count = 0;
	g_generals_aidata_auto_build_count = 0;
	g_generals_aidata_initially_built_count = 0;
	g_generals_aidata_context_count = 0;
	g_current_side = -1;
	g_current_skill_set = -1;
	g_current_build_list = -1;
	g_current_structure = -1;

	for (int index = 0; index < SCALAR_FIELD_COUNT; ++index) {
		clear_string(&g_generals_aidata_scalars[index].raw);
		g_generals_aidata_scalars[index].valueX100 = 0;
		g_generals_aidata_scalars[index].line = -1;
		g_generals_aidata_scalars[index].assigned = 0;
	}
}

static void create_side(const char *data, TokenRange sideToken, int line)
{
	if (g_generals_aidata_side_count >= MAX_SIDES) {
		++g_generals_aidata_error_count;
		return;
	}

	SideRecord *side = &g_generals_aidata_sides[g_generals_aidata_side_count];
	assign_string(&side->name, data, sideToken.start, sideToken.end);
	clear_string(&side->baseDefense);
	side->line = line;
	side->fieldCount = 0;
	side->easy = 0;
	side->normal = 1;
	side->hard = 2;
	side->firstSkillSet = g_generals_aidata_skill_set_count;
	side->skillSetCount = 0;
	g_current_side = g_generals_aidata_side_count++;
	push_context(CONTEXT_SIDE);
}

static int parse_skill_slot(const char *data, TokenRange token)
{
	if (token.end - token.start != 9) {
		return 0;
	}
	if (!string_equals(data, token.start, token.start + 8, "SkillSet")) {
		return 0;
	}

	const char slot = data[token.start + 8];
	return slot >= '1' && slot <= '5' ? slot - '0' : 0;
}

static void create_skill_set(int slot, int line)
{
	if (g_current_side < 0 || g_generals_aidata_skill_set_count >= MAX_SKILL_SETS) {
		++g_generals_aidata_error_count;
		return;
	}

	SkillSetRecord *skillSet = &g_generals_aidata_skill_sets[g_generals_aidata_skill_set_count];
	skillSet->sideIndex = g_current_side;
	skillSet->slot = slot;
	skillSet->line = line;
	skillSet->firstScience = g_generals_aidata_science_count;
	skillSet->scienceCount = 0;
	g_generals_aidata_sides[g_current_side].skillSetCount += 1;
	g_current_skill_set = g_generals_aidata_skill_set_count++;
	push_context(CONTEXT_SKILL_SET);
}

static void create_build_list(const char *data, TokenRange sideToken, int line)
{
	if (g_generals_aidata_build_list_count >= MAX_BUILD_LISTS) {
		++g_generals_aidata_error_count;
		return;
	}

	BuildListRecord *buildList = &g_generals_aidata_build_lists[g_generals_aidata_build_list_count];
	assign_string(&buildList->side, data, sideToken.start, sideToken.end);
	buildList->line = line;
	buildList->firstStructure = g_generals_aidata_structure_count;
	buildList->structureCount = 0;
	g_current_build_list = g_generals_aidata_build_list_count++;
	push_context(CONTEXT_BUILD_LIST);
}

static void create_structure(const char *data, TokenRange templateToken, int line)
{
	if (g_current_build_list < 0 || g_generals_aidata_structure_count >= MAX_STRUCTURES) {
		++g_generals_aidata_error_count;
		return;
	}

	StructureRecord *structure = &g_generals_aidata_structures[g_generals_aidata_structure_count];
	init_structure(structure);
	structure->buildListIndex = g_current_build_list;
	assign_string(&structure->templateName, data, templateToken.start, templateToken.end);
	structure->line = line;
	g_generals_aidata_build_lists[g_current_build_list].structureCount += 1;
	g_current_structure = g_generals_aidata_structure_count++;
	push_context(CONTEXT_STRUCTURE);
}

static void parse_block_start(const char *data, int start, int end, int line)
{
	TokenRange token;
	int cursor = start;
	if (!next_token(data, &cursor, end, &token)) {
		return;
	}

	if (token_equals(data, token, "End")) {
		pop_context();
		return;
	}

	const int context = current_context();
	if (token_equals(data, token, "AIData")) {
		push_context(CONTEXT_AIDATA);
		return;
	}

	TokenRange nameToken;
	if (context == CONTEXT_AIDATA && token_equals(data, token, "SideInfo") && next_token(data, &cursor, end, &nameToken)) {
		create_side(data, nameToken, line);
		return;
	}

	const int skillSlot = context == CONTEXT_SIDE ? parse_skill_slot(data, token) : 0;
	if (skillSlot > 0) {
		create_skill_set(skillSlot, line);
		return;
	}

	if (context == CONTEXT_AIDATA && token_equals(data, token, "SkirmishBuildList") && next_token(data, &cursor, end, &nameToken)) {
		create_build_list(data, nameToken, line);
		return;
	}

	if (context == CONTEXT_BUILD_LIST && token_equals(data, token, "Structure") && next_token(data, &cursor, end, &nameToken)) {
		create_structure(data, nameToken, line);
	}
}

static void parse_scalar_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd, int line)
{
	const int fieldIndex = find_scalar_field(data, fieldStart, fieldEnd);
	if (fieldIndex < 0) {
		return;
	}

	ScalarFieldRecord *field = &g_generals_aidata_scalars[fieldIndex];
	assign_token_string(&field->raw, data, valueStart, valueEnd);
	if (!parse_real_x100(data, valueStart, valueEnd, &field->valueX100)) {
		parse_bool(data, valueStart, valueEnd, &field->valueX100);
	}
	field->line = line;
	field->assigned = 1;
	++g_generals_aidata_scalar_assignment_count;
}

static void parse_side_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd)
{
	if (g_current_side < 0) {
		return;
	}

	SideRecord *side = &g_generals_aidata_sides[g_current_side];
	int value = 0;
	if (string_equals(data, fieldStart, fieldEnd, "ResourceGatherersEasy") && parse_int(data, valueStart, valueEnd, &value)) {
		side->easy = value;
	} else if (string_equals(data, fieldStart, fieldEnd, "ResourceGatherersNormal") && parse_int(data, valueStart, valueEnd, &value)) {
		side->normal = value;
	} else if (string_equals(data, fieldStart, fieldEnd, "ResourceGatherersHard") && parse_int(data, valueStart, valueEnd, &value)) {
		side->hard = value;
	} else if (string_equals(data, fieldStart, fieldEnd, "BaseDefenseStructure1")) {
		assign_token_string(&side->baseDefense, data, valueStart, valueEnd);
	} else {
		return;
	}

	side->fieldCount += 1;
	++g_generals_aidata_side_field_count;
}

static void parse_skill_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd, int line)
{
	if (g_current_skill_set < 0 || !string_equals(data, fieldStart, fieldEnd, "Science")) {
		return;
	}
	if (g_generals_aidata_science_count >= MAX_SCIENCES) {
		++g_generals_aidata_error_count;
		return;
	}

	ScienceRecord *science = &g_generals_aidata_sciences[g_generals_aidata_science_count];
	science->skillSetIndex = g_current_skill_set;
	assign_token_string(&science->name, data, valueStart, valueEnd);
	science->line = line;
	g_generals_aidata_skill_sets[g_current_skill_set].scienceCount += 1;
	++g_generals_aidata_science_count;
}

static void parse_structure_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd)
{
	if (g_current_structure < 0) {
		return;
	}

	StructureRecord *structure = &g_generals_aidata_structures[g_current_structure];
	int parsed = 1;
	if (string_equals(data, fieldStart, fieldEnd, "Name")) {
		assign_token_string(&structure->name, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "Location")) {
		parse_coord2d_x100(data, valueStart, valueEnd, &structure->xX100, &structure->yX100);
	} else if (string_equals(data, fieldStart, fieldEnd, "Rebuilds")) {
		parse_int(data, valueStart, valueEnd, &structure->rebuilds);
	} else if (string_equals(data, fieldStart, fieldEnd, "Angle")) {
		parse_real_x100(data, valueStart, valueEnd, &structure->angleX100);
	} else if (string_equals(data, fieldStart, fieldEnd, "InitiallyBuilt")) {
		parse_bool(data, valueStart, valueEnd, &structure->initiallyBuilt);
	} else if (string_equals(data, fieldStart, fieldEnd, "RallyPointOffset")) {
		parse_coord2d_x100(data, valueStart, valueEnd, &structure->rallyX100, &structure->rallyY100);
	} else if (string_equals(data, fieldStart, fieldEnd, "AutomaticallyBuild")) {
		parse_bool(data, valueStart, valueEnd, &structure->automaticallyBuild);
	} else {
		parsed = 0;
	}

	if (parsed) {
		structure->fieldCount += 1;
		++g_generals_aidata_structure_field_count;
	}
}

static void parse_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd, int line)
{
	trim_range(data, &fieldStart, &fieldEnd);
	trim_range(data, &valueStart, &valueEnd);
	const int context = current_context();
	if (context == CONTEXT_AIDATA) {
		parse_scalar_assignment(data, fieldStart, fieldEnd, valueStart, valueEnd, line);
	} else if (context == CONTEXT_SIDE) {
		parse_side_assignment(data, fieldStart, fieldEnd, valueStart, valueEnd);
	} else if (context == CONTEXT_SKILL_SET) {
		parse_skill_assignment(data, fieldStart, fieldEnd, valueStart, valueEnd, line);
	} else if (context == CONTEXT_STRUCTURE) {
		parse_structure_assignment(data, fieldStart, fieldEnd, valueStart, valueEnd);
	}
}

static void finalize_counts()
{
	for (int index = 0; index < SCALAR_FIELD_COUNT; ++index) {
		if (g_generals_aidata_scalars[index].assigned) {
			++g_generals_aidata_scalar_assigned_count;
		}
	}
	for (int index = 0; index < g_generals_aidata_structure_count; ++index) {
		if (g_generals_aidata_structures[index].automaticallyBuild) {
			++g_generals_aidata_auto_build_count;
		}
		if (g_generals_aidata_structures[index].initiallyBuilt) {
			++g_generals_aidata_initially_built_count;
		}
	}
}

__attribute__((used, visibility("default"))) int generals_aidata_input_ptr()
{
	return (int)g_generals_aidata_input;
}

__attribute__((used, visibility("default"))) int generals_aidata_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_aidata_parse(int inputSize)
{
	reset_state();

	if (inputSize < 0 || inputSize > INPUT_CAPACITY) {
		g_generals_aidata_error_count = 1;
		return -1;
	}

	const char *data = (const char *)g_generals_aidata_input;
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

		++g_generals_aidata_line_count;
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
			parse_block_start(data, lineStart, lineEnd, line);
		}

		++line;
	}

	finalize_counts();
	return g_generals_aidata_scalar_assigned_count + g_generals_aidata_side_count + g_generals_aidata_build_list_count;
}

__attribute__((used, visibility("default"))) int generals_aidata_scalar_field_count()
{
	return SCALAR_FIELD_COUNT;
}

__attribute__((used, visibility("default"))) int generals_aidata_scalar_assignment_count()
{
	return g_generals_aidata_scalar_assignment_count;
}

__attribute__((used, visibility("default"))) int generals_aidata_scalar_assigned_count()
{
	return g_generals_aidata_scalar_assigned_count;
}

__attribute__((used, visibility("default"))) int generals_aidata_side_count()
{
	return g_generals_aidata_side_count;
}

__attribute__((used, visibility("default"))) int generals_aidata_side_field_count()
{
	return g_generals_aidata_side_field_count;
}

__attribute__((used, visibility("default"))) int generals_aidata_skill_set_count()
{
	return g_generals_aidata_skill_set_count;
}

__attribute__((used, visibility("default"))) int generals_aidata_science_count()
{
	return g_generals_aidata_science_count;
}

__attribute__((used, visibility("default"))) int generals_aidata_build_list_count()
{
	return g_generals_aidata_build_list_count;
}

__attribute__((used, visibility("default"))) int generals_aidata_structure_count()
{
	return g_generals_aidata_structure_count;
}

__attribute__((used, visibility("default"))) int generals_aidata_structure_field_count()
{
	return g_generals_aidata_structure_field_count;
}

__attribute__((used, visibility("default"))) int generals_aidata_auto_build_count()
{
	return g_generals_aidata_auto_build_count;
}

__attribute__((used, visibility("default"))) int generals_aidata_initially_built_count()
{
	return g_generals_aidata_initially_built_count;
}

__attribute__((used, visibility("default"))) int generals_aidata_line_count()
{
	return g_generals_aidata_line_count;
}

__attribute__((used, visibility("default"))) int generals_aidata_error_count()
{
	return g_generals_aidata_error_count;
}

__attribute__((used, visibility("default"))) int generals_aidata_scalar_name_ptr(int index)
{
	if (index < 0 || index >= SCALAR_FIELD_COUNT) {
		return 0;
	}

	return (int)SCALAR_FIELD_NAMES[index];
}

__attribute__((used, visibility("default"))) int generals_aidata_scalar_name_size(int index)
{
	if (index < 0 || index >= SCALAR_FIELD_COUNT) {
		return -1;
	}

	return string_length(SCALAR_FIELD_NAMES[index]);
}

__attribute__((used, visibility("default"))) int generals_aidata_scalar_raw_ptr(int index)
{
	if (index < 0 || index >= SCALAR_FIELD_COUNT || g_generals_aidata_scalars[index].raw.offset < 0) {
		return 0;
	}

	return (int)(g_generals_aidata_names + g_generals_aidata_scalars[index].raw.offset);
}

__attribute__((used, visibility("default"))) int generals_aidata_scalar_raw_size(int index)
{
	if (index < 0 || index >= SCALAR_FIELD_COUNT) {
		return -1;
	}

	return g_generals_aidata_scalars[index].raw.size;
}

__attribute__((used, visibility("default"))) int generals_aidata_scalar_value_x100(int index)
{
	if (index < 0 || index >= SCALAR_FIELD_COUNT) {
		return -1;
	}

	return g_generals_aidata_scalars[index].valueX100;
}

__attribute__((used, visibility("default"))) int generals_aidata_scalar_line(int index)
{
	if (index < 0 || index >= SCALAR_FIELD_COUNT) {
		return -1;
	}

	return g_generals_aidata_scalars[index].line;
}

__attribute__((used, visibility("default"))) int generals_aidata_scalar_assigned(int index)
{
	if (index < 0 || index >= SCALAR_FIELD_COUNT) {
		return -1;
	}

	return g_generals_aidata_scalars[index].assigned;
}

static int string_field_ptr(StringField field)
{
	return field.offset >= 0 ? (int)(g_generals_aidata_names + field.offset) : 0;
}

__attribute__((used, visibility("default"))) int generals_aidata_side_name_ptr(int index)
{
	return index >= 0 && index < g_generals_aidata_side_count ? string_field_ptr(g_generals_aidata_sides[index].name) : 0;
}

__attribute__((used, visibility("default"))) int generals_aidata_side_name_size(int index)
{
	return index >= 0 && index < g_generals_aidata_side_count ? g_generals_aidata_sides[index].name.size : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_side_base_defense_ptr(int index)
{
	return index >= 0 && index < g_generals_aidata_side_count ? string_field_ptr(g_generals_aidata_sides[index].baseDefense) : 0;
}

__attribute__((used, visibility("default"))) int generals_aidata_side_base_defense_size(int index)
{
	return index >= 0 && index < g_generals_aidata_side_count ? g_generals_aidata_sides[index].baseDefense.size : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_side_line(int index)
{
	return index >= 0 && index < g_generals_aidata_side_count ? g_generals_aidata_sides[index].line : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_side_field_count_at(int index)
{
	return index >= 0 && index < g_generals_aidata_side_count ? g_generals_aidata_sides[index].fieldCount : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_side_resource_easy(int index)
{
	return index >= 0 && index < g_generals_aidata_side_count ? g_generals_aidata_sides[index].easy : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_side_resource_normal(int index)
{
	return index >= 0 && index < g_generals_aidata_side_count ? g_generals_aidata_sides[index].normal : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_side_resource_hard(int index)
{
	return index >= 0 && index < g_generals_aidata_side_count ? g_generals_aidata_sides[index].hard : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_side_first_skill_set(int index)
{
	return index >= 0 && index < g_generals_aidata_side_count ? g_generals_aidata_sides[index].firstSkillSet : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_side_skill_set_count(int index)
{
	return index >= 0 && index < g_generals_aidata_side_count ? g_generals_aidata_sides[index].skillSetCount : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_skill_set_side_index(int index)
{
	return index >= 0 && index < g_generals_aidata_skill_set_count ? g_generals_aidata_skill_sets[index].sideIndex : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_skill_set_slot(int index)
{
	return index >= 0 && index < g_generals_aidata_skill_set_count ? g_generals_aidata_skill_sets[index].slot : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_skill_set_line(int index)
{
	return index >= 0 && index < g_generals_aidata_skill_set_count ? g_generals_aidata_skill_sets[index].line : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_skill_set_first_science(int index)
{
	return index >= 0 && index < g_generals_aidata_skill_set_count ? g_generals_aidata_skill_sets[index].firstScience : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_skill_set_science_count(int index)
{
	return index >= 0 && index < g_generals_aidata_skill_set_count ? g_generals_aidata_skill_sets[index].scienceCount : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_science_skill_set_index(int index)
{
	return index >= 0 && index < g_generals_aidata_science_count ? g_generals_aidata_sciences[index].skillSetIndex : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_science_name_ptr(int index)
{
	return index >= 0 && index < g_generals_aidata_science_count ? string_field_ptr(g_generals_aidata_sciences[index].name) : 0;
}

__attribute__((used, visibility("default"))) int generals_aidata_science_name_size(int index)
{
	return index >= 0 && index < g_generals_aidata_science_count ? g_generals_aidata_sciences[index].name.size : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_science_line(int index)
{
	return index >= 0 && index < g_generals_aidata_science_count ? g_generals_aidata_sciences[index].line : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_build_list_side_ptr(int index)
{
	return index >= 0 && index < g_generals_aidata_build_list_count ? string_field_ptr(g_generals_aidata_build_lists[index].side) : 0;
}

__attribute__((used, visibility("default"))) int generals_aidata_build_list_side_size(int index)
{
	return index >= 0 && index < g_generals_aidata_build_list_count ? g_generals_aidata_build_lists[index].side.size : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_build_list_line(int index)
{
	return index >= 0 && index < g_generals_aidata_build_list_count ? g_generals_aidata_build_lists[index].line : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_build_list_first_structure(int index)
{
	return index >= 0 && index < g_generals_aidata_build_list_count ? g_generals_aidata_build_lists[index].firstStructure : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_build_list_structure_count(int index)
{
	return index >= 0 && index < g_generals_aidata_build_list_count ? g_generals_aidata_build_lists[index].structureCount : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_structure_build_list_index(int index)
{
	return index >= 0 && index < g_generals_aidata_structure_count ? g_generals_aidata_structures[index].buildListIndex : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_structure_template_ptr(int index)
{
	return index >= 0 && index < g_generals_aidata_structure_count ? string_field_ptr(g_generals_aidata_structures[index].templateName) : 0;
}

__attribute__((used, visibility("default"))) int generals_aidata_structure_template_size(int index)
{
	return index >= 0 && index < g_generals_aidata_structure_count ? g_generals_aidata_structures[index].templateName.size : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_structure_name_ptr(int index)
{
	return index >= 0 && index < g_generals_aidata_structure_count ? string_field_ptr(g_generals_aidata_structures[index].name) : 0;
}

__attribute__((used, visibility("default"))) int generals_aidata_structure_name_size(int index)
{
	return index >= 0 && index < g_generals_aidata_structure_count ? g_generals_aidata_structures[index].name.size : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_structure_line(int index)
{
	return index >= 0 && index < g_generals_aidata_structure_count ? g_generals_aidata_structures[index].line : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_structure_field_count_at(int index)
{
	return index >= 0 && index < g_generals_aidata_structure_count ? g_generals_aidata_structures[index].fieldCount : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_structure_x_x100(int index)
{
	return index >= 0 && index < g_generals_aidata_structure_count ? g_generals_aidata_structures[index].xX100 : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_structure_y_x100(int index)
{
	return index >= 0 && index < g_generals_aidata_structure_count ? g_generals_aidata_structures[index].yX100 : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_structure_rally_x_x100(int index)
{
	return index >= 0 && index < g_generals_aidata_structure_count ? g_generals_aidata_structures[index].rallyX100 : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_structure_rally_y_x100(int index)
{
	return index >= 0 && index < g_generals_aidata_structure_count ? g_generals_aidata_structures[index].rallyY100 : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_structure_rebuilds(int index)
{
	return index >= 0 && index < g_generals_aidata_structure_count ? g_generals_aidata_structures[index].rebuilds : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_structure_angle_x100(int index)
{
	return index >= 0 && index < g_generals_aidata_structure_count ? g_generals_aidata_structures[index].angleX100 : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_structure_initially_built(int index)
{
	return index >= 0 && index < g_generals_aidata_structure_count ? g_generals_aidata_structures[index].initiallyBuilt : -1;
}

__attribute__((used, visibility("default"))) int generals_aidata_structure_automatically_build(int index)
{
	return index >= 0 && index < g_generals_aidata_structure_count ? g_generals_aidata_structures[index].automaticallyBuild : -1;
}

}
