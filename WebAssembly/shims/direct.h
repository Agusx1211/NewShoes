#pragma once

#include <errno.h>
#include <sys/stat.h>
#include <unistd.h>

#include <algorithm>
#include <string>

static inline int _mkdir(const char *path)
{
	std::string normalized = path != nullptr ? path : "";
	std::replace(normalized.begin(), normalized.end(), '\\', '/');
	return mkdir(normalized.c_str(), 0777);
}

static inline char *_getcwd(char *buffer, int max_length)
{
	return getcwd(buffer, static_cast<size_t>(max_length));
}
