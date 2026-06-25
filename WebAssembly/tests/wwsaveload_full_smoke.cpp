#include <cstring>
#include <iostream>
#include <string>

#include "chunkio.h"
#include "definition.h"
#include "definitionfactory.h"
#include "definitionfactorymgr.h"
#include "definitionmgr.h"
#include "parameter.h"
#include "persistfactory.h"
#include "rawfile.h"
#include "saveload.h"
#include "saveloadids.h"
#include "simpleparameter.h"
#include "wwsaveload.h"
#include "wwstring.h"

namespace {
constexpr uint32 kTestClassId = CLASSID_GAME_OBJECTS + 0x41;
constexpr int kTestChunkId = CHUNKID_COMMANDO_BEGIN + 0x41;

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}

class TestDefinition : public DefinitionClass
{
public:
	uint32 Get_Class_ID() const override { return kTestClassId; }
	PersistClass *Create() const override { return W3DNEW TestDefinition; }
	const PersistFactoryClass &Get_Factory() const override;
};

SimplePersistFactoryClass<TestDefinition, kTestChunkId> TestDefinitionPersistFactory;

const PersistFactoryClass &TestDefinition::Get_Factory() const
{
	return TestDefinitionPersistFactory;
}

class TestDefinitionFactory : public DefinitionFactoryClass
{
public:
	DefinitionClass *Create() const override { return W3DNEW TestDefinition; }
	const char *Get_Name() const override { return "WasmSmokeDefinition"; }
	uint32 Get_Class_ID() const override { return kTestClassId; }
	bool Is_Displayed() const override { return true; }
};

bool exercise_parameters()
{
	int scalar = 7;
	ParameterClass *scalar_parameter =
		ParameterClass::Construct(ParameterClass::TYPE_INT, &scalar, "Scalar");
	if (!expect(scalar_parameter != nullptr, "TYPE_INT parameter construct failed")) {
		return false;
	}
	auto *int_parameter = static_cast<IntParameterClass *>(scalar_parameter);
	int_parameter->Set_Value(11);
	const bool scalar_ok =
		scalar == 11 &&
		scalar_parameter->Get_Type() == ParameterClass::TYPE_INT &&
		std::strcmp(scalar_parameter->Get_Name(), "Scalar") == 0 &&
		scalar_parameter->Is_Modifed();
	delete scalar_parameter;
	if (!expect(scalar_ok, "TYPE_INT parameter mutation failed")) {
		return false;
	}

	StringClass label("before");
	ParameterClass *string_parameter =
		ParameterClass::Construct(ParameterClass::TYPE_STRING, &label, "Label");
	if (!expect(string_parameter != nullptr, "TYPE_STRING parameter construct failed")) {
		return false;
	}
	auto *label_parameter = static_cast<StringParameterClass *>(string_parameter);
	label_parameter->Set_String("after");
	const bool label_ok =
		label.Compare("after") == 0 &&
		string_parameter->Get_Type() == ParameterClass::TYPE_STRING &&
		std::strcmp(string_parameter->Get_Name(), "Label") == 0;
	delete string_parameter;
	return expect(label_ok, "TYPE_STRING parameter mutation failed");
}

bool exercise_definitions()
{
	WWSaveLoad::Init();

	TestDefinitionFactory definition_factory;
	if (!expect(DefinitionFactoryMgrClass::Find_Factory(kTestClassId) == &definition_factory,
			"DefinitionFactoryMgrClass lookup by class id failed")) {
		return false;
	}
	if (!expect(DefinitionFactoryMgrClass::Find_Factory("WasmSmokeDefinition") == &definition_factory,
			"DefinitionFactoryMgrClass lookup by name failed")) {
		return false;
	}

	DefinitionClass *created = definition_factory.Create();
	if (!expect(created != nullptr && created->Get_Class_ID() == kTestClassId,
			"DefinitionFactoryClass virtual create failed")) {
		delete created;
		return false;
	}
	delete created;

	auto *definition = W3DNEW TestDefinition;
	const uint32 definition_id = DefinitionMgrClass::Get_New_ID(kTestClassId);
	definition->Set_ID(definition_id);
	definition->Set_Name("WasmFullSmokeDefinition");
	DefinitionMgrClass::Register_Definition(definition);

	if (!expect(DefinitionMgrClass::Find_Definition(definition_id, false) == definition,
			"DefinitionMgrClass direct lookup failed")) {
		return false;
	}
	if (!expect(DefinitionMgrClass::Find_Typed_Definition(
			"wasmfullsmokedefinition", kTestClassId, false) == definition,
			"DefinitionMgrClass typed lookup failed")) {
		return false;
	}

	const char path[] = "wwsaveload_full_smoke.tmp";
	{
		RawFileClass file(path);
		file.Delete();
		if (!expect(file.Open(FileClass::WRITE), "WWSaveLoad output open failed")) {
			return false;
		}
		ChunkSaveClass save(&file);
		if (!expect(SaveLoadSystemClass::Save(save, _TheDefinitionMgr),
				"DefinitionMgrClass save failed")) {
			file.Close();
			return false;
		}
		file.Close();
	}

	DefinitionMgrClass::Free_Definitions();
	if (!expect(DefinitionMgrClass::Find_Definition(definition_id, false) == nullptr,
			"DefinitionMgrClass free failed")) {
		return false;
	}

	{
		RawFileClass file(path);
		if (!expect(file.Open(FileClass::READ), "WWSaveLoad input open failed")) {
			return false;
		}
		ChunkLoadClass load(&file);
		if (!expect(SaveLoadSystemClass::Load(load), "DefinitionMgrClass load failed")) {
			file.Close();
			return false;
		}
		file.Close();
		if (!expect(file.Delete(), "WWSaveLoad temp delete failed")) {
			return false;
		}
	}

	DefinitionClass *loaded = DefinitionMgrClass::Find_Definition(definition_id, false);
	if (!expect(loaded != nullptr, "DefinitionMgrClass round-trip lookup failed")) {
		return false;
	}
	if (!expect(loaded->Get_Class_ID() == kTestClassId &&
			std::strcmp(loaded->Get_Name(), "WasmFullSmokeDefinition") == 0,
			"DefinitionClass round-trip state mismatch")) {
		return false;
	}

	WWSaveLoad::Shutdown();
	return true;
}
}

int main()
{
	if (!expect(SaveLoadSystemClass::Find_Persist_Factory(kTestChunkId) ==
			&TestDefinitionPersistFactory, "SimplePersistFactoryClass registration failed")) {
		return 1;
	}
	if (!exercise_parameters()) {
		return 1;
	}
	if (!exercise_definitions()) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"WWSaveLoad\","
		"\"compiled\":\"definitions, factories, parameters, twiddler, save/load round trip\","
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
