extern "C" {

static const int INPUT_CAPACITY = 128 * 1024;
static const int NAME_CAPACITY = 96 * 1024;
static const int MAX_SCHEMES = 32;
static const int MAX_IMAGES = 96;
static const int MAX_ANIMATIONS = 32;

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

struct CoordValue
{
	int x;
	int y;
};

struct ColorValue
{
	int r;
	int g;
	int b;
	int a;
};

struct SchemeRecord
{
	StringField name;
	StringField side;
	StringField queueButtonImage;
	StringField rightHudImage;
	StringField commandMarkerImage;
	StringField expBarForegroundImage;
	StringField powerPurchaseImage;
	StringField genArrowImage;
	CoordValue screenCreationRes;
	CoordValue powerBarUl;
	CoordValue powerBarLr;
	CoordValue moneyUl;
	CoordValue moneyLr;
	ColorValue buildUpClockColor;
	ColorValue commandBarBorderColor;
	ColorValue borderBuildColor;
	ColorValue borderActionColor;
	ColorValue borderUpgradeColor;
	ColorValue borderSystemColor;
	int line;
	int fieldCount;
	int firstImage;
	int imageCount;
	int firstAnimation;
	int animationCount;
};

struct ImageRecord
{
	StringField name;
	CoordValue position;
	CoordValue size;
	int schemeIndex;
	int animationIndex;
	int layer;
	int line;
	int fieldCount;
};

struct AnimationRecord
{
	StringField name;
	StringField animationType;
	CoordValue finalPos;
	int schemeIndex;
	int imageIndex;
	int duration;
	int line;
	int fieldCount;
};

enum BlockKind
{
	BLOCK_NONE = 0,
	BLOCK_SCHEME = 1,
	BLOCK_IMAGE_PART = 2,
	BLOCK_ANIMATING_PART = 3,
	BLOCK_ANIMATING_IMAGE_PART = 4,
};

__attribute__((used, visibility("default"))) unsigned char g_generals_controlbar_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_controlbar_names[NAME_CAPACITY];

static SchemeRecord g_schemes[MAX_SCHEMES];
static ImageRecord g_images[MAX_IMAGES];
static AnimationRecord g_animations[MAX_ANIMATIONS];
static int g_scheme_count = 0;
static int g_image_count = 0;
static int g_animation_count = 0;
static int g_parsed_count = 0;
static int g_field_count = 0;
static int g_line_count = 0;
static int g_error_count = 0;
static int g_name_cursor = 0;
static int g_current_block = BLOCK_NONE;
static int g_current_scheme = -1;
static int g_current_image = -1;
static int g_current_animation = -1;

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
		g_generals_controlbar_names[g_name_cursor++] = value[index];
	}
	g_generals_controlbar_names[g_name_cursor++] = 0;
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

static int parse_digits(const char *data, int start, int end)
{
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

static int parse_int(const char *data, int start, int end)
{
	trim_range(data, &start, &end);
	TokenRange token;
	int cursor = start;
	if (!next_token(data, &cursor, end, &token)) {
		return 0;
	}

	return parse_digits(data, token.start, token.end);
}

static bool token_key_value(const char *data, TokenRange token, char key, int *value)
{
	if (token.end - token.start < 3 || lower_ascii(data[token.start]) != lower_ascii(key) || data[token.start + 1] != ':') {
		return false;
	}

	*value = parse_digits(data, token.start + 2, token.end);
	return true;
}

static CoordValue parse_coord(const char *data, int start, int end)
{
	CoordValue coord = { 0, 0 };
	TokenRange token;
	int cursor = start;
	while (next_token(data, &cursor, end, &token)) {
		int value = 0;
		if (token_key_value(data, token, 'X', &value)) {
			coord.x = value;
		} else if (token_key_value(data, token, 'Y', &value)) {
			coord.y = value;
		}
	}

	return coord;
}

static ColorValue parse_color(const char *data, int start, int end)
{
	ColorValue color = { 0, 0, 0, 255 };
	TokenRange token;
	int cursor = start;
	while (next_token(data, &cursor, end, &token)) {
		int value = 0;
		if (token_key_value(data, token, 'R', &value)) {
			color.r = value;
		} else if (token_key_value(data, token, 'G', &value)) {
			color.g = value;
		} else if (token_key_value(data, token, 'B', &value)) {
			color.b = value;
		} else if (token_key_value(data, token, 'A', &value)) {
			color.a = value;
		}
	}

	return color;
}

static void clear_coord(CoordValue *coord)
{
	coord->x = 0;
	coord->y = 0;
}

static void clear_color(ColorValue *color)
{
	color->r = 0;
	color->g = 0;
	color->b = 0;
	color->a = 0;
}

static void init_scheme(SchemeRecord *record)
{
	clear_string(&record->name);
	clear_string(&record->side);
	clear_string(&record->queueButtonImage);
	clear_string(&record->rightHudImage);
	clear_string(&record->commandMarkerImage);
	clear_string(&record->expBarForegroundImage);
	clear_string(&record->powerPurchaseImage);
	clear_string(&record->genArrowImage);
	clear_coord(&record->screenCreationRes);
	clear_coord(&record->powerBarUl);
	clear_coord(&record->powerBarLr);
	clear_coord(&record->moneyUl);
	clear_coord(&record->moneyLr);
	clear_color(&record->buildUpClockColor);
	clear_color(&record->commandBarBorderColor);
	clear_color(&record->borderBuildColor);
	clear_color(&record->borderActionColor);
	clear_color(&record->borderUpgradeColor);
	clear_color(&record->borderSystemColor);
	record->line = -1;
	record->fieldCount = 0;
	record->firstImage = -1;
	record->imageCount = 0;
	record->firstAnimation = -1;
	record->animationCount = 0;
}

static void init_image(ImageRecord *record)
{
	clear_string(&record->name);
	clear_coord(&record->position);
	clear_coord(&record->size);
	record->schemeIndex = -1;
	record->animationIndex = -1;
	record->layer = 0;
	record->line = -1;
	record->fieldCount = 0;
}

static void init_animation(AnimationRecord *record)
{
	clear_string(&record->name);
	clear_string(&record->animationType);
	clear_coord(&record->finalPos);
	record->schemeIndex = -1;
	record->imageIndex = -1;
	record->duration = 0;
	record->line = -1;
	record->fieldCount = 0;
}

static void reset_state()
{
	g_scheme_count = 0;
	g_image_count = 0;
	g_animation_count = 0;
	g_parsed_count = 0;
	g_field_count = 0;
	g_line_count = 0;
	g_error_count = 0;
	g_name_cursor = 0;
	g_current_block = BLOCK_NONE;
	g_current_scheme = -1;
	g_current_image = -1;
	g_current_animation = -1;
}

static void note_scheme_field()
{
	if (g_current_scheme >= 0 && g_current_scheme < g_scheme_count) {
		++g_schemes[g_current_scheme].fieldCount;
	}
	++g_field_count;
}

static void note_image_field()
{
	if (g_current_image >= 0 && g_current_image < g_image_count) {
		++g_images[g_current_image].fieldCount;
	}
	note_scheme_field();
}

static void note_animation_field()
{
	if (g_current_animation >= 0 && g_current_animation < g_animation_count) {
		++g_animations[g_current_animation].fieldCount;
	}
	note_scheme_field();
}

static void start_scheme(const char *data, int nameStart, int nameEnd, int line)
{
	if (g_scheme_count >= MAX_SCHEMES) {
		++g_error_count;
		g_current_block = BLOCK_NONE;
		return;
	}

	SchemeRecord *record = &g_schemes[g_scheme_count];
	init_scheme(record);
	assign_token_string(&record->name, data, nameStart, nameEnd);
	record->line = line;
	g_current_scheme = g_scheme_count++;
	g_current_image = -1;
	g_current_animation = -1;
	g_current_block = BLOCK_SCHEME;
	++g_parsed_count;
}

static void start_image_part(int line, bool animationImage)
{
	if (g_current_scheme < 0 || g_current_scheme >= g_scheme_count || g_image_count >= MAX_IMAGES) {
		++g_error_count;
		g_current_block = BLOCK_NONE;
		return;
	}

	ImageRecord *record = &g_images[g_image_count];
	init_image(record);
	record->schemeIndex = g_current_scheme;
	record->animationIndex = animationImage ? g_current_animation : -1;
	record->line = line;

	SchemeRecord *scheme = &g_schemes[g_current_scheme];
	if (scheme->firstImage < 0) {
		scheme->firstImage = g_image_count;
	}
	++scheme->imageCount;

	if (animationImage && g_current_animation >= 0 && g_current_animation < g_animation_count) {
		g_animations[g_current_animation].imageIndex = g_image_count;
	}

	g_current_image = g_image_count++;
	g_current_block = animationImage ? BLOCK_ANIMATING_IMAGE_PART : BLOCK_IMAGE_PART;
	++g_parsed_count;
}

static void start_animation(int line)
{
	if (g_current_scheme < 0 || g_current_scheme >= g_scheme_count || g_animation_count >= MAX_ANIMATIONS) {
		++g_error_count;
		g_current_block = BLOCK_NONE;
		return;
	}

	AnimationRecord *record = &g_animations[g_animation_count];
	init_animation(record);
	record->schemeIndex = g_current_scheme;
	record->line = line;

	SchemeRecord *scheme = &g_schemes[g_current_scheme];
	if (scheme->firstAnimation < 0) {
		scheme->firstAnimation = g_animation_count;
	}
	++scheme->animationCount;

	g_current_animation = g_animation_count++;
	g_current_image = -1;
	g_current_block = BLOCK_ANIMATING_PART;
	++g_parsed_count;
}

static void close_block()
{
	if (g_current_block == BLOCK_IMAGE_PART) {
		g_current_image = -1;
		g_current_block = g_current_scheme >= 0 ? BLOCK_SCHEME : BLOCK_NONE;
	} else if (g_current_block == BLOCK_ANIMATING_IMAGE_PART) {
		g_current_image = -1;
		g_current_block = g_current_animation >= 0 ? BLOCK_ANIMATING_PART : BLOCK_SCHEME;
	} else if (g_current_block == BLOCK_ANIMATING_PART) {
		g_current_animation = -1;
		g_current_block = g_current_scheme >= 0 ? BLOCK_SCHEME : BLOCK_NONE;
	} else if (g_current_block == BLOCK_SCHEME) {
		g_current_scheme = -1;
		g_current_animation = -1;
		g_current_image = -1;
		g_current_block = BLOCK_NONE;
	}
}

static bool is_scheme_image_field(const char *data, int start, int end)
{
	return string_equals(data, start, end, "QueueButtonImage") ||
		string_equals(data, start, end, "RightHUDImage") ||
		string_equals(data, start, end, "OptionsButtonEnable") ||
		string_equals(data, start, end, "OptionsButtonHightlited") ||
		string_equals(data, start, end, "OptionsButtonPushed") ||
		string_equals(data, start, end, "OptionsButtonDisabled") ||
		string_equals(data, start, end, "IdleWorkerButtonEnable") ||
		string_equals(data, start, end, "IdleWorkerButtonHightlited") ||
		string_equals(data, start, end, "IdleWorkerButtonPushed") ||
		string_equals(data, start, end, "IdleWorkerButtonDisabled") ||
		string_equals(data, start, end, "BuddyButtonEnable") ||
		string_equals(data, start, end, "BuddyButtonHightlited") ||
		string_equals(data, start, end, "BuddyButtonPushed") ||
		string_equals(data, start, end, "BuddyButtonDisabled") ||
		string_equals(data, start, end, "BeaconButtonEnable") ||
		string_equals(data, start, end, "BeaconButtonHightlited") ||
		string_equals(data, start, end, "BeaconButtonPushed") ||
		string_equals(data, start, end, "BeaconButtonDisabled") ||
		string_equals(data, start, end, "GenBarButtonIn") ||
		string_equals(data, start, end, "GenBarButtonOn") ||
		string_equals(data, start, end, "ToggleButtonUpIn") ||
		string_equals(data, start, end, "ToggleButtonUpOn") ||
		string_equals(data, start, end, "ToggleButtonUpPushed") ||
		string_equals(data, start, end, "ToggleButtonDownIn") ||
		string_equals(data, start, end, "ToggleButtonDownOn") ||
		string_equals(data, start, end, "ToggleButtonDownPushed") ||
		string_equals(data, start, end, "GeneralButtonEnable") ||
		string_equals(data, start, end, "GeneralButtonHightlited") ||
		string_equals(data, start, end, "GeneralButtonPushed") ||
		string_equals(data, start, end, "GeneralButtonDisabled") ||
		string_equals(data, start, end, "UAttackButtonEnable") ||
		string_equals(data, start, end, "UAttackButtonHightlited") ||
		string_equals(data, start, end, "UAttackButtonPushed") ||
		string_equals(data, start, end, "GenArrow") ||
		string_equals(data, start, end, "MinMaxButtonEnable") ||
		string_equals(data, start, end, "MinMaxButtonHightlited") ||
		string_equals(data, start, end, "MinMaxButtonPushed") ||
		string_equals(data, start, end, "CommandMarkerImage") ||
		string_equals(data, start, end, "ExpBarForegroundImage") ||
		string_equals(data, start, end, "PowerPurchaseImage");
}

static bool is_scheme_coord_field(const char *data, int start, int end)
{
	return string_equals(data, start, end, "MinMaxUL") ||
		string_equals(data, start, end, "MinMaxLR") ||
		string_equals(data, start, end, "GeneralUL") ||
		string_equals(data, start, end, "GeneralLR") ||
		string_equals(data, start, end, "UAttackUL") ||
		string_equals(data, start, end, "UAttackLR") ||
		string_equals(data, start, end, "OptionsUL") ||
		string_equals(data, start, end, "OptionsLR") ||
		string_equals(data, start, end, "WorkerUL") ||
		string_equals(data, start, end, "WorkerLR") ||
		string_equals(data, start, end, "ChatUL") ||
		string_equals(data, start, end, "ChatLR") ||
		string_equals(data, start, end, "BeaconUL") ||
		string_equals(data, start, end, "BeaconLR") ||
		string_equals(data, start, end, "PowerBarUL") ||
		string_equals(data, start, end, "PowerBarLR") ||
		string_equals(data, start, end, "MoneyUL") ||
		string_equals(data, start, end, "MoneyLR");
}

static bool is_scheme_color_field(const char *data, int start, int end)
{
	return string_equals(data, start, end, "BuildUpClockColor") ||
		string_equals(data, start, end, "ButtonBorderBuildColor") ||
		string_equals(data, start, end, "CommandBarBorderColor") ||
		string_equals(data, start, end, "ButtonBorderActionColor") ||
		string_equals(data, start, end, "ButtonBorderUpgradeColor") ||
		string_equals(data, start, end, "ButtonBorderSystemColor");
}

static void parse_scheme_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd)
{
	if (g_current_scheme < 0 || g_current_scheme >= g_scheme_count) {
		return;
	}

	SchemeRecord *record = &g_schemes[g_current_scheme];
	bool parsed = true;
	if (string_equals(data, fieldStart, fieldEnd, "ScreenCreationRes")) {
		record->screenCreationRes = parse_coord(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "Side")) {
		assign_token_string(&record->side, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "QueueButtonImage")) {
		assign_token_string(&record->queueButtonImage, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "RightHUDImage")) {
		assign_token_string(&record->rightHudImage, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "CommandMarkerImage")) {
		assign_token_string(&record->commandMarkerImage, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "ExpBarForegroundImage")) {
		assign_token_string(&record->expBarForegroundImage, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "PowerPurchaseImage")) {
		assign_token_string(&record->powerPurchaseImage, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "GenArrow")) {
		assign_token_string(&record->genArrowImage, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "PowerBarUL")) {
		record->powerBarUl = parse_coord(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "PowerBarLR")) {
		record->powerBarLr = parse_coord(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "MoneyUL")) {
		record->moneyUl = parse_coord(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "MoneyLR")) {
		record->moneyLr = parse_coord(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "BuildUpClockColor")) {
		record->buildUpClockColor = parse_color(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "CommandBarBorderColor")) {
		record->commandBarBorderColor = parse_color(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "ButtonBorderBuildColor")) {
		record->borderBuildColor = parse_color(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "ButtonBorderActionColor")) {
		record->borderActionColor = parse_color(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "ButtonBorderUpgradeColor")) {
		record->borderUpgradeColor = parse_color(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "ButtonBorderSystemColor")) {
		record->borderSystemColor = parse_color(data, valueStart, valueEnd);
	} else if (!is_scheme_image_field(data, fieldStart, fieldEnd) &&
		!is_scheme_coord_field(data, fieldStart, fieldEnd) &&
		!is_scheme_color_field(data, fieldStart, fieldEnd)) {
		parsed = false;
	}

	if (parsed) {
		note_scheme_field();
	}
}

static void parse_image_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd)
{
	if (g_current_image < 0 || g_current_image >= g_image_count) {
		return;
	}

	ImageRecord *record = &g_images[g_current_image];
	bool parsed = true;
	if (string_equals(data, fieldStart, fieldEnd, "Position")) {
		record->position = parse_coord(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "Size")) {
		record->size = parse_coord(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "ImageName")) {
		assign_token_string(&record->name, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "Layer")) {
		record->layer = parse_int(data, valueStart, valueEnd);
	} else {
		parsed = false;
	}

	if (parsed) {
		note_image_field();
	}
}

static void parse_animation_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd)
{
	if (g_current_animation < 0 || g_current_animation >= g_animation_count) {
		return;
	}

	AnimationRecord *record = &g_animations[g_current_animation];
	bool parsed = true;
	if (string_equals(data, fieldStart, fieldEnd, "Name")) {
		assign_token_string(&record->name, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "Animation")) {
		assign_token_string(&record->animationType, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "Duration")) {
		record->duration = parse_int(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "FinalPos")) {
		record->finalPos = parse_coord(data, valueStart, valueEnd);
	} else {
		parsed = false;
	}

	if (parsed) {
		note_animation_field();
	}
}

static void parse_line_body(const char *data, int start, int end, int line)
{
	TokenRange field;
	int cursor = start;
	if (!next_token(data, &cursor, end, &field)) {
		return;
	}

	if (token_equals(data, field, "End")) {
		close_block();
		return;
	}

	if (token_equals(data, field, "ControlBarScheme")) {
		start_scheme(data, field.end, end, line);
		return;
	}

	if (token_equals(data, field, "ImagePart")) {
		start_image_part(line, g_current_block == BLOCK_ANIMATING_PART);
		return;
	}

	if (token_equals(data, field, "AnimatingPart")) {
		start_animation(line);
		return;
	}

	if (g_current_block == BLOCK_SCHEME) {
		parse_scheme_assignment(data, field.start, field.end, field.end, end);
	} else if (g_current_block == BLOCK_IMAGE_PART || g_current_block == BLOCK_ANIMATING_IMAGE_PART) {
		parse_image_assignment(data, field.start, field.end, field.end, end);
	} else if (g_current_block == BLOCK_ANIMATING_PART) {
		parse_animation_assignment(data, field.start, field.end, field.end, end);
	}
}

static int string_field_ptr(StringField field)
{
	return field.offset >= 0 ? (int)(g_generals_controlbar_names + field.offset) : 0;
}

__attribute__((used, visibility("default"))) int generals_controlbar_input_ptr()
{
	return (int)g_generals_controlbar_input;
}

__attribute__((used, visibility("default"))) int generals_controlbar_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_controlbar_parse(int inputSize)
{
	reset_state();

	if (inputSize < 0 || inputSize > INPUT_CAPACITY) {
		g_error_count = 1;
		return -1;
	}

	const char *data = (const char *)g_generals_controlbar_input;
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
			parse_line_body(data, lineStart, lineEnd, line);
		}

		++line;
	}

	return g_parsed_count;
}

__attribute__((used, visibility("default"))) int generals_controlbar_parsed_count()
{
	return g_parsed_count;
}

__attribute__((used, visibility("default"))) int generals_controlbar_scheme_count()
{
	return g_scheme_count;
}

__attribute__((used, visibility("default"))) int generals_controlbar_image_part_count()
{
	return g_image_count;
}

__attribute__((used, visibility("default"))) int generals_controlbar_animation_count()
{
	return g_animation_count;
}

__attribute__((used, visibility("default"))) int generals_controlbar_field_count()
{
	return g_field_count;
}

__attribute__((used, visibility("default"))) int generals_controlbar_line_count()
{
	return g_line_count;
}

__attribute__((used, visibility("default"))) int generals_controlbar_error_count()
{
	return g_error_count;
}

__attribute__((used, visibility("default"))) int generals_controlbar_scheme_name_ptr(int index)
{
	return index >= 0 && index < g_scheme_count ? string_field_ptr(g_schemes[index].name) : 0;
}

__attribute__((used, visibility("default"))) int generals_controlbar_scheme_name_size(int index)
{
	return index >= 0 && index < g_scheme_count ? g_schemes[index].name.size : -1;
}

__attribute__((used, visibility("default"))) int generals_controlbar_scheme_side_ptr(int index)
{
	return index >= 0 && index < g_scheme_count ? string_field_ptr(g_schemes[index].side) : 0;
}

__attribute__((used, visibility("default"))) int generals_controlbar_scheme_side_size(int index)
{
	return index >= 0 && index < g_scheme_count ? g_schemes[index].side.size : -1;
}

#define SCHEME_STRING_GETTER(name, field) \
	__attribute__((used, visibility("default"))) int generals_controlbar_scheme_##name##_ptr(int index) \
	{ \
		return index >= 0 && index < g_scheme_count ? string_field_ptr(g_schemes[index].field) : 0; \
	} \
	__attribute__((used, visibility("default"))) int generals_controlbar_scheme_##name##_size(int index) \
	{ \
		return index >= 0 && index < g_scheme_count ? g_schemes[index].field.size : -1; \
	}

SCHEME_STRING_GETTER(queue_button_image, queueButtonImage)
SCHEME_STRING_GETTER(right_hud_image, rightHudImage)
SCHEME_STRING_GETTER(command_marker_image, commandMarkerImage)
SCHEME_STRING_GETTER(exp_bar_foreground_image, expBarForegroundImage)
SCHEME_STRING_GETTER(power_purchase_image, powerPurchaseImage)
SCHEME_STRING_GETTER(gen_arrow_image, genArrowImage)

#undef SCHEME_STRING_GETTER

__attribute__((used, visibility("default"))) int generals_controlbar_scheme_line(int index)
{
	return index >= 0 && index < g_scheme_count ? g_schemes[index].line : -1;
}

__attribute__((used, visibility("default"))) int generals_controlbar_scheme_field_count_at(int index)
{
	return index >= 0 && index < g_scheme_count ? g_schemes[index].fieldCount : -1;
}

__attribute__((used, visibility("default"))) int generals_controlbar_scheme_first_image(int index)
{
	return index >= 0 && index < g_scheme_count ? g_schemes[index].firstImage : -1;
}

__attribute__((used, visibility("default"))) int generals_controlbar_scheme_image_count_at(int index)
{
	return index >= 0 && index < g_scheme_count ? g_schemes[index].imageCount : -1;
}

__attribute__((used, visibility("default"))) int generals_controlbar_scheme_animation_count_at(int index)
{
	return index >= 0 && index < g_scheme_count ? g_schemes[index].animationCount : -1;
}

#define SCHEME_COORD_GETTER(name, field) \
	__attribute__((used, visibility("default"))) int generals_controlbar_scheme_##name##_x(int index) \
	{ \
		return index >= 0 && index < g_scheme_count ? g_schemes[index].field.x : -1; \
	} \
	__attribute__((used, visibility("default"))) int generals_controlbar_scheme_##name##_y(int index) \
	{ \
		return index >= 0 && index < g_scheme_count ? g_schemes[index].field.y : -1; \
	}

SCHEME_COORD_GETTER(screen_creation_res, screenCreationRes)
SCHEME_COORD_GETTER(power_bar_ul, powerBarUl)
SCHEME_COORD_GETTER(power_bar_lr, powerBarLr)
SCHEME_COORD_GETTER(money_ul, moneyUl)
SCHEME_COORD_GETTER(money_lr, moneyLr)

#undef SCHEME_COORD_GETTER

#define SCHEME_COLOR_GETTER(name, field) \
	__attribute__((used, visibility("default"))) int generals_controlbar_scheme_##name##_r(int index) \
	{ \
		return index >= 0 && index < g_scheme_count ? g_schemes[index].field.r : -1; \
	} \
	__attribute__((used, visibility("default"))) int generals_controlbar_scheme_##name##_g(int index) \
	{ \
		return index >= 0 && index < g_scheme_count ? g_schemes[index].field.g : -1; \
	} \
	__attribute__((used, visibility("default"))) int generals_controlbar_scheme_##name##_b(int index) \
	{ \
		return index >= 0 && index < g_scheme_count ? g_schemes[index].field.b : -1; \
	} \
	__attribute__((used, visibility("default"))) int generals_controlbar_scheme_##name##_a(int index) \
	{ \
		return index >= 0 && index < g_scheme_count ? g_schemes[index].field.a : -1; \
	}

SCHEME_COLOR_GETTER(build_up_clock_color, buildUpClockColor)
SCHEME_COLOR_GETTER(command_bar_border_color, commandBarBorderColor)
SCHEME_COLOR_GETTER(border_build_color, borderBuildColor)
SCHEME_COLOR_GETTER(border_action_color, borderActionColor)
SCHEME_COLOR_GETTER(border_upgrade_color, borderUpgradeColor)
SCHEME_COLOR_GETTER(border_system_color, borderSystemColor)

#undef SCHEME_COLOR_GETTER

__attribute__((used, visibility("default"))) int generals_controlbar_image_part_name_ptr(int index)
{
	return index >= 0 && index < g_image_count ? string_field_ptr(g_images[index].name) : 0;
}

__attribute__((used, visibility("default"))) int generals_controlbar_image_part_name_size(int index)
{
	return index >= 0 && index < g_image_count ? g_images[index].name.size : -1;
}

__attribute__((used, visibility("default"))) int generals_controlbar_image_part_scheme_index(int index)
{
	return index >= 0 && index < g_image_count ? g_images[index].schemeIndex : -1;
}

__attribute__((used, visibility("default"))) int generals_controlbar_image_part_animation_index(int index)
{
	return index >= 0 && index < g_image_count ? g_images[index].animationIndex : -1;
}

__attribute__((used, visibility("default"))) int generals_controlbar_image_part_position_x(int index)
{
	return index >= 0 && index < g_image_count ? g_images[index].position.x : -1;
}

__attribute__((used, visibility("default"))) int generals_controlbar_image_part_position_y(int index)
{
	return index >= 0 && index < g_image_count ? g_images[index].position.y : -1;
}

__attribute__((used, visibility("default"))) int generals_controlbar_image_part_size_x(int index)
{
	return index >= 0 && index < g_image_count ? g_images[index].size.x : -1;
}

__attribute__((used, visibility("default"))) int generals_controlbar_image_part_size_y(int index)
{
	return index >= 0 && index < g_image_count ? g_images[index].size.y : -1;
}

__attribute__((used, visibility("default"))) int generals_controlbar_image_part_layer(int index)
{
	return index >= 0 && index < g_image_count ? g_images[index].layer : -1;
}

__attribute__((used, visibility("default"))) int generals_controlbar_image_part_line(int index)
{
	return index >= 0 && index < g_image_count ? g_images[index].line : -1;
}

__attribute__((used, visibility("default"))) int generals_controlbar_image_part_field_count_at(int index)
{
	return index >= 0 && index < g_image_count ? g_images[index].fieldCount : -1;
}

__attribute__((used, visibility("default"))) int generals_controlbar_animation_name_ptr(int index)
{
	return index >= 0 && index < g_animation_count ? string_field_ptr(g_animations[index].name) : 0;
}

__attribute__((used, visibility("default"))) int generals_controlbar_animation_name_size(int index)
{
	return index >= 0 && index < g_animation_count ? g_animations[index].name.size : -1;
}

__attribute__((used, visibility("default"))) int generals_controlbar_animation_type_ptr(int index)
{
	return index >= 0 && index < g_animation_count ? string_field_ptr(g_animations[index].animationType) : 0;
}

__attribute__((used, visibility("default"))) int generals_controlbar_animation_type_size(int index)
{
	return index >= 0 && index < g_animation_count ? g_animations[index].animationType.size : -1;
}

__attribute__((used, visibility("default"))) int generals_controlbar_animation_scheme_index(int index)
{
	return index >= 0 && index < g_animation_count ? g_animations[index].schemeIndex : -1;
}

__attribute__((used, visibility("default"))) int generals_controlbar_animation_image_index(int index)
{
	return index >= 0 && index < g_animation_count ? g_animations[index].imageIndex : -1;
}

__attribute__((used, visibility("default"))) int generals_controlbar_animation_duration(int index)
{
	return index >= 0 && index < g_animation_count ? g_animations[index].duration : -1;
}

__attribute__((used, visibility("default"))) int generals_controlbar_animation_final_pos_x(int index)
{
	return index >= 0 && index < g_animation_count ? g_animations[index].finalPos.x : -1;
}

__attribute__((used, visibility("default"))) int generals_controlbar_animation_final_pos_y(int index)
{
	return index >= 0 && index < g_animation_count ? g_animations[index].finalPos.y : -1;
}

__attribute__((used, visibility("default"))) int generals_controlbar_animation_line(int index)
{
	return index >= 0 && index < g_animation_count ? g_animations[index].line : -1;
}

__attribute__((used, visibility("default"))) int generals_controlbar_animation_field_count_at(int index)
{
	return index >= 0 && index < g_animation_count ? g_animations[index].fieldCount : -1;
}

}
