#include "PreRTS.h"

#include "Common/UnicodeString.h"

// Browser-owned Win32 date/time formatting boundary for menu callbacks that
// need the original GameState helper symbols before full GameState.cpp links.
namespace {

constexpr int kDateTimeBufferSize = 256;

} // namespace

UnicodeString getUnicodeDateBuffer(SYSTEMTIME time_val)
{
	UnicodeString display_date_buffer;
	OSVERSIONINFO osvi;
	osvi.dwOSVersionInfoSize = sizeof(OSVERSIONINFO);
	if (GetVersionEx(&osvi) && osvi.dwPlatformId == VER_PLATFORM_WIN32_WINDOWS) {
		char date_buffer[kDateTimeBufferSize];
		GetDateFormat(
			LOCALE_SYSTEM_DEFAULT,
			DATE_SHORTDATE,
			&time_val,
			nullptr,
			date_buffer,
			kDateTimeBufferSize);
		display_date_buffer.translate(date_buffer);
		return display_date_buffer;
	}

	WCHAR date_buffer[kDateTimeBufferSize];
	GetDateFormatW(
		LOCALE_SYSTEM_DEFAULT,
		DATE_SHORTDATE,
		&time_val,
		nullptr,
		date_buffer,
		kDateTimeBufferSize);
	display_date_buffer.set(date_buffer);
	return display_date_buffer;
}

UnicodeString getUnicodeTimeBuffer(SYSTEMTIME time_val)
{
	UnicodeString display_time_buffer;
	OSVERSIONINFO osvi;
	osvi.dwOSVersionInfoSize = sizeof(OSVERSIONINFO);
	if (GetVersionEx(&osvi) && osvi.dwPlatformId == VER_PLATFORM_WIN32_WINDOWS) {
		char time_buffer[kDateTimeBufferSize];
		GetTimeFormat(
			LOCALE_SYSTEM_DEFAULT,
			TIME_NOSECONDS | TIME_FORCE24HOURFORMAT | TIME_NOTIMEMARKER,
			&time_val,
			nullptr,
			time_buffer,
			kDateTimeBufferSize);
		display_time_buffer.translate(time_buffer);
		return display_time_buffer;
	}

	WCHAR time_buffer[kDateTimeBufferSize];
	GetTimeFormatW(
		LOCALE_SYSTEM_DEFAULT,
		TIME_NOSECONDS,
		&time_val,
		nullptr,
		time_buffer,
		kDateTimeBufferSize);
	display_time_buffer.set(time_buffer);
	return display_time_buffer;
}
