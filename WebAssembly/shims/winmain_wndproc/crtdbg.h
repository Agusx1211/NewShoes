#pragma once

#define _CRTDBG_REPORT_FLAG 0
#define _CRTDBG_LEAK_CHECK_DF 0
#define _CRTDBG_ALLOC_MEM_DF 0
#define _CRTDBG_CHECK_CRT_DF 0

static inline int _CrtSetDbgFlag(int flag)
{
	return flag;
}
