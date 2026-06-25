#pragma once

#ifndef __cdecl
#define __cdecl
#endif

using _beginthread_proc = void (__cdecl *)(void *);

static inline unsigned long _beginthread(_beginthread_proc, unsigned, void *)
{
	__builtin_trap();
	return 0;
}
