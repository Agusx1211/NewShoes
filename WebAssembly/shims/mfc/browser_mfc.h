#pragma once

#include "windows.h"

#include <algorithm>
#include <cassert>
#include <cctype>
#include <cstdint>
#include <cstdarg>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cerrno>
#include <memory>
#include <limits>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

#ifndef afx_msg
#define afx_msg
#endif
#ifndef TEXT
#define TEXT(value) value
#endif

#ifndef AFXAPI
#define AFXAPI
#endif

#ifndef AFX_EXT_CLASS
#define AFX_EXT_CLASS
#endif

#ifndef ASSERT
#define ASSERT(condition) assert(condition)
#endif
#ifndef ASSERT_VALID
#define ASSERT_VALID(object) ASSERT((object) != nullptr)
#endif
#ifndef VERIFY
#ifdef NDEBUG
#define VERIFY(condition) ((void)(condition))
#else
#define VERIFY(condition) ASSERT(condition)
#endif
#endif
#ifndef TRACE0
#define TRACE0(message) std::fputs((message), stderr)
#endif

#ifndef MAKEINTRESOURCE
#define MAKEINTRESOURCE(value) reinterpret_cast<LPCTSTR>(static_cast<std::uintptr_t>(value))
#endif
#ifndef OFN_HIDEREADONLY
#define OFN_HIDEREADONLY 0x00000004
#define OFN_OVERWRITEPROMPT 0x00000002
#define OFN_PATHMUSTEXIST 0x00000800
#endif
#ifndef AFX_IDS_SAVEFILE
#define AFX_IDS_SAVEFILE 0xF000
#define AFX_IDS_SAVEFILECOPY 0xF001
#endif

#ifndef BN_CLICKED
#define BN_CLICKED 0
#endif
#ifndef NM_CLICK
#define NM_CLICK static_cast<UINT>(-2)
#endif
#ifndef LVCFMT_LEFT
#define LVCFMT_LEFT 0x0000
#define LVIF_TEXT 0x0001
#define LVIS_SELECTED 0x0002
#define LVNI_SELECTED 0x0002
#endif
#ifndef DT_LEFT
#define DT_LEFT 0x0000
#define DT_TOP 0x0000
#define DT_SINGLELINE 0x0020
#define DT_NOCLIP 0x0100
#endif
#ifndef FW_REGULAR
#define FW_REGULAR FW_NORMAL
#endif
#ifndef TRANSPARENT
#define TRANSPARENT 1
#define OPAQUE 2
#endif
#ifndef SB_HORZ
#define SB_HORZ 0
#define SB_VERT 1
#define SB_LINEUP 0
#define SB_LINEDOWN 1
#define SB_PAGEUP 2
#define SB_PAGEDOWN 3
#define SB_THUMBPOSITION 4
#define SB_THUMBTRACK 5
#endif
#ifndef IMAGE_BITMAP
#define IMAGE_BITMAP 0
#define IMAGE_ICON 1
#define LR_LOADMAP3DCOLORS 0x00001000
#endif
#ifndef BM_SETIMAGE
#define BM_SETIMAGE 0x00F7
#endif
#ifndef DI_NORMAL
#define DI_NORMAL 0x0003
#endif
#ifndef MK_LBUTTON
#define MK_LBUTTON 0x0001
#endif
#ifndef CN_COMMAND
#define CN_COMMAND 0
#define CN_UPDATE_COMMAND_UI (-1)
#endif
#ifndef MB_YESNOCANCEL
#define MB_YESNOCANCEL 0x00000003
#endif
#ifndef BST_UNCHECKED
#define BST_UNCHECKED 0x0000
#define BST_CHECKED 0x0001
#define BST_INDETERMINATE 0x0002
#define BST_PUSHED 0x0004
#define BST_FOCUS 0x0008
#define BST_HOT 0x0200
#endif
#ifndef CBN_SELCHANGE
#define CBN_SELCHANGE 1
#define CBN_KILLFOCUS 4
#define CBN_EDITCHANGE 5
#define CBN_CLOSEUP 8
#define CBN_SELENDOK 9
#endif
#ifndef EN_KILLFOCUS
#define EN_KILLFOCUS 0x0200
#define EN_CHANGE 0x0300
#define EN_UPDATE 0x0400
#endif
#ifndef LBN_SELCHANGE
#define LBN_SELCHANGE 1
#define LBN_DBLCLK 2
#endif
#ifndef LB_ERR
#define LB_ERR (-1)
#endif
#ifndef CB_ERR
#define CB_ERR (-1)
#endif
#ifndef WM_MOVE
#define WM_MOVE 0x0003
#endif
#ifndef WM_COMMAND
#define WM_COMMAND 0x0111
#endif
#ifndef WM_SHOWWINDOW
#define WM_SHOWWINDOW 0x0018
#endif
#ifndef WM_CANCELMODE
#define WM_CANCELMODE 0x001F
#endif
#ifndef WM_CLEAR
#define WM_CLEAR 0x0303
#endif
#ifndef WM_TIMER
#define WM_TIMER 0x0113
#endif
#ifndef WM_HSCROLL
#define WM_HSCROLL 0x0114
#endif
#ifndef WM_VSCROLL
#define WM_VSCROLL 0x0115
#endif
#ifndef SW_SHOWNA
#define SW_SHOWNORMAL 1
#define SW_NORMAL 1
#define SW_SHOWMINIMIZED 2
#define SW_SHOWMAXIMIZED 3
#define SW_MAXIMIZE 3
#define SW_SHOWNOACTIVATE 4
#define SW_MINIMIZE 6
#define SW_SHOWMINNOACTIVE 7
#define SW_SHOWNA 8
#define SW_RESTORE 9
#define SW_SHOWDEFAULT 10
#define SW_FORCEMINIMIZE 11
#endif
#ifndef NULLREGION
#define NULLREGION 1
#define SIMPLEREGION 2
#define COMPLEXREGION 3
#endif
#ifndef PS_SOLID
#define PS_SOLID 0
#define PS_NULL 5
#endif
#ifndef NULL_BRUSH
#define NULL_BRUSH 5
#endif
#ifndef SRCCOPY
#define SRCCOPY 0x00CC0020
#endif

using INT_PTR = std::intptr_t;
using DWORD_PTR = std::uintptr_t;
using POSITION = void *;
using HTREEITEM = void *;
using LPBITMAPINFO = BITMAPINFO *;

class CWnd;
class CDC;

#ifndef TVI_ROOT
#define TVI_ROOT reinterpret_cast<HTREEITEM>(static_cast<std::intptr_t>(-0x10000))
#define TVI_FIRST reinterpret_cast<HTREEITEM>(static_cast<std::intptr_t>(-0x0FFFF))
#define TVI_LAST reinterpret_cast<HTREEITEM>(static_cast<std::intptr_t>(-0x0FFFE))
#define TVI_SORT reinterpret_cast<HTREEITEM>(static_cast<std::intptr_t>(-0x0FFFD))
#endif
#ifndef TVIF_TEXT
#define TVIF_TEXT 0x0001
#define TVIF_IMAGE 0x0002
#define TVIF_PARAM 0x0004
#define TVIF_STATE 0x0008
#define TVIF_HANDLE 0x0010
#define TVIF_SELECTEDIMAGE 0x0020
#define TVIF_CHILDREN 0x0040
#endif
#ifndef TVIS_SELECTED
#define TVIS_SELECTED 0x0002
#define TVIS_DROPHILITED 0x0008
#define TVIS_EXPANDED 0x0020
#define TVIS_EXPANDEDONCE 0x0040
#define TVIS_STATEIMAGEMASK 0xF000
#endif
#ifndef INDEXTOSTATEIMAGEMASK
#define INDEXTOSTATEIMAGEMASK(index) ((index) << 12)
#endif
#ifndef TVE_COLLAPSE
#define TVE_COLLAPSE 0x0001
#define TVE_EXPAND 0x0002
#define TVE_TOGGLE 0x0003
#endif
#ifndef TVS_HASBUTTONS
#define TVS_HASBUTTONS 0x0001
#define TVS_HASLINES 0x0002
#define TVS_LINESATROOT 0x0004
#define TVS_DISABLEDRAGDROP 0x0010
#define TVS_SHOWSELALWAYS 0x0020
#endif
#ifndef TVGN_FIRSTVISIBLE
#define TVGN_FIRSTVISIBLE 0x0005
#endif
#ifndef TBS_AUTOTICKS
#define TBS_AUTOTICKS 0x0001
#define TBS_VERT 0x0002
#define TBS_HORZ 0x0000
#define TBS_LEFT 0x0004
#define TBS_RIGHT 0x0000
#define TBS_TOP 0x0004
#define TBS_BOTTOM 0x0000
#define TBS_BOTH 0x0008
#define TBS_NOTICKS 0x0010
#define TBS_ENABLESELRANGE 0x0020
#define TBS_FIXEDLENGTH 0x0040
#define TBS_NOTHUMB 0x0080
#define TBS_TOOLTIPS 0x0100
#define TBS_REVERSED 0x0200
#define TBS_DOWNISLEFT 0x0400
#endif
#ifndef TB_LINEUP
#define TB_LINEUP 0
#define TB_LINEDOWN 1
#define TB_PAGEUP 2
#define TB_PAGEDOWN 3
#define TB_THUMBPOSITION 4
#define TB_THUMBTRACK 5
#define TB_TOP 6
#define TB_BOTTOM 7
#define TB_ENDTRACK 8
#endif
#ifndef WS_CHILD
#define WS_CHILD 0x40000000L
#endif
#ifndef WS_VISIBLE
#define WS_VISIBLE 0x10000000L
#endif
#ifndef SWP_NOREDRAW
#define SWP_NOREDRAW 0x0008
#endif
#ifndef SWP_NOACTIVATE
#define SWP_NOACTIVATE 0x0010
#endif
#ifndef IDC_WAIT
#define IDC_WAIT MAKEINTRESOURCE(32514)
#endif
#ifndef SM_CYCAPTION
#define SM_CYCAPTION 4
#define SM_CXEDGE 45
#endif
#ifndef WS_TABSTOP
#define WS_TABSTOP 0x00010000L
#endif
#ifndef WS_OVERLAPPEDWINDOW
#define WS_OVERLAPPEDWINDOW 0x00CF0000L
#define WS_SIZEBOX 0x00040000L
#endif
#ifndef WS_EX_TOPMOST
#define WS_EX_TOPMOST 0x00000008L
#define WS_POPUP 0x80000000L
#endif
#ifndef CS_BYTEALIGNCLIENT
#define CS_BYTEALIGNCLIENT 0x1000
#define CS_SAVEBITS 0x0800
#endif
#ifndef COLOR_3DFACE
#define COLOR_BTNFACE 15
#define COLOR_3DFACE COLOR_BTNFACE
#define COLOR_3DSHADOW 16
#define COLOR_3DHILIGHT 20
#define COLOR_3DHIGHLIGHT COLOR_3DHILIGHT
#define COLOR_3DDKSHADOW 21
#define COLOR_3DLIGHT 22
#endif
#ifndef FWS_ADDTOTITLE
#define FWS_ADDTOTITLE 0x00008000L
#endif
#ifndef ES_MULTILINE
#define ES_MULTILINE 0x0004L
#endif
#ifndef LF_FACESIZE
#define LF_FACESIZE 32
#endif
#ifndef FF_DONTCARE
#define FF_DONTCARE 0x00
#endif
#ifndef ANSI_CHARSET
#define ANSI_CHARSET 0
#define DEFAULT_QUALITY 0
#define DEFAULT_PITCH 0
#endif
#ifndef RDW_INVALIDATE
#define RDW_INVALIDATE 0x0001
#define RDW_ERASE 0x0004
#define RDW_UPDATENOW 0x0100
#endif
#ifndef EN_SETFOCUS
#define EN_SETFOCUS 0x0100
#endif
#ifndef EN_MSGFILTER
#define EN_MSGFILTER 0x0700
#define EN_SELCHANGE 0x0702
#define EN_LINK 0x070B
#endif
#ifndef ENM_KEYEVENTS
#define ENM_KEYEVENTS 0x00010000
#define ENM_SELCHANGE 0x00080000
#define ENM_LINK 0x04000000
#endif
#ifndef CFM_BOLD
#define CFM_BOLD 0x00000001
#define CFM_ITALIC 0x00000002
#define CFM_UNDERLINE 0x00000004
#define CFM_STRIKEOUT 0x00000008
#define CFM_PROTECTED 0x00000010
#define CFM_LINK 0x00000020
#define CFM_SIZE 0x80000000
#define CFM_COLOR 0x40000000
#define CFM_FACE 0x20000000
#define CFM_OFFSET 0x10000000
#define CFM_CHARSET 0x08000000
#endif
#ifndef CFE_BOLD
#define CFE_BOLD 0x00000001
#define CFE_ITALIC 0x00000002
#define CFE_UNDERLINE 0x00000004
#define CFE_STRIKEOUT 0x00000008
#define CFE_PROTECTED 0x00000010
#define CFE_LINK 0x00000020
#define CFE_AUTOCOLOR 0x40000000
#endif
#ifndef CC_RGBINIT
#define CC_RGBINIT 0x00000001
#define CC_FULLOPEN 0x00000002
#define CC_PREVENTFULLOPEN 0x00000004
#define CC_SHOWHELP 0x00000008
#define CC_ENABLEHOOK 0x00000010
#define CC_ENABLETEMPLATE 0x00000020
#define CC_ENABLETEMPLATEHANDLE 0x00000040
#define CC_SOLIDCOLOR 0x00000080
#define CC_ANYCOLOR 0x00000100
#endif
#ifndef SND_ASYNC
#define SND_SYNC 0x0000
#define SND_ASYNC 0x0001
#define SND_NODEFAULT 0x0002
#define SND_MEMORY 0x0004
#define SND_LOOP 0x0008
#define SND_NOSTOP 0x0010
#define SND_PURGE 0x0040
#define SND_FILENAME 0x00020000
#endif
#ifndef MF_BYCOMMAND
#define MF_BYCOMMAND 0x00000000L
#define MF_GRAYED 0x00000001L
#define MF_DISABLED 0x00000002L
#define MF_CHECKED 0x00000008L
#define MF_POPUP 0x00000010L
#define MF_STRING 0x00000000L
#define MF_UNCHECKED 0x00000000L
#define MF_BYPOSITION 0x00000400L
#define MF_SEPARATOR 0x00000800L
#endif
#ifndef TPM_LEFTBUTTON
#define TPM_LEFTBUTTON 0x0000L
#define TPM_RIGHTBUTTON 0x0002L
#define TPM_LEFTALIGN 0x0000L
#define TPM_CENTERALIGN 0x0004L
#define TPM_RIGHTALIGN 0x0008L
#define TPM_TOPALIGN 0x0000L
#define TPM_VCENTERALIGN 0x0010L
#define TPM_BOTTOMALIGN 0x0020L
#define TPM_RETURNCMD 0x0100L
#endif
#ifndef TVHT_NOWHERE
#define TVHT_NOWHERE 0x0001
#define TVHT_ONITEMICON 0x0002
#define TVHT_ONITEMLABEL 0x0004
#define TVHT_ONITEMINDENT 0x0008
#define TVHT_ONITEMBUTTON 0x0010
#define TVHT_ONITEMRIGHT 0x0020
#define TVHT_ONITEMSTATEICON 0x0040
#define TVHT_ABOVE 0x0100
#define TVHT_BELOW 0x0200
#define TVHT_TORIGHT 0x0400
#define TVHT_TOLEFT 0x0800
#define TVHT_ONITEM (TVHT_ONITEMICON | TVHT_ONITEMLABEL | TVHT_ONITEMSTATEICON)
#endif
#ifndef ID_SEPARATOR
#define ID_SEPARATOR 0
#define ID_INDICATOR_CAPS 0xE700
#define ID_INDICATOR_NUM 0xE701
#define ID_INDICATOR_SCRL 0xE702
#endif
#ifndef ID_FILE_NEW
#define ID_FILE_NEW 0xE100
#define ID_FILE_OPEN 0xE101
#define ID_FILE_CLOSE 0xE102
#define ID_FILE_SAVE 0xE103
#define ID_FILE_SAVE_AS 0xE104
#define ID_FILE_PAGE_SETUP 0xE105
#define ID_FILE_PRINT_SETUP 0xE106
#define ID_FILE_PRINT 0xE107
#define ID_FILE_PRINT_DIRECT 0xE108
#define ID_FILE_PRINT_PREVIEW 0xE109
#define ID_FILE_MRU_FILE1 0xE110
#define ID_FILE_MRU_FILE2 0xE111
#define ID_FILE_MRU_FILE3 0xE112
#define ID_FILE_MRU_FILE4 0xE113
#define ID_FILE_MRU_FILE5 0xE114
#define ID_FILE_MRU_FILE6 0xE115
#define ID_FILE_MRU_FILE7 0xE116
#define ID_FILE_MRU_FILE8 0xE117
#define ID_FILE_MRU_FILE9 0xE118
#define ID_FILE_MRU_FILE10 0xE119
#define ID_FILE_MRU_FILE11 0xE11A
#define ID_FILE_MRU_FILE12 0xE11B
#define ID_FILE_MRU_FILE13 0xE11C
#define ID_FILE_MRU_FILE14 0xE11D
#define ID_FILE_MRU_FILE15 0xE11E
#define ID_FILE_MRU_FILE16 0xE11F
#endif
#ifndef ID_EDIT_CLEAR
#define ID_EDIT_CLEAR 0xE120
#define ID_EDIT_DELETE ID_EDIT_CLEAR
#define ID_EDIT_CLEAR_ALL 0xE121
#define ID_EDIT_COPY 0xE122
#define ID_EDIT_CUT 0xE123
#define ID_EDIT_FIND 0xE124
#define ID_EDIT_PASTE 0xE125
#define ID_EDIT_REPEAT 0xE128
#define ID_EDIT_REPLACE 0xE129
#define ID_EDIT_SELECT_ALL 0xE12A
#define ID_EDIT_UNDO 0xE12B
#define ID_EDIT_REDO 0xE12C
#endif
#ifndef ID_WINDOW_NEW
#define ID_WINDOW_NEW 0xE130
#define ID_WINDOW_ARRANGE 0xE131
#define ID_WINDOW_CASCADE 0xE132
#define ID_WINDOW_TILE_HORZ 0xE133
#define ID_WINDOW_TILE_VERT 0xE134
#define ID_WINDOW_SPLIT 0xE135
#endif
#ifndef ID_APP_ABOUT
#define ID_APP_ABOUT 0xE140
#define ID_APP_EXIT 0xE141
#endif
#ifndef ID_NEXT_PANE
#define ID_NEXT_PANE 0xE150
#define ID_PREV_PANE 0xE151
#endif
#ifndef ID_VIEW_TOOLBAR
#define ID_VIEW_TOOLBAR 0xE800
#define ID_VIEW_STATUS_BAR 0xE801
#endif
#ifndef TBSTYLE_FLAT
#define TBSTYLE_FLAT 0x0800
#endif
#ifndef CBRS_ALIGN_LEFT
#define CBRS_ALIGN_LEFT 0x1000L
#define CBRS_ALIGN_TOP 0x2000L
#define CBRS_ALIGN_RIGHT 0x4000L
#define CBRS_ALIGN_BOTTOM 0x8000L
#define CBRS_ALIGN_ANY 0xF000L
#define CBRS_BORDER_LEFT 0x0100L
#define CBRS_BORDER_TOP 0x0200L
#define CBRS_BORDER_RIGHT 0x0400L
#define CBRS_BORDER_BOTTOM 0x0800L
#define CBRS_LEFT (CBRS_ALIGN_LEFT | CBRS_BORDER_RIGHT)
#define CBRS_TOP (CBRS_ALIGN_TOP | CBRS_BORDER_BOTTOM)
#define CBRS_GRIPPER 0x00400000L
#define CBRS_TOOLTIPS 0x01000000L
#define CBRS_FLYBY 0x02000000L
#define CBRS_SIZE_FIXED 0x00000002L
#endif
#ifndef ILC_COLOR8
#define ILC_COLOR4 0x00000004
#define ILC_COLOR8 0x00000008
#endif
#ifndef LVSIL_NORMAL
#define LVSIL_NORMAL 0
#endif
#ifndef TVSIL_NORMAL
#define TVSIL_NORMAL 0
#define TVSIL_STATE 2
#endif

struct CREATESTRUCT {
	DWORD style = 0;
	int x = 0;
	int y = 0;
	int cx = 0;
	int cy = 0;
	LPCTSTR lpszName = nullptr;
	LPCTSTR lpszClass = nullptr;
	DWORD dwExStyle = 0;
};
using LPCREATESTRUCT = const CREATESTRUCT *;
struct CCreateContext {};

struct NMHDR {
	HWND hwndFrom = nullptr;
	UINT idFrom = 0;
	UINT code = 0;
};

struct TVITEM {
	UINT mask = 0;
	HTREEITEM hItem = nullptr;
	UINT state = 0;
	UINT stateMask = 0;
	char *pszText = nullptr;
	int cchTextMax = 0;
	int iImage = 0;
	int iSelectedImage = 0;
	int cChildren = 0;
	LPARAM lParam = 0;
};

struct TVINSERTSTRUCT {
	HTREEITEM hParent = TVI_ROOT;
	HTREEITEM hInsertAfter = TVI_LAST;
	TVITEM item;
};

struct NMTREEVIEW {
	NMHDR hdr;
	UINT action = 0;
	TVITEM itemOld;
	TVITEM itemNew;
	POINT ptDrag = {0, 0};
};
using NM_TREEVIEW = NMTREEVIEW;
struct TVHITTESTINFO {
	POINT pt = {0, 0};
	UINT flags = 0;
	HTREEITEM hItem = nullptr;
};

struct NMTVDISPINFOA {
	NMHDR hdr;
	TVITEM item;
};
using NMTVDISPINFO = NMTVDISPINFOA;
using TV_DISPINFO = NMTVDISPINFOA;

struct NMTVKEYDOWN {
	NMHDR hdr;
	WORD wVKey = 0;
	UINT flags = 0;
};

struct CHARRANGE {
	LONG cpMin = 0;
	LONG cpMax = 0;
};

struct CHARFORMATA {
	UINT cbSize = sizeof(CHARFORMATA);
	DWORD dwMask = 0;
	DWORD dwEffects = 0;
	LONG yHeight = 0;
	LONG yOffset = 0;
	COLORREF crTextColor = 0;
	BYTE bCharSet = DEFAULT_CHARSET;
	BYTE bPitchAndFamily = FF_DONTCARE;
	char szFaceName[LF_FACESIZE] = {};
};

struct CHARFORMAT2A : CHARFORMATA {
	WORD wWeight = 0;
	SHORT sSpacing = 0;
	COLORREF crBackColor = 0;
	DWORD lcid = 0;
	DWORD dwReserved = 0;
	SHORT sStyle = 0;
	WORD wKerning = 0;
	BYTE bUnderlineType = 0;
	BYTE bAnimation = 0;
	BYTE bRevAuthor = 0;
	BYTE bReserved1 = 0;

	CHARFORMAT2A() { cbSize = sizeof(CHARFORMAT2A); }
};

using CHARFORMAT = CHARFORMATA;
using CHARFORMAT2 = CHARFORMAT2A;

struct MSGFILTER {
	NMHDR nmhdr;
	UINT msg = 0;
	WPARAM wParam = 0;
	LPARAM lParam = 0;
};

struct ENLINK {
	NMHDR nmhdr;
	UINT msg = 0;
	WPARAM wParam = 0;
	LPARAM lParam = 0;
	CHARRANGE chrg;
};

// CommCtrl tree notifications use unsigned wraparound in NMHDR::code. World
// Builder is an ANSI MFC application, so preserve the original A-notification
// values and aliases that its handlers compare against.
constexpr UINT TVN_FIRST = static_cast<UINT>(-400);
constexpr UINT NM_FIRST = 0;
constexpr UINT NM_DBLCLK = NM_FIRST - 3;
constexpr UINT TVN_SELCHANGINGA = TVN_FIRST - 1;
constexpr UINT TVN_SELCHANGEDA = TVN_FIRST - 2;
constexpr UINT TVN_ITEMEXPANDEDA = TVN_FIRST - 6;
constexpr UINT TVN_BEGINDRAGA = TVN_FIRST - 7;
constexpr UINT TVN_BEGINLABELEDITA = TVN_FIRST - 10;
constexpr UINT TVN_ENDLABELEDITA = TVN_FIRST - 11;
constexpr UINT TVN_KEYDOWN = TVN_FIRST - 12;
constexpr UINT TVN_SELCHANGING = TVN_SELCHANGINGA;
constexpr UINT TVN_SELCHANGED = TVN_SELCHANGEDA;
constexpr UINT TVN_ITEMEXPANDED = TVN_ITEMEXPANDEDA;
constexpr UINT TVN_BEGINDRAG = TVN_BEGINDRAGA;
constexpr UINT TVN_BEGINLABELEDIT = TVN_BEGINLABELEDITA;
constexpr UINT TVN_ENDLABELEDIT = TVN_ENDLABELEDITA;

struct MINMAXINFO {};
struct SCROLLINFO {};
struct WINDOWPLACEMENT {};
struct LOGFONT {
	LONG lfHeight = 0;
	LONG lfWidth = 0;
	LONG lfEscapement = 0;
	LONG lfOrientation = 0;
	LONG lfWeight = 0;
	BYTE lfItalic = 0;
	BYTE lfUnderline = 0;
	BYTE lfStrikeOut = 0;
	BYTE lfCharSet = DEFAULT_CHARSET;
	BYTE lfOutPrecision = 0;
	BYTE lfClipPrecision = 0;
	BYTE lfQuality = 0;
	BYTE lfPitchAndFamily = 0;
	char lfFaceName[LF_FACESIZE] = {};
};

struct IDirect3DDevice8;
struct ID3DXFont;
HRESULT BrowserMfcD3DXCreateFont(
	IDirect3DDevice8 *device,
	const LOGFONT *font,
	ID3DXFont **result);

class CString {
public:
	CString() = default;
	CString(const char *value) : m_value(value ? value : "") {}
	CString(const std::string &value) : m_value(value) {}
	CString(char character, int repeat) : m_value((std::max)(0, repeat), character) {}

	CString &operator=(const char *value) {
		m_value = value ? value : "";
		return *this;
	}
	CString &operator=(const std::string &value) {
		m_value = value;
		return *this;
	}
	operator const char *() const { return m_value.c_str(); }
	const char *GetString() const { return m_value.c_str(); }
	const char *c_str() const { return m_value.c_str(); }
	char *GetBuffer(int minimumLength) {
		if (minimumLength > static_cast<int>(m_value.size())) {
			m_value.resize(static_cast<std::size_t>(minimumLength), '\0');
		}
		return m_value.data();
	}
	void ReleaseBuffer(int newLength = -1) {
		if (newLength < 0) {
			m_value.resize(std::strlen(m_value.c_str()));
		} else {
			m_value.resize(static_cast<std::size_t>((std::max)(0, newLength)));
		}
	}
	int GetLength() const { return static_cast<int>(m_value.size()); }
	BOOL IsEmpty() const { return m_value.empty() ? TRUE : FALSE; }
	void Empty() { m_value.clear(); }
	char operator[](int index) const { return m_value.at(static_cast<std::size_t>(index)); }
	char &operator[](int index) { return m_value.at(static_cast<std::size_t>(index)); }

	CString &operator+=(const CString &value) {
		m_value += value.m_value;
		return *this;
	}
	CString &operator+=(const char *value) {
		m_value += value ? value : "";
		return *this;
	}
	CString &operator+=(char value) {
		m_value += value;
		return *this;
	}
	friend CString operator+(CString left, const CString &right) {
		left += right;
		return left;
	}
	friend CString operator+(CString left, const char *right) {
		left += right;
		return left;
	}
	friend CString operator+(const char *left, const CString &right) {
		CString result(left);
		result += right;
		return result;
	}
	friend bool operator==(const CString &left, const CString &right) {
		return left.m_value == right.m_value;
	}
	friend bool operator!=(const CString &left, const CString &right) {
		return !(left == right);
	}
	friend bool operator==(const CString &left, const char *right) {
		return left.m_value == (right ? right : "");
	}
	friend bool operator!=(const CString &left, const char *right) {
		return !(left == right);
	}

	int Compare(const char *value) const {
		return m_value.compare(value ? value : "");
	}
	int CompareNoCase(const char *value) const {
		std::string left = m_value;
		std::string right = value ? value : "";
		std::transform(left.begin(), left.end(), left.begin(), [](unsigned char c) {
			return static_cast<char>(std::tolower(c));
		});
		std::transform(right.begin(), right.end(), right.begin(), [](unsigned char c) {
			return static_cast<char>(std::tolower(c));
		});
		return left.compare(right);
	}
	int Find(char value) const {
		const auto index = m_value.find(value);
		return index == std::string::npos ? -1 : static_cast<int>(index);
	}
	int Find(const char *value) const {
		const auto index = m_value.find(value ? value : "");
		return index == std::string::npos ? -1 : static_cast<int>(index);
	}
	int ReverseFind(char value) const {
		const auto index = m_value.rfind(value);
		return index == std::string::npos ? -1 : static_cast<int>(index);
	}
	int FindOneOf(LPCTSTR characters) const {
		const auto index = m_value.find_first_of(characters ? characters : "");
		return index == std::string::npos ? -1 : static_cast<int>(index);
	}
	int Replace(const char *oldValue, const char *newValue) {
		const std::string before = oldValue ? oldValue : "";
		const std::string after = newValue ? newValue : "";
		if (before.empty()) return 0;
		int replacements = 0;
		std::size_t position = 0;
		while ((position = m_value.find(before, position)) != std::string::npos) {
			m_value.replace(position, before.size(), after);
			position += after.size();
			++replacements;
		}
		return replacements;
	}
	CString Left(int count) const {
		return m_value.substr(0, static_cast<std::size_t>((std::max)(0, count)));
	}
	CString Right(int count) const {
		const auto size = static_cast<int>(m_value.size());
		return m_value.substr(static_cast<std::size_t>(
			(std::max)(0, size - (std::max)(0, count))));
	}
	CString Mid(int start, int count = -1) const {
		const auto offset = static_cast<std::size_t>((std::max)(0, start));
		if (count < 0) return offset < m_value.size() ? m_value.substr(offset) : std::string();
		return offset < m_value.size()
			? m_value.substr(offset, static_cast<std::size_t>(count))
			: std::string();
	}
	void MakeLower() {
		std::transform(m_value.begin(), m_value.end(), m_value.begin(), [](unsigned char c) {
			return static_cast<char>(std::tolower(c));
		});
	}
	void TrimLeft() {
		m_value.erase(m_value.begin(), std::find_if(m_value.begin(), m_value.end(), [](unsigned char c) {
			return !std::isspace(c);
		}));
	}
	void TrimRight() {
		m_value.erase(std::find_if(m_value.rbegin(), m_value.rend(), [](unsigned char c) {
			return !std::isspace(c);
		}).base(), m_value.end());
	}
	void Format(const char *format, ...) {
		va_list arguments;
		va_start(arguments, format);
		formatV(format, arguments);
		va_end(arguments);
	}
	void Format(UINT formatResourceId, ...);
	BOOL LoadString(UINT resourceId);

private:
	void formatV(const char *format, va_list arguments) {
		if (format == nullptr) {
			throw std::runtime_error("CString::Format received a null format");
		}
		va_list copy;
		va_copy(copy, arguments);
		const int length = std::vsnprintf(nullptr, 0, format, copy);
		va_end(copy);
		if (length < 0) {
			throw std::runtime_error("CString::Format failed");
		}
		std::vector<char> buffer(static_cast<std::size_t>(length) + 1);
		std::vsnprintf(buffer.data(), buffer.size(), format, arguments);
		m_value.assign(buffer.data(), static_cast<std::size_t>(length));
	}
	std::string m_value;
};

class CStringArray {
public:
	void Add(const CString &value) { m_values.push_back(value); }
	int GetSize() const { return static_cast<int>(m_values.size()); }
	CString &operator[](int index) { return m_values.at(static_cast<std::size_t>(index)); }
	const CString &operator[](int index) const { return m_values.at(static_cast<std::size_t>(index)); }

private:
	std::vector<CString> m_values;
};

class CPoint : public POINT {
public:
	CPoint() { x = 0; y = 0; }
	CPoint(long xValue, long yValue) { x = xValue; y = yValue; }
	CPoint(const POINT &value) { x = value.x; y = value.y; }
	void Offset(long xOffset, long yOffset) { x += xOffset; y += yOffset; }
	friend CPoint operator+(CPoint left, const CPoint &right) {
		left.Offset(right.x, right.y);
		return left;
	}
	friend CPoint operator-(CPoint left, const CPoint &right) {
		left.Offset(-right.x, -right.y);
		return left;
	}
	friend bool operator==(const CPoint &left, const CPoint &right) {
		return left.x == right.x && left.y == right.y;
	}
	friend bool operator!=(const CPoint &left, const CPoint &right) {
		return !(left == right);
	}
};

class CSize {
public:
	long cx = 0;
	long cy = 0;
	CSize() = default;
	CSize(long width, long height) : cx(width), cy(height) {}
};

class CRect : public RECT {
public:
	CRect() { left = top = right = bottom = 0; }
	CRect(long leftValue, long topValue, long rightValue, long bottomValue) {
		left = leftValue;
		top = topValue;
		right = rightValue;
		bottom = bottomValue;
	}
	CRect(CPoint topLeft, CPoint bottomRight) {
		left = topLeft.x;
		top = topLeft.y;
		right = bottomRight.x;
		bottom = bottomRight.y;
	}
	CRect(const RECT &value) {
		left = value.left;
		top = value.top;
		right = value.right;
		bottom = value.bottom;
	}
	int Width() const { return static_cast<int>(right - left); }
	int Height() const { return static_cast<int>(bottom - top); }
	CPoint CenterPoint() const { return CPoint((left + right) / 2, (top + bottom) / 2); }
	BOOL PtInRect(CPoint point) const {
		return point.x >= left && point.x < right && point.y >= top && point.y < bottom;
	}
	void SetRect(long leftValue, long topValue, long rightValue, long bottomValue) {
		left = leftValue;
		top = topValue;
		right = rightValue;
		bottom = bottomValue;
	}
	void SetRectEmpty() { left = top = right = bottom = 0; }
	void OffsetRect(long x, long y) { left += x; right += x; top += y; bottom += y; }
	void InflateRect(long x, long y) { left -= x; right += x; top -= y; bottom += y; }
	void DeflateRect(long x, long y) { InflateRect(-x, -y); }
	void NormalizeRect() {
		if (left > right) std::swap(left, right);
		if (top > bottom) std::swap(top, bottom);
	}
	BOOL UnionRect(const RECT *first, const RECT *second) {
		if (first == nullptr || second == nullptr) return FALSE;
		left = (std::min)(first->left, second->left);
		top = (std::min)(first->top, second->top);
		right = (std::max)(first->right, second->right);
		bottom = (std::max)(first->bottom, second->bottom);
		return right > left && bottom > top ? TRUE : FALSE;
	}
	void DeflateRect(long leftValue, long topValue, long rightValue, long bottomValue) {
		left += leftValue;
		top += topValue;
		right -= rightValue;
		bottom -= bottomValue;
	}
	operator RECT *() { return this; }
	operator const RECT *() const { return this; }
};

namespace browser_mfc {

using WindowId = std::uint32_t;
using MenuId = std::uint32_t;
using ImageListId = std::uint32_t;

enum class MessageKind {
	Command,
	CommandUpdate,
	Control,
	Notify,
	Window,
	Sentinel,
};

enum class ControlKind {
	Generic,
	Button,
	Edit,
	RichEdit,
	Static,
	ComboBox,
	ListBox,
	ListControl,
	TreeControl,
	Slider,
	ScrollBar,
	Progress,
	StatusBar,
	ToolBar,
};

struct RichTextFormat {
	DWORD mask = 0;
	DWORD effects = 0;
	LONG heightTwips = 0;
	LONG verticalOffsetTwips = 0;
	COLORREF textColor = 0;
	BYTE characterSet = DEFAULT_CHARSET;
	BYTE pitchAndFamily = FF_DONTCARE;
	std::string faceName;
};

struct Message {
	MessageKind kind = MessageKind::Sentinel;
	UINT id = 0;
	UINT notification = 0;
	UINT uint0 = 0;
	UINT uint1 = 0;
	UINT uint2 = 0;
	int int0 = 0;
	int int1 = 0;
	short short0 = 0;
	BOOL bool0 = FALSE;
	CPoint point;
	void *object = nullptr;
	void *payload = nullptr;
	LRESULT result = 0;
};

class MessageTarget;
using MessageHandler = bool (*)(MessageTarget &, Message &);

struct MessageEntry {
	MessageKind kind = MessageKind::Sentinel;
	UINT firstId = 0;
	UINT lastId = 0;
	UINT notification = 0;
	MessageHandler handler = nullptr;
	const char *handlerName = nullptr;
};

struct MessageMap {
	const MessageMap &(*baseMap)() = nullptr;
	const MessageEntry *entries = nullptr;
	std::size_t entryCount = 0;
};

class UnsupportedOperation final : public std::logic_error {
public:
	using std::logic_error::logic_error;
};

[[noreturn]] void failUnsupported(const char *operation);

class Host {
public:
	virtual ~Host() = default;
	virtual WindowId createDialog(UINT resourceId, WindowId parent) = 0;
	virtual WindowId createControl(
		ControlKind kind,
		WindowId parent,
		UINT controlId,
		const CRect &rect,
		DWORD style) = 0;
	virtual WindowId createWindow(
		const std::string &className,
		const std::string &windowName,
		DWORD style,
		const CRect &rect,
		WindowId parent,
		UINT controlId) = 0;
	virtual WindowId createWindowEx(
		DWORD extendedStyle,
		const std::string &className,
		const std::string &windowName,
		DWORD style,
		const CRect &rect,
		WindowId parent,
		std::uintptr_t menuOrControlId) = 0;
	virtual WindowId createFrame(
		UINT resourceId,
		DWORD style,
		WindowId parent) = 0;
	virtual WindowId createDialogBar(
		UINT resourceId,
		DWORD style,
		WindowId parent,
		UINT controlId) = 0;
	virtual WindowId findControl(WindowId parent, UINT controlId) = 0;
	virtual ControlKind controlKind(WindowId window) const = 0;
	virtual std::string getWindowText(WindowId window) const = 0;
	virtual void setWindowText(WindowId window, const std::string &value) = 0;
	virtual int addItem(WindowId window, const std::string &value) = 0;
	virtual int insertItem(WindowId window, int index, const std::string &value) = 0;
	virtual int deleteItem(WindowId window, int index) = 0;
	virtual void resetItems(WindowId window) = 0;
	virtual int itemCount(WindowId window) const = 0;
	virtual int selectedItem(WindowId window) const = 0;
	virtual int setSelectedItem(WindowId window, int index) = 0;
	virtual std::string itemText(WindowId window, int index) const = 0;
	virtual DWORD_PTR itemData(WindowId window, int index) const = 0;
	virtual int setItemData(WindowId window, int index, DWORD_PTR value) = 0;
	virtual int itemSelected(WindowId window, int index) const = 0;
	virtual int setItemSelected(WindowId window, int index, bool selected) = 0;
	virtual int findItem(WindowId window, int startAfter, const std::string &value, bool exact) const = 0;
	virtual void setHorizontalExtent(WindowId window, int pixels) = 0;
	virtual int insertListColumn(
		WindowId window,
		int index,
		const std::string &heading,
		int format,
		int width,
		int subItem) = 0;
	virtual bool setListItemText(
		WindowId window,
		int item,
		int subItem,
		const std::string &value) = 0;
	virtual bool ensureListItemVisible(
		WindowId window,
		int item,
		bool partialOk) = 0;
	virtual int checkState(WindowId window) const = 0;
	virtual UINT buttonState(WindowId window) const = 0;
	virtual void setCheckState(WindowId window, int state) = 0;
	virtual void setControlRange(WindowId window, int minimum, int maximum) = 0;
	virtual int controlPosition(WindowId window) const = 0;
	virtual int setControlPosition(WindowId window, int position) = 0;
	virtual void setControlTickFrequency(WindowId window, int frequency) = 0;
	virtual CHARRANGE textSelection(WindowId window) const = 0;
	virtual void setTextSelection(WindowId window, const CHARRANGE &selection) = 0;
	virtual DWORD richEditEventMask(WindowId window) const = 0;
	virtual void setRichEditEventMask(WindowId window, DWORD mask) = 0;
	virtual bool setRichEditDefaultFormat(
		WindowId window,
		const RichTextFormat &format) = 0;
	virtual bool setRichEditSelectionFormat(
		WindowId window,
		const RichTextFormat &format) = 0;
	virtual void beginPaint(WindowId window) = 0;
	virtual void endPaint(WindowId window) = 0;
	virtual void fillRectangle(WindowId window, const CRect &rect, COLORREF color) = 0;
	virtual void drawLine(
		WindowId window,
		const CPoint &from,
		const CPoint &to,
		int penStyle,
		int penWidth,
		COLORREF color) = 0;
	virtual void drawEllipse(
		WindowId window,
		const CRect &bounds,
		int penStyle,
		int penWidth,
		COLORREF penColor,
		bool fill,
		COLORREF fillColor) = 0;
	virtual void drawPolygon(
		WindowId window,
		const std::vector<CPoint> &points,
		int penStyle,
		int penWidth,
		COLORREF penColor,
		bool fill,
		COLORREF fillColor) = 0;
	virtual int drawText(
		WindowId window,
		const std::string &value,
		const CRect &bounds,
		UINT format,
		DWORD textColor,
		bool textColorIsArgb,
		bool transparentBackground,
		COLORREF backgroundColor,
		const LOGFONT *font) = 0;
	virtual int stretchDibits(
		WindowId window,
		const CRect &destination,
		const CRect &source,
		const void *pixels,
		std::size_t pixelBytes,
		const BITMAPINFO &bitmapInfo,
		UINT colorUse,
		DWORD rasterOperation) = 0;
	virtual CRect windowRect(WindowId window) const = 0;
	virtual CRect clientRect(WindowId window) const = 0;
	virtual DWORD windowStyle(WindowId window) const = 0;
	virtual bool setWindowPosition(
		WindowId window,
		WindowId insertAfter,
		int x,
		int y,
		int width,
		int height,
		UINT flags) = 0;
	virtual bool redrawWindow(
		WindowId window,
		const CRect *updateRect,
		UINT flags) = 0;
	virtual bool updateRect(WindowId window, CRect &updateRect) const = 0;
	virtual void setScrollRange(
		WindowId window,
		int scrollBar,
		int minimum,
		int maximum,
		bool redraw) = 0;
	virtual int setScrollPosition(
		WindowId window,
		int scrollBar,
		int position,
		bool redraw) = 0;
	virtual void scrollWindow(
		WindowId window,
		int deltaX,
		int deltaY) = 0;
	virtual void printWindow(WindowId window, bool preview) = 0;
	virtual void screenToClient(WindowId window, POINT &point) const = 0;
	virtual void clientToScreen(WindowId window, POINT &point) const = 0;
	virtual bool showWindow(WindowId window, int command) = 0;
	virtual bool isWindowVisible(WindowId window) const = 0;
	virtual bool isWindowMinimized(WindowId window) const = 0;
	virtual void setEnabled(WindowId window, bool enabled) = 0;
	virtual bool isEnabled(WindowId window) const = 0;
	virtual WindowId setCapture(WindowId window) = 0;
	virtual bool releaseCapture() = 0;
	virtual WindowId capturedWindow() const = 0;
	virtual HTREEITEM insertTreeItem(
		WindowId tree,
		HTREEITEM parent,
		HTREEITEM insertAfter,
		const std::string &text,
		LPARAM parameter,
		UINT state,
		int image,
		int selectedImage) = 0;
	virtual bool readTreeItem(
		WindowId tree,
		HTREEITEM item,
		std::string &text,
		LPARAM &parameter,
		UINT &state,
		int &image,
		int &selectedImage,
		int &childCount) const = 0;
	virtual bool writeTreeItem(
		WindowId tree,
		HTREEITEM item,
		UINT mask,
		const std::string &text,
		LPARAM parameter,
		UINT state,
		UINT stateMask,
		int image,
		int selectedImage) = 0;
	virtual HTREEITEM firstTreeChild(WindowId tree, HTREEITEM parent) const = 0;
	virtual HTREEITEM nextTreeSibling(WindowId tree, HTREEITEM item) const = 0;
	virtual HTREEITEM parentTreeItem(WindowId tree, HTREEITEM item) const = 0;
	virtual bool deleteTreeItem(WindowId tree, HTREEITEM item) = 0;
	virtual void deleteAllTreeItems(WindowId tree) = 0;
	virtual HTREEITEM selectedTreeItem(WindowId tree) const = 0;
	virtual bool selectTreeItem(WindowId tree, HTREEITEM item) = 0;
	virtual bool selectTreeDropTarget(WindowId tree, HTREEITEM item) = 0;
	virtual bool setTreeFirstVisibleItem(WindowId tree, HTREEITEM item) = 0;
	virtual HTREEITEM hitTestTreeItem(
		WindowId tree,
		const CPoint &point,
		UINT &flags) const = 0;
	virtual WindowId beginTreeLabelEdit(WindowId tree, HTREEITEM item) = 0;
	virtual bool endTreeLabelEdit(WindowId tree, bool cancel) = 0;
	virtual ImageListId createImageList(
		int width,
		int height,
		UINT flags,
		int initialCount,
		int growCount) = 0;
	virtual ImageListId createImageListFromBitmap(
		UINT bitmapResourceId,
		int cellWidth,
		int growCount,
		COLORREF transparentColor) = 0;
	virtual int addImageListIcon(ImageListId images, HICON icon) = 0;
	virtual ImageListId setTreeImageList(
		WindowId tree,
		ImageListId images,
		int listType) = 0;
	virtual WindowId createStatusBar(WindowId parent) = 0;
	virtual bool setStatusIndicators(
		WindowId statusBar,
		const std::vector<UINT> &indicators) = 0;
	virtual WindowId createToolBar(
		WindowId parent,
		DWORD controlStyle,
		DWORD barStyle) = 0;
	virtual bool loadToolBarResource(WindowId toolbar, UINT resourceId) = 0;
	virtual void enableDocking(WindowId window, DWORD alignment) = 0;
	virtual void dockControlBar(WindowId frame, WindowId controlBar) = 0;
	virtual void floatControlBar(
		WindowId frame,
		WindowId controlBar,
		const CPoint &screenPosition,
		DWORD alignment) = 0;
	virtual void saveBarState(WindowId frame, const std::string &profileName) = 0;
	virtual void setFrameMessage(WindowId frame, const std::string &message) = 0;
	virtual MenuId loadMenuResource(UINT resourceId) = 0;
	virtual MenuId submenu(MenuId menu, int position) const = 0;
	virtual bool appendMenuItem(
		MenuId menu,
		UINT flags,
		std::uintptr_t commandOrSubmenu,
		const std::string &text) = 0;
	virtual bool removeMenuItem(MenuId menu, UINT item, UINT flags) = 0;
	virtual int enableMenuItem(MenuId menu, UINT item, UINT flags) = 0;
	virtual int checkMenuItem(MenuId menu, UINT item, UINT flags) = 0;
	virtual UINT trackPopupMenu(
		MenuId menu,
		UINT flags,
		int screenX,
		int screenY,
		WindowId owner) = 0;
	virtual bool destroyMenu(MenuId menu) = 0;
	virtual bool destroyWindow(WindowId window) = 0;
	virtual UINT setTimer(WindowId window, UINT eventId, UINT milliseconds) = 0;
	virtual bool killTimer(WindowId window, UINT eventId) = 0;
	virtual LRESULT deliverNativeMessage(
		WindowId window,
		UINT message,
		WPARAM wParam,
		LPARAM lParam) = 0;
	virtual void setFocus(WindowId window) = 0;
	virtual int runModal(WindowId dialog) = 0;
	virtual WindowId createPropertySheet(
		const std::string &caption,
		WindowId parent) = 0;
	virtual void addPropertyPage(
		WindowId propertySheet,
		WindowId propertyPage,
		UINT resourceId) = 0;
	virtual void selectPropertyPage(
		WindowId propertySheet,
		unsigned int pageIndex) = 0;
	virtual void closeDialog(WindowId dialog, int result) = 0;
	virtual std::string loadString(UINT resourceId) const = 0;
	virtual std::string documentString(UINT resourceId, int stringIndex) const = 0;
	virtual HICON loadIcon(UINT resourceId) = 0;
	virtual HANDLE loadImage(
		UINT resourceId,
		UINT imageType,
		int desiredWidth,
		int desiredHeight,
		UINT flags) = 0;
	virtual bool destroyImage(HANDLE image, UINT imageType) = 0;
	virtual void drawIcon(
		WindowId window,
		int x,
		int y,
		HICON icon,
		int width,
		int height,
		UINT flags) = 0;
	virtual COLORREF systemColor(int colorIndex) const = 0;
	virtual bool beep(DWORD frequency, DWORD durationMilliseconds) = 0;
	virtual bool initializeControls() = 0;
	virtual std::string launchDocumentPath() const = 0;
	virtual HCURSOR loadCursor(UINT resourceId) = 0;
	virtual bool destroyCursor(HCURSOR cursor) = 0;
	virtual bool messageBeep(UINT type) = 0;
	virtual int runMessageBox(
		const std::string &text,
		const std::string &caption,
		UINT type,
		WindowId parent) = 0;
	virtual int runColorDialog(
		COLORREF initialColor,
		DWORD flags,
		WindowId parent,
		COLORREF &chosenColor) = 0;
	virtual int runFileDialog(
		bool openFile,
		const std::string &defaultExtension,
		const std::string &initialFilename,
		DWORD flags,
		const std::string &filter,
		WindowId parent,
		std::string &selectedPath) = 0;
	virtual bool fileWritten(const std::string &path) = 0;
	virtual bool playSound(const std::string &filename, DWORD flags) = 0;
	virtual int readProfileInt(
		const std::string &section,
		const std::string &entry,
		int defaultValue) const = 0;
	virtual std::string readProfileString(
		const std::string &section,
		const std::string &entry,
		const std::string &defaultValue) const = 0;
	virtual bool writeProfileInt(
		const std::string &section,
		const std::string &entry,
		int value) = 0;
	virtual bool writeProfileString(
		const std::string &section,
		const std::string &entry,
		const std::string &value) = 0;
	virtual int systemMetric(int metric) const = 0;
	virtual void uninitializeComApartment() = 0;
};

void setHost(Host *host);
Host &host();
void postMessage(CWnd &target, WindowId window, UINT message, WPARAM wParam, LPARAM lParam);
void pumpPostedMessages();
int runModalLoop(int &modalResult);
void registerWindowObject(WindowId window, CWnd *object);
void unregisterWindowObject(WindowId window, CWnd *object);
CWnd *findWindowObject(WindowId window);

inline RichTextFormat normalizeRichTextFormat(const CHARFORMATA &value)
{
	RichTextFormat result;
	result.mask = value.dwMask;
	result.effects = value.dwEffects;
	result.heightTwips = value.yHeight;
	result.verticalOffsetTwips = value.yOffset;
	result.textColor = value.crTextColor;
	result.characterSet = value.bCharSet;
	result.pitchAndFamily = value.bPitchAndFamily;
	const char *faceEnd = std::find(
		value.szFaceName,
		value.szFaceName + sizeof(value.szFaceName),
		'\0');
	result.faceName.assign(
		value.szFaceName,
		faceEnd);
	return result;
}

}

struct CRuntimeClass;
class CObject {
public:
	virtual ~CObject() = default;
	virtual const CRuntimeClass *browserGetRuntimeClass() const { return nullptr; }
	BOOL IsKindOf(const CRuntimeClass *runtimeClass) const;
};

struct CRuntimeClass {
	const char *className = nullptr;
	CObject *(*createObject)() = nullptr;
};

inline BOOL CObject::IsKindOf(const CRuntimeClass *runtimeClass) const
{
	return runtimeClass != nullptr && browserGetRuntimeClass() == runtimeClass
		? TRUE
		: FALSE;
}

class browser_mfc::MessageTarget : public CObject {
public:
	virtual const browser_mfc::MessageMap &browserMessageMap() const;
	bool browserDispatchMessage(browser_mfc::Message &message);
	bool browserCanDispatchMessage(const browser_mfc::Message &message) const;

	static const browser_mfc::MessageMap &browserStaticMessageMap();
};

class CDataExchange : public CObject {};
class CCmdUI : public CObject {
public:
	void Enable(BOOL enabled = TRUE) { m_enabled = enabled != FALSE; }
	void SetCheck(int checked) { m_checked = checked; }
	void SetText(LPCTSTR text) { m_text = text ? text : ""; }
	bool enabled() const { return m_enabled; }
	int checked() const { return m_checked; }
	const CString &text() const { return m_text; }

private:
	bool m_enabled = true;
	int m_checked = 0;
	CString m_text;
};
struct AFX_CMDHANDLERINFO {};

class CRgn : public CObject {
public:
	BOOL CreateRectRgn(int left, int top, int right, int bottom) {
		m_rectangles = {CRect(left, top, right, bottom)};
		return TRUE;
	}
	void browserSetRect(const CRect &rect) {
		m_rectangles.clear();
		if (rect.right > rect.left && rect.bottom > rect.top) {
			m_rectangles.push_back(rect);
		}
	}
	int GetRgnBox(RECT *bounds) const {
		if (m_rectangles.empty()) {
			if (bounds != nullptr) *bounds = RECT{0, 0, 0, 0};
			return NULLREGION;
		}
		CRect combined = m_rectangles.front();
		for (std::size_t index = 1; index < m_rectangles.size(); ++index) {
			const CRect &rect = m_rectangles[index];
			combined.left = (std::min)(combined.left, rect.left);
			combined.top = (std::min)(combined.top, rect.top);
			combined.right = (std::max)(combined.right, rect.right);
			combined.bottom = (std::max)(combined.bottom, rect.bottom);
		}
		if (bounds != nullptr) *bounds = combined;
		return m_rectangles.size() == 1 ? SIMPLEREGION : COMPLEXREGION;
	}
	int OffsetRgn(int x, int y) {
		for (CRect &rect : m_rectangles) rect.OffsetRect(x, y);
		return m_rectangles.empty()
			? NULLREGION
			: (m_rectangles.size() == 1 ? SIMPLEREGION : COMPLEXREGION);
	}
	BOOL RectInRegion(const RECT *candidate) const {
		if (candidate == nullptr) return FALSE;
		for (const CRect &rect : m_rectangles) {
			if (candidate->right > rect.left && candidate->left < rect.right &&
				candidate->bottom > rect.top && candidate->top < rect.bottom) {
				return TRUE;
			}
		}
		return FALSE;
	}

private:
	std::vector<CRect> m_rectangles;
};

class CScrollBar;
class CImageList;

class CWnd : public browser_mfc::MessageTarget {
public:
	CWnd() = default;
	explicit CWnd(browser_mfc::WindowId id) : m_windowId(id) {
		m_hWnd = reinterpret_cast<HWND>(static_cast<std::uintptr_t>(id));
		browser_mfc::registerWindowObject(id, this);
	}
	virtual ~CWnd() {
		browser_mfc::unregisterWindowObject(m_windowId, this);
	}

	CWnd *GetDlgItem(int controlId);
	void GetWindowText(CString &value) const;
	int GetWindowText(char *buffer, int maximum) const;
	void SetWindowText(LPCTSTR value);
	CWnd *SetFocus();
	CWnd *GetParent() const { return m_parentWindow; }
	void ScreenToClient(RECT *rect) const;
	void ScreenToClient(POINT *point) const;
	void ClientToScreen(RECT *rect) const;
	void ClientToScreen(POINT *point) const;
	static CWnd *GetDesktopWindow();
	static CWnd wndTopMost;
	browser_mfc::WindowId browserWindowId() const { return m_windowId; }
	UINT browserControlId() const { return m_controlId; }
	HWND GetSafeHwnd() const { return m_hWnd; }
	BOOL SubclassWindow(HWND window) {
		const auto id = static_cast<browser_mfc::WindowId>(
			reinterpret_cast<std::uintptr_t>(window));
		CWnd *existing = browser_mfc::findWindowObject(id);
		if (id == 0 || existing == nullptr) return FALSE;
		attachBrowserWindow(id, existing->GetParent(), existing->browserControlId());
		return TRUE;
	}

	virtual BOOL OnCmdMsg(
		UINT commandId,
		int notificationCode,
		void *extra,
		AFX_CMDHANDLERINFO *handlerInfo) {
		browser_mfc::Message message;
		message.kind = notificationCode == CN_UPDATE_COMMAND_UI
			? browser_mfc::MessageKind::CommandUpdate
			: browser_mfc::MessageKind::Command;
		message.id = commandId;
		message.notification = static_cast<UINT>(notificationCode);
		message.payload = extra;
		if (handlerInfo != nullptr) {
			return browserCanDispatchMessage(message) ? TRUE : FALSE;
		}
		return browserDispatchMessage(message) ? TRUE : FALSE;
	}
	virtual BOOL OnCommand(WPARAM wParam, LPARAM lParam);
	virtual BOOL OnNotify(WPARAM, LPARAM, LRESULT *);
	virtual LRESULT WindowProc(UINT message, WPARAM wParam, LPARAM lParam);
	virtual void OnHScroll(UINT, UINT, CScrollBar *) {}
	virtual void OnVScroll(UINT, UINT, CScrollBar *) {}
	virtual void OnCancelMode() {}
	virtual void OnDestroy() {}
	virtual void OnTimer(UINT) {}
	virtual void OnMove(int, int) {}
	virtual void OnShowWindow(BOOL, UINT) {}
	virtual void OnMouseMove(UINT, CPoint) {}
	virtual void OnLButtonUp(UINT, CPoint) {}
	virtual void OnLButtonDown(UINT, CPoint) {}
	virtual void OnPaint() {}
	virtual int OnCreate(LPCREATESTRUCT) { return 0; }
	virtual void OnSize(UINT, int, int) {}
	virtual BOOL OnSetCursor(CWnd *, UINT, UINT) { return FALSE; }
	virtual void OnKeyDown(UINT, UINT, UINT) {}
	virtual void OnClose() { DestroyWindow(); }
	virtual void PostNcDestroy() {}
	CWnd *SetCapture() {
		return browser_mfc::findWindowObject(
			browser_mfc::host().setCapture(browserWindowId()));
	}
	static CWnd *GetCapture() {
		return browser_mfc::findWindowObject(
			browser_mfc::host().capturedWindow());
	}
	BOOL ReleaseCapture() {
		return browser_mfc::host().releaseCapture() ? TRUE : FALSE;
	}
	virtual BOOL ShowWindow(int command);
	virtual BOOL IsWindowVisible() const {
		return browser_mfc::host().isWindowVisible(browserWindowId()) ? TRUE : FALSE;
	}
	virtual BOOL IsIconic() const {
		return browser_mfc::host().isWindowMinimized(browserWindowId()) ? TRUE : FALSE;
	}
	virtual void UpdateWindow() {
		if (browser_mfc::host().redrawWindow(
				browserWindowId(), nullptr, RDW_UPDATENOW)) {
			WindowProc(WM_PAINT, 0, 0);
		}
	}
	virtual BOOL EnableWindow(BOOL enabled = TRUE);
	virtual BOOL IsWindowEnabled() const {
		return browser_mfc::host().isEnabled(browserWindowId()) ? TRUE : FALSE;
	}
	virtual void Invalidate(BOOL erase = TRUE) {
		browser_mfc::host().redrawWindow(
			browserWindowId(), nullptr, RDW_INVALIDATE | (erase ? RDW_ERASE : 0));
	}
	virtual void InvalidateRect(const RECT *rect, BOOL erase = TRUE) {
		const CRect update = rect ? CRect(*rect) : CRect();
		browser_mfc::host().redrawWindow(
			browserWindowId(),
			rect ? &update : nullptr,
			RDW_INVALIDATE | (erase ? RDW_ERASE : 0));
	}
	virtual BOOL RedrawWindow(
		const RECT *rect = nullptr,
		CRgn * = nullptr,
		UINT flags = RDW_INVALIDATE | RDW_UPDATENOW | RDW_ERASE) {
		const CRect update = rect ? CRect(*rect) : CRect();
		const bool shouldPaint = browser_mfc::host().redrawWindow(
			browserWindowId(), rect ? &update : nullptr, flags);
		if (shouldPaint && (flags & RDW_UPDATENOW) != 0) {
			WindowProc(WM_PAINT, 0, 0);
		}
		return shouldPaint ? TRUE : FALSE;
	}
	virtual int GetUpdateRgn(CRgn *region, BOOL = FALSE) const {
		if (region == nullptr) return 0;
		CRect update;
		if (!browser_mfc::host().updateRect(browserWindowId(), update)) {
			region->browserSetRect(CRect());
			return NULLREGION;
		}
		region->browserSetRect(update);
		return SIMPLEREGION;
	}
	virtual BOOL SetScrollRange(
		int scrollBar,
		int minimum,
		int maximum,
		BOOL redraw = TRUE) {
		browser_mfc::host().setScrollRange(
			browserWindowId(), scrollBar, minimum, maximum, redraw != FALSE);
		return TRUE;
	}
	virtual int SetScrollPos(int scrollBar, int position, BOOL redraw = TRUE) {
		return browser_mfc::host().setScrollPosition(
			browserWindowId(), scrollBar, position, redraw != FALSE);
	}
	virtual BOOL ScrollWindow(
		int deltaX,
		int deltaY,
		const RECT * = nullptr,
		const RECT * = nullptr) {
		browser_mfc::host().scrollWindow(browserWindowId(), deltaX, deltaY);
		return TRUE;
	}
	CDC *GetDC();
	int ReleaseDC(CDC *deviceContext);
	virtual BOOL Create(UINT, CWnd * = nullptr) { browser_mfc::failUnsupported("CWnd::Create"); }
	virtual BOOL Create(
		LPCTSTR className,
		LPCTSTR windowName,
		DWORD style,
		const RECT &rect,
		CWnd *parent,
		UINT controlId,
		CCreateContext * = nullptr) {
		if (parent == nullptr) return FALSE;
		attachBrowserWindow(
			browser_mfc::host().createWindow(
				className ? className : "",
				windowName ? windowName : "",
				style,
				CRect(rect),
				parent->browserWindowId(),
				controlId),
			parent,
			controlId);
		return browserWindowId() != 0 ? TRUE : FALSE;
	}
	virtual BOOL CreateEx(
		DWORD extendedStyle,
		LPCTSTR className,
		LPCTSTR windowName,
		DWORD style,
		int x,
		int y,
		int width,
		int height,
		HWND parentWindow,
		HMENU menuOrControlId,
		LPVOID = nullptr) {
		const auto parentId = static_cast<browser_mfc::WindowId>(
			reinterpret_cast<std::uintptr_t>(parentWindow));
		CWnd *parent = browser_mfc::findWindowObject(parentId);
		const auto item = reinterpret_cast<std::uintptr_t>(menuOrControlId);
		attachBrowserWindow(
			browser_mfc::host().createWindowEx(
				extendedStyle,
				className ? className : "",
				windowName ? windowName : "",
				style,
				CRect(x, y, x + width, y + height),
				parentId,
				item),
			parent,
			static_cast<UINT>(item));
		return browserWindowId() != 0 ? TRUE : FALSE;
	}
	virtual BOOL DestroyWindow();
	virtual LRESULT SendMessage(
		UINT message,
		WPARAM wParam = 0,
		LPARAM lParam = 0) {
		return WindowProc(message, wParam, lParam);
	}
	virtual BOOL PostMessage(UINT message, WPARAM wParam = 0, LPARAM lParam = 0) {
		browser_mfc::postMessage(*this, browserWindowId(), message, wParam, lParam);
		return TRUE;
	}
	virtual void GetClientRect(RECT *rect) const;
	virtual void GetWindowRect(RECT *rect) const;
	virtual DWORD GetStyle() const {
		return browser_mfc::host().windowStyle(browserWindowId());
	}
	virtual void MoveWindow(int x, int y, int width, int height, BOOL repaint = TRUE) {
		browser_mfc::host().setWindowPosition(
			browserWindowId(), 0, x, y, width, height, repaint ? 0 : SWP_NOREDRAW);
	}
	virtual void SetWindowPos(
		CWnd *insertAfter,
		int x,
		int y,
		int width,
		int height,
		UINT flags) {
		browser_mfc::host().setWindowPosition(
			browserWindowId(),
			insertAfter ? insertAfter->browserWindowId() : 0,
			x,
			y,
			width,
			height,
			flags);
	}
	virtual UINT SetTimer(UINT eventId, UINT milliseconds, void *) {
		return browser_mfc::host().setTimer(
			browserWindowId(), eventId, milliseconds);
	}
	virtual BOOL KillTimer(UINT eventId) {
		return browser_mfc::host().killTimer(browserWindowId(), eventId)
			? TRUE
			: FALSE;
	}
	virtual int MessageBox(LPCTSTR text, LPCTSTR = nullptr, UINT type = 0);

	HWND m_hWnd = nullptr;

protected:
	void attachBrowserWindow(
		browser_mfc::WindowId id,
		CWnd *parent = nullptr,
		UINT controlId = 0) {
		browser_mfc::unregisterWindowObject(m_windowId, this);
		m_windowId = id;
		m_parentWindow = parent;
		m_controlId = controlId;
		m_hWnd = reinterpret_cast<HWND>(static_cast<std::uintptr_t>(id));
		browser_mfc::registerWindowObject(id, this);
		if (parent != nullptr && controlId != 0) {
			parent->registerBrowserChild(controlId, this);
		}
	}

private:
	void registerBrowserChild(UINT controlId, CWnd *child) {
		m_childObjects[static_cast<int>(controlId)] = child;
	}
	browser_mfc::WindowId m_windowId = 0;
	CWnd *m_parentWindow = nullptr;
	UINT m_controlId = 0;
	std::unordered_map<int, CWnd *> m_childObjects;
	std::vector<std::unique_ptr<CWnd>> m_ownedChildren;
};

class CDialog : public CWnd {
public:
	CDialog(UINT resourceId = 0, CWnd *parent = nullptr);
	~CDialog() override;
	BOOL Create(UINT resourceId, CWnd *parent = nullptr) override;
	BOOL OnCommand(WPARAM wParam, LPARAM lParam) override;
	virtual void DoDataExchange(CDataExchange *) {}
	virtual BOOL OnInitDialog() { return TRUE; }
	virtual void OnOK();
	virtual void OnCancel();
	void OnClose() override { OnCancel(); }
	virtual INT_PTR DoModal();
	int modalResult() const { return m_modalResult; }
	UINT browserResourceId() const { return m_resourceId; }

protected:
	UINT m_resourceId = 0;
	CWnd *m_parent = nullptr;
	int m_modalResult = 0;
};

class CButton : public CWnd {
public:
	BOOL Create(
		LPCTSTR caption,
		DWORD style,
		const RECT &rect,
		CWnd *parent,
		UINT controlId) {
		if (parent == nullptr) return FALSE;
		attachBrowserWindow(browser_mfc::host().createControl(
			browser_mfc::ControlKind::Button,
			parent->browserWindowId(),
			controlId,
			CRect(rect),
			style), parent, controlId);
		SetWindowText(caption ? caption : "");
		return TRUE;
	}
	int GetCheck() const {
		return browser_mfc::host().checkState(browserWindowId());
	}
	UINT GetState() const {
		return browser_mfc::host().buttonState(browserWindowId());
	}
	void SetCheck(int state) {
		browser_mfc::host().setCheckState(browserWindowId(), state);
	}
};
class CEdit : public CWnd {
public:
	using CWnd::CWnd;
	void SetSel(int start, int end, BOOL = FALSE) {
		browser_mfc::host().setTextSelection(
			browserWindowId(),
			CHARRANGE{static_cast<LONG>(start), static_cast<LONG>(end)});
	}
};
class CRichEditCtrl : public CEdit {
public:
	BOOL Create(DWORD style, const RECT &rect, CWnd *parent, UINT controlId) {
		if (parent == nullptr) return FALSE;
		attachBrowserWindow(browser_mfc::host().createControl(
			browser_mfc::ControlKind::RichEdit,
			parent->browserWindowId(),
			controlId,
			CRect(rect),
			style), parent, controlId);
		return TRUE;
	}
	DWORD GetEventMask() const {
		return browser_mfc::host().richEditEventMask(browserWindowId());
	}
	DWORD SetEventMask(DWORD mask) {
		const DWORD previous = GetEventMask();
		browser_mfc::host().setRichEditEventMask(browserWindowId(), mask);
		return previous;
	}
	void GetSel(long &start, long &end) const {
		const CHARRANGE selection = browser_mfc::host().textSelection(browserWindowId());
		start = selection.cpMin;
		end = selection.cpMax;
	}
	void GetSel(CHARRANGE &selection) const {
		selection = browser_mfc::host().textSelection(browserWindowId());
	}
	BOOL SetDefaultCharFormat(const CHARFORMAT &format) {
		return browser_mfc::host().setRichEditDefaultFormat(
			browserWindowId(),
			browser_mfc::normalizeRichTextFormat(format)) ? TRUE : FALSE;
	}
	BOOL SetDefaultCharFormat(const CHARFORMAT2 &format) {
		return browser_mfc::host().setRichEditDefaultFormat(
			browserWindowId(),
			browser_mfc::normalizeRichTextFormat(format)) ? TRUE : FALSE;
	}
	BOOL SetSelectionCharFormat(const CHARFORMAT &format) {
		return browser_mfc::host().setRichEditSelectionFormat(
			browserWindowId(),
			browser_mfc::normalizeRichTextFormat(format)) ? TRUE : FALSE;
	}
	BOOL SetSelectionCharFormat(const CHARFORMAT2 &format) {
		return browser_mfc::host().setRichEditSelectionFormat(
			browserWindowId(),
			browser_mfc::normalizeRichTextFormat(format)) ? TRUE : FALSE;
	}
};
class CStatic : public CWnd {};
class CComboBox : public CWnd {
public:
	void Clear() { WindowProc(WM_CLEAR, 0, 0); }
	int AddString(LPCTSTR value) {
		return browser_mfc::host().addItem(browserWindowId(), value ? value : "");
	}
	int InsertString(int index, LPCTSTR value) {
		return browser_mfc::host().insertItem(browserWindowId(), index, value ? value : "");
	}
	int DeleteString(int index) {
		return browser_mfc::host().deleteItem(browserWindowId(), index);
	}
	void ResetContent() {
		browser_mfc::host().resetItems(browserWindowId());
	}
	int GetCount() const {
		return browser_mfc::host().itemCount(browserWindowId());
	}
	int GetCurSel() const {
		return browser_mfc::host().selectedItem(browserWindowId());
	}
	int SetCurSel(int index) {
		return browser_mfc::host().setSelectedItem(browserWindowId(), index);
	}
	void GetLBText(int index, CString &value) const {
		value = browser_mfc::host().itemText(browserWindowId(), index);
	}
	int FindStringExact(int startAfter, LPCTSTR value) const {
		return browser_mfc::host().findItem(
			browserWindowId(), startAfter, value ? value : "", true);
	}
	int FindString(int startAfter, LPCTSTR value) const {
		return browser_mfc::host().findItem(
			browserWindowId(), startAfter, value ? value : "", false);
	}
	int SelectString(int startAfter, LPCTSTR value) {
		const int index = browser_mfc::host().findItem(
			browserWindowId(), startAfter, value ? value : "", false);
		return index < 0 ? index : SetCurSel(index);
	}
};
class CListBox : public CComboBox {
public:
	void SetHorizontalExtent(int pixels) {
		browser_mfc::host().setHorizontalExtent(browserWindowId(), pixels);
	}
	void GetText(int index, CString &value) const {
		GetLBText(index, value);
	}
	int GetText(int index, char *value) const {
		if (value == nullptr) return LB_ERR;
		const std::string text = browser_mfc::host().itemText(browserWindowId(), index);
		std::memcpy(value, text.c_str(), text.size() + 1);
		return static_cast<int>(text.size());
	}
	int GetSel(int index) const {
		return browser_mfc::host().itemSelected(browserWindowId(), index);
	}
	int SetSel(int index, BOOL selected = TRUE) {
		return browser_mfc::host().setItemSelected(
			browserWindowId(), index, selected != FALSE);
	}
	DWORD_PTR GetItemData(int index) const {
		return browser_mfc::host().itemData(browserWindowId(), index);
	}
	int SetItemData(int index, DWORD_PTR value) {
		return browser_mfc::host().setItemData(browserWindowId(), index, value);
	}
};
class CListCtrl : public CWnd {
public:
	int InsertColumn(
		int index,
		LPCTSTR heading,
		int format = LVCFMT_LEFT,
		int width = -1,
		int subItem = -1) {
		return browser_mfc::host().insertListColumn(
			browserWindowId(),
			index,
			heading ? heading : "",
			format,
			width,
			subItem);
	}
	BOOL DeleteAllItems() {
		browser_mfc::host().resetItems(browserWindowId());
		return TRUE;
	}
	int InsertItem(
		UINT mask,
		int item,
		LPCTSTR text,
		UINT,
		UINT,
		int,
		LPARAM parameter) {
		if ((mask & LVIF_TEXT) == 0) {
			browser_mfc::failUnsupported(
				"CListCtrl::InsertItem without LVIF_TEXT");
		}
		const int inserted = browser_mfc::host().insertItem(
			browserWindowId(), item, text ? text : "");
		if (parameter != 0) {
			browser_mfc::host().setItemData(
				browserWindowId(), inserted, static_cast<DWORD_PTR>(parameter));
		}
		return inserted;
	}
	BOOL SetItemText(int item, int subItem, LPCTSTR value) {
		return browser_mfc::host().setListItemText(
			browserWindowId(), item, subItem, value ? value : "") ? TRUE : FALSE;
	}
	BOOL SetItemState(int item, UINT state, UINT mask) {
		if ((mask & LVIS_SELECTED) == 0) return TRUE;
		return browser_mfc::host().setItemSelected(
			browserWindowId(), item, (state & LVIS_SELECTED) != 0) == LB_ERR
				? FALSE
				: TRUE;
	}
	int GetNextItem(int start, int flags) const {
		const int count = browser_mfc::host().itemCount(browserWindowId());
		for (int index = start + 1; index < count; ++index) {
			if ((flags & LVNI_SELECTED) == 0 ||
				browser_mfc::host().itemSelected(browserWindowId(), index) > 0) {
				return index;
			}
		}
		return -1;
	}
	DWORD_PTR GetItemData(int item) const {
		return browser_mfc::host().itemData(browserWindowId(), item);
	}
	BOOL SetItemData(int item, DWORD_PTR value) {
		return browser_mfc::host().setItemData(
			browserWindowId(), item, value) == LB_ERR ? FALSE : TRUE;
	}
	BOOL EnsureVisible(int item, BOOL partialOk) {
		return browser_mfc::host().ensureListItemVisible(
			browserWindowId(), item, partialOk != FALSE) ? TRUE : FALSE;
	}
};
class CTreeCtrl : public CWnd {
public:
	BOOL Create(DWORD style, const RECT &rect, CWnd *parent, UINT controlId) {
		if (parent == nullptr) return FALSE;
		attachBrowserWindow(browser_mfc::host().createControl(
			browser_mfc::ControlKind::TreeControl,
			parent->browserWindowId(),
			controlId,
			CRect(rect),
			style), parent, controlId);
		return TRUE;
	}
	HTREEITEM InsertItem(TVINSERTSTRUCT *insert) {
		if (insert == nullptr) return nullptr;
		const TVITEM &item = insert->item;
		return browser_mfc::host().insertTreeItem(
			browserWindowId(),
			insert->hParent,
			insert->hInsertAfter,
			(item.mask & TVIF_TEXT) != 0 && item.pszText != nullptr ? item.pszText : "",
			(item.mask & TVIF_PARAM) != 0 ? item.lParam : 0,
			(item.mask & TVIF_STATE) != 0 ? item.state : 0,
			(item.mask & TVIF_IMAGE) != 0 ? item.iImage : 0,
			(item.mask & TVIF_SELECTEDIMAGE) != 0 ? item.iSelectedImage : 0);
	}
	HTREEITEM InsertItem(
		LPCTSTR text,
		int image = 0,
		int selectedImage = 0,
		HTREEITEM parent = TVI_ROOT,
		HTREEITEM insertAfter = TVI_LAST) {
		return browser_mfc::host().insertTreeItem(
			browserWindowId(),
			parent,
			insertAfter,
			text ? text : "",
			0,
			0,
			image,
			selectedImage);
	}
	BOOL GetItem(TVITEM *item) const {
		if (item == nullptr) return FALSE;
		std::string text;
		LPARAM parameter = 0;
		UINT state = 0;
		int image = 0;
		int selectedImage = 0;
		int childCount = 0;
		if (!browser_mfc::host().readTreeItem(
				browserWindowId(),
				item->hItem,
				text,
				parameter,
				state,
				image,
				selectedImage,
				childCount)) {
			return FALSE;
		}
		if ((item->mask & TVIF_TEXT) != 0 && item->pszText != nullptr && item->cchTextMax > 0) {
			const std::size_t count = (std::min)(
				text.size(),
				static_cast<std::size_t>(item->cchTextMax - 1));
			std::memcpy(item->pszText, text.data(), count);
			item->pszText[count] = '\0';
		}
		if ((item->mask & TVIF_PARAM) != 0) item->lParam = parameter;
		if ((item->mask & TVIF_STATE) != 0) item->state = state;
		if ((item->mask & TVIF_IMAGE) != 0) item->iImage = image;
		if ((item->mask & TVIF_SELECTEDIMAGE) != 0) item->iSelectedImage = selectedImage;
		if ((item->mask & TVIF_CHILDREN) != 0) item->cChildren = childCount;
		return TRUE;
	}
	BOOL SetItem(TVITEM *item) {
		if (item == nullptr) return FALSE;
		return browser_mfc::host().writeTreeItem(
			browserWindowId(),
			item->hItem,
			item->mask,
			item->pszText ? item->pszText : "",
			item->lParam,
			item->state,
			item->stateMask,
			item->iImage,
			item->iSelectedImage) ? TRUE : FALSE;
	}
	HTREEITEM GetRootItem() const {
		return GetChildItem(TVI_ROOT);
	}
	HTREEITEM GetChildItem(HTREEITEM parent) const {
		return browser_mfc::host().firstTreeChild(browserWindowId(), parent);
	}
	HTREEITEM GetNextSiblingItem(HTREEITEM item) const {
		return browser_mfc::host().nextTreeSibling(browserWindowId(), item);
	}
	HTREEITEM GetParentItem(HTREEITEM item) const {
		return browser_mfc::host().parentTreeItem(browserWindowId(), item);
	}
	HTREEITEM GetSelectedItem() const {
		return browser_mfc::host().selectedTreeItem(browserWindowId());
	}
	BOOL SelectItem(HTREEITEM item) {
		return browser_mfc::host().selectTreeItem(browserWindowId(), item) ? TRUE : FALSE;
	}
	BOOL SelectDropTarget(HTREEITEM item) {
		return browser_mfc::host().selectTreeDropTarget(
			browserWindowId(), item) ? TRUE : FALSE;
	}
	BOOL Select(HTREEITEM item, UINT code) {
		if (code == TVGN_FIRSTVISIBLE) {
			return browser_mfc::host().setTreeFirstVisibleItem(
				browserWindowId(), item) ? TRUE : FALSE;
		}
		browser_mfc::failUnsupported("CTreeCtrl::Select selection code");
	}
	BOOL DeleteItem(HTREEITEM item) {
		return browser_mfc::host().deleteTreeItem(browserWindowId(), item) ? TRUE : FALSE;
	}
	BOOL DeleteAllItems() {
		browser_mfc::host().deleteAllTreeItems(browserWindowId());
		return TRUE;
	}
	BOOL ItemHasChildren(HTREEITEM item) const {
		return GetChildItem(item) != nullptr ? TRUE : FALSE;
	}
	CString GetItemText(HTREEITEM item) const {
		TVITEM data;
		char buffer[1024] = {};
		data.mask = TVIF_TEXT;
		data.hItem = item;
		data.pszText = buffer;
		data.cchTextMax = static_cast<int>(sizeof(buffer));
		return GetItem(&data) ? CString(buffer) : CString();
	}
	BOOL SetItemText(HTREEITEM item, LPCTSTR text) {
		TVITEM data;
		data.mask = TVIF_TEXT;
		data.hItem = item;
		data.pszText = const_cast<char *>(text ? text : "");
		return SetItem(&data);
	}
	BOOL SetItemImage(HTREEITEM item, int image, int selectedImage) {
		TVITEM data;
		data.mask = TVIF_IMAGE | TVIF_SELECTEDIMAGE;
		data.hItem = item;
		data.iImage = image;
		data.iSelectedImage = selectedImage;
		return SetItem(&data);
	}
	DWORD_PTR GetItemData(HTREEITEM item) const {
		TVITEM data;
		data.mask = TVIF_PARAM;
		data.hItem = item;
		return GetItem(&data) ? static_cast<DWORD_PTR>(data.lParam) : 0;
	}
	BOOL SetItemData(HTREEITEM item, DWORD_PTR parameter) {
		TVITEM data;
		data.mask = TVIF_PARAM;
		data.hItem = item;
		data.lParam = static_cast<LPARAM>(parameter);
		return SetItem(&data);
	}
	BOOL SetItemState(HTREEITEM item, UINT state, UINT stateMask) {
		TVITEM data;
		data.mask = TVIF_STATE;
		data.hItem = item;
		data.state = state;
		data.stateMask = stateMask;
		return SetItem(&data);
	}
	BOOL Expand(HTREEITEM item, UINT code) {
		TVITEM data;
		data.mask = TVIF_STATE;
		data.hItem = item;
		if (!GetItem(&data)) return FALSE;
		UINT state = data.state;
		if (code == TVE_TOGGLE) {
			state ^= TVIS_EXPANDED;
		} else if (code == TVE_EXPAND) {
			state |= TVIS_EXPANDED | TVIS_EXPANDEDONCE;
		} else {
			state &= ~TVIS_EXPANDED;
		}
		return SetItemState(item, state, TVIS_EXPANDED | TVIS_EXPANDEDONCE);
	}
	HTREEITEM HitTest(CPoint point, UINT *flags = nullptr) const {
		UINT resultFlags = 0;
		const HTREEITEM result = browser_mfc::host().hitTestTreeItem(
			browserWindowId(), point, resultFlags);
		if (flags != nullptr) *flags = resultFlags;
		return result;
	}
	HTREEITEM HitTest(TVHITTESTINFO *hitTest) const {
		if (hitTest == nullptr) return nullptr;
		hitTest->hItem = browser_mfc::host().hitTestTreeItem(
			browserWindowId(), CPoint(hitTest->pt), hitTest->flags);
		return hitTest->hItem;
	}
	CEdit *EditLabel(HTREEITEM item) {
		const browser_mfc::WindowId editor =
			browser_mfc::host().beginTreeLabelEdit(browserWindowId(), item);
		if (editor == 0) return nullptr;
		m_labelEditor = std::make_unique<CEdit>(editor);
		return m_labelEditor.get();
	}
	CImageList *SetImageList(CImageList *images, int listType);

private:
	std::unique_ptr<CEdit> m_labelEditor;
	CImageList *m_imageList = nullptr;
};
class CSliderCtrl : public CWnd {
public:
	BOOL Create(DWORD style, const RECT &rect, CWnd *parent, UINT controlId) {
		if (parent == nullptr) return FALSE;
		attachBrowserWindow(browser_mfc::host().createControl(
			browser_mfc::ControlKind::Slider,
			parent->browserWindowId(),
			controlId,
			CRect(rect),
			style), parent, controlId);
		return TRUE;
	}
	void SetRange(int minimum, int maximum, BOOL = TRUE) {
		browser_mfc::host().setControlRange(browserWindowId(), minimum, maximum);
	}
	void SetTicFreq(int frequency) {
		browser_mfc::host().setControlTickFrequency(browserWindowId(), frequency);
	}
	int GetPos() const {
		return browser_mfc::host().controlPosition(browserWindowId());
	}
	int SetPos(int position) {
		return browser_mfc::host().setControlPosition(browserWindowId(), position);
	}
};
class CScrollBar : public CWnd {};
class CProgressCtrl : public CWnd {
public:
	int SetPos(int position) {
		return browser_mfc::host().setControlPosition(browserWindowId(), position);
	}
};
class CImageList : public CObject {
public:
	BOOL Create(
		int width,
		int height,
		UINT flags,
		int initialCount,
		int growCount) {
		m_imageListId = browser_mfc::host().createImageList(
			width, height, flags, initialCount, growCount);
		return m_imageListId != 0 ? TRUE : FALSE;
	}
	BOOL Create(
		UINT bitmapResourceId,
		int cellWidth,
		int growCount,
		COLORREF transparentColor) {
		m_imageListId = browser_mfc::host().createImageListFromBitmap(
			bitmapResourceId, cellWidth, growCount, transparentColor);
		return m_imageListId != 0 ? TRUE : FALSE;
	}
	int Add(HICON icon) {
		return browser_mfc::host().addImageListIcon(m_imageListId, icon);
	}
	browser_mfc::ImageListId browserImageListId() const { return m_imageListId; }

private:
	browser_mfc::ImageListId m_imageListId = 0;
};

inline CImageList *CTreeCtrl::SetImageList(CImageList *images, int listType)
{
	CImageList *previous = m_imageList;
	browser_mfc::host().setTreeImageList(
		browserWindowId(),
		images ? images->browserImageListId() : 0,
		listType);
	m_imageList = images;
	return previous;
}
class CMenu : public CObject {
public:
	CMenu() = default;
	~CMenu() override { release(); }
	CMenu(const CMenu &) = delete;
	CMenu &operator=(const CMenu &) = delete;

	BOOL LoadMenu(UINT resourceId) {
		release();
		m_menuId = browser_mfc::host().loadMenuResource(resourceId);
		m_ownsMenu = m_menuId != 0;
		return m_menuId != 0 ? TRUE : FALSE;
	}
	CMenu *GetSubMenu(int position) {
		if (m_menuId == 0) return nullptr;
		const browser_mfc::MenuId child =
			browser_mfc::host().submenu(m_menuId, position);
		if (child == 0) return nullptr;
		auto cached = m_submenus.find(child);
		if (cached != m_submenus.end()) return cached->second.get();
		auto wrapper = std::unique_ptr<CMenu>(new CMenu(child, false));
		CMenu *result = wrapper.get();
		m_submenus.emplace(child, std::move(wrapper));
		return result;
	}
	BOOL AppendMenu(UINT flags, std::uintptr_t commandOrSubmenu, LPCTSTR text = nullptr) {
		return browser_mfc::host().appendMenuItem(
			m_menuId,
			flags,
			commandOrSubmenu,
			text ? text : "") ? TRUE : FALSE;
	}
	BOOL RemoveMenu(UINT item, UINT flags) {
		return browser_mfc::host().removeMenuItem(m_menuId, item, flags) ? TRUE : FALSE;
	}
	UINT EnableMenuItem(UINT item, UINT flags) {
		return static_cast<UINT>(
			browser_mfc::host().enableMenuItem(m_menuId, item, flags));
	}
	UINT CheckMenuItem(UINT item, UINT flags) {
		return static_cast<UINT>(
			browser_mfc::host().checkMenuItem(m_menuId, item, flags));
	}
	BOOL TrackPopupMenu(UINT flags, int x, int y, CWnd *owner) {
		if (owner == nullptr) return FALSE;
		const UINT command = browser_mfc::host().trackPopupMenu(
			m_menuId, flags, x, y, owner->browserWindowId());
		if (command == 0) return FALSE;
		if ((flags & TPM_RETURNCMD) != 0) {
			return static_cast<BOOL>(command);
		}
		owner->WindowProc(WM_COMMAND, static_cast<WPARAM>(command), 0);
		return TRUE;
	}
	browser_mfc::MenuId browserMenuId() const { return m_menuId; }

private:
	CMenu(browser_mfc::MenuId menuId, bool ownsMenu) :
		m_menuId(menuId),
		m_ownsMenu(ownsMenu)
	{}
	void release() {
		m_submenus.clear();
		if (m_ownsMenu && m_menuId != 0) {
			browser_mfc::host().destroyMenu(m_menuId);
		}
		m_menuId = 0;
		m_ownsMenu = false;
	}

	browser_mfc::MenuId m_menuId = 0;
	bool m_ownsMenu = false;
	std::unordered_map<browser_mfc::MenuId, std::unique_ptr<CMenu>> m_submenus;
};
class CGdiObject : public CObject {
public:
	enum class Kind { Brush, Pen, Font, Bitmap };
	virtual Kind gdiKind() const = 0;
};
class CBrush : public CGdiObject {
public:
	CBrush() = default;
	explicit CBrush(COLORREF color) { CreateSolidBrush(color); }
	BOOL CreateSolidBrush(COLORREF color) {
		m_color = color;
		m_isNull = false;
		return TRUE;
	}
	BOOL CreateStockObject(int object) {
		if (object != NULL_BRUSH) return FALSE;
		m_isNull = true;
		return TRUE;
	}
	Kind gdiKind() const override { return Kind::Brush; }
	COLORREF color() const { return m_color; }
	bool isNull() const { return m_isNull; }
	operator HBRUSH() { return reinterpret_cast<HBRUSH>(this); }

private:
	COLORREF m_color = 0;
	bool m_isNull = false;
};
class CPen : public CGdiObject {
public:
	CPen() = default;
	CPen(int style, int width, COLORREF color) { CreatePen(style, width, color); }
	BOOL CreatePen(int style, int width, COLORREF color) {
		m_style = style;
		m_width = width;
		m_color = color;
		return TRUE;
	}
	Kind gdiKind() const override { return Kind::Pen; }
	int style() const { return m_style; }
	int width() const { return m_width; }
	COLORREF color() const { return m_color; }

private:
	int m_style = PS_SOLID;
	int m_width = 1;
	COLORREF m_color = 0;
};
class CFont : public CGdiObject {
public:
	BOOL CreateFontIndirect(const LOGFONT *font) {
		if (font == nullptr) return FALSE;
		m_font = *font;
		m_created = true;
		return TRUE;
	}
	Kind gdiKind() const override { return Kind::Font; }
	const LOGFONT &description() const { return m_font; }
	bool isCreated() const { return m_created; }

private:
	LOGFONT m_font;
	bool m_created = false;
};
class CBitmap : public CGdiObject {
public:
	Kind gdiKind() const override { return Kind::Bitmap; }
};
class CDC : public CObject {
public:
	CDC() = default;
	explicit CDC(browser_mfc::WindowId window) :
		m_window(window),
		m_hDC(reinterpret_cast<HDC>(static_cast<std::uintptr_t>(window)))
	{}
	virtual ~CDC() = default;

	CPen *SelectObject(CPen *pen) {
		CPen *previous = m_pen;
		m_pen = pen;
		return previous;
	}
	CBrush *SelectObject(CBrush *brush) {
		CBrush *previous = m_brush;
		m_brush = brush;
		return previous;
	}
	CFont *SelectObject(CFont *font) {
		CFont *previous = m_font;
		m_font = font;
		return previous;
	}
	CBitmap *SelectObject(CBitmap *bitmap) {
		CBitmap *previous = m_bitmap;
		m_bitmap = bitmap;
		return previous;
	}
	CGdiObject *SelectObject(CGdiObject *object) {
		if (object == nullptr) return nullptr;
		switch (object->gdiKind()) {
			case CGdiObject::Kind::Pen:
				return SelectObject(static_cast<CPen *>(object));
			case CGdiObject::Kind::Brush:
				return SelectObject(static_cast<CBrush *>(object));
			case CGdiObject::Kind::Font:
				return SelectObject(static_cast<CFont *>(object));
			case CGdiObject::Kind::Bitmap:
				return SelectObject(static_cast<CBitmap *>(object));
		}
		return nullptr;
	}
	CPoint SetViewportOrg(int x, int y) {
		const CPoint previous = m_viewportOrigin;
		m_viewportOrigin = CPoint(x, y);
		return previous;
	}
	CPoint SetViewportOrg(CPoint point) {
		return SetViewportOrg(point.x, point.y);
	}
	COLORREF SetTextColor(COLORREF color) {
		const COLORREF previous = m_textColor;
		m_textColor = color;
		return previous;
	}
	int SetBkMode(int mode) {
		const int previous = m_backgroundMode;
		m_backgroundMode = mode;
		return previous;
	}
	BOOL TextOut(int x, int y, LPCTSTR text, int count) {
		if (text == nullptr || count < 0) return FALSE;
		const CPoint position = translated(CPoint(x, y));
		const std::string value(text, static_cast<std::size_t>(count));
		const LOGFONT *font = m_font != nullptr && m_font->isCreated()
			? &m_font->description()
			: nullptr;
		return browser_mfc::host().drawText(
			m_window,
			value,
			CRect(position, position),
			DT_LEFT | DT_TOP | DT_SINGLELINE | DT_NOCLIP,
			m_textColor,
			false,
			m_backgroundMode == TRANSPARENT,
			m_backgroundColor,
			font) >= 0 ? TRUE : FALSE;
	}
	void FillRect(const RECT *rect, CBrush *brush) {
		if (rect == nullptr || brush == nullptr || brush->isNull()) return;
		browser_mfc::host().fillRectangle(
			m_window, translated(CRect(*rect)), brush->color());
	}
	void FillSolidRect(const RECT *rect, COLORREF color) {
		if (rect == nullptr) return;
		browser_mfc::host().fillRectangle(
			m_window, translated(CRect(*rect)), color);
	}
	void FrameRect(const RECT *rect, CBrush *brush) {
		if (rect == nullptr || brush == nullptr || brush->isNull()) return;
		const CRect bounds = translated(CRect(*rect));
		const COLORREF color = brush->color();
		browser_mfc::host().drawLine(
			m_window,
			CPoint(bounds.left, bounds.top),
			CPoint(bounds.right, bounds.top),
			PS_SOLID,
			1,
			color);
		browser_mfc::host().drawLine(
			m_window,
			CPoint(bounds.right - 1, bounds.top),
			CPoint(bounds.right - 1, bounds.bottom),
			PS_SOLID,
			1,
			color);
		browser_mfc::host().drawLine(
			m_window,
			CPoint(bounds.right, bounds.bottom - 1),
			CPoint(bounds.left, bounds.bottom - 1),
			PS_SOLID,
			1,
			color);
		browser_mfc::host().drawLine(
			m_window,
			CPoint(bounds.left, bounds.bottom),
			CPoint(bounds.left, bounds.top),
			PS_SOLID,
			1,
			color);
	}
	CPoint MoveTo(int x, int y) {
		const CPoint previous = m_position;
		m_position = CPoint(x, y);
		return previous;
	}
	CPoint MoveTo(CPoint point) { return MoveTo(point.x, point.y); }
	BOOL LineTo(int x, int y) {
		const CPoint destination(x, y);
		const CPen defaultPen;
		const CPen *pen = m_pen == nullptr ? &defaultPen : m_pen;
		if (pen->style() != PS_NULL) {
			browser_mfc::host().drawLine(
				m_window,
				translated(m_position),
				translated(destination),
				pen->style(),
				pen->width(),
				pen->color());
		}
		m_position = destination;
		return TRUE;
	}
	BOOL LineTo(CPoint point) { return LineTo(point.x, point.y); }
	void Rectangle(const RECT *rect) {
		if (rect == nullptr) return;
		if (m_brush != nullptr && !m_brush->isNull()) {
			FillRect(rect, m_brush);
		}
		const CPen defaultPen;
		const CPen *pen = m_pen == nullptr ? &defaultPen : m_pen;
		if (pen->style() == PS_NULL) return;
		const CRect bounds(*rect);
		const CPoint start(bounds.left, bounds.top);
		m_position = start;
		LineTo(bounds.right, bounds.top);
		LineTo(bounds.right, bounds.bottom);
		LineTo(bounds.left, bounds.bottom);
		LineTo(start);
	}
	void Ellipse(const RECT *rect) {
		if (rect == nullptr) return;
		const CPen defaultPen;
		const CPen *pen = m_pen == nullptr ? &defaultPen : m_pen;
		browser_mfc::host().drawEllipse(
			m_window,
			translated(CRect(*rect)),
			pen->style(),
			pen->width(),
			pen->color(),
			m_brush != nullptr && !m_brush->isNull(),
			m_brush == nullptr ? 0 : m_brush->color());
	}
	BOOL Polygon(const POINT *points, int count) {
		if (points == nullptr || count < 2) return FALSE;
		std::vector<CPoint> translatedPoints;
		translatedPoints.reserve(static_cast<std::size_t>(count));
		for (int index = 0; index < count; ++index) {
			translatedPoints.push_back(translated(CPoint(points[index])));
		}
		const CPen defaultPen;
		const CPen *pen = m_pen == nullptr ? &defaultPen : m_pen;
		browser_mfc::host().drawPolygon(
			m_window,
			translatedPoints,
			pen->style(),
			pen->width(),
			pen->color(),
			m_brush != nullptr && !m_brush->isNull(),
			m_brush == nullptr ? 0 : m_brush->color());
		return TRUE;
	}
	void Draw3dRect(
		const RECT *rect,
		COLORREF topLeftColor,
		COLORREF bottomRightColor) {
		if (rect == nullptr) return;
		const CRect bounds = translated(CRect(*rect));
		browser_mfc::host().drawLine(
			m_window,
			CPoint(bounds.left, bounds.bottom - 1),
			CPoint(bounds.left, bounds.top),
			PS_SOLID, 1, topLeftColor);
		browser_mfc::host().drawLine(
			m_window,
			CPoint(bounds.left, bounds.top),
			CPoint(bounds.right - 1, bounds.top),
			PS_SOLID, 1, topLeftColor);
		browser_mfc::host().drawLine(
			m_window,
			CPoint(bounds.right - 1, bounds.top),
			CPoint(bounds.right - 1, bounds.bottom - 1),
			PS_SOLID, 1, bottomRightColor);
		browser_mfc::host().drawLine(
			m_window,
			CPoint(bounds.right - 1, bounds.bottom - 1),
			CPoint(bounds.left, bounds.bottom - 1),
			PS_SOLID, 1, bottomRightColor);
	}
	HDC GetSafeHdc() const { return m_hDC; }

protected:
	CPoint translated(CPoint point) const {
		point.Offset(m_viewportOrigin.x, m_viewportOrigin.y);
		return point;
	}
	CRect translated(CRect rect) const {
		rect.OffsetRect(m_viewportOrigin.x, m_viewportOrigin.y);
		return rect;
	}
	browser_mfc::WindowId m_window = 0;
	CPen *m_pen = nullptr;
	CBrush *m_brush = nullptr;
	CFont *m_font = nullptr;
	CBitmap *m_bitmap = nullptr;
	COLORREF m_textColor = 0;
	COLORREF m_backgroundColor = RGB(255, 255, 255);
	int m_backgroundMode = OPAQUE;
	CPoint m_position;
	CPoint m_viewportOrigin;

public:
	HDC m_hDC = nullptr;
};
class CPaintDC : public CDC {
public:
	explicit CPaintDC(CWnd *window) :
		CDC(window == nullptr ? 0 : window->browserWindowId())
	{
		browser_mfc::host().beginPaint(m_window);
	}
	~CPaintDC() override {
		browser_mfc::host().endPaint(m_window);
	}
};
class CClientDC : public CDC {
public:
	explicit CClientDC(CWnd *window) :
		CDC(window == nullptr ? 0 : window->browserWindowId()) {}
};
class CPrintInfo : public CObject {};
class CArchive;
struct CFileStatus {
	BYTE m_attribute = 0;
	CString m_szFullName;
};
class CFile : public CObject {
public:
	enum OpenFlags : UINT {
		modeRead = 0x0000,
		modeWrite = 0x0001,
		modeReadWrite = 0x0002,
		shareDenyWrite = 0x0020,
		modeCreate = 0x1000,
		modeNoTruncate = 0x2000,
		typeBinary = 0x8000,
	};
	enum Attribute : BYTE {
		normal = 0x00,
		readOnly = 0x01,
		hidden = 0x02,
		system = 0x04,
		volume = 0x08,
		directory = 0x10,
		archive = 0x20,
	};

	CFile() = default;
	CFile(LPCTSTR filename, UINT flags) {
		if (!Open(filename, flags)) {
			throw std::runtime_error(
				std::string("CFile could not open '") +
				(filename ? filename : "") + "': " + std::strerror(errno));
		}
	}
	~CFile() override {
		if (m_file != nullptr) {
			std::fclose(m_file);
			m_file = nullptr;
			if (m_writable) {
				try {
					browser_mfc::host().fileWritten(m_path);
				} catch (...) {
				}
			}
		}
	}
	BOOL Open(LPCTSTR filename, UINT flags) {
		Close();
		if (filename == nullptr || *filename == '\0') return FALSE;
		std::string normalized(filename);
		std::replace(normalized.begin(), normalized.end(), '\\', '/');
		const UINT access = flags & 0x0003;
		const bool create = (flags & modeCreate) != 0;
		const bool noTruncate = (flags & modeNoTruncate) != 0;
		const char *mode = nullptr;
		if (access == modeReadWrite) {
			mode = create && !noTruncate ? "w+b" : "r+b";
		} else if (access == modeWrite) {
			mode = create && !noTruncate ? "wb" : "ab";
		} else {
			mode = "rb";
		}
		m_file = std::fopen(normalized.c_str(), mode);
		if (m_file == nullptr && create && noTruncate) {
			m_file = std::fopen(normalized.c_str(), access == modeReadWrite ? "w+b" : "wb");
		}
		m_path = normalized;
		m_writable = m_file != nullptr && access != modeRead;
		return m_file != nullptr ? TRUE : FALSE;
	}
	void Write(const void *data, UINT bytes) {
		if (m_file == nullptr) throw std::runtime_error("CFile::Write on a closed file");
		if (bytes != 0 && (data == nullptr ||
			std::fwrite(data, 1, bytes, m_file) != bytes)) {
			throw std::runtime_error(
				std::string("CFile::Write failed: ") + std::strerror(errno));
		}
	}
	UINT Read(void *data, UINT bytes) {
		if (m_file == nullptr) throw std::runtime_error("CFile::Read on a closed file");
		if (bytes != 0 && data == nullptr) {
			throw std::invalid_argument("CFile::Read received a null buffer");
		}
		const std::size_t read = std::fread(data, 1, bytes, m_file);
		if (read < bytes && std::ferror(m_file)) {
			throw std::runtime_error(
				std::string("CFile::Read failed: ") + std::strerror(errno));
		}
		return static_cast<UINT>(read);
	}
	void Flush() {
		if (m_file == nullptr) throw std::runtime_error("CFile::Flush on a closed file");
		if (std::fflush(m_file) != 0) {
			throw std::runtime_error(
				std::string("CFile::Flush failed: ") + std::strerror(errno));
		}
	}
	CString GetFilePath() const { return m_path; }
	void Close() {
		if (m_file != nullptr) {
			const bool written = m_writable;
			if (std::fclose(m_file) != 0) {
				m_file = nullptr;
				m_writable = false;
				throw std::runtime_error(
					std::string("CFile::Close failed: ") + std::strerror(errno));
			}
			m_file = nullptr;
			m_writable = false;
			if (written && !browser_mfc::host().fileWritten(m_path)) {
				throw std::runtime_error(
					"CFile::Close could not persist the browser file");
			}
		}
	}

	static BOOL GetStatus(LPCTSTR filename, CFileStatus &status) {
		if (filename == nullptr) return FALSE;
		std::string normalized(filename);
		std::replace(normalized.begin(), normalized.end(), '\\', '/');
		const DWORD attributes = GetFileAttributes(normalized.c_str());
		if (attributes == INVALID_FILE_ATTRIBUTES) return FALSE;
		status.m_attribute = normal;
		if ((attributes & FILE_ATTRIBUTE_READONLY) != 0) {
			status.m_attribute |= readOnly;
		}
		if ((attributes & FILE_ATTRIBUTE_DIRECTORY) != 0) {
			status.m_attribute |= directory;
		}
		status.m_szFullName = normalized;
		return TRUE;
	}
	static void Remove(LPCTSTR filename) {
		if (filename == nullptr || std::remove(filename) != 0) {
			throw std::runtime_error(
				std::string("CFile::Remove failed: ") + std::strerror(errno));
		}
	}
	static void Rename(LPCTSTR oldFilename, LPCTSTR newFilename) {
		if (oldFilename == nullptr || newFilename == nullptr ||
			std::rename(oldFilename, newFilename) != 0) {
			throw std::runtime_error(
				std::string("CFile::Rename failed: ") + std::strerror(errno));
		}
	}

private:
	std::FILE *m_file = nullptr;
	std::string m_path;
	bool m_writable = false;
};
class CArchive : public CObject {
public:
	enum Mode {
		load = 0,
		store = 1,
	};
	CArchive(CFile *file, UINT mode) :
		m_file(file),
		m_storing((mode & store) != 0)
	{
		if (file == nullptr) {
			throw std::invalid_argument("CArchive requires a file");
		}
	}
	void Flush() { m_file->Flush(); }
	BOOL IsStoring() const { return m_storing ? TRUE : FALSE; }
	CFile *GetFile() const { return m_file; }

private:
	CFile *m_file = nullptr;
	bool m_storing = false;
};
class CDocument;
class CFrameWnd;
class CView;
void AfxLoadRecentFileList(UINT maxRecentFiles);
void AfxRememberRecentFile(LPCTSTR path);
int AfxMessageBox(LPCTSTR text, UINT type, UINT helpId);
BOOL AfxRouteAppCommand(
	UINT commandId,
	int notificationCode,
	void *extra,
	AFX_CMDHANDLERINFO *handlerInfo);
class CDocTemplate : public CObject {
public:
	enum DocStringIndex {
		windowTitle,
		docName,
		fileNewName,
		filterName,
		filterExt,
		regFileTypeId,
		regFileTypeName,
	};
	virtual CDocument *OpenDocumentFile(
		LPCTSTR filename,
		CFrameWnd **createdFrame = nullptr) = 0;
	virtual CFrameWnd *CreateNewFrame(
		CDocument *document,
		CFrameWnd *otherFrame) = 0;
	virtual void InitialUpdateFrame(
		CFrameWnd *frame,
		CDocument *document,
		BOOL makeVisible = TRUE) = 0;
	virtual BOOL GetDocString(
		CString &value,
		DocStringIndex index) const = 0;
};
class CSingleDocTemplate : public CDocTemplate {
public:
	CSingleDocTemplate(
		UINT resourceId,
		const CRuntimeClass *documentClass,
		const CRuntimeClass *frameClass,
		const CRuntimeClass *viewClass) :
		m_resourceId(resourceId),
		m_documentClass(documentClass),
		m_frameClass(frameClass),
		m_viewClass(viewClass)
	{}
	CDocument *OpenDocumentFile(
		LPCTSTR filename,
		CFrameWnd **createdFrame = nullptr) override;
	CFrameWnd *CreateNewFrame(
		CDocument *document,
		CFrameWnd *otherFrame) override;
	void InitialUpdateFrame(
		CFrameWnd *frame,
		CDocument *document,
		BOOL makeVisible = TRUE) override;
	BOOL GetDocString(CString &value, DocStringIndex index) const override {
		value = browser_mfc::host().documentString(
			m_resourceId, static_cast<int>(index));
		return value.IsEmpty() ? FALSE : TRUE;
	}

private:
	UINT m_resourceId = 0;
	const CRuntimeClass *m_documentClass = nullptr;
	const CRuntimeClass *m_frameClass = nullptr;
	const CRuntimeClass *m_viewClass = nullptr;
	std::vector<std::unique_ptr<CObject>> m_openObjects;
	CDocument *m_openDocument = nullptr;
	CFrameWnd *m_openFrame = nullptr;
};

class CDocument : public browser_mfc::MessageTarget {
public:
	virtual BOOL OnCmdMsg(
		UINT commandId,
		int notificationCode,
		void *extra,
		AFX_CMDHANDLERINFO *);
	virtual BOOL OnNewDocument() {
		m_strPathName.Empty();
		m_strTitle = "Untitled";
		SetModifiedFlag(FALSE);
		return TRUE;
	}
	virtual void Serialize(CArchive &) {}
	virtual BOOL OnOpenDocument(LPCTSTR filename) {
		if (filename == nullptr || *filename == '\0') return FALSE;
		try {
			CFile file(filename, CFile::modeRead | CFile::typeBinary);
			CArchive archive(&file, CArchive::load);
			Serialize(archive);
			file.Close();
			SetPathName(filename);
			SetModifiedFlag(FALSE);
			return TRUE;
		} catch (...) {
			return FALSE;
		}
	}
	virtual BOOL OnSaveDocument(LPCTSTR filename) {
		if (filename == nullptr || *filename == '\0') return FALSE;
		try {
			CFile file(
				filename,
				CFile::modeCreate | CFile::modeWrite | CFile::typeBinary);
			CArchive archive(&file, CArchive::store);
			Serialize(archive);
			archive.Flush();
			file.Close();
			SetModifiedFlag(FALSE);
			return TRUE;
		} catch (...) {
			return FALSE;
		}
	}
	virtual BOOL CanCloseFrame(class CFrameWnd *) { return TRUE; }
	virtual BOOL DoSave(LPCTSTR, BOOL = TRUE) { return FALSE; }
	virtual BOOL DoFileSave() {
		return DoSave(m_strPathName.IsEmpty() ? nullptr : (LPCTSTR)m_strPathName);
	}
	virtual BOOL SaveModified() {
		if (!IsModified()) return TRUE;
		const int response = AfxMessageBox(
			"Save changes to the current map?",
			MB_YESNOCANCEL | MB_ICONWARNING,
			0);
		if (response == IDCANCEL) return FALSE;
		if (response == IDYES) return DoFileSave();
		return TRUE;
	}
	void SetModifiedFlag(BOOL modified = TRUE) { m_modified = modified != FALSE; }
	BOOL IsModified() const { return m_modified ? TRUE : FALSE; }
	void SetPathName(LPCTSTR path, BOOL addToRecent = TRUE) {
		m_strPathName = path ? path : "";
		std::string normalized = path ? path : "";
		std::replace(normalized.begin(), normalized.end(), '\\', '/');
		const auto slash = normalized.find_last_of('/');
		m_strTitle = slash == std::string::npos
			? normalized
			: normalized.substr(slash + 1);
		if (addToRecent && path != nullptr && *path != '\0') {
			AfxRememberRecentFile(path);
		}
	}
	LPCTSTR GetPathName() const { return m_strPathName; }
	LPCTSTR GetTitle() const { return m_strTitle; }
	POSITION GetFirstViewPosition() const {
		return m_views.empty()
			? nullptr
			: reinterpret_cast<POSITION>(static_cast<std::uintptr_t>(1));
	}
	CView *GetNextView(POSITION &position) const {
		if (position == nullptr) return nullptr;
		const std::size_t index =
			static_cast<std::size_t>(
				reinterpret_cast<std::uintptr_t>(position) - 1);
		if (index >= m_views.size()) {
			position = nullptr;
			return nullptr;
		}
		position = index + 1 < m_views.size()
			? reinterpret_cast<POSITION>(static_cast<std::uintptr_t>(index + 2))
			: nullptr;
		return m_views[index];
	}
	void AddView(CView *view) {
		if (view != nullptr &&
			std::find(m_views.begin(), m_views.end(), view) == m_views.end()) {
			m_views.push_back(view);
		}
	}
	void RemoveView(CView *view) {
		m_views.erase(std::remove(m_views.begin(), m_views.end(), view), m_views.end());
	}
	CDocTemplate *GetDocTemplate() const { return m_documentTemplate; }
	void browserSetDocTemplate(CDocTemplate *documentTemplate) {
		m_documentTemplate = documentTemplate;
	}

protected:
	CString m_strTitle;
	CString m_strPathName;

private:
	bool m_modified = false;
	CDocTemplate *m_documentTemplate = nullptr;
	std::vector<CView *> m_views;
};

class CView : public CWnd {
public:
	virtual void OnDraw(CDC *) {}
	virtual BOOL PreCreateWindow(CREATESTRUCT &) { return TRUE; }
	BOOL DoPreparePrinting(CPrintInfo *) { return TRUE; }
	void OnFilePrint() {
		browser_mfc::host().printWindow(browserWindowId(), false);
	}
	void OnFilePrintPreview() {
		browser_mfc::host().printWindow(browserWindowId(), true);
	}
	virtual BOOL OnPreparePrinting(CPrintInfo *) { return TRUE; }
	virtual void OnBeginPrinting(CDC *, CPrintInfo *) {}
	virtual void OnEndPrinting(CDC *, CPrintInfo *) {}
	virtual void OnInitialUpdate() {}
	CDocument *GetDocument() const { return m_document; }
	void browserSetDocument(CDocument *document) { m_document = document; }
	BOOL browserCreateView(CFrameWnd *parent);
	CFrameWnd *GetParentFrame() const;

private:
	CDocument *m_document = nullptr;
};

class CFrameWnd : public CWnd {
public:
	BOOL OnCmdMsg(
		UINT commandId,
		int notificationCode,
		void *extra,
		AFX_CMDHANDLERINFO *handlerInfo) override {
		if (m_activeView != nullptr &&
			m_activeView->OnCmdMsg(
				commandId, notificationCode, extra, handlerInfo)) {
			return TRUE;
		}
		if (CWnd::OnCmdMsg(
			commandId, notificationCode, extra, handlerInfo)) {
			return TRUE;
		}
		if (m_activeDocument != nullptr &&
			m_activeDocument->OnCmdMsg(
				commandId, notificationCode, extra, handlerInfo)) {
			return TRUE;
		}
		CWnd *bar = commandId == ID_VIEW_TOOLBAR
			? m_toolBar
			: commandId == ID_VIEW_STATUS_BAR ? m_statusBar : nullptr;
		if (bar != nullptr) {
			if (handlerInfo != nullptr) return TRUE;
			if (notificationCode == CN_UPDATE_COMMAND_UI && extra != nullptr) {
				auto *command = static_cast<CCmdUI *>(extra);
				command->Enable(TRUE);
				command->SetCheck(bar->IsWindowVisible());
				return TRUE;
			}
			if (notificationCode == CN_COMMAND) {
				bar->ShowWindow(bar->IsWindowVisible() ? SW_HIDE : SW_SHOW);
				return TRUE;
			}
		}
		return AfxRouteAppCommand(
			commandId, notificationCode, extra, handlerInfo);
	}
	virtual BOOL PreCreateWindow(CREATESTRUCT &) { return TRUE; }
	virtual int OnCreate(LPCREATESTRUCT) { return 0; }
	virtual BOOL LoadFrame(
		UINT resourceId,
		DWORD defaultStyle = WS_OVERLAPPEDWINDOW | FWS_ADDTOTITLE,
		CWnd *parent = nullptr,
		CCreateContext *context = nullptr) {
		CREATESTRUCT create;
		create.style = defaultStyle;
		if (!PreCreateWindow(create)) return FALSE;
		attachBrowserWindow(
			browser_mfc::host().createFrame(
				resourceId,
				create.style,
				parent ? parent->browserWindowId() : 0),
			parent);
		if (browserWindowId() == 0) return FALSE;
		if (OnCreate(&create) == -1) {
			DestroyWindow();
			return FALSE;
		}
		(void)context;
		return TRUE;
	}
	void EnableDocking(DWORD alignment) {
		browser_mfc::host().enableDocking(browserWindowId(), alignment);
	}
	void DockControlBar(CWnd *bar) {
		if (bar == nullptr) return;
		browser_mfc::host().dockControlBar(
			browserWindowId(), bar->browserWindowId());
	}
	void FloatControlBar(CWnd *bar, CPoint position, DWORD alignment) {
		if (bar == nullptr) return;
		browser_mfc::host().floatControlBar(
			browserWindowId(), bar->browserWindowId(), position, alignment);
	}
	void SaveBarState(LPCTSTR profileName) {
		browser_mfc::host().saveBarState(
			browserWindowId(), profileName ? profileName : "");
	}
	void SetMessageText(LPCTSTR message) {
		browser_mfc::host().setFrameMessage(
			browserWindowId(), message ? message : "");
	}
	CDocument *GetActiveDocument() const { return m_activeDocument; }
	void browserSetActiveDocument(CDocument *document) {
		m_activeDocument = document;
	}
	CView *GetActiveView() const { return m_activeView; }
	void browserSetActiveView(CView *view) { m_activeView = view; }
	void browserSetToolBar(CWnd *toolBar) { m_toolBar = toolBar; }
	void browserSetStatusBar(CWnd *statusBar) { m_statusBar = statusBar; }

private:
	CDocument *m_activeDocument = nullptr;
	CView *m_activeView = nullptr;
	CWnd *m_toolBar = nullptr;
	CWnd *m_statusBar = nullptr;
};

inline CFrameWnd *CView::GetParentFrame() const
{
	CWnd *ancestor = GetParent();
	while (ancestor != nullptr) {
		if (auto *frame = dynamic_cast<CFrameWnd *>(ancestor)) return frame;
		ancestor = ancestor->GetParent();
	}
	return nullptr;
}

inline BOOL CView::browserCreateView(CFrameWnd *parent)
{
	if (parent == nullptr) return FALSE;
	CREATESTRUCT create;
	create.style = WS_CHILD | WS_VISIBLE;
	if (!PreCreateWindow(create)) return FALSE;
	CRect rect;
	parent->GetClientRect(&rect);
	attachBrowserWindow(
		browser_mfc::host().createWindow(
			"MFCView",
			"",
			create.style,
			rect,
			parent->browserWindowId(),
			0),
		parent);
	if (browserWindowId() == 0) return FALSE;
	if (OnCreate(&create) == -1) {
		DestroyWindow();
		return FALSE;
	}
	return TRUE;
}

inline CDocument *CSingleDocTemplate::OpenDocumentFile(
	LPCTSTR filename,
	CFrameWnd **createdFrame)
{
	if (m_openDocument != nullptr && m_openFrame != nullptr) {
		if (!m_openDocument->SaveModified()) return nullptr;
		const BOOL opened = filename != nullptr && *filename != '\0'
			? m_openDocument->OnOpenDocument(filename)
			: m_openDocument->OnNewDocument();
		if (!opened) return nullptr;
		InitialUpdateFrame(m_openFrame, m_openDocument, TRUE);
		if (createdFrame != nullptr) *createdFrame = m_openFrame;
		return m_openDocument;
	}
	if (m_documentClass == nullptr || m_documentClass->createObject == nullptr) {
		throw std::runtime_error("CSingleDocTemplate has an incomplete runtime class");
	}
	std::unique_ptr<CObject> documentObject(m_documentClass->createObject());
	auto *document = dynamic_cast<CDocument *>(documentObject.get());
	if (document == nullptr) {
		throw std::runtime_error("CSingleDocTemplate factory returned an incompatible object");
	}
	document->browserSetDocTemplate(this);
	CFrameWnd *frame = CreateNewFrame(document, nullptr);
	if (frame == nullptr) return nullptr;
	if (filename != nullptr && *filename != '\0') {
		if (!document->OnOpenDocument(filename)) return nullptr;
	} else if (!document->OnNewDocument()) {
		return nullptr;
	}
	InitialUpdateFrame(frame, document, TRUE);
	if (createdFrame != nullptr) *createdFrame = frame;
	m_openDocument = document;
	m_openFrame = frame;
	m_openObjects.push_back(std::move(documentObject));
	return document;
}

inline CFrameWnd *CSingleDocTemplate::CreateNewFrame(
	CDocument *document,
	CFrameWnd *)
{
	if (document == nullptr ||
		m_frameClass == nullptr || m_frameClass->createObject == nullptr ||
		m_viewClass == nullptr || m_viewClass->createObject == nullptr) {
		return nullptr;
	}
	std::unique_ptr<CObject> frameObject(m_frameClass->createObject());
	std::unique_ptr<CObject> viewObject(m_viewClass->createObject());
	auto *frame = dynamic_cast<CFrameWnd *>(frameObject.get());
	auto *view = dynamic_cast<CView *>(viewObject.get());
	if (frame == nullptr || view == nullptr) return nullptr;
	CCreateContext context;
	if (!frame->LoadFrame(
			m_resourceId,
			WS_OVERLAPPEDWINDOW | FWS_ADDTOTITLE,
			nullptr,
			&context)) {
		return nullptr;
	}
	if (!view->browserCreateView(frame)) return nullptr;
	view->browserSetDocument(document);
	document->AddView(view);
	frame->browserSetActiveDocument(document);
	frame->browserSetActiveView(view);
	m_openObjects.push_back(std::move(frameObject));
	m_openObjects.push_back(std::move(viewObject));
	return frame;
}

inline void CSingleDocTemplate::InitialUpdateFrame(
	CFrameWnd *frame,
	CDocument *document,
	BOOL makeVisible)
{
	if (frame == nullptr || document == nullptr) return;
	POSITION position = document->GetFirstViewPosition();
	while (position != nullptr) {
		CView *view = document->GetNextView(position);
		if (view != nullptr && view->GetParentFrame() == frame) {
			view->OnInitialUpdate();
		}
	}
	if (makeVisible) {
		frame->ShowWindow(SW_SHOW);
		frame->UpdateWindow();
	}
}

class CMDIChildWnd : public CFrameWnd {};
class CDialogBar : public CWnd {
public:
	BOOL Create(
		CWnd *parent,
		UINT resourceId,
		UINT style,
		UINT controlId) {
		if (parent == nullptr) return FALSE;
		attachBrowserWindow(
			browser_mfc::host().createDialogBar(
				resourceId, style, parent->browserWindowId(), controlId),
			parent,
			controlId);
		return browserWindowId() != 0 ? TRUE : FALSE;
	}
	void EnableDocking(DWORD alignment) {
		browser_mfc::host().enableDocking(browserWindowId(), alignment);
	}
};
class CStatusBar : public CWnd {
public:
	BOOL Create(CWnd *parent) {
		if (parent == nullptr) return FALSE;
		attachBrowserWindow(
			browser_mfc::host().createStatusBar(parent->browserWindowId()),
			parent);
		if (auto *frame = dynamic_cast<CFrameWnd *>(parent)) {
			frame->browserSetStatusBar(this);
		}
		return browserWindowId() != 0 ? TRUE : FALSE;
	}
	BOOL SetIndicators(const UINT *indicators, int count) {
		if (indicators == nullptr || count < 0) return FALSE;
		return browser_mfc::host().setStatusIndicators(
			browserWindowId(),
			std::vector<UINT>(
				indicators,
				indicators + static_cast<std::ptrdiff_t>(count))) ? TRUE : FALSE;
	}
};
class CToolBar : public CWnd {
public:
	BOOL CreateEx(
		CWnd *parent,
		DWORD controlStyle = 0,
		DWORD barStyle = 0) {
		if (parent == nullptr) return FALSE;
		attachBrowserWindow(
			browser_mfc::host().createToolBar(
				parent->browserWindowId(), controlStyle, barStyle),
			parent);
		if (auto *frame = dynamic_cast<CFrameWnd *>(parent)) {
			frame->browserSetToolBar(this);
		}
		return browserWindowId() != 0 ? TRUE : FALSE;
	}
	BOOL LoadToolBar(UINT resourceId) {
		return browser_mfc::host().loadToolBarResource(
			browserWindowId(), resourceId) ? TRUE : FALSE;
	}
	void EnableDocking(DWORD alignment) {
		browser_mfc::host().enableDocking(browserWindowId(), alignment);
	}
};
class CPropertyPage : public CDialog {
public:
	using CDialog::CDialog;
	virtual BOOL OnSetActive() { return TRUE; }
	virtual BOOL OnKillActive() { return TRUE; }
	virtual BOOL OnApply() { return TRUE; }
};
class CPropertySheet : public CWnd {
public:
	CPropertySheet() = default;
	explicit CPropertySheet(LPCTSTR caption, CWnd *parent = nullptr) {
		Construct(caption, parent);
	}
	BOOL Construct(LPCTSTR caption, CWnd *parent = nullptr, UINT = 0) {
		m_caption = caption ? caption : "";
		m_parent = parent;
		return TRUE;
	}
	void AddPage(CPropertyPage *page) {
		if (page == nullptr) {
			throw std::invalid_argument("CPropertySheet::AddPage received a null page");
		}
		m_pages.push_back(page);
	}
	BOOL OnCommand(WPARAM wParam, LPARAM lParam) override;
	INT_PTR DoModal();

private:
	BOOL activatePage(std::size_t pageIndex);
	BOOL applyPages();
	std::string m_caption;
	CWnd *m_parent = nullptr;
	std::vector<CPropertyPage *> m_pages;
	std::size_t m_activePage = 0;
	int m_modalResult = 0;
};
class CColorDialog : public CDialog {
public:
	CColorDialog(
		COLORREF initialColor = 0,
		DWORD flags = 0,
		CWnd *parent = nullptr) :
		CDialog(0, parent),
		m_color(initialColor),
		m_flags(flags)
	{}
	INT_PTR DoModal() override {
		COLORREF chosenColor = m_color;
		m_modalResult = browser_mfc::host().runColorDialog(
			m_color,
			m_flags,
			m_parent == nullptr ? 0 : m_parent->browserWindowId(),
			chosenColor);
		if (m_modalResult == IDOK) m_color = chosenColor;
		return m_modalResult;
	}
	COLORREF GetColor() const { return m_color; }

private:
	COLORREF m_color = 0;
	DWORD m_flags = 0;
};
class CFileDialog : public CDialog {
public:
	CFileDialog(
		BOOL openFileDialog,
		LPCTSTR defaultExtension = nullptr,
		LPCTSTR initialFilename = nullptr,
		DWORD flags = OFN_HIDEREADONLY | OFN_OVERWRITEPROMPT,
		LPCTSTR filter = nullptr,
		CWnd *parent = nullptr) :
		CDialog(0, parent),
		m_openFile(openFileDialog != FALSE),
		m_defaultExtension(defaultExtension ? defaultExtension : ""),
		m_initialFilename(initialFilename ? initialFilename : ""),
		m_flags(flags),
		m_filter(filter ? filter : ""),
		m_fileParent(parent)
	{}
	INT_PTR DoModal() override {
		std::string selectedPath;
		const int result = browser_mfc::host().runFileDialog(
			m_openFile,
			m_defaultExtension,
			m_initialFilename,
			m_flags,
			m_filter,
			m_fileParent ? m_fileParent->browserWindowId() : 0,
			selectedPath);
		if (result == IDOK) m_pathName = selectedPath;
		return result;
	}
	CString GetPathName() const { return m_pathName; }

private:
	bool m_openFile = true;
	std::string m_defaultExtension;
	std::string m_initialFilename;
	DWORD m_flags = 0;
	std::string m_filter;
	CWnd *m_fileParent = nullptr;
	CString m_pathName;
};
class CWaitCursor {
public:
	CWaitCursor() = default;
	~CWaitCursor() = default;
};

class CCommandLineInfo : public CObject {
public:
	enum ShellCommand {
		FileNew,
		FileOpen,
		FileNothing,
	};
	ShellCommand m_nShellCommand = FileNew;
	CString m_strFileName;
};

class CWinApp : public browser_mfc::MessageTarget {
public:
	CWinApp();
	virtual ~CWinApp();
	virtual BOOL InitInstance() { return TRUE; }
	virtual int ExitInstance() { return 0; }
	virtual BOOL OnCmdMsg(
		UINT commandId,
		int notificationCode,
		void *extra,
		AFX_CMDHANDLERINFO *);
	virtual void OnFileNew();
	virtual void OnFileOpen();
	virtual void OnFilePrintSetup();
	HCURSOR LoadCursor(LPCTSTR resource) {
		return browser_mfc::host().loadCursor(
			static_cast<UINT>(reinterpret_cast<std::uintptr_t>(resource)));
	}
	int GetProfileInt(LPCTSTR section, LPCTSTR entry, int defaultValue) const {
		return browser_mfc::host().readProfileInt(
			section ? section : "",
			entry ? entry : "",
			defaultValue);
	}
	CString GetProfileString(
		LPCTSTR section,
		LPCTSTR entry,
		LPCTSTR defaultValue = "") const {
		return browser_mfc::host().readProfileString(
			section ? section : "",
			entry ? entry : "",
			defaultValue ? defaultValue : "");
	}
	BOOL WriteProfileInt(LPCTSTR section, LPCTSTR entry, int value) {
		return browser_mfc::host().writeProfileInt(
			section ? section : "",
			entry ? entry : "",
			value) ? TRUE : FALSE;
	}
	BOOL WriteProfileString(LPCTSTR section, LPCTSTR entry, LPCTSTR value) {
		return browser_mfc::host().writeProfileString(
			section ? section : "",
			entry ? entry : "",
			value ? value : "") ? TRUE : FALSE;
	}
	void AddDocTemplate(CDocTemplate *documentTemplate) {
		if (documentTemplate == nullptr) {
			throw std::invalid_argument("CWinApp::AddDocTemplate received null");
		}
		m_documentTemplates.push_back(documentTemplate);
	}
	void LoadStdProfileSettings(UINT maxRecentFiles = 4) {
		m_maxRecentFiles = maxRecentFiles;
		AfxLoadRecentFileList(maxRecentFiles);
	}
	void ParseCommandLine(CCommandLineInfo &commandLine);
	BOOL ProcessShellCommand(CCommandLineInfo &commandLine);
	CDocument *OpenDocumentFile(LPCTSTR filename);
	BOOL DoPromptFileName(
		CString &filename,
		UINT,
		DWORD flags,
		BOOL openFileDialog,
		CDocTemplate *documentTemplate) {
		CString extension;
		if (documentTemplate != nullptr) {
			documentTemplate->GetDocString(extension, CDocTemplate::filterExt);
		}
		CFileDialog dialog(
			openFileDialog,
			extension,
			filename,
			flags,
			nullptr,
			m_pMainWnd);
		if (dialog.DoModal() != IDOK) return FALSE;
		filename = dialog.GetPathName();
		return TRUE;
	}
	void EnableShellOpen() { browser_mfc::failUnsupported("CWinApp::EnableShellOpen"); }
	void RegisterShellFileTypes(BOOL = TRUE) {
		browser_mfc::failUnsupported("CWinApp::RegisterShellFileTypes");
	}
	CWnd *m_pMainWnd = nullptr;
	const char *m_pszProfileName = nullptr;

private:
	std::vector<CDocTemplate *> m_documentTemplates;
	UINT m_maxRecentFiles = 4;
};

CWinApp *AfxGetApp();
CWnd *AfxGetMainWnd();
HINSTANCE AfxGetInstanceHandle();
HINSTANCE AfxGetResourceHandle();
int AfxMessageBox(UINT resourceId, UINT type = 0, UINT helpId = 0);
int AfxMessageBox(LPCTSTR text, UINT type = 0, UINT helpId = 0);
LPCTSTR AfxRegisterWndClass(UINT, HCURSOR = nullptr, HBRUSH = nullptr, HICON = nullptr);
BOOL MessageBeep(UINT type);
BOOL Beep(DWORD frequency, DWORD durationMilliseconds);
BOOL PlaySound(LPCTSTR filename, HMODULE module, DWORD flags);
BOOL DestroyCursor(HCURSOR cursor);
BOOL DestroyIcon(HICON icon);
HICON LoadIcon(HINSTANCE instance, LPCTSTR resource);
HANDLE LoadImage(
	HINSTANCE instance,
	LPCTSTR resource,
	UINT imageType,
	int desiredWidth,
	int desiredHeight,
	UINT flags);
COLORREF GetSysColor(int colorIndex);
BOOL DrawIconEx(
	HDC deviceContext,
	int x,
	int y,
	HICON icon,
	int width,
	int height,
	UINT animationStep,
	HBRUSH flickerFreeBrush,
	UINT flags);
BOOL TreeView_EndEditLabelNow(HWND tree, BOOL cancel);
BOOL Enable3dControlsStatic();
void CoUninitialize();
int GetSystemMetrics(int metric);
int StretchDIBits(
	HDC destination,
	int destinationX,
	int destinationY,
	int destinationWidth,
	int destinationHeight,
	int sourceX,
	int sourceY,
	int sourceWidth,
	int sourceHeight,
	const void *pixels,
	const BITMAPINFO *bitmapInfo,
	UINT colorUse,
	DWORD rasterOperation);

#define DECLARE_MESSAGE_MAP() \
public: \
	static const browser_mfc::MessageMap &browserStaticMessageMap(); \
	const browser_mfc::MessageMap &browserMessageMap() const override { \
		return browserStaticMessageMap(); \
	}

#define BEGIN_MESSAGE_MAP(theClass, baseClass) \
	const browser_mfc::MessageMap &theClass::browserStaticMessageMap() { \
		using BrowserMfcThisClass = theClass; \
		using BrowserMfcBaseClass = baseClass; \
		static const browser_mfc::MessageEntry browserMfcEntries[] = {

#define END_MESSAGE_MAP() \
			{browser_mfc::MessageKind::Sentinel, 0, 0, 0, nullptr, nullptr}, \
		}; \
		static const browser_mfc::MessageMap browserMfcMap = { \
			&BrowserMfcBaseClass::browserStaticMessageMap, \
			browserMfcEntries, \
			(sizeof(browserMfcEntries) / sizeof(browserMfcEntries[0])) - 1, \
		}; \
		return browserMfcMap; \
	}

#define DECLARE_DYNCREATE(theClass) \
public: \
	static CObject *browserCreateObject(); \
	static const CRuntimeClass browserRuntimeClass; \
	const CRuntimeClass *browserGetRuntimeClass() const override { \
		return &browserRuntimeClass; \
	}
#define IMPLEMENT_DYNCREATE(theClass, baseClass) \
	CObject *theClass::browserCreateObject() { return new theClass; } \
	const CRuntimeClass theClass::browserRuntimeClass = { \
		#theClass, &theClass::browserCreateObject};
#define RUNTIME_CLASS(theClass) (&theClass::browserRuntimeClass)
#define DECLARE_DYNAMIC(theClass)
#define IMPLEMENT_DYNAMIC(theClass, baseClass)

#define BROWSER_MFC_MESSAGE_ENTRY(kindValue, firstValue, lastValue, notificationValue, memberFxn, invocation) \
	{ \
		kindValue, firstValue, lastValue, notificationValue, \
		[](browser_mfc::MessageTarget &target, browser_mfc::Message &message) -> bool { \
			auto &typedTarget = static_cast<BrowserMfcThisClass &>(target); \
			invocation; \
			return true; \
		}, \
		#memberFxn, \
	},

#define ON_COMMAND(commandId, memberFxn) \
	BROWSER_MFC_MESSAGE_ENTRY(browser_mfc::MessageKind::Command, commandId, commandId, 0, memberFxn, \
		(typedTarget.*(&BrowserMfcThisClass::memberFxn))())

#define ON_UPDATE_COMMAND_UI(commandId, memberFxn) \
	BROWSER_MFC_MESSAGE_ENTRY(browser_mfc::MessageKind::CommandUpdate, commandId, commandId, 0, memberFxn, \
		(typedTarget.*(&BrowserMfcThisClass::memberFxn))(static_cast<CCmdUI *>(message.payload)))

#define ON_COMMAND_RANGE(firstCommandId, lastCommandId, memberFxn) \
	BROWSER_MFC_MESSAGE_ENTRY(browser_mfc::MessageKind::Command, firstCommandId, lastCommandId, 0, memberFxn, \
		(typedTarget.*(&BrowserMfcThisClass::memberFxn))(message.id))

#define BROWSER_MFC_CONTROL_ENTRY(controlId, notificationCode, memberFxn) \
	BROWSER_MFC_MESSAGE_ENTRY(browser_mfc::MessageKind::Control, controlId, controlId, notificationCode, memberFxn, \
		(typedTarget.*(&BrowserMfcThisClass::memberFxn))())

#define ON_BN_CLICKED(controlId, memberFxn) BROWSER_MFC_CONTROL_ENTRY(controlId, BN_CLICKED, memberFxn)
#define ON_CBN_SELCHANGE(controlId, memberFxn) BROWSER_MFC_CONTROL_ENTRY(controlId, CBN_SELCHANGE, memberFxn)
#define ON_CBN_SELENDOK(controlId, memberFxn) BROWSER_MFC_CONTROL_ENTRY(controlId, CBN_SELENDOK, memberFxn)
#define ON_CBN_KILLFOCUS(controlId, memberFxn) BROWSER_MFC_CONTROL_ENTRY(controlId, CBN_KILLFOCUS, memberFxn)
#define ON_CBN_EDITCHANGE(controlId, memberFxn) BROWSER_MFC_CONTROL_ENTRY(controlId, CBN_EDITCHANGE, memberFxn)
#define ON_CBN_CLOSEUP(controlId, memberFxn) BROWSER_MFC_CONTROL_ENTRY(controlId, CBN_CLOSEUP, memberFxn)
#define ON_EN_CHANGE(controlId, memberFxn) BROWSER_MFC_CONTROL_ENTRY(controlId, EN_CHANGE, memberFxn)
#define ON_EN_KILLFOCUS(controlId, memberFxn) BROWSER_MFC_CONTROL_ENTRY(controlId, EN_KILLFOCUS, memberFxn)
#define ON_EN_UPDATE(controlId, memberFxn) BROWSER_MFC_CONTROL_ENTRY(controlId, EN_UPDATE, memberFxn)
#define ON_LBN_SELCHANGE(controlId, memberFxn) BROWSER_MFC_CONTROL_ENTRY(controlId, LBN_SELCHANGE, memberFxn)
#define ON_LBN_DBLCLK(controlId, memberFxn) BROWSER_MFC_CONTROL_ENTRY(controlId, LBN_DBLCLK, memberFxn)

#define ON_NOTIFY(notificationCode, controlId, memberFxn) \
	BROWSER_MFC_MESSAGE_ENTRY(browser_mfc::MessageKind::Notify, controlId, controlId, notificationCode, memberFxn, \
		(typedTarget.*(&BrowserMfcThisClass::memberFxn))( \
			static_cast<NMHDR *>(message.payload), &message.result))

#define BROWSER_MFC_WINDOW_ENTRY(messageId, memberFxn, invocation) \
	BROWSER_MFC_MESSAGE_ENTRY(browser_mfc::MessageKind::Window, messageId, messageId, 0, memberFxn, invocation)

#define ON_WM_CANCELMODE() \
	BROWSER_MFC_WINDOW_ENTRY(WM_CANCELMODE, OnCancelMode, (typedTarget.*(&BrowserMfcThisClass::OnCancelMode))())
#define ON_WM_CLOSE() \
	BROWSER_MFC_WINDOW_ENTRY(WM_CLOSE, OnClose, (typedTarget.*(&BrowserMfcThisClass::OnClose))())
#define ON_WM_CREATE() \
	BROWSER_MFC_WINDOW_ENTRY(WM_CREATE, OnCreate, message.result = \
		(typedTarget.*(&BrowserMfcThisClass::OnCreate))(static_cast<LPCREATESTRUCT>(message.payload)))
#define ON_WM_DESTROY() \
	BROWSER_MFC_WINDOW_ENTRY(WM_DESTROY, OnDestroy, (typedTarget.*(&BrowserMfcThisClass::OnDestroy))())
#define ON_WM_ERASEBKGND() \
	BROWSER_MFC_WINDOW_ENTRY(WM_ERASEBKGND, OnEraseBkgnd, message.result = \
		(typedTarget.*(&BrowserMfcThisClass::OnEraseBkgnd))(static_cast<CDC *>(message.payload)))
#define ON_WM_HSCROLL() \
	BROWSER_MFC_WINDOW_ENTRY(WM_HSCROLL, OnHScroll, \
		(typedTarget.*(&BrowserMfcThisClass::OnHScroll))(message.uint0, message.uint1, static_cast<CScrollBar *>(message.object)))
#define ON_WM_KEYDOWN() \
	BROWSER_MFC_WINDOW_ENTRY(WM_KEYDOWN, OnKeyDown, \
		(typedTarget.*(&BrowserMfcThisClass::OnKeyDown))(message.uint0, message.uint1, message.uint2))
#define ON_WM_KEYUP() \
	BROWSER_MFC_WINDOW_ENTRY(WM_KEYUP, OnKeyUp, \
		(typedTarget.*(&BrowserMfcThisClass::OnKeyUp))(message.uint0, message.uint1, message.uint2))
#define ON_WM_LBUTTONDOWN() \
	BROWSER_MFC_WINDOW_ENTRY(WM_LBUTTONDOWN, OnLButtonDown, \
		(typedTarget.*(&BrowserMfcThisClass::OnLButtonDown))(message.uint0, message.point))
#define ON_WM_LBUTTONUP() \
	BROWSER_MFC_WINDOW_ENTRY(WM_LBUTTONUP, OnLButtonUp, \
		(typedTarget.*(&BrowserMfcThisClass::OnLButtonUp))(message.uint0, message.point))
#define ON_WM_MBUTTONDOWN() \
	BROWSER_MFC_WINDOW_ENTRY(WM_MBUTTONDOWN, OnMButtonDown, \
		(typedTarget.*(&BrowserMfcThisClass::OnMButtonDown))(message.uint0, message.point))
#define ON_WM_MBUTTONUP() \
	BROWSER_MFC_WINDOW_ENTRY(WM_MBUTTONUP, OnMButtonUp, \
		(typedTarget.*(&BrowserMfcThisClass::OnMButtonUp))(message.uint0, message.point))
#define ON_WM_MOUSEMOVE() \
	BROWSER_MFC_WINDOW_ENTRY(WM_MOUSEMOVE, OnMouseMove, \
		(typedTarget.*(&BrowserMfcThisClass::OnMouseMove))(message.uint0, message.point))
#define ON_WM_MOUSEWHEEL() \
	BROWSER_MFC_WINDOW_ENTRY(WM_MOUSEWHEEL, OnMouseWheel, message.result = \
		(typedTarget.*(&BrowserMfcThisClass::OnMouseWheel))(message.uint0, message.short0, message.point))
#define ON_WM_MOVE() \
	BROWSER_MFC_WINDOW_ENTRY(WM_MOVE, OnMove, \
		(typedTarget.*(&BrowserMfcThisClass::OnMove))(message.int0, message.int1))
#define ON_WM_PAINT() \
	BROWSER_MFC_WINDOW_ENTRY(WM_PAINT, OnPaint, (typedTarget.*(&BrowserMfcThisClass::OnPaint))())
#define ON_WM_RBUTTONDOWN() \
	BROWSER_MFC_WINDOW_ENTRY(WM_RBUTTONDOWN, OnRButtonDown, \
		(typedTarget.*(&BrowserMfcThisClass::OnRButtonDown))(message.uint0, message.point))
#define ON_WM_RBUTTONUP() \
	BROWSER_MFC_WINDOW_ENTRY(WM_RBUTTONUP, OnRButtonUp, \
		(typedTarget.*(&BrowserMfcThisClass::OnRButtonUp))(message.uint0, message.point))
#define ON_WM_SETCURSOR() \
	BROWSER_MFC_WINDOW_ENTRY(WM_SETCURSOR, OnSetCursor, message.result = \
		(typedTarget.*(&BrowserMfcThisClass::OnSetCursor))(static_cast<CWnd *>(message.object), message.uint0, message.uint1))
#define ON_WM_SHOWWINDOW() \
	BROWSER_MFC_WINDOW_ENTRY(WM_SHOWWINDOW, OnShowWindow, \
		(typedTarget.*(&BrowserMfcThisClass::OnShowWindow))(message.bool0, message.uint0))
#define ON_WM_SIZE() \
	BROWSER_MFC_WINDOW_ENTRY(WM_SIZE, OnSize, \
		(typedTarget.*(&BrowserMfcThisClass::OnSize))(message.uint0, message.int0, message.int1))
#define ON_WM_TIMER() \
	BROWSER_MFC_WINDOW_ENTRY(WM_TIMER, OnTimer, \
		(typedTarget.*(&BrowserMfcThisClass::OnTimer))(message.uint0))
#define ON_WM_VSCROLL() \
	BROWSER_MFC_WINDOW_ENTRY(WM_VSCROLL, OnVScroll, \
		(typedTarget.*(&BrowserMfcThisClass::OnVScroll))(message.uint0, message.uint1, static_cast<CScrollBar *>(message.object)))
