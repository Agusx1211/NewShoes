#pragma once

#if defined(CNC_PORT_REAL_GAMELOGIC_HEADER)
#include_next "GameLogic/GameLogic.h"
#else

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
	int getFrame() const { return m_frame; }
	void setFrameForProbe(UnsignedInt frame) { m_frame = static_cast<Int>(frame); }
	Int getGameMode() const { return m_gameMode; }
	void setGameMode(Int mode) { m_gameMode = mode; }
	Bool getDrawIconUI() const { return TRUE; }
	Bool isInGame() const { return m_gameMode != GAME_NONE; }
	Bool isInSinglePlayerGame() const { return m_gameMode == GAME_SINGLE_PLAYER; }
	Bool isInMultiplayerGame() const { return m_gameMode == GAME_LAN || m_gameMode == GAME_INTERNET; }
	Bool isInLanGame() const { return m_gameMode == GAME_LAN; }
	Bool isInSkirmishGame() const { return m_gameMode == GAME_SKIRMISH; }
	Bool isInReplayGame() const { return m_gameMode == GAME_REPLAY; }
	Bool isInShellGame() const { return m_gameMode == GAME_SHELL; }
	Bool isInInternetGame() const { return m_gameMode == GAME_INTERNET; }
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
	UnsignedInt getObjectCount() { return 0; }
	Bool getShowDynamicLOD() const { return FALSE; }
	Int getHulkMaxLifetimeOverride() const { return 0; }
	UnsignedInt getFrameObjectsChangedTriggerAreas() { return 0; }
	void deselectObject(Object *, PlayerMaskType, Bool affectClient = FALSE) {}
	void setShowBehindBuildingMarkers(Bool) {}
	Bool getShowBehindBuildingMarkers() const { return FALSE; }
	Bool findControlBarOverride(const AsciiString &, Int, ConstCommandButtonPtr &) const { return FALSE; }

private:
	Int m_gameMode = GAME_NONE;
	Int m_frame = 0;
};

extern GameLogic *TheGameLogic;

#endif
