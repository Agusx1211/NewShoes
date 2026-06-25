#pragma once

#ifndef __cdecl
#define __cdecl
#endif

#ifndef _P_NOWAIT
#define _P_NOWAIT 1
#endif

using _beginthread_proc = void (__cdecl *)(void *);

static inline unsigned long _beginthread(_beginthread_proc, unsigned, void *)
{
	__builtin_trap();
	return 0;
}

static inline int _spawnl(int, const char *, const char *, ...)
{
	return -1;
}
