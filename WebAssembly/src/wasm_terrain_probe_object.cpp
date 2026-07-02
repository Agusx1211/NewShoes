#include "PreRTS.h"

#include "Common/ModuleFactory.h"
#include "Common/Player.h"
#include "Common/PlayerList.h"
#include "Common/Radar.h"
#include "Common/ThingTemplate.h"
#include "GameLogic/Damage.h"
#include "GameLogic/GameLogic.h"
#include "GameLogic/Module/BehaviorModule.h"
#include "GameLogic/Module/BodyModule.h"
#include "GameLogic/Module/ObjectDefectionHelper.h"
#include "GameLogic/Object.h"
#include "GameLogic/PartitionManager.h"
#include "GameLogic/TerrainLogic.h"

Object::Object(
	const ThingTemplate *thing,
	const ObjectStatusMaskType &objectStatusMask,
	Team *team) :
	Thing(thing),
	m_id(INVALID_ID),
	m_producerID(INVALID_ID),
	m_builderID(INVALID_ID),
	m_drawable(NULL),
	m_next(NULL),
	m_prev(NULL),
	m_status(objectStatusMask),
	m_geometryInfo(thing->getTemplateGeometryInfo()),
	m_group(NULL),
	m_partitionLastLook(NULL),
	m_partitionRevealAllLastLook(NULL),
	m_partitionLastShroud(NULL),
	m_partitionLastThreat(NULL),
	m_partitionLastValue(NULL),
	m_visionRange(thing->friend_calcVisionRange()),
	m_shroudClearingRange(thing->friend_calcShroudClearingRange()),
	m_shroudRange(0.0f),
	m_smcUntil(NEVER),
	m_repulsorHelper(NULL),
	m_smcHelper(NULL),
	m_wsHelper(NULL),
	m_defectionHelper(NULL),
	m_statusDamageHelper(NULL),
	m_subdualDamageHelper(NULL),
	m_tempWeaponBonusHelper(NULL),
	m_firingTracker(NULL),
	m_behaviors(NULL),
	m_contain(NULL),
	m_body(NULL),
	m_stealth(NULL),
	m_ai(NULL),
	m_physics(NULL),
	m_partitionData(NULL),
	m_radarData(NULL),
	m_experienceTracker(NULL),
	m_containedBy(NULL),
	m_xferContainedByID(INVALID_ID),
	m_containedByFrame(0),
	m_constructionPercent(1.0f),
	m_team(NULL),
	m_indicatorColor(0),
	m_weaponBonusCondition(0),
	m_soleHealingBenefactorID(INVALID_ID),
	m_soleHealingBenefactorExpirationFrame(0),
	m_enteredOrExitedFrame(0),
	m_layer(LAYER_GROUND),
	m_destinationLayer(LAYER_GROUND),
	m_formationID(NO_FORMATION_ID),
	m_safeOcclusionFrame(0),
	m_isSelectable(FALSE),
	m_modulesReady(FALSE),
#if defined(_DEBUG) || defined(_INTERNAL)
	m_hasDiedAlready(false),
#endif
	m_scriptStatus(0),
	m_privateStatus(0),
	m_numTriggerAreasActive(0),
	m_singleUseCommandUsed(FALSE),
	m_isReceivingDifficultyBonus(FALSE)
{
	for (Int i = 0; i < MAX_PLAYER_COUNT; ++i) {
		m_visionSpiedBy[i] = 0;
	}
	for (Int i = 0; i < DISABLED_COUNT; ++i) {
		m_disabledTillFrame[i] = NEVER;
	}
	for (Int i = 0; i < WEAPONSLOT_COUNT; ++i) {
		m_lastWeaponCondition[i] = WSF_INVALID;
	}
	for (Int i = 0; i < MAX_TRIGGER_AREA_INFOS; ++i) {
		m_triggerInfo[i] = TTriggerInfo();
	}

	m_disabledMask.clear();
	m_objectUpgradesCompleted.clear();
	m_curWeaponSetFlags.clear();
	m_specialPowerBits.clear();
	m_healthBoxOffset.zero();
	m_formationOffset.x = 0.0f;
	m_formationOffset.y = 0.0f;
	m_iPos.zero();

	if (m_shroudClearingRange == -1.0f) {
		m_shroudClearingRange = m_visionRange;
	}

	setID(TheGameLogic->allocateObjectID());
	setTeam(team);

	const ModuleInfo &module_info = thing->getBehaviorModuleInfo();
	m_behaviors = MSGNEW("ProbeObjectModules") BehaviorModule *[module_info.getCount() + 1];
	BehaviorModule **cursor = m_behaviors;
	for (Int i = 0; i < module_info.getCount(); ++i) {
		const AsciiString &module_name = module_info.getNthName(i);
		if (module_name.isEmpty()) {
			continue;
		}
		BehaviorModule *module = static_cast<BehaviorModule *>(
			TheModuleFactory->newModule(
				this,
				module_name,
				module_info.getNthData(i),
				MODULETYPE_BEHAVIOR));
		if (module == NULL) {
			continue;
		}
		*cursor++ = module;
		if (module->getBody() != NULL) {
			m_body = module->getBody();
		}
		if (module->getContain() != NULL) {
			m_contain = module->getContain();
		}
		if (module->getStealth() != NULL) {
			m_stealth = static_cast<StealthUpdate *>(module->getStealth());
		}
		if (module->getAIUpdateInterface() != NULL) {
			m_ai = module->getAIUpdateInterface();
		}
	}
	*cursor = NULL;
	m_modulesReady = TRUE;

	if (TheGameLogic != NULL) {
		TheGameLogic->registerObject(this);
	}
}

Object::~Object()
{
	if (m_behaviors != NULL) {
		for (BehaviorModule **module = m_behaviors; *module; ++module) {
			(*module)->deleteInstance();
			*module = NULL;
		}
		delete[] m_behaviors;
		m_behaviors = NULL;
	}
}

void Object::initObject()
{
	if (m_behaviors == NULL) {
		return;
	}
	for (BehaviorModule **module = m_behaviors; *module; ++module) {
		(*module)->onObjectCreated();
	}
}

void Object::onDestroy()
{
	setStatus(MAKE_OBJECT_STATUS_MASK(OBJECT_STATUS_DESTROYED));
}

void Object::updateObjValuesFromMapProperties(Dict *)
{
}

void Object::friend_bindToDrawable(Drawable *draw)
{
	m_drawable = draw;
}

void Object::setProducer(const Object *obj)
{
	m_producerID = obj != NULL ? obj->getID() : INVALID_ID;
}

void Object::setBuilder(const Object *obj)
{
	m_builderID = obj != NULL ? obj->getID() : INVALID_ID;
}

void Object::enterGroup(AIGroup *group)
{
	m_group = group;
}

void Object::leaveGroup()
{
	m_group = NULL;
}

AIGroup *Object::getGroup()
{
	return m_group;
}

Bool Object::isMobile() const
{
	return !isKindOf(KINDOF_IMMOBILE);
}

Bool Object::isAbleToAttack() const
{
	return FALSE;
}

void Object::maskObject(Bool mask)
{
	setStatus(MAKE_OBJECT_STATUS_MASK(OBJECT_STATUS_MASKED), mask);
}

Bool Object::checkAndDetonateBoobyTrap(const Object *)
{
	return FALSE;
}

Bool Object::isUsingAirborneLocomotor() const
{
	return FALSE;
}

void Object::onCapture(Player *, Player *)
{
}

void Object::onDie(DamageInfo *)
{
}

void Object::attemptDamage(DamageInfo *damageInfo)
{
	BodyModuleInterface *body = getBodyModule();
	if (body != NULL) {
		body->attemptDamage(damageInfo);
	}
}

void Object::attemptHealing(Real amount, const Object *source)
{
	BodyModuleInterface *body = getBodyModule();
	if (body != NULL) {
		DamageInfo damageInfo;
		damageInfo.in.m_damageType = DAMAGE_HEALING;
		damageInfo.in.m_deathType = DEATH_NONE;
		damageInfo.in.m_sourceID = source != NULL ? source->getID() : INVALID_ID;
		damageInfo.in.m_amount = amount;
		body->attemptHealing(&damageInfo);
	}
}

Bool Object::attemptHealingFromSoleBenefactor(
	Real amount,
	const Object *source,
	UnsignedInt duration)
{
	if (source == NULL) {
		return FALSE;
	}

	UnsignedInt now = TheGameLogic->getFrame();
	ObjectID id = source->getID();
	if (now > m_soleHealingBenefactorExpirationFrame ||
			m_soleHealingBenefactorID == id) {
		m_soleHealingBenefactorID = id;
		m_soleHealingBenefactorExpirationFrame = now + duration;

		BodyModuleInterface *body = getBodyModule();
		if (body != NULL) {
			DamageInfo damageInfo;
			damageInfo.in.m_damageType = DAMAGE_HEALING;
			damageInfo.in.m_deathType = DEATH_NONE;
			damageInfo.in.m_sourceID = id;
			damageInfo.in.m_amount = amount;
			body->attemptHealing(&damageInfo);
		}
		return TRUE;
	}
	return FALSE;
}

ObjectID Object::getSoleHealingBenefactor() const
{
	UnsignedInt now = TheGameLogic->getFrame();
	if (now > m_soleHealingBenefactorExpirationFrame) {
		return INVALID_ID;
	}
	return m_soleHealingBenefactorID;
}

Real Object::estimateDamage(DamageInfoInput &damageInfo) const
{
	BodyModuleInterface *body = getBodyModule();
	return body != NULL ? body->estimateDamage(damageInfo) : 0.0f;
}

void Object::kill(DamageType damageType, DeathType deathType)
{
	BodyModuleInterface *body = getBodyModule();
	if (body == NULL) {
		onDestroy();
		return;
	}

	DamageInfo damageInfo;
	damageInfo.in.m_damageType = damageType;
	damageInfo.in.m_deathType = deathType;
	damageInfo.in.m_sourceID = INVALID_ID;
	damageInfo.in.m_amount = body->getMaxHealth();
	damageInfo.in.m_kill = TRUE;
	attemptDamage(&damageInfo);
}

void Object::healCompletely()
{
	attemptHealing(HUGE_DAMAGE_AMOUNT, NULL);
	attemptHealing(HUGE_DAMAGE_AMOUNT, NULL);
}

void Object::notifySubdualDamage(Real)
{
}

void Object::doStatusDamage(ObjectStatusTypes, Real)
{
}

void Object::doTempWeaponBonus(WeaponBonusConditionType, UnsignedInt)
{
}

void Object::scoreTheKill(const Object *)
{
}

void Object::onVeterancyLevelChanged(VeterancyLevel, VeterancyLevel, Bool)
{
}

VeterancyLevel Object::getVeterancyLevel() const
{
	return LEVEL_REGULAR;
}

void Object::restoreOriginalTeam()
{
}

void Object::setTeam(Team *team)
{
	if (team == NULL && ThePlayerList != NULL && ThePlayerList->getNeutralPlayer() != NULL) {
		team = ThePlayerList->getNeutralPlayer()->getDefaultTeam();
	}
	m_team = team;
	m_originalTeamName = m_team != NULL ? m_team->getName() : AsciiString::TheEmptyString;
}

void Object::setTemporaryTeam(Team *team)
{
	setTeam(team);
}

Player *Object::getControllingPlayer() const
{
	return m_team != NULL ? m_team->getControllingPlayer() : NULL;
}

Relationship Object::getRelationship(const Object *that) const
{
	Player *player = getControllingPlayer();
	return player != NULL && that != NULL ?
		player->getRelationship(that->getTeam()) :
		NEUTRAL;
}

Color Object::getIndicatorColor() const
{
	return m_indicatorColor;
}

Color Object::getNightIndicatorColor() const
{
	return m_indicatorColor;
}

void Object::setCustomIndicatorColor(Color c)
{
	m_indicatorColor = c;
}

void Object::removeCustomIndicatorColor()
{
	m_indicatorColor = 0;
}

Bool Object::isLocallyControlled() const
{
	return FALSE;
}

Bool Object::isNeutralControlled() const
{
	Player *player = getControllingPlayer();
	return ThePlayerList != NULL && player == ThePlayerList->getNeutralPlayer();
}

void Object::friend_setUndetectedDefector(Bool status)
{
	if (status) {
		BitSet(m_privateStatus, UNDETECTED_DEFECTOR);
	} else {
		BitClear(m_privateStatus, UNDETECTED_DEFECTOR);
	}
}

void Object::setCaptured(Bool isCaptured)
{
	if (isCaptured) {
		BitSet(m_privateStatus, CAPTURED);
	} else {
		BitClear(m_privateStatus, CAPTURED);
	}
}

void Object::setGeometryInfo(const GeometryInfo &geom)
{
	m_geometryInfo = geom;
}

void Object::setGeometryInfoZ(Real newZ)
{
	m_geometryInfo.setMaxHeightAbovePosition(newZ);
}

void Object::onCollide(Object *, const Coord3D *, const Coord3D *)
{
}

Real Object::getCarrierDeckHeight() const
{
	return 0.0f;
}

SpawnBehaviorInterface *Object::getSpawnBehaviorInterface() const
{
	return NULL;
}

ProjectileUpdateInterface *Object::getProjectileUpdateInterface() const
{
	return NULL;
}

void Object::topple(const Coord3D *, Real, UnsignedInt)
{
}

Bool Object::isSalvageCrate() const
{
	return FALSE;
}

ProductionUpdateInterface *Object::getProductionUpdateInterface()
{
	return NULL;
}

DockUpdateInterface *Object::getDockUpdateInterface()
{
	return NULL;
}

SpecialPowerModuleInterface *Object::findSpecialPowerModuleInterface(SpecialPowerType) const
{
	return NULL;
}

SpecialPowerModuleInterface *Object::findAnyShortcutSpecialPowerModuleInterface() const
{
	return NULL;
}

SpecialAbilityUpdate *Object::findSpecialAbilityUpdate(SpecialPowerType) const
{
	return NULL;
}

SpecialPowerCompletionDie *Object::findSpecialPowerCompletionDie() const
{
	return NULL;
}

SpecialPowerUpdateInterface *Object::findSpecialPowerWithOverridableDestinationActive(SpecialPowerType) const
{
	return NULL;
}

SpecialPowerUpdateInterface *Object::findSpecialPowerWithOverridableDestination(SpecialPowerType) const
{
	return NULL;
}

CountermeasuresBehaviorInterface *Object::getCountermeasuresBehaviorInterface()
{
	return NULL;
}

const CountermeasuresBehaviorInterface *Object::getCountermeasuresBehaviorInterface() const
{
	return NULL;
}

void Object::setStatus(ObjectStatusMaskType objectStatus, Bool set)
{
	if (set) {
		m_status.set(objectStatus);
	} else {
		m_status.clear(objectStatus);
	}
}

void Object::updateUpgradeModules()
{
}

void Object::forceRefreshSubObjectUpgradeStatus()
{
}

void Object::setScriptStatus(ObjectScriptStatusBit bit, Bool set)
{
	if (set) {
		BitSet(m_scriptStatus, bit);
	} else {
		BitClear(m_scriptStatus, bit);
	}
}

void Object::setSelectable(Bool selectable)
{
	m_isSelectable = selectable;
}

Bool Object::isSelectable() const
{
	return m_isSelectable && !testStatus(OBJECT_STATUS_UNSELECTABLE);
}

Bool Object::isMassSelectable() const
{
	return isSelectable();
}

void Object::getHealthBoxPosition(Coord3D &pos) const
{
	pos = *getPosition();
}

Bool Object::getHealthBoxDimensions(Real &healthBoxHeight, Real &healthBoxWidth) const
{
	healthBoxHeight = m_geometryInfo.getMaxHeightAbovePosition();
	healthBoxWidth = m_geometryInfo.getBoundingCircleRadius();
	return TRUE;
}

void Object::setEffectivelyDead(Bool dead)
{
	if (dead) {
		BitSet(m_privateStatus, EFFECTIVELY_DEAD);
	} else {
		BitClear(m_privateStatus, EFFECTIVELY_DEAD);
	}
}

Bool Object::canCrushOrSquish(Object *, CrushSquishTestType) const
{
	return FALSE;
}

UnsignedByte Object::getCrusherLevel() const
{
	return getTemplate()->getCrusherLevel();
}

UnsignedByte Object::getCrushableLevel() const
{
	return getTemplate()->getCrushableLevel();
}

Bool Object::hasUpgrade(const UpgradeTemplate *) const
{
	return FALSE;
}

Bool Object::affectedByUpgrade(const UpgradeTemplate *) const
{
	return FALSE;
}

void Object::giveUpgrade(const UpgradeTemplate *)
{
}

void Object::removeUpgrade(const UpgradeTemplate *)
{
}

Bool Object::hasCountermeasures() const
{
	return FALSE;
}

void Object::reportMissileForCountermeasures(Object *)
{
}

ObjectID Object::calculateCountermeasureToDivertTo(const Object &)
{
	return INVALID_ID;
}

void Object::calcNaturalRallyPoint(Coord2D *pt)
{
	if (pt != NULL) {
		pt->x = getPosition()->x;
		pt->y = getPosition()->y;
	}
}

void Object::setLayer(PathfindLayerEnum layer)
{
	m_layer = layer;
}

void Object::setDestinationLayer(PathfindLayerEnum layer)
{
	m_destinationLayer = layer;
}

void Object::prependToList(Object **pListHead)
{
	m_prev = NULL;
	m_next = *pListHead;
	if (*pListHead != NULL) {
		(*pListHead)->m_prev = this;
	}
	*pListHead = this;
}

void Object::removeFromList(Object **pListHead)
{
	if (m_next != NULL) {
		m_next->m_prev = m_prev;
	}
	if (m_prev != NULL) {
		m_prev->m_next = m_next;
	} else if (pListHead != NULL) {
		*pListHead = m_next;
	}
	m_next = NULL;
	m_prev = NULL;
}

Bool Object::isInList(Object **pListHead) const
{
	for (Object *obj = pListHead != NULL ? *pListHead : NULL; obj != NULL; obj = obj->m_next) {
		if (obj == this) {
			return TRUE;
		}
	}
	return FALSE;
}

void Object::onPartitionCellChange()
{
}

void Object::handlePartitionCellMaintenance()
{
}

Real Object::getVisionRange() const
{
	return m_visionRange;
}

void Object::setVisionRange(Real newVisionRange)
{
	m_visionRange = newVisionRange;
}

Real Object::getShroudRange() const
{
	return m_shroudRange;
}

void Object::setShroudRange(Real newShroudRange)
{
	m_shroudRange = newShroudRange;
}

Real Object::getShroudClearingRange() const
{
	return m_shroudClearingRange;
}

void Object::setShroudClearingRange(Real newShroudClearingRange)
{
	m_shroudClearingRange = newShroudClearingRange;
}

void Object::setVisionSpied(Bool, Int)
{
}

void Object::friend_prepareForMapBoundaryAdjust()
{
}

void Object::friend_notifyOfNewMapBoundary()
{
}

RadarPriorityType Object::getRadarPriority() const
{
	return getTemplate()->getDefaultRadarPriority();
}

void Object::onContainedBy(Object *containedBy)
{
	m_containedBy = containedBy;
}

void Object::onRemovedFrom(Object *)
{
	m_containedBy = NULL;
}

Int Object::getTransportSlotCount() const
{
	return 0;
}

SpecialPowerModuleInterface *Object::getSpecialPowerModule(const SpecialPowerTemplate *) const
{
	return NULL;
}

void Object::doSpecialPower(const SpecialPowerTemplate *, UnsignedInt, Bool)
{
}

void Object::doSpecialPowerAtObject(const SpecialPowerTemplate *, Object *, UnsignedInt, Bool)
{
}

void Object::doSpecialPowerAtLocation(const SpecialPowerTemplate *, const Coord3D *, Real, UnsignedInt, Bool)
{
}

void Object::doSpecialPowerUsingWaypoints(const SpecialPowerTemplate *, const Waypoint *, UnsignedInt, Bool)
{
}

void Object::doCommandButton(const CommandButton *, CommandSourceType)
{
}

void Object::doCommandButtonAtObject(const CommandButton *, Object *, CommandSourceType)
{
}

void Object::doCommandButtonAtPosition(const CommandButton *, const Coord3D *, CommandSourceType)
{
}

void Object::doCommandButtonUsingWaypoints(const CommandButton *, const Waypoint *, CommandSourceType)
{
}

const AsciiString &Object::getCommandSetString() const
{
	return m_commandSetStringOverride.isEmpty() ?
		getTemplate()->friend_getCommandSetString() :
		m_commandSetStringOverride;
}

Bool Object::canProduceUpgrade(const UpgradeTemplate *)
{
	return FALSE;
}

void Object::reloadAllAmmo(Bool)
{
}

Bool Object::isOutOfAmmo() const
{
	return TRUE;
}

Bool Object::hasAnyWeapon() const
{
	return FALSE;
}

Bool Object::hasAnyDamageWeapon() const
{
	return FALSE;
}

Bool Object::hasWeaponToDealDamageType(DamageType) const
{
	return FALSE;
}

Real Object::getLargestWeaponRange() const
{
	return 0.0f;
}

UnsignedInt Object::getMostPercentReadyToFireAnyWeapon() const
{
	return 0;
}

Weapon *Object::getCurrentWeapon(WeaponSlotType *)
{
	return NULL;
}

const Weapon *Object::getCurrentWeapon(WeaponSlotType *) const
{
	return NULL;
}

void Object::setFiringConditionForCurrentWeapon() const
{
}

void Object::adjustModelConditionForWeaponStatus()
{
}

void Object::fireCurrentWeapon(Object *)
{
}

void Object::fireCurrentWeapon(const Coord3D *)
{
}

void Object::preFireCurrentWeapon(const Object *)
{
}

UnsignedInt Object::getLastShotFiredFrame() const
{
	return 0;
}

ObjectID Object::getLastVictimID() const
{
	return INVALID_ID;
}

Weapon *Object::findWaypointFollowingCapableWeapon()
{
	return NULL;
}

Bool Object::getAmmoPipShowingInfo(Int &numTotal, Int &numFull) const
{
	numTotal = 0;
	numFull = 0;
	return FALSE;
}

void Object::notifyFiringTrackerShotFired(const Weapon *, ObjectID)
{
}

CanAttackResult Object::getAbleToAttackSpecificObject(AbleToAttackType, const Object *, CommandSourceType, WeaponSlotType) const
{
	return ATTACKRESULT_NOT_POSSIBLE;
}

CanAttackResult Object::getAbleToUseWeaponAgainstTarget(AbleToAttackType, const Object *, const Coord3D *, CommandSourceType, WeaponSlotType) const
{
	return ATTACKRESULT_NOT_POSSIBLE;
}

Bool Object::chooseBestWeaponForTarget(const Object *, WeaponChoiceCriteria, CommandSourceType)
{
	return FALSE;
}

void Object::setModelConditionState(ModelConditionFlagType)
{
}

void Object::clearModelConditionState(ModelConditionFlagType)
{
}

void Object::clearAndSetModelConditionState(ModelConditionFlagType, ModelConditionFlagType)
{
}

void Object::setSpecialModelConditionState(ModelConditionFlagType, UnsignedInt)
{
}

void Object::clearSpecialModelConditionStates()
{
}

void Object::clearModelConditionFlags(const ModelConditionFlags &)
{
}

void Object::setModelConditionFlags(const ModelConditionFlags &)
{
}

void Object::clearAndSetModelConditionFlags(const ModelConditionFlags &, const ModelConditionFlags &)
{
}

void Object::setWeaponSetFlag(WeaponSetType wst)
{
	m_curWeaponSetFlags.set(wst);
}

void Object::clearWeaponSetFlag(WeaponSetType wst)
{
	m_curWeaponSetFlags.set(wst, 0);
}

void Object::setArmorSetFlag(ArmorSetType ast)
{
	if (m_body != NULL) {
		m_body->setArmorSetFlag(ast);
	}
}

void Object::clearArmorSetFlag(ArmorSetType ast)
{
	if (m_body != NULL) {
		m_body->clearArmorSetFlag(ast);
	}
}

Bool Object::testArmorSetFlag(ArmorSetType ast) const
{
	return m_body != NULL ? m_body->testArmorSetFlag(ast) : FALSE;
}

Bool Object::hasSpecialPower(SpecialPowerType) const
{
	return FALSE;
}

Bool Object::hasAnySpecialPower() const
{
	return FALSE;
}

void Object::setWeaponBonusCondition(WeaponBonusConditionType wst)
{
	m_weaponBonusCondition |= (1 << wst);
}

void Object::clearWeaponBonusCondition(WeaponBonusConditionType wst)
{
	m_weaponBonusCondition &= ~(1 << wst);
}

Bool Object::getSingleLogicalBonePosition(const char *, Coord3D *position, Matrix3D *) const
{
	if (position != NULL) {
		*position = *getPosition();
	}
	return TRUE;
}

Bool Object::getSingleLogicalBonePositionOnTurret(WhichTurretType, const char *, Coord3D *position, Matrix3D *transform) const
{
	return getSingleLogicalBonePosition(NULL, position, transform);
}

Int Object::getMultiLogicalBonePosition(const char *, Int, Coord3D *, Matrix3D *, Bool) const
{
	return 0;
}

Bool Object::didEnter(const PolygonTrigger *) const
{
	return FALSE;
}

Bool Object::didExit(const PolygonTrigger *) const
{
	return FALSE;
}

Bool Object::isInside(const PolygonTrigger *) const
{
	return FALSE;
}

ExitInterface *Object::getObjectExitInterface() const
{
	return NULL;
}

ObjectShroudStatus Object::getShroudedStatus(Int) const
{
	return OBJECTSHROUD_CLEAR;
}

Bool Object::clearDisabled(DisabledType type)
{
	if (type < 0 || type >= DISABLED_COUNT) {
		return FALSE;
	}
	if (!isDisabledByType(type)) {
		return FALSE;
	}
	if (type != DISABLED_HELD) {
		pauseAllSpecialPowers(FALSE);
	}
	m_disabledTillFrame[type] = NEVER;
	m_disabledMask.set(type, 0);
	checkDisabledStatus();
	if (!isDisabled()) {
		onDisabledEdge(FALSE);
	}
	return TRUE;
}

void Object::setDisabled(DisabledType type)
{
	setDisabledUntil(type, FOREVER);
}

void Object::setDisabledUntil(DisabledType type, UnsignedInt frame)
{
	Bool edge_case = !isDisabled();
	if (type < 0 || type >= DISABLED_COUNT) {
		return;
	}

	if (m_disabledTillFrame[type] != frame) {
		if (type != DISABLED_HELD && !isDisabledByType(type)) {
			pauseAllSpecialPowers(TRUE);
		}
		m_disabledTillFrame[type] = frame;
		m_disabledMask.set(type, frame > TheGameLogic->getFrame());
	}

	if (edge_case) {
		onDisabledEdge(TRUE);
	}
}

UnsignedInt Object::getDisabledUntil(DisabledType type) const
{
	if (type == DISABLED_ANY) {
		UnsignedInt highest_frame = 0;
		for (Int i = 0; i < DISABLED_COUNT; ++i) {
			if (m_disabledMask.test(i) &&
					m_disabledTillFrame[i] > highest_frame) {
				highest_frame = m_disabledTillFrame[i];
			}
		}
		return highest_frame;
	}
	return m_disabledMask.test(type) ? m_disabledTillFrame[type] : 0;
}

void Object::pauseAllSpecialPowers(const Bool) const
{
}

void Object::checkDisabledStatus()
{
	UnsignedInt now = TheGameLogic->getFrame();
	for (Int i = 0; i < DISABLED_COUNT; ++i) {
		DisabledType type = static_cast<DisabledType>(i);
		if (isDisabledByType(type) && now >= m_disabledTillFrame[i]) {
			clearDisabled(type);
			m_disabledMask.set(type, 0);
		}
	}
}

void Object::clearLeechRangeModeForAllWeapons()
{
}

Int Object::getNumConsecutiveShotsFiredAtTarget(const Object *) const
{
	return 0;
}

void Object::defect(Team *, UnsignedInt)
{
}

void Object::goInvulnerable(UnsignedInt time)
{
	const Bool WITHOUT_DEFECTOR_FX = FALSE;

	friend_setUndetectedDefector(time > 0);
	if (m_defectionHelper != NULL) {
		m_defectionHelper->startDefectionTimer(time, WITHOUT_DEFECTOR_FX);
	}
}

void Object::reactToTurretChange(WhichTurretType, Real, Real)
{
}

Bool Object::isStructure() const
{
	return isKindOf(KINDOF_STRUCTURE);
}

Bool Object::isFactionStructure() const
{
	return isStructure() && !isKindOf(KINDOF_BRIDGE);
}

Bool Object::isNonFactionStructure() const
{
	return isStructure() && isKindOf(KINDOF_BRIDGE);
}

Bool Object::isHero() const
{
	return isKindOf(KINDOF_HERO);
}

void Object::setReceivingDifficultyBonus(Bool receive)
{
	m_isReceivingDifficultyBonus = receive;
}

void Object::friend_adjustPowerForPlayer(Bool)
{
}

void Object::setOrRestoreTeam(Team *team, Bool)
{
	setTeam(team);
}

void Object::onDisabledEdge(Bool)
{
}

void Object::crc(Xfer *)
{
}

void Object::xfer(Xfer *)
{
}

void Object::loadPostProcess()
{
}

void Object::handleShroud()
{
}

void Object::handleValueMap()
{
}

void Object::handleThreatMap()
{
}

Module *Object::findModule(NameKeyType key) const
{
	if (m_behaviors == NULL) {
		return NULL;
	}
	for (BehaviorModule **module = m_behaviors; *module; ++module) {
		if ((*module)->getModuleNameKey() == key) {
			return *module;
		}
	}
	return NULL;
}

Bool Object::didEnterOrExit() const
{
	return FALSE;
}

void Object::setID(ObjectID id)
{
	m_id = id;
	if (TheGameLogic != NULL) {
		TheGameLogic->addObjectToLookupTable(this);
	}
}

Real Object::calculateHeightAboveTerrain() const
{
	const Coord3D *pos = getPosition();
	return pos != NULL && TheTerrainLogic != NULL ?
		pos->z - TheTerrainLogic->getLayerHeight(pos->x, pos->y, m_layer) :
		0.0f;
}

void Object::updateTriggerAreaFlags()
{
}

void Object::setTriggerAreaFlagsForChangeInPosition()
{
}

void Object::look()
{
}

void Object::unlook()
{
}

void Object::shroud()
{
}

void Object::unshroud()
{
}

void Object::addValue()
{
}

void Object::removeValue()
{
}

void Object::addThreat()
{
}

void Object::removeThreat()
{
}

void Object::reactToTransformChange(const Matrix3D *, const Coord3D *, Real)
{
	if (m_partitionData != NULL) {
		m_partitionData->makeDirty(true);
	}
}
