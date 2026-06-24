extern "C" {

// Parses Mouse.INI: the single global "Mouse" settings block (tooltip and drag
// configuration) and the repeated "MouseCursor" blocks (image, texture,
// hotspot, animation, and text color per cursor). Field names follow
// TheMouseFieldParseTable and TheMouseCursorFieldParseTable in
// GeneralsMD/Code/GameEngine/Source/GameClient/Input/Mouse.cpp. Real values are
// stored as fixed-point hundredths (x100) since the wasm ABI is integer-only.

static const int INPUT_CAPACITY = 64 * 1024;
static const int NAME_CAPACITY = 64 * 1024;
static const int MAX_CURSORS = 128;

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

struct CursorRecord
{
	StringField name;
	StringField cursorText;
	StringField image;
	StringField texture;
	StringField w3dModel;
	StringField w3dAnim;
	int w3dScaleX100;
	int loop;
	int hotSpotX;
	int hotSpotY;
	int numFrames;
	int fpsX100;
	int numDirections;
	int textColorR;
	int textColorG;
	int textColorB;
	int textColorA;
	int line;
	int fieldCount;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_mouse_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_mouse_names[NAME_CAPACITY];

static CursorRecord g_cursors[MAX_CURSORS];
static int g_cursor_count = 0;
static int g_field_count = 0;
static int g_line_count = 0;
static int g_error_count = 0;
static int g_name_cursor = 0;
static int g_current_cursor = -1;
static int g_in_settings = 0;

// Global Mouse settings (single block).
static int g_has_settings = 0;
static int g_settings_field_count = 0;
static StringField g_tooltip_font_name;
static int g_tooltip_font_size = 0;
static int g_tooltip_font_is_bold = 0;
static int g_tooltip_fill_time = 0;
static int g_tooltip_delay_time = 0;
static int g_tooltip_width = 0;
static int g_drag_tolerance = 0;
static int g_drag_tolerance_3d = 0;
static int g_drag_tolerance_ms = 0;
static int g_ortho_camera = 0;
static int g_ortho_zoom_x100 = 0;
static int g_cursor_mode = 0;

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
		g_generals_mouse_names[g_name_cursor++] = value[index];
	}
	g_generals_mouse_names[g_name_cursor++] = 0;
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

static int parse_real_token_x100(const char *data, int start, int end, int *realX100)
{
	TokenRange token;
	int cursor = start;
	if (!next_token(data, &cursor, end, &token)) {
		return 0;
	}

	return parse_real_x100(data, token.start, token.end, realX100);
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

static int parse_labeled_value(const char *data, int *cursor, int end)
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

// Parses "R:nn G:nn B:nn A:nn"; missing A leaves alpha at 255.
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
			const int value = parse_labeled_value(data, &cursor, end);
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

// Parses "X:nn Y:nn" coordinate pairs (ICoord2D).
static void parse_coord2d(const char *data, int start, int end, int *x, int *y)
{
	for (int cursor = start; cursor < end; ++cursor) {
		const char label = lower_ascii(data[cursor]);
		if ((label == 'x' || label == 'y') && cursor + 1 < end && data[cursor + 1] == ':') {
			++cursor;
			const int value = parse_labeled_value(data, &cursor, end);
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
	g_cursor_count = 0;
	g_field_count = 0;
	g_line_count = 0;
	g_error_count = 0;
	g_name_cursor = 0;
	g_current_cursor = -1;
	g_in_settings = 0;

	g_has_settings = 0;
	g_settings_field_count = 0;
	clear_string(&g_tooltip_font_name);
	g_tooltip_font_size = 0;
	g_tooltip_font_is_bold = 0;
	g_tooltip_fill_time = 0;
	g_tooltip_delay_time = 0;
	g_tooltip_width = 0;
	g_drag_tolerance = 0;
	g_drag_tolerance_3d = 0;
	g_drag_tolerance_ms = 0;
	g_ortho_camera = 0;
	g_ortho_zoom_x100 = 0;
	g_cursor_mode = 0;
}

static void init_cursor(CursorRecord *cursor)
{
	clear_string(&cursor->name);
	clear_string(&cursor->cursorText);
	clear_string(&cursor->image);
	clear_string(&cursor->texture);
	clear_string(&cursor->w3dModel);
	clear_string(&cursor->w3dAnim);
	cursor->w3dScaleX100 = 0;
	cursor->loop = 0;
	cursor->hotSpotX = 0;
	cursor->hotSpotY = 0;
	cursor->numFrames = 0;
	cursor->fpsX100 = 0;
	cursor->numDirections = 0;
	cursor->textColorR = 0;
	cursor->textColorG = 0;
	cursor->textColorB = 0;
	cursor->textColorA = 255;
	cursor->line = -1;
	cursor->fieldCount = 0;
}

static void create_cursor(const char *data, int nameStart, int nameEnd, int line)
{
	if (g_cursor_count >= MAX_CURSORS) {
		++g_error_count;
		return;
	}

	CursorRecord *cursor = &g_cursors[g_cursor_count];
	init_cursor(cursor);
	assign_string(&cursor->name, data, nameStart, nameEnd);
	cursor->line = line;
	g_current_cursor = g_cursor_count++;
	g_in_settings = 0;
}

static void parse_block_line(const char *data, int start, int end, int line)
{
	TokenRange token;
	int cursor = start;
	if (!next_token(data, &cursor, end, &token)) {
		return;
	}

	if (token_equals(data, token, "End")) {
		g_current_cursor = -1;
		g_in_settings = 0;
		return;
	}

	if (token_equals(data, token, "MouseCursor")) {
		create_cursor(data, token.end, end, line);
	} else if (token_equals(data, token, "Mouse")) {
		g_has_settings = 1;
		g_in_settings = 1;
		g_current_cursor = -1;
	}
}

static void parse_settings_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd)
{
	int parsed = 1;
	int scratch = 0;
	int r = 0;
	int g = 0;
	int b = 0;
	int a = 0;
	if (string_equals(data, fieldStart, fieldEnd, "TooltipFontName")) {
		assign_token_string(&g_tooltip_font_name, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "TooltipFontSize")) {
		parse_int_token(data, valueStart, valueEnd, &g_tooltip_font_size);
	} else if (string_equals(data, fieldStart, fieldEnd, "TooltipFontIsBold")) {
		g_tooltip_font_is_bold = parse_bool_token(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "TooltipFillTime")) {
		parse_int_token(data, valueStart, valueEnd, &g_tooltip_fill_time);
	} else if (string_equals(data, fieldStart, fieldEnd, "TooltipDelayTime")) {
		parse_int_token(data, valueStart, valueEnd, &g_tooltip_delay_time);
	} else if (string_equals(data, fieldStart, fieldEnd, "TooltipWidth")) {
		parse_int_token(data, valueStart, valueEnd, &g_tooltip_width);
	} else if (string_equals(data, fieldStart, fieldEnd, "DragTolerance")) {
		parse_int_token(data, valueStart, valueEnd, &g_drag_tolerance);
	} else if (string_equals(data, fieldStart, fieldEnd, "DragTolerance3D")) {
		parse_int_token(data, valueStart, valueEnd, &g_drag_tolerance_3d);
	} else if (string_equals(data, fieldStart, fieldEnd, "DragToleranceMS")) {
		parse_int_token(data, valueStart, valueEnd, &g_drag_tolerance_ms);
	} else if (string_equals(data, fieldStart, fieldEnd, "OrthoCamera")) {
		g_ortho_camera = parse_bool_token(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "OrthoZoom")) {
		parse_real_token_x100(data, valueStart, valueEnd, &g_ortho_zoom_x100);
	} else if (string_equals(data, fieldStart, fieldEnd, "CursorMode")) {
		parse_int_token(data, valueStart, valueEnd, &g_cursor_mode);
	} else if (string_equals(data, fieldStart, fieldEnd, "TooltipAnimateBackground") ||
			   string_equals(data, fieldStart, fieldEnd, "UseTooltipAltTextColor") ||
			   string_equals(data, fieldStart, fieldEnd, "UseTooltipAltBackColor") ||
			   string_equals(data, fieldStart, fieldEnd, "AdjustTooltipAltColor")) {
		scratch = parse_bool_token(data, valueStart, valueEnd);
		(void)scratch;
	} else if (string_equals(data, fieldStart, fieldEnd, "TooltipTextColor") ||
			   string_equals(data, fieldStart, fieldEnd, "TooltipHighlightColor") ||
			   string_equals(data, fieldStart, fieldEnd, "TooltipShadowColor") ||
			   string_equals(data, fieldStart, fieldEnd, "TooltipBackgroundColor") ||
			   string_equals(data, fieldStart, fieldEnd, "TooltipBorderColor")) {
		parse_rgba(data, valueStart, valueEnd, &r, &g, &b, &a);
	} else {
		parsed = 0;
	}

	if (parsed) {
		g_settings_field_count += 1;
		++g_field_count;
	}
}

static void parse_cursor_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd)
{
	CursorRecord *cursor = &g_cursors[g_current_cursor];
	int parsed = 1;
	if (string_equals(data, fieldStart, fieldEnd, "CursorText")) {
		assign_token_string(&cursor->cursorText, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "Image")) {
		assign_token_string(&cursor->image, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "Texture")) {
		assign_token_string(&cursor->texture, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "W3DModel")) {
		assign_token_string(&cursor->w3dModel, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "W3DAnim")) {
		assign_token_string(&cursor->w3dAnim, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "W3DScale")) {
		parse_real_token_x100(data, valueStart, valueEnd, &cursor->w3dScaleX100);
	} else if (string_equals(data, fieldStart, fieldEnd, "Loop")) {
		cursor->loop = parse_bool_token(data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "HotSpot")) {
		parse_coord2d(data, valueStart, valueEnd, &cursor->hotSpotX, &cursor->hotSpotY);
	} else if (string_equals(data, fieldStart, fieldEnd, "Frames")) {
		parse_int_token(data, valueStart, valueEnd, &cursor->numFrames);
	} else if (string_equals(data, fieldStart, fieldEnd, "FPS")) {
		parse_real_token_x100(data, valueStart, valueEnd, &cursor->fpsX100);
	} else if (string_equals(data, fieldStart, fieldEnd, "Directions")) {
		parse_int_token(data, valueStart, valueEnd, &cursor->numDirections);
	} else if (string_equals(data, fieldStart, fieldEnd, "CursorTextColor")) {
		parse_rgba(data, valueStart, valueEnd, &cursor->textColorR, &cursor->textColorG, &cursor->textColorB, &cursor->textColorA);
	} else if (string_equals(data, fieldStart, fieldEnd, "CursorTextDropColor")) {
		int r = 0;
		int g = 0;
		int b = 0;
		int a = 0;
		parse_rgba(data, valueStart, valueEnd, &r, &g, &b, &a);
	} else {
		parsed = 0;
	}

	if (parsed) {
		cursor->fieldCount += 1;
		++g_field_count;
	}
}

static void parse_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd)
{
	trim_range(data, &fieldStart, &fieldEnd);
	trim_range(data, &valueStart, &valueEnd);

	if (g_in_settings) {
		parse_settings_assignment(data, fieldStart, fieldEnd, valueStart, valueEnd);
	} else if (g_current_cursor >= 0) {
		parse_cursor_assignment(data, fieldStart, fieldEnd, valueStart, valueEnd);
	}
}

static int string_field_ptr(StringField field)
{
	return field.offset >= 0 ? (int)(g_generals_mouse_names + field.offset) : 0;
}

__attribute__((used, visibility("default"))) int generals_mouse_input_ptr()
{
	return (int)g_generals_mouse_input;
}

__attribute__((used, visibility("default"))) int generals_mouse_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_mouse_parse(int inputSize)
{
	reset_state();

	if (inputSize < 0 || inputSize > INPUT_CAPACITY) {
		g_error_count = 1;
		return -1;
	}

	const char *data = (const char *)g_generals_mouse_input;
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

	return g_cursor_count;
}

__attribute__((used, visibility("default"))) int generals_mouse_count()
{
	return g_cursor_count;
}

__attribute__((used, visibility("default"))) int generals_mouse_field_count()
{
	return g_field_count;
}

__attribute__((used, visibility("default"))) int generals_mouse_line_count()
{
	return g_line_count;
}

__attribute__((used, visibility("default"))) int generals_mouse_error_count()
{
	return g_error_count;
}

__attribute__((used, visibility("default"))) int generals_mouse_has_settings()
{
	return g_has_settings;
}

__attribute__((used, visibility("default"))) int generals_mouse_settings_field_count()
{
	return g_settings_field_count;
}

__attribute__((used, visibility("default"))) int generals_mouse_tooltip_font_name_ptr()
{
	return string_field_ptr(g_tooltip_font_name);
}

__attribute__((used, visibility("default"))) int generals_mouse_tooltip_font_name_size()
{
	return g_tooltip_font_name.size;
}

__attribute__((used, visibility("default"))) int generals_mouse_tooltip_font_size()
{
	return g_tooltip_font_size;
}

__attribute__((used, visibility("default"))) int generals_mouse_tooltip_font_is_bold()
{
	return g_tooltip_font_is_bold;
}

__attribute__((used, visibility("default"))) int generals_mouse_tooltip_fill_time()
{
	return g_tooltip_fill_time;
}

__attribute__((used, visibility("default"))) int generals_mouse_tooltip_delay_time()
{
	return g_tooltip_delay_time;
}

__attribute__((used, visibility("default"))) int generals_mouse_tooltip_width()
{
	return g_tooltip_width;
}

__attribute__((used, visibility("default"))) int generals_mouse_drag_tolerance()
{
	return g_drag_tolerance;
}

__attribute__((used, visibility("default"))) int generals_mouse_drag_tolerance_3d()
{
	return g_drag_tolerance_3d;
}

__attribute__((used, visibility("default"))) int generals_mouse_drag_tolerance_ms()
{
	return g_drag_tolerance_ms;
}

__attribute__((used, visibility("default"))) int generals_mouse_ortho_camera()
{
	return g_ortho_camera;
}

__attribute__((used, visibility("default"))) int generals_mouse_ortho_zoom_x100()
{
	return g_ortho_zoom_x100;
}

__attribute__((used, visibility("default"))) int generals_mouse_cursor_mode()
{
	return g_cursor_mode;
}

#define MOUSE_GUARD(expr, fallback) (index >= 0 && index < g_cursor_count ? (expr) : (fallback))

__attribute__((used, visibility("default"))) int generals_mouse_cursor_name_ptr(int index)
{
	return MOUSE_GUARD(string_field_ptr(g_cursors[index].name), 0);
}

__attribute__((used, visibility("default"))) int generals_mouse_cursor_name_size(int index)
{
	return MOUSE_GUARD(g_cursors[index].name.size, -1);
}

__attribute__((used, visibility("default"))) int generals_mouse_cursor_text_ptr(int index)
{
	return MOUSE_GUARD(string_field_ptr(g_cursors[index].cursorText), 0);
}

__attribute__((used, visibility("default"))) int generals_mouse_cursor_text_size(int index)
{
	return MOUSE_GUARD(g_cursors[index].cursorText.size, -1);
}

__attribute__((used, visibility("default"))) int generals_mouse_cursor_image_ptr(int index)
{
	return MOUSE_GUARD(string_field_ptr(g_cursors[index].image), 0);
}

__attribute__((used, visibility("default"))) int generals_mouse_cursor_image_size(int index)
{
	return MOUSE_GUARD(g_cursors[index].image.size, -1);
}

__attribute__((used, visibility("default"))) int generals_mouse_cursor_texture_ptr(int index)
{
	return MOUSE_GUARD(string_field_ptr(g_cursors[index].texture), 0);
}

__attribute__((used, visibility("default"))) int generals_mouse_cursor_texture_size(int index)
{
	return MOUSE_GUARD(g_cursors[index].texture.size, -1);
}

__attribute__((used, visibility("default"))) int generals_mouse_cursor_w3d_model_ptr(int index)
{
	return MOUSE_GUARD(string_field_ptr(g_cursors[index].w3dModel), 0);
}

__attribute__((used, visibility("default"))) int generals_mouse_cursor_w3d_model_size(int index)
{
	return MOUSE_GUARD(g_cursors[index].w3dModel.size, -1);
}

__attribute__((used, visibility("default"))) int generals_mouse_cursor_w3d_anim_ptr(int index)
{
	return MOUSE_GUARD(string_field_ptr(g_cursors[index].w3dAnim), 0);
}

__attribute__((used, visibility("default"))) int generals_mouse_cursor_w3d_anim_size(int index)
{
	return MOUSE_GUARD(g_cursors[index].w3dAnim.size, -1);
}

__attribute__((used, visibility("default"))) int generals_mouse_cursor_w3d_scale_x100(int index)
{
	return MOUSE_GUARD(g_cursors[index].w3dScaleX100, 0);
}

__attribute__((used, visibility("default"))) int generals_mouse_cursor_loop(int index)
{
	return MOUSE_GUARD(g_cursors[index].loop, -1);
}

__attribute__((used, visibility("default"))) int generals_mouse_cursor_hotspot_x(int index)
{
	return MOUSE_GUARD(g_cursors[index].hotSpotX, 0);
}

__attribute__((used, visibility("default"))) int generals_mouse_cursor_hotspot_y(int index)
{
	return MOUSE_GUARD(g_cursors[index].hotSpotY, 0);
}

__attribute__((used, visibility("default"))) int generals_mouse_cursor_frames(int index)
{
	return MOUSE_GUARD(g_cursors[index].numFrames, 0);
}

__attribute__((used, visibility("default"))) int generals_mouse_cursor_fps_x100(int index)
{
	return MOUSE_GUARD(g_cursors[index].fpsX100, 0);
}

__attribute__((used, visibility("default"))) int generals_mouse_cursor_directions(int index)
{
	return MOUSE_GUARD(g_cursors[index].numDirections, 0);
}

__attribute__((used, visibility("default"))) int generals_mouse_cursor_text_color_r(int index)
{
	return MOUSE_GUARD(g_cursors[index].textColorR, -1);
}

__attribute__((used, visibility("default"))) int generals_mouse_cursor_text_color_g(int index)
{
	return MOUSE_GUARD(g_cursors[index].textColorG, -1);
}

__attribute__((used, visibility("default"))) int generals_mouse_cursor_text_color_b(int index)
{
	return MOUSE_GUARD(g_cursors[index].textColorB, -1);
}

__attribute__((used, visibility("default"))) int generals_mouse_cursor_text_color_a(int index)
{
	return MOUSE_GUARD(g_cursors[index].textColorA, -1);
}

__attribute__((used, visibility("default"))) int generals_mouse_cursor_line(int index)
{
	return MOUSE_GUARD(g_cursors[index].line, -1);
}

__attribute__((used, visibility("default"))) int generals_mouse_cursor_field_count_at(int index)
{
	return MOUSE_GUARD(g_cursors[index].fieldCount, -1);
}

}
