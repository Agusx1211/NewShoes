#include "Benchmark.h"

int RunBenchmark(int, char **, float *float_result, float *int_result, float *mem_result)
{
	// The original Benchmark project references third-party C sources that are
	// absent from this release. Report deterministic "unavailable" indices.
	if (float_result != nullptr) {
		*float_result = 0.0f;
	}
	if (int_result != nullptr) {
		*int_result = 0.0f;
	}
	if (mem_result != nullptr) {
		*mem_result = 0.0f;
	}
	return 0;
}
