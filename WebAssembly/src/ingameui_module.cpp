extern "C" {

// Parses the InGameUI INI block (a single flat settings block) following the
// field parse table in
// GeneralsMD/Code/GameEngine/Source/GameClient/InGameUI.cpp. A curated subset of
// the message, military-caption, floating-text, and drawable-caption settings
// is exposed individually; the full set of recognized field names (including
// the many *RadiusCursor cursor bindings) is matched so the field count stays
// faithful to the source definition. RadiusCursor fields are also tallied.

static const int INPUT_CAPACITY = 64 * 1024;
static const int NAME_CAPACITY = 32 * 1024;
static const int MAX_RADIUS_CURSORS = 64;

// Every recognized InGameUI field name. Names not in the curated setter list
// are still counted (and *RadiusCursor names additionally tallied).
static const char *const INGAMEUI_FIELD_NAMES[] = {
	"A10StrikeRadiusCursor",
	"AmbulanceRadiusCursor",
	"AmbushRadiusCursor",
	"AnthraxBombRadiusCursor",
	"ArtilleryRadiusCursor",
	"AttackContinueAreaRadiusCursor",
	"AttackDamageAreaRadiusCursor",
	"AttackScatterAreaRadiusCursor",
	"CarpetBombRadiusCursor",
	"ClearMinesRadiusCursor",
	"ClusterMinesRadiusCursor",
	"DaisyCutterRadiusCursor",
	"DrawableCaptionBold",
	"DrawableCaptionColor",
	"DrawableCaptionFont",
	"DrawableCaptionPointSize",
	"DrawRMBScrollAnchor",
	"EmergencyRepairRadiusCursor",
	"EMPPulseRadiusCursor",
	"FloatingTextMoveUpSpeed",
	"FloatingTextTimeOut",
	"FloatingTextVanishRate",
	"FrenzyRadiusCursor",
	"FriendlySpecialPowerRadiusCursor",
	"GuardAreaRadiusCursor",
	"HelixNapalmBombRadiusCursor",
	"MaxSelectionSize",
	"MessageBold",
	"MessageColor1",
	"MessageColor2",
	"MessageDelayMS",
	"MessageFont",
	"MessagePointSize",
	"MessagePosition",
	"MilitaryCaptionBold",
	"MilitaryCaptionColor",
	"MilitaryCaptionFont",
	"MilitaryCaptionPointSize",
	"MilitaryCaptionPosition",
	"MilitaryCaptionRandomizeTyping",
	"MilitaryCaptionSpeed",
	"MilitaryCaptionTitleBold",
	"MilitaryCaptionTitleFont",
	"MilitaryCaptionTitlePointSize",
	"MoveRMBScrollAnchor",
	"NamedTimerCountdownFlashColor",
	"NamedTimerCountdownFlashDuration",
	"NamedTimerCountdownNormalBold",
	"NamedTimerCountdownNormalColor",
	"NamedTimerCountdownNormalFont",
	"NamedTimerCountdownNormalPointSize",
	"NamedTimerCountdownPosition",
	"NamedTimerCountdownReadyBold",
	"NamedTimerCountdownReadyColor",
	"NamedTimerCountdownReadyFont",
	"NamedTimerCountdownReadyPointSize",
	"NapalmStrikeRadiusCursor",
	"NuclearMissileRadiusCursor",
	"OffensiveSpecialPowerRadiusCursor",
	"ParadropRadiusCursor",
	"ParticleCannonRadiusCursor",
	"PopupMessageColor",
	"RadarRadiusCursor",
	"ScudStormRadiusCursor",
	"SpectreGunshipRadiusCursor",
	"SpyDroneRadiusCursor",
	"SpySatelliteRadiusCursor",
	"SuperweaponCountdownFlashColor",
	"SuperweaponCountdownFlashDuration",
	"SuperweaponCountdownNormalBold",
	"SuperweaponCountdownNormalFont",
	"SuperweaponCountdownNormalPointSize",
	"SuperweaponCountdownPosition",
	"SuperweaponCountdownReadyBold",
	"SuperweaponCountdownReadyFont",
	"SuperweaponCountdownReadyPointSize",
	"SuperweaponScatterAreaRadiusCursor",
};
static const int INGAMEUI_FIELD_COUNT = (int)(sizeof(INGAMEUI_FIELD_NAMES) / sizeof(INGAMEUI_FIELD_NAMES[0]));

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

// One special-power targeting decal (a RadiusCursor sub-block of InGameUI).
struct RadiusCursorRecord
{
	StringField name;
	StringField texture;
	StringField style;
	int line;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_ingameui_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_ingameui_names[NAME_CAPACITY];

static RadiusCursorRecord g_radius_cursors[MAX_RADIUS_CURSORS];
static int g_current_radius_cursor = -1;

static int g_has_block = 0;
static int g_in_block = 0;
static int g_in_radius_cursor = 0;
static int g_field_count = 0;
static int g_radius_cursor_count = 0;
static int g_line_count = 0;
static int g_error_count = 0;
static int g_name_cursor = 0;

static int g_max_selection_size = 0;
static int g_message_color1_r = 0, g_message_color1_g = 0, g_message_color1_b = 0;
static int g_message_color2_r = 0, g_message_color2_g = 0, g_message_color2_b = 0;
static int g_message_pos_x = 0, g_message_pos_y = 0;
static StringField g_message_font;
static int g_message_point_size = 0;
static int g_message_bold = 0;
static int g_message_delay_ms = 0;
static int g_military_color_r = 0, g_military_color_g = 0, g_military_color_b = 0, g_military_color_a = 255;
static int g_floating_text_time_out = 0;
static StringField g_drawable_caption_font;
static int g_drawable_caption_point_size = 0;
static int g_drawable_caption_bold = 0;

// Superweapon / named-timer countdown HUD layout (positions are fractional, so
// stored as thousandths).
static int g_superweapon_pos_x1000 = 0, g_superweapon_pos_y1000 = 0;
static StringField g_superweapon_normal_font;
static int g_superweapon_ready_bold = 0;
static int g_named_timer_pos_x1000 = 0, g_named_timer_pos_y1000 = 0;
static StringField g_named_timer_normal_font;

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

// Case-insensitive check that the token ends with the given suffix.
static bool ascii_ends_with_ignore_case(const char *data, int size, const char *suffix)
{
	int suffixLen = 0;
	while (suffix[suffixLen] != 0) {
		++suffixLen;
	}
	if (size < suffixLen) {
		return false;
	}
	for (int index = 0; index < suffixLen; ++index) {
		if (lower_ascii(data[size - suffixLen + index]) != lower_ascii(suffix[index])) {
			return false;
		}
	}
	return true;
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

static int find_field_index(const char *data, TokenRange token)
{
	for (int index = 0; index < INGAMEUI_FIELD_COUNT; ++index) {
		if (ascii_equal_ignore_case(data + token.start, token.end - token.start, INGAMEUI_FIELD_NAMES[index])) {
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
		g_generals_ingameui_names[g_name_cursor++] = value[index];
	}
	g_generals_ingameui_names[g_name_cursor++] = 0;
	return offset;
}

static void clear_string(StringField *field)
{
	field->offset = -1;
	field->size = 0;
}

static void assign_token_string(StringField *field, const char *data, int start, int end)
{
	TokenRange token;
	int cursor = start;
	if (!next_token(data, &cursor, end, &token)) {
		clear_string(field);
		return;
	}

	const int size = token.end - token.start;
	const int offset = store_string(data + token.start, size);
	if (offset < 0) {
		++g_error_count;
		clear_string(field);
		return;
	}

	field->offset = offset;
	field->size = size;
}

static int parse_int_token(const char *data, int start, int end, int *valueOut)
{
	TokenRange token;
	int cursor = start;
	if (!next_token(data, &cursor, end, &token)) {
		return 0;
	}

	int pos = token.start;
	bool negative = false;
	if (pos < token.end && (data[pos] == '-' || data[pos] == '+')) {
		negative = data[pos] == '-';
		++pos;
	}

	int value = 0;
	bool sawDigit = false;
	while (pos < token.end && data[pos] >= '0' && data[pos] <= '9') {
		sawDigit = true;
		value = value * 10 + (data[pos] - '0');
		++pos;
	}

	if (!sawDigit) {
		return 0;
	}

	*valueOut = negative ? -value : value;
	return 1;
}

static int parse_bool_token(const char *data, int start, int end)
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

static int clamp_color(int value)
{
	if (value < 0) {
		return 0;
	}
	if (value > 255) {
		return 255;
	}
	return value;
}

static int parse_labeled_int(const char *data, int *cursor, int end)
{
	while (*cursor < end && (is_space(data[*cursor]) || data[*cursor] == ':')) {
		++(*cursor);
	}

	int value = 0;
	bool negative = false;
	if (*cursor < end && data[*cursor] == '-') {
		negative = true;
		++(*cursor);
	}
	while (*cursor < end && data[*cursor] >= '0' && data[*cursor] <= '9') {
		value = value * 10 + (data[*cursor] - '0');
		++(*cursor);
	}

	return negative ? -value : value;
}

static void parse_rgba(const char *data, int start, int end, int *r, int *g, int *b, int *a)
{
	*r = 0;
	*g = 0;
	*b = 0;
	*a = 255;
	for (int cursor = start; cursor < end; ++cursor) {
		const char label = lower_ascii(data[cursor]);
		if ((label == 'r' || label == 'g' || label == 'b' || label == 'a') && cursor + 1 < end && data[cursor + 1] == ':') {
			++cursor;
			const int value = clamp_color(parse_labeled_int(data, &cursor, end));
			if (label == 'r') {
				*r = value;
			} else if (label == 'g') {
				*g = value;
			} else if (label == 'b') {
				*b = value;
			} else {
				*a = value;
			}
		}
	}
}

static void parse_coord2d(const char *data, int start, int end, int *x, int *y)
{
	for (int cursor = start; cursor < end; ++cursor) {
		const char label = lower_ascii(data[cursor]);
		if ((label == 'x' || label == 'y') && cursor + 1 < end && data[cursor + 1] == ':') {
			++cursor;
			const int value = parse_labeled_int(data, &cursor, end);
			if (label == 'x') {
				*x = value;
			} else {
				*y = value;
			}
		}
	}
}

// Reads a fractional labeled number (e.g. "0.90") as thousandths.
static int parse_labeled_x1000(const char *data, int *cursor, int end)
{
	while (*cursor < end && (is_space(data[*cursor]) || data[*cursor] == ':')) {
		++(*cursor);
	}

	bool negative = false;
	if (*cursor < end && data[*cursor] == '-') {
		negative = true;
		++(*cursor);
	}

	int whole = 0;
	while (*cursor < end && data[*cursor] >= '0' && data[*cursor] <= '9') {
		whole = whole * 10 + (data[*cursor] - '0');
		++(*cursor);
	}

	int fraction = 0;
	int digits = 0;
	if (*cursor < end && data[*cursor] == '.') {
		++(*cursor);
		while (*cursor < end && data[*cursor] >= '0' && data[*cursor] <= '9') {
			if (digits < 3) {
				fraction = fraction * 10 + (data[*cursor] - '0');
				++digits;
			}
			++(*cursor);
		}
	}
	while (digits < 3) {
		fraction *= 10;
		++digits;
	}

	const int value = whole * 1000 + fraction;
	return negative ? -value : value;
}

static void parse_coord2d_x1000(const char *data, int start, int end, int *x, int *y)
{
	for (int cursor = start; cursor < end; ++cursor) {
		const char label = lower_ascii(data[cursor]);
		if ((label == 'x' || label == 'y') && cursor + 1 < end && data[cursor + 1] == ':') {
			++cursor;
			const int value = parse_labeled_x1000(data, &cursor, end);
			if (label == 'x') {
				*x = value;
			} else {
				*y = value;
			}
		}
	}
}

static void reset_state()
{
	g_has_block = 0;
	g_in_block = 0;
	g_in_radius_cursor = 0;
	g_current_radius_cursor = -1;
	g_field_count = 0;
	g_radius_cursor_count = 0;
	g_line_count = 0;
	g_error_count = 0;
	g_name_cursor = 0;

	g_max_selection_size = 0;
	g_message_color1_r = 0; g_message_color1_g = 0; g_message_color1_b = 0;
	g_message_color2_r = 0; g_message_color2_g = 0; g_message_color2_b = 0;
	g_message_pos_x = 0; g_message_pos_y = 0;
	clear_string(&g_message_font);
	g_message_point_size = 0;
	g_message_bold = 0;
	g_message_delay_ms = 0;
	g_military_color_r = 0; g_military_color_g = 0; g_military_color_b = 0; g_military_color_a = 255;
	g_floating_text_time_out = 0;
	clear_string(&g_drawable_caption_font);
	g_drawable_caption_point_size = 0;
	g_drawable_caption_bold = 0;
	g_superweapon_pos_x1000 = 0; g_superweapon_pos_y1000 = 0;
	clear_string(&g_superweapon_normal_font);
	g_superweapon_ready_bold = 0;
	g_named_timer_pos_x1000 = 0; g_named_timer_pos_y1000 = 0;
	clear_string(&g_named_timer_normal_font);
}

static void parse_field(const char *data, TokenRange field, int valueStart, int valueEnd)
{
	const int fieldIndex = find_field_index(data, field);
	if (fieldIndex < 0) {
		return;
	}

	// *RadiusCursor fields open a nested cursor sub-block (Texture/Style/...End);
	// count the binding and enter the sub-block so its inner End does not close
	// the outer InGameUI block.
	if (ascii_ends_with_ignore_case(data + field.start, field.end - field.start, "RadiusCursor")) {
		++g_radius_cursor_count;
		++g_field_count;
		g_in_radius_cursor = 1;
		g_current_radius_cursor = -1;
		if (g_radius_cursor_count - 1 < MAX_RADIUS_CURSORS) {
			RadiusCursorRecord *cursor = &g_radius_cursors[g_radius_cursor_count - 1];
			clear_string(&cursor->name);
			clear_string(&cursor->texture);
			clear_string(&cursor->style);
			const int size = field.end - field.start;
			const int offset = store_string(data + field.start, size);
			if (offset >= 0) {
				cursor->name.offset = offset;
				cursor->name.size = size;
			}
			cursor->line = -1;
			g_current_radius_cursor = g_radius_cursor_count - 1;
		}
		return;
	}

	if (token_equals(data, field, "MaxSelectionSize")) {
		parse_int_token(data, valueStart, valueEnd, &g_max_selection_size);
	} else if (token_equals(data, field, "MessageColor1")) {
		int a = 0;
		parse_rgba(data, valueStart, valueEnd, &g_message_color1_r, &g_message_color1_g, &g_message_color1_b, &a);
	} else if (token_equals(data, field, "MessageColor2")) {
		int a = 0;
		parse_rgba(data, valueStart, valueEnd, &g_message_color2_r, &g_message_color2_g, &g_message_color2_b, &a);
	} else if (token_equals(data, field, "MessagePosition")) {
		parse_coord2d(data, valueStart, valueEnd, &g_message_pos_x, &g_message_pos_y);
	} else if (token_equals(data, field, "MessageFont")) {
		assign_token_string(&g_message_font, data, valueStart, valueEnd);
	} else if (token_equals(data, field, "MessagePointSize")) {
		parse_int_token(data, valueStart, valueEnd, &g_message_point_size);
	} else if (token_equals(data, field, "MessageBold")) {
		g_message_bold = parse_bool_token(data, valueStart, valueEnd);
	} else if (token_equals(data, field, "MessageDelayMS")) {
		parse_int_token(data, valueStart, valueEnd, &g_message_delay_ms);
	} else if (token_equals(data, field, "MilitaryCaptionColor")) {
		parse_rgba(data, valueStart, valueEnd, &g_military_color_r, &g_military_color_g, &g_military_color_b, &g_military_color_a);
	} else if (token_equals(data, field, "FloatingTextTimeOut")) {
		parse_int_token(data, valueStart, valueEnd, &g_floating_text_time_out);
	} else if (token_equals(data, field, "DrawableCaptionFont")) {
		assign_token_string(&g_drawable_caption_font, data, valueStart, valueEnd);
	} else if (token_equals(data, field, "DrawableCaptionPointSize")) {
		parse_int_token(data, valueStart, valueEnd, &g_drawable_caption_point_size);
	} else if (token_equals(data, field, "DrawableCaptionBold")) {
		g_drawable_caption_bold = parse_bool_token(data, valueStart, valueEnd);
	} else if (token_equals(data, field, "SuperweaponCountdownPosition")) {
		parse_coord2d_x1000(data, valueStart, valueEnd, &g_superweapon_pos_x1000, &g_superweapon_pos_y1000);
	} else if (token_equals(data, field, "SuperweaponCountdownNormalFont")) {
		assign_token_string(&g_superweapon_normal_font, data, valueStart, valueEnd);
	} else if (token_equals(data, field, "SuperweaponCountdownReadyBold")) {
		g_superweapon_ready_bold = parse_bool_token(data, valueStart, valueEnd);
	} else if (token_equals(data, field, "NamedTimerCountdownPosition")) {
		parse_coord2d_x1000(data, valueStart, valueEnd, &g_named_timer_pos_x1000, &g_named_timer_pos_y1000);
	} else if (token_equals(data, field, "NamedTimerCountdownNormalFont")) {
		assign_token_string(&g_named_timer_normal_font, data, valueStart, valueEnd);
	}

	++g_field_count;
}

static void parse_line(const char *data, int start, int end)
{
	TokenRange first;
	int cursor = start;
	if (!next_token(data, &cursor, end, &first)) {
		return;
	}

	const int valueStart = cursor;

	if (token_equals(data, first, "End")) {
		if (g_in_radius_cursor) {
			g_in_radius_cursor = 0;
		} else {
			g_in_block = 0;
		}
		return;
	}

	if (token_equals(data, first, "InGameUI")) {
		g_has_block = 1;
		g_in_block = 1;
		g_in_radius_cursor = 0;
		return;
	}

	if (g_in_radius_cursor) {
		// Capture the most useful cursor fields; the rest are intentionally
		// skipped and not counted toward the InGameUI field total.
		if (g_current_radius_cursor >= 0) {
			RadiusCursorRecord *cursor = &g_radius_cursors[g_current_radius_cursor];
			if (token_equals(data, first, "Texture")) {
				assign_token_string(&cursor->texture, data, valueStart, end);
			} else if (token_equals(data, first, "Style")) {
				assign_token_string(&cursor->style, data, valueStart, end);
			}
		}
		return;
	}

	if (g_in_block) {
		parse_field(data, first, valueStart, end);
	}
}

static int string_field_ptr(StringField field)
{
	return field.offset >= 0 ? (int)(g_generals_ingameui_names + field.offset) : 0;
}

__attribute__((used, visibility("default"))) int generals_ingameui_input_ptr()
{
	return (int)g_generals_ingameui_input;
}

__attribute__((used, visibility("default"))) int generals_ingameui_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_ingameui_parse(int inputSize)
{
	reset_state();

	if (inputSize < 0 || inputSize > INPUT_CAPACITY) {
		g_error_count = 1;
		return -1;
	}

	const char *data = (const char *)g_generals_ingameui_input;
	int cursor = 0;
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
			parse_line(data, lineStart, lineEnd);
		}
	}

	return g_field_count;
}

__attribute__((used, visibility("default"))) int generals_ingameui_has_block() { return g_has_block; }
__attribute__((used, visibility("default"))) int generals_ingameui_field_count() { return g_field_count; }
__attribute__((used, visibility("default"))) int generals_ingameui_known_field_count() { return INGAMEUI_FIELD_COUNT; }
__attribute__((used, visibility("default"))) int generals_ingameui_radius_cursor_count() { return g_radius_cursor_count; }
__attribute__((used, visibility("default"))) int generals_ingameui_line_count() { return g_line_count; }
__attribute__((used, visibility("default"))) int generals_ingameui_error_count() { return g_error_count; }

__attribute__((used, visibility("default"))) int generals_ingameui_max_selection_size() { return g_max_selection_size; }
__attribute__((used, visibility("default"))) int generals_ingameui_message_color1_r() { return g_message_color1_r; }
__attribute__((used, visibility("default"))) int generals_ingameui_message_color1_g() { return g_message_color1_g; }
__attribute__((used, visibility("default"))) int generals_ingameui_message_color1_b() { return g_message_color1_b; }
__attribute__((used, visibility("default"))) int generals_ingameui_message_color2_r() { return g_message_color2_r; }
__attribute__((used, visibility("default"))) int generals_ingameui_message_color2_g() { return g_message_color2_g; }
__attribute__((used, visibility("default"))) int generals_ingameui_message_color2_b() { return g_message_color2_b; }
__attribute__((used, visibility("default"))) int generals_ingameui_message_pos_x() { return g_message_pos_x; }
__attribute__((used, visibility("default"))) int generals_ingameui_message_pos_y() { return g_message_pos_y; }
__attribute__((used, visibility("default"))) int generals_ingameui_message_font_ptr() { return string_field_ptr(g_message_font); }
__attribute__((used, visibility("default"))) int generals_ingameui_message_font_size() { return g_message_font.size; }
__attribute__((used, visibility("default"))) int generals_ingameui_message_point_size() { return g_message_point_size; }
__attribute__((used, visibility("default"))) int generals_ingameui_message_bold() { return g_message_bold; }
__attribute__((used, visibility("default"))) int generals_ingameui_message_delay_ms() { return g_message_delay_ms; }
__attribute__((used, visibility("default"))) int generals_ingameui_military_color_r() { return g_military_color_r; }
__attribute__((used, visibility("default"))) int generals_ingameui_military_color_g() { return g_military_color_g; }
__attribute__((used, visibility("default"))) int generals_ingameui_military_color_b() { return g_military_color_b; }
__attribute__((used, visibility("default"))) int generals_ingameui_military_color_a() { return g_military_color_a; }
__attribute__((used, visibility("default"))) int generals_ingameui_floating_text_time_out() { return g_floating_text_time_out; }
__attribute__((used, visibility("default"))) int generals_ingameui_drawable_caption_font_ptr() { return string_field_ptr(g_drawable_caption_font); }
__attribute__((used, visibility("default"))) int generals_ingameui_drawable_caption_font_size() { return g_drawable_caption_font.size; }
__attribute__((used, visibility("default"))) int generals_ingameui_drawable_caption_point_size() { return g_drawable_caption_point_size; }
__attribute__((used, visibility("default"))) int generals_ingameui_drawable_caption_bold() { return g_drawable_caption_bold; }
__attribute__((used, visibility("default"))) int generals_ingameui_superweapon_pos_x1000() { return g_superweapon_pos_x1000; }
__attribute__((used, visibility("default"))) int generals_ingameui_superweapon_pos_y1000() { return g_superweapon_pos_y1000; }
__attribute__((used, visibility("default"))) int generals_ingameui_superweapon_normal_font_ptr() { return string_field_ptr(g_superweapon_normal_font); }
__attribute__((used, visibility("default"))) int generals_ingameui_superweapon_normal_font_size() { return g_superweapon_normal_font.size; }
__attribute__((used, visibility("default"))) int generals_ingameui_superweapon_ready_bold() { return g_superweapon_ready_bold; }
__attribute__((used, visibility("default"))) int generals_ingameui_named_timer_pos_x1000() { return g_named_timer_pos_x1000; }
__attribute__((used, visibility("default"))) int generals_ingameui_named_timer_pos_y1000() { return g_named_timer_pos_y1000; }
__attribute__((used, visibility("default"))) int generals_ingameui_named_timer_normal_font_ptr() { return string_field_ptr(g_named_timer_normal_font); }
__attribute__((used, visibility("default"))) int generals_ingameui_named_timer_normal_font_size() { return g_named_timer_normal_font.size; }

// Stored RadiusCursor records (capped at MAX_RADIUS_CURSORS); the tally in
// generals_ingameui_radius_cursor_count may exceed the number stored.
__attribute__((used, visibility("default"))) int generals_ingameui_stored_radius_cursor_count()
{
	return g_radius_cursor_count < MAX_RADIUS_CURSORS ? g_radius_cursor_count : MAX_RADIUS_CURSORS;
}

#define RC_GUARD(expr, fallback) (index >= 0 && index < g_radius_cursor_count && index < MAX_RADIUS_CURSORS ? (expr) : (fallback))

__attribute__((used, visibility("default"))) int generals_ingameui_radius_cursor_name_ptr(int index)
{
	return RC_GUARD(string_field_ptr(g_radius_cursors[index].name), 0);
}

__attribute__((used, visibility("default"))) int generals_ingameui_radius_cursor_name_size(int index)
{
	return RC_GUARD(g_radius_cursors[index].name.size, -1);
}

__attribute__((used, visibility("default"))) int generals_ingameui_radius_cursor_texture_ptr(int index)
{
	return RC_GUARD(string_field_ptr(g_radius_cursors[index].texture), 0);
}

__attribute__((used, visibility("default"))) int generals_ingameui_radius_cursor_texture_size(int index)
{
	return RC_GUARD(g_radius_cursors[index].texture.size, -1);
}

__attribute__((used, visibility("default"))) int generals_ingameui_radius_cursor_style_ptr(int index)
{
	return RC_GUARD(string_field_ptr(g_radius_cursors[index].style), 0);
}

__attribute__((used, visibility("default"))) int generals_ingameui_radius_cursor_style_size(int index)
{
	return RC_GUARD(g_radius_cursors[index].style.size, -1);
}

}
