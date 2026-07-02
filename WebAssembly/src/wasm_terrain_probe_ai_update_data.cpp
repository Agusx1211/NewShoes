#include "PreRTS.h"

#include "Common/INI.h"
#include "Common/ThingTemplate.h"
#include "GameLogic/Module/AIUpdate.h"

AIUpdateModuleData::AIUpdateModuleData()
{
	for (int i = 0; i < MAX_TURRETS; ++i) {
		m_turretData[i] = NULL;
	}
	m_autoAcquireEnemiesWhenIdle = 0;
	m_moodAttackCheckRate = LOGICFRAMES_PER_SECOND * 2;
#ifdef ALLOW_SURRENDER
	m_surrenderDuration = LOGICFRAMES_PER_SECOND * 120;
#endif
	m_forbidPlayerCommands = FALSE;
	m_turretsLinked = FALSE;
}

AIUpdateModuleData::~AIUpdateModuleData()
{
}

const LocomotorTemplateVector *
AIUpdateModuleData::findLocomotorTemplateVector(LocomotorSetType t) const
{
	if (m_locomotorTemplates.empty()) {
		return NULL;
	}

	LocomotorTemplateMap::const_iterator it = m_locomotorTemplates.find(t);
	if (it == m_locomotorTemplates.end()) {
		return NULL;
	}
	return &(*it).second;
}

void AIUpdateModuleData::buildFieldParse(MultiIniFieldParse &p)
{
	ModuleData::buildFieldParse(p);
}

void AIUpdateModuleData::parseLocomotorSet(
	INI *,
	void *instance,
	void *,
	const void *)
{
	ThingTemplate *thing_template = static_cast<ThingTemplate *>(instance);
	if (thing_template == NULL || thing_template->friend_getAIModuleInfo() == NULL) {
		DEBUG_CRASH(("Attempted to specify a Locomotor without an AIUpdate block.\n"));
	}
	throw INI_INVALID_DATA;
}

void AIUpdateModuleData::parseTurret(INI *, void *, void *, const void *)
{
	throw INI_INVALID_DATA;
}
