#include <cmath>
#include <cstring>
#include <iostream>
#include <string>
#include <sys/stat.h>

#include "mathutil.h"
#include "miscutil.h"
#include "rawfile.h"
#include "windows.h"
#include "wwmath.h"
#include "wwstring.h"

namespace {
constexpr int kPeHeaderOffset = 0x80;
constexpr int kPeSignatureSize = sizeof(DWORD);

bool near(double actual, double expected, double epsilon = 0.001)
{
	return std::fabs(actual - expected) <= epsilon;
}

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}

std::string as_string(const StringClass &value)
{
	return static_cast<const char *>(value);
}

bool write_pe_like_file(const char *path, DWORD timestamp)
{
	char image[kPeHeaderOffset + kPeSignatureSize + sizeof(IMAGE_FILE_HEADER)] = {};

	auto *dos_header = reinterpret_cast<IMAGE_DOS_HEADER *>(image);
	dos_header->e_lfanew = kPeHeaderOffset;

	IMAGE_FILE_HEADER file_header = {};
	file_header.TimeDateStamp = timestamp;
	std::memcpy(
		image + kPeHeaderOffset + kPeSignatureSize,
		&file_header,
		sizeof(file_header));

	RawFileClass file(path);
	file.Delete();
	if (!file.Open(FileClass::WRITE)) {
		return false;
	}
	const int bytes = file.Write(image, sizeof(image));
	file.Close();
	return bytes == static_cast<int>(sizeof(image));
}

bool exercise_misc()
{
	int hours = 0;
	int minutes = 0;
	int seconds = 0;
	cMiscUtil::Seconds_To_Hms(3661.0f, hours, minutes, seconds);
	if (!expect(hours == 1 && minutes == 1 && seconds == 1,
			"Seconds_To_Hms conversion failed")) {
		return false;
	}

	if (!expect(cMiscUtil::Is_String_Same("China", "china") &&
			cMiscUtil::Is_String_Different("GLA", "USA"),
			"case-insensitive string comparison failed")) {
		return false;
	}

	if (!expect(cMiscUtil::Is_Alphabetic('Z') &&
			cMiscUtil::Is_Numeric('7') &&
			cMiscUtil::Is_Alphanumeric('g') &&
			cMiscUtil::Is_Whitespace('\t') &&
			!cMiscUtil::Is_Alphanumeric('#'),
			"character classification failed")) {
		return false;
	}

	char padded[] = "General  \t";
	cMiscUtil::Trim_Trailing_Whitespace(padded);
	if (!expect(std::strcmp(padded, "General") == 0,
			"Trim_Trailing_Whitespace failed")) {
		return false;
	}

	const char path[] = "wwutil_pe_smoke.bin";
	constexpr DWORD kTimestamp = 0x12345678UL;
	if (!expect(write_pe_like_file(path, kTimestamp), "PE-like test file write failed")) {
		return false;
	}
	if (!expect(cMiscUtil::File_Exists(path), "File_Exists failed")) {
		return false;
	}

	if (!expect(chmod(path, 0444) == 0, "chmod readonly setup failed")) {
		return false;
	}
	if (!expect(cMiscUtil::File_Is_Read_Only(path), "File_Is_Read_Only failed")) {
		chmod(path, 0644);
		return false;
	}
	if (!expect(chmod(path, 0644) == 0, "chmod writable restore failed")) {
		return false;
	}

	StringClass file_id;
	cMiscUtil::Get_File_Id_String(path, file_id);
	const std::string expected =
		std::string("WWUTIL_PE_SMOKE.BIN ") +
		std::to_string(kPeHeaderOffset + kPeSignatureSize + sizeof(IMAGE_FILE_HEADER)) +
		" " +
		std::to_string(kTimestamp);
	if (!expect(as_string(file_id) == expected, "Get_File_Id_String failed")) {
		cMiscUtil::Remove_File(path);
		return false;
	}

	cMiscUtil::Remove_File(path);
	return expect(!cMiscUtil::File_Exists(path), "Remove_File failed");
}

bool exercise_math()
{
	double dx = 0.0;
	double dy = 0.0;
	cMathUtil::Angle_To_Vector(0.0, dx, dy);
	if (!expect(near(dx, 0.0) && near(dy, -1.0), "Angle_To_Vector failed")) {
		return false;
	}

	double angle = -1.0;
	cMathUtil::Vector_To_Angle(dx, dy, angle);
	if (!expect(near(angle, 0.0), "Vector_To_Angle failed")) {
		return false;
	}

	if (!expect(near(cMathUtil::Simple_Distance(0.0, 0.0, 3.0, 4.0), 5.0),
			"Simple_Distance failed")) {
		return false;
	}
	if (!expect(cMathUtil::Round(1.6) == 2 &&
			cMathUtil::Round(-1.6) == -2 &&
			cMathUtil::Round(0.00001) == 0,
			"Round failed")) {
		return false;
	}

	double vx = 1.0;
	double vy = 0.0;
	cMathUtil::Rotate_Vector(vx, vy, 90.0);
	if (!expect(near(vx, 0.0) && near(vy, 1.0), "Rotate_Vector failed")) {
		return false;
	}

	const double uniform = cMathUtil::Get_Uniform_Pdf_Double(2.0, 3.0);
	const int uniform_int = cMathUtil::Get_Uniform_Pdf_Int(4, 6);
	const double hat = cMathUtil::Get_Hat_Pdf_Double(10.0, 20.0);
	return expect(
		uniform >= 2.0 && uniform <= 3.0 &&
		uniform_int >= 4 && uniform_int <= 6 &&
		hat >= 10.0 && hat <= 20.0,
		"probability helper bounds failed");
}
}

int main()
{
	WWMath::Init();
	const bool ok = exercise_misc() && exercise_math();
	WWMath::Shutdown();
	if (!ok) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"WWUtil\","
		"\"compiled\":\"mathutil.cpp,miscutil.cpp plus WWLib verchk.cpp\","
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
