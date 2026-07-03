/*
**	Command & Conquer Generals Zero Hour(tm)
**	Copyright 2025 Electronic Arts Inc.
**
**	This program is free software: you can redistribute it and/or modify
**	it under the terms of the GNU General Public License as published by
**	the Free Software Foundation, either version 3 of the License, or
**	(at your option) any later version.
**
**	This program is distributed in the hope that it will be useful,
**	but WITHOUT ANY WARRANTY; without even the implied warranty of
**	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
**	GNU General Public License for more details.
**
**	You should have received a copy of the GNU General Public License
**	along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

/*************************************************************************************************** 
 ***                  C O N F I D E N T I A L  ---  W E S T W O O D  S T U D I O S               *** 
 *************************************************************************************************** 
 *                                                                                                 * 
 *                     Project Name : G                                                            * 
 *                                                                                                 * 
 *                         $Archive::                                                             $* 
 *                                                                                                 * 
 *                          Creator::Scott K. Bowen - 7/15/2002                                        *
 *                                                                                                 * 
 *                          $Author::                                                             $* 
 *                                                                                                 * 
 *                         $Modtime::                                                             $* 
 *                                                                                                 * 
 *                        $Revision::                                                             $* 
 *                                                                                                 * 
 *-------------------------------------------------------------------------------------------------* 
 * Functions:                                                                                      * 
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  - - -  - - */

////////////////////////////////////////////////////////////////////////////////////////////////////
// Include files ///////////////////////////////////////////////////////////////////////////////////

#include "static_sort_list.h"

#include "rendobj.h"
#include "dx8renderer.h"

#ifdef __EMSCRIPTEN__
extern "C" void cnc_port_note_engine_update_target(const char *name) __attribute__((weak));
#define CNC_PORT_NOTE_STATIC_SORT_STEP(name) \
	do { \
		if (cnc_port_note_engine_update_target) { \
			cnc_port_note_engine_update_target(name); \
		} \
	} while (0)
#else
#define CNC_PORT_NOTE_STATIC_SORT_STEP(name) do { } while (0)
#endif

////////////////////////////////////////////////////////////////////////////////////////////////////
// Initialization Functions ////////////////////////////////////////////////////////////////////////

DefaultStaticSortListClass::DefaultStaticSortListClass(void) :
	StaticSortListClass(),
	SortLists(),
	MinSort(1),
	MaxSort(MAX_SORT_LEVEL)
{
}

DefaultStaticSortListClass::~DefaultStaticSortListClass(void)
{
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Virtual functions ///////////////////////////////////////////////////////////////////////////////

void DefaultStaticSortListClass::Add_To_List(RenderObjClass * robj, unsigned int sort_level)
{
	CNC_PORT_NOTE_STATIC_SORT_STEP("WW3D.staticSort.add.entry");
	if(sort_level < 1 || sort_level > MAX_SORT_LEVEL) {
		WWASSERT(0);
		CNC_PORT_NOTE_STATIC_SORT_STEP("WW3D.staticSort.add.invalid.return");
		return;
	}
	SortLists[sort_level].Add_Tail(robj, false);
	CNC_PORT_NOTE_STATIC_SORT_STEP("WW3D.staticSort.add.complete");
}

void DefaultStaticSortListClass::Render_And_Clear(RenderInfoClass & rinfo)
{
	CNC_PORT_NOTE_STATIC_SORT_STEP("WW3D.staticSort.render.entry");
	// We go from higher sort level to lower, since lower sort level means higher priority (in
	// front), so lower sort level meshes need to be rendered later.
	for(unsigned int sort_level = MaxSort; sort_level >= MinSort; sort_level--) {
		bool render=false;
		CNC_PORT_NOTE_STATIC_SORT_STEP("WW3D.staticSort.render.level.before");
		for (	RenderObjClass *robj = SortLists[sort_level].Remove_Head(); robj;
				robj->Release_Ref(), robj = SortLists[sort_level].Remove_Head())
		{
			CNC_PORT_NOTE_STATIC_SORT_STEP("WW3D.staticSort.render.object.before");
			if (robj->Get_Render_Hook()) {
				if (robj->Get_Render_Hook()->Pre_Render(robj, rinfo)) {
					robj->Render(rinfo);
					render = true;
				}
				robj->Get_Render_Hook()->Post_Render(robj, rinfo);
			} else {
				robj->Render(rinfo);
				render = true;
			}
			CNC_PORT_NOTE_STATIC_SORT_STEP("WW3D.staticSort.render.object.after");
		}
		if (render) {
			CNC_PORT_NOTE_STATIC_SORT_STEP("WW3D.staticSort.render.meshFlush.before");
			TheDX8MeshRenderer.Flush();
			CNC_PORT_NOTE_STATIC_SORT_STEP("WW3D.staticSort.render.meshFlush.after");
		}
		CNC_PORT_NOTE_STATIC_SORT_STEP("WW3D.staticSort.render.level.after");
	}
	CNC_PORT_NOTE_STATIC_SORT_STEP("WW3D.staticSort.render.complete");
}
