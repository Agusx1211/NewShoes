extern "C" {

static const int INPUT_CAPACITY = 2 * 1024 * 1024;
static const int MAX_TEMPLATES = 4096;
static const int NAME_CAPACITY = 1024 * 1024;
static const int DAMAGE_TYPE_COUNT = 38;

struct TokenRange
{
	int start;
	int end;
};

struct WeaponTemplateRecord
{
	int nameOffset;
	int nameSize;
	int line;
	int fieldCount;
	int primaryDamageX100;
	int primaryDamageRadiusX100;
	int secondaryDamageX100;
	int secondaryDamageRadiusX100;
	int attackRangeX100;
	int minimumAttackRangeX100;
	int weaponSpeedX100;
	int damageType;
	int clipSize;
	int clipReloadTimeMs;
	int delayBetweenShotsMinMs;
	int delayBetweenShotsMaxMs;
	int projectileNameOffset;
	int projectileNameSize;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_weapon_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_weapon_names[NAME_CAPACITY];

static WeaponTemplateRecord g_generals_weapon_templates[MAX_TEMPLATES];
static int g_generals_weapon_template_count = 0;
static int g_generals_weapon_field_count = 0;
static int g_generals_weapon_line_count = 0;
static int g_generals_weapon_error_count = 0;
static int g_generals_weapon_name_cursor = 0;

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

static bool is_colon_token_separator(char value)
{
	return is_token_separator(value) || value == ':';
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

static bool next_token_with_separator(const char *data, int *cursor, int end, TokenRange *token, bool colonSeparator)
{
	while (*cursor < end && (colonSeparator ? is_colon_token_separator(data[*cursor]) : is_token_separator(data[*cursor]))) {
		++(*cursor);
	}

	if (*cursor >= end) {
		return false;
	}

	token->start = *cursor;
	while (*cursor < end && !(colonSeparator ? is_colon_token_separator(data[*cursor]) : is_token_separator(data[*cursor]))) {
		++(*cursor);
	}
	token->end = *cursor;
	return token->end > token->start;
}

static bool next_token(const char *data, int *cursor, int end, TokenRange *token)
{
	return next_token_with_separator(data, cursor, end, token, false);
}

static bool next_colon_token(const char *data, int *cursor, int end, TokenRange *token)
{
	return next_token_with_separator(data, cursor, end, token, true);
}

static int store_name(const char *value, int valueSize)
{
	if (valueSize < 0 || g_generals_weapon_name_cursor + valueSize + 1 > NAME_CAPACITY) {
		return -1;
	}

	const int offset = g_generals_weapon_name_cursor;
	for (int index = 0; index < valueSize; ++index) {
		g_generals_weapon_names[g_generals_weapon_name_cursor++] = value[index];
	}
	g_generals_weapon_names[g_generals_weapon_name_cursor++] = 0;
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

	int value = whole * 100 + fraction;
	if (negative) {
		value = -value;
	}

	*realX100 = value;
	return 1;
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

	if (negative) {
		value = -value;
	}

	*integer = value;
	return 1;
}

static void clear_template(WeaponTemplateRecord *record)
{
	record->fieldCount = 0;
	record->primaryDamageX100 = 0;
	record->primaryDamageRadiusX100 = 0;
	record->secondaryDamageX100 = 0;
	record->secondaryDamageRadiusX100 = 0;
	record->attackRangeX100 = 0;
	record->minimumAttackRangeX100 = 0;
	record->weaponSpeedX100 = 99999900;
	record->damageType = 0;
	record->clipSize = 0;
	record->clipReloadTimeMs = 0;
	record->delayBetweenShotsMinMs = 0;
	record->delayBetweenShotsMaxMs = 0;
	record->projectileNameOffset = -1;
	record->projectileNameSize = 0;
}

static int start_template(const char *data, TokenRange name, int line)
{
	if (g_generals_weapon_template_count >= MAX_TEMPLATES) {
		++g_generals_weapon_error_count;
		return -1;
	}

	const int nameSize = name.end - name.start;
	const int nameOffset = store_name(data + name.start, nameSize);
	if (nameOffset < 0) {
		++g_generals_weapon_error_count;
		return -1;
	}

	const int templateIndex = g_generals_weapon_template_count++;
	WeaponTemplateRecord *record = &g_generals_weapon_templates[templateIndex];
	record->nameOffset = nameOffset;
	record->nameSize = nameSize;
	record->line = line;
	clear_template(record);
	return templateIndex;
}

static int parse_first_real_x100(const char *data, int valueStart, int valueEnd, int *realX100)
{
	int cursor = valueStart;
	TokenRange token;
	if (!next_token(data, &cursor, valueEnd, &token)) {
		return 0;
	}

	return parse_real_x100(data, token.start, token.end, realX100);
}

static int parse_first_int(const char *data, int valueStart, int valueEnd, int *integer)
{
	int cursor = valueStart;
	TokenRange token;
	if (!next_token(data, &cursor, valueEnd, &token)) {
		return 0;
	}

	return parse_int(data, token.start, token.end, integer);
}

static void parse_delay_between_shots(WeaponTemplateRecord *record, const char *data, int valueStart, int valueEnd)
{
	int cursor = valueStart;
	TokenRange first;
	if (!next_colon_token(data, &cursor, valueEnd, &first)) {
		++g_generals_weapon_error_count;
		return;
	}

	if (ascii_equal_ignore_case(data + first.start, first.end - first.start, "Min")) {
		TokenRange minValue;
		if (!next_colon_token(data, &cursor, valueEnd, &minValue) ||
			!parse_int(data, minValue.start, minValue.end, &record->delayBetweenShotsMinMs)) {
			++g_generals_weapon_error_count;
			return;
		}

		TokenRange maxLabel;
		TokenRange maxValue;
		if (next_colon_token(data, &cursor, valueEnd, &maxLabel) &&
			ascii_equal_ignore_case(data + maxLabel.start, maxLabel.end - maxLabel.start, "Max") &&
			next_colon_token(data, &cursor, valueEnd, &maxValue) &&
			parse_int(data, maxValue.start, maxValue.end, &record->delayBetweenShotsMaxMs)) {
			return;
		}

		record->delayBetweenShotsMaxMs = record->delayBetweenShotsMinMs;
		return;
	}

	if (!parse_int(data, first.start, first.end, &record->delayBetweenShotsMinMs)) {
		++g_generals_weapon_error_count;
		return;
	}
	record->delayBetweenShotsMaxMs = record->delayBetweenShotsMinMs;
}

static void parse_projectile_name(WeaponTemplateRecord *record, const char *data, int valueStart, int valueEnd)
{
	int cursor = valueStart;
	TokenRange token;
	if (!next_token(data, &cursor, valueEnd, &token)) {
		++g_generals_weapon_error_count;
		return;
	}

	const int nameSize = token.end - token.start;
	const int nameOffset = store_name(data + token.start, nameSize);
	if (nameOffset < 0) {
		++g_generals_weapon_error_count;
		return;
	}

	record->projectileNameOffset = nameOffset;
	record->projectileNameSize = nameSize;
}

static void parse_damage_type(WeaponTemplateRecord *record, const char *data, int valueStart, int valueEnd)
{
	int cursor = valueStart;
	TokenRange token;
	if (!next_token(data, &cursor, valueEnd, &token)) {
		++g_generals_weapon_error_count;
		return;
	}

	const int damageType = find_damage_type(data + token.start, token.end - token.start);
	if (damageType < 0) {
		++g_generals_weapon_error_count;
		return;
	}

	record->damageType = damageType;
}

static void parse_property(int templateIndex, const char *data, int keyStart, int keyEnd, int valueStart, int valueEnd)
{
	if (templateIndex < 0 || templateIndex >= g_generals_weapon_template_count) {
		++g_generals_weapon_error_count;
		return;
	}

	WeaponTemplateRecord *record = &g_generals_weapon_templates[templateIndex];
	++record->fieldCount;
	++g_generals_weapon_field_count;

	int parsedValue = 0;
	if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "PrimaryDamage")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &parsedValue)) {
			++g_generals_weapon_error_count;
		} else {
			record->primaryDamageX100 = parsedValue;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "PrimaryDamageRadius")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &parsedValue)) {
			++g_generals_weapon_error_count;
		} else {
			record->primaryDamageRadiusX100 = parsedValue;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "SecondaryDamage")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &parsedValue)) {
			++g_generals_weapon_error_count;
		} else {
			record->secondaryDamageX100 = parsedValue;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "SecondaryDamageRadius")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &parsedValue)) {
			++g_generals_weapon_error_count;
		} else {
			record->secondaryDamageRadiusX100 = parsedValue;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "AttackRange")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &parsedValue)) {
			++g_generals_weapon_error_count;
		} else {
			record->attackRangeX100 = parsedValue;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "MinimumAttackRange")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &parsedValue)) {
			++g_generals_weapon_error_count;
		} else {
			record->minimumAttackRangeX100 = parsedValue;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "WeaponSpeed")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &parsedValue)) {
			++g_generals_weapon_error_count;
		} else {
			record->weaponSpeedX100 = parsedValue;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ClipSize")) {
		if (!parse_first_int(data, valueStart, valueEnd, &record->clipSize)) {
			++g_generals_weapon_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ClipReloadTime")) {
		if (!parse_first_int(data, valueStart, valueEnd, &record->clipReloadTimeMs)) {
			++g_generals_weapon_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "DelayBetweenShots")) {
		parse_delay_between_shots(record, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ProjectileObject")) {
		parse_projectile_name(record, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "DamageType")) {
		parse_damage_type(record, data, valueStart, valueEnd);
	}
}

__attribute__((used, visibility("default"))) unsigned int generals_weapon_input_ptr()
{
	return (unsigned int)g_generals_weapon_input;
}

__attribute__((used, visibility("default"))) int generals_weapon_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_weapon_damage_type_count()
{
	return DAMAGE_TYPE_COUNT;
}

__attribute__((used, visibility("default"))) int generals_weapon_damage_type_name_ptr(int index)
{
	if (index < 0 || index >= DAMAGE_TYPE_COUNT) {
		return 0;
	}

	return (int)DAMAGE_NAMES[index];
}

__attribute__((used, visibility("default"))) int generals_weapon_damage_type_name_size(int index)
{
	if (index < 0 || index >= DAMAGE_TYPE_COUNT) {
		return -1;
	}

	return string_length(DAMAGE_NAMES[index]);
}

__attribute__((used, visibility("default"))) int generals_weapon_template_count()
{
	return g_generals_weapon_template_count;
}

__attribute__((used, visibility("default"))) int generals_weapon_field_count()
{
	return g_generals_weapon_field_count;
}

__attribute__((used, visibility("default"))) int generals_weapon_line_count()
{
	return g_generals_weapon_line_count;
}

__attribute__((used, visibility("default"))) int generals_weapon_error_count()
{
	return g_generals_weapon_error_count;
}

__attribute__((used, visibility("default"))) int generals_weapon_template_name_ptr(int index)
{
	if (index < 0 || index >= g_generals_weapon_template_count) {
		return 0;
	}

	return (int)(g_generals_weapon_names + g_generals_weapon_templates[index].nameOffset);
}

__attribute__((used, visibility("default"))) int generals_weapon_template_name_size(int index)
{
	if (index < 0 || index >= g_generals_weapon_template_count) {
		return -1;
	}

	return g_generals_weapon_templates[index].nameSize;
}

__attribute__((used, visibility("default"))) int generals_weapon_template_line(int index)
{
	if (index < 0 || index >= g_generals_weapon_template_count) {
		return -1;
	}

	return g_generals_weapon_templates[index].line;
}

__attribute__((used, visibility("default"))) int generals_weapon_template_field_count(int index)
{
	if (index < 0 || index >= g_generals_weapon_template_count) {
		return -1;
	}

	return g_generals_weapon_templates[index].fieldCount;
}

__attribute__((used, visibility("default"))) int generals_weapon_template_primary_damage_x100(int index)
{
	if (index < 0 || index >= g_generals_weapon_template_count) {
		return -1;
	}

	return g_generals_weapon_templates[index].primaryDamageX100;
}

__attribute__((used, visibility("default"))) int generals_weapon_template_primary_damage_radius_x100(int index)
{
	if (index < 0 || index >= g_generals_weapon_template_count) {
		return -1;
	}

	return g_generals_weapon_templates[index].primaryDamageRadiusX100;
}

__attribute__((used, visibility("default"))) int generals_weapon_template_secondary_damage_x100(int index)
{
	if (index < 0 || index >= g_generals_weapon_template_count) {
		return -1;
	}

	return g_generals_weapon_templates[index].secondaryDamageX100;
}

__attribute__((used, visibility("default"))) int generals_weapon_template_secondary_damage_radius_x100(int index)
{
	if (index < 0 || index >= g_generals_weapon_template_count) {
		return -1;
	}

	return g_generals_weapon_templates[index].secondaryDamageRadiusX100;
}

__attribute__((used, visibility("default"))) int generals_weapon_template_attack_range_x100(int index)
{
	if (index < 0 || index >= g_generals_weapon_template_count) {
		return -1;
	}

	return g_generals_weapon_templates[index].attackRangeX100;
}

__attribute__((used, visibility("default"))) int generals_weapon_template_minimum_attack_range_x100(int index)
{
	if (index < 0 || index >= g_generals_weapon_template_count) {
		return -1;
	}

	return g_generals_weapon_templates[index].minimumAttackRangeX100;
}

__attribute__((used, visibility("default"))) int generals_weapon_template_weapon_speed_x100(int index)
{
	if (index < 0 || index >= g_generals_weapon_template_count) {
		return -1;
	}

	return g_generals_weapon_templates[index].weaponSpeedX100;
}

__attribute__((used, visibility("default"))) int generals_weapon_template_damage_type(int index)
{
	if (index < 0 || index >= g_generals_weapon_template_count) {
		return -1;
	}

	return g_generals_weapon_templates[index].damageType;
}

__attribute__((used, visibility("default"))) int generals_weapon_template_clip_size(int index)
{
	if (index < 0 || index >= g_generals_weapon_template_count) {
		return -1;
	}

	return g_generals_weapon_templates[index].clipSize;
}

__attribute__((used, visibility("default"))) int generals_weapon_template_clip_reload_time_ms(int index)
{
	if (index < 0 || index >= g_generals_weapon_template_count) {
		return -1;
	}

	return g_generals_weapon_templates[index].clipReloadTimeMs;
}

__attribute__((used, visibility("default"))) int generals_weapon_template_delay_between_shots_min_ms(int index)
{
	if (index < 0 || index >= g_generals_weapon_template_count) {
		return -1;
	}

	return g_generals_weapon_templates[index].delayBetweenShotsMinMs;
}

__attribute__((used, visibility("default"))) int generals_weapon_template_delay_between_shots_max_ms(int index)
{
	if (index < 0 || index >= g_generals_weapon_template_count) {
		return -1;
	}

	return g_generals_weapon_templates[index].delayBetweenShotsMaxMs;
}

__attribute__((used, visibility("default"))) int generals_weapon_template_projectile_name_ptr(int index)
{
	if (index < 0 || index >= g_generals_weapon_template_count || g_generals_weapon_templates[index].projectileNameOffset < 0) {
		return 0;
	}

	return (int)(g_generals_weapon_names + g_generals_weapon_templates[index].projectileNameOffset);
}

__attribute__((used, visibility("default"))) int generals_weapon_template_projectile_name_size(int index)
{
	if (index < 0 || index >= g_generals_weapon_template_count) {
		return -1;
	}

	return g_generals_weapon_templates[index].projectileNameSize;
}

__attribute__((used, visibility("default"))) int generals_weapon_parse(int inputSize)
{
	g_generals_weapon_template_count = 0;
	g_generals_weapon_field_count = 0;
	g_generals_weapon_line_count = 0;
	g_generals_weapon_error_count = 0;
	g_generals_weapon_name_cursor = 0;

	if (inputSize < 0 || inputSize > INPUT_CAPACITY) {
		return -1;
	}

	int activeTemplate = -1;
	int lineStart = 0;
	while (lineStart < inputSize) {
		int lineEnd = lineStart;
		while (lineEnd < inputSize && g_generals_weapon_input[lineEnd] != '\n') {
			++lineEnd;
		}

		++g_generals_weapon_line_count;
		int contentStart = lineStart;
		int contentEnd = find_comment_start((const char *)g_generals_weapon_input, lineStart, lineEnd);
		trim_range((const char *)g_generals_weapon_input, &contentStart, &contentEnd);

		if (contentStart < contentEnd) {
			const int equalsIndex = find_equals((const char *)g_generals_weapon_input, contentStart, contentEnd);
			if (equalsIndex >= 0) {
				int keyStart = contentStart;
				int keyEnd = equalsIndex;
				int valueStart = equalsIndex + 1;
				int valueEnd = contentEnd;
				trim_range((const char *)g_generals_weapon_input, &keyStart, &keyEnd);
				trim_range((const char *)g_generals_weapon_input, &valueStart, &valueEnd);
				parse_property(activeTemplate, (const char *)g_generals_weapon_input, keyStart, keyEnd, valueStart, valueEnd);
			} else {
				int cursor = contentStart;
				TokenRange first;
				if (next_token((const char *)g_generals_weapon_input, &cursor, contentEnd, &first)) {
					if (ascii_equal_ignore_case((const char *)g_generals_weapon_input + first.start, first.end - first.start, "End")) {
						activeTemplate = -1;
					} else if (ascii_equal_ignore_case((const char *)g_generals_weapon_input + first.start, first.end - first.start, "Weapon")) {
						TokenRange name;
						if (next_token((const char *)g_generals_weapon_input, &cursor, contentEnd, &name)) {
							activeTemplate = start_template((const char *)g_generals_weapon_input, name, g_generals_weapon_line_count);
						} else {
							++g_generals_weapon_error_count;
						}
					} else {
						++g_generals_weapon_error_count;
					}
				}
			}
		}

		lineStart = lineEnd + 1;
	}

	return g_generals_weapon_template_count;
}

}
