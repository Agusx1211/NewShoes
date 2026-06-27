#pragma once

#include "Common/GameType.h"

class LANAPI
{
public:
	void setIsActive(Bool) {}
	void update() {}
};

extern LANAPI *TheLAN;
