#pragma once

#include "Common/GameType.h"

class Object;

class GameLogic
{
public:
	int getFrame() const { return 0; }
	Bool getDrawIconUI() const { return TRUE; }
	Object *findObjectByID(ObjectID) { return nullptr; }
};

extern GameLogic *TheGameLogic;
