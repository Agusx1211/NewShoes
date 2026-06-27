#include "Lib/BaseType.h"
#include "windows.h"

#include "Common/StackDump.h"
#include "Common/SystemInfo.h"

__attribute__((weak)) bool DX8Wrapper_IsWindowed = true;
char g_cnc_port_app_prefix[] = "";
char *gAppPrefix = g_cnc_port_app_prefix;
extern const Bool TheSystemIsUnicode = FALSE;
AsciiString g_LastErrorDump;

void FillStackAddresses(void **addresses, unsigned int count, unsigned int)
{
	for (unsigned int index = 0; index < count; ++index) {
		addresses[index] = nullptr;
	}
}

void StackDumpFromAddresses(void **, unsigned int, void (*callback)(const char *))
{
	if (callback != nullptr) {
		callback("Stack dump unavailable in wasm bootstrap\n");
	}
}
