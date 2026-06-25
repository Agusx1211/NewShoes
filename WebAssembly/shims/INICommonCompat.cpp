#include "PreRTS.h"

#include "Common/INI.h"

ScienceType INI::scanScience(const char *token)
{
	if (token == nullptr || TheNameKeyGenerator == nullptr) {
		throw INI_INVALID_DATA;
	}
	return static_cast<ScienceType>(TheNameKeyGenerator->nameToKey(token));
}

void INI::parseScience(INI *ini, void *, void *store, const void *)
{
	if (store != nullptr) {
		*static_cast<ScienceType *>(store) = scanScience(ini != nullptr ? ini->getNextToken() : nullptr);
	}
}
