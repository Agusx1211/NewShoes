#include <cstddef>
#include <cstdio>
#include <cstring>
#include <new>

#include "PreRTS.h"

#include "Common/INI.h"
#include "Common/ObjectStatusTypes.h"
#include "GameLogic/WeaponSetType.h"
#include "GameLogic/Module/StealthUpdate.h"

int main()
{
	alignas(StealthUpdateModuleData) unsigned char storage[sizeof(StealthUpdateModuleData)];
	std::memset(storage, 1, sizeof(storage));
	StealthUpdateModuleData *data = new (storage) StealthUpdateModuleData;

	const Bool disabled = FALSE;
	const Bool defaultsToContainerRules =
		std::memcmp(
			storage + offsetof(StealthUpdateModuleData, m_useRiderStealth),
			&disabled,
			sizeof(disabled)) == 0;

	MultiIniFieldParse fields;
	StealthUpdateModuleData::buildFieldParse(fields);
	Bool explicitOverrideMapped = FALSE;
	for (Int tableIndex = 0; tableIndex < fields.getCount(); ++tableIndex)
	{
		const FieldParse *field = fields.getNthFieldParse(tableIndex);
		for (; field != NULL && field->token != NULL; ++field)
		{
			if (std::strcmp(field->token, "UseRiderStealth") == 0)
			{
				explicitOverrideMapped =
					field->parse == INI::parseBool &&
					field->offset == static_cast<Int>(offsetof(StealthUpdateModuleData, m_useRiderStealth));
			}
		}
	}

	data->~StealthUpdateModuleData();

	std::printf(
		"{\"defaultsToContainerRules\":%s,\"explicitOverrideMapped\":%s}\n",
		defaultsToContainerRules ? "true" : "false",
		explicitOverrideMapped ? "true" : "false");
	return defaultsToContainerRules && explicitOverrideMapped ? 0 : 1;
}
