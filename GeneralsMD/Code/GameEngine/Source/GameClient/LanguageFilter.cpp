/*
**	Command & Conquer Generals Zero Hour(tm)
**	Copyright 2025 Electronic Arts Inc.
**
**	This program is free software: you can redistribute it and/or modify
**	it under the terms of the GNU General Public License as published by
**	the Free Software Foundation, either version 3 of the License, or
**	(at your option) any later version.
**
**	This program is distributed in the hope that it will be useful,
**	but WITHOUT ANY WARRANTY; without even the implied warranty of
**	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
**	GNU General Public License for more details.
**
**	You should have received a copy of the GNU General Public License
**	along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

////////////////////////////////////////////////////////////////////////////////
//																																						//
//  (c) 2001-2003 Electronic Arts Inc.																				//
//																																						//
////////////////////////////////////////////////////////////////////////////////


#include "PreRTS.h"	// This must go first in EVERY cpp file int the GameEngine

#include "GameClient/LanguageFilter.h"
#include "Common/FileSystem.h"
#include "Common/File.h"

#ifdef _INTERNAL
// for occasional debugging...
//#pragma optimize("", off)
//#pragma MESSAGE("************************************** WARNING, optimization disabled for debugging purposes")
#endif


LanguageFilter *TheLanguageFilter = NULL;

static Int getLanguageWordLength(const UnsignedShort *word)
{
	Int length = 0;
	while (word[length] != 0) {
		++length;
	}
	return length;
}

static void decodeLanguageWord(const UnsignedShort *encodedWord, WideChar *decodedWord, Int maxChars)
{
	if (maxChars <= 0) {
		return;
	}

	Int index = 0;
	for (; index < maxChars - 1 && encodedWord[index] != 0; ++index) {
		decodedWord[index] = (WideChar)(encodedWord[index] ^ LANGUAGE_XOR_KEY);
	}
	decodedWord[index] = 0;
}

LanguageFilter::LanguageFilter() 
{
	//Modified by Saad
	//Unnecessary
	//m_wordList.clear();
}

LanguageFilter::~LanguageFilter() {
	m_wordList.clear();
}

void LanguageFilter::init() {
	m_wordList.clear();

	// read in the file already.
	File *file1 = TheFileSystem->openFile(BadWordFileName, File::READ | File::BINARY);
	if (file1 == NULL) {
		return;
	}

	UnsignedShort encodedWord[128];
	WideChar word[128];
	while (readWord(file1, encodedWord, ELEMENTS_OF(encodedWord))) {
		Int wordLen = getLanguageWordLength(encodedWord);
		if (wordLen == 0) {
			continue;
		}
		decodeLanguageWord(encodedWord, word, ELEMENTS_OF(word));
		UnicodeString uniword(word);
		unHaxor(uniword);
		//DEBUG_LOG(("Just read %ls from the bad word file.  Entered as %ls\n", word, uniword.str()));
		m_wordList[uniword] = true;
	}

	file1->close();
	file1 = NULL;
}

void LanguageFilter::reset() {
	init();
}

void LanguageFilter::update() {
}

wchar_t ignoredChars[] = L"-_*'\"";

void LanguageFilter::filterLine(UnicodeString &line) 
{
	WideChar *buf = NEW WideChar[line.getLength()+1];
	wcscpy(buf, line.str());

	UnicodeString newLine(line);
	UnicodeString token(L"");

	while (newLine.nextToken(&token, UnicodeString(L" ;,.!?:=\\/><`~()&^%#\n\t"))) {
		wchar_t *pos = wcsstr(buf, token.str());
		if (pos == NULL) {
			DEBUG_CRASH(("Couldn't find the token in its own string."));
			continue;
		}

		Int len = token.getLength(); // need to get the length of the original word, not the unhaxor'd word.

		unHaxor(token);
		LangMapIter iter = m_wordList.find(token);
		if (iter != m_wordList.end()) {
			DEBUG_LOG(("Found word %ls in bad word list. Token was %ls\n", (*iter).first.str(), token.str()));
			for (Int i = 0; i < len; ++i) {
				*pos = L'*';
				++pos;
			}
		}
	}

	line.set(buf);
	delete[] buf;
}

void LanguageFilter::unHaxor(UnicodeString &word) {
	Int len = word.getLength();
	UnicodeString newWord(L"");
	for (Int i = 0; i < len; ++i) {
		wchar_t c = word.getCharAt(i);
		if ((c == L'p') || (c == L'P')) {
			if (((i + 1) < len) && ((word.getCharAt(i+1) == L'h') || (word.getCharAt(i+1) == L'H'))) {
				newWord.concat(L'f');
				++i; // skip the h
			} else {
				// not a problem at all.
				newWord.concat(c);
			}
		} else if (c == L'1') {
			newWord.concat(L'l');
		} else if (c == L'3') {
			newWord.concat(L'e');
		} else if (c == L'4') {
			newWord.concat(L'a');
		} else if (c == L'5') {
			newWord.concat(L's');
		} else if (c == L'6') {
			newWord.concat(L'b');
		} else if (c == L'7') {
			newWord.concat(L't');
		} else if (c == L'0') {
			newWord.concat(L'o');
		} else if (c == L'@') {
			newWord.concat(L'a');
		} else if (c == L'$') {
			newWord.concat(L's');
		} else if (c == L'+') {
			newWord.concat(L't');
		} else if (wcsrchr(ignoredChars, c) == NULL) {
			newWord.concat(c);
		}
	}
	word.set(newWord);
}

// returning true means that there are more words in the file.
Bool LanguageFilter::readWord(File *file1, UnsignedShort *buf, Int maxChars) {
	Int index = 0;
	Bool retval = TRUE;
	Int val = 0;

	UnsignedShort c;

	if ((file1 == NULL) || (buf == NULL) || (maxChars <= 0)) {
		return FALSE;
	}

	val = file1->read(&c, sizeof(UnsignedShort));
	if (val != sizeof(UnsignedShort)) {
		buf[index] = 0;
		return FALSE;
	}

	while (c != (UnsignedShort)L' ') {
		if (index < maxChars - 1) {
			buf[index++] = c;
		}
		val = file1->read(&c, sizeof(UnsignedShort));
		if (val != sizeof(UnsignedShort)) {
			retval = FALSE;
			break;
		}
	}
	buf[index] = 0;
	return retval;
}

LanguageFilter * createLanguageFilter() 
{
	return NEW LanguageFilter;
}
