#pragma once

#include "Lib/BaseType.h"

class GameClient
{
public:
	virtual UnsignedInt getFrame(void) { return 1; }
};

extern GameClient *TheGameClient;
