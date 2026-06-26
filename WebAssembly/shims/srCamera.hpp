#pragma once

#include "surrender_math.hpp"

class srCamera
{
public:
	void setLocation(float x, float y, float z);
	void setRotation(const srMatrix3 &rotation);
	float getLocationX() const;
	float getLocationY() const;
	float getLocationZ() const;
	void getRotation(srMatrix3 &rotation) const;
};
