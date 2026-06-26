#pragma once

#include <cstdint>

#include "windows.h"

using D3DCOLOR = DWORD;
using D3DVALUE = float;
using D3DBLEND = DWORD;
using D3DCMPFUNC = DWORD;
using D3DCULL = DWORD;
using D3DMATERIALCOLORSOURCE = DWORD;
using D3DTEXTUREADDRESS = DWORD;
using D3DTEXTUREFILTERTYPE = DWORD;
using D3DTEXTUREOP = DWORD;
using LPDIRECT3DDEVICE8 = struct IDirect3DDevice8 *;
using LPDIRECT3DINDEXBUFFER8 = struct IDirect3DIndexBuffer8 *;
using LPDIRECT3DSURFACE8 = struct IDirect3DSurface8 *;
using LPDIRECT3DTEXTURE8 = struct IDirect3DTexture8 *;
using LPDIRECT3DVERTEXBUFFER8 = struct IDirect3DVertexBuffer8 *;

#ifndef MAKEFOURCC
#define MAKEFOURCC(ch0, ch1, ch2, ch3) \
	(static_cast<DWORD>(static_cast<unsigned char>(ch0)) | \
	(static_cast<DWORD>(static_cast<unsigned char>(ch1)) << 8) | \
	(static_cast<DWORD>(static_cast<unsigned char>(ch2)) << 16) | \
	(static_cast<DWORD>(static_cast<unsigned char>(ch3)) << 24))
#endif

#ifndef D3D_OK
#define D3D_OK S_OK
#endif

#ifndef D3D_SDK_VERSION
#define D3D_SDK_VERSION 120
#endif

#define D3DVSD_TOKENTYPESHIFT 29
#define D3DVSD_DATATYPESHIFT 16
#define D3DVSD_SKIPCOUNTSHIFT 16
#define D3DVSD_CONSTCOUNTSHIFT 25
#define D3DVSD_EXTCOUNTSHIFT 24

#define D3DVSD_MAKETOKENTYPE(token_type) (static_cast<DWORD>(token_type) << D3DVSD_TOKENTYPESHIFT)
#define D3DVSD_STREAM(stream_number) (D3DVSD_MAKETOKENTYPE(D3DVSD_TOKEN_STREAM) | static_cast<DWORD>(stream_number))
#define D3DVSD_STREAM_TESS() (D3DVSD_MAKETOKENTYPE(D3DVSD_TOKEN_STREAM) | 0x10000000UL)
#define D3DVSD_REG(vertex_register, type) \
	(D3DVSD_MAKETOKENTYPE(D3DVSD_TOKEN_STREAMDATA) | (static_cast<DWORD>(type) << D3DVSD_DATATYPESHIFT) | static_cast<DWORD>(vertex_register))
#define D3DVSD_SKIP(dword_count) \
	(D3DVSD_MAKETOKENTYPE(D3DVSD_TOKEN_STREAMDATA) | 0x10000000UL | (static_cast<DWORD>(dword_count) << D3DVSD_SKIPCOUNTSHIFT))
#define D3DVSD_CONST(constant_address, count) \
	(D3DVSD_MAKETOKENTYPE(D3DVSD_TOKEN_CONSTMEM) | (static_cast<DWORD>(count) << D3DVSD_CONSTCOUNTSHIFT) | static_cast<DWORD>(constant_address))
#define D3DVSD_TESSNORMAL(vertex_register_in, vertex_register_out) \
	(D3DVSD_MAKETOKENTYPE(D3DVSD_TOKEN_TESSELLATOR) | 0x10000000UL | (static_cast<DWORD>(vertex_register_in) << 20) | static_cast<DWORD>(vertex_register_out))
#define D3DVSD_TESSUV(vertex_register) \
	(D3DVSD_MAKETOKENTYPE(D3DVSD_TOKEN_TESSELLATOR) | static_cast<DWORD>(vertex_register))
#define D3DVSD_EXT(count, extension) \
	(D3DVSD_MAKETOKENTYPE(D3DVSD_TOKEN_EXT) | (static_cast<DWORD>(count) << D3DVSD_EXTCOUNTSHIFT) | static_cast<DWORD>(extension))
#define D3DVSD_END() 0xffffffffUL
#define D3DVSD_NOP() 0x00000000UL

#ifndef MAKE_D3DHRESULT
#define MAKE_D3DHRESULT(code) MAKE_HRESULT(SEVERITY_ERROR, 0x876, code)
#endif

#define D3DERR_WRONGTEXTUREFORMAT MAKE_D3DHRESULT(2072)
#define D3DERR_UNSUPPORTEDCOLOROPERATION MAKE_D3DHRESULT(2073)
#define D3DERR_UNSUPPORTEDCOLORARG MAKE_D3DHRESULT(2074)
#define D3DERR_UNSUPPORTEDALPHAOPERATION MAKE_D3DHRESULT(2075)
#define D3DERR_UNSUPPORTEDALPHAARG MAKE_D3DHRESULT(2076)
#define D3DERR_TOOMANYOPERATIONS MAKE_D3DHRESULT(2077)
#define D3DERR_CONFLICTINGTEXTUREFILTER MAKE_D3DHRESULT(2078)
#define D3DERR_UNSUPPORTEDFACTORVALUE MAKE_D3DHRESULT(2079)
#define D3DERR_CONFLICTINGTEXTUREPALETTE MAKE_D3DHRESULT(2086)
#define D3DERR_UNSUPPORTEDTEXTUREFILTER MAKE_D3DHRESULT(2087)
#define D3DERR_DEVICELOST MAKE_D3DHRESULT(2152)
#define D3DERR_DEVICENOTRESET MAKE_D3DHRESULT(2153)
#define D3DERR_NOTAVAILABLE MAKE_D3DHRESULT(2154)
#define D3DERR_OUTOFVIDEOMEMORY MAKE_D3DHRESULT(380)

enum D3DFORMAT {
	D3DFMT_UNKNOWN = 0,
	D3DFMT_R8G8B8 = 20,
	D3DFMT_A8R8G8B8 = 21,
	D3DFMT_X8R8G8B8 = 22,
	D3DFMT_R5G6B5 = 23,
	D3DFMT_X1R5G5B5 = 24,
	D3DFMT_A1R5G5B5 = 25,
	D3DFMT_A4R4G4B4 = 26,
	D3DFMT_R3G3B2 = 27,
	D3DFMT_A8 = 28,
	D3DFMT_A8R3G3B2 = 29,
	D3DFMT_X4R4G4B4 = 30,
	D3DFMT_A8P8 = 40,
	D3DFMT_P8 = 41,
	D3DFMT_L8 = 50,
	D3DFMT_A8L8 = 51,
	D3DFMT_A4L4 = 52,
	D3DFMT_V8U8 = 60,
	D3DFMT_L6V5U5 = 61,
	D3DFMT_X8L8V8U8 = 62,
	D3DFMT_Q8W8V8U8 = 63,
	D3DFMT_V16U16 = 64,
	D3DFMT_W11V11U10 = 65,
	D3DFMT_UYVY = MAKEFOURCC('U', 'Y', 'V', 'Y'),
	D3DFMT_YUY2 = MAKEFOURCC('Y', 'U', 'Y', '2'),
	D3DFMT_DXT1 = MAKEFOURCC('D', 'X', 'T', '1'),
	D3DFMT_DXT2 = MAKEFOURCC('D', 'X', 'T', '2'),
	D3DFMT_DXT3 = MAKEFOURCC('D', 'X', 'T', '3'),
	D3DFMT_DXT4 = MAKEFOURCC('D', 'X', 'T', '4'),
	D3DFMT_DXT5 = MAKEFOURCC('D', 'X', 'T', '5'),
	D3DFMT_D16_LOCKABLE = 70,
	D3DFMT_D32 = 71,
	D3DFMT_D15S1 = 73,
	D3DFMT_D24S8 = 75,
	D3DFMT_D24X8 = 77,
	D3DFMT_D24X4S4 = 79,
	D3DFMT_D16 = 80,
	D3DFMT_INDEX16 = 101,
	D3DFMT_INDEX32 = 102,
	D3DFMT_FORCE_DWORD = 0x7fffffff
};

enum D3DPOOL {
	D3DPOOL_DEFAULT = 0,
	D3DPOOL_MANAGED = 1,
	D3DPOOL_SYSTEMMEM = 2,
	D3DPOOL_SCRATCH = 3,
	D3DPOOL_FORCE_DWORD = 0x7fffffff
};

enum D3DRESOURCETYPE {
	D3DRTYPE_SURFACE = 1,
	D3DRTYPE_VOLUME = 2,
	D3DRTYPE_TEXTURE = 3,
	D3DRTYPE_VOLUMETEXTURE = 4,
	D3DRTYPE_CUBETEXTURE = 5,
	D3DRTYPE_VERTEXBUFFER = 6,
	D3DRTYPE_INDEXBUFFER = 7,
	D3DRTYPE_FORCE_DWORD = 0x7fffffff
};

enum D3DTRANSFORMSTATETYPE {
	D3DTS_VIEW = 2,
	D3DTS_PROJECTION = 3,
	D3DTS_TEXTURE0 = 16,
	D3DTS_TEXTURE1 = 17,
	D3DTS_TEXTURE2 = 18,
	D3DTS_TEXTURE3 = 19,
	D3DTS_TEXTURE4 = 20,
	D3DTS_TEXTURE5 = 21,
	D3DTS_TEXTURE6 = 22,
	D3DTS_TEXTURE7 = 23,
	D3DTS_FORCE_DWORD = 0x7fffffff
};

#define D3DTS_WORLDMATRIX(index) static_cast<D3DTRANSFORMSTATETYPE>(256 + (index))
#define D3DTS_WORLD D3DTS_WORLDMATRIX(0)

enum D3DRENDERSTATETYPE {
	D3DRS_ZENABLE = 7,
	D3DRS_FILLMODE = 8,
	D3DRS_SHADEMODE = 9,
	D3DRS_LINEPATTERN = 10,
	D3DRS_ZWRITEENABLE = 14,
	D3DRS_ALPHATESTENABLE = 15,
	D3DRS_LASTPIXEL = 16,
	D3DRS_SRCBLEND = 19,
	D3DRS_DESTBLEND = 20,
	D3DRS_CULLMODE = 22,
	D3DRS_ZFUNC = 23,
	D3DRS_ALPHAREF = 24,
	D3DRS_ALPHAFUNC = 25,
	D3DRS_DITHERENABLE = 26,
	D3DRS_ALPHABLENDENABLE = 27,
	D3DRS_FOGENABLE = 28,
	D3DRS_SPECULARENABLE = 29,
	D3DRS_ZVISIBLE = 30,
	D3DRS_FOGCOLOR = 34,
	D3DRS_FOGTABLEMODE = 35,
	D3DRS_FOGSTART = 36,
	D3DRS_FOGEND = 37,
	D3DRS_FOGDENSITY = 38,
	D3DRS_EDGEANTIALIAS = 40,
	D3DRS_RANGEFOGENABLE = 48,
	D3DRS_STENCILENABLE = 52,
	D3DRS_STENCILFAIL = 53,
	D3DRS_STENCILZFAIL = 54,
	D3DRS_STENCILPASS = 55,
	D3DRS_STENCILFUNC = 56,
	D3DRS_STENCILREF = 57,
	D3DRS_STENCILMASK = 58,
	D3DRS_STENCILWRITEMASK = 59,
	D3DRS_TEXTUREFACTOR = 60,
	D3DRS_WRAP0 = 128,
	D3DRS_WRAP1 = 129,
	D3DRS_WRAP2 = 130,
	D3DRS_WRAP3 = 131,
	D3DRS_WRAP4 = 132,
	D3DRS_WRAP5 = 133,
	D3DRS_WRAP6 = 134,
	D3DRS_WRAP7 = 135,
	D3DRS_CLIPPING = 136,
	D3DRS_LIGHTING = 137,
	D3DRS_AMBIENT = 139,
	D3DRS_FOGVERTEXMODE = 140,
	D3DRS_COLORVERTEX = 141,
	D3DRS_LOCALVIEWER = 142,
	D3DRS_NORMALIZENORMALS = 143,
	D3DRS_DIFFUSEMATERIALSOURCE = 145,
	D3DRS_SPECULARMATERIALSOURCE = 146,
	D3DRS_AMBIENTMATERIALSOURCE = 147,
	D3DRS_EMISSIVEMATERIALSOURCE = 148,
	D3DRS_VERTEXBLEND = 151,
	D3DRS_CLIPPLANEENABLE = 152,
	D3DRS_SOFTWAREVERTEXPROCESSING = 153,
	D3DRS_POINTSIZE = 154,
	D3DRS_POINTSIZE_MIN = 155,
	D3DRS_POINTSPRITEENABLE = 156,
	D3DRS_POINTSCALEENABLE = 157,
	D3DRS_POINTSCALE_A = 158,
	D3DRS_POINTSCALE_B = 159,
	D3DRS_POINTSCALE_C = 160,
	D3DRS_MULTISAMPLEANTIALIAS = 161,
	D3DRS_MULTISAMPLEMASK = 162,
	D3DRS_PATCHEDGESTYLE = 163,
	D3DRS_PATCHSEGMENTS = 164,
	D3DRS_DEBUGMONITORTOKEN = 165,
	D3DRS_POINTSIZE_MAX = 166,
	D3DRS_INDEXEDVERTEXBLENDENABLE = 167,
	D3DRS_COLORWRITEENABLE = 168,
	D3DRS_TWEENFACTOR = 170,
	D3DRS_BLENDOP = 171,
	D3DRS_POSITIONORDER = 172,
	D3DRS_NORMALORDER = 173,
	D3DRS_ZBIAS = 195,
	D3DRS_FORCE_DWORD = 0x7fffffff
};

enum D3DTEXTURESTAGESTATETYPE {
	D3DTSS_COLOROP = 1,
	D3DTSS_COLORARG1 = 2,
	D3DTSS_COLORARG2 = 3,
	D3DTSS_ALPHAOP = 4,
	D3DTSS_ALPHAARG1 = 5,
	D3DTSS_ALPHAARG2 = 6,
	D3DTSS_BUMPENVMAT00 = 7,
	D3DTSS_BUMPENVMAT01 = 8,
	D3DTSS_BUMPENVMAT10 = 9,
	D3DTSS_BUMPENVMAT11 = 10,
	D3DTSS_TEXCOORDINDEX = 11,
	D3DTSS_ADDRESSU = 13,
	D3DTSS_ADDRESSV = 14,
	D3DTSS_BORDERCOLOR = 15,
	D3DTSS_MAGFILTER = 16,
	D3DTSS_MINFILTER = 17,
	D3DTSS_MIPFILTER = 18,
	D3DTSS_MIPMAPLODBIAS = 19,
	D3DTSS_MAXMIPLEVEL = 20,
	D3DTSS_MAXANISOTROPY = 21,
	D3DTSS_BUMPENVLSCALE = 22,
	D3DTSS_BUMPENVLOFFSET = 23,
	D3DTSS_TEXTURETRANSFORMFLAGS = 24,
	D3DTSS_ADDRESSW = 25,
	D3DTSS_COLORARG0 = 26,
	D3DTSS_ALPHAARG0 = 27,
	D3DTSS_RESULTARG = 28,
	D3DTSS_FORCE_DWORD = 0x7fffffff
};

enum D3DPRIMITIVETYPE {
	D3DPT_POINTLIST = 1,
	D3DPT_LINELIST = 2,
	D3DPT_LINESTRIP = 3,
	D3DPT_TRIANGLELIST = 4,
	D3DPT_TRIANGLESTRIP = 5,
	D3DPT_TRIANGLEFAN = 6,
	D3DPT_FORCE_DWORD = 0x7fffffff
};

enum D3DLIGHTTYPE {
	D3DLIGHT_POINT = 1,
	D3DLIGHT_SPOT = 2,
	D3DLIGHT_DIRECTIONAL = 3,
	D3DLIGHT_FORCE_DWORD = 0x7fffffff
};

enum D3DVSD_TOKENTYPE {
	D3DVSD_TOKEN_NOP = 0,
	D3DVSD_TOKEN_STREAM = 1,
	D3DVSD_TOKEN_STREAMDATA = 2,
	D3DVSD_TOKEN_TESSELLATOR = 3,
	D3DVSD_TOKEN_CONSTMEM = 4,
	D3DVSD_TOKEN_EXT = 5,
	D3DVSD_TOKEN_END = 7,
	D3DVSD_TOKEN_FORCE_DWORD = 0x7fffffff
};

enum D3DVSDT_TYPE {
	D3DVSDT_FLOAT1 = 0,
	D3DVSDT_FLOAT2 = 1,
	D3DVSDT_FLOAT3 = 2,
	D3DVSDT_FLOAT4 = 3,
	D3DVSDT_D3DCOLOR = 4,
	D3DVSDT_UBYTE4 = 5,
	D3DVSDT_SHORT2 = 6,
	D3DVSDT_SHORT4 = 7,
	D3DVSDT_FORCE_DWORD = 0x7fffffff
};

struct D3DVECTOR
{
	float x;
	float y;
	float z;
};

struct D3DCOLORVALUE
{
	float r;
	float g;
	float b;
	float a;
};

struct D3DMATRIX
{
	float m[4][4];
};

using _D3DMATRIX = D3DMATRIX;

struct D3DLIGHT8
{
	D3DLIGHTTYPE Type;
	D3DCOLORVALUE Diffuse;
	D3DCOLORVALUE Specular;
	D3DCOLORVALUE Ambient;
	D3DVECTOR Position;
	D3DVECTOR Direction;
	float Range;
	float Falloff;
	float Attenuation0;
	float Attenuation1;
	float Attenuation2;
	float Theta;
	float Phi;
};

struct D3DMATERIAL8
{
	D3DCOLORVALUE Diffuse;
	D3DCOLORVALUE Ambient;
	D3DCOLORVALUE Specular;
	D3DCOLORVALUE Emissive;
	float Power;
};

struct D3DVIEWPORT8
{
	DWORD X;
	DWORD Y;
	DWORD Width;
	DWORD Height;
	float MinZ;
	float MaxZ;
};

struct D3DLOCKED_RECT
{
	int Pitch;
	void *pBits;
};

struct D3DLOCKED_BOX
{
	int RowPitch;
	int SlicePitch;
	void *pBits;
};

struct D3DBOX
{
	UINT Left;
	UINT Top;
	UINT Right;
	UINT Bottom;
	UINT Front;
	UINT Back;
};

struct D3DSURFACE_DESC
{
	D3DFORMAT Format;
	D3DRESOURCETYPE Type;
	DWORD Usage;
	D3DPOOL Pool;
	UINT Size;
	UINT MultiSampleType;
	UINT Width;
	UINT Height;
};

struct D3DVOLUME_DESC
{
	D3DFORMAT Format;
	D3DRESOURCETYPE Type;
	DWORD Usage;
	D3DPOOL Pool;
	UINT Size;
	UINT Width;
	UINT Height;
	UINT Depth;
};

struct D3DADAPTER_IDENTIFIER8
{
	char Driver[MAX_PATH];
	char Description[MAX_PATH];
	char DeviceName[32];
	LARGE_INTEGER DriverVersion;
	DWORD VendorId;
	DWORD DeviceId;
	DWORD SubSysId;
	DWORD Revision;
	GUID DeviceIdentifier;
	DWORD WHQLLevel;
};

struct D3DGAMMARAMP
{
	WORD red[256];
	WORD green[256];
	WORD blue[256];
};

struct D3DCAPS8
{
	DWORD AdapterOrdinal;
	DWORD DeviceType;
	DWORD Caps;
	DWORD Caps2;
	DWORD Caps3;
	DWORD PresentationIntervals;
	DWORD CursorCaps;
	DWORD DevCaps;
	DWORD PrimitiveMiscCaps;
	DWORD RasterCaps;
	DWORD ZCmpCaps;
	DWORD SrcBlendCaps;
	DWORD DestBlendCaps;
	DWORD AlphaCmpCaps;
	DWORD ShadeCaps;
	DWORD TextureCaps;
	DWORD TextureFilterCaps;
	DWORD CubeTextureFilterCaps;
	DWORD VolumeTextureFilterCaps;
	DWORD TextureAddressCaps;
	DWORD VolumeTextureAddressCaps;
	DWORD LineCaps;
	DWORD MaxTextureWidth;
	DWORD MaxTextureHeight;
	DWORD MaxVolumeExtent;
	DWORD MaxTextureRepeat;
	DWORD MaxTextureAspectRatio;
	DWORD MaxAnisotropy;
	float MaxVertexW;
	float GuardBandLeft;
	float GuardBandTop;
	float GuardBandRight;
	float GuardBandBottom;
	float ExtentsAdjust;
	DWORD StencilCaps;
	DWORD FVFCaps;
	DWORD TextureOpCaps;
	DWORD MaxTextureBlendStages;
	DWORD MaxSimultaneousTextures;
	DWORD VertexProcessingCaps;
	DWORD MaxActiveLights;
	DWORD MaxUserClipPlanes;
	DWORD MaxVertexBlendMatrices;
	DWORD MaxVertexBlendMatrixIndex;
	float MaxPointSize;
	DWORD MaxPrimitiveCount;
	DWORD MaxVertexIndex;
	DWORD MaxStreams;
	DWORD MaxStreamStride;
	DWORD VertexShaderVersion;
	DWORD MaxVertexShaderConst;
	DWORD PixelShaderVersion;
	float MaxPixelShaderValue;
};

struct D3DDISPLAYMODE
{
	UINT Width;
	UINT Height;
	UINT RefreshRate;
	D3DFORMAT Format;
};

struct D3DPRESENT_PARAMETERS
{
	UINT BackBufferWidth;
	UINT BackBufferHeight;
	D3DFORMAT BackBufferFormat;
	UINT BackBufferCount;
	UINT MultiSampleType;
	DWORD SwapEffect;
	HWND hDeviceWindow;
	BOOL Windowed;
	BOOL EnableAutoDepthStencil;
	D3DFORMAT AutoDepthStencilFormat;
	DWORD Flags;
	UINT FullScreen_RefreshRateInHz;
	UINT FullScreen_PresentationInterval;
};

struct IDirect3D8;
struct IDirect3DDevice8;
struct IDirect3DResource8
{
	virtual HRESULT GetDevice(IDirect3DDevice8 **device) = 0;
	virtual HRESULT SetPrivateData(const GUID &guid, const void *data, DWORD size, DWORD flags) = 0;
	virtual HRESULT GetPrivateData(const GUID &guid, void *data, DWORD *size) = 0;
	virtual HRESULT FreePrivateData(const GUID &guid) = 0;
	virtual DWORD SetPriority(DWORD priority) = 0;
	virtual DWORD GetPriority() = 0;
	virtual void PreLoad() = 0;
	virtual D3DRESOURCETYPE GetType() = 0;
	virtual ULONG AddRef() = 0;
	virtual ULONG Release() = 0;
};

struct IDirect3DBaseTexture8 : IDirect3DResource8
{
	virtual DWORD SetLOD(DWORD lod) = 0;
	virtual DWORD GetLOD() = 0;
	virtual DWORD GetLevelCount() = 0;
};

struct IDirect3DSurface8 : IDirect3DResource8
{
	virtual HRESULT GetDesc(D3DSURFACE_DESC *desc) = 0;
	virtual HRESULT LockRect(D3DLOCKED_RECT *locked_rect, const RECT *rect, DWORD flags) = 0;
	virtual HRESULT UnlockRect() = 0;
};

struct IDirect3DVolume8 : IDirect3DResource8
{
	virtual HRESULT GetDesc(D3DVOLUME_DESC *desc) = 0;
};

struct IDirect3DTexture8 : IDirect3DBaseTexture8
{
	virtual HRESULT GetLevelDesc(UINT level, D3DSURFACE_DESC *desc) = 0;
	virtual HRESULT GetSurfaceLevel(UINT level, IDirect3DSurface8 **surface) = 0;
	virtual HRESULT LockRect(UINT level, D3DLOCKED_RECT *locked_rect, const RECT *rect, DWORD flags) = 0;
	virtual HRESULT UnlockRect(UINT level) = 0;
};

enum D3DCUBEMAP_FACES {
	D3DCUBEMAP_FACE_POSITIVE_X = 0,
	D3DCUBEMAP_FACE_NEGATIVE_X = 1,
	D3DCUBEMAP_FACE_POSITIVE_Y = 2,
	D3DCUBEMAP_FACE_NEGATIVE_Y = 3,
	D3DCUBEMAP_FACE_POSITIVE_Z = 4,
	D3DCUBEMAP_FACE_NEGATIVE_Z = 5,
	D3DCUBEMAP_FACE_FORCE_DWORD = 0x7fffffff
};

struct IDirect3DCubeTexture8 : IDirect3DBaseTexture8
{
	virtual HRESULT GetLevelDesc(UINT level, D3DSURFACE_DESC *desc) = 0;
	virtual HRESULT GetCubeMapSurface(D3DCUBEMAP_FACES face, UINT level, IDirect3DSurface8 **surface) = 0;
	virtual HRESULT LockRect(D3DCUBEMAP_FACES face, UINT level, D3DLOCKED_RECT *locked_rect, const RECT *rect, DWORD flags) = 0;
	virtual HRESULT UnlockRect(D3DCUBEMAP_FACES face, UINT level) = 0;
};

struct IDirect3DVolumeTexture8 : IDirect3DBaseTexture8
{
	virtual HRESULT GetLevelDesc(UINT level, D3DVOLUME_DESC *desc) = 0;
	virtual HRESULT GetVolumeLevel(UINT level, IDirect3DVolume8 **volume) = 0;
	virtual HRESULT LockBox(UINT level, D3DLOCKED_BOX *locked_volume, const D3DBOX *box, DWORD flags) = 0;
	virtual HRESULT UnlockBox(UINT level) = 0;
};

struct IDirect3DVertexBuffer8 : IDirect3DResource8
{
	virtual HRESULT Lock(UINT offset, UINT size, BYTE **data, DWORD flags) = 0;
	virtual HRESULT Unlock() = 0;
};

struct IDirect3DIndexBuffer8 : IDirect3DResource8
{
	virtual HRESULT Lock(UINT offset, UINT size, BYTE **data, DWORD flags) = 0;
	virtual HRESULT Unlock() = 0;
};

struct IDirect3DSwapChain8
{
	virtual HRESULT Present(const RECT *source_rect, const RECT *dest_rect, HWND dest_window, const void *dirty_region) = 0;
	virtual HRESULT GetBackBuffer(UINT back_buffer, DWORD type, IDirect3DSurface8 **surface) = 0;
	virtual ULONG AddRef() = 0;
	virtual ULONG Release() = 0;
};

struct IDirect3DDevice8
{
	virtual HRESULT TestCooperativeLevel() = 0;
	virtual HRESULT GetDeviceCaps(D3DCAPS8 *caps) = 0;
	virtual HRESULT GetDisplayMode(D3DDISPLAYMODE *mode) = 0;
	virtual HRESULT SetCursorProperties(UINT x_hotspot, UINT y_hotspot, IDirect3DSurface8 *cursor_bitmap) = 0;
	virtual void SetCursorPosition(int x, int y, DWORD flags) = 0;
	virtual BOOL ShowCursor(BOOL show) = 0;
	virtual HRESULT CreateAdditionalSwapChain(D3DPRESENT_PARAMETERS *parameters, IDirect3DSwapChain8 **swap_chain) = 0;
	virtual HRESULT Reset(D3DPRESENT_PARAMETERS *parameters) = 0;
	virtual HRESULT Present(const RECT *source_rect, const RECT *dest_rect, HWND dest_window, const void *dirty_region) = 0;
	virtual HRESULT GetBackBuffer(UINT back_buffer, DWORD type, IDirect3DSurface8 **surface) = 0;
	virtual HRESULT GetRasterStatus(void *raster_status) = 0;
	virtual void SetGammaRamp(DWORD flags, const void *ramp) = 0;
	virtual void GetGammaRamp(void *ramp) = 0;
	virtual HRESULT CreateTexture(UINT width, UINT height, UINT levels, DWORD usage, D3DFORMAT format, D3DPOOL pool, IDirect3DTexture8 **texture) = 0;
	virtual HRESULT CreateVolumeTexture(UINT width, UINT height, UINT depth, UINT levels, DWORD usage, D3DFORMAT format, D3DPOOL pool, IDirect3DVolumeTexture8 **texture) = 0;
	virtual HRESULT CreateCubeTexture(UINT edge_length, UINT levels, DWORD usage, D3DFORMAT format, D3DPOOL pool, IDirect3DCubeTexture8 **texture) = 0;
	virtual HRESULT CreateVertexBuffer(UINT length, DWORD usage, DWORD fvf, D3DPOOL pool, IDirect3DVertexBuffer8 **buffer) = 0;
	virtual HRESULT CreateIndexBuffer(UINT length, DWORD usage, D3DFORMAT format, D3DPOOL pool, IDirect3DIndexBuffer8 **buffer) = 0;
	virtual HRESULT CreateImageSurface(UINT width, UINT height, D3DFORMAT format, IDirect3DSurface8 **surface) = 0;
	virtual HRESULT CreateRenderTarget(UINT width, UINT height, D3DFORMAT format, UINT multisample, BOOL lockable, IDirect3DSurface8 **surface) = 0;
	virtual HRESULT CreateDepthStencilSurface(UINT width, UINT height, D3DFORMAT format, UINT multisample, IDirect3DSurface8 **surface) = 0;
	virtual HRESULT UpdateTexture(IDirect3DBaseTexture8 *source_texture, IDirect3DBaseTexture8 *dest_texture) = 0;
	virtual HRESULT CopyRects(IDirect3DSurface8 *source_surface, const RECT *source_rects, UINT rect_count, IDirect3DSurface8 *dest_surface, const POINT *dest_points) = 0;
	virtual HRESULT ResourceManagerDiscardBytes(DWORD bytes) = 0;
	virtual UINT GetAvailableTextureMem() = 0;
	virtual HRESULT GetFrontBuffer(IDirect3DSurface8 *dest_surface) = 0;
	virtual HRESULT SetRenderTarget(IDirect3DSurface8 *render_target, IDirect3DSurface8 *depth_stencil) = 0;
	virtual HRESULT GetRenderTarget(IDirect3DSurface8 **render_target) = 0;
	virtual HRESULT GetDepthStencilSurface(IDirect3DSurface8 **depth_stencil) = 0;
	virtual HRESULT BeginScene() = 0;
	virtual HRESULT EndScene() = 0;
	virtual HRESULT Clear(DWORD count, const void *rects, DWORD flags, D3DCOLOR color, float z, DWORD stencil) = 0;
	virtual HRESULT SetTransform(D3DTRANSFORMSTATETYPE state, const D3DMATRIX *matrix) = 0;
	virtual HRESULT GetTransform(D3DTRANSFORMSTATETYPE state, D3DMATRIX *matrix) = 0;
	virtual HRESULT MultiplyTransform(D3DTRANSFORMSTATETYPE state, const D3DMATRIX *matrix) = 0;
	virtual HRESULT SetViewport(const D3DVIEWPORT8 *viewport) = 0;
	virtual HRESULT GetViewport(D3DVIEWPORT8 *viewport) = 0;
	virtual HRESULT SetMaterial(const D3DMATERIAL8 *material) = 0;
	virtual HRESULT GetMaterial(D3DMATERIAL8 *material) = 0;
	virtual HRESULT SetLight(DWORD index, const D3DLIGHT8 *light) = 0;
	virtual HRESULT LightEnable(DWORD index, BOOL enable) = 0;
	virtual HRESULT SetClipPlane(DWORD index, const float *plane) = 0;
	virtual HRESULT SetRenderState(D3DRENDERSTATETYPE state, DWORD value) = 0;
	virtual HRESULT GetRenderState(D3DRENDERSTATETYPE state, DWORD *value) = 0;
	virtual HRESULT SetTexture(DWORD stage, IDirect3DBaseTexture8 *texture) = 0;
	virtual HRESULT SetTextureStageState(DWORD stage, D3DTEXTURESTAGESTATETYPE state, DWORD value) = 0;
	virtual HRESULT ValidateDevice(DWORD *passes) = 0;
	virtual HRESULT SetCurrentTexturePalette(UINT palette) = 0;
	virtual HRESULT DrawPrimitive(D3DPRIMITIVETYPE primitive_type, UINT start_vertex, UINT primitive_count) = 0;
	virtual HRESULT DrawIndexedPrimitive(D3DPRIMITIVETYPE primitive_type, UINT min_index, UINT vertex_count, UINT start_index, UINT primitive_count) = 0;
	virtual HRESULT DrawPrimitiveUP(D3DPRIMITIVETYPE primitive_type, UINT primitive_count, const void *vertex_stream_zero_data, UINT vertex_stream_zero_stride) = 0;
	virtual HRESULT DrawIndexedPrimitiveUP(D3DPRIMITIVETYPE primitive_type, UINT min_vertex_index, UINT vertex_count, UINT primitive_count, const void *index_data, D3DFORMAT index_data_format, const void *vertex_stream_zero_data, UINT vertex_stream_zero_stride) = 0;
	virtual HRESULT ProcessVertices(UINT source_start_index, UINT dest_index, UINT vertex_count, IDirect3DVertexBuffer8 *dest_buffer, DWORD flags) = 0;
	virtual HRESULT CreateVertexShader(const DWORD *declaration, const DWORD *function, DWORD *handle, DWORD usage) = 0;
	virtual HRESULT SetVertexShader(DWORD handle) = 0;
	virtual HRESULT DeleteVertexShader(DWORD handle) = 0;
	virtual HRESULT SetVertexShaderConstant(DWORD register_index, const void *constant_data, DWORD constant_count) = 0;
	virtual HRESULT CreatePixelShader(const DWORD *function, DWORD *handle) = 0;
	virtual HRESULT SetPixelShader(DWORD handle) = 0;
	virtual HRESULT DeletePixelShader(DWORD handle) = 0;
	virtual HRESULT SetPixelShaderConstant(DWORD register_index, const void *constant_data, DWORD constant_count) = 0;
	virtual HRESULT SetStreamSource(UINT stream_number, IDirect3DVertexBuffer8 *stream_data, UINT stride) = 0;
	virtual HRESULT SetIndices(IDirect3DIndexBuffer8 *index_data, UINT base_vertex_index) = 0;
	virtual ULONG AddRef() = 0;
	virtual ULONG Release() = 0;
};

struct IDirect3D8
{
	virtual HRESULT RegisterSoftwareDevice(void *initialize_function) = 0;
	virtual UINT GetAdapterCount() = 0;
	virtual HRESULT GetAdapterIdentifier(UINT adapter, DWORD flags, D3DADAPTER_IDENTIFIER8 *identifier) = 0;
	virtual UINT GetAdapterModeCount(UINT adapter) = 0;
	virtual HRESULT EnumAdapterModes(UINT adapter, UINT mode, D3DDISPLAYMODE *display_mode) = 0;
	virtual HRESULT GetAdapterDisplayMode(UINT adapter, D3DDISPLAYMODE *display_mode) = 0;
	virtual HRESULT CheckDeviceType(UINT adapter, DWORD device_type, D3DFORMAT display_format, D3DFORMAT back_buffer_format, BOOL windowed) = 0;
	virtual HRESULT CheckDeviceFormat(UINT adapter, DWORD device_type, D3DFORMAT adapter_format, DWORD usage, D3DRESOURCETYPE resource_type, D3DFORMAT check_format) = 0;
	virtual HRESULT CheckDepthStencilMatch(UINT adapter, DWORD device_type, D3DFORMAT adapter_format, D3DFORMAT render_target_format, D3DFORMAT depth_stencil_format) = 0;
	virtual HRESULT GetDeviceCaps(UINT adapter, DWORD device_type, D3DCAPS8 *caps) = 0;
	virtual HRESULT CreateDevice(UINT adapter, DWORD device_type, HWND focus_window, DWORD behavior_flags, D3DPRESENT_PARAMETERS *presentation_parameters, IDirect3DDevice8 **device) = 0;
	virtual ULONG AddRef() = 0;
	virtual ULONG Release() = 0;
};

IDirect3D8 *Direct3DCreate8(UINT sdk_version);

#define D3DFVF_XYZ 0x002
#define D3DFVF_XYZRHW 0x004
#define D3DFVF_XYZB4 0x008
#define D3DFVF_NORMAL 0x010
#define D3DFVF_DIFFUSE 0x040
#define D3DFVF_SPECULAR 0x080
#define D3DFVF_TEX1 0x100
#define D3DFVF_TEX2 0x200
#define D3DFVF_TEX3 0x300
#define D3DFVF_TEX4 0x400
#define D3DFVF_TEX5 0x500
#define D3DFVF_TEX6 0x600
#define D3DFVF_TEX7 0x700
#define D3DFVF_TEX8 0x800
#define D3DFVF_LASTBETA_UBYTE4 0x1000
#define D3DFVF_TEXCOUNT_MASK 0xf00
#define D3DFVF_TEXCOUNT_SHIFT 8
#define D3DFVF_TEXCOORDSIZE1(coord) (0x00030000 << ((coord) * 2))
#define D3DFVF_TEXCOORDSIZE2(coord) (0)
#define D3DFVF_TEXCOORDSIZE3(coord) (0x00010000 << ((coord) * 2))
#define D3DFVF_TEXCOORDSIZE4(coord) (0x00020000 << ((coord) * 2))
#define D3DDP_MAXTEXCOORD 8
#define D3DFVFTEXCOORDSIZE3(coord) D3DFVF_TEXCOORDSIZE3(coord)

#define D3DUSAGE_RENDERTARGET 0x00000001L
#define D3DUSAGE_DEPTHSTENCIL 0x00000002L
#define D3DUSAGE_WRITEONLY 0x00000008L
#define D3DUSAGE_SOFTWAREPROCESSING 0x00000010L
#define D3DUSAGE_DONOTCLIP 0x00000020L
#define D3DUSAGE_POINTS 0x00000040L
#define D3DUSAGE_RTPATCHES 0x00000080L
#define D3DUSAGE_NPATCHES 0x00000100L
#define D3DUSAGE_DYNAMIC 0x00000200L

#define D3DLOCK_READONLY 0x00000010L
#define D3DLOCK_DISCARD 0x00002000L
#define D3DLOCK_NOOVERWRITE 0x00001000L
#define D3DLOCK_NOSYSLOCK 0x00000800L
#define D3DLOCK_NO_DIRTY_UPDATE 0x00008000L

#define D3DCURSOR_IMMEDIATE_UPDATE 0x00000001L

#define D3DCAPS2_FULLSCREENGAMMA 0x00020000L
#define D3DDEVCAPS_HWTRANSFORMANDLIGHT 0x00010000L
#define D3DDEVCAPS_PUREDEVICE 0x00100000L
#define D3DDEVCAPS_NPATCHES 0x01000000L
#define D3DPMISCCAPS_COLORWRITEENABLE 0x00000080L
#define D3DPRASTERCAPS_FOGRANGE 0x00010000L
#define D3DPRASTERCAPS_ZBIAS 0x00004000L
#define D3DPTEXTURECAPS_CUBEMAP 0x00000800L
#define D3DPTFILTERCAPS_MINFPOINT 0x00000100L
#define D3DPTFILTERCAPS_MINFLINEAR 0x00000200L
#define D3DPTFILTERCAPS_MINFANISOTROPIC 0x00000400L
#define D3DPTFILTERCAPS_MIPFPOINT 0x00010000L
#define D3DPTFILTERCAPS_MIPFLINEAR 0x00020000L
#define D3DPTFILTERCAPS_MAGFPOINT 0x01000000L
#define D3DPTFILTERCAPS_MAGFLINEAR 0x02000000L
#define D3DPTFILTERCAPS_MAGFANISOTROPIC 0x04000000L
#define D3DTEXOPCAPS_DISABLE 0x00000001L
#define D3DTEXOPCAPS_SELECTARG1 0x00000002L
#define D3DTEXOPCAPS_SELECTARG2 0x00000004L
#define D3DTEXOPCAPS_MODULATE 0x00000008L
#define D3DTEXOPCAPS_MODULATE2X 0x00000010L
#define D3DTEXOPCAPS_MODULATE4X 0x00000020L
#define D3DTEXOPCAPS_ADD 0x00000040L
#define D3DTEXOPCAPS_ADDSIGNED 0x00000080L
#define D3DTEXOPCAPS_ADDSIGNED2X 0x00000100L
#define D3DTEXOPCAPS_SUBTRACT 0x00000200L
#define D3DTEXOPCAPS_ADDSMOOTH 0x00000400L
#define D3DTEXOPCAPS_BLENDDIFFUSEALPHA 0x00000800L
#define D3DTEXOPCAPS_BLENDTEXTUREALPHA 0x00001000L
#define D3DTEXOPCAPS_BLENDFACTORALPHA 0x00002000L
#define D3DTEXOPCAPS_BLENDTEXTUREALPHAPM 0x00004000L
#define D3DTEXOPCAPS_BLENDCURRENTALPHA 0x00008000L
#define D3DTEXOPCAPS_PREMODULATE 0x00010000L
#define D3DTEXOPCAPS_MODULATEALPHA_ADDCOLOR 0x00020000L
#define D3DTEXOPCAPS_MODULATECOLOR_ADDALPHA 0x00040000L
#define D3DTEXOPCAPS_MODULATEINVALPHA_ADDCOLOR 0x00080000L
#define D3DTEXOPCAPS_MODULATEINVCOLOR_ADDALPHA 0x00100000L
#define D3DTEXOPCAPS_BUMPENVMAP 0x00200000L
#define D3DTEXOPCAPS_BUMPENVMAPLUMINANCE 0x00400000L
#define D3DTEXOPCAPS_DOTPRODUCT3 0x00800000L
#define D3DTEXOPCAPS_MULTIPLYADD 0x01000000L
#define D3DTEXOPCAPS_LERP 0x02000000L

#define D3DTSS_TCI_PASSTHRU 0x00000000
#define D3DTSS_TCI_CAMERASPACENORMAL 0x00010000
#define D3DTSS_TCI_CAMERASPACEPOSITION 0x00020000
#define D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR 0x00030000
#define D3DTTFF_COUNT1 1
#define D3DTTFF_COUNT2 2
#define D3DTTFF_COUNT3 3
#define D3DTTFF_COUNT4 4
#define D3DTTFF_DISABLE 0
#define D3DTTFF_PROJECTED 256

#define D3DFOG_NONE 0
#define D3DFOG_EXP 1
#define D3DFOG_EXP2 2
#define D3DFOG_LINEAR 3

#define D3DTADDRESS_WRAP 1
#define D3DTADDRESS_MIRROR 2
#define D3DTADDRESS_CLAMP 3
#define D3DTADDRESS_BORDER 4
#define D3DTADDRESS_MIRRORONCE 5

#define D3DTEXF_NONE 0
#define D3DTEXF_POINT 1
#define D3DTEXF_LINEAR 2
#define D3DTEXF_ANISOTROPIC 3
#define D3DTEXF_FLATCUBIC 4
#define D3DTEXF_GAUSSIANCUBIC 5

#define D3DTA_SELECTMASK 0x0000000f
#define D3DTA_DIFFUSE 0x00000000
#define D3DTA_CURRENT 0x00000001
#define D3DTA_TEXTURE 0x00000002
#define D3DTA_TFACTOR 0x00000003
#define D3DTA_SPECULAR 0x00000004
#define D3DTA_TEMP 0x00000005
#define D3DTA_COMPLEMENT 0x00000010
#define D3DTA_ALPHAREPLICATE 0x00000020

#define D3DTOP_DISABLE 1
#define D3DTOP_SELECTARG1 2
#define D3DTOP_SELECTARG2 3
#define D3DTOP_MODULATE 4
#define D3DTOP_MODULATE2X 5
#define D3DTOP_MODULATE4X 6
#define D3DTOP_ADD 7
#define D3DTOP_ADDSIGNED 8
#define D3DTOP_ADDSIGNED2X 9
#define D3DTOP_SUBTRACT 10
#define D3DTOP_ADDSMOOTH 11
#define D3DTOP_BLENDDIFFUSEALPHA 12
#define D3DTOP_BLENDTEXTUREALPHA 13
#define D3DTOP_BLENDFACTORALPHA 14
#define D3DTOP_BLENDTEXTUREALPHAPM 15
#define D3DTOP_BLENDCURRENTALPHA 16
#define D3DTOP_PREMODULATE 17
#define D3DTOP_MODULATEALPHA_ADDCOLOR 18
#define D3DTOP_MODULATECOLOR_ADDALPHA 19
#define D3DTOP_MODULATEINVALPHA_ADDCOLOR 20
#define D3DTOP_MODULATEINVCOLOR_ADDALPHA 21
#define D3DTOP_BUMPENVMAP 22
#define D3DTOP_BUMPENVMAPLUMINANCE 23
#define D3DTOP_DOTPRODUCT3 24
#define D3DTOP_MULTIPLYADD 25
#define D3DTOP_LERP 26

#define D3DBLEND_ZERO 1
#define D3DBLEND_ONE 2
#define D3DBLEND_SRCCOLOR 3
#define D3DBLEND_INVSRCCOLOR 4
#define D3DBLEND_SRCALPHA 5
#define D3DBLEND_INVSRCALPHA 6
#define D3DBLEND_DESTALPHA 7
#define D3DBLEND_INVDESTALPHA 8
#define D3DBLEND_DESTCOLOR 9
#define D3DBLEND_INVDESTCOLOR 10
#define D3DBLEND_SRCALPHASAT 11
#define D3DBLEND_BOTHSRCALPHA 12
#define D3DBLEND_BOTHINVSRCALPHA 13
#define D3DBLENDOP_ADD 1
#define D3DBLENDOP_SUBTRACT 2
#define D3DBLENDOP_REVSUBTRACT 3
#define D3DBLENDOP_MIN 4
#define D3DBLENDOP_MAX 5

#define D3DCMP_NEVER 1
#define D3DCMP_LESS 2
#define D3DCMP_EQUAL 3
#define D3DCMP_LESSEQUAL 4
#define D3DCMP_GREATER 5
#define D3DCMP_NOTEQUAL 6
#define D3DCMP_GREATEREQUAL 7
#define D3DCMP_ALWAYS 8

#define D3DFILL_POINT 1
#define D3DFILL_WIREFRAME 2
#define D3DFILL_SOLID 3
#define D3DCULL_NONE 1
#define D3DCULL_CW 2
#define D3DCULL_CCW 3
#define D3DMCS_MATERIAL 0
#define D3DMCS_COLOR1 1
#define D3DMCS_COLOR2 2

#define D3DCLEAR_TARGET 0x00000001L
#define D3DCLEAR_ZBUFFER 0x00000002L
#define D3DCLEAR_STENCIL 0x00000004L
#define D3DCOLORWRITEENABLE_RED 1
#define D3DCOLORWRITEENABLE_GREEN 2
#define D3DCOLORWRITEENABLE_BLUE 4
#define D3DCOLORWRITEENABLE_ALPHA 8

#define D3DMULTISAMPLE_NONE 0
#define D3DSWAPEFFECT_DISCARD 1
#define D3DSWAPEFFECT_FLIP 2
#define D3DSWAPEFFECT_COPY 3
#define D3DSWAPEFFECT_COPY_VSYNC 4
#define D3DPRESENT_RATE_DEFAULT 0
#define D3DPRESENT_INTERVAL_DEFAULT 0x00000000L
#define D3DPRESENT_INTERVAL_ONE 0x00000001L
#define D3DPRESENT_INTERVAL_TWO 0x00000002L
#define D3DPRESENT_INTERVAL_THREE 0x00000004L
#define D3DPRESENT_INTERVAL_FOUR 0x00000008L
#define D3DPRESENT_INTERVAL_IMMEDIATE 0x80000000L

#define D3DSGR_NO_CALIBRATION 0
#define D3DSGR_CALIBRATE 1
#define D3DSHADE_FLAT 1
#define D3DSHADE_GOURAUD 2
#define D3DSHADE_PHONG 3
#define D3DSTENCILOP_KEEP 1
#define D3DSTENCILOP_ZERO 2
#define D3DSTENCILOP_REPLACE 3
#define D3DSTENCILOP_INCRSAT 4
#define D3DSTENCILOP_DECRSAT 5
#define D3DSTENCILOP_INVERT 6
#define D3DSTENCILOP_INCR 7
#define D3DSTENCILOP_DECR 8
#define D3DWRAP_U 0x00000001L
#define D3DWRAP_V 0x00000002L
#define D3DWRAP_W 0x00000004L
#define D3DPATCHEDGE_DISCRETE 0
#define D3DPATCHEDGE_CONTINUOUS 1
#define D3DVBF_DISABLE 0
#define D3DVBF_1WEIGHTS 1
#define D3DVBF_2WEIGHTS 2
#define D3DVBF_3WEIGHTS 3
#define D3DVBF_TWEENING 255
#define D3DVBF_0WEIGHTS 256
#define D3DZB_FALSE 0
#define D3DZB_TRUE 1
#define D3DZB_USEW 2

#define D3DADAPTER_DEFAULT 0
#define D3DDEVTYPE_HAL 1
#define D3DCREATE_FPU_PRESERVE 0x00000002L
#define D3DCREATE_MULTITHREADED 0x00000004L
#define D3DCREATE_PUREDEVICE 0x00000010L
#define D3DCREATE_SOFTWARE_VERTEXPROCESSING 0x00000020L
#define D3DCREATE_MIXED_VERTEXPROCESSING 0x00000080L
#define D3DENUM_NO_WHQL_LEVEL 0x00000002L
#define D3DBACKBUFFER_TYPE_MONO 0
#define D3DDMT_ENABLE 0
#define D3DDMT_DISABLE 1
