#pragma once

#include "surrender_math.hpp"

class srGERD
{
public:
	enum MatrixMode
	{
		MODELVIEW
	};

	void matrixMode(MatrixMode mode);
	void pushMultMatrix(const srMatrix4x3 &matrix);
	void popMatrix();
};
