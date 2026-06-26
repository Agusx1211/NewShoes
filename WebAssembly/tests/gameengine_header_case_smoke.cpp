#include "PreRTS.h"

#include "Benchmark.h"
#include "Common/OVERRIDE.h"
#include "bink.h"
#include "convert.h"
#include "d3d8.h"
#include "dinput.h"
#include "D3dx8core.h"
#include "d3dx8tex.h"
#include "Dx8Wrapper.h"
#include "font.h"
#include "common/AsciiString.h"
#include "common/drawmodule.h"
#include "common/gamelod.h"
#include "GameClient/display.h"
#include "GameClient/drawable.h"
#include "GameLOgic/GameLogic.h"
#include "GameLogic/Module/Diemodule.h"
#include "LightEnvironment.h"
#include "Lib/Basetype.h"
#include "hmdldef.h"
#include "lib/baseType.h"
#include "snappts.h"
#include "streakrender.h"
#include "vector3i.h"
#include "WW3D2/AssetMgr.h"
#include "WW3D2/Camera.h"
#include "WW3D2/ColType.h"
#include "WW3D2/HAnim.h"
#include "WW3D2/Light.h"
#include "WW3D2/Mesh.h"
#include "WW3D2/RendObj.h"
#include "WW3D2/Render2D.h"
#include "WW3D2/Render2DSentence.h"
#include "WW3D2/Shader.h"
#include "WW3D2/Texture.h"
#include "WW3D2/WW3D.h"
#include "WW3D2/WW3DFormat.h"
#include "Texture.h"
#include "W3DDevice/GameClient/heightmap.h"
#include "W3DDevice/GameClient/Heightmap.h"
#include "WWMATH/Matrix3d.h"
#include "WWMATH/Vector2.h"
#include "WWMath/Matrix3D.h"
#include "WWLib/BitType.h"

namespace {
struct SmokeValue
{
	int value;
};
}

int main()
{
	SmokeValue value = { 7 };
	OVERRIDE<SmokeValue> override_value(&value);
	Matrix3D matrix(true);
	D3DXMATRIX d3dx_identity;
	D3DXMATRIX d3dx_translation;
	D3DXMATRIX d3dx_scaling;
	D3DXMATRIX d3dx_combined;
	D3DXMATRIX d3dx_transposed;
	Vector2 unit_y(0.0f, 1.0f);
	Vector3i grid(1, 2, 3);
	const Vector3 x_axis = matrix.Get_X_Vector();
	DIDEVICEOBJECTDATA input_event = {};
	HBINK bink_handle = nullptr;

	D3DXMatrixTranslation(&d3dx_translation, 1.0f, 2.0f, 3.0f);
	D3DXMatrixScaling(&d3dx_scaling, 2.0f, 3.0f, 4.0f);
	D3DXMatrixMultiply(&d3dx_combined, &d3dx_translation, &d3dx_scaling);
	D3DXMatrixTranspose(&d3dx_transposed, &d3dx_combined);
	d3dx_identity *= d3dx_translation;

	if (override_value.getNonOverloadedPointer() != &value) {
		return 1;
	}
	if (COLL_TYPE_ALL != 1) {
		return 1;
	}
	if (LightClass::POINT != 0 || sizeof(Int) != 4) {
		return 1;
	}
	if (unit_y.Y != 1.0f) {
		return 1;
	}
	if (grid[0] != 1 || grid[1] != 2 || grid[2] != 3) {
		return 1;
	}
	if (x_axis.X != 1.0f || x_axis.Y != 0.0f || x_axis.Z != 0.0f) {
		return 1;
	}
	if (D3DFMT_DXT1 != MAKEFOURCC('D', 'X', 'T', '1')) {
		return 1;
	}
	if (D3DFVF_XYZRHW != 0x004 || D3DLOCK_NO_DIRTY_UPDATE != 0x00008000L) {
		return 1;
	}
	if (D3DPMISCCAPS_COLORWRITEENABLE != 0x00000080L) {
		return 1;
	}
	if (D3DXGetFVFVertexSize(D3DFVF_XYZ | D3DFVF_NORMAL | D3DFVF_TEX1) != 32) {
		return 1;
	}
	if (d3dx_translation._41 != 1.0f || d3dx_translation._42 != 2.0f || d3dx_translation._43 != 3.0f) {
		return 1;
	}
	if (d3dx_scaling._11 != 2.0f || d3dx_scaling._22 != 3.0f || d3dx_scaling._33 != 4.0f) {
		return 1;
	}
	if (d3dx_transposed._14 != d3dx_combined._41 || d3dx_identity._41 != 1.0f) {
		return 1;
	}
	if (sizeof(input_event) == 0 || bink_handle != nullptr) {
		return 1;
	}

	std::printf("{\"ok\":true,\"smoke\":\"gameengine-header-case\"}\n");
	return 0;
}
