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
#include "ramfile.h"
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

bool expectLittleEndian32(const unsigned char *bytes, uint32 value, const char *message)
{
	return expect(bytes[0] == static_cast<unsigned char>(value & 0xff) &&
			bytes[1] == static_cast<unsigned char>((value >> 8) & 0xff) &&
			bytes[2] == static_cast<unsigned char>((value >> 16) & 0xff) &&
			bytes[3] == static_cast<unsigned char>((value >> 24) & 0xff),
		message);
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

bool exercise_chunk_wire_format()
{
	const uint32 parent_id = 0x11223344;
	const uint32 child_id = 0x55667788;
	const uint32 scalar = 0x0a0b0c0d;
	const uint32 micro_parent_id = 0x99aabbcc;
	const uint32 micro_value = 0x01020304;

	unsigned char buffer[64] = {};
	RAMFileClass file(buffer, sizeof(buffer));
	if (!expect(file.Open(FileClass::WRITE), "Chunk RAM file open failed")) {
		return false;
	}

	ChunkSaveClass save(&file);
	if (!expect(save.Begin_Chunk(parent_id), "Chunk parent begin failed") ||
		!expect(save.Begin_Chunk(child_id), "Chunk child begin failed") ||
		!expect(save.Write(&scalar, sizeof(scalar)) == sizeof(scalar), "Chunk scalar write failed") ||
		!expect(save.End_Chunk(), "Chunk child end failed") ||
		!expect(save.End_Chunk(), "Chunk parent end failed") ||
		!expect(save.Begin_Chunk(micro_parent_id), "Micro-chunk parent begin failed") ||
		!expect(save.Begin_Micro_Chunk(0x42), "Micro-chunk begin failed") ||
		!expect(save.Write(&micro_value, sizeof(micro_value)) == sizeof(micro_value),
			"Micro-chunk value write failed") ||
		!expect(save.End_Micro_Chunk(), "Micro-chunk end failed") ||
		!expect(save.End_Chunk(), "Micro-chunk parent end failed")) {
		return false;
	}

	if (!expect(file.Size() == 34, "Chunk wire length changed") ||
		!expectLittleEndian32(buffer, parent_id, "Chunk parent id byte order changed") ||
		!expectLittleEndian32(buffer + 4, 0x8000000c, "Chunk parent size/subchunk flag changed") ||
		!expectLittleEndian32(buffer + 8, child_id, "Chunk child id byte order changed") ||
		!expectLittleEndian32(buffer + 12, 4, "Chunk child size byte order changed") ||
		!expectLittleEndian32(buffer + 16, scalar, "Chunk scalar byte order changed") ||
		!expectLittleEndian32(buffer + 20, micro_parent_id, "Micro-chunk parent id byte order changed") ||
		!expectLittleEndian32(buffer + 24, 6, "Micro-chunk parent size byte order changed") ||
		!expect(buffer[28] == 0x42 && buffer[29] == 4, "Micro-chunk header bytes changed") ||
		!expectLittleEndian32(buffer + 30, micro_value, "Micro-chunk payload byte order changed")) {
		return false;
	}

	file.Close();
	if (!expect(file.Open(FileClass::READ), "Chunk RAM file reopen failed")) {
		return false;
	}
	ChunkLoadClass load(&file);
	uint32 loaded_scalar = 0;
	uint32 loaded_micro_value = 0;

	return expect(load.Open_Chunk(), "Chunk parent open failed") &&
		expect(load.Cur_Chunk_ID() == parent_id, "Chunk parent id parse failed") &&
		expect(load.Contains_Chunks() != 0, "Chunk parent subchunk flag parse failed") &&
		expect(load.Cur_Chunk_Length() == 12, "Chunk parent length parse failed") &&
		expect(load.Open_Chunk(), "Chunk child open failed") &&
		expect(load.Cur_Chunk_ID() == child_id, "Chunk child id parse failed") &&
		expect(load.Contains_Chunks() == 0, "Chunk child subchunk flag parse failed") &&
		expect(load.Cur_Chunk_Length() == sizeof(scalar), "Chunk child length parse failed") &&
		expect(load.Read(&loaded_scalar, sizeof(loaded_scalar)) == sizeof(loaded_scalar),
			"Chunk scalar read failed") &&
		expect(loaded_scalar == scalar, "Chunk scalar value parse failed") &&
		expect(load.Close_Chunk(), "Chunk child close failed") &&
		expect(load.Close_Chunk(), "Chunk parent close failed") &&
		expect(load.Open_Chunk(), "Micro-chunk parent open failed") &&
		expect(load.Cur_Chunk_ID() == micro_parent_id, "Micro-chunk parent id parse failed") &&
		expect(load.Cur_Chunk_Length() == 6, "Micro-chunk parent length parse failed") &&
		expect(load.Open_Micro_Chunk(), "Micro-chunk open failed") &&
		expect(load.Cur_Micro_Chunk_ID() == 0x42, "Micro-chunk id parse failed") &&
		expect(load.Cur_Micro_Chunk_Length() == sizeof(micro_value), "Micro-chunk length parse failed") &&
		expect(load.Read(&loaded_micro_value, sizeof(loaded_micro_value)) == sizeof(loaded_micro_value),
			"Micro-chunk payload read failed") &&
		expect(loaded_micro_value == micro_value, "Micro-chunk payload parse failed") &&
		expect(load.Close_Micro_Chunk(), "Micro-chunk close failed") &&
		expect(load.Close_Chunk(), "Micro-chunk parent close failed") &&
		expect(!load.Open_Chunk(), "Chunk reader found unexpected trailing chunk");
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
	if (!exercise_chunk_wire_format()) {
		return 1;
	}
	if (!exercise_definitions()) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"WWSaveLoad\","
		"\"compiled\":\"definitions, factories, parameters, twiddler, chunk byte order, save/load round trip\","
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
