#pragma once

#include "Common/GameType.h"

class Object;

class GameLogic
{
public:
	int getFrame() const { return 0; }
	Bool getDrawIconUI() const { return TRUE; }
	Bool isInGame() const { return FALSE; }
	Bool isInSinglePlayerGame() const { return FALSE; }
	Bool isInSkirmishGame() const { return FALSE; }
	Bool isInReplayGame() const { return FALSE; }
	Object *findObjectByID(ObjectID) { return nullptr; }
};

extern GameLogic *TheGameLogic;
