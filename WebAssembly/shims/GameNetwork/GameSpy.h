#pragma once

#include "Common/AsciiString.h"
#include "Common/GameType.h"
#include "GameSpy/Peer/Peer.h"
#include "GameNetwork/GameSpy/PeerDefs.h"

class LegacyGameSpyChatInterface
{
public:
	virtual ~LegacyGameSpyChatInterface() {}
	virtual void reconnectProfile(void) = 0;
	virtual Bool isConnected(void) const = 0;
	virtual Int getCurrentGroupRoomID(void) const = 0;
	virtual PEER getPeer(void) const = 0;
	virtual AsciiString getLoginName(void) const = 0;
};

extern LegacyGameSpyChatInterface *TheGameSpyChat;
