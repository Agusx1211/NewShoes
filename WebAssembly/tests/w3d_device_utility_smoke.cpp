#include <cmath>
#include <cstdio>
#include <cstring>
#include <vector>
#include <sys/stat.h>

#include "PreRTS.h"

#include "Common/ArchiveFileSystem.h"
#include "Common/FileSystem.h"
#include "Common/GlobalData.h"
#include "Common/LocalFileSystem.h"
#include "Common/NameKeyGenerator.h"
#include "Win32Device/Common/Win32BIGFileSystem.h"
#include "Win32Device/Common/Win32LocalFileSystem.h"
#include "WWLIB/ffactory.h"
#include "W3DDevice/GameClient/W3DFileSystem.h"
#include "W3DDevice/GameClient/TileData.h"
#include "W3DDevice/GameClient/W3DPoly.h"

SubsystemInterfaceList *TheSubsystemList = nullptr;
GlobalData *TheGlobalData = nullptr;

namespace {
bool near(float actual, float expected, float epsilon = 0.0001f)
{
	return std::fabs(actual - expected) <= epsilon;
}

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::fprintf(stderr, "%s\n", message);
		return false;
	}
	return true;
}

bool expect_w3d_available(FileClass *file, const char *name)
{
	if (!file->Is_Available()) {
		std::fprintf(stderr, "W3D file factory did not find %s\n", name);
		return false;
	}
	return true;
}

void append_be32(std::vector<char> &buffer, UnsignedInt value)
{
	buffer.push_back(static_cast<char>((value >> 24) & 0xff));
	buffer.push_back(static_cast<char>((value >> 16) & 0xff));
	buffer.push_back(static_cast<char>((value >> 8) & 0xff));
	buffer.push_back(static_cast<char>(value & 0xff));
}

std::vector<char> make_smoke_big_archive(const char *archived_path, const char *payload)
{
	const UnsignedInt payload_size = static_cast<UnsignedInt>(std::strlen(payload));
	const UnsignedInt path_bytes = static_cast<UnsignedInt>(std::strlen(archived_path) + 1);
	const UnsignedInt directory_offset = 0x10;
	const UnsignedInt file_offset = directory_offset + 8 + path_bytes;
	const UnsignedInt archive_size = file_offset + payload_size;

	std::vector<char> archive;
	archive.reserve(archive_size);
	archive.insert(archive.end(), { 'B', 'I', 'G', 'F' });
	append_be32(archive, archive_size);
	append_be32(archive, 1);
	append_be32(archive, 0);
	append_be32(archive, file_offset);
	append_be32(archive, payload_size);
	archive.insert(archive.end(), archived_path, archived_path + path_bytes);
	archive.insert(archive.end(), payload, payload + payload_size);
	return archive;
}

class EmptyArchiveFileSystem : public ArchiveFileSystem {
public:
	void init() override {}
	void update() override {}
	void reset() override {}
	void postProcessLoad() override {}

	ArchiveFile *openArchiveFile(const Char *) override { return nullptr; }
	void closeArchiveFile(const Char *) override {}
	void closeAllArchiveFiles() override {}
	void closeAllFiles() override {}
	Bool loadBigFilesFromDirectory(AsciiString, AsciiString, Bool = FALSE) override { return FALSE; }
};

std::vector<UnsignedByte> mip_expected(const UnsignedByte *source, int high_width)
{
	const int low_width = high_width / 2;
	std::vector<UnsignedByte> expected(low_width * low_width * TILE_BYTES_PER_PIXEL);

	for (int y = 0; y < high_width; y += 2) {
		for (int x = 0; x < high_width; x += 2) {
			for (int channel = 0; channel < TILE_BYTES_PER_PIXEL; ++channel) {
				const int high_index = (y * high_width + x) * TILE_BYTES_PER_PIXEL + channel;
				const int low_index = ((y / 2) * low_width + (x / 2)) * TILE_BYTES_PER_PIXEL + channel;
				const int pixel =
					source[high_index] +
					source[high_index + TILE_BYTES_PER_PIXEL] +
					source[high_index + TILE_BYTES_PER_PIXEL * high_width] +
					source[high_index + TILE_BYTES_PER_PIXEL * high_width + TILE_BYTES_PER_PIXEL] +
					2;
				expected[low_index] = static_cast<UnsignedByte>(pixel / 4);
			}
		}
	}

	return expected;
}

bool expect_mip(const UnsignedByte *source, int high_width, const UnsignedByte *actual)
{
	const std::vector<UnsignedByte> expected = mip_expected(source, high_width);
	for (std::size_t index = 0; index < expected.size(); ++index) {
		if (actual[index] != expected[index]) {
			std::fprintf(stderr, "mip mismatch at byte %zu: got %u expected %u\n",
				index, static_cast<unsigned>(actual[index]), static_cast<unsigned>(expected[index]));
			return false;
		}
	}
	return true;
}

bool smoke_tile_data()
{
	TileData *tile = new TileData();
	UnsignedByte *base = tile->getDataPtr();

	if (!expect(TileData::dataLen() == DATA_LEN_BYTES, "TileData length mismatch")) {
		tile->Release_Ref();
		return false;
	}

	for (int y = 0; y < TILE_PIXEL_EXTENT; ++y) {
		for (int x = 0; x < TILE_PIXEL_EXTENT; ++x) {
			for (int channel = 0; channel < TILE_BYTES_PER_PIXEL; ++channel) {
				base[(y * TILE_PIXEL_EXTENT + x) * TILE_BYTES_PER_PIXEL + channel] =
					static_cast<UnsignedByte>((x + y * 2 + channel * 3) & 0xff);
			}
		}
	}

	tile->updateMips();

	const int widths[] = { 64, 32, 16, 8, 4, 2, 1 };
	for (int width : widths) {
		if (!expect(tile->hasRGBDataForWidth(width), "TileData reported a missing valid mip width")) {
			tile->Release_Ref();
			return false;
		}
	}

	if (!expect(!tile->hasRGBDataForWidth(3), "TileData accepted an invalid mip width")) {
		tile->Release_Ref();
		return false;
	}
	if (!expect(tile->getRGBDataForWidth(64) == base, "TileData base pointer mismatch")) {
		tile->Release_Ref();
		return false;
	}
	if (!expect(tile->getRGBDataForWidth(99) == base, "TileData default pointer mismatch")) {
		tile->Release_Ref();
		return false;
	}

	const UnsignedByte *mip32 = tile->getRGBDataForWidth(32);
	const UnsignedByte *mip16 = tile->getRGBDataForWidth(16);
	const UnsignedByte *mip8 = tile->getRGBDataForWidth(8);
	const UnsignedByte *mip4 = tile->getRGBDataForWidth(4);
	const UnsignedByte *mip2 = tile->getRGBDataForWidth(2);
	const UnsignedByte *mip1 = tile->getRGBDataForWidth(1);

	const bool ok =
		expect_mip(base, 64, mip32) &&
		expect_mip(mip32, 32, mip16) &&
		expect_mip(mip16, 16, mip8) &&
		expect_mip(mip8, 8, mip4) &&
		expect_mip(mip4, 4, mip2) &&
		expect_mip(mip2, 2, mip1);

	tile->Release_Ref();
	return ok;
}

bool smoke_w3d_poly()
{
	ClipPolyClass source;
	source.Add_Vertex(Vector3(-1.0f, -1.0f, 0.0f));
	source.Add_Vertex(Vector3(1.0f, -1.0f, 0.0f));
	source.Add_Vertex(Vector3(1.0f, 1.0f, 0.0f));
	source.Add_Vertex(Vector3(-1.0f, 1.0f, 0.0f));

	ClipPolyClass clipped;
	source.Clip(PlaneClass(Vector3(1.0f, 0.0f, 0.0f), 0.0f), clipped);

	if (!expect(clipped.Verts.Count() == 4, "clipped polygon vertex count mismatch")) {
		return false;
	}

	bool saw_left_edge = false;
	bool saw_clip_edge = false;
	for (int index = 0; index < clipped.Verts.Count(); ++index) {
		const Vector3 &vertex = clipped.Verts[index];
		if (!expect(vertex.X <= 0.0001f, "clipped polygon kept an outside vertex")) {
			return false;
		}
		saw_left_edge = saw_left_edge || near(vertex.X, -1.0f);
		saw_clip_edge = saw_clip_edge || near(vertex.X, 0.0f);
	}

	return expect(saw_left_edge, "clipped polygon lost the original inside edge") &&
		expect(saw_clip_edge, "clipped polygon did not create a plane intersection edge");
}

bool write_binary_file(const char *path, const void *payload, std::size_t payload_size)
{
	std::vector<char> directory;
	for (const char *cursor = path; *cursor != '\0'; ++cursor) {
		directory.push_back(*cursor);
		if (*cursor == '/' || *cursor == '\\') {
			const char saved = directory.back();
			directory.back() = '\0';
			mkdir(directory.data(), 0777);
			directory.back() = saved;
		}
	}

	std::FILE *file = std::fopen(path, "wb");
	if (file == nullptr) {
		std::fprintf(stderr, "failed to create local W3D fixture %s\n", path);
		return false;
	}
	const bool wrote = std::fwrite(payload, 1, payload_size, file) == payload_size;
	std::fclose(file);
	return expect(wrote, "failed to write local W3D fixture payload");
}

bool write_local_file(const char *path, const char *payload)
{
	return write_binary_file(path, payload, std::strlen(payload));
}

bool expect_w3d_file(FileFactoryClass *factory, const char *name, const char *expected_payload)
{
	FileClass *file = factory->Get_File(name);
	if (!expect(file != nullptr, "W3D file factory returned no file")) {
		return false;
	}

	const bool opened =
		expect(std::strcmp(file->File_Name(), name) == 0, "W3D file name was not preserved") &&
		expect_w3d_available(file, name) &&
		expect(file->Open(FileClass::READ) != 0, "W3D file factory failed to open expected file");

	if (!opened) {
		factory->Return_File(file);
		return false;
	}

	const int expected_size = static_cast<int>(std::strlen(expected_payload));
	std::vector<char> buffer(static_cast<std::size_t>(expected_size) + 1U, '\0');
	const int bytes_read = file->Read(buffer.data(), expected_size);
	const bool ok =
		expect(file->Size() == expected_size, "W3D file factory size mismatch") &&
		expect(bytes_read == expected_size, "W3D file factory read byte count mismatch") &&
		expect(std::memcmp(buffer.data(), expected_payload, static_cast<std::size_t>(expected_size)) == 0,
			"W3D file factory payload mismatch") &&
		expect(file->Seek(0, SEEK_SET) == 0, "W3D file factory seek-to-start failed") &&
		expect(file->Read(buffer.data(), 1) == 1, "W3D file factory second read failed") &&
		expect(buffer[0] == expected_payload[0], "W3D file factory second read payload mismatch");

	file->Close();
	factory->Return_File(file);
	return ok;
}

bool expect_w3d_missing(FileFactoryClass *factory, const char *name)
{
	FileClass *file = factory->Get_File(name);
	if (!expect(file != nullptr, "W3D file factory returned no missing-file object")) {
		return false;
	}

	const bool ok =
		expect(!file->Is_Available(), "W3D file factory reported a missing file as available") &&
		expect(file->Open(FileClass::READ) == 0, "W3D file factory opened a missing file");
	factory->Return_File(file);
	return ok;
}

bool smoke_w3d_file_system()
{
	if (!write_local_file("Data/english/Art/W3D/Localized Model.w3d", "localized-w3d") ||
		!write_local_file("Data/english/Art/Textures/LocalizedTexture.tga", "localized-tga") ||
		!write_local_file("Art/W3D/SharedModel.w3d", "shared-w3d") ||
		!write_local_file("Art/Textures/SharedTexture.dds", "shared-dds") ||
		!write_local_file("Loose/Config.dat", "loose-data") ||
		!write_local_file("UserData/W3D/UserModel.w3d", "user-w3d") ||
		!write_local_file("UserData/Textures/UserTexture.tga", "user-tga") ||
		!write_local_file("UserData/MapPreviews/Preview.tga", "preview-tga")) {
		return false;
	}

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	GlobalData *old_global_data = TheGlobalData;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	FileFactoryClass *old_file_factory = _TheFileFactory;

	Win32LocalFileSystem local_file_system;
	EmptyArchiveFileSystem archive_file_system;
	FileSystem file_system;
	GlobalData global_data;
	NameKeyGenerator name_key_generator;
	global_data.setPath_UserData(AsciiString("UserData/"));

	TheLocalFileSystem = &local_file_system;
	TheArchiveFileSystem = &archive_file_system;
	TheFileSystem = &file_system;
	TheGlobalData = &global_data;
	TheNameKeyGenerator = &name_key_generator;
	name_key_generator.init();

	bool lookup_ok = false;
	{
		W3DFileSystem w3d_file_system;
		FileFactoryClass *factory = _TheFileFactory;
		const bool factory_ok = expect(factory == &w3d_file_system,
			"W3DFileSystem did not install itself as the active WW3D file factory");

		lookup_ok =
			factory_ok &&
			expect_w3d_file(factory, "Localized Model.w3d", "localized-w3d") &&
			expect_w3d_file(factory, "LocalizedTexture.tga", "localized-tga") &&
			expect_w3d_file(factory, "SharedModel.w3d", "shared-w3d") &&
			expect_w3d_file(factory, "SharedTexture.dds", "shared-dds") &&
			expect_w3d_file(factory, "Loose/Config.dat", "loose-data") &&
			expect_w3d_file(factory, "UserModel.w3d", "user-w3d") &&
			expect_w3d_file(factory, "UserTexture.tga", "user-tga") &&
			expect_w3d_file(factory, "Preview.tga", "preview-tga") &&
			expect_w3d_missing(factory, "MissingAsset.w3d");
	}

	_TheFileFactory = old_file_factory;
	name_key_generator.reset();
	TheNameKeyGenerator = old_name_key_generator;
	TheGlobalData = old_global_data;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	return lookup_ok;
}

bool smoke_w3d_file_system_archive()
{
	const char archive_directory_path[] = "w3d-archive-smoke";
	const char archive_directory[] = "w3d-archive-smoke/";
	const char archive_filename[] = "w3d-archive-smoke/SmokeTextures.big";
	const char archived_path[] = "Art\\Textures\\ArchiveTexture.dds";
	const char archive_payload[] = "archive-dds";
	const std::vector<char> archive =
		make_smoke_big_archive(archived_path, archive_payload);

	if (!write_binary_file(archive_filename, archive.data(), archive.size())) {
		return false;
	}

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	GlobalData *old_global_data = TheGlobalData;
	FileFactoryClass *old_file_factory = _TheFileFactory;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	GlobalData global_data;
	NameKeyGenerator name_key_generator;

	TheLocalFileSystem = &local_file_system;
	TheArchiveFileSystem = &archive_file_system;
	TheFileSystem = &file_system;
	TheNameKeyGenerator = &name_key_generator;
	TheGlobalData = &global_data;
	name_key_generator.init();

	bool lookup_ok = false;
	{
		W3DFileSystem w3d_file_system;
		FileFactoryClass *factory = _TheFileFactory;
		const bool archive_loaded = archive_file_system.loadBigFilesFromDirectory(
			AsciiString(archive_directory), AsciiString("*.big"));
		FileClass *file = factory != nullptr ? factory->Get_File("ArchiveTexture.dds") : nullptr;

		lookup_ok =
			expect(factory == &w3d_file_system,
				"archive W3DFileSystem did not install as WW3D file factory") &&
			expect(archive_loaded, "W3D archive smoke BIG did not load") &&
			expect(file != nullptr, "W3D archive file factory returned no file") &&
			expect(file != nullptr && file->Is_Available(),
				"W3D archive file factory did not find archived texture") &&
			expect(file != nullptr && file->Open(FileClass::READ) != 0,
				"W3D archive file factory failed to open archived texture");

		if (lookup_ok) {
			char buffer[sizeof(archive_payload)] = {};
			const int bytes_read = file->Read(buffer, static_cast<int>(std::strlen(archive_payload)));
			lookup_ok =
				expect(file->Size() == static_cast<int>(std::strlen(archive_payload)),
					"W3D archive file factory size mismatch") &&
				expect(bytes_read == static_cast<int>(std::strlen(archive_payload)),
					"W3D archive file factory read count mismatch") &&
				expect(std::memcmp(buffer, archive_payload, std::strlen(archive_payload)) == 0,
					"W3D archive file factory payload mismatch");
		}

		if (file != nullptr) {
			file->Close();
			factory->Return_File(file);
		}
	}

	_TheFileFactory = old_file_factory;
	name_key_generator.reset();
	TheNameKeyGenerator = old_name_key_generator;
	TheGlobalData = old_global_data;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	std::remove(archive_filename);
	std::remove(archive_directory_path);
	return lookup_ok;
}
}

int main()
{
	initMemoryManager();

	if (!smoke_tile_data()) {
		return 1;
	}
	if (!smoke_w3d_poly()) {
		return 1;
	}
	if (!smoke_w3d_file_system()) {
		return 1;
	}
	if (!smoke_w3d_file_system_archive()) {
		return 1;
	}

	std::printf("{\"ok\":true,\"smoke\":\"w3d-device-utility\"}\n");
	return 0;
}
