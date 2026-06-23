extern "C" {

static const int INPUT_CAPACITY = 128 * 1024;
static const int NAME_CAPACITY = 64 * 1024;
static const int MAX_VIDEOS = 128;

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

struct VideoRecord
{
	StringField name;
	StringField filename;
	StringField comment;
	int line;
	int fieldCount;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_video_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_video_names[NAME_CAPACITY];

static VideoRecord g_videos[MAX_VIDEOS];
static int g_video_count = 0;
static int g_field_count = 0;
static int g_line_count = 0;
static int g_error_count = 0;
static int g_name_cursor = 0;
static int g_current_video = -1;

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
		g_generals_video_names[g_name_cursor++] = value[index];
	}
	g_generals_video_names[g_name_cursor++] = 0;
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

static void reset_state()
{
	g_video_count = 0;
	g_field_count = 0;
	g_line_count = 0;
	g_error_count = 0;
	g_name_cursor = 0;
	g_current_video = -1;
}

static void init_video(VideoRecord *video)
{
	clear_string(&video->name);
	clear_string(&video->filename);
	clear_string(&video->comment);
	video->line = -1;
	video->fieldCount = 0;
}

static void create_video(const char *data, int nameStart, int nameEnd, int line)
{
	if (g_video_count >= MAX_VIDEOS) {
		++g_error_count;
		return;
	}

	VideoRecord *video = &g_videos[g_video_count];
	init_video(video);
	assign_string(&video->name, data, nameStart, nameEnd);
	video->line = line;
	g_current_video = g_video_count++;
}

static void parse_block_line(const char *data, int start, int end, int line)
{
	TokenRange token;
	int cursor = start;
	if (!next_token(data, &cursor, end, &token)) {
		return;
	}

	if (token_equals(data, token, "End")) {
		g_current_video = -1;
		return;
	}

	if (token_equals(data, token, "Video")) {
		create_video(data, token.end, end, line);
	}
}

static void parse_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd)
{
	if (g_current_video < 0) {
		return;
	}

	trim_range(data, &fieldStart, &fieldEnd);
	trim_range(data, &valueStart, &valueEnd);
	VideoRecord *video = &g_videos[g_current_video];
	int parsed = 1;
	if (string_equals(data, fieldStart, fieldEnd, "Filename")) {
		assign_token_string(&video->filename, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "Comment")) {
		assign_string(&video->comment, data, valueStart, valueEnd);
	} else {
		parsed = 0;
	}

	if (parsed) {
		video->fieldCount += 1;
		++g_field_count;
	}
}

static int string_field_ptr(StringField field)
{
	return field.offset >= 0 ? (int)(g_generals_video_names + field.offset) : 0;
}

__attribute__((used, visibility("default"))) int generals_video_input_ptr()
{
	return (int)g_generals_video_input;
}

__attribute__((used, visibility("default"))) int generals_video_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_video_parse(int inputSize)
{
	reset_state();

	if (inputSize < 0 || inputSize > INPUT_CAPACITY) {
		g_error_count = 1;
		return -1;
	}

	const char *data = (const char *)g_generals_video_input;
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

	return g_video_count;
}

__attribute__((used, visibility("default"))) int generals_video_count()
{
	return g_video_count;
}

__attribute__((used, visibility("default"))) int generals_video_field_count()
{
	return g_field_count;
}

__attribute__((used, visibility("default"))) int generals_video_line_count()
{
	return g_line_count;
}

__attribute__((used, visibility("default"))) int generals_video_error_count()
{
	return g_error_count;
}

__attribute__((used, visibility("default"))) int generals_video_name_ptr(int index)
{
	return index >= 0 && index < g_video_count ? string_field_ptr(g_videos[index].name) : 0;
}

__attribute__((used, visibility("default"))) int generals_video_name_size(int index)
{
	return index >= 0 && index < g_video_count ? g_videos[index].name.size : -1;
}

__attribute__((used, visibility("default"))) int generals_video_filename_ptr(int index)
{
	return index >= 0 && index < g_video_count ? string_field_ptr(g_videos[index].filename) : 0;
}

__attribute__((used, visibility("default"))) int generals_video_filename_size(int index)
{
	return index >= 0 && index < g_video_count ? g_videos[index].filename.size : -1;
}

__attribute__((used, visibility("default"))) int generals_video_comment_ptr(int index)
{
	return index >= 0 && index < g_video_count ? string_field_ptr(g_videos[index].comment) : 0;
}

__attribute__((used, visibility("default"))) int generals_video_comment_size(int index)
{
	return index >= 0 && index < g_video_count ? g_videos[index].comment.size : -1;
}

__attribute__((used, visibility("default"))) int generals_video_line(int index)
{
	return index >= 0 && index < g_video_count ? g_videos[index].line : -1;
}

__attribute__((used, visibility("default"))) int generals_video_field_count_at(int index)
{
	return index >= 0 && index < g_video_count ? g_videos[index].fieldCount : -1;
}

}
