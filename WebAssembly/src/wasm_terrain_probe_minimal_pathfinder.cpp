#ifndef __PRERTS_H__
#define __PRERTS_H__
#endif

#include "Common/GameType.h"
#include "GameLogic/AIPathfind.h"
#include "GameLogic/TerrainLogic.h"

// Focused bridge-buffer probe surface. Replace this with the full original
// AIPathfind/Object runtime when gameplay pathfinding enters the target.

PathfindCell::PathfindCell(void) :
	m_info(nullptr)
{
	reset();
}

PathfindCell::~PathfindCell(void)
{
	m_info = nullptr;
}

void PathfindCell::reset()
{
	m_info = nullptr;
	m_zone = 0;
	m_aircraftGoal = 0;
	m_pinched = 0;
	m_type = CELL_CLEAR;
	m_flags = NO_UNITS;
	m_connectsToLayer = LAYER_GROUND;
	m_layer = LAYER_GROUND;
}

PathfindLayer::PathfindLayer() :
	m_blockOfMapCells(nullptr),
	m_layerCells(nullptr),
	m_width(0),
	m_height(0),
	m_xOrigin(0),
	m_yOrigin(0),
	m_layer(LAYER_GROUND),
	m_zone(0),
	m_bridge(nullptr),
	m_destroyed(false)
{
	m_startCell.x = 0;
	m_startCell.y = 0;
	m_endCell.x = 0;
	m_endCell.y = 0;
}

PathfindLayer::~PathfindLayer()
{
	reset();
}

void PathfindLayer::reset(void)
{
	delete [] m_blockOfMapCells;
	delete [] m_layerCells;
	m_blockOfMapCells = nullptr;
	m_layerCells = nullptr;
	m_width = 0;
	m_height = 0;
	m_xOrigin = 0;
	m_yOrigin = 0;
	m_startCell.x = 0;
	m_startCell.y = 0;
	m_endCell.x = 0;
	m_endCell.y = 0;
	m_layer = LAYER_GROUND;
	m_zone = 0;
	m_bridge = nullptr;
	m_destroyed = false;
}

Bool PathfindLayer::init(Bridge *theBridge, PathfindLayerEnum layer)
{
	if (m_bridge != nullptr) {
		return false;
	}
	m_bridge = theBridge;
	m_layer = layer;
	m_destroyed = false;
	return true;
}

Bool PathfindLayer::isUnused(void)
{
	return m_bridge == nullptr;
}

Bool PathfindLayer::setDestroyed(Bool destroyed)
{
	const Bool changed = m_destroyed != destroyed;
	m_destroyed = destroyed;
	return changed;
}

PathfindCell *PathfindLayer::getCell(Int, Int)
{
	return nullptr;
}

ObjectID PathfindLayer::getBridgeID(void)
{
	if (m_bridge == nullptr) {
		return INVALID_ID;
	}
	BridgeInfo info;
	m_bridge->getBridgeInfo(&info);
	return info.bridgeObjectID;
}

void PathfindLayer::allocateCells(const IRegion2D *)
{
}

void PathfindLayer::allocateCellsForWallLayer(const IRegion2D *, ObjectID *, Int)
{
}

void PathfindLayer::classifyCells()
{
}

void PathfindLayer::classifyWallCells(ObjectID *, Int)
{
}

void PathfindLayer::applyZone(void)
{
}

Bool PathfindLayer::connectsZones(PathfindZoneManager *, const LocomotorSet &, Int, Int)
{
	return false;
}

Bool PathfindLayer::isPointOnWall(ObjectID *, Int, const Coord3D *)
{
	return false;
}

PathfindZoneManager::PathfindZoneManager() :
	m_blockOfZoneBlocks(nullptr),
	m_zoneBlocks(nullptr),
	m_maxZone(0),
	m_nextFrameToCalculateZones(0),
	m_zonesAllocated(0),
	m_groundCliffZones(nullptr),
	m_groundWaterZones(nullptr),
	m_groundRubbleZones(nullptr),
	m_terrainZones(nullptr),
	m_crusherZones(nullptr),
	m_hierarchicalZones(nullptr)
{
	m_zoneBlockExtent.x = 0;
	m_zoneBlockExtent.y = 0;
}

PathfindZoneManager::~PathfindZoneManager()
{
	reset();
}

void PathfindZoneManager::reset(void)
{
	m_blockOfZoneBlocks = nullptr;
	m_zoneBlocks = nullptr;
	m_zoneBlockExtent.x = 0;
	m_zoneBlockExtent.y = 0;
	m_maxZone = 0;
	m_nextFrameToCalculateZones = 0;
	m_zonesAllocated = 0;
	m_groundCliffZones = nullptr;
	m_groundWaterZones = nullptr;
	m_groundRubbleZones = nullptr;
	m_terrainZones = nullptr;
	m_crusherZones = nullptr;
	m_hierarchicalZones = nullptr;
}

Pathfinder::Pathfinder(void) :
	m_blockOfMapCells(nullptr),
	m_map(nullptr),
	m_openList(nullptr),
	m_closedList(nullptr),
	m_isMapReady(false),
	m_isTunneling(false),
	m_frameToShowObstacles(0),
	debugPath(nullptr),
	m_ignoreObstacleID(INVALID_ID),
	m_numWallPieces(0),
	m_wallHeight(0.0f),
	m_moveAlliesDepth(0),
	m_queuePRHead(0),
	m_queuePRTail(0),
	m_cumulativeCellsAllocated(0)
{
	reset();
}

Pathfinder::~Pathfinder(void)
{
	delete [] m_blockOfMapCells;
	delete [] m_map;
	m_blockOfMapCells = nullptr;
	m_map = nullptr;
}

void Pathfinder::reset(void)
{
	delete [] m_blockOfMapCells;
	delete [] m_map;
	m_blockOfMapCells = nullptr;
	m_map = nullptr;
	m_extent.lo.x = 0;
	m_extent.lo.y = 0;
	m_extent.hi.x = 0;
	m_extent.hi.y = 0;
	m_logicalExtent.lo.x = 0;
	m_logicalExtent.lo.y = 0;
	m_logicalExtent.hi.x = 0;
	m_logicalExtent.hi.y = 0;
	m_openList = nullptr;
	m_closedList = nullptr;
	m_isMapReady = false;
	m_isTunneling = false;
	m_frameToShowObstacles = 0;
	debugPathPos.x = 0.0f;
	debugPathPos.y = 0.0f;
	debugPathPos.z = 0.0f;
	debugPath = nullptr;
	m_ignoreObstacleID = INVALID_ID;
	m_zoneManager.reset();
	for (Int layer = 0; layer <= LAYER_LAST; ++layer) {
		m_layers[layer].reset();
	}
	for (Int index = 0; index < MAX_WALL_PIECES; ++index) {
		m_wallPieces[index] = INVALID_ID;
	}
	m_numWallPieces = 0;
	m_wallHeight = 0.0f;
	m_moveAlliesDepth = 0;
	for (Int index = 0; index < PATHFIND_QUEUE_LEN; ++index) {
		m_queuedPathfindRequests[index] = INVALID_ID;
	}
	m_queuePRHead = 0;
	m_queuePRTail = 0;
	m_cumulativeCellsAllocated = 0;
}

PathfindLayerEnum Pathfinder::addBridge(Bridge *theBridge)
{
	Int layer = LAYER_GROUND + 1;
	while (layer <= LAYER_WALL) {
		if (m_layers[layer].isUnused()) {
			if (m_layers[layer].init(theBridge, static_cast<PathfindLayerEnum>(layer))) {
				return static_cast<PathfindLayerEnum>(layer);
			}
			return LAYER_GROUND;
		}
		++layer;
	}
	return LAYER_GROUND;
}

void Pathfinder::changeBridgeState(PathfindLayerEnum layer, Bool repaired)
{
	if (layer > LAYER_GROUND && layer <= LAYER_LAST) {
		m_layers[layer].setDestroyed(!repaired);
	}
}

Bool Pathfinder::isPointOnWall(const Coord3D *)
{
	return false;
}

void Pathfinder::forceMapRecalculation(void)
{
	m_isMapReady = false;
}

Bool Pathfinder::queueForPath(ObjectID)
{
	return false;
}

void Pathfinder::processPathfindQueue(void)
{
}

void Pathfinder::crc(Xfer *)
{
}

void Pathfinder::xfer(Xfer *)
{
}

void Pathfinder::loadPostProcess(void)
{
}

Path *Pathfinder::findPath(Object *, const LocomotorSet &, const Coord3D *, const Coord3D *)
{
	return nullptr;
}

Path *Pathfinder::findClosestPath(Object *, const LocomotorSet &, const Coord3D *, Coord3D *, Bool, Real, Bool)
{
	return nullptr;
}

Path *Pathfinder::findAttackPath(const Object *, const LocomotorSet &, const Coord3D *, const Object *, const Coord3D *, const Weapon *)
{
	return nullptr;
}

Path *Pathfinder::findSafePath(const Object *, const LocomotorSet &, const Coord3D *, const Coord3D *, const Coord3D *, Real)
{
	return nullptr;
}

Path *Pathfinder::patchPath(const Object *, const LocomotorSet &, Path *, Bool)
{
	return nullptr;
}

Path *Pathfinder::internalFindPath(Object *, const LocomotorSet &, const Coord3D *, const Coord3D *)
{
	return nullptr;
}
