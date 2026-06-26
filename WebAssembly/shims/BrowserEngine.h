#pragma once

#include "windows.h"

// Declaration-only replacement for the MSVC #import-generated BrowserEngine
// interfaces. The real embedded-browser path still needs a browser runtime
// implementation before DX8WebBrowser can be enabled under Emscripten.

#ifndef REGDB_E_CLASSNOTREG
#define REGDB_E_CLASSNOTREG static_cast<HRESULT>(0x80040154L)
#endif

class _bstr_t
{
public:
	explicit _bstr_t(const char *value = nullptr) : m_value(value ? value : "") {}

	const char *c_str() const { return m_value; }

private:
	const char *m_value;
};

struct FEBrowserEngine2
{
};

class IFEBrowserEngine2
{
public:
	void Initialize(long *) {}
	void put_BadPageURL(const _bstr_t &) {}
	void put_LoadingPageURL(const _bstr_t &) {}
	void put_MouseFileName(const _bstr_t &) {}
	void put_MouseBusyFileName(const _bstr_t &) {}
	void Shutdown() {}
	void D3DUpdate() {}
	void D3DRender(int) {}
	void CreateBrowser(const _bstr_t &, const _bstr_t &, long, int, int, int, int, LONG, LPDISPATCH) {}
	void SetUpdateRate(const _bstr_t &, int) {}
	void DestroyBrowser(const _bstr_t &) {}
	int IsOpen(const _bstr_t &) { return 0; }
	void Navigate(const _bstr_t &, const _bstr_t &) {}
};

class IFEBrowserEngine2Ptr
{
public:
	IFEBrowserEngine2Ptr() = default;
	IFEBrowserEngine2Ptr(std::nullptr_t) {}
	IFEBrowserEngine2Ptr(int value) { if (value == 0) m_instance = nullptr; }

	HRESULT CreateInstance(const GUID &)
	{
		m_instance = nullptr;
		return REGDB_E_CLASSNOTREG;
	}

	IFEBrowserEngine2 *operator->() { return m_instance; }
	const IFEBrowserEngine2 *operator->() const { return m_instance; }
	explicit operator bool() const { return m_instance != nullptr; }

	bool operator==(std::nullptr_t) const { return m_instance == nullptr; }
	bool operator!=(std::nullptr_t) const { return m_instance != nullptr; }
	bool operator==(int value) const { return value == 0 && m_instance == nullptr; }
	bool operator!=(int value) const { return !(*this == value); }

	IFEBrowserEngine2Ptr &operator=(std::nullptr_t)
	{
		m_instance = nullptr;
		return *this;
	}

	IFEBrowserEngine2Ptr &operator=(int value)
	{
		if (value == 0) {
			m_instance = nullptr;
		}
		return *this;
	}

private:
	IFEBrowserEngine2 *m_instance = nullptr;
};

static inline bool operator==(int value, const IFEBrowserEngine2Ptr &ptr)
{
	return ptr == value;
}

static inline bool operator!=(int value, const IFEBrowserEngine2Ptr &ptr)
{
	return ptr != value;
}

static inline HRESULT CoInitialize(LPVOID)
{
	return S_OK;
}

static inline void CoUninitialize()
{
}

static inline const GUID &BrowserEngineClassId()
{
	static const GUID id = { 0x00000000UL, 0x0000, 0x0000, { 0, 0, 0, 0, 0, 0, 0, 0 } };
	return id;
}

#ifndef __uuidof
#define __uuidof(type_name) BrowserEngineClassId()
#endif
