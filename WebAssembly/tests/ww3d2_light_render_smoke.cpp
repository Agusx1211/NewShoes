#include <cmath>
#include <cstdio>

#include "PreRTS.h"

#include "Common/GameMemory.h"
#include "Common/SubsystemInterface.h"
#include "camera.h"
#include "light.h"
#include "lightenvironment.h"
#include "matrix3d.h"
#include "rendobj.h"
#include "scene.h"
#include "ww3d.h"

SubsystemInterfaceList *TheSubsystemList = nullptr;

namespace {
bool near(float actual, float expected, float epsilon = 0.0001f)
{
	return std::fabs(actual - expected) <= epsilon;
}

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::fprintf(stderr, "%s\n", message);
		return false;
	}
	return true;
}

bool near_vector(const Vector3 &actual, const Vector3 &expected, float epsilon = 0.0001f)
{
	return near(actual.X, expected.X, epsilon) &&
		near(actual.Y, expected.Y, epsilon) &&
		near(actual.Z, expected.Z, epsilon);
}

bool smoke_render_object_light()
{
	WW3D::Set_Default_Native_Screen_Size(0.75f);

	LightClass *point_light = W3DNEW LightClass(LightClass::POINT);
	point_light->Set_Position(Vector3(10.0f, 0.0f, 0.0f));
	point_light->Set_Ambient(Vector3(0.1f, 0.05f, 0.0f));
	point_light->Set_Diffuse(Vector3(0.8f, 0.4f, 0.2f));
	point_light->Set_Far_Attenuation_Range(0.0, 20.0);
	point_light->Set_Flag(LightClass::FAR_ATTENUATION, true);

	SphereClass sphere;
	AABoxClass box;
	point_light->Get_Obj_Space_Bounding_Sphere(sphere);
	point_light->Get_Obj_Space_Bounding_Box(box);

	RenderObjClass *clone = point_light->Clone();
	const bool render_object_ok =
		expect(point_light->Class_ID() == RenderObjClass::CLASSID_LIGHT, "LightClass class id mismatch") &&
		expect(point_light->Is_Vertex_Processor(), "LightClass did not report vertex-processor behavior") &&
		expect(near(point_light->Get_Native_Screen_Size(), 0.75f), "RenderObj default native screen size mismatch") &&
		expect(near_vector(point_light->Get_Position(), Vector3(10.0f, 0.0f, 0.0f)), "RenderObj position mismatch") &&
		expect(near(sphere.Radius, 20.0f), "LightClass bounding sphere radius mismatch") &&
		expect(near_vector(box.Extent, Vector3(20.0f, 20.0f, 20.0f)), "LightClass bounding box extent mismatch") &&
		expect(clone != nullptr, "LightClass clone returned null") &&
		expect(clone->Class_ID() == RenderObjClass::CLASSID_LIGHT, "LightClass clone class id mismatch");

	clone->Release_Ref();

	LightClass *directional_light = W3DNEW LightClass(LightClass::DIRECTIONAL);
	const bool directional_ok =
		expect(directional_light->Is_Force_Visible(), "Directional LightClass was not forced visible");

	LightEnvironmentClass environment;
	environment.Reset(Vector3(0.0f, 0.0f, 0.0f), Vector3(0.05f, 0.05f, 0.05f));
	environment.Add_Light(*point_light);
	environment.Pre_Render_Update(Matrix3D(1));

	const bool environment_ok =
		expect(environment.Get_Light_Count() == 1, "LightEnvironment did not keep the point light") &&
		expect(environment.isPointLight(0), "LightEnvironment lost point-light metadata") &&
		expect(near(environment.getPointOrad(0), 20.0f), "LightEnvironment outer radius mismatch") &&
		expect(near_vector(environment.getPointCenter(0), Vector3(10.0f, 0.0f, 0.0f)),
			"LightEnvironment point center mismatch") &&
		expect(near_vector(environment.Get_Equivalent_Ambient(), Vector3(0.1f, 0.075f, 0.05f)),
			"LightEnvironment ambient contribution mismatch") &&
		expect(near_vector(environment.Get_Light_Diffuse(0), Vector3(0.4f, 0.2f, 0.1f)),
			"LightEnvironment diffuse attenuation mismatch") &&
		expect(near_vector(environment.Get_Light_Direction(0), Vector3(1.0f, 0.0f, 0.0f)),
			"LightEnvironment light direction mismatch");

	directional_light->Release_Ref();
	point_light->Release_Ref();
	return render_object_ok && directional_ok && environment_ok;
}

bool smoke_camera_defaults()
{
	CameraClass *camera = W3DNEW CameraClass();

	float near_clip = 0.0f;
	float far_clip = 0.0f;
	camera->Get_Clip_Planes(near_clip, far_clip);

	Vector2 view_min;
	Vector2 view_max;
	camera->Get_View_Plane(view_min, view_max);

	RenderObjClass *clone = camera->Clone();
	const bool ok =
		expect(camera->Class_ID() == RenderObjClass::CLASSID_CAMERA, "CameraClass class id mismatch") &&
		expect(near(near_clip, 1.0f), "CameraClass default near clip mismatch") &&
		expect(near(far_clip, 1000.0f), "CameraClass default far clip mismatch") &&
		expect(near(camera->Get_Viewport().Width(), 1.0f), "CameraClass default viewport width mismatch") &&
		expect(near(camera->Get_Viewport().Height(), 1.0f), "CameraClass default viewport height mismatch") &&
		expect(view_min.X < 0.0f && view_min.Y < 0.0f && view_max.X > 0.0f && view_max.Y > 0.0f,
			"CameraClass default view plane was not initialized") &&
		expect(clone != nullptr, "CameraClass clone returned null") &&
		expect(clone->Class_ID() == RenderObjClass::CLASSID_CAMERA, "CameraClass clone class id mismatch");

	clone->Release_Ref();
	camera->Release_Ref();
	return ok;
}

bool smoke_scene_id_dispatch()
{
	SimpleSceneClass *simple_scene = W3DNEW SimpleSceneClass();
	const SceneClass *scene = simple_scene;
	const bool ok = expect(scene->Get_Scene_ID() == SceneClass::SCENE_ID_SIMPLE,
		"SimpleSceneClass reported the base scene ID through SceneClass pointer");
	simple_scene->Release_Ref();
	return ok;
}
}

int main()
{
	initMemoryManager();

	if (!smoke_render_object_light()) {
		return 1;
	}
	if (!smoke_camera_defaults()) {
		return 1;
	}
	if (!smoke_scene_id_dispatch()) {
		return 1;
	}

	std::printf("{\"ok\":true,\"smoke\":\"ww3d2-light-render\"}\n");
	return 0;
}
