extern "C" {

static const int INPUT_CAPACITY = 2 * 1024 * 1024;
static const int MAX_TEMPLATES = 2048;
static const int NAME_CAPACITY = 1024 * 1024;
static const int SURFACE_COUNT = 5;
static const int BEHAVIOR_Z_COUNT = 8;
static const int APPEARANCE_COUNT = 9;
static const int PRIORITY_COUNT = 3;
static const int BIGNUM_X100 = 9999900;
static const int BIG_SPEED_LIMIT_X100 = 99999900;
static const int INT_MAX_VALUE = 2147483647;

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

struct LocomotorTemplateRecord
{
	int nameOffset;
	int nameSize;
	int surfacesOffset;
	int surfacesSize;
	int line;
	int fieldCount;
	int surfacesMask;
	int behaviorZ;
	int appearance;
	int movePriority;
	int speedX100;
	int speedDamagedX100;
	int turnRateX100;
	int turnRateDamagedX100;
	int accelerationX100;
	int accelerationDamagedX100;
	int liftX100;
	int liftDamagedX100;
	int brakingX100;
	int minSpeedX100;
	int minTurnSpeedX100;
	int preferredHeightX100;
	int preferredHeightDampingX100;
	int circlingRadiusX100;
	int extra2DFrictionX100;
	int speedLimitZX100;
	int maxThrustAngleX100;
	int closeEnoughDistX100;
	int slideIntoPlaceTimeX100;
	int airborneTargetingHeight;
	int apply2DFrictionWhenAirborne;
	int downhillOnly;
	int allowAirborneMotiveForce;
	int locomotorWorksWhenDead;
	int stickToGround;
	int canMoveBackwards;
	int hasSuspension;
	int closeEnoughDist3D;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_locomotor_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_locomotor_names[NAME_CAPACITY];

static LocomotorTemplateRecord g_generals_locomotor_templates[MAX_TEMPLATES];
static int g_generals_locomotor_template_count = 0;
static int g_generals_locomotor_field_count = 0;
static int g_generals_locomotor_line_count = 0;
static int g_generals_locomotor_error_count = 0;
static int g_generals_locomotor_name_cursor = 0;
static int g_generals_locomotor_ground_template_count = 0;
static int g_generals_locomotor_air_template_count = 0;
static int g_generals_locomotor_water_template_count = 0;
static int g_generals_locomotor_cliff_template_count = 0;

static const char *SURFACE_NAMES[SURFACE_COUNT] = {
	"GROUND",
	"WATER",
	"CLIFF",
	"AIR",
	"RUBBLE",
};

static const char *BEHAVIOR_Z_NAMES[BEHAVIOR_Z_COUNT] = {
	"NO_Z_MOTIVE_FORCE",
	"SEA_LEVEL",
	"SURFACE_RELATIVE_HEIGHT",
	"ABSOLUTE_HEIGHT",
	"FIXED_SURFACE_RELATIVE_HEIGHT",
	"FIXED_ABSOLUTE_HEIGHT",
	"FIXED_RELATIVE_TO_GROUND_AND_BUILDINGS",
	"RELATIVE_TO_HIGHEST_LAYER",
};

static const char *APPEARANCE_NAMES[APPEARANCE_COUNT] = {
	"TWO_LEGS",
	"FOUR_WHEELS",
	"TREADS",
	"HOVER",
	"THRUST",
	"WINGS",
	"CLIMBER",
	"OTHER",
	"MOTORCYCLE",
};

static const char *PRIORITY_NAMES[PRIORITY_COUNT] = {
	"MOVES_BACK",
	"MOVES_MIDDLE",
	"MOVES_FRONT",
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
	if (valueSize < 0 || g_generals_locomotor_name_cursor + valueSize + 1 > NAME_CAPACITY) {
		return -1;
	}

	const int offset = g_generals_locomotor_name_cursor;
	for (int index = 0; index < valueSize; ++index) {
		g_generals_locomotor_names[g_generals_locomotor_name_cursor++] = value[index];
	}
	g_generals_locomotor_names[g_generals_locomotor_name_cursor++] = 0;
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
		++g_generals_locomotor_error_count;
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

	if (cursor < end && data[cursor] == '%') {
		++cursor;
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

static int parse_bool(const char *data, int start, int end, int *valueOut)
{
	int cursor = start;
	TokenRange token;
	if (!next_token(data, &cursor, end, &token)) {
		return 0;
	}

	if (token_equals(data, token, "Yes") || token_equals(data, token, "True") || token_equals(data, token, "1")) {
		*valueOut = 1;
		return 1;
	}
	if (token_equals(data, token, "No") || token_equals(data, token, "False") || token_equals(data, token, "0")) {
		*valueOut = 0;
		return 1;
	}

	return 0;
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

static int parse_named_index(const char *data, int start, int end, const char *const *names, int nameCount, int *valueOut)
{
	int cursor = start;
	TokenRange token;
	if (!next_token(data, &cursor, end, &token)) {
		return 0;
	}

	const int index = find_named_index(data, token, names, nameCount);
	if (index < 0) {
		return 0;
	}

	*valueOut = index;
	return 1;
}

static int parse_surfaces(const char *data, int start, int end, int *surfaceMask)
{
	int cursor = start;
	TokenRange token;
	int mask = 0;
	bool sawSurface = false;

	while (next_token(data, &cursor, end, &token)) {
		if (token_equals(data, token, "ALL")) {
			mask |= 0xffff;
			sawSurface = true;
			continue;
		}
		if (token_equals(data, token, "NONE") || token_equals(data, token, "NO_SURFACES")) {
			sawSurface = true;
			continue;
		}

		const int surfaceIndex = find_named_index(data, token, SURFACE_NAMES, SURFACE_COUNT);
		if (surfaceIndex < 0) {
			return 0;
		}
		mask |= (1 << surfaceIndex);
		sawSurface = true;
	}

	*surfaceMask = mask;
	return sawSurface ? 1 : 0;
}

static void clear_template(LocomotorTemplateRecord *record)
{
	record->fieldCount = 0;
	record->surfacesOffset = -1;
	record->surfacesSize = 0;
	record->surfacesMask = 0;
	record->behaviorZ = 0;
	record->appearance = 7;
	record->movePriority = 1;
	record->speedX100 = 0;
	record->speedDamagedX100 = -100;
	record->turnRateX100 = 0;
	record->turnRateDamagedX100 = -100;
	record->accelerationX100 = 0;
	record->accelerationDamagedX100 = -100;
	record->liftX100 = 0;
	record->liftDamagedX100 = -100;
	record->brakingX100 = BIGNUM_X100;
	record->minSpeedX100 = 0;
	record->minTurnSpeedX100 = BIGNUM_X100;
	record->preferredHeightX100 = 0;
	record->preferredHeightDampingX100 = 100;
	record->circlingRadiusX100 = 0;
	record->extra2DFrictionX100 = 0;
	record->speedLimitZX100 = BIG_SPEED_LIMIT_X100;
	record->maxThrustAngleX100 = 0;
	record->closeEnoughDistX100 = 100;
	record->slideIntoPlaceTimeX100 = 0;
	record->airborneTargetingHeight = INT_MAX_VALUE;
	record->apply2DFrictionWhenAirborne = 0;
	record->downhillOnly = 0;
	record->allowAirborneMotiveForce = 0;
	record->locomotorWorksWhenDead = 0;
	record->stickToGround = 0;
	record->canMoveBackwards = 0;
	record->hasSuspension = 0;
	record->closeEnoughDist3D = 0;
}

static int start_template(const char *data, TokenRange name, int line)
{
	if (g_generals_locomotor_template_count >= MAX_TEMPLATES) {
		++g_generals_locomotor_error_count;
		return -1;
	}

	const int nameSize = name.end - name.start;
	const int nameOffset = store_string(data + name.start, nameSize);
	if (nameOffset < 0) {
		++g_generals_locomotor_error_count;
		return -1;
	}

	const int templateIndex = g_generals_locomotor_template_count++;
	LocomotorTemplateRecord *record = &g_generals_locomotor_templates[templateIndex];
	record->nameOffset = nameOffset;
	record->nameSize = nameSize;
	record->line = line;
	clear_template(record);
	return templateIndex;
}

static void finalize_template(int templateIndex)
{
	if (templateIndex < 0 || templateIndex >= g_generals_locomotor_template_count) {
		return;
	}

	LocomotorTemplateRecord *record = &g_generals_locomotor_templates[templateIndex];
	if (record->speedDamagedX100 < 0) {
		record->speedDamagedX100 = record->speedX100;
	}
	if (record->turnRateDamagedX100 < 0) {
		record->turnRateDamagedX100 = record->turnRateX100;
	}
	if (record->accelerationDamagedX100 < 0) {
		record->accelerationDamagedX100 = record->accelerationX100;
	}
	if (record->liftDamagedX100 < 0) {
		record->liftDamagedX100 = record->liftX100;
	}

	if ((record->surfacesMask & (1 << 0)) != 0) {
		++g_generals_locomotor_ground_template_count;
	}
	if ((record->surfacesMask & (1 << 1)) != 0) {
		++g_generals_locomotor_water_template_count;
	}
	if ((record->surfacesMask & (1 << 2)) != 0) {
		++g_generals_locomotor_cliff_template_count;
	}
	if ((record->surfacesMask & (1 << 3)) != 0) {
		++g_generals_locomotor_air_template_count;
	}
}

static void parse_property(int templateIndex, const char *data, int keyStart, int keyEnd, int valueStart, int valueEnd)
{
	if (templateIndex < 0 || templateIndex >= g_generals_locomotor_template_count) {
		++g_generals_locomotor_error_count;
		return;
	}

	LocomotorTemplateRecord *record = &g_generals_locomotor_templates[templateIndex];
	++record->fieldCount;
	++g_generals_locomotor_field_count;

	if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Surfaces")) {
		StringField surfaces;
		assign_string(&surfaces, data, valueStart, valueEnd);
		record->surfacesOffset = surfaces.offset;
		record->surfacesSize = surfaces.size;
		if (!parse_surfaces(data, valueStart, valueEnd, &record->surfacesMask)) {
			++g_generals_locomotor_error_count;
		}
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Speed")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->speedX100)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "SpeedDamaged")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->speedDamagedX100)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "TurnRate")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->turnRateX100)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "TurnRateDamaged")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->turnRateDamagedX100)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Acceleration")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->accelerationX100)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "AccelerationDamaged")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->accelerationDamagedX100)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Lift")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->liftX100)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "LiftDamaged")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->liftDamagedX100)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Braking")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->brakingX100)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "MinSpeed")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->minSpeedX100)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "MinTurnSpeed")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->minTurnSpeedX100)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "PreferredHeight")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->preferredHeightX100)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "PreferredHeightDamping")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->preferredHeightDampingX100)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "CirclingRadius")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->circlingRadiusX100)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Extra2DFriction")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->extra2DFrictionX100)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "SpeedLimitZ")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->speedLimitZX100)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "MaxThrustAngle")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->maxThrustAngleX100)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ZAxisBehavior")) {
		if (!parse_named_index(data, valueStart, valueEnd, BEHAVIOR_Z_NAMES, BEHAVIOR_Z_COUNT, &record->behaviorZ)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Appearance")) {
		if (!parse_named_index(data, valueStart, valueEnd, APPEARANCE_NAMES, APPEARANCE_COUNT, &record->appearance)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "GroupMovementPriority")) {
		if (!parse_named_index(data, valueStart, valueEnd, PRIORITY_NAMES, PRIORITY_COUNT, &record->movePriority)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Apply2DFrictionWhenAirborne")) {
		if (!parse_bool(data, valueStart, valueEnd, &record->apply2DFrictionWhenAirborne)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "DownhillOnly")) {
		if (!parse_bool(data, valueStart, valueEnd, &record->downhillOnly)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "AllowAirborneMotiveForce")) {
		if (!parse_bool(data, valueStart, valueEnd, &record->allowAirborneMotiveForce)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "LocomotorWorksWhenDead")) {
		if (!parse_bool(data, valueStart, valueEnd, &record->locomotorWorksWhenDead)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "AirborneTargetingHeight")) {
		if (!parse_first_int(data, valueStart, valueEnd, &record->airborneTargetingHeight)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "StickToGround")) {
		if (!parse_bool(data, valueStart, valueEnd, &record->stickToGround)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "CanMoveBackwards")) {
		if (!parse_bool(data, valueStart, valueEnd, &record->canMoveBackwards)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "HasSuspension")) {
		if (!parse_bool(data, valueStart, valueEnd, &record->hasSuspension)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "CloseEnoughDist")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->closeEnoughDistX100)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "CloseEnoughDist3D")) {
		if (!parse_bool(data, valueStart, valueEnd, &record->closeEnoughDist3D)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "SlideIntoPlaceTime")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &record->slideIntoPlaceTimeX100)) { ++g_generals_locomotor_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "AccelerationPitchLimit") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "DecelerationPitchLimit") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "BounceAmount") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "PitchStiffness") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "RollStiffness") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "PitchDamping") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "RollDamping") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ThrustRoll") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ThrustWobbleRate") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ThrustMinWobble") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ThrustMaxWobble") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "PitchInDirectionOfZVelFactor") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ForwardVelocityPitchFactor") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "LateralVelocityRollFactor") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ForwardAccelerationPitchFactor") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "LateralAccelerationRollFactor") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "UniformAxialDamping") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "TurnPivotOffset") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "FrontWheelTurnAngle") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "MaximumWheelExtension") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "MaximumWheelCompression") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "WanderWidthFactor") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "WanderLengthFactor") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "WanderAboutPointRadius") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "RudderCorrectionDegree") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "RudderCorrectionRate") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ElevatorCorrectionDegree") ||
		ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ElevatorCorrectionRate")) {
		int ignored = 0;
		if (!parse_first_real_x100(data, valueStart, valueEnd, &ignored)) { ++g_generals_locomotor_error_count; }
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
	g_generals_locomotor_template_count = 0;
	g_generals_locomotor_field_count = 0;
	g_generals_locomotor_line_count = 0;
	g_generals_locomotor_error_count = 0;
	g_generals_locomotor_name_cursor = 0;
	g_generals_locomotor_ground_template_count = 0;
	g_generals_locomotor_air_template_count = 0;
	g_generals_locomotor_water_template_count = 0;
	g_generals_locomotor_cliff_template_count = 0;
}

__attribute__((used, visibility("default"))) unsigned int generals_locomotor_input_ptr()
{
	return (unsigned int)g_generals_locomotor_input;
}

__attribute__((used, visibility("default"))) int generals_locomotor_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_locomotor_parse(int size)
{
	reset_parser();
	if (size < 0 || size > INPUT_CAPACITY) {
		g_generals_locomotor_error_count = 1;
		return -1;
	}

	const char *data = (const char *)g_generals_locomotor_input;
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
				if (token_equals(data, first, "Locomotor")) {
					TokenRange name;
					if (next_token(data, &tokenCursor, contentEnd, &name)) {
						if (activeTemplate >= 0) {
							finalize_template(activeTemplate);
						}
						activeTemplate = start_template(data, name, line);
					} else {
						++g_generals_locomotor_error_count;
					}
				} else if (token_equals(data, first, "End")) {
					finalize_template(activeTemplate);
					activeTemplate = -1;
				} else if (activeTemplate >= 0) {
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

	g_generals_locomotor_line_count = line - 1;
	return g_generals_locomotor_error_count == 0 ? g_generals_locomotor_template_count : -1;
}

__attribute__((used, visibility("default"))) int generals_locomotor_template_count()
{
	return g_generals_locomotor_template_count;
}

__attribute__((used, visibility("default"))) int generals_locomotor_field_count()
{
	return g_generals_locomotor_field_count;
}

__attribute__((used, visibility("default"))) int generals_locomotor_line_count()
{
	return g_generals_locomotor_line_count;
}

__attribute__((used, visibility("default"))) int generals_locomotor_error_count()
{
	return g_generals_locomotor_error_count;
}

__attribute__((used, visibility("default"))) int generals_locomotor_ground_template_count()
{
	return g_generals_locomotor_ground_template_count;
}

__attribute__((used, visibility("default"))) int generals_locomotor_air_template_count()
{
	return g_generals_locomotor_air_template_count;
}

__attribute__((used, visibility("default"))) int generals_locomotor_water_template_count()
{
	return g_generals_locomotor_water_template_count;
}

__attribute__((used, visibility("default"))) int generals_locomotor_cliff_template_count()
{
	return g_generals_locomotor_cliff_template_count;
}

__attribute__((used, visibility("default"))) int generals_locomotor_surface_name_ptr(int index)
{
	if (index < 0 || index >= SURFACE_COUNT) {
		return 0;
	}

	return (int)SURFACE_NAMES[index];
}

__attribute__((used, visibility("default"))) int generals_locomotor_surface_name_size(int index)
{
	if (index < 0 || index >= SURFACE_COUNT) {
		return -1;
	}

	return string_length(SURFACE_NAMES[index]);
}

__attribute__((used, visibility("default"))) int generals_locomotor_behavior_z_name_ptr(int index)
{
	if (index < 0 || index >= BEHAVIOR_Z_COUNT) {
		return 0;
	}

	return (int)BEHAVIOR_Z_NAMES[index];
}

__attribute__((used, visibility("default"))) int generals_locomotor_behavior_z_name_size(int index)
{
	if (index < 0 || index >= BEHAVIOR_Z_COUNT) {
		return -1;
	}

	return string_length(BEHAVIOR_Z_NAMES[index]);
}

__attribute__((used, visibility("default"))) int generals_locomotor_appearance_name_ptr(int index)
{
	if (index < 0 || index >= APPEARANCE_COUNT) {
		return 0;
	}

	return (int)APPEARANCE_NAMES[index];
}

__attribute__((used, visibility("default"))) int generals_locomotor_appearance_name_size(int index)
{
	if (index < 0 || index >= APPEARANCE_COUNT) {
		return -1;
	}

	return string_length(APPEARANCE_NAMES[index]);
}

__attribute__((used, visibility("default"))) int generals_locomotor_priority_name_ptr(int index)
{
	if (index < 0 || index >= PRIORITY_COUNT) {
		return 0;
	}

	return (int)PRIORITY_NAMES[index];
}

__attribute__((used, visibility("default"))) int generals_locomotor_priority_name_size(int index)
{
	if (index < 0 || index >= PRIORITY_COUNT) {
		return -1;
	}

	return string_length(PRIORITY_NAMES[index]);
}

__attribute__((used, visibility("default"))) int generals_locomotor_template_name_ptr(int index)
{
	if (index < 0 || index >= g_generals_locomotor_template_count) {
		return 0;
	}

	return (int)(g_generals_locomotor_names + g_generals_locomotor_templates[index].nameOffset);
}

__attribute__((used, visibility("default"))) int generals_locomotor_template_name_size(int index)
{
	if (index < 0 || index >= g_generals_locomotor_template_count) {
		return -1;
	}

	return g_generals_locomotor_templates[index].nameSize;
}

__attribute__((used, visibility("default"))) int generals_locomotor_template_surfaces_ptr(int index)
{
	if (index < 0 || index >= g_generals_locomotor_template_count || g_generals_locomotor_templates[index].surfacesOffset < 0) {
		return 0;
	}

	return (int)(g_generals_locomotor_names + g_generals_locomotor_templates[index].surfacesOffset);
}

__attribute__((used, visibility("default"))) int generals_locomotor_template_surfaces_size(int index)
{
	if (index < 0 || index >= g_generals_locomotor_template_count) {
		return -1;
	}

	return g_generals_locomotor_templates[index].surfacesSize;
}

__attribute__((used, visibility("default"))) int generals_locomotor_template_line(int index)
{
	if (index < 0 || index >= g_generals_locomotor_template_count) {
		return -1;
	}

	return g_generals_locomotor_templates[index].line;
}

__attribute__((used, visibility("default"))) int generals_locomotor_template_field_count(int index)
{
	if (index < 0 || index >= g_generals_locomotor_template_count) {
		return -1;
	}

	return g_generals_locomotor_templates[index].fieldCount;
}

__attribute__((used, visibility("default"))) int generals_locomotor_template_surfaces_mask(int index)
{
	if (index < 0 || index >= g_generals_locomotor_template_count) {
		return -1;
	}

	return g_generals_locomotor_templates[index].surfacesMask;
}

__attribute__((used, visibility("default"))) int generals_locomotor_template_behavior_z(int index)
{
	if (index < 0 || index >= g_generals_locomotor_template_count) {
		return -1;
	}

	return g_generals_locomotor_templates[index].behaviorZ;
}

__attribute__((used, visibility("default"))) int generals_locomotor_template_appearance(int index)
{
	if (index < 0 || index >= g_generals_locomotor_template_count) {
		return -1;
	}

	return g_generals_locomotor_templates[index].appearance;
}

__attribute__((used, visibility("default"))) int generals_locomotor_template_move_priority(int index)
{
	if (index < 0 || index >= g_generals_locomotor_template_count) {
		return -1;
	}

	return g_generals_locomotor_templates[index].movePriority;
}

#define LOCOMOTOR_INT_EXPORT(name, field) \
	__attribute__((used, visibility("default"))) int generals_locomotor_template_##name(int index) \
	{ \
		if (index < 0 || index >= g_generals_locomotor_template_count) { \
			return -1; \
		} \
		return g_generals_locomotor_templates[index].field; \
	}

LOCOMOTOR_INT_EXPORT(speed_x100, speedX100)
LOCOMOTOR_INT_EXPORT(speed_damaged_x100, speedDamagedX100)
LOCOMOTOR_INT_EXPORT(turn_rate_x100, turnRateX100)
LOCOMOTOR_INT_EXPORT(turn_rate_damaged_x100, turnRateDamagedX100)
LOCOMOTOR_INT_EXPORT(acceleration_x100, accelerationX100)
LOCOMOTOR_INT_EXPORT(acceleration_damaged_x100, accelerationDamagedX100)
LOCOMOTOR_INT_EXPORT(lift_x100, liftX100)
LOCOMOTOR_INT_EXPORT(lift_damaged_x100, liftDamagedX100)
LOCOMOTOR_INT_EXPORT(braking_x100, brakingX100)
LOCOMOTOR_INT_EXPORT(min_speed_x100, minSpeedX100)
LOCOMOTOR_INT_EXPORT(min_turn_speed_x100, minTurnSpeedX100)
LOCOMOTOR_INT_EXPORT(preferred_height_x100, preferredHeightX100)
LOCOMOTOR_INT_EXPORT(preferred_height_damping_x100, preferredHeightDampingX100)
LOCOMOTOR_INT_EXPORT(circling_radius_x100, circlingRadiusX100)
LOCOMOTOR_INT_EXPORT(extra_2d_friction_x100, extra2DFrictionX100)
LOCOMOTOR_INT_EXPORT(speed_limit_z_x100, speedLimitZX100)
LOCOMOTOR_INT_EXPORT(max_thrust_angle_x100, maxThrustAngleX100)
LOCOMOTOR_INT_EXPORT(close_enough_dist_x100, closeEnoughDistX100)
LOCOMOTOR_INT_EXPORT(slide_into_place_time_x100, slideIntoPlaceTimeX100)
LOCOMOTOR_INT_EXPORT(airborne_targeting_height, airborneTargetingHeight)
LOCOMOTOR_INT_EXPORT(apply_2d_friction_when_airborne, apply2DFrictionWhenAirborne)
LOCOMOTOR_INT_EXPORT(downhill_only, downhillOnly)
LOCOMOTOR_INT_EXPORT(allow_airborne_motive_force, allowAirborneMotiveForce)
LOCOMOTOR_INT_EXPORT(locomotor_works_when_dead, locomotorWorksWhenDead)
LOCOMOTOR_INT_EXPORT(stick_to_ground, stickToGround)
LOCOMOTOR_INT_EXPORT(can_move_backwards, canMoveBackwards)
LOCOMOTOR_INT_EXPORT(has_suspension, hasSuspension)
LOCOMOTOR_INT_EXPORT(close_enough_dist_3d, closeEnoughDist3D)

}
