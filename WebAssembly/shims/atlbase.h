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
