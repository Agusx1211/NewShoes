#pragma once

#include <cstdint>

// DirectInput keyboard scan codes used by the original GameClient key table.
// The browser input layer will translate DOM keyboard events onto these engine
// key values instead of making the platform-independent code include DirectX.

#ifndef DIRECTINPUT_VERSION
#define DIRECTINPUT_VERSION 0x0800
#endif

struct IDirectInput8;
struct IDirectInputDevice8;

using LPDIRECTINPUT8 = IDirectInput8 *;
using LPDIRECTINPUTDEVICE8 = IDirectInputDevice8 *;

struct DIDEVICEOBJECTDATA
{
	unsigned long dwOfs;
	unsigned long dwData;
	unsigned long dwTimeStamp;
	unsigned long dwSequence;
	std::uintptr_t uAppData;
};

#define DIK_ESCAPE 0x01
#define DIK_1 0x02
#define DIK_2 0x03
#define DIK_3 0x04
#define DIK_4 0x05
#define DIK_5 0x06
#define DIK_6 0x07
#define DIK_7 0x08
#define DIK_8 0x09
#define DIK_9 0x0A
#define DIK_0 0x0B
#define DIK_MINUS 0x0C
#define DIK_EQUALS 0x0D
#define DIK_BACK 0x0E
#define DIK_TAB 0x0F
#define DIK_Q 0x10
#define DIK_W 0x11
#define DIK_E 0x12
#define DIK_R 0x13
#define DIK_T 0x14
#define DIK_Y 0x15
#define DIK_U 0x16
#define DIK_I 0x17
#define DIK_O 0x18
#define DIK_P 0x19
#define DIK_LBRACKET 0x1A
#define DIK_RBRACKET 0x1B
#define DIK_RETURN 0x1C
#define DIK_LCONTROL 0x1D
#define DIK_A 0x1E
#define DIK_S 0x1F
#define DIK_D 0x20
#define DIK_F 0x21
#define DIK_G 0x22
#define DIK_H 0x23
#define DIK_J 0x24
#define DIK_K 0x25
#define DIK_L 0x26
#define DIK_SEMICOLON 0x27
#define DIK_APOSTROPHE 0x28
#define DIK_GRAVE 0x29
#define DIK_LSHIFT 0x2A
#define DIK_BACKSLASH 0x2B
#define DIK_Z 0x2C
#define DIK_X 0x2D
#define DIK_C 0x2E
#define DIK_V 0x2F
#define DIK_B 0x30
#define DIK_N 0x31
#define DIK_M 0x32
#define DIK_COMMA 0x33
#define DIK_PERIOD 0x34
#define DIK_SLASH 0x35
#define DIK_RSHIFT 0x36
#define DIK_NUMPADSTAR 0x37
#define DIK_LALT 0x38
#define DIK_SPACE 0x39
#define DIK_CAPSLOCK 0x3A
#define DIK_F1 0x3B
#define DIK_F2 0x3C
#define DIK_F3 0x3D
#define DIK_F4 0x3E
#define DIK_F5 0x3F
#define DIK_F6 0x40
#define DIK_F7 0x41
#define DIK_F8 0x42
#define DIK_F9 0x43
#define DIK_F10 0x44
#define DIK_NUMLOCK 0x45
#define DIK_SCROLL 0x46
#define DIK_NUMPAD7 0x47
#define DIK_NUMPAD8 0x48
#define DIK_NUMPAD9 0x49
#define DIK_NUMPADMINUS 0x4A
#define DIK_NUMPAD4 0x4B
#define DIK_NUMPAD5 0x4C
#define DIK_NUMPAD6 0x4D
#define DIK_NUMPADPLUS 0x4E
#define DIK_NUMPAD1 0x4F
#define DIK_NUMPAD2 0x50
#define DIK_NUMPAD3 0x51
#define DIK_NUMPAD0 0x52
#define DIK_NUMPADPERIOD 0x53
#define DIK_OEM_102 0x56
#define DIK_F11 0x57
#define DIK_F12 0x58

#define DIK_KANA 0x70
#define DIK_CONVERT 0x79
#define DIK_NOCONVERT 0x7B
#define DIK_YEN 0x7D
#define DIK_CIRCUMFLEX 0x90
#define DIK_KANJI 0x94

#define DIK_NUMPADENTER 0x9C
#define DIK_RCONTROL 0x9D
#define DIK_NUMPADSLASH 0xB5
#define DIK_SYSRQ 0xB7
#define DIK_RALT 0xB8
#define DIK_HOME 0xC7
#define DIK_UPARROW 0xC8
#define DIK_PGUP 0xC9
#define DIK_LEFTARROW 0xCB
#define DIK_RIGHTARROW 0xCD
#define DIK_END 0xCF
#define DIK_DOWNARROW 0xD0
#define DIK_PGDN 0xD1
#define DIK_INSERT 0xD2
#define DIK_DELETE 0xD3

// ---------------------------------------------------------------------------
// DirectInput COM surface for Win32DIKeyboard.cpp (true platform boundary).
// The browser has no DirectInput; DirectInput8Create fails with DIERR_GENERIC
// so DirectInputKeyboard::openKeyboard() takes its original device-missing
// path (closeKeyboard + null device guards). Values are the public
// DirectInput ABI constants.
// ---------------------------------------------------------------------------

#include "windows.h"

#define DI_OK S_OK

#define DIERR_INSUFFICIENTPRIVS ((HRESULT)0x80040200L)
#define DIERR_DEVICEFULL ((HRESULT)0x80040201L)
#define DIERR_MOREDATA ((HRESULT)0x80040202L)
#define DIERR_NOTDOWNLOADED ((HRESULT)0x80040203L)
#define DIERR_HASEFFECTS ((HRESULT)0x80040204L)
#define DIERR_NOTEXCLUSIVEACQUIRED ((HRESULT)0x80040205L)
#define DIERR_INCOMPLETEEFFECT ((HRESULT)0x80040206L)
#define DIERR_NOTBUFFERED ((HRESULT)0x80040207L)
#define DIERR_EFFECTPLAYING ((HRESULT)0x80040208L)
#define DIERR_UNPLUGGED ((HRESULT)0x80040209L)
#define DIERR_REPORTFULL ((HRESULT)0x8004020AL)
#define DIERR_MAPFILEFAIL ((HRESULT)0x8004020BL)

#define DIERR_DEVICENOTREG ((HRESULT)0x80040154L)
#define DIERR_NOAGGREGATION ((HRESULT)0x80040110L)
#define DIERR_OBJECTNOTFOUND ((HRESULT)0x80070002L)
#define DIERR_NOTFOUND ((HRESULT)0x80070002L)
#define DIERR_INVALIDPARAM ((HRESULT)0x80070057L)
#define DIERR_NOINTERFACE ((HRESULT)0x80004002L)
#define DIERR_GENERIC ((HRESULT)0x80004005L)
#define DIERR_OUTOFMEMORY ((HRESULT)0x8007000EL)
#define DIERR_UNSUPPORTED ((HRESULT)0x80004001L)
#define DIERR_NOTINITIALIZED ((HRESULT)0x80070015L)
#define DIERR_READONLY ((HRESULT)0x80070005L)
#define DIERR_HANDLEEXISTS ((HRESULT)0x80070005L)
#define DIERR_OTHERAPPHASPRIO ((HRESULT)0x80070005L)
#define DIERR_ACQUIRED ((HRESULT)0x800700AAL)
#define DIERR_NOTACQUIRED ((HRESULT)0x8007000CL)
#define DIERR_INPUTLOST ((HRESULT)0x8007001EL)
#define DIERR_ALREADYINITIALIZED ((HRESULT)0x800704DFL)
#define DIERR_BADDRIVERVER ((HRESULT)0x80070077L)
#define DIERR_BETADIRECTINPUTVERSION ((HRESULT)0x80070481L)
#define DIERR_OLDDIRECTINPUTVERSION ((HRESULT)0x8007047EL)

#define DISCL_EXCLUSIVE 0x00000001
#define DISCL_NONEXCLUSIVE 0x00000002
#define DISCL_FOREGROUND 0x00000004
#define DISCL_BACKGROUND 0x00000008

#define DIPH_DEVICE 0

struct DIPROPHEADER
{
	DWORD dwSize;
	DWORD dwHeaderSize;
	DWORD dwObj;
	DWORD dwHow;
};

struct DIPROPDWORD
{
	DIPROPHEADER diph;
	DWORD dwData;
};

// DIPROP_* are REFGUID-cast small integers in the real header.
#define DIPROP_BUFFERSIZE (*reinterpret_cast<const GUID *>(&cnc_port_diprop_buffersize))
static const int cnc_port_diprop_buffersize[4] = {1, 0, 0, 0};

struct DIDATAFORMAT;

static const GUID GUID_SysKeyboard = {0x6F1D2B61, 0xD5A0, 0x11CF, {0xBF, 0xC7, 0x44, 0x45, 0x53, 0x54, 0x00, 0x00}};
static const GUID IID_IDirectInput8_Value = {0xBF798031, 0x483A, 0x4DA2, {0xAA, 0x99, 0x5D, 0x64, 0xED, 0x36, 0x97, 0x00}};
#define IID_IDirectInput8 IID_IDirectInput8_Value

static const DIDATAFORMAT *const c_dfDIKeyboard = nullptr;

// Browser DirectInput keyboard device (implemented in
// WebAssembly/src/wasm_dinput_browser.cpp): the original DirectInputKeyboard
// runs unmodified on top of a DOM-fed DIK scan-code queue.
struct IDirectInputDevice8
{
	HRESULT SetDataFormat(const DIDATAFORMAT *const *);
	HRESULT SetCooperativeLevel(HWND, DWORD);
	HRESULT SetProperty(const GUID &, const DIPROPHEADER *);
	HRESULT Acquire();
	HRESULT Unacquire();
	HRESULT GetDeviceData(DWORD, DIDEVICEOBJECTDATA *, DWORD *, DWORD);
	ULONG Release();
};

struct IDirectInput8
{
	HRESULT CreateDevice(const GUID &, IDirectInputDevice8 **device, void *);
	ULONG Release();
};

HRESULT DirectInput8Create(HINSTANCE, DWORD, const GUID &, void **out, void *);

// Queue interface for the JS bridge / port entry to feed keyboard input.
extern "C" int cnc_port_dinput_queue_key(unsigned int dik_code, int key_down, unsigned int timestamp);
extern "C" unsigned int cnc_port_dinput_queued_key_count(void);
