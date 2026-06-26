#pragma once

#include "surrender_math.hpp"

class srNode
{
public:
	void addReference();
	void release();
	void setLocation(float x, float y, float z);
	void setRotation(const srMatrix3 &rotation);
	srVector3 getLocation() const;
	void getRotation(srMatrix3 &rotation) const;
};
