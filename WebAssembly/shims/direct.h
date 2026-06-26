#pragma once

#include <errno.h>
#include <sys/stat.h>
#include <unistd.h>

static inline int _mkdir(const char *path)
{
	return mkdir(path, 0777);
}

static inline char *_getcwd(char *buffer, int max_length)
{
	return getcwd(buffer, static_cast<size_t>(max_length));
}
