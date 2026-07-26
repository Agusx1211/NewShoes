#include <cstdio>
#include <string>

#include "windows.h"

namespace {

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::fprintf(stderr, "%s\n", message);
		return false;
	}
	return true;
}

} // namespace

int main()
{
	bool ok = true;
	ok &= expect(
		WasmWindowsWildcardMatch("[RANK] Arctic Arena ZH v1.map", "[RANK] Arctic Arena ZH v1.map"),
		"FindFirstFile patterns must treat square brackets literally");
	ok &= expect(
		!WasmWindowsWildcardMatch("[RANK] Arctic Arena ZH v1.map", "R Arctic Arena ZH v1.map"),
		"square brackets must not become POSIX character classes");
	ok &= expect(
		WasmWindowsWildcardMatch("*.map", "Tournament Desert.MAP"),
		"FindFirstFile wildcard matching must be case-insensitive");
	ok &= expect(
		WasmWindowsWildcardMatch("Map ??.map", "map 01.MAP")
			&& !WasmWindowsWildcardMatch("Map ??.map", "map 1.MAP"),
		"question marks must match exactly one filename character");

	std::string directory;
	std::string pattern;
	WasmSplitFindPattern("/maps/*.*", directory, pattern);
	ok &= expect(directory == "/maps" && pattern == "*",
		"Windows *.* enumeration must include extensionless files");

	if (ok) {
		std::puts("win32 FindFirstFile wildcard smoke passed");
	}
	return ok ? 0 : 1;
}
