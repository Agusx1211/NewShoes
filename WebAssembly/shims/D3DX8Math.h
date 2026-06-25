#pragma once

struct D3DXVECTOR4
{
	float x;
	float y;
	float z;
	float w;

	D3DXVECTOR4() : x(0.0f), y(0.0f), z(0.0f), w(0.0f) {}
	D3DXVECTOR4(float x_in, float y_in, float z_in, float w_in) :
		x(x_in), y(y_in), z(z_in), w(w_in)
	{
	}
};

struct D3DXMATRIX
{
	float m[4][4];

	D3DXMATRIX(
		float m11, float m12, float m13, float m14,
		float m21, float m22, float m23, float m24,
		float m31, float m32, float m33, float m34,
		float m41, float m42, float m43, float m44) :
		m{
			{ m11, m12, m13, m14 },
			{ m21, m22, m23, m24 },
			{ m31, m32, m33, m34 },
			{ m41, m42, m43, m44 }
		}
	{
	}
};

static inline D3DXVECTOR4 *D3DXVec4Transform(
	D3DXVECTOR4 *out,
	const D3DXVECTOR4 *vector,
	const D3DXMATRIX *matrix)
{
	out->x = vector->x * matrix->m[0][0] +
		vector->y * matrix->m[1][0] +
		vector->z * matrix->m[2][0] +
		vector->w * matrix->m[3][0];
	out->y = vector->x * matrix->m[0][1] +
		vector->y * matrix->m[1][1] +
		vector->z * matrix->m[2][1] +
		vector->w * matrix->m[3][1];
	out->z = vector->x * matrix->m[0][2] +
		vector->y * matrix->m[1][2] +
		vector->z * matrix->m[2][2] +
		vector->w * matrix->m[3][2];
	out->w = vector->x * matrix->m[0][3] +
		vector->y * matrix->m[1][3] +
		vector->z * matrix->m[2][3] +
		vector->w * matrix->m[3][3];
	return out;
}

static inline float D3DXVec4Dot(const D3DXVECTOR4 *left, const D3DXVECTOR4 *right)
{
	return left->x * right->x +
		left->y * right->y +
		left->z * right->z +
		left->w * right->w;
}
