#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include "PreRTS.h"

#include "Compression.h"
#include "Common/AudioRequest.h"
#include "Common/AsciiString.h"
#include "Common/ArchiveFileSystem.h"
#include "Common/BezierSegment.h"
#include "Common/CDManager.h"
#include "Common/CRC.h"
#include "Common/DataChunk.h"
#include "Common/Dict.h"
#include "Common/DisabledTypes.h"
#include "Common/DiscreteCircle.h"
#include "Common/File.h"
#include "Common/FileSystem.h"
#include "Common/GameCommon.h"
#include "Common/Geometry.h"
#include "Common/GlobalData.h"
#include "Common/GameMemory.h"
#include "Common/GameType.h"
#include "Common/INI.h"
#include "Common/KindOf.h"
#include "Common/Language.h"
#include "Common/List.h"
#include "Common/LocalFileSystem.h"
#include "Common/ModelState.h"
#include "Common/MultiplayerSettings.h"
#include "Common/NameKeyGenerator.h"
#include "Common/ObjectStatusTypes.h"
#include "Common/PartitionSolver.h"
#include "Common/QuickTrig.h"
#include "Common/QuotedPrintable.h"
#include "Common/RAMFile.h"
#include "Common/RandomValue.h"
#include "Common/Registry.h"
#include "Common/Science.h"
#include "Common/string.h"
#include "Common/SubsystemInterface.h"
#include "Common/TerrainTypes.h"
#include "Common/UnicodeString.h"
#include "Common/Version.h"
#include "Common/encrypt.h"
#include "GameClient/ClientRandomValue.h"
#include "GameClient/GameText.h"
#include "GameLogic/ArmorSet.h"
#include "GameLogic/GameLogic.h"
#include "GameLogic/LogicRandomValue.h"
#include "GameNetwork/GameInfo.h"
#include "Lib/Trig.h"
#include "Win32Device/Common/Win32BIGFileSystem.h"
#include "Win32Device/Common/Win32LocalFileSystem.h"

SubsystemInterfaceList *TheSubsystemList = nullptr;
GameLogic *TheGameLogic = nullptr;
GlobalData *TheGlobalData = nullptr;
GameTextInterface *TheGameText = nullptr;

namespace {
template<typename T>
void append_value(std::vector<char> &buffer, const T &value)
{
	const auto *bytes = reinterpret_cast<const char *>(&value);
	buffer.insert(buffer.end(), bytes, bytes + sizeof(T));
}

void append_be32(std::vector<char> &buffer, UnsignedInt value)
{
	buffer.push_back(static_cast<char>((value >> 24) & 0xff));
	buffer.push_back(static_cast<char>((value >> 16) & 0xff));
	buffer.push_back(static_cast<char>((value >> 8) & 0xff));
	buffer.push_back(static_cast<char>(value & 0xff));
}

class SmokeCDManager : public CDManager
{
protected:
	CDDriveInterface* createDrive(void) override { return NEW CDDrive; }
};

class SmokeGameText : public GameTextInterface
{
public:
	void init() override {}
	void reset() override {}
	void update() override {}

	UnicodeString fetch(const Char *label, Bool *exists = nullptr) override
	{
		return fetch(AsciiString(label), exists);
	}

	UnicodeString fetch(AsciiString label, Bool *exists = nullptr) override
	{
		if (exists != nullptr) {
			*exists = TRUE;
		}
		if (std::strcmp(label.str(), "Version:Format2") == 0) {
			return UnicodeString(L"Version %d.%d");
		}
		if (std::strcmp(label.str(), "Version:Format3") == 0) {
			return UnicodeString(L"Version %d.%d.%d");
		}
		if (std::strcmp(label.str(), "Version:Format4") == 0) {
			return UnicodeString(L"Version %d.%d.%d.%d%c%c");
		}
		if (std::strcmp(label.str(), "Version:BuildTime") == 0) {
			return UnicodeString(L"Built %ls %ls");
		}
		if (std::strcmp(label.str(), "Version:BuildMachine") == 0) {
			return UnicodeString(L"Machine %ls");
		}
		if (std::strcmp(label.str(), "Version:BuildUser") == 0) {
			return UnicodeString(L"User %ls");
		}

		if (exists != nullptr) {
			*exists = FALSE;
		}
		return UnicodeString::TheEmptyString;
	}

	AsciiStringVec& getStringsWithLabelPrefix(AsciiString) override { return m_empty; }
	void initMapStringFile(const AsciiString&) override {}

private:
	AsciiStringVec m_empty;
};

class SmokeOutputStream : public OutputStream
{
public:
	Int write(const void *pData, Int numBytes) override
	{
		if (pData == nullptr || numBytes <= 0) {
			return 0;
		}
		const auto *source = static_cast<const char *>(pData);
		m_data.insert(m_data.end(), source, source + numBytes);
		return numBytes;
	}

	const std::vector<char> &data() const { return m_data; }

private:
	std::vector<char> m_data;
};

class SmokeChunkInputStream : public ChunkInputStream
{
public:
	explicit SmokeChunkInputStream(const std::vector<char> &data) : m_data(data), m_position(0) {}

	Int read(void *pData, Int numBytes) override
	{
		if (pData == nullptr || numBytes <= 0 || eof()) {
			return 0;
		}
		const UnsignedInt remaining = static_cast<UnsignedInt>(m_data.size()) - m_position;
		const UnsignedInt bytes_to_read = static_cast<UnsignedInt>(numBytes) < remaining ?
			static_cast<UnsignedInt>(numBytes) : remaining;
		std::memcpy(pData, m_data.data() + m_position, bytes_to_read);
		m_position += bytes_to_read;
		return static_cast<Int>(bytes_to_read);
	}

	UnsignedInt tell(void) override { return m_position; }

	Bool absoluteSeek(UnsignedInt pos) override
	{
		const UnsignedInt size = static_cast<UnsignedInt>(m_data.size());
		m_position = pos > size ? size : pos;
		return TRUE;
	}

	Bool eof(void) override { return m_position >= m_data.size(); }

private:
	const std::vector<char> &m_data;
	UnsignedInt m_position;
};

class SmokeFile : public File
{
public:
	SmokeFile() : m_position(0) {}

	void setData(const void *buffer, Int bytes)
	{
		if (buffer == nullptr || bytes <= 0) {
			m_data.clear();
			m_position = 0;
			return;
		}
		const auto *source = static_cast<const char *>(buffer);
		m_data.assign(source, source + bytes);
		m_position = 0;
	}

	Int read(void *buffer, Int bytes) override
	{
		if (buffer == nullptr || bytes <= 0) {
			return 0;
		}
		const Int remaining = static_cast<Int>(m_data.size()) - m_position;
		const Int bytes_to_read = remaining <= 0 ? 0 : (bytes < remaining ? bytes : remaining);
		if (bytes_to_read > 0) {
			std::memcpy(buffer, m_data.data() + m_position, static_cast<std::size_t>(bytes_to_read));
			m_position += bytes_to_read;
		}
		return bytes_to_read;
	}

	Int write(const void *buffer, Int bytes) override
	{
		if (buffer == nullptr || bytes <= 0) {
			return 0;
		}
		const auto *source = static_cast<const char *>(buffer);
		const Int required_size = m_position + bytes;
		if (required_size > static_cast<Int>(m_data.size())) {
			m_data.resize(static_cast<std::size_t>(required_size));
		}
		std::memcpy(m_data.data() + m_position, source, static_cast<std::size_t>(bytes));
		m_position += bytes;
		return bytes;
	}

	Int seek(Int bytes, seekMode mode = CURRENT) override
	{
		Int base = 0;
		if (mode == CURRENT) {
			base = m_position;
		} else if (mode == END) {
			base = static_cast<Int>(m_data.size());
		}

		const Int limit = static_cast<Int>(m_data.size());
		const Int next = base + bytes;
		m_position = next < 0 ? 0 : (next > limit ? limit : next);
		return m_position;
	}

	void nextLine(Char *buf = nullptr, Int bufSize = 0) override
	{
		if (buf != nullptr && bufSize > 0) {
			buf[0] = 0;
		}
	}

	Bool scanInt(Int &) override { return FALSE; }
	Bool scanReal(Real &) override { return FALSE; }
	Bool scanString(AsciiString &) override { return FALSE; }

	char* readEntireAndClose() override
	{
		char *buffer = NEW char[m_data.size() + 1];
		if (buffer != nullptr) {
			std::memcpy(buffer, m_data.data(), m_data.size());
			buffer[m_data.size()] = 0;
		}
		close();
		return buffer;
	}

	File* convertToRAMFile() override { return this; }

private:
	std::vector<char> m_data;
	Int m_position;
};

class SmokeLocalFileSystem : public LocalFileSystem
{
public:
	SmokeLocalFileSystem()
	{
		setPayload("local-smoke.txt", nullptr, 0);
	}

	void setPayload(const Char *filename, const void *data, Int bytes)
	{
		if (filename == nullptr) {
			return;
		}

		std::vector<char> &payload = m_payloads[filename];
		payload.clear();
		if (data == nullptr || bytes <= 0) {
			return;
		}
		const auto *source = static_cast<const char *>(data);
		payload.assign(source, source + bytes);
	}

	void init() override { LocalFileSystem::init(); }
	void reset() override { LocalFileSystem::reset(); }
	void update() override { LocalFileSystem::update(); }
	File *openFile(const Char *filename, Int access = 0) override
	{
		const auto it = m_payloads.find(filename == nullptr ? "" : filename);
		if (it == m_payloads.end()) {
			return nullptr;
		}
		m_file.close();
		if (!m_file.open(filename, access)) {
			return nullptr;
		}
		m_file.setData(it->second.data(), static_cast<Int>(it->second.size()));
		return &m_file;
	}
	Bool doesFileExist(const Char *filename) const override
	{
		return m_payloads.find(filename == nullptr ? "" : filename) != m_payloads.end();
	}
	void getFileListInDirectory(const AsciiString&, const AsciiString&, const AsciiString& searchName,
		FilenameList &filenames, Bool) const override
	{
		AsciiString lower_mask = searchName;
		lower_mask.toLower();
		for (const auto &entry : m_payloads) {
			AsciiString lower_name(entry.first.c_str());
			lower_name.toLower();
			if (std::strcmp(lower_mask.str(), "*") == 0 ||
					(std::strcmp(lower_mask.str(), "*.big") == 0 && lower_name.endsWith(".big"))) {
				filenames.insert(AsciiString(entry.first.c_str()));
			}
		}
	}
	Bool getFileInfo(const AsciiString& filename, FileInfo *fileInfo) const override
	{
		if (fileInfo == nullptr) {
			return FALSE;
		}
		const auto it = m_payloads.find(filename.str());
		if (it == m_payloads.end()) {
			return FALSE;
		}
		fileInfo->sizeHigh = 0;
		fileInfo->sizeLow = static_cast<Int>(it->second.size());
		fileInfo->timestampHigh = 0;
		fileInfo->timestampLow = 0;
		return TRUE;
	}
	Bool createDirectory(AsciiString) override { return FALSE; }

private:
	SmokeFile m_file;
	std::map<std::string, std::vector<char>> m_payloads;
};

struct DataChunkParseResult
{
	Bool called;
	DataChunkVersionType version;
	Int data_size;
	Int integer;
	Real real;
	Byte byte;
	AsciiString text;
	UnicodeString wide_text;
	std::vector<char> bytes;
	NameKeyType name_key;
	Dict dict;
};

struct Scanline
{
	Int x_start;
	Int x_end;
	Int y;
};

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::fprintf(stderr, "%s\n", message);
		return false;
	}
	return true;
}

UnsignedByte byteAt(const std::vector<char> &bytes, std::size_t offset)
{
	return static_cast<UnsignedByte>(bytes[offset]);
}

UnsignedInt littleEndian32At(const std::vector<char> &bytes, std::size_t offset)
{
	return static_cast<UnsignedInt>(byteAt(bytes, offset)) |
		(static_cast<UnsignedInt>(byteAt(bytes, offset + 1)) << 8) |
		(static_cast<UnsignedInt>(byteAt(bytes, offset + 2)) << 16) |
		(static_cast<UnsignedInt>(byteAt(bytes, offset + 3)) << 24);
}

bool expectLittleEndian16(const std::vector<char> &bytes, std::size_t offset, UnsignedShort value,
	const char *message)
{
	return expect(bytes.size() >= offset + 2 &&
			byteAt(bytes, offset) == static_cast<UnsignedByte>(value & 0xff) &&
			byteAt(bytes, offset + 1) == static_cast<UnsignedByte>((value >> 8) & 0xff),
		message);
}

bool expectLittleEndian32(const std::vector<char> &bytes, std::size_t offset, UnsignedInt value,
	const char *message)
{
	return expect(bytes.size() >= offset + 4 &&
			byteAt(bytes, offset) == static_cast<UnsignedByte>(value & 0xff) &&
			byteAt(bytes, offset + 1) == static_cast<UnsignedByte>((value >> 8) & 0xff) &&
			byteAt(bytes, offset + 2) == static_cast<UnsignedByte>((value >> 16) & 0xff) &&
			byteAt(bytes, offset + 3) == static_cast<UnsignedByte>((value >> 24) & 0xff),
		message);
}

const FieldParse kSmokeIniFieldParse[] = {
	{ "Token", INI::parseInt, nullptr, 0 },
	{ nullptr, nullptr, nullptr, 0 },
};

bool g_multi_ini_builder_called = false;

void build_multi_ini_smoke(MultiIniFieldParse &parse)
{
	g_multi_ini_builder_called = true;
	parse.add(kSmokeIniFieldParse, 8);
}

void collect_scanline(Int x_start, Int x_end, Int y, void *context)
{
	auto *lines = static_cast<std::vector<Scanline> *>(context);
	lines->push_back({ x_start, x_end, y });
}

bool near(Real actual, Real expected, Real epsilon = 0.015f)
{
	return std::fabs(actual - expected) <= epsilon;
}

Bool parse_smoke_data_chunk(DataChunkInput &input, DataChunkInfo *info, void *user_data)
{
	auto *result = static_cast<DataChunkParseResult *>(user_data);
	result->called = TRUE;
	result->version = info->version;
	result->data_size = info->dataSize;
	result->integer = input.readInt();
	result->byte = input.readByte();
	result->text = input.readAsciiString();
	return TRUE;
}

Bool parse_smoke_data_chunk_output(DataChunkInput &input, DataChunkInfo *info, void *user_data)
{
	auto *result = static_cast<DataChunkParseResult *>(user_data);
	result->called = TRUE;
	result->version = info->version;
	result->data_size = info->dataSize;
	result->integer = input.readInt();
	result->real = input.readReal();
	result->byte = input.readByte();
	result->text = input.readAsciiString();
	result->wide_text = input.readUnicodeString();

	result->bytes.assign(5, 0);
	input.readArrayOfBytes(result->bytes.data(), static_cast<Int>(result->bytes.size()));

	result->name_key = input.readNameKey();
	result->dict = input.readDict();
	return TRUE;
}

bool expect_data_chunk_output_wire_format(const std::vector<char> &bytes)
{
	const char root_name[] = "SAVE_ROOT";
	const char name_key_name[] = "SaveChunkKey";

	bool ok = expect(bytes.size() > 8, "DataChunkOutput wire payload too short") &&
		expect(bytes[0] == 'C' && bytes[1] == 'k' && bytes[2] == 'M' && bytes[3] == 'p',
			"DataChunkOutput table tag changed") &&
		expectLittleEndian32(bytes, 4, 7, "DataChunkOutput symbol count byte order changed");
	if (!ok) {
		return false;
	}

	std::size_t offset = 8;
	UnsignedInt root_id = 0xffffffffu;
	UnsignedInt name_key_id = 0xffffffffu;
	const UnsignedInt symbol_count = littleEndian32At(bytes, 4);
	for (UnsignedInt i = 0; i < symbol_count; ++i) {
		if (!expect(bytes.size() > offset, "DataChunkOutput symbol length missing")) {
			return false;
		}
		const UnsignedByte name_length = byteAt(bytes, offset++);
		if (!expect(bytes.size() >= offset + name_length + sizeof(UnsignedInt),
				"DataChunkOutput symbol entry truncated")) {
			return false;
		}
		const std::string name(bytes.data() + offset, bytes.data() + offset + name_length);
		offset += name_length;
		const UnsignedInt id = littleEndian32At(bytes, offset);
		offset += sizeof(UnsignedInt);

		if (name == root_name) {
			root_id = id;
		} else if (name == name_key_name) {
			name_key_id = id;
		}
	}

	const std::size_t chunk_offset = offset;
	constexpr std::size_t kChunkHeaderBytes = sizeof(UnsignedInt) + sizeof(DataChunkVersionType) + sizeof(Int);
	if (!expect(bytes.size() >= chunk_offset + kChunkHeaderBytes,
			"DataChunkOutput chunk header truncated")) {
		return false;
	}
	const UnsignedInt expected_data_size = static_cast<UnsignedInt>(bytes.size() - chunk_offset - kChunkHeaderBytes);

	return expect(root_id == 1, "DataChunkOutput root symbol id changed") &&
		expect(name_key_id == 2, "DataChunkOutput NameKey symbol id changed") &&
		expect(bytes.size() >= chunk_offset + kChunkHeaderBytes + 11,
			"DataChunkOutput primitive payload truncated") &&
		expectLittleEndian32(bytes, chunk_offset, root_id, "DataChunkOutput chunk id byte order changed") &&
		expectLittleEndian16(bytes, chunk_offset + 4, 7, "DataChunkOutput chunk version byte order changed") &&
		expectLittleEndian32(bytes, chunk_offset + 6, expected_data_size,
			"DataChunkOutput chunk data-size byte order changed") &&
		expectLittleEndian32(bytes, chunk_offset + 10, 1234,
			"DataChunkOutput integer payload byte order changed") &&
		expectLittleEndian32(bytes, chunk_offset + 14, 0x40d00000u,
			"DataChunkOutput real payload byte order changed") &&
		expect(byteAt(bytes, chunk_offset + 18) == 17, "DataChunkOutput byte payload changed") &&
		expectLittleEndian16(bytes, chunk_offset + 19, 14,
			"DataChunkOutput AsciiString length byte order changed");
}

std::vector<char> make_smoke_big_archive(const Char *archived_path, const Char *payload, Int payload_size)
{
	const UnsignedInt path_bytes = static_cast<UnsignedInt>(std::strlen(archived_path) + 1);
	const UnsignedInt directory_offset = 0x10;
	const UnsignedInt file_offset = directory_offset + 8 + path_bytes;
	const UnsignedInt archive_size = file_offset + static_cast<UnsignedInt>(payload_size);

	std::vector<char> archive;
	archive.reserve(archive_size);
	archive.insert(archive.end(), { 'B', 'I', 'G', 'F' });
	append_be32(archive, archive_size);
	append_be32(archive, 1);
	append_be32(archive, 0);
	append_be32(archive, file_offset);
	append_be32(archive, static_cast<UnsignedInt>(payload_size));
	archive.insert(archive.end(), archived_path, archived_path + path_bytes);
	archive.insert(archive.end(), payload, payload + payload_size);
	return archive;
}

bool exercise_memory_init()
{
	return expect(TheDynamicMemoryAllocator != nullptr, "dynamic memory allocator missing") &&
		expect(TheDynamicMemoryAllocator->getDmaMemoryPoolCount() == 7,
			"original MemoryInit DMA pool table was not linked") &&
		expect(TheDynamicMemoryAllocator->getNthDmaMemoryPool(0)->getAllocationSize() == 16,
			"original MemoryInit first DMA pool size changed");
}

bool exercise_strings()
{
	AsciiString text("  Zero");
	text.concat(" Hour  ");
	text.trim();
	text.toLower();
	if (!expect(std::strcmp(text.str(), "zero hour") == 0, "AsciiString trim/lower/concat failed")) {
		return false;
	}

	AsciiString formatted;
	formatted.format("%s-%d", "GLA", 7);
	if (!expect(std::strcmp(formatted.str(), "GLA-7") == 0, "AsciiString format failed")) {
		return false;
	}

	UnicodeString wide;
	wide.translate(text);
	if (!expect(wide.getLength() == text.getLength() && wide.getCharAt(0) == L'z',
			"UnicodeString translate failed")) {
		return false;
	}

	AsciiString round_trip;
	round_trip.translate(wide);
	if (!expect(std::strcmp(round_trip.str(), text.str()) == 0, "AsciiString translate failed")) {
		return false;
	}

	WSYS_String wsys("zero");
	wsys += " hour";
	wsys.makeUpperCase();
	if (!expect(std::strcmp(wsys.get(), "ZERO HOUR") == 0, "WSYS_String append/upper failed")) {
		return false;
	}

	wsys.format("%s-%d", "GLA", 3);
	wsys.makeLowerCase();
	return expect(std::strcmp(wsys.get(), "gla-3") == 0, "WSYS_String format/lower failed");
}

bool exercise_quoted_printable()
{
	AsciiString ascii("Maps/Zero Hour #1.ini");
	AsciiString encoded_ascii = AsciiStringToQuotedPrintable(ascii);
	if (!expect(std::strcmp(encoded_ascii.str(), "Maps_2FZero_20Hour_20_231_2Eini") == 0,
			"Ascii quoted-printable encode failed")) {
		return false;
	}

	AsciiString decoded_ascii = QuotedPrintableToAsciiString(encoded_ascii);
	if (!expect(std::strcmp(decoded_ascii.str(), ascii.str()) == 0,
			"Ascii quoted-printable decode failed")) {
		return false;
	}

	UnicodeString unicode;
	unicode.translate(AsciiString("A z"));
	AsciiString encoded_unicode = UnicodeStringToQuotedPrintable(unicode);
	if (!expect(std::strcmp(encoded_unicode.str(), "A_00_20_00z_00") == 0,
			"Unicode quoted-printable UTF-16LE encode failed")) {
		return false;
	}

	UnicodeString decoded_unicode = QuotedPrintableToUnicodeString(encoded_unicode);
	if (!expect(decoded_unicode.getLength() == 3 &&
			decoded_unicode.getCharAt(0) == L'A' &&
			decoded_unicode.getCharAt(1) == L' ' &&
			decoded_unicode.getCharAt(2) == L'z',
			"Unicode quoted-printable UTF-16LE decode failed")) {
		return false;
	}

	WideChar accent_buffer[] = { (WideChar)0x00e9, 0 };
	UnicodeString accent(accent_buffer);
	AsciiString encoded_accent = UnicodeStringToQuotedPrintable(accent);
	UnicodeString decoded_accent = QuotedPrintableToUnicodeString(encoded_accent);
	return expect(std::strcmp(encoded_accent.str(), "_E9_00") == 0,
			"Unicode quoted-printable BMP encode failed") &&
		expect(decoded_accent.getLength() == 1 && decoded_accent.getCharAt(0) == (WideChar)0x00e9,
			"Unicode quoted-printable BMP decode failed");
}

bool exercise_language_and_encrypt()
{
	OurLanguage = LANGUAGE_ID_GERMAN;
	if (!expect(OurLanguage == LANGUAGE_ID_GERMAN, "Language global state failed")) {
		return false;
	}
	OurLanguage = LANGUAGE_ID_US;

	return expect(std::strcmp(EncryptString("China007"), "aFqEaEzO") == 0,
			"EncryptString China007 vector failed") &&
		expect(std::strcmp(EncryptString("ZeroHour"), "AchoaoIx") == 0,
			"EncryptString ZeroHour vector failed") &&
		expect(std::strlen(EncryptString("abcdefghi")) == MAX_ENCRYPTED_STRING,
			"EncryptString length clamp failed");
}

bool exercise_ini_multi_field_bridge()
{
	MultiIniFieldParse parse;
	parse.add(kSmokeIniFieldParse, 12);
	if (!expect(parse.getCount() == 1, "MultiIniFieldParse count failed") ||
			!expect(parse.getNthFieldParse(0) == kSmokeIniFieldParse,
				"MultiIniFieldParse field pointer failed") ||
			!expect(parse.getNthExtraOffset(0) == 12, "MultiIniFieldParse extra offset failed")) {
		return false;
	}

	g_multi_ini_builder_called = false;
	INI ini;
	ini.initFromINIMultiProc(nullptr, build_multi_ini_smoke);
	return expect(g_multi_ini_builder_called, "INI initFromINIMultiProc builder was not called");
}

bool exercise_file_interfaces()
{
	SmokeFile invalid;
	if (!expect(!invalid.open("bad.dat", File::STREAMING | File::WRITE),
			"File rejected streaming writes failed")) {
		return false;
	}

	SmokeFile file;
	if (!expect(file.open("smoke.txt", File::TEXT | File::WRITE),
			"File open failed")) {
		return false;
	}

	const bool access_ok =
		expect((file.getAccess() & File::WRITE) != 0, "File write access missing") &&
		expect((file.getAccess() & File::TRUNCATE) != 0, "File truncate default missing") &&
		expect((file.getAccess() & File::TEXT) != 0, "File text access missing") &&
		expect(std::strcmp(file.getName(), "smoke.txt") == 0, "File name tracking failed");
	if (!access_ok) {
		return false;
	}

	if (!expect(file.print("%s-%d", "ZH", 5), "File print failed")) {
		return false;
	}
	if (!expect(file.size() == 4 && file.position() == 4, "File size/position failed")) {
		return false;
	}

	char buffer[5] = {};
	file.seek(0, File::START);
	const Int read = file.read(buffer, 4);
	if (!expect(read == 4 && std::strcmp(buffer, "ZH-5") == 0, "File readback failed")) {
		return false;
	}

	char *entire = file.readEntireAndClose();
	const bool entire_ok = expect(entire != nullptr && std::strcmp(entire, "ZH-5") == 0,
		"File readEntireAndClose failed");
	delete[] entire;
	if (!entire_ok) {
		return false;
	}

	SmokeFile default_read;
	if (!expect(default_read.open("read.bin"),
			"File default open failed")) {
		return false;
	}
	if (!expect((default_read.getAccess() & File::READ) != 0 &&
			(default_read.getAccess() & File::BINARY) != 0,
			"File read/binary defaults failed")) {
		return false;
	}

	FilenameList filenames;
	filenames.insert(AsciiString("zeta.ini"));
	filenames.insert(AsciiString("Alpha.ini"));
	filenames.insert(AsciiString("alpha.ini"));
	if (!expect(filenames.size() == 2, "FilenameList no-case uniqueness failed")) {
		return false;
	}
	if (!expect(std::strcmp(filenames.begin()->str(), "Alpha.ini") == 0,
			"FilenameList no-case ordering failed")) {
		return false;
	}

	SmokeLocalFileSystem local_file_system;
	TheLocalFileSystem = &local_file_system;
	local_file_system.init();
	local_file_system.update();
	local_file_system.reset();
	const bool global_ok = expect(TheLocalFileSystem == &local_file_system,
		"LocalFileSystem global pointer failed");
	TheLocalFileSystem = nullptr;
	return global_ok;
}

bool exercise_file_system_dispatch()
{
	SmokeLocalFileSystem local_file_system;
	FileSystem file_system;
	TheLocalFileSystem = &local_file_system;
	TheFileSystem = &file_system;
	TheArchiveFileSystem = nullptr;

	File *opened = file_system.openFile("local-smoke.txt", File::READ | File::BINARY);
	const bool open_ok =
		expect(opened != nullptr, "FileSystem local open dispatch failed") &&
		expect((opened->getAccess() & File::READ) != 0, "FileSystem local file access missing") &&
		expect(std::strcmp(opened->getName(), "local-smoke.txt") == 0,
			"FileSystem local file name tracking failed");
	if (opened != nullptr) {
		opened->close();
	}

	const bool missing_ok = expect(file_system.openFile("missing.txt", File::READ) == nullptr,
		"FileSystem missing local/archive file should fail");

	TheFileSystem = nullptr;
	TheLocalFileSystem = nullptr;
	return open_ok && missing_ok;
}

bool exercise_win32_local_file_system()
{
	const char directory[] = "local-smoke-dir";
	const char path[] = "local-smoke-dir/local-file.txt";
	const char payload[] = "23 4.5 USA\nline2";
	const Int payload_size = static_cast<Int>(std::strlen(payload));
	::remove(path);

	Win32LocalFileSystem local_file_system;
	FileSystem file_system;
	TheLocalFileSystem = &local_file_system;
	TheArchiveFileSystem = nullptr;
	TheFileSystem = &file_system;

	bool ok = expect(local_file_system.createDirectory(directory), "Win32LocalFileSystem createDirectory failed");

	File *written = local_file_system.openFile(path, File::WRITE | File::TEXT | File::CREATE);
	ok = expect(written != nullptr, "Win32LocalFileSystem write open failed") && ok;
	if (written != nullptr) {
		ok = expect(written->write(payload, payload_size) == payload_size,
			"Win32LocalFile write failed") && ok;
		written->close();
	}

	ok = expect(local_file_system.doesFileExist(path), "Win32LocalFileSystem doesFileExist failed") && ok;

	FileInfo info = {};
	ok = expect(local_file_system.getFileInfo(AsciiString(path), &info) &&
			info.sizeHigh == 0 && info.sizeLow == payload_size,
		"Win32LocalFileSystem getFileInfo failed") && ok;

	FilenameList filenames;
	local_file_system.getFileListInDirectory(
		AsciiString(""), AsciiString("local-smoke-dir/"), AsciiString("*.txt"), filenames, FALSE);
	ok = expect(filenames.find(AsciiString(path)) != filenames.end(),
		"Win32LocalFileSystem directory listing failed") && ok;

	File *opened = local_file_system.openFile(path, File::READ | File::TEXT);
	char buffer[sizeof(payload)] = {};
	ok = expect(opened != nullptr, "Win32LocalFileSystem read open failed") && ok;
	if (opened != nullptr) {
		ok = expect(opened->read(buffer, payload_size) == payload_size &&
				std::memcmp(buffer, payload, payload_size) == 0,
			"Win32LocalFile read failed") && ok;
		opened->close();
	}

	File *via_file_system = file_system.openFile(path, File::READ | File::BINARY);
	char dispatch_buffer[sizeof(payload)] = {};
	ok = expect(via_file_system != nullptr, "FileSystem Win32 local dispatch failed") && ok;
	if (via_file_system != nullptr) {
		ok = expect(via_file_system->read(dispatch_buffer, payload_size) == payload_size &&
				std::memcmp(dispatch_buffer, payload, payload_size) == 0,
			"FileSystem Win32 local dispatch read failed") && ok;
		via_file_system->close();
	}

	File *to_convert = local_file_system.openFile(path, File::READ | File::BINARY);
	File *ram_file = to_convert != nullptr ? to_convert->convertToRAMFile() : nullptr;
	char ram_buffer[sizeof(payload)] = {};
	ok = expect(ram_file != nullptr, "Win32LocalFile convertToRAMFile failed") && ok;
	if (ram_file != nullptr) {
		ok = expect(ram_file->read(ram_buffer, payload_size) == payload_size &&
				std::memcmp(ram_buffer, payload, payload_size) == 0,
			"Win32LocalFile converted RAMFile read failed") && ok;
		ram_file->close();
	}

	File *entire_file = local_file_system.openFile(path, File::READ | File::BINARY);
	char *entire = entire_file != nullptr ? entire_file->readEntireAndClose() : nullptr;
	ok = expect(entire != nullptr && std::memcmp(entire, payload, payload_size) == 0,
		"Win32LocalFile readEntireAndClose failed") && ok;
	delete[] entire;

	::remove(path);
	TheFileSystem = nullptr;
	TheArchiveFileSystem = nullptr;
	TheLocalFileSystem = nullptr;
	return ok;
}

bool exercise_archive_big_files()
{
	const char archived_path[] = "Data\\INI\\Worker.ini";
	const char payload[] = "WorkerObject = AmericaInfantryRanger";
	const Int payload_size = static_cast<Int>(std::strlen(payload));
	const std::vector<char> big_archive = make_smoke_big_archive(archived_path, payload, payload_size);

	NameKeyGenerator generator;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	TheNameKeyGenerator = &generator;
	generator.init();

	SmokeLocalFileSystem local_file_system;
	local_file_system.setPayload("Smoke.big", big_archive.data(), static_cast<Int>(big_archive.size()));

	FileSystem file_system;
	Win32BIGFileSystem archive_file_system;
	TheLocalFileSystem = &local_file_system;
	TheArchiveFileSystem = &archive_file_system;
	TheFileSystem = &file_system;

	bool ok = expect(archive_file_system.loadBigFilesFromDirectory("", "*.big"),
		"Win32BIGFileSystem loadBigFilesFromDirectory failed");
	ok = expect(archive_file_system.doesFileExist(archived_path),
		"ArchiveFileSystem indexed BIG file path failed") && ok;
	ok = expect(std::strcmp(archive_file_system.getArchiveFilenameForFile(archived_path).str(), "Smoke.big") == 0,
		"ArchiveFileSystem archive owner lookup failed") && ok;

	FileInfo file_info = {};
	ok = expect(archive_file_system.getFileInfo(AsciiString(archived_path), &file_info) &&
			file_info.sizeHigh == 0 && file_info.sizeLow == payload_size,
		"Win32BIGFile file info failed") && ok;

	ok = expect(file_system.doesFileExist(archived_path),
		"FileSystem archive doesFileExist dispatch failed") && ok;
	ok = expect(!file_system.doesFileExist("Data\\INI\\MissingWorker.ini"),
		"FileSystem missing file cache dispatch failed") && ok;

	FileInfo facade_file_info = {};
	ok = expect(file_system.getFileInfo(AsciiString(archived_path), &facade_file_info) &&
			facade_file_info.sizeHigh == 0 && facade_file_info.sizeLow == payload_size,
		"FileSystem archive getFileInfo dispatch failed") && ok;

	FilenameList filenames;
	archive_file_system.getFileListInDirectory(
		AsciiString(""), AsciiString(""), AsciiString("*.ini"), filenames, TRUE);
	ok = expect(filenames.find(AsciiString("data\\ini\\worker.ini")) != filenames.end(),
		"ArchiveFile file list failed") && ok;

	FilenameList facade_filenames;
	file_system.getFileListInDirectory(
		AsciiString(""), AsciiString("*.ini"), facade_filenames, TRUE);
	ok = expect(facade_filenames.find(AsciiString("data\\ini\\worker.ini")) != facade_filenames.end(),
		"FileSystem archive directory-list dispatch failed") && ok;

	File *opened = file_system.openFile(archived_path, File::READ | File::BINARY);
	char readback[sizeof(payload)] = {};
	const Int bytes_read = opened != nullptr ? opened->read(readback, payload_size) : 0;
	ok = expect(opened != nullptr && bytes_read == payload_size &&
			std::memcmp(readback, payload, payload_size) == 0,
		"FileSystem archive fallback read failed") && ok;
	if (opened != nullptr) {
		opened->close();
	}

	File *streaming = archive_file_system.openFile(archived_path, File::READ | File::BINARY | File::STREAMING);
	char streaming_readback[sizeof(payload)] = {};
	const Int streaming_bytes = streaming != nullptr ? streaming->read(streaming_readback, payload_size) : 0;
	ok = expect(streaming != nullptr && streaming_bytes == payload_size &&
			std::memcmp(streaming_readback, payload, payload_size) == 0,
		"StreamingArchiveFile archive read failed") && ok;
	if (streaming != nullptr) {
		const Int tail_pos = streaming->seek(-6, File::END);
		char tail[7] = {};
		const Int tail_bytes = streaming->read(tail, 6);
		ok = expect(tail_pos == payload_size - 6 && tail_bytes == 6 &&
				std::strcmp(tail, "Ranger") == 0,
			"StreamingArchiveFile tail seek/read failed") && ok;
		streaming->close();
	}

	TheFileSystem = nullptr;
	TheArchiveFileSystem = nullptr;
	TheLocalFileSystem = nullptr;
	generator.reset();
	TheNameKeyGenerator = old_name_key_generator;
	return ok;
}

bool exercise_file_system_music_cd_probe()
{
	const char music_big_path[] = "D:\\genseczh.big";
	const char payload[] = "music";

	SmokeLocalFileSystem local_file_system;
	local_file_system.setPayload(music_big_path, payload, static_cast<Int>(std::strlen(payload)));
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	SmokeCDManager cd_manager;

	CDManagerInterface *old_cd_manager = TheCDManager;
	TheCDManager = &cd_manager;
	TheLocalFileSystem = &local_file_system;
	TheArchiveFileSystem = &archive_file_system;
	TheFileSystem = &file_system;

	bool ok = expect(!file_system.areMusicFilesOnCD(),
		"FileSystem music-CD probe should be false without drives");
	CDDriveInterface *drive = cd_manager.newDrive("D:\\");
	ok = expect(drive != nullptr, "FileSystem music-CD probe drive setup failed") && ok;
	ok = expect(file_system.areMusicFilesOnCD(),
		"FileSystem music-CD probe did not find genseczh.big on the drive") && ok;

	cd_manager.destroyAllDrives();
	TheFileSystem = nullptr;
	TheArchiveFileSystem = nullptr;
	TheLocalFileSystem = nullptr;
	TheCDManager = old_cd_manager;
	return ok;
}

bool exercise_cached_file_input_stream()
{
	const char payload[] = "DataChunk cached input decompresses through the original manager.";
	const Int payload_size = static_cast<Int>(std::strlen(payload));
	const Int max_compressed_size = CompressionManager::getMaxCompressedSize(payload_size, COMPRESSION_REFPACK);
	if (!expect(max_compressed_size > payload_size, "CompressionManager max compressed size failed")) {
		return false;
	}

	std::vector<unsigned char> compressed(static_cast<std::size_t>(max_compressed_size));
	const Int compressed_size = CompressionManager::compressData(
		COMPRESSION_REFPACK,
		const_cast<char *>(payload),
		payload_size,
		compressed.data(),
		max_compressed_size);
	if (!expect(compressed_size > 0, "CompressionManager RefPack compression failed")) {
		return false;
	}

	SmokeLocalFileSystem local_file_system;
	local_file_system.setPayload("compressed-chunk.bin", compressed.data(), compressed_size);

	FileSystem file_system;
	TheLocalFileSystem = &local_file_system;
	TheFileSystem = &file_system;
	TheArchiveFileSystem = nullptr;

	CachedFileInputStream input;
	if (!expect(input.open(AsciiString("compressed-chunk.bin")), "CachedFileInputStream open failed")) {
		TheFileSystem = nullptr;
		TheLocalFileSystem = nullptr;
		return false;
	}

	char readback[sizeof(payload)] = {};
	const Int bytes_read = input.read(readback, payload_size);
	const bool read_ok =
		expect(bytes_read == payload_size, "CachedFileInputStream read size failed") &&
		expect(std::memcmp(readback, payload, payload_size) == 0,
			"CachedFileInputStream decompressed payload mismatch") &&
		expect(input.eof(), "CachedFileInputStream eof failed") &&
		expect(input.absoluteSeek(0) && input.tell() == 0, "CachedFileInputStream seek/tell failed");

	input.close();
	TheFileSystem = nullptr;
	TheLocalFileSystem = nullptr;
	return read_ok;
}

bool exercise_data_chunks()
{
	DataChunkTableOfContents contents;
	const UnsignedInt root_id = contents.allocateID(AsciiString("ROOT"));

	SmokeOutputStream output;
	contents.write(output);

	std::vector<char> chunk_file = output.data();
	std::vector<char> payload;
	const Int integer = 41;
	const Byte byte = 9;
	const char text[] = "supply";
	const UnsignedShort text_length = static_cast<UnsignedShort>(std::strlen(text));
	append_value(payload, integer);
	append_value(payload, byte);
	append_value(payload, text_length);
	payload.insert(payload.end(), text, text + text_length);

	append_value(chunk_file, root_id);
	const DataChunkVersionType version = 3;
	append_value(chunk_file, version);
	const Int payload_size = static_cast<Int>(payload.size());
	append_value(chunk_file, payload_size);
	chunk_file.insert(chunk_file.end(), payload.begin(), payload.end());

	SmokeChunkInputStream stream(chunk_file);
	DataChunkInput input(&stream);
	if (!expect(input.isValidFileType(), "DataChunkInput did not recognize table of contents")) {
		return false;
	}

	DataChunkParseResult result = {};
	input.registerParser(AsciiString("ROOT"), AsciiString(""), parse_smoke_data_chunk, &result);
	const bool parse_ok =
		expect(input.parse(&result), "DataChunkInput parse failed") &&
		expect(result.called, "DataChunk parser was not invoked") &&
		expect(result.version == version, "DataChunk parser version failed") &&
		expect(result.data_size == payload_size, "DataChunk parser data size failed") &&
		expect(result.integer == integer && result.byte == byte,
			"DataChunk parser primitive reads failed") &&
		expect(std::strcmp(result.text.str(), text) == 0, "DataChunk parser AsciiString read failed");
	if (!parse_ok) {
		return false;
	}

	input.reset();
	DataChunkVersionType reopened_version = 0;
	const AsciiString reopened_label = input.openDataChunk(&reopened_version);
	const bool reopen_ok =
		expect(std::strcmp(reopened_label.str(), "ROOT") == 0, "DataChunkInput reset/open label failed") &&
		expect(reopened_version == version, "DataChunkInput reset/open version failed") &&
		expect(input.getChunkDataSize() == static_cast<UnsignedInt>(payload_size),
			"DataChunkInput reset/open size failed");
	input.closeDataChunk();
	return reopen_ok;
}

bool exercise_data_chunk_output()
{
	const char temp_path[] = "./_tmpChunk.dat";
	::remove(temp_path);

	GlobalData global_data;
	global_data.setPath_UserData(AsciiString("./"));
	GlobalData *old_global_data = TheGlobalData;
	TheGlobalData = &global_data;

	NameKeyGenerator generator;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	TheNameKeyGenerator = &generator;
	generator.init();

	const NameKeyType name_key = generator.nameToKey("SaveChunkKey");
	const NameKeyType dict_bool_key = generator.nameToKey("DictBool");
	const NameKeyType dict_int_key = generator.nameToKey("DictInt");
	const NameKeyType dict_real_key = generator.nameToKey("DictReal");
	const NameKeyType dict_ascii_key = generator.nameToKey("DictAscii");
	const NameKeyType dict_unicode_key = generator.nameToKey("DictUnicode");

	UnicodeString wide_text;
	wide_text.translate(AsciiString("reactor"));
	UnicodeString dict_wide;
	dict_wide.translate(AsciiString("upgrade"));

	Dict dict;
	dict.setBool(dict_bool_key, true);
	dict.setInt(dict_int_key, 9001);
	dict.setReal(dict_real_key, 2.25f);
	dict.setAsciiString(dict_ascii_key, AsciiString("supply-dock"));
	dict.setUnicodeString(dict_unicode_key, dict_wide);

	SmokeOutputStream output;
	{
		DataChunkOutput data_output(&output);
		char root[] = "SAVE_ROOT";
		data_output.openDataChunk(root, 7);
		data_output.writeInt(1234);
		data_output.writeReal(6.5f);
		data_output.writeByte(17);
		data_output.writeAsciiString(AsciiString("command-center"));
		data_output.writeUnicodeString(wide_text);
		char raw_bytes[] = { 'Z', 'H', 'W', 'A', 'S' };
		data_output.writeArrayOfBytes(raw_bytes, static_cast<Int>(sizeof(raw_bytes)));
		data_output.writeNameKey(name_key);
		data_output.writeDict(dict);
		data_output.closeDataChunk();
	}

	::remove(temp_path);

	const bool wire_ok = expect_data_chunk_output_wire_format(output.data());

	SmokeChunkInputStream stream(output.data());
	DataChunkInput input(&stream);
	DataChunkParseResult result = {};
	input.registerParser(AsciiString("SAVE_ROOT"), AsciiString(""), parse_smoke_data_chunk_output, &result);
	const bool ok =
		wire_ok &&
		expect(input.isValidFileType(), "DataChunkOutput did not write a readable table of contents") &&
		expect(input.parse(&result), "DataChunkOutput round-trip parse failed") &&
		expect(result.called, "DataChunkOutput parser was not invoked") &&
		expect(result.version == 7, "DataChunkOutput version round-trip failed") &&
		expect(result.integer == 1234, "DataChunkOutput int round-trip failed") &&
		expect(near(result.real, 6.5f, 0.0001f), "DataChunkOutput real round-trip failed") &&
		expect(result.byte == 17, "DataChunkOutput byte round-trip failed") &&
		expect(std::strcmp(result.text.str(), "command-center") == 0,
			"DataChunkOutput AsciiString round-trip failed") &&
		expect(result.wide_text.compare(wide_text) == 0,
			"DataChunkOutput UnicodeString round-trip failed") &&
		expect(result.bytes.size() == 5 && std::memcmp(result.bytes.data(), "ZHWAS", 5) == 0,
			"DataChunkOutput byte-array round-trip failed") &&
		expect(result.name_key == name_key, "DataChunkOutput NameKey round-trip failed") &&
		expect(result.dict.getPairCount() == 5, "DataChunkOutput Dict pair count failed") &&
		expect(result.dict.getBool(dict_bool_key), "DataChunkOutput Dict bool round-trip failed") &&
		expect(result.dict.getInt(dict_int_key) == 9001, "DataChunkOutput Dict int round-trip failed") &&
		expect(near(result.dict.getReal(dict_real_key), 2.25f, 0.0001f),
			"DataChunkOutput Dict real round-trip failed") &&
		expect(std::strcmp(result.dict.getAsciiString(dict_ascii_key).str(), "supply-dock") == 0,
			"DataChunkOutput Dict AsciiString round-trip failed") &&
		expect(result.dict.getUnicodeString(dict_unicode_key).compare(dict_wide) == 0,
			"DataChunkOutput Dict UnicodeString round-trip failed");

	result.dict.clear();
	generator.reset();
	TheNameKeyGenerator = old_name_key_generator;
	TheGlobalData = old_global_data;
	return ok;
}

bool exercise_ram_file()
{
	SmokeFile source;
	if (!expect(source.open("ram-source.txt", File::READWRITE | File::TEXT | File::CREATE),
			"RAMFile source open failed")) {
		return false;
	}
	if (!expect(source.write("17 3.25 USA\nnext", 16) == 16, "RAMFile source write failed")) {
		return false;
	}
	source.seek(0, File::START);

	RAMFile *ram = newInstance(RAMFile);
	if (!expect(ram != nullptr, "RAMFile allocation failed")) {
		return false;
	}
	if (!expect(ram->open(&source), "RAMFile open from File failed")) {
		ram->deleteInstance();
		return false;
	}
	if (!expect(ram->size() == 16 && ram->position() == 0, "RAMFile size/position failed")) {
		ram->deleteInstance();
		return false;
	}

	Int integer = 0;
	Real real = 0.0f;
	AsciiString token;
	char line[16] = {};
	const bool scan_ok =
		expect(ram->scanInt(integer) && integer == 17, "RAMFile scanInt failed") &&
		expect(ram->scanReal(real) && near(real, 3.25f, 0.0001f), "RAMFile scanReal failed") &&
		expect(ram->scanString(token) && std::strcmp(token.str(), "USA") == 0,
			"RAMFile scanString failed");
	if (!scan_ok) {
		ram->deleteInstance();
		return false;
	}
	ram->seek(0, File::START);
	ram->nextLine(line, sizeof(line));
	if (!expect(std::strcmp(line, "17 3.25 USA\n") == 0, "RAMFile nextLine failed")) {
		ram->deleteInstance();
		return false;
	}

	ram->seek(0, File::START);
	char buffer[4] = {};
	if (!expect(ram->read(buffer, 3) == 3 && std::strncmp(buffer, "17 ", 3) == 0,
			"RAMFile read failed")) {
		ram->deleteInstance();
		return false;
	}
	if (!expect(ram->write("x", 1) == -1, "RAMFile write should be read-only")) {
		ram->deleteInstance();
		return false;
	}

	char *entire = ram->readEntireAndClose();
	const bool entire_ok = expect(entire != nullptr && std::strncmp(entire, "17 3.25 USA", 11) == 0,
		"RAMFile readEntireAndClose failed");
	delete[] entire;
	ram->deleteInstance();
	return entire_ok;
}

bool exercise_registry_defaults()
{
	AsciiString value("unchanged");
	UnsignedInt version = 7;

	return expect(!GetStringFromRegistry("", "Language", value), "browser registry string query should miss") &&
		expect(std::strcmp(value.str(), "unchanged") == 0, "registry miss should not mutate string value") &&
		expect(!GetUnsignedIntFromRegistry("", "Version", version), "browser registry integer query should miss") &&
		expect(version == 7, "registry miss should not mutate integer value") &&
		expect(std::strcmp(GetRegistryLanguage().str(), "english") == 0, "registry language default failed") &&
		expect(std::strcmp(GetRegistryGameName().str(), "GeneralsMPTest") == 0, "registry SKU default failed") &&
		expect(GetRegistryVersion() == 65536, "registry version default failed") &&
		expect(GetRegistryMapPackVersion() == 65536, "registry map pack default failed");
}

bool exercise_version()
{
	SmokeGameText game_text;
	TheGameText = &game_text;

	Version version;
	version.setVersion(
		1,
		4,
		382,
		7,
		AsciiString("codex"),
		AsciiString("browser"),
		AsciiString("12:34"),
		AsciiString("Jun 25 2026"));

#if defined _DEBUG || defined _INTERNAL
	const char ascii_expected[] = "1.4.382.7co";
	const char unicode_expected[] = "Version 1.4.382.7co";
#else
	const char ascii_expected[] = "1.4";
	const char unicode_expected[] = "Version 1.4";
#endif

	AsciiString unicode_version;
	AsciiString full_version;
	AsciiString build_time;
	AsciiString build_location;
	AsciiString build_user;
	unicode_version.translate(version.getUnicodeVersion());
	full_version.translate(version.getFullUnicodeVersion());
	build_time.translate(version.getUnicodeBuildTime());
	build_location.translate(version.getUnicodeBuildLocation());
	build_user.translate(version.getUnicodeBuildUser());

	const bool ok =
		expect(version.getVersionNumber() == 0x00010004U, "Version number packing failed") &&
		expect(std::strcmp(version.getAsciiVersion().str(), ascii_expected) == 0,
			"Version ASCII formatting failed") &&
		expect(std::strcmp(unicode_version.str(), unicode_expected) == 0,
			"Version Unicode formatting failed") &&
		expect(std::strcmp(full_version.str(), "Version 1.4.382.7co") == 0,
			"Version full Unicode formatting failed") &&
		expect(std::strcmp(version.getAsciiBuildTime().str(), "Jun 25 2026 12:34") == 0,
			"Version ASCII build time failed") &&
		expect(std::strcmp(build_time.str(), "Built Jun 25 2026 12:34") == 0,
			"Version Unicode build time failed") &&
		expect(std::strcmp(version.getAsciiBuildLocation().str(), "browser") == 0,
			"Version ASCII build location failed") &&
		expect(std::strcmp(build_location.str(), "Machine browser") == 0,
			"Version Unicode build location failed") &&
		expect(std::strcmp(version.getAsciiBuildUser().str(), "codex") == 0,
			"Version ASCII build user failed") &&
		expect(std::strcmp(build_user.str(), "User codex") == 0,
			"Version Unicode build user failed");

	TheGameText = nullptr;
	return ok;
}

bool exercise_audio_request()
{
	AudioRequest *request = newInstance(AudioRequest);
	if (!expect(request != nullptr, "AudioRequest allocation failed")) {
		return false;
	}

	request->m_request = AR_Stop;
	request->m_handleToInteractOn = static_cast<AudioHandle>(0x1234U);
	request->m_usePendingEvent = FALSE;
	request->m_requiresCheckForSample = TRUE;

	const bool ok =
		expect(request->m_request == AR_Stop, "AudioRequest request tracking failed") &&
		expect(request->m_handleToInteractOn == static_cast<AudioHandle>(0x1234U),
			"AudioRequest handle tracking failed") &&
		expect(!request->m_usePendingEvent, "AudioRequest pending-event flag failed") &&
		expect(request->m_requiresCheckForSample, "AudioRequest sample-check flag failed") &&
		expect(TheMemoryPoolFactory->findMemoryPool("AudioRequest") != nullptr,
			"AudioRequest memory pool missing");

	request->deleteInstance();
	return ok;
}

bool exercise_cd_manager()
{
	GameLogic logic;
	TheGameLogic = &logic;

	SmokeCDManager manager;
	TheCDManager = &manager;
	manager.init();
	if (!expect(manager.driveCount() == 0, "CDManager initial drive count failed")) {
		TheCDManager = nullptr;
		TheGameLogic = nullptr;
		return false;
	}

	CDDriveInterface *drive = manager.newDrive("D:\\");
	const bool drive_ok =
		expect(drive != nullptr, "CDManager newDrive failed") &&
		expect(manager.driveCount() == 1, "CDManager drive count failed") &&
		expect(manager.getDrive(0) == drive, "CDManager getDrive failed") &&
		expect(std::strcmp(drive->getPath().str(), "D:\\") == 0, "CDDrive path failed") &&
		expect(drive->getDisk() == CD::UNKNOWN_DISK, "CDDrive default disk failed");
	if (!drive_ok) {
		TheCDManager = nullptr;
		TheGameLogic = nullptr;
		return false;
	}

	manager.refreshDrives();
	manager.update();
	manager.reset();
	manager.destroyAllDrives();
	const bool destroyed_ok = expect(manager.driveCount() == 0, "CDManager destroyAllDrives failed");
	TheCDManager = nullptr;
	TheGameLogic = nullptr;
	return destroyed_ok;
}

bool exercise_type_masks()
{
	initDisabledMasks();
	initKindOfMasks();

	ObjectStatusMaskType status = MAKE_OBJECT_STATUS_MASK(OBJECT_STATUS_STEALTHED);
	status.set(OBJECT_STATUS_DETECTED);

	return expect(TEST_DISABLEDMASK(DISABLEDMASK_ALL, DISABLED_EMP),
			"Disabled mask all initialization failed") &&
		expect(!TEST_DISABLEDMASK(DISABLEDMASK_NONE, DISABLED_EMP),
			"Disabled mask none initialization failed") &&
		expect(TEST_KINDOFMASK(KINDOFMASK_FS, KINDOF_FS_FACTORY) &&
			TEST_KINDOFMASK(KINDOFMASK_FS, KINDOF_FS_SUPERWEAPON),
			"KindOf faction-structure mask initialization failed") &&
		expect(!TEST_KINDOFMASK(KINDOFMASK_FS, KINDOF_INFANTRY),
			"KindOf faction-structure mask rejected infantry failed") &&
		expect(TEST_OBJECT_STATUS_MASK(status, OBJECT_STATUS_STEALTHED) &&
			TEST_OBJECT_STATUS_MASK(status, OBJECT_STATUS_DETECTED),
			"ObjectStatus mask set/test failed") &&
		expect(!TEST_OBJECT_STATUS_MASK(OBJECT_STATUS_MASK_NONE, OBJECT_STATUS_STEALTHED),
			"ObjectStatus none mask failed");
}

bool exercise_bit_flags()
{
	ModelConditionFlags model_flags;
	model_flags.set(MODELCONDITION_DAMAGED);
	model_flags.set(MODELCONDITION_MOVING);

	AsciiString description;
	model_flags.buildDescription(&description);

	ArmorSetFlags armor_flags;
	armor_flags.set(ARMORSET_VETERAN);
	const bool armor_name_ok = armor_flags.setBitByName("CRATE_UPGRADE_TWO");

	// Set operations used by GameLogic condition matching and netcode:
	// testForAny/testForAll/testForNone, countIntersection, and the
	// set-wise clear/set/clearAndSet transfers.
	ModelConditionFlags empty_flags;
	ModelConditionFlags damaged_only;
	damaged_only.set(MODELCONDITION_DAMAGED);
	ModelConditionFlags moving_only;
	moving_only.set(MODELCONDITION_MOVING);

	const bool set_ops_ok =
		expect(model_flags.any(), "BitFlags any() failed on non-empty flags") &&
		expect(!empty_flags.any(), "BitFlags any() returned true on empty flags") &&
		expect(model_flags.testForAny(damaged_only), "BitFlags testForAny failed on shared bits") &&
		expect(!empty_flags.testForAny(damaged_only), "BitFlags testForAny matched against empty") &&
		expect(model_flags.testForAll(damaged_only), "BitFlags testForAll failed on subset") &&
		expect(!damaged_only.testForAll(model_flags),
			"BitFlags testForAll should fail when argument has extra bits") &&
		expect(!model_flags.testForNone(damaged_only),
			"BitFlags testForNone matched a shared bit") &&
		expect(model_flags.testForNone(moving_only) == false &&
				damaged_only.testForNone(moving_only),
			"BitFlags testForNone disjoint mismatch") &&
		expect(model_flags.countIntersection(damaged_only) == 1,
			"BitFlags countIntersection shared-count failed") &&
		expect(model_flags.countIntersection(empty_flags) == 0,
			"BitFlags countIntersection empty-count failed");

	ModelConditionFlags transfer;
	transfer.set(MODELCONDITION_MOVING);
	transfer.set(damaged_only);
	const bool union_ok =
		expect(transfer.count() == 2 && transfer.test(MODELCONDITION_DAMAGED) &&
				transfer.test(MODELCONDITION_MOVING),
			"BitFlags set(BitFlags) union failed");

	transfer.clear(damaged_only);
	const bool clear_set_ok =
		expect(transfer.count() == 1 && transfer.test(MODELCONDITION_MOVING) &&
				!transfer.test(MODELCONDITION_DAMAGED),
			"BitFlags clear(BitFlags) failed");

	transfer.clearAndSet(moving_only, damaged_only);
	const bool clear_and_set_ok =
		expect(transfer.count() == 1 && transfer.test(MODELCONDITION_DAMAGED) &&
				!transfer.test(MODELCONDITION_MOVING),
			"BitFlags clearAndSet failed");

	transfer.clear();
	const bool full_clear_ok = expect(transfer.count() == 0 && !transfer.any(),
		"BitFlags clear() failed");

	return expect(model_flags.count() == 2, "ModelConditionFlags count failed") &&
		expect(std::strcmp(ModelConditionFlags::getNameFromSingleBit(MODELCONDITION_DAMAGED), "DAMAGED") == 0,
			"ModelConditionFlags name table failed") &&
		expect(ModelConditionFlags::getSingleBitFromName("moving") == MODELCONDITION_MOVING,
			"ModelConditionFlags case-insensitive lookup failed") &&
		expect(std::strstr(description.str(), "DAMAGED") != nullptr &&
			std::strstr(description.str(), "MOVING") != nullptr,
			"ModelConditionFlags description failed") &&
		expect(armor_name_ok && armor_flags.test(ARMORSET_CRATE_UPGRADE_TWO),
			"ArmorSetFlags name lookup failed") &&
		expect(std::strcmp(ArmorSetFlags::getNameFromSingleBit(ARMORSET_VETERAN), "VETERAN") == 0,
			"ArmorSetFlags name table failed") &&
		set_ops_ok && union_ok && clear_set_ok && clear_and_set_ok && full_clear_ok;
}

bool exercise_geometry()
{
	GeometryInfo sphere(GEOMETRY_SPHERE, TRUE, 0.0f, 5.0f, 0.0f);
	if (!expect(near(sphere.getBoundingCircleRadius(), 5.0f, 0.0001f) &&
			near(sphere.getBoundingSphereRadius(), 5.0f, 0.0001f),
			"GeometryInfo sphere bounds failed")) {
		return false;
	}
	if (!expect(near(sphere.getFootprintArea(), PI * 25.0f, 0.001f),
			"GeometryInfo sphere area failed")) {
		return false;
	}

	GeometryInfo box(GEOMETRY_BOX, FALSE, 6.0f, 3.0f, 2.0f);
	const Coord3D origin = { 0.0f, 0.0f, 0.0f };
	Region2D bounds = {};
	box.get2DBounds(origin, 0.0f, bounds);
	if (!expect(near(bounds.lo.x, -3.0f, 0.0001f) && near(bounds.lo.y, -2.0f, 0.0001f) &&
			near(bounds.hi.x, 3.0f, 0.0001f) && near(bounds.hi.y, 2.0f, 0.0001f),
			"GeometryInfo box 2D bounds failed")) {
		return false;
	}

	Coord3D center = {};
	box.getCenterPosition(origin, center);
	Coord3D point = { 10.0f, -10.0f, 0.0f };
	box.clipPointToFootprint(origin, point);

	const bool box_ok =
		expect(near(box.getBoundingCircleRadius(), std::sqrt(13.0f), 0.0001f),
			"GeometryInfo box bounding circle failed") &&
		expect(near(box.getBoundingSphereRadius(), std::sqrt(22.0f), 0.0001f),
			"GeometryInfo box bounding sphere failed") &&
		expect(near(box.getFootprintArea(), 24.0f, 0.0001f), "GeometryInfo box area failed") &&
		expect(near(box.getMaxHeightAbovePosition(), 6.0f, 0.0001f) &&
			near(box.getMaxHeightBelowPosition(), 0.0f, 0.0001f) &&
			near(center.z, 3.0f, 0.0001f), "GeometryInfo box height/center failed") &&
		expect(near(point.x, 3.0f, 0.0001f) && near(point.y, -2.0f, 0.0001f),
			"GeometryInfo box footprint clipping failed") &&
		expect(box.isPointInFootprint(origin, Coord3D{ 2.5f, 1.5f, 0.0f }),
			"GeometryInfo box footprint inclusion failed") &&
		expect(!box.isPointInFootprint(origin, Coord3D{ 3.5f, 1.5f, 0.0f }),
			"GeometryInfo box footprint exclusion failed");
	if (!box_ok) {
		return false;
	}

	box.expandFootprint(1.0f);
	return expect(near(box.getMajorRadius(), 4.0f, 0.0001f) &&
			near(box.getMinorRadius(), 3.0f, 0.0001f) &&
			near(box.getFootprintArea(), 48.0f, 0.0001f),
			"GeometryInfo footprint expansion failed");
}

bool exercise_name_keys()
{
	NameKeyGenerator generator;
	TheNameKeyGenerator = &generator;
	generator.init();

	const NameKeyType command_center = generator.nameToKey("CommandCenter");
	const NameKeyType command_center_again = generator.nameToKey("CommandCenter");
	const NameKeyType barracks = generator.nameToKey("Barracks");
	const NameKeyType lowercase = generator.nameToLowercaseKey("warfactory");
	const NameKeyType lowercase_again = generator.nameToLowercaseKey("WarFactory");
	MemoryPool *bucket_pool = TheMemoryPoolFactory->findMemoryPool("NameKeyBucketPool");

	const bool ok =
		expect(command_center == command_center_again, "NameKeyGenerator stable lookup failed") &&
		expect(command_center != barracks, "NameKeyGenerator unique key allocation failed") &&
		expect(lowercase == lowercase_again, "NameKeyGenerator lowercase lookup failed") &&
		expect(bucket_pool != nullptr, "NameKeyGenerator memory pool missing") &&
		expect(bucket_pool->getInitialBlockCount() == 9000, "original MemoryInit NameKey pool sizing was not applied") &&
		expect(std::strcmp(generator.keyToName(barracks).str(), "Barracks") == 0,
			"NameKeyGenerator reverse lookup failed");

	generator.reset();
	TheNameKeyGenerator = nullptr;
	return ok;
}

bool exercise_random_and_crc()
{
	InitRandom(0x12345678U);
	char file[] = "gameengine_common_core_smoke";
	const Int logic_a = GetGameLogicRandomValue(10, 100, file, 1);
	const Real logic_real_a = GetGameLogicRandomValueReal(-1.0f, 1.0f, file, 2);
	const Int client_a = GetGameClientRandomValue(10, 100, file, 3);
	const UnsignedInt seed_crc_a = GetGameLogicRandomSeedCRC();

	InitRandom(0x12345678U);
	const Int logic_b = GetGameLogicRandomValue(10, 100, file, 1);
	const Real logic_real_b = GetGameLogicRandomValueReal(-1.0f, 1.0f, file, 2);
	const Int client_b = GetGameClientRandomValue(10, 100, file, 3);
	const UnsignedInt seed_crc_b = GetGameLogicRandomSeedCRC();

	CRC crc;
	const char payload[] = "ZeroHour";
	crc.computeCRC(payload, static_cast<Int>(std::strlen(payload)));

	return expect(GetGameLogicRandomSeed() == 0x12345678U, "logic seed tracking failed") &&
		expect(logic_a == logic_b && client_a == client_b, "random integer replay failed") &&
		expect(near(logic_real_a, logic_real_b, 0.00001f), "random real replay failed") &&
		expect(seed_crc_a == seed_crc_b, "random seed CRC replay failed") &&
		expect(crc.get() == 0x60c8U, "GameEngine CRC vector failed");
}

bool exercise_trig()
{
	return expect(near(Sin(PI / 2.0f), 1.0f, 0.002f), "Sin lookup failed") &&
		expect(near(Cos(PI), -1.0f, 0.002f), "Cos lookup failed") &&
		expect(near(QSin(PI / 4.0f), std::sinf(PI / 4.0f), 0.01f), "QSin lookup failed") &&
		expect(near(QMag(3.0f, 4.0f, 0.0f), 4.75f, 0.001f), "QMag estimate failed");
}

bool exercise_game_common()
{
	return expect(std::strcmp(TheVeterancyNames[LEVEL_HEROIC], "HEROIC") == 0,
			"GameCommon veterancy names failed") &&
		expect(std::strcmp(TheRelationshipNames[ALLIES], "ALLIES") == 0,
			"GameCommon relationship names failed") &&
		expect(near(normalizeAngle(3.0f * PI), PI, 0.0001f), "normalizeAngle positive wrap failed") &&
		expect(near(std::fabs(normalizeAngle(-3.0f * PI)), PI, 0.0001f),
			"normalizeAngle negative wrap failed");
}

bool exercise_list_and_circle()
{
	Int first = 1;
	Int second = 2;
	LList list;
	list.addItemToHead(&first);
	list.addItemToTail(&second);
	const bool list_ok =
		expect(list.nodeCount() == 2, "LList node count failed") &&
		expect(list.firstNode()->item() == &first, "LList head insertion failed") &&
		expect(list.lastNode()->item() == &second, "LList tail insertion failed") &&
		expect(list.hasItem(&second), "LList item lookup failed");
	list.clear();
	if (!list_ok) {
		return false;
	}

	DiscreteCircle circle(0, 0, 2);
	std::vector<Scanline> lines;
	circle.drawCircle(collect_scanline, &lines);
	return expect(circle.getEdgeCount() == 3, "DiscreteCircle edge generation failed") &&
		expect(lines.size() == 5, "DiscreteCircle mirrored scanline draw failed") &&
		expect(lines.front().y == 2 && lines.front().x_start == -1 && lines.front().x_end == 1,
			"DiscreteCircle top scanline changed") &&
		expect(lines.back().y == 0 && lines.back().x_start == -2 && lines.back().x_end == 2,
			"DiscreteCircle center scanline changed");
}

bool exercise_bezier()
{
	BezierSegment segment(
		0.0f, 0.0f, 0.0f,
		1.0f, 0.0f, 0.0f,
		2.0f, 0.0f, 0.0f,
		3.0f, 0.0f, 0.0f);

	Coord3D midpoint;
	segment.evaluateBezSegmentAtT(0.5f, &midpoint);

	VecCoord3D points;
	segment.getSegmentPoints(4, &points);

	BezierSegment left;
	BezierSegment right;
	segment.splitSegmentAtT(0.5f, left, right);
	Coord3D split_left_end;
	Coord3D split_right_start;
	left.evaluateBezSegmentAtT(1.0f, &split_left_end);
	right.evaluateBezSegmentAtT(0.0f, &split_right_start);

	return expect(near(midpoint.x, 1.5f, 0.0001f) && near(midpoint.y, 0.0f, 0.0001f),
			"BezierSegment midpoint evaluation failed") &&
		expect(points.size() == 4 && near(points[0].x, 0.0f, 0.0001f) &&
			near(points[3].x, 3.0f, 0.0001f), "BezFwdIterator point generation failed") &&
		expect(near(segment.getApproximateLength(0.001f), 3.0f, 0.0001f),
			"BezierSegment approximate length failed") &&
		expect(near(split_left_end.x, split_right_start.x, 0.0001f) &&
			near(split_left_end.x, midpoint.x, 0.0001f), "BezierSegment split failed");
}

bool exercise_partition_solver()
{
	EntriesVec entries;
	entries.push_back(std::make_pair(static_cast<ObjectID>(11), 7U));
	entries.push_back(std::make_pair(static_cast<ObjectID>(12), 4U));
	entries.push_back(std::make_pair(static_cast<ObjectID>(13), 2U));

	SpacesVec spaces;
	spaces.push_back(std::make_pair(static_cast<ObjectID>(21), 8U));
	spaces.push_back(std::make_pair(static_cast<ObjectID>(22), 6U));

	PartitionSolver solver(entries, spaces, PREFER_FAST_SOLUTION);
	solver.solve();
	const SolutionVec &solution = solver.getSolution();
	return expect(solution.size() == 3, "PartitionSolver solution size failed") &&
		expect(solution[0].first == static_cast<ObjectID>(11) &&
			solution[0].second == static_cast<ObjectID>(21), "PartitionSolver first assignment failed") &&
		expect(solution[1].first == static_cast<ObjectID>(12) &&
			solution[1].second == static_cast<ObjectID>(22), "PartitionSolver second assignment failed") &&
		expect(solution[2].first == static_cast<ObjectID>(13) &&
			solution[2].second == static_cast<ObjectID>(22), "PartitionSolver residual assignment failed");
}

bool exercise_terrain_types()
{
	TerrainType *standalone = newInstance(TerrainType);
	if (!expect(standalone != nullptr, "TerrainType standalone allocation failed")) {
		return false;
	}

	const bool standalone_ok =
		expect(std::strcmp(standalone->getName().str(), "") == 0, "TerrainType default name failed") &&
		expect(std::strcmp(standalone->getTexture().str(), "") == 0, "TerrainType default texture failed") &&
		expect(!standalone->isBlendEdge(), "TerrainType default blend flag failed") &&
		expect(standalone->getClass() == TERRAIN_NONE, "TerrainType default class failed") &&
		expect(!standalone->getRestrictConstruction(), "TerrainType default restrict flag failed") &&
		expect(standalone->getFieldParse() != nullptr &&
				std::strcmp(standalone->getFieldParse()[0].token, "Texture") == 0,
				"TerrainType parse table missing");
	standalone->deleteInstance();
	if (!standalone_ok) {
		return false;
	}

	TerrainTypeCollection collection;
	TerrainType *default_terrain = collection.newTerrain(AsciiString("DefaultTerrain"));
	if (!expect(default_terrain != nullptr, "TerrainTypeCollection default allocation failed")) {
		return false;
	}

	default_terrain->friend_setTexture(AsciiString("Data/Terrain/default.tga"));
	default_terrain->friend_setClass(TERRAIN_ASPHALT);
	default_terrain->friend_setBlendEdge(TRUE);
	default_terrain->friend_setRestrictConstruction(TRUE);

	TerrainType *road = collection.newTerrain(AsciiString("RoadTerrain"));
	if (!expect(road != nullptr, "TerrainTypeCollection road allocation failed")) {
		return false;
	}

	return expect(collection.firstTerrain() == road, "TerrainTypeCollection head insert failed") &&
		expect(collection.nextTerrain(road) == default_terrain, "TerrainTypeCollection next pointer failed") &&
		expect(collection.findTerrain(AsciiString("DefaultTerrain")) == default_terrain,
			"TerrainTypeCollection find default failed") &&
		expect(collection.findTerrain(AsciiString("RoadTerrain")) == road,
			"TerrainTypeCollection find road failed") &&
		expect(std::strcmp(road->getName().str(), "RoadTerrain") == 0,
			"TerrainTypeCollection assigned name failed") &&
		expect(std::strcmp(road->getTexture().str(), "Data/Terrain/default.tga") == 0,
			"TerrainType default texture copy failed") &&
		expect(road->getClass() == TERRAIN_ASPHALT, "TerrainType default class copy failed") &&
		expect(road->isBlendEdge(), "TerrainType default blend copy failed") &&
		expect(road->getRestrictConstruction(), "TerrainType default restrict copy failed");
}

Money parse_money_line(char *line)
{
	INI ini;
	Money money;
	std::strtok(line, " \t\r\n=");
	Money::parseMoneyAmount(&ini, nullptr, &money, nullptr);
	return money;
}

bool exercise_multiplayer_settings_and_money()
{
	char default_line[] = "DefaultStartingMoney = 10000";
	Money default_money = parse_money_line(default_line);

	char alternate_line[] = "StartingMoneyChoice = 5000";
	Money alternate_money = parse_money_line(alternate_line);

	char default_copy_line[] = "DefaultStartingMoney = 10000";
	Money default_copy = parse_money_line(default_copy_line);

	MultiplayerSettings settings;
	const bool defaults_ok =
		expect(settings.getMaxBeaconsPerPlayer() == 3, "MultiplayerSettings beacon default failed") &&
		expect(settings.isShroudInMultiplayer(), "MultiplayerSettings shroud default failed") &&
		expect(settings.showRandomPlayerTemplate(), "MultiplayerSettings random template default failed") &&
		expect(settings.showRandomStartPos(), "MultiplayerSettings random start default failed") &&
		expect(settings.showRandomColor(), "MultiplayerSettings random color default failed") &&
		expect(settings.getNumColors() == 0, "MultiplayerSettings initial color count failed") &&
		expect(settings.getColor(0) == nullptr, "MultiplayerSettings missing color lookup failed") &&
		expect(settings.getColor(PLAYERTEMPLATE_RANDOM) != nullptr,
			"MultiplayerSettings random color definition missing") &&
		expect(settings.getColor(PLAYERTEMPLATE_OBSERVER) != nullptr,
			"MultiplayerSettings observer color definition missing");
	if (!defaults_ok) {
		return false;
	}

	MultiplayerColorDefinition *first_color = settings.newMultiplayerColorDefinition(AsciiString("USA"));
	MultiplayerColorDefinition *second_color = settings.newMultiplayerColorDefinition(AsciiString("GLA"));
	if (!expect(first_color != nullptr && second_color != nullptr,
			"MultiplayerSettings color allocation failed")) {
		return false;
	}

	RGBColor day = { 0.25f, 0.50f, 1.0f };
	RGBColor night = { 0.10f, 0.20f, 0.30f };
	first_color->setColor(day);
	first_color->setNightColor(night);

	settings.addStartingMoneyChoice(default_money, TRUE);
	settings.addStartingMoneyChoice(alternate_money, FALSE);
	const MultiplayerStartingMoneyList &starting_money = settings.getStartingMoneyList();

	return expect(default_money.countMoney() == 10000, "Money parser default amount failed") &&
		expect(alternate_money.countMoney() == 5000, "Money parser alternate amount failed") &&
		expect(default_money.amountEqual(default_copy), "Money amountEqual failed") &&
		expect(!default_money.amountEqual(alternate_money), "Money amountEqual mismatch failed") &&
		expect(settings.getNumColors() == 2, "MultiplayerSettings color count failed") &&
		expect(settings.getColor(0) == first_color, "MultiplayerSettings first color lookup failed") &&
		expect(settings.getColor(1) == second_color, "MultiplayerSettings second color lookup failed") &&
		expect(settings.getColor(2) == nullptr, "MultiplayerSettings out-of-range color lookup failed") &&
		expect(first_color->getColor() == static_cast<Color>(0xff3f7fff),
			"MultiplayerColorDefinition day color packing failed") &&
		expect(first_color->getNightColor() == static_cast<Color>(0xff19334c),
			"MultiplayerColorDefinition night color packing failed") &&
		expect(starting_money.size() == 2, "MultiplayerSettings starting money list size failed") &&
		expect(starting_money[0].countMoney() == 10000 && starting_money[1].countMoney() == 5000,
			"MultiplayerSettings starting money choices failed") &&
		expect(settings.getDefaultStartingMoney().countMoney() == 10000,
			"MultiplayerSettings default starting money failed");
}

bool exercise_science_metadata()
{
	NameKeyGenerator generator;
	TheNameKeyGenerator = &generator;
	generator.init();

	ScienceStore science_store;
	TheScienceStore = &science_store;
	science_store.init();

	char science_line[] = "Science = SCIENCE_BROWSER_SMOKE";
	INI science_ini;
	std::strtok(science_line, " \t\r\n=");
	ScienceStore::friend_parseScienceDefinition(&science_ini);

	const ScienceType science = science_store.getScienceFromInternalName(AsciiString("SCIENCE_BROWSER_SMOKE"));
	UnicodeString science_name;
	UnicodeString science_description;
	const std::vector<AsciiString> science_names = science_store.friend_getScienceNames();

	const bool ok =
		expect(science != SCIENCE_INVALID, "ScienceStore name lookup returned invalid science") &&
		expect(science_store.isValidScience(science), "ScienceStore parsed science is not valid") &&
		expect(std::strcmp(science_store.getInternalNameForScience(science).str(), "SCIENCE_BROWSER_SMOKE") == 0,
			"ScienceStore reverse name lookup failed") &&
		expect(science_names.size() == 1 &&
				std::strcmp(science_names[0].str(), "SCIENCE_BROWSER_SMOKE") == 0,
			"ScienceStore friend_getScienceNames failed") &&
		expect(science_store.getSciencePurchaseCost(science) == 0,
			"ScienceInfo default purchase cost changed") &&
		expect(science_store.isScienceGrantable(science), "ScienceInfo default grantable flag changed") &&
		expect(science_store.getNameAndDescription(science, science_name, science_description),
			"ScienceStore name/description lookup failed");

	TheScienceStore = nullptr;
	generator.reset();
	TheNameKeyGenerator = nullptr;
	return ok;
}

bool exercise_dict()
{
	const NameKeyType bool_key = static_cast<NameKeyType>(10);
	const NameKeyType int_key = static_cast<NameKeyType>(20);
	const NameKeyType real_key = static_cast<NameKeyType>(30);
	const NameKeyType ascii_key = static_cast<NameKeyType>(40);
	const NameKeyType unicode_key = static_cast<NameKeyType>(50);

	Dict dict;
	dict.setBool(bool_key, true);
	dict.setInt(int_key, 42);
	dict.setReal(real_key, 3.5f);
	dict.setAsciiString(ascii_key, AsciiString("supply"));

	UnicodeString wide;
	wide.translate(AsciiString("command"));
	dict.setUnicodeString(unicode_key, wide);

	Bool exists = false;
	const bool typed_ok =
		expect(dict.getPairCount() == 5, "Dict pair count failed") &&
		expect(dict.getBool(bool_key, &exists) == true && exists, "Dict bool lookup failed") &&
		expect(dict.getInt(int_key, &exists) == 42 && exists, "Dict int lookup failed") &&
		expect(near(dict.getReal(real_key, &exists), 3.5f, 0.0001f) && exists,
			"Dict real lookup failed") &&
		expect(std::strcmp(dict.getAsciiString(ascii_key, &exists).str(), "supply") == 0 && exists,
			"Dict AsciiString lookup failed") &&
		expect(dict.getUnicodeString(unicode_key, &exists).getLength() == wide.getLength() && exists,
			"Dict UnicodeString lookup failed");
	if (!typed_ok) {
		return false;
	}

	Dict shared = dict;
	shared.setInt(int_key, 7);
	shared.remove(bool_key);

	return expect(dict.getInt(int_key, &exists) == 42 && exists, "Dict copy-on-write source changed") &&
		expect(shared.getInt(int_key, &exists) == 7 && exists, "Dict copy-on-write update failed") &&
		expect(shared.getBool(bool_key, &exists) == false && !exists, "Dict remove failed") &&
		expect(shared.getNthKey(0) == int_key, "Dict sorted key order failed") &&
		expect(shared.getNthType(0) == Dict::DICT_INT, "Dict nth type failed");
}
}

int main()
{
	initMemoryManager();

	const bool ok = exercise_memory_init() &&
		exercise_strings() &&
		exercise_quoted_printable() &&
		exercise_file_interfaces() &&
		exercise_ini_multi_field_bridge() &&
		exercise_file_system_dispatch() &&
		exercise_win32_local_file_system() &&
		exercise_archive_big_files() &&
		exercise_file_system_music_cd_probe() &&
		exercise_cached_file_input_stream() &&
		exercise_data_chunks() &&
		exercise_data_chunk_output() &&
		exercise_ram_file() &&
		exercise_registry_defaults() &&
		exercise_version() &&
		exercise_audio_request() &&
		exercise_cd_manager() &&
		exercise_type_masks() &&
		exercise_bit_flags() &&
		exercise_geometry() &&
		exercise_name_keys() &&
		exercise_language_and_encrypt() &&
		exercise_random_and_crc() &&
		exercise_dict() &&
		exercise_trig() &&
		exercise_game_common() &&
		exercise_list_and_circle() &&
		exercise_bezier() &&
		exercise_partition_solver() &&
		exercise_terrain_types() &&
		exercise_multiplayer_settings_and_money() &&
		exercise_science_metadata();

	shutdownMemoryManager();

	if (!ok) {
		return 1;
	}

	std::printf("{\"ok\":true,\"library\":\"GameEngine/Common\","
		"\"compiled\":\"GameMemory,CriticalSection,AsciiString,UnicodeString,"
		"WSYS_String,File,LocalFile,LocalFileSystem,Win32LocalFile,Win32LocalFileSystem,"
		"FileSystem,RAMFile,StreamingArchiveFile,ArchiveFile,ArchiveFileSystem,"
		"Win32BIGFile,Win32BIGFileSystem,"
		"SubsystemInterface,CDManager,Registry,"
		"Version,AudioRequest,Directory,StackDump,"
		"GameType,GameCommon,Trig,QuickTrig,List,DisabledTypes,KindOf,ObjectStatusTypes,"
		"BitFlags,Snapshot,Geometry,Compression,DataChunkInput,DataChunkOutput,MiniLog,Dict,"
		"DiscreteCircle,BezierSegment,BezFwdIterator,MemoryInit,Language,QuotedPrintable,"
		"EncryptString,PartitionSolver,NameKeyGenerator,RandomValue,crc,"
		"TerrainTypes,MultiplayerSettings,PerfTimer,AudioEventRTS,GameAudio,GameMusic,GameSounds,"
		"Energy,Handicap,MessageStream,MissionStats,Money,PlayerList,PlayerTemplate,ProductionPrerequisite,"
		"Science,SpecialPower,"
		"INIAudioEventInfo,INICommandSet,INIControlBarScheme,INICrate,INIDamageFX,INIDrawGroupInfo,"
		"INIMapData,INIModel,INIMiscAudio,INIMultiplayer,INISpecialPower,INITerrain,"
		"INITerrainBridge,INITerrainRoad,INIUpgrade\","
		"\"source\":\"GeneralsMD original\"}\n");
	return 0;
}
