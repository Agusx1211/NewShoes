#pragma once

#include "Common/GameCommon.h"
#include "Common/GameType.h"

class Object;
class Drawable;
class CommandButton;

typedef const CommandButton *ConstCommandButtonPtr;

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
	Bool isInLanGame() const { return FALSE; }
	Bool isInSkirmishGame() const { return FALSE; }
	Bool isInReplayGame() const { return FALSE; }
	Bool isInShellGame() const { return FALSE; }
	Bool isInInternetGame() const { return FALSE; }
	Bool isLoadingMap() const { return FALSE; }
	Bool isIntroMoviePlaying() const { return FALSE; }
	Bool isGamePaused() const { return FALSE; }
	void setGamePaused(Bool, Bool pauseMusic = TRUE) {}
	Int getRankPointsToAddAtGameStart() const { return 0; }
	void processProgress(Int, Int) {}
	void processProgressComplete(Int) {}
	void prepareNewGame(Int, GameDifficulty, Int) {}
	void timeOutGameStart() {}
	void initTimeOutValues() {}
	void clearGameData(Bool showScoreScreen = TRUE) {}
	void closeWindows() {}
	void bindObjectAndDrawable(Object *, Drawable *) {}
	void destroyObject(Object *) {}
	Object *findObjectByID(ObjectID) { return nullptr; }
	Object *getFirstObject() { return nullptr; }
	Int getHulkMaxLifetimeOverride() const { return 0; }
	UnsignedInt getFrameObjectsChangedTriggerAreas() { return 0; }
	void deselectObject(Object *, PlayerMaskType, Bool affectClient = FALSE) {}
	void setShowBehindBuildingMarkers(Bool) {}
	Bool getShowBehindBuildingMarkers() const { return FALSE; }
	Bool findControlBarOverride(const AsciiString &, Int, ConstCommandButtonPtr &) const { return FALSE; }
};

extern GameLogic *TheGameLogic;
