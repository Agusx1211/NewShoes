#include <cstddef>

#include "PreRTS.h"

#include "Common/INI.h"

namespace {

class INILayoutProbe final : public INI
{
public:
	static std::size_t offsetOfSeps()
	{
		INILayoutProbe ini;
		return memberOffset(ini, ini.m_seps);
	}

	static std::size_t offsetOfSepsPercent()
	{
		INILayoutProbe ini;
		return memberOffset(ini, ini.m_sepsPercent);
	}

	static std::size_t offsetOfSepsColon()
	{
		INILayoutProbe ini;
		return memberOffset(ini, ini.m_sepsColon);
	}

	static std::size_t offsetOfSepsQuote()
	{
		INILayoutProbe ini;
		return memberOffset(ini, ini.m_sepsQuote);
	}

private:
	static std::size_t memberOffset(const INILayoutProbe &ini, const char *const &member)
	{
		const auto *base = reinterpret_cast<const unsigned char *>(static_cast<const INI *>(&ini));
		const auto *field = reinterpret_cast<const unsigned char *>(&member);
		return static_cast<std::size_t>(field - base);
	}
};

} // namespace

extern "C" std::size_t cnc_port_real_ini_runtime_sizeof_ini()
{
	return sizeof(INI);
}

extern "C" std::size_t cnc_port_real_ini_runtime_offset_m_seps()
{
	return INILayoutProbe::offsetOfSeps();
}

extern "C" std::size_t cnc_port_real_ini_runtime_offset_m_seps_percent()
{
	return INILayoutProbe::offsetOfSepsPercent();
}

extern "C" std::size_t cnc_port_real_ini_runtime_offset_m_seps_colon()
{
	return INILayoutProbe::offsetOfSepsColon();
}

extern "C" std::size_t cnc_port_real_ini_runtime_offset_m_seps_quote()
{
	return INILayoutProbe::offsetOfSepsQuote();
}

extern "C" const char *cnc_port_real_ini_runtime_seps()
{
	static INILayoutProbe ini;
	return ini.getSeps();
}

extern "C" const char *cnc_port_real_ini_runtime_seps_percent()
{
	static INILayoutProbe ini;
	return ini.getSepsPercent();
}

extern "C" const char *cnc_port_real_ini_runtime_seps_colon()
{
	static INILayoutProbe ini;
	return ini.getSepsColon();
}

extern "C" const char *cnc_port_real_ini_runtime_seps_quote()
{
	static INILayoutProbe ini;
	return ini.getSepsQuote();
}
