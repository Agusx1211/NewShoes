#pragma once

typedef enum persisttype_t
{
	pd_private = 0,
	pd_public_ro,
	pd_public_rw
} persisttype_t;

typedef void (*PersistAuthCallback)(int, int, int, char *, void *);
typedef void (*GetPersistDataCallback)(int, int, persisttype_t, int, int, char *, int, void *);
typedef void (*SetPersistDataCallback)(int, int, persisttype_t, int, int, void *);

enum
{
	GE_NOERROR = 0,
	SNAP_FINAL = 1
};

static char gcd_gamename[32];
static char gcd_secret_key[32];

static inline int IsStatsConnected()
{
	return 0;
}

static inline int InitStatsConnection(int)
{
	return GE_NOERROR;
}

static inline void CloseStatsConnection() {}
static inline void PersistThink() {}

static inline char *GetChallenge(void *)
{
	static char challenge[1] = "";
	return challenge;
}

static inline void GenerateAuth(char *, char *, char *out)
{
	if (out != nullptr) {
		out[0] = '\0';
	}
}

static inline void PreAuthenticatePlayerPM(int localid, int profileid, char *, PersistAuthCallback callback, void *instance)
{
	if (callback != nullptr) {
		static char error[1] = "";
		callback(localid, profileid, 0, error, instance);
	}
}

static inline void PreAuthenticatePlayerCD(int localid, char *, char *, char *, PersistAuthCallback callback, void *instance)
{
	if (callback != nullptr) {
		static char error[1] = "";
		callback(localid, 0, 0, error, instance);
	}
}

static inline void GetPersistDataValues(int localid, int profileid, persisttype_t type, int index, char *, GetPersistDataCallback callback, void *instance)
{
	if (callback != nullptr) {
		static char data[1] = "";
		callback(localid, profileid, type, index, 0, data, 0, instance);
	}
}

static inline void SetPersistDataValues(int localid, int profileid, persisttype_t type, int index, char *, SetPersistDataCallback callback, void *instance)
{
	if (callback != nullptr) {
		callback(localid, profileid, type, index, 0, instance);
	}
}

static inline void NewGame(void *) {}
static inline int SendGameSnapShot(void *, const char *, int) { return GE_NOERROR; }
static inline void FreeGame(void *) {}
