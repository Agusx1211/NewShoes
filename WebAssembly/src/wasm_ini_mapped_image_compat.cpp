#include "wasm_prerts_real.h"

#include "Common/INI.h"
#include "GameClient/Image.h"

#ifndef CNC_PORT_LINKS_REAL_INI_COMPAT_OWNERS
void __attribute__((weak)) INI::parseMappedImage(INI *ini, void *, void *store, const void *)
{
	const char *token = ini != nullptr ? ini->getNextToken() : nullptr;
	if (store != nullptr && TheMappedImageCollection != nullptr) {
		typedef const Image *ConstImagePtr;
		*static_cast<ConstImagePtr *>(store) =
			TheMappedImageCollection->findImageByName(AsciiString(token));
	}
}
#endif
