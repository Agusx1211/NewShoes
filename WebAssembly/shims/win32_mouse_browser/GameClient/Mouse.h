#pragma once

#include "Lib/BaseType.h"

enum MouseButtonState
{
	MBS_Up = 0,
	MBS_Down,
	MBS_DoubleClick,
};

#define MOUSE_NONE 0x00
#define MOUSE_OK 0x01
#define MOUSE_FAILED 0x80
#define MOUSE_LOST 0xFF

#define MAX_2D_CURSOR_DIRECTIONS 8

struct MouseIO
{
	ICoord2D pos;
	UnsignedInt time;
	Int wheelPos;
	ICoord2D deltaPos;
	MouseButtonState leftState;
	Int leftEvent;
	Int leftFrame;
	MouseButtonState rightState;
	Int rightEvent;
	Int rightFrame;
	MouseButtonState middleState;
	Int middleEvent;
	Int middleFrame;
};

class BrowserMouseCursorName
{
public:
	Bool isEmpty(void) const { return TRUE; }
	const char *str(void) const { return ""; }
};

class CursorInfo
{
public:
	BrowserMouseCursorName textureName;
	Int numDirections = 1;
};

class Mouse
{
public:
	enum MouseCursor
	{
		INVALID_MOUSE_CURSOR = -1,
		NONE = 0,
		FIRST_CURSOR,
		NORMAL = FIRST_CURSOR,
		ARROW,
		SCROLL,
		CROSS,
		MOVETO,
		ATTACKMOVETO,
		ATTACK_OBJECT,
		FORCE_ATTACK_OBJECT,
		FORCE_ATTACK_GROUND,
		BUILD_PLACEMENT,
		INVALID_BUILD_PLACEMENT,
		GENERIC_INVALID,
		SELECTING,
		ENTER_FRIENDLY,
		ENTER_AGGRESSIVELY,
		SET_RALLY_POINT,
		GET_REPAIRED,
		GET_HEALED,
		DO_REPAIR,
		RESUME_CONSTRUCTION,
		CAPTUREBUILDING,
		SNIPE_VEHICLE,
		LASER_GUIDED_MISSILES,
		TANKHUNTER_TNT_ATTACK,
		STAB_ATTACK,
		PLACE_REMOTE_CHARGE,
		PLACE_TIMED_CHARGE,
		DEFECTOR,
		DOCK,
		FIRE_FLAME,
		FIRE_BOMB,
		PLACE_BEACON,
		DISGUISE_AS_VEHICLE,
		WAYPOINT,
		OUTRANGE,
		STAB_ATTACK_INVALID,
		PLACE_CHARGE_INVALID,
		HACK,
		PARTICLE_UPLINK_CANNON,
		NUM_MOUSE_CURSORS,
	};

	enum { NUM_MOUSE_EVENTS = 256 };

	Mouse(void)
		: m_inputMovesAbsolute(FALSE),
			m_visible(TRUE),
			m_currentCursor(NONE)
	{
	}

	virtual ~Mouse(void) {}

	virtual void init(void) {}
	virtual void reset(void) {}
	virtual void update(void) {}
	virtual void initCursorResources(void) = 0;
	virtual void setCursor(MouseCursor cursor) { m_currentCursor = cursor; }
	virtual void capture(void) = 0;
	virtual void releaseCapture(void) = 0;
	virtual void setVisibility(Bool visible) { m_visible = visible; }
	virtual void setMouseLimits(void) {}

	MouseCursor getMouseCursor(void) { return m_currentCursor; }

protected:
	virtual UnsignedByte getMouseEvent(MouseIO *result, Bool flush) = 0;

	CursorInfo m_cursorInfo[NUM_MOUSE_CURSORS];
	Bool m_inputMovesAbsolute;
	Bool m_visible;
	MouseCursor m_currentCursor;
};

extern Mouse *TheMouse;
