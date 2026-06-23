extern "C" {

static const int INPUT_CAPACITY = 32 * 1024 * 1024;
static const int MAX_ENTRIES = 8192;
static const int NAME_CAPACITY = 4 * 1024 * 1024;

struct BigEntry
{
	unsigned int dataOffset;
	unsigned int dataSize;
	int nameOffset;
	int nameSize;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_big_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_big_names[NAME_CAPACITY];

static BigEntry g_generals_big_entries[MAX_ENTRIES];
static int g_generals_big_file_count = 0;
static int g_generals_big_name_cursor = 0;

static unsigned int read_be32(const unsigned char *data)
{
	return ((unsigned int)data[0] << 24) |
		((unsigned int)data[1] << 16) |
		((unsigned int)data[2] << 8) |
		(unsigned int)data[3];
}

static char normalize_path_char(char value)
{
	if (value == '\\') {
		return '/';
	}

	if (value >= 'A' && value <= 'Z') {
		return (char)(value - 'A' + 'a');
	}

	return value;
}

__attribute__((used, visibility("default"))) unsigned int generals_big_input_ptr()
{
	return (unsigned int)g_generals_big_input;
}

__attribute__((used, visibility("default"))) int generals_big_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_big_file_count()
{
	return g_generals_big_file_count;
}

__attribute__((used, visibility("default"))) int generals_big_entry_name_ptr(int index)
{
	if (index < 0 || index >= g_generals_big_file_count) {
		return 0;
	}

	return (int)(g_generals_big_names + g_generals_big_entries[index].nameOffset);
}

__attribute__((used, visibility("default"))) int generals_big_entry_name_size(int index)
{
	if (index < 0 || index >= g_generals_big_file_count) {
		return -1;
	}

	return g_generals_big_entries[index].nameSize;
}

__attribute__((used, visibility("default"))) int generals_big_entry_data_offset(int index)
{
	if (index < 0 || index >= g_generals_big_file_count) {
		return -1;
	}

	return (int)g_generals_big_entries[index].dataOffset;
}

__attribute__((used, visibility("default"))) int generals_big_entry_data_ptr(int index)
{
	if (index < 0 || index >= g_generals_big_file_count) {
		return 0;
	}

	return (int)(g_generals_big_input + g_generals_big_entries[index].dataOffset);
}

__attribute__((used, visibility("default"))) int generals_big_entry_data_size(int index)
{
	if (index < 0 || index >= g_generals_big_file_count) {
		return -1;
	}

	return (int)g_generals_big_entries[index].dataSize;
}

__attribute__((used, visibility("default"))) int generals_big_is(int inputSize)
{
	if (inputSize < 16 || inputSize > INPUT_CAPACITY) {
		return 0;
	}

	return g_generals_big_input[0] == 'B' &&
		g_generals_big_input[1] == 'I' &&
		g_generals_big_input[2] == 'G' &&
		g_generals_big_input[3] == 'F';
}

__attribute__((used, visibility("default"))) int generals_big_parse(int inputSize)
{
	g_generals_big_file_count = 0;
	g_generals_big_name_cursor = 0;

	if (inputSize < 16 || inputSize > INPUT_CAPACITY) {
		return -1;
	}

	if (!generals_big_is(inputSize)) {
		return -2;
	}

	const unsigned int declaredFileCount = read_be32(g_generals_big_input + 8);
	if (declaredFileCount > MAX_ENTRIES) {
		return -3;
	}

	int cursor = 0x10;
	for (unsigned int index = 0; index < declaredFileCount; ++index) {
		if (cursor + 8 > inputSize) {
			return -4;
		}

		const unsigned int dataOffset = read_be32(g_generals_big_input + cursor);
		const unsigned int dataSize = read_be32(g_generals_big_input + cursor + 4);
		cursor += 8;

		const int nameStart = cursor;
		while (cursor < inputSize && g_generals_big_input[cursor] != 0) {
			++cursor;
		}

		if (cursor >= inputSize) {
			return -4;
		}

		const int nameSize = cursor - nameStart;
		if (g_generals_big_name_cursor + nameSize + 1 > NAME_CAPACITY) {
			return -5;
		}

		const unsigned int dataEnd = dataOffset + dataSize;
		if (dataOffset > (unsigned int)inputSize || dataEnd > (unsigned int)inputSize || dataEnd < dataOffset) {
			return -6;
		}

		const int storedNameOffset = g_generals_big_name_cursor;
		for (int nameIndex = 0; nameIndex < nameSize; ++nameIndex) {
			g_generals_big_names[g_generals_big_name_cursor++] =
				normalize_path_char((char)g_generals_big_input[nameStart + nameIndex]);
		}
		g_generals_big_names[g_generals_big_name_cursor++] = 0;

		g_generals_big_entries[index].dataOffset = dataOffset;
		g_generals_big_entries[index].dataSize = dataSize;
		g_generals_big_entries[index].nameOffset = storedNameOffset;
		g_generals_big_entries[index].nameSize = nameSize;
		++g_generals_big_file_count;
		++cursor;
	}

	return g_generals_big_file_count;
}

}
