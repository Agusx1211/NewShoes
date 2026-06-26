#pragma once

#include <cmath>

struct D3DXVECTOR3
{
	float x;
	float y;
	float z;

	D3DXVECTOR3() : x(0.0f), y(0.0f), z(0.0f) {}
	D3DXVECTOR3(float x_in, float y_in, float z_in) :
		x(x_in), y(y_in), z(z_in)
	{
	}
};

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

	float &operator[](int index)
	{
		return (&x)[index];
	}

	const float &operator[](int index) const
	{
		return (&x)[index];
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

static inline D3DXMATRIX operator*(const D3DXMATRIX &left, const D3DXMATRIX &right)
{
	D3DXMATRIX result(
		0.0f, 0.0f, 0.0f, 0.0f,
		0.0f, 0.0f, 0.0f, 0.0f,
		0.0f, 0.0f, 0.0f, 0.0f,
		0.0f, 0.0f, 0.0f, 0.0f);

	for (int row = 0; row < 4; ++row) {
		for (int column = 0; column < 4; ++column) {
			for (int index = 0; index < 4; ++index) {
				result.m[row][column] += left.m[row][index] * right.m[index][column];
			}
		}
	}

	return result;
}

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

static inline D3DXVECTOR4 *D3DXVec3Transform(
	D3DXVECTOR4 *out,
	const D3DXVECTOR3 *vector,
	const D3DXMATRIX *matrix)
{
	D3DXVECTOR4 vector4(vector->x, vector->y, vector->z, 1.0f);
	return D3DXVec4Transform(out, &vector4, matrix);
}

static inline float D3DXVec4Dot(const D3DXVECTOR4 *left, const D3DXVECTOR4 *right)
{
	return left->x * right->x +
		left->y * right->y +
		left->z * right->z +
		left->w * right->w;
}

static inline D3DXMATRIX *D3DXMatrixInverse(
	D3DXMATRIX *out,
	float *determinant,
	const D3DXMATRIX *matrix)
{
	if (out == nullptr || matrix == nullptr) {
		return nullptr;
	}

	float augmented[4][8] = {};
	for (int row = 0; row < 4; ++row) {
		for (int column = 0; column < 4; ++column) {
			augmented[row][column] = matrix->m[row][column];
		}
		augmented[row][4 + row] = 1.0f;
	}

	float det = 1.0f;
	float sign = 1.0f;
	for (int column = 0; column < 4; ++column) {
		int pivot_row = column;
		float pivot_abs = std::fabs(augmented[column][column]);
		for (int row = column + 1; row < 4; ++row) {
			const float candidate_abs = std::fabs(augmented[row][column]);
			if (candidate_abs > pivot_abs) {
				pivot_abs = candidate_abs;
				pivot_row = row;
			}
		}

		if (pivot_abs <= 0.00000001f) {
			if (determinant != nullptr) {
				*determinant = 0.0f;
			}
			return nullptr;
		}

		if (pivot_row != column) {
			for (int index = 0; index < 8; ++index) {
				const float temp = augmented[column][index];
				augmented[column][index] = augmented[pivot_row][index];
				augmented[pivot_row][index] = temp;
			}
			sign = -sign;
		}

		const float pivot = augmented[column][column];
		det *= pivot;
		for (int index = 0; index < 8; ++index) {
			augmented[column][index] /= pivot;
		}

		for (int row = 0; row < 4; ++row) {
			if (row == column) {
				continue;
			}
			const float factor = augmented[row][column];
			for (int index = 0; index < 8; ++index) {
				augmented[row][index] -= factor * augmented[column][index];
			}
		}
	}

	if (determinant != nullptr) {
		*determinant = det * sign;
	}
	for (int row = 0; row < 4; ++row) {
		for (int column = 0; column < 4; ++column) {
			out->m[row][column] = augmented[row][4 + column];
		}
	}
	return out;
}
