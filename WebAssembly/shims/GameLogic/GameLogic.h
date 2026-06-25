#pragma once

#include "Common/GameType.h"

class Object;
class Drawable;

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
	Bool isInMultiplayerGame() const { return FALSE; }
	Bool isInSkirmishGame() const { return FALSE; }
	Bool isInReplayGame() const { return FALSE; }
	Bool isInShellGame() const { return FALSE; }
	Bool isLoadingMap() const { return FALSE; }
	Bool isIntroMoviePlaying() const { return FALSE; }
	Bool isGamePaused() const { return FALSE; }
	void setGamePaused(Bool, Bool pauseMusic = TRUE) {}
	Int getRankPointsToAddAtGameStart() const { return 0; }
	void processProgress(Int, Int) {}
	void processProgressComplete(Int) {}
	void prepareNewGame(Int, GameDifficulty, Int) {}
	void timeOutGameStart() {}
	void clearGameData(Bool showScoreScreen = TRUE) {}
	void bindObjectAndDrawable(Object *, Drawable *) {}
	Object *findObjectByID(ObjectID) { return nullptr; }
};

extern GameLogic *TheGameLogic;
