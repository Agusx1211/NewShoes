// Browser boundary shims for Win32/registry/GameSpy symbols that have no
// equivalent in a WebAssembly browser context.  Each shim no-ops or returns
// safe defaults so the original engine code links without modification.
//
// Symbols resolved here:
//   DumpExceptionInfo  — Win32 structured-exception handler → no-op
//   SetDeviceGammaRamp — Win32 GDI gamma ramp → no-op, return success
//   RegistryClass (×3) — Windows registry access → no-op / return defaults
//   getQR2HostingStatus — GameSpy QR2 hosting status → 0 (not hosting)

#include "windows.h"

// ---------------------------------------------------------------------------
// 1. DumpExceptionInfo
//    Original: void DumpExceptionInfo(unsigned int, EXCEPTION_POINTERS*);
//    Browser:  no-op — structured exceptions don't exist in wasm.
// ---------------------------------------------------------------------------
void DumpExceptionInfo(unsigned int /*u*/, EXCEPTION_POINTERS* /*e_info*/)
{
	// Browser has no structured exception mechanism; silently discard.
}

// ---------------------------------------------------------------------------
// 2. SetDeviceGammaRamp
//    Original: BOOL SetDeviceGammaRamp(HDC dc, LPVOID ramp);
//    Browser:  no-op — gamma ramp has no browser equivalent. Return TRUE.
// ---------------------------------------------------------------------------
BOOL SetDeviceGammaRamp(HDC /*dc*/, LPVOID /*ramp*/)
{
	return TRUE;
}

// ---------------------------------------------------------------------------
// 3. RegistryClass - provide browser-compatible implementations for the
//    three undefined methods that the linker needs.
//    Browser: no Windows registry; return defaults, no-op mutations.
// ---------------------------------------------------------------------------

// Forward declarations to avoid pulling in full WWLib headers
class StringClass;
class WideStringClass;
template<typename T> class DynamicVectorClass;
class INIClass;

// Minimal RegistryClass definition matching the original WWLib interface
class RegistryClass {
public:
	static bool Exists(const char* sub_key);

	// Constructor & Destructor
	RegistryClass(const char* sub_key, bool create = true);
	~RegistryClass(void);

	bool Is_Valid(void) const { return IsValid; }

	// Int data type access
	int Get_Int(const char* name, int def_value = 0);
	void Set_Int(const char* name, int value);

	// Bool data type access
	bool Get_Bool(const char* name, bool def_value = false);
	void Set_Bool(const char* name, bool value);

	// Float data type access
	float Get_Float(const char* name, float def_value = 0.0f);
	void Set_Float(const char* name, float value);

	// String data type access
	char* Get_String(const char* name, char* value, int value_size,
	                const char* default_string = nullptr);
	void Get_String(const char* name, StringClass& string, const char* default_string = nullptr);
	void Set_String(const char* name, const char* value);

	// Wide string data type access
	void Get_String(const WCHAR* name, WideStringClass& string, const WCHAR* default_string = nullptr);
	void Set_String(const WCHAR* name, const WCHAR* value);

	// Binary data type access
	void Get_Bin(const char* name, void* buffer, int buffer_size);
	int Get_Bin_Size(const char* name);
	void Set_Bin(const char* name, const void* buffer, int buffer_size);

	// Value enumeration support
	void Get_Value_List(DynamicVectorClass<StringClass>& list);

	// Delete support
	void Delete_Value(const char* name);
	void Deleta_All_Values(void);

	// Read only.
	static void Set_Read_Only(bool set) { IsLocked = set; }

	// Bulk registry operations
	static void Delete_Registry_Tree(char* path);
	static void Load_Registry(const char* filename, char* old_path, char* new_path);
	static void Save_Registry(const char* filename, char* path);

private:
	static void Delete_Registry_Values(void* key);
	static void Save_Registry_Tree(char* path, void* ini);
	static void Save_Registry_Values(void* key, char* path, void* ini);

	int Key;
	bool IsValid;
	static bool IsLocked;
};

// Static member initialization
bool RegistryClass::IsLocked = false;

// Constructor
RegistryClass::RegistryClass(const char* /*sub_key*/, bool /*create*/)
	: Key(0), IsValid(false) {}

// Destructor
RegistryClass::~RegistryClass(void) {}

// Static methods
bool RegistryClass::Exists(const char* /*sub_key*/) { return false; }

// Int access
int RegistryClass::Get_Int(const char* /*name*/, int def_value)
{
	return def_value;
}

void RegistryClass::Set_Int(const char* /*name*/, int /*value*/) {}

// Bool access
bool RegistryClass::Get_Bool(const char* /*name*/, bool def_value)
{
	return def_value;
}

void RegistryClass::Set_Bool(const char* /*name*/, bool /*value*/) {}

// Float access
float RegistryClass::Get_Float(const char* /*name*/, float def_value)
{
	return def_value;
}

void RegistryClass::Set_Float(const char* /*name*/, float /*value*/) {}

// String access (narrow)
char* RegistryClass::Get_String(const char* /*name*/, char* value, int /*value_size*/,
                               const char* default_string)
{
	if (value && default_string) ::strcpy(value, default_string);
	return value;
}

void RegistryClass::Get_String(const char* /*name*/, StringClass& /*string*/,
                               const char* /*default_string*/) {}

void RegistryClass::Set_String(const char* /*name*/, const char* /*value*/) {}

// String access (wide)
void RegistryClass::Get_String(const WCHAR* /*name*/, WideStringClass& /*string*/,
                               const WCHAR* /*default_string*/) {}

void RegistryClass::Set_String(const WCHAR* /*name*/, const WCHAR* /*value*/) {}

// Binary access
void RegistryClass::Get_Bin(const char* /*name*/, void* /*buffer*/, int /*buffer_size*/) {}

int RegistryClass::Get_Bin_Size(const char* /*name*/) { return 0; }

void RegistryClass::Set_Bin(const char* /*name*/, const void* /*buffer*/, int /*buffer_size*/) {}

// Value enumeration
void RegistryClass::Get_Value_List(DynamicVectorClass<StringClass>& /*list*/) {}

// Delete
void RegistryClass::Delete_Value(const char* /*name*/) {}

void RegistryClass::Deleta_All_Values(void) {}

// Bulk operations
void RegistryClass::Delete_Registry_Tree(char* /*path*/) {}

void RegistryClass::Load_Registry(const char* /*filename*/, char* /*old_path*/, char* /*new_path*/) {}

void RegistryClass::Save_Registry(const char* /*filename*/, char* /*path*/) {}

// Private static methods (no-op implementations)
void RegistryClass::Delete_Registry_Values(void* /*key*/) {}

void RegistryClass::Save_Registry_Tree(char* /*path*/, void* /*ini*/) {}

void RegistryClass::Save_Registry_Values(void* /*key*/, char* /*path*/, void* /*ini*/) {}

// ---------------------------------------------------------------------------
// 4. getQR2HostingStatus
//    Original: extern "C" int getQR2HostingStatus(void);
//    Browser:  return 0 — GameSpy QR2 hosting is out of scope for browser port.
// ---------------------------------------------------------------------------
extern "C" int getQR2HostingStatus(void)
{
	return 0; // Not hosting; networking deferred.
}
