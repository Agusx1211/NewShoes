extern "C" {

static const int INPUT_CAPACITY = 1024 * 1024;
static const int NAME_CAPACITY = 512 * 1024;
static const int MAX_IMAGES = 2048;
static const int IMAGE_STATUS_ROTATED_90_CLOCKWISE = 1;
static const int IMAGE_STATUS_RAW_TEXTURE = 2;

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

struct MappedImageRecord
{
	StringField name;
	StringField texture;
	StringField statusRaw;
	int line;
	int fieldCount;
	int textureWidth;
	int textureHeight;
	int left;
	int top;
	int right;
	int bottom;
	int imageWidth;
	int imageHeight;
	int statusMask;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_mappedimage_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_mappedimage_names[NAME_CAPACITY];

static MappedImageRecord g_generals_mappedimage_images[MAX_IMAGES];
static int g_generals_mappedimage_count = 0;
static int g_generals_mappedimage_field_count = 0;
static int g_generals_mappedimage_texture_assignment_count = 0;
static int g_generals_mappedimage_rotated_count = 0;
static int g_generals_mappedimage_raw_texture_count = 0;
static int g_generals_mappedimage_none_status_count = 0;
static int g_generals_mappedimage_line_count = 0;
static int g_generals_mappedimage_error_count = 0;
static int g_generals_mappedimage_name_cursor = 0;
static int g_current_image = -1;

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
	if (valueSize < 0 || g_generals_mappedimage_name_cursor + valueSize + 1 > NAME_CAPACITY) {
		return -1;
	}

	const int offset = g_generals_mappedimage_name_cursor;
	for (int index = 0; index < valueSize; ++index) {
		g_generals_mappedimage_names[g_generals_mappedimage_name_cursor++] = value[index];
	}
	g_generals_mappedimage_names[g_generals_mappedimage_name_cursor++] = 0;
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
		++g_generals_mappedimage_error_count;
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

static int parse_labeled_int(const char *data, TokenRange token, const char *label, int *value)
{
	const int labelSize = string_length(label);
	if (token.end - token.start <= labelSize || data[token.start + labelSize] != ':') {
		return 0;
	}
	if (!ascii_equal_ignore_case(data + token.start, labelSize, label)) {
		return 0;
	}

	return parse_int(data, token.start + labelSize + 1, token.end, value);
}

static void update_image_size(MappedImageRecord *image)
{
	const int width = image->right - image->left;
	const int height = image->bottom - image->top;
	if (image->statusMask & IMAGE_STATUS_ROTATED_90_CLOCKWISE) {
		image->imageWidth = height;
		image->imageHeight = width;
	} else {
		image->imageWidth = width;
		image->imageHeight = height;
	}
}

static void parse_coords(const char *data, int start, int end, MappedImageRecord *image)
{
	TokenRange token;
	int cursor = start;
	while (next_token(data, &cursor, end, &token)) {
		if (parse_labeled_int(data, token, "Left", &image->left)) {
			continue;
		}
		if (parse_labeled_int(data, token, "Top", &image->top)) {
			continue;
		}
		if (parse_labeled_int(data, token, "Right", &image->right)) {
			continue;
		}
		parse_labeled_int(data, token, "Bottom", &image->bottom);
	}

	update_image_size(image);
}

static void parse_status(const char *data, int start, int end, MappedImageRecord *image)
{
	assign_string(&image->statusRaw, data, start, end);
	image->statusMask = 0;

	TokenRange token;
	int cursor = start;
	while (next_token(data, &cursor, end, &token)) {
		if (token_equals(data, token, "ROTATED_90_CLOCKWISE")) {
			image->statusMask |= IMAGE_STATUS_ROTATED_90_CLOCKWISE;
		} else if (token_equals(data, token, "RAW_TEXTURE")) {
			image->statusMask |= IMAGE_STATUS_RAW_TEXTURE;
		}
	}

	update_image_size(image);
}

static void reset_state()
{
	g_generals_mappedimage_count = 0;
	g_generals_mappedimage_field_count = 0;
	g_generals_mappedimage_texture_assignment_count = 0;
	g_generals_mappedimage_rotated_count = 0;
	g_generals_mappedimage_raw_texture_count = 0;
	g_generals_mappedimage_none_status_count = 0;
	g_generals_mappedimage_line_count = 0;
	g_generals_mappedimage_error_count = 0;
	g_generals_mappedimage_name_cursor = 0;
	g_current_image = -1;
}

static void init_image(MappedImageRecord *image)
{
	clear_string(&image->name);
	clear_string(&image->texture);
	clear_string(&image->statusRaw);
	image->line = -1;
	image->fieldCount = 0;
	image->textureWidth = 0;
	image->textureHeight = 0;
	image->left = 0;
	image->top = 0;
	image->right = 0;
	image->bottom = 0;
	image->imageWidth = 0;
	image->imageHeight = 0;
	image->statusMask = 0;
}

static void create_image(const char *data, int nameStart, int nameEnd, int line)
{
	if (g_generals_mappedimage_count >= MAX_IMAGES) {
		++g_generals_mappedimage_error_count;
		return;
	}

	MappedImageRecord *image = &g_generals_mappedimage_images[g_generals_mappedimage_count];
	init_image(image);
	assign_string(&image->name, data, nameStart, nameEnd);
	image->line = line;
	g_current_image = g_generals_mappedimage_count++;
}

static void parse_block_line(const char *data, int start, int end, int line)
{
	TokenRange token;
	int cursor = start;
	if (!next_token(data, &cursor, end, &token)) {
		return;
	}

	if (token_equals(data, token, "End")) {
		g_current_image = -1;
		return;
	}

	if (token_equals(data, token, "MappedImage")) {
		create_image(data, token.end, end, line);
	}
}

static void parse_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd)
{
	if (g_current_image < 0) {
		return;
	}

	trim_range(data, &fieldStart, &fieldEnd);
	trim_range(data, &valueStart, &valueEnd);
	MappedImageRecord *image = &g_generals_mappedimage_images[g_current_image];
	int parsed = 1;
	if (string_equals(data, fieldStart, fieldEnd, "Texture")) {
		assign_token_string(&image->texture, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "TextureWidth")) {
		parse_int(data, valueStart, valueEnd, &image->textureWidth);
	} else if (string_equals(data, fieldStart, fieldEnd, "TextureHeight")) {
		parse_int(data, valueStart, valueEnd, &image->textureHeight);
	} else if (string_equals(data, fieldStart, fieldEnd, "Coords")) {
		parse_coords(data, valueStart, valueEnd, image);
	} else if (string_equals(data, fieldStart, fieldEnd, "Status")) {
		parse_status(data, valueStart, valueEnd, image);
	} else {
		parsed = 0;
	}

	if (parsed) {
		image->fieldCount += 1;
		++g_generals_mappedimage_field_count;
	}
}

static bool field_equals(StringField field, const char *value)
{
	if (field.offset < 0) {
		return false;
	}

	return ascii_equal_ignore_case(g_generals_mappedimage_names + field.offset, field.size, value);
}

static void finalize_counts()
{
	for (int index = 0; index < g_generals_mappedimage_count; ++index) {
		MappedImageRecord *image = &g_generals_mappedimage_images[index];
		if (image->texture.offset >= 0) {
			++g_generals_mappedimage_texture_assignment_count;
		}
		if (image->statusMask & IMAGE_STATUS_ROTATED_90_CLOCKWISE) {
			++g_generals_mappedimage_rotated_count;
		}
		if (image->statusMask & IMAGE_STATUS_RAW_TEXTURE) {
			++g_generals_mappedimage_raw_texture_count;
		}
		if (field_equals(image->statusRaw, "NONE")) {
			++g_generals_mappedimage_none_status_count;
		}
	}
}

static int string_field_ptr(StringField field)
{
	return field.offset >= 0 ? (int)(g_generals_mappedimage_names + field.offset) : 0;
}

__attribute__((used, visibility("default"))) int generals_mappedimage_input_ptr()
{
	return (int)g_generals_mappedimage_input;
}

__attribute__((used, visibility("default"))) int generals_mappedimage_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_mappedimage_parse(int inputSize)
{
	reset_state();

	if (inputSize < 0 || inputSize > INPUT_CAPACITY) {
		g_generals_mappedimage_error_count = 1;
		return -1;
	}

	const char *data = (const char *)g_generals_mappedimage_input;
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

		++g_generals_mappedimage_line_count;
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

	finalize_counts();
	return g_generals_mappedimage_count;
}

__attribute__((used, visibility("default"))) int generals_mappedimage_image_count()
{
	return g_generals_mappedimage_count;
}

__attribute__((used, visibility("default"))) int generals_mappedimage_field_count()
{
	return g_generals_mappedimage_field_count;
}

__attribute__((used, visibility("default"))) int generals_mappedimage_texture_assignment_count()
{
	return g_generals_mappedimage_texture_assignment_count;
}

__attribute__((used, visibility("default"))) int generals_mappedimage_rotated_count()
{
	return g_generals_mappedimage_rotated_count;
}

__attribute__((used, visibility("default"))) int generals_mappedimage_raw_texture_count()
{
	return g_generals_mappedimage_raw_texture_count;
}

__attribute__((used, visibility("default"))) int generals_mappedimage_none_status_count()
{
	return g_generals_mappedimage_none_status_count;
}

__attribute__((used, visibility("default"))) int generals_mappedimage_line_count()
{
	return g_generals_mappedimage_line_count;
}

__attribute__((used, visibility("default"))) int generals_mappedimage_error_count()
{
	return g_generals_mappedimage_error_count;
}

__attribute__((used, visibility("default"))) int generals_mappedimage_name_ptr(int index)
{
	return index >= 0 && index < g_generals_mappedimage_count ? string_field_ptr(g_generals_mappedimage_images[index].name) : 0;
}

__attribute__((used, visibility("default"))) int generals_mappedimage_name_size(int index)
{
	return index >= 0 && index < g_generals_mappedimage_count ? g_generals_mappedimage_images[index].name.size : -1;
}

__attribute__((used, visibility("default"))) int generals_mappedimage_texture_ptr(int index)
{
	return index >= 0 && index < g_generals_mappedimage_count ? string_field_ptr(g_generals_mappedimage_images[index].texture) : 0;
}

__attribute__((used, visibility("default"))) int generals_mappedimage_texture_size(int index)
{
	return index >= 0 && index < g_generals_mappedimage_count ? g_generals_mappedimage_images[index].texture.size : -1;
}

__attribute__((used, visibility("default"))) int generals_mappedimage_status_raw_ptr(int index)
{
	return index >= 0 && index < g_generals_mappedimage_count ? string_field_ptr(g_generals_mappedimage_images[index].statusRaw) : 0;
}

__attribute__((used, visibility("default"))) int generals_mappedimage_status_raw_size(int index)
{
	return index >= 0 && index < g_generals_mappedimage_count ? g_generals_mappedimage_images[index].statusRaw.size : -1;
}

__attribute__((used, visibility("default"))) int generals_mappedimage_line(int index)
{
	return index >= 0 && index < g_generals_mappedimage_count ? g_generals_mappedimage_images[index].line : -1;
}

__attribute__((used, visibility("default"))) int generals_mappedimage_field_count_at(int index)
{
	return index >= 0 && index < g_generals_mappedimage_count ? g_generals_mappedimage_images[index].fieldCount : -1;
}

__attribute__((used, visibility("default"))) int generals_mappedimage_texture_width(int index)
{
	return index >= 0 && index < g_generals_mappedimage_count ? g_generals_mappedimage_images[index].textureWidth : -1;
}

__attribute__((used, visibility("default"))) int generals_mappedimage_texture_height(int index)
{
	return index >= 0 && index < g_generals_mappedimage_count ? g_generals_mappedimage_images[index].textureHeight : -1;
}

__attribute__((used, visibility("default"))) int generals_mappedimage_left(int index)
{
	return index >= 0 && index < g_generals_mappedimage_count ? g_generals_mappedimage_images[index].left : -1;
}

__attribute__((used, visibility("default"))) int generals_mappedimage_top(int index)
{
	return index >= 0 && index < g_generals_mappedimage_count ? g_generals_mappedimage_images[index].top : -1;
}

__attribute__((used, visibility("default"))) int generals_mappedimage_right(int index)
{
	return index >= 0 && index < g_generals_mappedimage_count ? g_generals_mappedimage_images[index].right : -1;
}

__attribute__((used, visibility("default"))) int generals_mappedimage_bottom(int index)
{
	return index >= 0 && index < g_generals_mappedimage_count ? g_generals_mappedimage_images[index].bottom : -1;
}

__attribute__((used, visibility("default"))) int generals_mappedimage_image_width(int index)
{
	return index >= 0 && index < g_generals_mappedimage_count ? g_generals_mappedimage_images[index].imageWidth : -1;
}

__attribute__((used, visibility("default"))) int generals_mappedimage_image_height(int index)
{
	return index >= 0 && index < g_generals_mappedimage_count ? g_generals_mappedimage_images[index].imageHeight : -1;
}

__attribute__((used, visibility("default"))) int generals_mappedimage_status_mask(int index)
{
	return index >= 0 && index < g_generals_mappedimage_count ? g_generals_mappedimage_images[index].statusMask : -1;
}

}
