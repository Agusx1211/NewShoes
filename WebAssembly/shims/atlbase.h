#pragma once

#include "windows.h"

class CComModule
{
public:
	HRESULT Init(void *, HINSTANCE) { return S_OK; }
	void Term() {}
};

template <typename T>
class CComObject : public T
{
};

template <typename T>
class CComQIPtr
{
public:
	explicit CComQIPtr(void *ptr = nullptr) : m_ptr(static_cast<T *>(ptr)) {}

	operator T *() const { return m_ptr; }
	T *operator->() const { return m_ptr; }

private:
	T *m_ptr;
};
