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

////////////////////////////////////////////////////////////////////////////////
//																																						//
//  (c) 2001-2003 Electronic Arts Inc.																				//
//																																						//
////////////////////////////////////////////////////////////////////////////////

// FILE: W3DWaterTracks.cpp ////////////////////////////////////////////////
//-----------------------------------------------------------------------------
//                                                                          
//                       Westwood Studios Pacific.                          
//                                                                          
//                       Confidential Information                           
//                Copyright (C) 2001 - All Rights Reserved                  
//                                                                          
//-----------------------------------------------------------------------------
//
// Project:   RTS3
//
// File name: W3DWaterTracks.cpp
//
// Created:   Mark Wilczynski, July 2001
//
// Desc:      Draw waves and splash marks on water surface.  System allows for
//			  some simple animation : dynamic uv coordinates, scaling, scrolling,
//			  and alpha.
//-----------------------------------------------------------------------------

#include "W3DDevice/GameClient/heightmap.h"
#include "W3DDevice/GameClient/W3DWaterTracks.h"
#include "W3DDevice/GameClient/W3DShaderManager.h"
#include "W3DDevice/GameClient/W3DShroud.h"
#include "GameClient/InGameUI.h"
#include "GameClient/Water.h"
#include "GameLogic/TerrainLogic.h"
#include "common/GlobalData.h"
#include "common/UnicodeString.h"
#include "Common/File.h"
#include "Common/FileSystem.h"
#include "texture.h"
#include "colmath.h"
#include "coltest.h"
#include "rinfo.h"
#include "camera.h"
#include "assetmgr.h"
#include "WW3D2/DX8Wrapper.h"

#ifdef __EMSCRIPTEN__
extern "C" void cnc_port_note_engine_update_target(const char *name) __attribute__((weak));
#define CNC_PORT_NOTE_WATER_TRACK_STEP(name) \
	do { \
		if (cnc_port_note_engine_update_target) { \
			cnc_port_note_engine_update_target(name); \
		} \
	} while (0)
#else
#define CNC_PORT_NOTE_WATER_TRACK_STEP(name) do { } while (0)
#endif

//#pragma optimize("", off)

//#define ALLOW_WATER_TRACK_EDIT

//number of vertex pages allocated - allows double buffering of vertex updates.
//while one is being rendered, another is being updated.  Improves HW parallelism.
#define WATER_VB_PAGES	1000
#define WATER_STRIP_X	2		//vertex resolution of each strip
#define WATER_STRIP_Y	2		
#define SYNC_WAVES			//all the waves are in sync - movement resets at same time.
//#define DEFAULT_FINAL_WAVE_WIDTH	28.0f
//#define DEFAULT_FINAL_WAVE_HEIGHT	18.0f
//#define DEFAULT_SECOND_WAVE_TIME_OFFSET 6267	//should always be half of totalMs

WaterTracksRenderSystem *TheWaterTracksRenderSystem=NULL;	///< singleton for track drawing system.

static Bool pauseWaves=FALSE;

enum waveType : Int
{
	WaveTypeFirst,
	WaveTypePond=WaveTypeFirst,
	WaveTypeOcean,
	WaveTypeCloseOcean,	//same as above but appears much closer to beach.
	WaveTypeCloseOceanDouble,	//same as above but waves much sloser together.
	WaveTypeRadial,
	WaveTypeLast = WaveTypeRadial,
	WaveTypeStationary,
	WaveTypeMax,
};

struct waveInfo
{
	Real m_finalWidth;				//final width of of wave when it reaches beach.
	Real m_finalHeight;				//final height of wave after it stretched out on beach.
	Real m_waveDistance;			//distance away from beach where wave starts.
	Real m_initialVelocity;
	Int m_fadeMs;					//time to fade out wave after it stops on shore.
	Real m_initialWidthFraction;	//fraction of m_finalWidth when wave first appears.
	Real m_initialHeightWidthFraction;	//fraction of initial width to use as the initial height.
	Int m_timeToCompress;			//time for back of wave to continue moving forward after front starts retreating.
	Int m_secondWaveTimeOffset;		//time for second wave to start.  Should always be half of first wave's TotalMs.
	char *m_textureName;			//name of texture to use on wave.
	char *m_waveTypeName;			//name of this wave type.
};

waveInfo waveTypeInfo[WaveTypeMax]=
{
	{28.0f, 18.0f, 25.0f, 0.018f, 900, 0.01f, 0.18f, 1500, 0,"wave256.tga","Pond"},	//pond
	{55.0f, 36.0f, 80.0f, 0.015f, 2000, 0.5f, 0.18f, 1000, 6267,"wave256.tga","Ocean"},	//ocean
	{55.0f, 36.0f, 80.0f, 0.015f, 2000, 0.05f, 0.18f, 1000, 6267,"wave256.tga","Close Ocean"},
	{55.0f, 36.0f, 80.0f, 0.015f, 4000, 0.01f, 0.18f, 2000, 6267,"wave256.tga","Close Ocean Double"},
	{55.0f, 27.0f, 80.0f, 0.015f, 2000, 0.01f, 8.0f, 2000, 5367,"wave256.tga","Radial"},
};

//=============================================================================
// WaterTracksObj::~WaterTracksObj
//=============================================================================
/** Destructor. Releases w3d assets. */
//=============================================================================
WaterTracksObj::~WaterTracksObj(void)
{
	freeWaterTracksResources();
}

//=============================================================================
// WaterTracksObj::WaterTracksObj
//=============================================================================
/** Constructor. Just nulls out some variables. */
//=============================================================================
WaterTracksObj::WaterTracksObj(void)
{
	m_stageZeroTexture=NULL;
	m_bound=false;
	m_initTimeOffset=0;
}

//=============================================================================
// WaterTracksObj::Get_Obj_Space_Bounding_Sphere
//=============================================================================
/** WW3D method that returns object bounding sphere used in frustum culling*/
//=============================================================================
void WaterTracksObj::Get_Obj_Space_Bounding_Sphere(SphereClass & sphere) const
{	/// @todo: Add code to cull track marks to screen by constantly updating bounding volumes
	sphere=m_boundingSphere;
}

//=============================================================================
// WaterTracksObj::Get_Obj_Space_Bounding_Box
//=============================================================================
/** WW3D method that returns object bounding box used in collision detection*/
//=============================================================================
void WaterTracksObj::Get_Obj_Space_Bounding_Box(AABoxClass & box) const
{
	box=m_boundingBox;
}

//=============================================================================
// WaterTracksObj::freeWaterTracksResources
//=============================================================================
/** Free any W3D resources associated with this object */
//=============================================================================
Int WaterTracksObj::freeWaterTracksResources(void)
{
	REF_PTR_RELEASE(m_stageZeroTexture);
	return 0;
}

//=============================================================================
// WaterTracksObj::init
//=============================================================================
/** Setup size settings and allocate W3D texture
*	The width/length define the size of the polygon quad which will contain
*	the specified texture.
 */
//=============================================================================
void WaterTracksObj::init( Real width, Real length, Vector2 &start, Vector2 &end, Char *texturename, Int waveTimeOffset)
{	
	freeWaterTracksResources();	//free old resources used by this track

	//save original settings used to create this wave
	m_initStartPos = start;
	m_initEndPos = end;
	m_initTimeOffset = waveTimeOffset;

	m_boundingSphere.Init(Vector3(0,0,0),400);
	m_boundingBox.Center.Set(0.0f, 0.0f, 0.0f);
	m_boundingBox.Extent.Set(400.0f, 400.0f, 1.0f);
	m_x=WATER_STRIP_X;
	m_y=WATER_STRIP_Y;
	m_elapsedMs=m_initTimeOffset;
	m_startPos=start;
	m_perpDir=m_waveDir=end-start;
	m_perpDir.Rotate(-1.57079632679f);	//get vector perpendicular to wave motion.
	m_perpDir.Normalize();

	m_waveDir=m_perpDir;
	m_waveDir.Rotate(PI/2);	//get vector along wave travel direction.
	//move back by width of wave so start point turns into maximum reach of wave.
	//m_startPos -= m_waveDir*m_width;
	//move back initial tip off of wave a couple units off the final position
	//to give it some room to travel. Travel vector is stored in m_waveDir.
	m_waveDistance = waveTypeInfo[m_type].m_waveDistance;	//total distance traveled by wave front

	m_waveDir *= m_waveDistance;
	m_startPos -= m_waveDir;	//move start point down away from shoreline

	m_initialVelocity=waveTypeInfo[m_type].m_initialVelocity;			//velocity per ms
	m_totalMs = m_waveDistance/m_initialVelocity; //amount of time for wave to travel complete distance

	m_fadeMs = waveTypeInfo[m_type].m_fadeMs;		//time for wave to fade out after it stops on beach

	m_waveInitialWidth=length * waveTypeInfo[m_type].m_initialWidthFraction;///<width of wave segment when it first appears
	m_waveInitialHeight=m_waveInitialWidth * waveTypeInfo[m_type].m_initialHeightWidthFraction;	///<height of wave segment when it first appears
	m_waveFinalWidth=length;	///<width of wave segment at full size
	m_waveFinalHeight=width;		///<final height of unstretched wave

	//get total time for front to complete its cycle
	m_timeToReachBeach=(m_waveDistance - m_waveFinalHeight)/m_initialVelocity;
	m_frontSlowDownAcc= -(m_initialVelocity*m_initialVelocity)/(2*m_waveFinalHeight);	//deceleration of wave after it hits land
	m_timeToStop = -m_initialVelocity/m_frontSlowDownAcc;
	m_timeToRetreat = sqrt(fabs(2.0f*m_waveFinalHeight/m_frontSlowDownAcc));
	m_totalMs = m_timeToReachBeach + m_timeToStop + m_timeToRetreat;	//total time that wave front is on screen
	m_backSlowDownAcc = (2.0f*m_waveInitialHeight/(m_timeToStop*m_timeToStop));//((m_waveInitialHeight - m_velocity*m_timeToStop)*2.0f)/(m_timeToStop*m_timeToStop);
	m_timeToCompress = waveTypeInfo[m_type].m_timeToCompress;	//time for back of wave to continue moving forward after front starts retreating.


	if (m_type == WaveTypeStationary)
	{	//this is a stationary wave slightly behind starting point
		m_timeToRetreat = 1000; //time to fade out.
		m_totalMs = m_timeToReachBeach + m_timeToStop+m_fadeMs+m_timeToRetreat;	//trigger when other wave stops.
		m_startPos = start;
		m_fadeMs = 1000;		//time for wave to fade out after it stops on beach
	}

	m_stageZeroTexture=WW3DAssetManager::Get_Instance()->Get_Texture(texturename);
}

//=============================================================================
// WaterTracksObj::init
//=============================================================================
/** Setup size settings and allocate W3D texture
*	Alternate version of init where:
*	(start, end) define a vector perpendicular to wave travel.  The length of this
*	vector is used as the length of the wave segment.  The line between start-end
*	defines the maximum distance the wave will reach.
 */
//=============================================================================
void WaterTracksObj::init( Real width, Vector2 &start, Vector2 &end, Char *texturename)
{	
	freeWaterTracksResources();	//free old resources used by this track
	m_boundingSphere.Init(Vector3(0,0,0),400);
	m_boundingBox.Center.Set(0.0f, 0.0f, 0.0f);
	m_boundingBox.Extent.Set(400.0f, 400.0f, 1.0f);
	m_perpDir=end-start;
	m_startPos=start + m_perpDir*0.5f;	//move start point to middle
	Real length=m_perpDir.Length();
	m_perpDir *= 1.0f/length;	//normalize it.
	m_waveDir=m_perpDir;
	m_waveDir.Rotate(PI/2);	//get vector along wave travel direction.
	m_startPos -= m_waveDir*width;	//move back by width of wave
	m_waveDir *= 1.3f*MAP_XY_FACTOR;	//travel 4 units
	m_startPos -= m_waveDir;	//move start point down away from shoreline
	m_x=WATER_STRIP_X;
	m_y=WATER_STRIP_Y;
	m_elapsedMs=0;
	m_initialVelocity=0.001f*MAP_XY_FACTOR;		//velocity per ms
	m_totalMs=m_waveDir.Length()/m_initialVelocity;
	m_fadeMs = 3000;		//time for wave to fade out after it stops on beach

	m_stageZeroTexture=WW3DAssetManager::Get_Instance()->Get_Texture(texturename);
}

//=============================================================================
// WaterTracksObj::update
//=============================================================================
/** Update state of object - advance animations and other states.
 */
//=============================================================================
Int WaterTracksObj::update(Int msElapsed)
{
#ifdef	ALLOW_WATER_TRACK_EDIT
//	if (pauseWaves)
//		m_elapsedMs = m_timeToReachBeach+m_timeToStop;
//	else
#endif

	//nothing to do here...most of the work is done on render.
	m_elapsedMs += msElapsed;	//advance time for this update

	///@todo: Should check in here if we are done with this object are return FALSE to free it.
	//	return FALSE;

	return TRUE;	//assume we had an update
}

#define waveInitialV = 0.01f
#define waveAcceleration = -0.01f

//=============================================================================
// WaterTracksObj::render
//=============================================================================
/** Appends this object's vertices in its current state to the shared dynamic VB.
 */
//=============================================================================

Int WaterTracksObj::render(DX8VertexBufferClass	*vertexBuffer, Int batchStart)
{
	CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.obj.entry");
	VertexFormatXYZDUV1 *vb;

	if (batchStart < (WATER_VB_PAGES*WATER_STRIP_X*WATER_STRIP_Y-m_x*m_y))
	{	//we have room in current VB, append new verts
		CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.obj.lockNoOverwrite.before");
		if(vertexBuffer->Get_DX8_Vertex_Buffer()->Lock(batchStart*vertexBuffer->FVF_Info().Get_FVF_Size(),m_x*m_y*vertexBuffer->FVF_Info().Get_FVF_Size(),(unsigned char**)&vb,D3DLOCK_NOOVERWRITE) != D3D_OK)
		{
			CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.obj.lockNoOverwrite.failed");
			return batchStart;
		}
		CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.obj.lockNoOverwrite.after");
	}
	else
	{	//ran out of room in last VB, request a substitute VB.
		CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.obj.lockDiscard.before");
		if(vertexBuffer->Get_DX8_Vertex_Buffer()->Lock(0,m_x*m_y*vertexBuffer->FVF_Info().Get_FVF_Size(),(unsigned char**)&vb,D3DLOCK_DISCARD) != D3D_OK)
		{
			CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.obj.lockDiscard.failed");
			return batchStart;
		}
		CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.obj.lockDiscard.after");
		batchStart=0;	//reset start of page to first vertex
	}

	const Int vertsWritten = writeVertices(vb);

	CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.obj.unlock.before");
	vertexBuffer->Get_DX8_Vertex_Buffer()->Unlock();
	CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.obj.unlock.after");

	CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.obj.complete");
	return batchStart+vertsWritten;	//return new offset into unused area of vertex buffer
}

Int WaterTracksObj::writeVertices(VertexFormatXYZDUV1 *vb)
{
	Vector2	waveTailOrigin,waveFrontOrigin;
	Real	ooWaveDirLen=1.0f/m_waveDir.Length();	//one over length
	Real	waterHeight;
	Real	waveAlpha;
	Real	widthFrac;
	Real	heightFrac;

	//Adjust wave position in a non-linear way so that it slows down as it hits the target.  Using 1/4 sine wave
	//seems to work okay since it maxes out at 1.0 at our final position.
	//Real	timeFrac=(Real)m_elapsedMs/(Real)m_totalMs;//sinf(0.5f*3.14159f*(Real)m_elapsedMs/(Real)m_totalMs);

	//Real displacement=m_elapsedMs*waveInitialV+0.5*waveAcceleration*m_elapsed*m_elapsed;

	heightFrac=1.0f;
	widthFrac = 1.0f;

	CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.obj.position.before");
	if (m_type == WaveTypeStationary)
	{	//stationary wave
		waveFrontOrigin = m_startPos;
		waveFrontOrigin -= m_perpDir*m_waveFinalWidth*0.5f;	//offset to left edge of wave
		waveTailOrigin = waveFrontOrigin - m_waveFinalHeight * ooWaveDirLen*m_waveDir;
		waveAlpha = 0.0f;

		if (m_elapsedMs >= m_totalMs)
			m_elapsedMs = 0;	//done with effect*/
		if (m_elapsedMs > (m_timeToReachBeach + m_timeToStop -1000 + m_fadeMs))
		{	//fading out
			waveAlpha = m_elapsedMs-(m_timeToReachBeach + m_timeToStop - 1000 +m_fadeMs);//(m_totalMs-m_timeToRetreat -m_fadeMs - m_elapsedMs)/m_fadeMs;
			waveAlpha = waveAlpha / m_timeToRetreat;
			waveAlpha = 1.0f - waveAlpha;
			if (waveAlpha < 0.0f)
				waveAlpha = 0.0f;
		}
		else
		if (m_elapsedMs > (m_timeToReachBeach + m_timeToStop - 1000))
		{	//start fading up
			
			waveAlpha = m_elapsedMs-(m_timeToReachBeach + m_timeToStop - 1000);//(m_totalMs-m_timeToRetreat -m_fadeMs - m_elapsedMs)/m_fadeMs;
			waveAlpha = waveAlpha / m_fadeMs;
			if (waveAlpha > 1.0f)
				waveAlpha = 1.0f;
		}
	}
	else
	{	//moving wave

		//get coordinate of top left of wave strip
		if (m_elapsedMs < m_timeToReachBeach)
		{	//wave has not reached beach yet so position only depends on velocity
			waveAlpha = m_elapsedMs / m_timeToReachBeach;
			widthFrac = waveAlpha;
			widthFrac=(m_waveInitialWidth + widthFrac* (m_waveFinalWidth-m_waveInitialWidth))/m_waveFinalWidth;

			waveFrontOrigin = m_startPos + m_initialVelocity*m_elapsedMs*ooWaveDirLen*m_waveDir;
			waveFrontOrigin -= m_perpDir*m_waveFinalWidth*0.5f*widthFrac;	//offset to left edge of wave
			//Tail of wave will be behind the front by fixed amount.
			waveTailOrigin = waveFrontOrigin - m_waveInitialHeight * ooWaveDirLen*m_waveDir;
		}
		else	//wave has reached beach and is decelerating
		if (m_elapsedMs < m_totalMs)
		{	waveAlpha = 1.0f;
			widthFrac = 1.0f;
			//Get position of wave when it hit the beach
			waveFrontOrigin = m_startPos + m_initialVelocity*m_timeToReachBeach*ooWaveDirLen*m_waveDir;
			waveTailOrigin = waveFrontOrigin;	//store position for calculating tail position
			//Add movement after it hit the beach	
			Real elapsedMs=m_elapsedMs - m_timeToReachBeach;
			waveFrontOrigin += (m_initialVelocity*elapsedMs+0.5f*m_frontSlowDownAcc*elapsedMs*elapsedMs)*ooWaveDirLen*m_waveDir;
			waveFrontOrigin -= m_perpDir*m_waveFinalWidth*0.5f*widthFrac;	//offset to left edge of wave

			Real timeSinceBacktrack = m_elapsedMs - m_timeToReachBeach - m_timeToStop;
			if (timeSinceBacktrack < 0)
				timeSinceBacktrack = 0;
			waveAlpha = timeSinceBacktrack/m_fadeMs;
			if (waveAlpha > 1.0f)
				waveAlpha = 1.0f;

			waveAlpha = 1.0f - waveAlpha;

			//Get position of tail when front hits the beach.
			waveTailOrigin -= m_waveInitialHeight * ooWaveDirLen*m_waveDir;

			if (m_elapsedMs > (m_timeToReachBeach+m_timeToStop+m_timeToCompress))
			{	elapsedMs=elapsedMs;	///@todo: bug?
				waveTailOrigin += (0.5f*m_backSlowDownAcc*(m_timeToStop+m_timeToCompress)*(m_timeToStop+m_timeToCompress))*ooWaveDirLen*m_waveDir;
				//get time since wave should have stopped moving forward
				Real newElapsed = m_elapsedMs - (m_timeToReachBeach+m_timeToStop+m_timeToCompress);
				waveTailOrigin += (0.5f*m_frontSlowDownAcc*newElapsed*newElapsed)*ooWaveDirLen*m_waveDir;
			}
			else
	//		if (m_elapsedMs < (m_totalMs-m_timeToRetreat))
				//find position of tail including slowdown after it hit the beach
	//		waveTailOrigin += (m_initialVelocity*elapsedMs+0.5f*m_backSlowDownAcc*elapsedMs*elapsedMs)*ooWaveDirLen*m_waveDir;
			waveTailOrigin += (0.5f*m_backSlowDownAcc*elapsedMs*elapsedMs)*ooWaveDirLen*m_waveDir;

			waveTailOrigin -= m_perpDir*m_waveFinalWidth*0.5f*widthFrac;	//offset to left edge of wave
		}
		else
		{	m_elapsedMs = 0;
			waveAlpha = m_elapsedMs / m_timeToReachBeach;
			widthFrac = waveAlpha;
			widthFrac=(m_waveInitialWidth + widthFrac* (m_waveFinalWidth-m_waveInitialWidth))/m_waveFinalWidth;

			waveFrontOrigin = m_startPos + m_initialVelocity*m_elapsedMs*ooWaveDirLen*m_waveDir;
			waveFrontOrigin -= m_perpDir*m_waveFinalWidth*0.5f*widthFrac;	//offset to left edge of wave
			//Tail of wave will be behind the front by fixed amount.
			waveTailOrigin = waveFrontOrigin - m_waveInitialHeight * ooWaveDirLen*m_waveDir;
		}
	}
	CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.obj.position.after");

	//First insert tail of wave:
	Vector2 testPoint(waveTailOrigin);
	CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.obj.waterHeight.before");
	TheTerrainLogic->isUnderwater(testPoint.X,testPoint.Y,&waterHeight);
	CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.obj.waterHeight.after");
	CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.obj.vertexWrite.before");
	vb->x=	testPoint.X;
	vb->y=	testPoint.Y;
	vb->z=waterHeight+1.5f;
	vb->diffuse=(REAL_TO_INT(waveAlpha*255.0f)<<24) |0xffffff;
	if (m_flipU)
		vb->u1=1;	
	else
		vb->u1=0;	
	vb->v1=0;	
	vb++;
	testPoint.Set(waveTailOrigin + m_perpDir*m_waveFinalWidth*widthFrac);
	vb->x=	testPoint.X;
	vb->y=	testPoint.Y;
	vb->z=waterHeight+1.5f;
	vb->diffuse=(REAL_TO_INT(waveAlpha*255.0f)<<24) |0xffffff;
	if (m_flipU)
		vb->u1=0.0f;
	else
		vb->u1=1.0f;
	vb->v1=0;
	vb++;
	//insert front of wave
	testPoint.Set(waveFrontOrigin);
	vb->x=	testPoint.X;
	vb->y=	testPoint.Y;
	vb->z=waterHeight+1.5f;
	vb->diffuse=(REAL_TO_INT(waveAlpha*255.0f)<<24) |0xffffff;
	if (m_flipU)
		vb->u1=1;
	else
		vb->u1=0;
	vb->v1=1.0f;
	vb++;
	testPoint.Set(waveFrontOrigin + m_perpDir*m_waveFinalWidth*widthFrac);
	vb->x=	testPoint.X;
	vb->y=	testPoint.Y;
	vb->z=waterHeight+1.5f;
	vb->diffuse=(REAL_TO_INT(waveAlpha*255.0f)<<24) |0xffffff;
	if (m_flipU)
		vb->u1=0;
	else
		vb->u1=1.0f;
	vb->v1=1.0f;
	vb++;
	CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.obj.vertexWrite.after");

	return m_x*m_y;
}

static void DrawWaterTrackBatch(DX8IndexBufferClass *indexBuffer, Int batchDrawStart, Int batchTrackCount, Int trianglesPerTrack, Int verticesPerTrack)
{
	if (batchTrackCount <= 0)
		return;

	CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.batchDraw.before");
	DX8Wrapper::Set_Index_Buffer(indexBuffer,(UnsignedShort)batchDrawStart);
	DX8Wrapper::Draw_Triangles(0,trianglesPerTrack*batchTrackCount,0,verticesPerTrack*batchTrackCount);
	CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.batchDraw.after");
}

//=============================================================================
//WaterTracksRenderSystem::bindTrack
//=============================================================================
/** Grab a track from the free store. If no free tracks exist, return NULL.
	As long as a track is bound to an object (like a tank) it is ready to accept
	updates with additional edges.  Once it is unbound, it will expire and return
	to the free store once all tracks have faded out.
*/
//=============================================================================
WaterTracksObj *WaterTracksRenderSystem::bindTrack(waveType type)
{
	WaterTracksObj *mod,*nextmod,*prevmod;

	mod = m_freeModules;
	if( mod )
	{
		// take module off the free list
		if( mod->m_nextSystem )
			mod->m_nextSystem->m_prevSystem = mod->m_prevSystem;
		if( mod->m_prevSystem )
			mod->m_prevSystem->m_nextSystem = mod->m_nextSystem;
		else
			m_freeModules = mod->m_nextSystem;

		mod->m_type=type;

		// put module on the used list (sorted next to similar types)
		nextmod=NULL,prevmod=NULL;
		for( nextmod = m_usedModules; nextmod; prevmod=nextmod,nextmod = nextmod->m_nextSystem )
		{
			if (nextmod->m_type==type)
			{	//found start of other shadows using same texture, insert new shadow here.
				mod->m_nextSystem=nextmod;
				mod->m_prevSystem=prevmod;
				nextmod->m_prevSystem=mod;
				if (prevmod)
				{	prevmod->m_nextSystem=mod;
				}
				else
					m_usedModules=mod;
				break;
			}
		}

		if (nextmod==NULL)
		{	//shadow with new texture. Add to top of list.
			mod->m_nextSystem = m_usedModules;
			if (m_usedModules)
				m_usedModules->m_prevSystem=mod;
			m_usedModules = mod;
		}
	
		mod->m_bound=true;
	}  // end if

	#ifdef SYNC_WAVES
	nextmod=m_usedModules;

	while(nextmod)
	{
		nextmod->m_elapsedMs=nextmod->m_initTimeOffset;
		nextmod=nextmod->m_nextSystem;
	}  // end while
	#endif

	return mod;
}  //end bindTrack

//=============================================================================
//WaterTracksRenderSystem::unbindTrack
//=============================================================================
/** Called when an object (i.e Tank) will not lay down any more tracks and
doesn't need this object anymore.  The track-laying object will be returned
to pool of available tracks as soon as any remaining track edges have faded out.
*/
//=============================================================================
void WaterTracksRenderSystem::unbindTrack( WaterTracksObj *mod )
{
	//this object should return to free store as soon as there is nothing
	//left to render.
	mod->m_bound=false;
	releaseTrack(mod);
}

//=============================================================================
//WaterTracksRenderSystem::releaseTrack
//=============================================================================
/** Returns a track laying object to free store to be used again later.
*/
void WaterTracksRenderSystem::releaseTrack( WaterTracksObj *mod )
{
	if (mod==NULL)
		return;
	
	assert(mod->m_bound == false);

	// remove module from used list
	if( mod->m_nextSystem )
		mod->m_nextSystem->m_prevSystem = mod->m_prevSystem;
	if( mod->m_prevSystem )
		mod->m_prevSystem->m_nextSystem = mod->m_nextSystem;
	else
		m_usedModules = mod->m_nextSystem;

	// add module to free list
	mod->m_prevSystem = NULL;
	mod->m_nextSystem = m_freeModules;
	if( m_freeModules )
		m_freeModules->m_prevSystem = mod;
	m_freeModules = mod;
	mod->freeWaterTracksResources();
}

//=============================================================================
// WaterTracksRenderSystem::WaterTracksRenderSystem
//=============================================================================
/** Constructor. Just nulls out some variables. */
//=============================================================================
WaterTracksRenderSystem::WaterTracksRenderSystem()
{
	m_usedModules = NULL;
	m_freeModules = NULL;
	m_indexBuffer = NULL;
	m_vertexMaterialClass = NULL;
	m_vertexBuffer = NULL;
	m_stripSizeX=WATER_STRIP_X;
	m_stripSizeY=WATER_STRIP_Y;
	m_batchStart=0;
	TheWaterTracksRenderSystem = this;	//only allow one instance of this object.
}

//=============================================================================
// WaterTracksRenderSystem::~WaterTracksRenderSystem
//=============================================================================
/** Destructor.  Free all pre-allocated track laying render objects*/
//=============================================================================
WaterTracksRenderSystem::~WaterTracksRenderSystem( void )
{

	// free all data
	shutdown();

	m_vertexMaterialClass=NULL;

}

//=============================================================================
// WaterTracksRenderSystem::ReAcquireResources
//=============================================================================
/** (Re)allocates all W3D assets after a reset.. */
//=============================================================================
void WaterTracksRenderSystem::ReAcquireResources(void)
{
//	const Int numModules=16;	///@todo: Get a value out of gdf

	// just for paranoia's sake.
	REF_PTR_RELEASE(m_indexBuffer);
	REF_PTR_RELEASE(m_vertexBuffer);

	const Int vertsPerTrack = m_stripSizeX * m_stripSizeY;
	const Int trisPerTrack = (m_stripSizeX - 1) * (m_stripSizeY - 1) * 2;
	const Int idxCount = trisPerTrack * 3 * WATER_VB_PAGES;

	m_indexBuffer = NEW_REF(DX8IndexBufferClass,(idxCount));

	// Fill up the IB
	{
		DX8IndexBufferClass::WriteLockClass lockIdxBuffer(m_indexBuffer);
		UnsignedShort *ib=lockIdxBuffer.Get_Index_Array();
		
		for (Int page = 0; page < WATER_VB_PAGES; ++page)
		{
			const Int vertexBase = page * vertsPerTrack;

			for (Int y = 0; y < m_stripSizeY - 1; ++y)
			{
				for (Int x = 0; x < m_stripSizeX - 1; ++x)
				{
					const Int indexBase = (page * trisPerTrack + (y * (m_stripSizeX - 1) + x) * 2) * 3;
					const UnsignedShort upperLeft = (UnsignedShort)(vertexBase + y * m_stripSizeX + x);
					const UnsignedShort upperRight = (UnsignedShort)(vertexBase + y * m_stripSizeX + x + 1);
					const UnsignedShort lowerLeft = (UnsignedShort)(vertexBase + (y + 1) * m_stripSizeX + x);
					const UnsignedShort lowerRight = (UnsignedShort)(vertexBase + (y + 1) * m_stripSizeX + x + 1);

					ib[indexBase + 0] = lowerLeft;
					ib[indexBase + 1] = upperLeft;
					ib[indexBase + 2] = lowerRight;
					ib[indexBase + 3] = lowerRight;
					ib[indexBase + 4] = upperLeft;
					ib[indexBase + 5] = upperRight;
				}
			}
		}
	}

	m_vertexBuffer=NEW_REF(DX8VertexBufferClass,(DX8_FVF_XYZDUV1,vertsPerTrack*WATER_VB_PAGES,DX8VertexBufferClass::USAGE_DYNAMIC));
	m_batchStart=0;
}

//=============================================================================
// WaterTracksRenderSystem::ReleaseResources
//=============================================================================
/** (Re)allocates all W3D assets after a reset.. */
//=============================================================================
void WaterTracksRenderSystem::ReleaseResources(void)
{
	REF_PTR_RELEASE(m_indexBuffer);
	REF_PTR_RELEASE(m_vertexBuffer);
	// Note - it is ok to not release the material, as it is a w3d object that
	// has no dx8 resources. jba.
}

//=============================================================================
// WaterTracksRenderSystem::init
//=============================================================================
/**  initialize the system, allocate all the render objects we will need */
//=============================================================================
void WaterTracksRenderSystem::init(void)
{
	const Int numModules=2000;	///@todo: Get a value out of gdf
	Int i;
	WaterTracksObj *mod;

	m_stripSizeX=WATER_STRIP_X;	///@todo: grab these out of gdf or define
	m_stripSizeY=WATER_STRIP_Y;
	m_level=TheGlobalData->m_waterPositionZ;

	ReAcquireResources();
	//go with a preset material for now.
	m_vertexMaterialClass=VertexMaterialClass::Get_Preset(VertexMaterialClass::PRELIT_DIFFUSE);

	//use a multi-texture shader:
	m_shaderClass = ShaderClass::_PresetAlphaShader;
	m_shaderClass.Set_Cull_Mode(ShaderClass::CULL_MODE_DISABLE);	//water should be visible from both sides

	// we cannot initialize a system that is already initialized
	if( m_freeModules || m_usedModules )
	{

		// system already online!
		assert( 0 );
		return;

	}  // end if

	// allocate our modules for this system
	for( i = 0; i < numModules; i++ )
	{

		mod = NEW WaterTracksObj;

		if( mod == NULL )
		{

			// unable to allocate modules needed
			assert( 0 );
			return;

		}  // end if

		mod->m_prevSystem = NULL;
		mod->m_nextSystem = m_freeModules;
		if( m_freeModules )
			m_freeModules->m_prevSystem = mod;
		m_freeModules = mod;

	}  // end for i

}  // end init

void WaterTracksRenderSystem::reset(void)
{
	WaterTracksObj *nextMod,*mod;

	//release unbound tracks that may still be fading out
	mod=m_usedModules;

	while(mod)
	{
		nextMod=mod->m_nextSystem;
		mod->m_bound=false;
		releaseTrack(mod);

		mod = nextMod;
	}  // end while


	// free all attached things and used modules
	assert( m_usedModules == NULL );
}

//=============================================================================
// WaterTracksRenderSystem::shutdown
//=============================================================================
/** Shutdown and free all memory for this system */
//=============================================================================
void WaterTracksRenderSystem::shutdown( void )
{
	WaterTracksObj *nextMod,*mod;

	//release unbound tracks that may still be fading out
	mod=m_usedModules;

	while(mod)
	{
		nextMod=mod->m_nextSystem;

		if (!mod->m_bound)
			releaseTrack(mod);

		mod = nextMod;
	}  // end while


	// free all attached things and used modules
	assert( m_usedModules == NULL );

	// free all module storage
	while( m_freeModules )
	{

		nextMod = m_freeModules->m_nextSystem;
		delete m_freeModules;
		m_freeModules = nextMod;

	}  // end while

	REF_PTR_RELEASE(m_indexBuffer);
	REF_PTR_RELEASE(m_vertexMaterialClass);
	REF_PTR_RELEASE(m_vertexBuffer);

}  // end shutdown

//=============================================================================
// WaterTracksRenderSystem::update
//=============================================================================
/** Update the state of all active track marks - fade, expire, etc. */
//=============================================================================
void WaterTracksRenderSystem::update()
{

	static  Int iLastTime=timeGetTime();
	WaterTracksObj *mod=m_usedModules,*nextMod;

	Int timeDiff = timeGetTime()-iLastTime;
	iLastTime += timeDiff;

	//Lock framerate to 30 fps
	timeDiff = 1.0f/30.0f*1000.0f;

	//first update all the tracks
	while( mod )
	{
		nextMod = mod->m_nextSystem;

		if (!mod->m_bound || (!mod->update(timeDiff) && !mod->m_bound))
		{ //object is not longer updating and is unbound so ok to release it.
			releaseTrack(mod);
		}

		mod = nextMod;
	}  // end while
}


void TestWaterUpdate(void);
void setFPMode( void );

//=============================================================================
// WaterTracksRenderSystem::flush
//=============================================================================
/** Draw all active track marks for this frame */
//=============================================================================
void WaterTracksRenderSystem::flush(RenderInfoClass & rinfo)
{
/** @todo: Optimize system by drawing tracks as triangle strips and use dynamic vertex buffer access.
May also try rendering all tracks with one call to W3D/D3D by grouping them by texture.
Try improving the fit to vertical surfaces like cliffs.
*/
	CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.entry");
	Int	diffuseLight;

	if (!TheGlobalData->m_showSoftWaterEdge || TheWaterTransparency->m_transparentWaterDepth ==0 )
	{
		CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.disabled.return");
		return;
	}

	if (TheGlobalData->m_usingWaterTrackEditor)
	{
		CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.editor.before");
		TestWaterUpdate();
		CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.editor.after");
	}

	CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.update.before");
	update();	//update positions of all the tracks
	CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.update.after");

	CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.cameraApply.before");
	rinfo.Camera.Apply();
	CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.cameraApply.after");

	if (!m_usedModules || ShaderClass::Is_Backface_Culling_Inverted())
	{
		CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.emptyOrReflection.return");
		return;	//don't render track marks in reflections.
	}

 	//According to Nvidia there's a D3D bug that happens if you don't start with a
 	//new dynamic VB each frame - so we force a DISCARD by overflowing the counter.
 	m_batchStart = 0xffff;

	// adjust shading for time of day.
	CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.shade.before");
	Real shadeR, shadeG, shadeB;
	shadeR = TheGlobalData->m_terrainAmbient[0].red;
	shadeG = TheGlobalData->m_terrainAmbient[0].green;
	shadeB = TheGlobalData->m_terrainAmbient[0].blue;
	shadeR += TheGlobalData->m_terrainDiffuse[0].red/2;
	shadeG += TheGlobalData->m_terrainDiffuse[0].green/2;
	shadeB += TheGlobalData->m_terrainDiffuse[0].blue/2;
	shadeR*=255.0f;
	shadeG*=255.0f;
	shadeB*=255.0f;

	diffuseLight=REAL_TO_INT(shadeB) | (REAL_TO_INT(shadeG) << 8) | (REAL_TO_INT(shadeR) << 16);
	CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.shade.after");

	CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.stateSetup.before");
	Matrix3D tm(1);	///set to identity
	DX8Wrapper::Set_Transform(D3DTS_WORLD,tm);	//position the water surface

	DX8Wrapper::Set_Material(m_vertexMaterialClass);
	DX8Wrapper::Set_Shader(m_shaderClass);

	DX8Wrapper::Set_Vertex_Buffer(m_vertexBuffer);
	DX8Wrapper::Set_DX8_Render_State(D3DRS_ZBIAS,8);
	//Force apply of render states so we can override them.
	DX8Wrapper::Apply_Render_State_Changes();
	CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.stateSetup.after");

	if (TheTerrainRenderObject->getShroud())
	{	
		CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.shroudSetup.before");
		W3DShaderManager::setTexture(0,TheTerrainRenderObject->getShroud()->getShroudTexture());
		W3DShaderManager::setShader(W3DShaderManager::ST_SHROUD_TEXTURE, 1);

		//modulate with shroud texture
		DX8Wrapper::Set_DX8_Texture_Stage_State( 1, D3DTSS_COLORARG1, D3DTA_TEXTURE );	//stage 1 texture
		DX8Wrapper::Set_DX8_Texture_Stage_State( 1, D3DTSS_COLORARG2, D3DTA_CURRENT );	//previous stage texture
		DX8Wrapper::Set_DX8_Texture_Stage_State( 1, D3DTSS_COLOROP,   D3DTOP_MODULATE );
		DX8Wrapper::Set_DX8_Texture_Stage_State( 1, D3DTSS_ALPHAOP,   D3DTOP_MODULATE );

		//Shroud shader uses z-compare of EQUAL which wouldn't work on water because it doesn't
		//write to the zbuffer.  Change to LESSEQUAL.
		DX8Wrapper::Set_DX8_Render_State(D3DRS_ZFUNC, D3DCMP_LESSEQUAL);
		CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.shroudSetup.after");
	}

	const Int verticesPerTrack = m_stripSizeX * m_stripSizeY;
	const Int trianglesPerTrack = (m_stripSizeX - 1) * (m_stripSizeY - 1) * 2;
	const Int vertexCapacity = WATER_VB_PAGES * verticesPerTrack;
	const Int maxBatchStart = vertexCapacity - verticesPerTrack;
	TextureClass *lastTexture = NULL;
	Bool hasTexture = FALSE;

	WaterTracksObj *mod=m_usedModules;

	CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.drawLoop.before");
	while( mod )
	{
		if (!hasTexture || lastTexture != mod->m_stageZeroTexture)
		{
			CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.texture.before");
			DX8Wrapper::Set_Texture(0,mod->m_stageZeroTexture);
			CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.texture.after");
			lastTexture = mod->m_stageZeroTexture;
			hasTexture = TRUE;
		}

		TextureClass *batchTexture = mod->m_stageZeroTexture;
		while (mod && mod->m_stageZeroTexture == batchTexture)
		{
			const Bool discard = m_batchStart >= maxBatchStart;
			const Int writeStart = discard ? 0 : m_batchStart;
			const Int trackCapacity = discard ? (maxBatchStart / verticesPerTrack) : ((maxBatchStart - m_batchStart) / verticesPerTrack);
			Int batchTrackCount = 0;
			WaterTracksObj *scan = mod;

			while (scan && scan->m_stageZeroTexture == batchTexture && batchTrackCount < trackCapacity)
			{
				++batchTrackCount;
				scan = scan->m_nextSystem;
			}

			if (batchTrackCount <= 0)
			{
				m_batchStart = maxBatchStart;
				continue;
			}

			VertexFormatXYZDUV1 *vb;
			const Int stride = m_vertexBuffer->FVF_Info().Get_FVF_Size();
			const Int lockOffset = writeStart * stride;
			const Int lockSize = batchTrackCount * verticesPerTrack * stride;
			const DWORD lockFlags = discard ? D3DLOCK_DISCARD : D3DLOCK_NOOVERWRITE;

			if (discard)
			{
				CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.batchLockDiscard.before");
			}
			else
			{
				CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.batchLockNoOverwrite.before");
			}

			if(m_vertexBuffer->Get_DX8_Vertex_Buffer()->Lock(lockOffset,lockSize,(unsigned char**)&vb,lockFlags) != D3D_OK)
			{
				CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.batchLock.failed");
				mod = scan;
				continue;
			}

			if (discard)
			{
				CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.batchLockDiscard.after");
			}
			else
			{
				CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.batchLockNoOverwrite.after");
			}

			Int tracksWritten = 0;
			VertexFormatXYZDUV1 *writeCursor = vb;
			while (tracksWritten < batchTrackCount && mod)
			{
				writeCursor += mod->writeVertices(writeCursor);
				mod = mod->m_nextSystem;
				++tracksWritten;
			}

			CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.batchUnlock.before");
			m_vertexBuffer->Get_DX8_Vertex_Buffer()->Unlock();
			CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.batchUnlock.after");

			DrawWaterTrackBatch(m_indexBuffer,writeStart,tracksWritten,trianglesPerTrack,verticesPerTrack);
			m_batchStart = writeStart + tracksWritten * verticesPerTrack;	//advance past vertices already in buffer
		}
	}	//while (mod)
	CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.drawLoop.after");

	CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.cleanup.before");
	DX8Wrapper::Set_DX8_Render_State(D3DRS_ZBIAS,0);

	if (TheTerrainRenderObject->getShroud())
	{	//we used the shroud shader, so reset it.
		DX8Wrapper::Set_DX8_Render_State(D3DRS_ZFUNC, D3DCMP_EQUAL);
		W3DShaderManager::resetShader(W3DShaderManager::ST_SHROUD_TEXTURE);
	}
	CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.cleanup.after");
	CNC_PORT_NOTE_WATER_TRACK_STEP("W3DWaterTracks.flush.complete");
}

WaterTracksObj *WaterTracksRenderSystem::findTrack(Vector2 &start, Vector2 &end, waveType type)
{
	WaterTracksObj *mod=m_usedModules;

	while( mod )
	{
		if (mod->m_initEndPos == end &&
			mod->m_initStartPos == start &&
			mod->m_type == type)
			return mod;
		mod = mod->m_nextSystem;
	}	//while (mod)
	return NULL;
}
void WaterTracksRenderSystem::saveTracks(void)
{

	if (!TheTerrainLogic)
		return;

	AsciiString fileName=TheTerrainLogic->getSourceFilename();
	char path[256];

	strcpy(path,fileName.str());
	Int len=strlen(path);

	strcpy(path+len-4,".wak");

	WaterTracksObj *umod;
	Int trackCount=0;

	FILE *fp=fopen(path,"wb");

	if (fp)
	{
		umod=m_usedModules;
		while(umod)
		{	if (umod->m_initTimeOffset == 0)
			{	//only save the primary wave front, second layer is added automatically.
				fwrite(&umod->m_initStartPos,sizeof(umod->m_startPos),1,fp);
				fwrite(&umod->m_initEndPos,sizeof(umod->m_perpDir),1,fp);
				fwrite(&umod->m_type,sizeof(umod->m_type),1,fp);
	//			fwrite(&umod->m_initTimeOffset,sizeof(umod->m_initTimeOffset),1,fp);
				trackCount++;
			}
			umod=umod->m_nextSystem;
		}  // end while
		fwrite(&trackCount,sizeof(trackCount),1,fp);
		fclose(fp);
	}
}

void WaterTracksRenderSystem::loadTracks(void)
{

	if (!TheTerrainLogic)
		return;

	AsciiString fileName=TheTerrainLogic->getSourceFilename();
	char path[256];

	strcpy(path,fileName.str());
	Int len=strlen(path);

	strcpy(path+len-4,".wak");

	File *file = TheFileSystem->openFile(path, File::READ | File::BINARY);
	WaterTracksObj *umod;
	Int trackCount=0;
	Int flipU=0;
	Vector2 startPos,endPos;
	waveType wtype;

	if (file)
	{
		file->seek(-4,File::END);
		file->read(&trackCount,sizeof(trackCount));
		file->seek(0, File::START);
		for (Int i=0; i<trackCount; i++)
		{
		tryagain:
			file->read(&startPos,sizeof(startPos));
			file->read(&endPos,sizeof(endPos));
			file->read(&wtype,sizeof(wtype));
			//Check if this track already exists.
			if (findTrack(startPos,endPos,wtype))
			{	i++;
				goto tryagain;
			}

			umod=TheWaterTracksRenderSystem->bindTrack(wtype);
			if (umod)
			{	//umod->init(1.5f*MAP_XY_FACTOR,Vector2(0,0),Vector2(1,1),"wave256.tga");
				flipU ^= 1;	//toggle flip state
				umod->init(waveTypeInfo[wtype].m_finalHeight,waveTypeInfo[wtype].m_finalWidth,startPos,endPos,waveTypeInfo[wtype].m_textureName,0);
				umod->m_flipU=flipU;

				if (waveTypeInfo[wtype].m_secondWaveTimeOffset)	//check if we need a second wave to follow
				{
					umod=TheWaterTracksRenderSystem->bindTrack(wtype);
					if (umod)
					{
						umod->init(waveTypeInfo[wtype].m_finalHeight,waveTypeInfo[wtype].m_finalWidth,startPos,endPos,waveTypeInfo[wtype].m_textureName,waveTypeInfo[wtype].m_secondWaveTimeOffset);
						umod->m_flipU = !flipU;
					}
				}
			}
		}
		file->close();
	}

#if 0	//Obsolete code used before there was another editor to place waves.
	//Look for all waypoints that start with "waveStart_"
	for (Waypoint *way = TheTerrainLogic->getFirstWaypoint(); way; way = way->getNext())
	{
		if (way->getName().startsWith("waveStart_") && way->getNumLinks() == 1)
		{
			Waypoint *nextWay = way->getLink(0);
			Coord3D startPos = *way->getLocation();
			Coord3D endPos = *nextWay->getLocation();

			//initialize surface layer (1)
			WaterTracksObj *umod=TheWaterTracksRenderSystem->bindTrack(1);
			if (umod)
			{
				umod->init(DEFAULT_FINAL_WAVE_HEIGHT,DEFAULT_FINAL_WAVE_WIDTH,Vector2(startPos.x,startPos.y),Vector2(endPos.x,endPos.y),"wave1.tga",0);
			}
/*
			//initialize foam layer (0)
			umod=TheWaterTracksRenderSystem->bindTrack(0);
			if (umod)
			{
				umod->init(2.5f*MAP_XY_FACTOR,5.0f*MAP_XY_FACTOR,Vector2(startPos.x,startPos.y),Vector2(endPos.x,endPos.y),"wave2.tga");
//				umod->m_fadeMs += 1500;	//take extra 500 ms to fade out wave.
//				umod->m_retreatFrac = 1.0f;	//don't move wave back after it hits final position.
			}*/
		}
	}
#endif
}

/**@todo: this is a quick hack for adding/removing/testing breaking waves inside the client.
Will need to move this code to an external editor at some pont. */
#include "GameClient/Display.h"

extern HWND ApplicationHWnd;

//TODO: Fix editor so it actually draws the wave segment instead of line while editing
//Could freeze all the water while editing?  Or keep setting elapsed time on current segment.
//Have to make it so seamless merge of segments at final position.
static void TestWaterUpdate(void)
{
	static Int doInit=1;
	static WaterTracksObj *track=NULL,*track2=NULL;
	static Int trackEditMode=0;
	static waveType currentWaveType = WaveTypeOcean;
	POINT	screenPoint;
	POINT	endPoint;
	static POINT	mouseAnchor;
	static Int		haveStart=0;
	static Int		haveEnd=0;
	static Coord3D	terrainPointStart,terrainPointEnd;
	//flags to tell me when the user lets go of a key
	static Int trackEditModeReset=1;
	static Int addPointReset=1;
	static Int deleteTrackReset=1;
	static Int saveTracksReset=1;
	static Int loadTracksReset=1;
	static Int changeTypeReset=1;

	pauseWaves=FALSE;

	if (doInit)
	{	//create the system
		doInit=0;

//		TheWaterTracksRenderSystem = NEW (WaterTracksRenderSystem);
//		TheWaterTracksRenderSystem->init();

		//create a dummy track
//		track=TheWaterTracksRenderObjClassSystem->bindTrack(0);
//		track->init(1.5f,8.0f,Vector2(147.0f,67.0f),Vector2(146.9f,68.6f),"wave2.tga");

//		track=TheWaterTracksRenderObjClassSystem->bindTrack(0);
//		track->init(1.5f,8.0f,Vector2(139.0f,66.0f),Vector2(138.8f,67.6f),"wave2.tga");
	}

	if (GetAsyncKeyState(VK_F5) & 0x8001)	//check if F5 pressed since last call
	{	
		if (trackEditModeReset)
		{
			if (trackEditMode)
			{
				UnicodeString string;
				string.format(L"Leaving Water Track Edit Mode");
				TheInGameUI->message(string);
			}
			else
			{
				UnicodeString string;
				string.format(L"Entering Water Track Edit Mode");
				TheInGameUI->message(string);

				string.format(L"Wave Type: %hs",waveTypeInfo[currentWaveType].m_waveTypeName);
				TheInGameUI->message(string);
			}

			trackEditMode ^= 1;	//toggle editor on/off

			if (trackEditMode == 0)
			{	//editor was turned off, save changes
				haveStart=0;
				haveEnd=0;
			}
			trackEditModeReset=0;
		}
	}
	else
		trackEditModeReset=1;

	if (trackEditMode)
	{   //we are in wave edit mode

		if (GetCursorPos(&screenPoint))	//read mouse position
		{
			ScreenToClient( ApplicationHWnd, &screenPoint);

			if (GetAsyncKeyState(VK_F6) & 0x8001)
			{
				if (addPointReset)
				{
					if (!haveStart)
					{	mouseAnchor=screenPoint;
						TheTacticalView->screenToTerrain( (ICoord2D *)&screenPoint, &terrainPointStart);
						haveStart=1;
						UnicodeString string;
						string.format(L"Added Start");
						TheInGameUI->message(string);
					}
					else
					{
						endPoint=screenPoint;
						TheTacticalView->screenToTerrain( (ICoord2D *)&screenPoint, &terrainPointEnd);
						haveEnd=1;
						//Have enough info to add a wave now
						track=TheWaterTracksRenderSystem->bindTrack(currentWaveType);
						if (track)
						{//	track->init(1.5f*MAP_XY_FACTOR,Vector2(terrainPointStart.x,terrainPointStart.y),Vector2(terrainPointEnd.x,terrainPointEnd.y),"wave256.tga");
							//Generate valid input for the 2 points
							Vector2 startPoint(terrainPointStart.x,terrainPointStart.y);
							Vector2 endPoint(terrainPointEnd.x,terrainPointEnd.y);
							Vector2 midPoint = endPoint - startPoint;
							Vector2 m_perpDir = midPoint;
							m_perpDir.Rotate(1.57079632679f);	//get vector perpendicular to wave motion.
							m_perpDir.Normalize();
							midPoint = startPoint + (midPoint)*0.5f;
							Vector2 dirMidPoint = midPoint + m_perpDir;

							track->init(waveTypeInfo[currentWaveType].m_finalHeight,waveTypeInfo[currentWaveType].m_finalWidth,midPoint,dirMidPoint,waveTypeInfo[currentWaveType].m_textureName,0);

							if (waveTypeInfo[currentWaveType].m_secondWaveTimeOffset)
							{
								//Add a second track slightly behind this one
								track2=TheWaterTracksRenderSystem->bindTrack(currentWaveType);
								if (track2)
								{
									track2->init(waveTypeInfo[currentWaveType].m_finalHeight,waveTypeInfo[currentWaveType].m_finalWidth,midPoint,dirMidPoint,waveTypeInfo[currentWaveType].m_textureName,waveTypeInfo[currentWaveType].m_secondWaveTimeOffset);
								}
							}

							UnicodeString string;
							string.format(L"Added End");
							TheInGameUI->message(string);
						}
						haveStart=0;	//reset for next segment
						haveEnd=0;
					}
					addPointReset=0;
				}
			}
			else
				addPointReset=1;

			if (GetAsyncKeyState(VK_DELETE) & 0x8001)
			{	//delete last segment added
				if (deleteTrackReset && track)
				{	deleteTrackReset=0;
					TheWaterTracksRenderSystem->unbindTrack(track);
					if (track2)
						TheWaterTracksRenderSystem->unbindTrack(track2);
					haveStart=0;	//reset for next segment
					haveEnd=0;
					track=NULL;
					track2=NULL;
				}
			}
			else
				deleteTrackReset=1;

			if (GetAsyncKeyState(VK_INSERT) & 0x8001)
			{	//change current wave type
				if (changeTypeReset)
				{	changeTypeReset=0;
					currentWaveType = (waveType)((Int)currentWaveType + 1);
					if (currentWaveType > WaveTypeLast)
						currentWaveType = WaveTypeFirst;

					UnicodeString string;
					string.format(L"Wave Type: %hs",waveTypeInfo[currentWaveType].m_waveTypeName);
					TheInGameUI->message(string);
				}
			}
			else
				changeTypeReset=1;

			if (GetAsyncKeyState(VK_F7) & 0x8001)
			{	//save all segments added
				if (saveTracksReset)
				{	saveTracksReset=0;
					TheWaterTracksRenderSystem->saveTracks();
					haveStart=0;	//reset for next segment
					haveEnd=0;
					track=NULL;
					track2=NULL;
					UnicodeString string;
					string.format(L"Saved Tracks");
					TheInGameUI->message(string);
				}
			}
			else
				saveTracksReset=1;

			if (GetAsyncKeyState(VK_F8) & 0x8001)
			{	//load tracks for map
				if (loadTracksReset)
				{	loadTracksReset=0;
					TheWaterTracksRenderSystem->reset();
					TheWaterTracksRenderSystem->loadTracks();
					haveStart=0;	//reset for next segment
					haveEnd=0;
					track=NULL;
					track2=NULL;
					UnicodeString string;
					string.format(L"Loaded Tracks");
					TheInGameUI->message(string);
				}
			}
			else
				saveTracksReset=1;
		};

		if (haveStart && !haveEnd)
		{	//draw a guide line
//			View *tacticalView = TheDisplay->getFirstView();
//			tacticalView->worldToScreen( &m_moveHint[i].pos, &pos );

			TheTacticalView->screenToTerrain( (ICoord2D *)&screenPoint, &terrainPointEnd);
			//Check if point is within correct distance of start
			Real xdiff=terrainPointEnd.x - terrainPointStart.x;
			Real ydiff=terrainPointEnd.y - terrainPointStart.y;
			if (sqrt (xdiff * xdiff + ydiff * ydiff) <= waveTypeInfo[currentWaveType].m_finalWidth)
			{	TheDisplay->drawLine(mouseAnchor.x, mouseAnchor.y, screenPoint.x, screenPoint.y,1,0xffccccff);
				DX8Wrapper::Invalidate_Cached_Render_States();
				ShaderClass::Invalidate();
			}

			pauseWaves=TRUE;

//			char buffer[64];
//			sprintf(buffer,"\n%d,%d,%d,%d",mouseAnchor.x, mouseAnchor.y, screenPoint.x, screenPoint.y);
//			OutputDebugString (buffer);
		}
	}
}
