#include "PreRTS.h"

#include "Common/ThingTemplate.h"
#include "Common/Xfer.h"
#include "GameLogic/GameLogic.h"
#include "GameLogic/Object.h"

#include <algorithm>

enum { PROBE_OBJ_HASH_SIZE = 8192 };

class ActionManager;

GameLogic *TheGameLogic = NULL;
ActionManager *TheActionManager = NULL;

GameLogic::GameLogic()
{
	m_background = NULL;
	m_CRC = 0;
	m_shouldValidateCRCs = FALSE;
	m_loadingMap = FALSE;
	m_loadingSave = FALSE;
	m_clearingGameData = FALSE;
	m_isInUpdate = FALSE;
	m_rankPointsToAddAtGameStart = 0;
	m_isScoringEnabled = TRUE;
	m_showBehindBuildingMarkers = TRUE;
	m_drawIconUI = TRUE;
	m_showDynamicLOD = TRUE;
	m_scriptHulkMaxLifetimeOverride = -1;
	m_startNewGame = FALSE;
	m_objList = NULL;
	m_curUpdateModule = NULL;
	m_nextObjID = (ObjectID)1;
	m_gameMode = GAME_NONE;
	m_rankLevelLimit = 1000;
	m_superweaponRestriction = 0;
	m_loadScreen = NULL;
	m_gamePaused = FALSE;
	m_inputEnabledMemory = TRUE;
	m_mouseVisibleMemory = TRUE;
	m_forceGameStartByTimeOut = FALSE;
	m_frameObjectsChangedTriggerAreas = 0;
	m_width = 0.0f;
	m_height = 0.0f;
	m_frame = 0;
	for (Int i = 0; i < MAX_SLOTS; ++i) {
		m_progressComplete[i] = FALSE;
		m_progressCompleteTimeout[i] = 0;
	}
	m_objVector.resize(PROBE_OBJ_HASH_SIZE, NULL);
}

GameLogic::~GameLogic()
{
	m_objVector.clear();
	m_sleepyUpdates.clear();
	m_objectsToDestroy.clear();
	if (TheGameLogic == this) {
		TheGameLogic = NULL;
	}
}

void GameLogic::init()
{
	reset();
}

void GameLogic::reset()
{
	m_thingTemplateBuildableOverrides.clear();
	m_controlBarOverrides.clear();
	m_cachedCRCs.clear();
	m_objectTOC.clear();
	m_objectsToDestroy.clear();
	m_sleepyUpdates.clear();
	m_objList = NULL;
	m_objVector.clear();
	m_objVector.resize(PROBE_OBJ_HASH_SIZE, NULL);
	m_nextObjID = (ObjectID)1;
	m_frame = 0;
	m_frameObjectsChangedTriggerAreas = 0;
	m_gamePaused = FALSE;
	m_inputEnabledMemory = TRUE;
	m_mouseVisibleMemory = TRUE;
}

void GameLogic::update()
{
	++m_frame;
}

void GameLogic::processCommandList(CommandList *)
{
}

void GameLogic::prepareNewGame(Int gameMode, GameDifficulty, Int rankPoints)
{
	m_gameMode = gameMode;
	m_rankPointsToAddAtGameStart = rankPoints;
}

void GameLogic::logicMessageDispatcher(GameMessage *, void *)
{
}

void GameLogic::registerObject(Object *obj)
{
	if (obj == NULL) {
		return;
	}
	obj->prependToList(&m_objList);
	addObjectToLookupTable(obj);
}

void GameLogic::addObjectToLookupTable(Object *obj)
{
	if (obj == NULL) {
		return;
	}
	ObjectID new_id = obj->getID();
	while (new_id >= m_objVector.size()) {
		m_objVector.resize(m_objVector.size() * 2, NULL);
	}
	m_objVector[new_id] = obj;
}

void GameLogic::removeObjectFromLookupTable(Object *obj)
{
	if (obj == NULL || obj->getID() >= m_objVector.size()) {
		return;
	}
	m_objVector[obj->getID()] = NULL;
}

Object *GameLogic::friend_createObject(
	const ThingTemplate *thing,
	const ObjectStatusMaskType &statusBits,
	Team *team)
{
	return newInstance(Object)(thing, statusBits, team);
}

void GameLogic::destroyObject(Object *obj)
{
	if (obj == NULL || obj->isDestroyed()) {
		return;
	}
	obj->setStatus(MAKE_OBJECT_STATUS_MASK(OBJECT_STATUS_DESTROYED));
	m_objectsToDestroy.push_back(obj);
}

Object *GameLogic::getFirstObject()
{
	return m_objList;
}

ObjectID GameLogic::allocateObjectID()
{
	ObjectID ret = m_nextObjID;
	m_nextObjID = (ObjectID)((UnsignedInt)m_nextObjID + 1);
	return ret;
}

void GameLogic::startNewGame(Bool)
{
}

void GameLogic::loadMapINI(AsciiString)
{
}

void GameLogic::updateLoadProgress(Int)
{
}

void GameLogic::deleteLoadScreen()
{
	m_loadScreen = NULL;
}

Bool GameLogic::isInSinglePlayerGame()
{
	return m_gameMode == GAME_SINGLE_PLAYER;
}

Bool GameLogic::isIntroMoviePlaying()
{
	return FALSE;
}

void GameLogic::clearGameData(Bool)
{
	reset();
}

void GameLogic::closeWindows()
{
}

void GameLogic::sendObjectCreated(Object *)
{
}

void GameLogic::sendObjectDestroyed(Object *)
{
}

void GameLogic::bindObjectAndDrawable(Object *, Drawable *)
{
}

void GameLogic::setGamePaused(Bool paused, Bool)
{
	m_gamePaused = paused;
}

Bool GameLogic::isGamePaused()
{
	return m_gamePaused;
}

void GameLogic::processProgress(Int playerId, Int)
{
	if (playerId >= 0 && playerId < MAX_SLOTS) {
		m_progressComplete[playerId] = FALSE;
	}
}

void GameLogic::processProgressComplete(Int playerId)
{
	if (playerId >= 0 && playerId < MAX_SLOTS) {
		m_progressComplete[playerId] = TRUE;
	}
}

Bool GameLogic::isProgressComplete()
{
	for (Int i = 0; i < MAX_SLOTS; ++i) {
		if (!m_progressComplete[i]) {
			return FALSE;
		}
	}
	return TRUE;
}

void GameLogic::timeOutGameStart()
{
	m_forceGameStartByTimeOut = TRUE;
}

void GameLogic::initTimeOutValues()
{
	m_forceGameStartByTimeOut = FALSE;
	for (Int i = 0; i < MAX_SLOTS; ++i) {
		m_progressCompleteTimeout[i] = 0;
	}
}

UnsignedInt GameLogic::getObjectCount()
{
	UnsignedInt count = 0;
	for (Object *obj = m_objList; obj != NULL; obj = obj->getNextObject()) {
		++count;
	}
	return count;
}

void GameLogic::setSuperweaponRestriction()
{
	m_superweaponRestriction = 0;
}

void GameLogic::selectObject(Object *, Bool, PlayerMaskType, Bool)
{
}

void GameLogic::deselectObject(Object *, PlayerMaskType, Bool)
{
}

void GameLogic::friend_awakenUpdateModule(Object *, UpdateModulePtr update, UnsignedInt whenToWakeUp)
{
	if (update != NULL) {
		update->friend_setNextCallFrame(whenToWakeUp);
	}
}

UnsignedInt GameLogic::getCRC(Int, AsciiString)
{
	return m_CRC;
}

TerrainLogic *GameLogic::createTerrainLogic()
{
	return NULL;
}

GhostObjectManager *GameLogic::createGhostObjectManager()
{
	return NULL;
}

void GameLogic::crc(Xfer *)
{
}

void GameLogic::xfer(Xfer *)
{
}

void GameLogic::loadPostProcess()
{
}

void GameLogic::setDefaults(Bool loadingSaveGame)
{
	if (!loadingSaveGame) {
		m_nextObjID = (ObjectID)1;
	}
	m_frame = 0;
	m_objList = NULL;
	m_width = 0.0f;
	m_height = 0.0f;
}

void GameLogic::processDestroyList()
{
	m_objectsToDestroy.clear();
}

void GameLogic::destroyAllObjectsImmediate()
{
	m_objectsToDestroy.clear();
	m_objList = NULL;
	std::fill(m_objVector.begin(), m_objVector.end(), static_cast<Object *>(NULL));
}

void GameLogic::pushSleepyUpdate(UpdateModulePtr u)
{
	if (u != NULL) {
		m_sleepyUpdates.push_back(u);
	}
}

UpdateModulePtr GameLogic::peekSleepyUpdate() const
{
	return m_sleepyUpdates.empty() ? NULL : m_sleepyUpdates.front();
}

void GameLogic::popSleepyUpdate()
{
	if (!m_sleepyUpdates.empty()) {
		m_sleepyUpdates.erase(m_sleepyUpdates.begin());
	}
}

void GameLogic::eraseSleepyUpdate(Int i)
{
	if (i >= 0 && i < static_cast<Int>(m_sleepyUpdates.size())) {
		m_sleepyUpdates.erase(m_sleepyUpdates.begin() + i);
	}
}

void GameLogic::rebalanceSleepyUpdate(Int)
{
}

Int GameLogic::rebalanceParentSleepyUpdate(Int i)
{
	return i;
}

Int GameLogic::rebalanceChildSleepyUpdate(Int i)
{
	return i;
}

void GameLogic::remakeSleepyUpdate()
{
}

void GameLogic::validateSleepyUpdate() const
{
}

GameLogic::ObjectTOCEntry *GameLogic::findTOCEntryByName(AsciiString)
{
	return NULL;
}

GameLogic::ObjectTOCEntry *GameLogic::findTOCEntryById(UnsignedShort)
{
	return NULL;
}

void GameLogic::addTOCEntry(AsciiString, UnsignedShort)
{
}

void GameLogic::xferObjectTOC(Xfer *)
{
}

void GameLogic::prepareLogicForObjectLoad()
{
}
