#pragma once

#include "Common/GameType.h"

class Object;

enum
{
	GAME_SINGLE_PLAYER,
	GAME_LAN,
	GAME_SKIRMISH,
	GAME_REPLAY,
	GAME_SHELL,
	GAME_INTERNET,
	GAME_NONE
};

class GameLogic
{
public:
	int getFrame() const { return 0; }
	Int getGameMode() const { return GAME_NONE; }
	Bool getDrawIconUI() const { return TRUE; }
	Bool isInGame() const { return FALSE; }
	Bool isInSinglePlayerGame() const { return FALSE; }
	Bool isInSkirmishGame() const { return FALSE; }
	Bool isInReplayGame() const { return FALSE; }
	Bool isInShellGame() const { return FALSE; }
	Bool isLoadingMap() const { return FALSE; }
	void clearGameData(Bool showScoreScreen = TRUE) {}
	Object *findObjectByID(ObjectID) { return nullptr; }
};

extern GameLogic *TheGameLogic;
