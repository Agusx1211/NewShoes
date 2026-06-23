#include "refdecode.cpp"

extern "C" {

static const int INPUT_CAPACITY = 65536;
static const int OUTPUT_CAPACITY = 65536;

__attribute__((used, visibility("default"))) unsigned char g_generals_refpack_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) unsigned char g_generals_refpack_output[OUTPUT_CAPACITY];

static int g_generals_refpack_last_consumed_size = 0;

__attribute__((used, visibility("default"))) unsigned int generals_refpack_input_ptr()
{
	return (unsigned int)g_generals_refpack_input;
}

__attribute__((used, visibility("default"))) unsigned int generals_refpack_output_ptr()
{
	return (unsigned int)g_generals_refpack_output;
}

__attribute__((used, visibility("default"))) int generals_refpack_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_refpack_output_capacity()
{
	return OUTPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_refpack_last_consumed_size()
{
	return g_generals_refpack_last_consumed_size;
}

__attribute__((used, visibility("default"))) int generals_refpack_is(int inputOffset)
{
	if (inputOffset < 0 || inputOffset >= INPUT_CAPACITY - 5) {
		return 0;
	}

	return REF_is(g_generals_refpack_input + inputOffset) ? 1 : 0;
}

__attribute__((used, visibility("default"))) int generals_refpack_size(int inputOffset)
{
	if (inputOffset < 0 || inputOffset >= INPUT_CAPACITY - 5) {
		return -1;
	}

	return REF_size(g_generals_refpack_input + inputOffset);
}

__attribute__((used, visibility("default"))) int generals_refpack_decode(int inputOffset, int outputOffset)
{
	g_generals_refpack_last_consumed_size = 0;

	if (inputOffset < 0 || inputOffset >= INPUT_CAPACITY - 5) {
		return -1;
	}

	if (outputOffset < 0 || outputOffset >= OUTPUT_CAPACITY) {
		return -2;
	}

	if (!REF_is(g_generals_refpack_input + inputOffset)) {
		return -3;
	}

	const int decodedSize = REF_size(g_generals_refpack_input + inputOffset);
	if (decodedSize < 0 || decodedSize > OUTPUT_CAPACITY - outputOffset) {
		return -4;
	}

	int consumedSize = 0;
	const int result = REF_decode(
		g_generals_refpack_output + outputOffset,
		g_generals_refpack_input + inputOffset,
		&consumedSize
	);

	g_generals_refpack_last_consumed_size = consumedSize;
	return result;
}

}
