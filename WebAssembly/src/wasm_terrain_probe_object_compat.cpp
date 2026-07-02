#include "PreRTS.h"

#include "GameClient/Drawable.h"
#include "GameLogic/AI.h"
#include "GameLogic/Module/AIUpdate.h"
#include "GameLogic/Weapon.h"

AICommandParms::AICommandParms(AICommandType cmd, CommandSourceType cmdSource) :
	m_cmd(cmd),
	m_cmdSource(cmdSource),
	m_obj(NULL),
	m_otherObj(NULL),
	m_team(NULL),
	m_waypoint(NULL),
	m_polygon(NULL),
	m_intValue(0),
	m_commandButton(NULL),
	m_path(NULL)
{
	m_pos.zero();
	m_coords.clear();
}

Bool AIUpdateInterface::isMoving() const
{
	return FALSE;
}

Weapon::Weapon(const WeaponTemplate *tmpl, WeaponSlotType wslot) :
	m_template(tmpl),
	m_wslot(wslot),
	m_status(OUT_OF_AMMO),
	m_ammoInClip(0),
	m_whenWeCanFireAgain(0),
	m_whenPreAttackFinished(0),
	m_whenLastReloadStarted(0),
	m_lastFireFrame(0),
	m_suspendFXFrame(0),
	m_projectileStreamID(INVALID_ID),
	m_maxShotCount(NO_MAX_SHOTS_LIMIT),
	m_curBarrel(0),
	m_numShotsForCurBarrel(0),
	m_pitchLimited(FALSE),
	m_leechWeaponRangeActive(FALSE)
{
}

Weapon::~Weapon()
{
}

void Weapon::crc(Xfer *)
{
}

void Weapon::xfer(Xfer *)
{
}

void Weapon::loadPostProcess()
{
}

void Drawable::reactToBodyDamageStateChange(BodyDamageType)
{
}
