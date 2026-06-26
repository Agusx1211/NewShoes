#pragma once

#include "matrix4.h"
#include "vector2.h"
#include "vector3.h"
#include "vector3i.h"
#include "vector4.h"

using Matrix4 = Matrix4x4;

class srVector2
{
public:
	float X;
	float Y;

	srVector2() = default;
	srVector2(float x, float y) : X(x), Y(y) {}

	float &operator[](int index) { return (&X)[index]; }
	const float &operator[](int index) const { return (&X)[index]; }
	void make(float x, float y) { X = x; Y = y; }
};

class srVector3
{
public:
	float X;
	float Y;
	float Z;

	srVector3() = default;
	srVector3(float x, float y, float z) : X(x), Y(y), Z(z) {}

	float &operator[](int index) { return (&X)[index]; }
	const float &operator[](int index) const { return (&X)[index]; }
	void make(float x, float y, float z) { X = x; Y = y; Z = z; }
};

class srVector4
{
public:
	float X;
	float Y;
	float Z;
	float W;

	srVector4() = default;
	srVector4(float x, float y, float z, float w) : X(x), Y(y), Z(z), W(w) {}

	float &operator[](int index) { return (&X)[index]; }
	const float &operator[](int index) const { return (&X)[index]; }
	void make(float x, float y, float z, float w) { X = x; Y = y; Z = z; W = w; }
};

class srVector4d
{
public:
	double X;
	double Y;
	double Z;
	double W;

	srVector4d() = default;
	srVector4d(double x, double y, double z, double w) : X(x), Y(y), Z(z), W(w) {}

	double &operator[](int index) { return (&X)[index]; }
	const double &operator[](int index) const { return (&X)[index]; }
	void make(double x, double y, double z, double w) { X = x; Y = y; Z = z; W = w; }
};

class srVector3i
{
public:
	int I;
	int J;
	int K;

	srVector3i() = default;
	srVector3i(int i, int j, int k) : I(i), J(j), K(k) {}

	int &operator[](int index) { return (&I)[index]; }
	const int &operator[](int index) const { return (&I)[index]; }
	void make(int i, int j, int k) { I = i; J = j; K = k; }
};

class srMatrix3
{
public:
	srVector3 &operator[](int index) { return Row[index]; }
	const srVector3 &operator[](int index) const { return Row[index]; }

private:
	srVector3 Row[3];
};

class srMatrix4
{
public:
	srVector4 &operator[](int index) { return Row[index]; }
	const srVector4 &operator[](int index) const { return Row[index]; }

private:
	srVector4 Row[4];
};

class srMatrix4d
{
public:
	srVector4d &operator[](int index) { return Row[index]; }
	const srVector4d &operator[](int index) const { return Row[index]; }

private:
	srVector4d Row[4];
};

class srMatrix4x3
{
public:
	srVector4 &operator[](int index) { return Row[index]; }
	const srVector4 &operator[](int index) const { return Row[index]; }

private:
	srVector4 Row[3];
};
