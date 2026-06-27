#pragma once

class GameMessage
{
public:
	enum Type
	{
		MSG_META_DEMO_INSTANT_QUIT = 1,
		MSG_LOGIC_CRC = 2,
	};
};

class MessageStream
{
public:
	GameMessage *appendMessage(GameMessage::Type) { return nullptr; }
};

extern MessageStream *TheMessageStream;
