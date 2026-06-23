extern "C" {

static const int INPUT_CAPACITY = 2 * 1024 * 1024;
static const int MAX_BLOCKS = 16384;
static const int NAME_CAPACITY = 2 * 1024 * 1024;

struct IniBlock
{
	int typeOffset;
	int typeSize;
	int nameOffset;
	int nameSize;
	int firstLine;
	int propertyCount;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_ini_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_ini_names[NAME_CAPACITY];

static IniBlock g_generals_ini_blocks[MAX_BLOCKS];
static int g_generals_ini_block_count = 0;
static int g_generals_ini_property_count = 0;
static int g_generals_ini_line_count = 0;
static int g_generals_ini_error_count = 0;
static int g_generals_ini_name_cursor = 0;

static bool is_space(char value)
{
	return value == ' ' || value == '\t' || value == '\r' || value == '\n';
}

static bool is_name_separator(char value)
{
	return is_space(value) || value == '=';
}

static bool ascii_equal_ignore_case(const char *left, int leftSize, const char *right)
{
	int index = 0;
	while (index < leftSize && right[index] != 0) {
		char a = left[index];
		char b = right[index];
		if (a >= 'A' && a <= 'Z') {
			a = (char)(a - 'A' + 'a');
		}
		if (b >= 'A' && b <= 'Z') {
			b = (char)(b - 'A' + 'a');
		}
		if (a != b) {
			return false;
		}
		++index;
	}

	return index == leftSize && right[index] == 0;
}

static bool is_end_token(const char *token, int tokenSize)
{
	return ascii_equal_ignore_case(token, tokenSize, "end");
}

static bool is_known_block_type(const char *token, int tokenSize)
{
	static const char *types[] = {
		"AIData", "Animation", "Armor", "AudioEvent", "AudioSettings", "Bridge",
		"Campaign", "CommandButton", "CommandMap", "CommandSet", "ControlBarScheme",
		"ControlBarResizer", "CrateData", "Credits", "WindowTransition", "DamageFX",
		"DialogEvent", "DrawGroupInfo", "EvaEvent", "FXList", "GameData", "InGameUI",
		"Locomotor", "Language", "MapCache", "MapData", "MappedImage", "MiscAudio",
		"Mouse", "MouseCursor", "MultiplayerColor", "OnlineChatColors",
		"MultiplayerSettings", "MusicTrack", "Object", "ObjectCreationList",
		"ObjectReskin", "ParticleSystem", "PlayerTemplate", "Road", "Science",
		"Rank", "SpecialPower", "ShellMenuScheme", "Terrain", "Upgrade", "Video",
		"WaterSet", "WaterTransparency", "Weapon", "WebpageURL", "HeaderTemplate",
		"StaticGameLOD", "DynamicGameLOD", "LODPreset", "BenchProfile", "ReallyLowMHz",
		0
	};

	for (int index = 0; types[index] != 0; ++index) {
		if (ascii_equal_ignore_case(token, tokenSize, types[index])) {
			return true;
		}
	}

	return false;
}

static int store_string(const char *value, int valueSize)
{
	if (valueSize < 0 || g_generals_ini_name_cursor + valueSize + 1 > NAME_CAPACITY) {
		return -1;
	}

	const int offset = g_generals_ini_name_cursor;
	for (int index = 0; index < valueSize; ++index) {
		g_generals_ini_names[g_generals_ini_name_cursor++] = value[index];
	}
	g_generals_ini_names[g_generals_ini_name_cursor++] = 0;
	return offset;
}

static int find_comment_start(const char *line, int start, int end)
{
	bool inQuote = false;
	for (int index = start; index < end; ++index) {
		const char value = line[index];
		if (value == '"') {
			inQuote = !inQuote;
		} else if (value == ';' && !inQuote) {
			return index;
		}
	}

	return end;
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

__attribute__((used, visibility("default"))) unsigned int generals_ini_input_ptr()
{
	return (unsigned int)g_generals_ini_input;
}

__attribute__((used, visibility("default"))) int generals_ini_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_ini_block_count()
{
	return g_generals_ini_block_count;
}

__attribute__((used, visibility("default"))) int generals_ini_property_count()
{
	return g_generals_ini_property_count;
}

__attribute__((used, visibility("default"))) int generals_ini_line_count()
{
	return g_generals_ini_line_count;
}

__attribute__((used, visibility("default"))) int generals_ini_error_count()
{
	return g_generals_ini_error_count;
}

__attribute__((used, visibility("default"))) int generals_ini_block_type_ptr(int index)
{
	if (index < 0 || index >= g_generals_ini_block_count) {
		return 0;
	}

	return (int)(g_generals_ini_names + g_generals_ini_blocks[index].typeOffset);
}

__attribute__((used, visibility("default"))) int generals_ini_block_type_size(int index)
{
	if (index < 0 || index >= g_generals_ini_block_count) {
		return -1;
	}

	return g_generals_ini_blocks[index].typeSize;
}

__attribute__((used, visibility("default"))) int generals_ini_block_name_ptr(int index)
{
	if (index < 0 || index >= g_generals_ini_block_count || g_generals_ini_blocks[index].nameOffset < 0) {
		return 0;
	}

	return (int)(g_generals_ini_names + g_generals_ini_blocks[index].nameOffset);
}

__attribute__((used, visibility("default"))) int generals_ini_block_name_size(int index)
{
	if (index < 0 || index >= g_generals_ini_block_count) {
		return -1;
	}

	return g_generals_ini_blocks[index].nameSize;
}

__attribute__((used, visibility("default"))) int generals_ini_block_property_count(int index)
{
	if (index < 0 || index >= g_generals_ini_block_count) {
		return -1;
	}

	return g_generals_ini_blocks[index].propertyCount;
}

__attribute__((used, visibility("default"))) int generals_ini_block_line(int index)
{
	if (index < 0 || index >= g_generals_ini_block_count) {
		return -1;
	}

	return g_generals_ini_blocks[index].firstLine;
}

__attribute__((used, visibility("default"))) int generals_ini_parse(int inputSize)
{
	g_generals_ini_block_count = 0;
	g_generals_ini_property_count = 0;
	g_generals_ini_line_count = 0;
	g_generals_ini_error_count = 0;
	g_generals_ini_name_cursor = 0;

	if (inputSize < 0 || inputSize > INPUT_CAPACITY) {
		return -1;
	}

	int activeBlock = -1;
	int lineStart = 0;
	while (lineStart < inputSize) {
		int lineEnd = lineStart;
		while (lineEnd < inputSize && g_generals_ini_input[lineEnd] != '\n') {
			++lineEnd;
		}

		++g_generals_ini_line_count;
		int contentStart = lineStart;
		int contentEnd = find_comment_start((const char *)g_generals_ini_input, lineStart, lineEnd);
		trim_range((const char *)g_generals_ini_input, &contentStart, &contentEnd);

		if (contentStart < contentEnd) {
			int equalsIndex = -1;
			bool inQuote = false;
			for (int index = contentStart; index < contentEnd; ++index) {
				const char value = (char)g_generals_ini_input[index];
				if (value == '"') {
					inQuote = !inQuote;
				} else if (value == '=' && !inQuote) {
					equalsIndex = index;
					break;
				}
			}

			if (equalsIndex >= 0) {
				++g_generals_ini_property_count;
				if (activeBlock >= 0) {
					++g_generals_ini_blocks[activeBlock].propertyCount;
				}
			} else {
				int tokenEnd = contentStart;
				while (tokenEnd < contentEnd && !is_name_separator((char)g_generals_ini_input[tokenEnd])) {
					++tokenEnd;
				}

				const int tokenSize = tokenEnd - contentStart;
				if (is_end_token((const char *)g_generals_ini_input + contentStart, tokenSize)) {
					activeBlock = -1;
				} else if (is_known_block_type((const char *)g_generals_ini_input + contentStart, tokenSize)) {
					if (g_generals_ini_block_count >= MAX_BLOCKS) {
						++g_generals_ini_error_count;
					} else {
						int nameStart = tokenEnd;
						int nameEnd = contentEnd;
						trim_range((const char *)g_generals_ini_input, &nameStart, &nameEnd);

						const int typeOffset = store_string((const char *)g_generals_ini_input + contentStart, tokenSize);
						const int nameSize = nameEnd - nameStart;
						const int nameOffset = nameSize > 0
							? store_string((const char *)g_generals_ini_input + nameStart, nameSize)
							: -1;

						if (typeOffset < 0 || (nameSize > 0 && nameOffset < 0)) {
							++g_generals_ini_error_count;
						} else {
							IniBlock *block = &g_generals_ini_blocks[g_generals_ini_block_count];
							block->typeOffset = typeOffset;
							block->typeSize = tokenSize;
							block->nameOffset = nameOffset;
							block->nameSize = nameSize;
							block->firstLine = g_generals_ini_line_count;
							block->propertyCount = 0;
							activeBlock = g_generals_ini_block_count;
							++g_generals_ini_block_count;
						}
					}
				} else {
					++g_generals_ini_error_count;
				}
			}
		}

		lineStart = lineEnd + 1;
	}

	return g_generals_ini_block_count;
}

}
