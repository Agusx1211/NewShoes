#include <cmath>
#include <cstdio>
#include <cstring>

#include "PreRTS.h"

#include "GameLogic/PartitionManager.h"

SubsystemInterfaceList *TheSubsystemList = NULL;

extern "C" Bool cnc_partition_distance_test_calculate(
	Int dc,
	const Coord3D *posA,
	Real circleRadiusA,
	Real sphereRadiusA,
	Real zDeltaA,
	const Coord3D *posB,
	Real circleRadiusB,
	Real sphereRadiusB,
	Real zDeltaB,
	Real *abDistSqr,
	Coord3D *abVec,
	Real maxDistSqr);

namespace
{

UnsignedInt floatBits(Real value)
{
	UnsignedInt bits = 0;
	std::memcpy(&bits, &value, sizeof(bits));
	return bits;
}

Bool sameBits(Real left, Real right)
{
	return floatBits(left) == floatBits(right);
}

Bool referenceDistance(
	DistanceCalculationType dc,
	const Coord3D& posA,
	Real circleRadiusA,
	Real sphereRadiusA,
	Real zDeltaA,
	const Coord3D& posB,
	Real circleRadiusB,
	Real sphereRadiusB,
	Real zDeltaB,
	Real& distSqr,
	Coord3D& vec,
	Real maxDistSqr)
{
	Coord3D diff;
	diff.x = posB.x - posA.x;
	diff.y = posB.y - posA.y;
	diff.z = 0.0f;

	if (dc == FROM_CENTER_3D || dc == FROM_BOUNDINGSPHERE_3D)
	{
		diff.z = dc == FROM_CENTER_3D
			? posB.z - posA.z
			: ((posB.z + zDeltaB) - (posA.z + zDeltaA));
	}

	Real actualDistSqr = sqr(diff.x) + sqr(diff.y);
	if (dc == FROM_CENTER_3D || dc == FROM_BOUNDINGSPHERE_3D)
		actualDistSqr += sqr(diff.z);

	if (dc == FROM_CENTER_2D || dc == FROM_CENTER_3D)
	{
		distSqr = actualDistSqr;
		vec = diff;
		return distSqr < maxDistSqr;
	}

	Real shrinkFactor = 1.0f;
	Real shrunkenDistSqr = actualDistSqr;
	const Real totalRad = dc == FROM_BOUNDINGSPHERE_2D
		? circleRadiusA + circleRadiusB
		: sphereRadiusA + sphereRadiusB;
	if (totalRad > 0.0f)
	{
		const Real actualDist = sqrtf(actualDistSqr);
		const Real shrunkenDist = actualDist - totalRad;
		if (shrunkenDist <= 0.0f)
		{
			shrinkFactor = 0.0f;
			shrunkenDistSqr = 0.0f;
		}
		else
		{
			shrinkFactor = shrunkenDist / actualDist;
			shrunkenDistSqr = sqr(shrunkenDist);
		}
	}

	distSqr = shrunkenDistSqr;
	diff.x *= shrinkFactor;
	diff.y *= shrinkFactor;
	if (dc == FROM_BOUNDINGSPHERE_3D)
		diff.z *= shrinkFactor;
	vec = diff;
	return distSqr < maxDistSqr;
}

UnsignedInt nextRandom(UnsignedInt& state)
{
	state = state * 1664525u + 1013904223u;
	return state;
}

Real randomPosition(UnsignedInt& state)
{
	const Int value = static_cast<Int>(nextRandom(state) % 200001u) - 100000;
	return static_cast<Real>(value) * 0.03125f;
}

Real randomRadius(UnsignedInt& state)
{
	return static_cast<Real>(nextRandom(state) % 2049u) * 0.125f;
}

Bool verifyCase(
	Int caseIndex,
	DistanceCalculationType dc,
	const Coord3D& posA,
	Real circleRadiusA,
	Real sphereRadiusA,
	Real zDeltaA,
	const Coord3D& posB,
	Real circleRadiusB,
	Real sphereRadiusB,
	Real zDeltaB,
	Real maxDistSqr)
{
	Real referenceDist = 0.0f;
	Coord3D referenceVec = { 0.0f, 0.0f, 0.0f };
	const Bool referenceWithin = referenceDistance(
		dc, posA, circleRadiusA, sphereRadiusA, zDeltaA,
		posB, circleRadiusB, sphereRadiusB, zDeltaB,
		referenceDist, referenceVec, maxDistSqr);

	Real vectorDist = -1.0f;
	Coord3D vector = { -1.0f, -1.0f, -1.0f };
	const Bool vectorWithin = cnc_partition_distance_test_calculate(
		dc, &posA, circleRadiusA, sphereRadiusA, zDeltaA,
		&posB, circleRadiusB, sphereRadiusB, zDeltaB,
		&vectorDist, &vector, maxDistSqr);

	Real distanceOnly = -1.0f;
	const Bool distanceOnlyWithin = cnc_partition_distance_test_calculate(
		dc, &posA, circleRadiusA, sphereRadiusA, zDeltaA,
		&posB, circleRadiusB, sphereRadiusB, zDeltaB,
		&distanceOnly, NULL, maxDistSqr);

	const Bool matches =
		referenceWithin == vectorWithin &&
		referenceWithin == distanceOnlyWithin &&
		sameBits(referenceDist, vectorDist) &&
		sameBits(referenceDist, distanceOnly) &&
		sameBits(referenceVec.x, vector.x) &&
		sameBits(referenceVec.y, vector.y) &&
		sameBits(referenceVec.z, vector.z);
	if (!matches)
	{
		std::fprintf(stderr,
			"case=%d mode=%d max=%08x reference=(%08x,%08x,%08x,%08x,%d) "
			"vector=(%08x,%08x,%08x,%08x,%d) distanceOnly=(%08x,%d)\n",
			caseIndex, static_cast<Int>(dc), floatBits(maxDistSqr),
			floatBits(referenceDist), floatBits(referenceVec.x), floatBits(referenceVec.y),
			floatBits(referenceVec.z), referenceWithin,
			floatBits(vectorDist), floatBits(vector.x), floatBits(vector.y), floatBits(vector.z),
			vectorWithin, floatBits(distanceOnly), distanceOnlyWithin);
	}
	return matches;
}

} // namespace

int main()
{
	UnsignedInt state = 0x2605eedu;
	Int checked = 0;
	const Int randomCases = 50000;

	for (Int caseIndex = 0; caseIndex < randomCases; ++caseIndex)
	{
		Coord3D posA = { randomPosition(state), randomPosition(state), randomPosition(state) };
		Coord3D posB = { randomPosition(state), randomPosition(state), randomPosition(state) };
		Real circleRadiusA = randomRadius(state);
		Real circleRadiusB = randomRadius(state);
		Real sphereRadiusA = randomRadius(state);
		Real sphereRadiusB = randomRadius(state);
		Real zDeltaA = randomRadius(state);
		Real zDeltaB = randomRadius(state);

		if ((caseIndex % 17) == 0)
			posB = posA;
		if ((caseIndex % 19) == 0)
			circleRadiusA = circleRadiusB = sphereRadiusA = sphereRadiusB = 0.0f;
		if ((caseIndex % 23) == 0)
		{
			posA = { 0.0f, 0.0f, 0.0f };
			posB = { 3.0f, 4.0f, 12.0f };
			circleRadiusA = 2.0f;
			circleRadiusB = 3.0f;
			sphereRadiusA = 5.0f;
			sphereRadiusB = 8.0f;
			zDeltaA = 2.0f;
			zDeltaB = 2.0f;
		}

		for (Int mode = FROM_CENTER_2D; mode <= FROM_BOUNDINGSPHERE_3D; ++mode)
		{
			const DistanceCalculationType dc = static_cast<DistanceCalculationType>(mode);
			Real referenceDist = 0.0f;
			Coord3D referenceVec = { 0.0f, 0.0f, 0.0f };
			referenceDistance(
				dc, posA, circleRadiusA, sphereRadiusA, zDeltaA,
				posB, circleRadiusB, sphereRadiusB, zDeltaB,
				referenceDist, referenceVec, HUGE_DIST * HUGE_DIST);

			const Real thresholds[] = {
				0.0f,
				referenceDist,
				nextafterf(referenceDist, -INFINITY),
				nextafterf(referenceDist, INFINITY),
				static_cast<Real>(nextRandom(state) % 1000001u) * 0.25f,
			};
			for (UnsignedInt thresholdIndex = 0;
				thresholdIndex < sizeof(thresholds) / sizeof(thresholds[0]);
				++thresholdIndex)
			{
				if (!verifyCase(
					caseIndex, dc, posA, circleRadiusA, sphereRadiusA, zDeltaA,
					posB, circleRadiusB, sphereRadiusB, zDeltaB, thresholds[thresholdIndex]))
					return 1;
				++checked;
			}
		}
	}

	std::printf(
		"{\"ok\":true,\"randomCases\":%d,\"comparisons\":%d,"
		"\"modes\":4,\"thresholdsPerMode\":5}\n",
		randomCases, checked);
	return 0;
}
