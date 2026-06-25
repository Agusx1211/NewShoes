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
