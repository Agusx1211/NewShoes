# Launcher ownership and local presentation

Verified on 2026-07-11.

## Official purchase links

- Steam: <https://store.steampowered.com/bundle/39394/Command__Conquer_The_Ultimate_Collection/>
- Electronic Arts: <https://www.ea.com/games/command-and-conquer/command-and-conquer-the-ultimate-collection>

Both primary store pages list Command & Conquer: Generals and Zero Hour as part
of The Ultimate Collection. The launcher links directly to both pages. It does
not link to key resellers, archive downloads, or instructions for bypassing
copy protection.

The browser OS shutdown fallback points to the public upstream source
repository at <https://github.com/electronicarts/CnC_Generals_Zero_Hour>. The
URL was verified through the repository remote and a public Git fetch on the
same date.

## Ownership flow

The current media contract is English only and requires the complete Generals
base archive set together with the Zero Hour expansion archives. Online owners
select the Zero Hour installation root exposed by Steam or the EA app. Disc
owners select Generals Disc 1 and 2 plus Zero Hour Disc 1 and 2 together; the
existing selected-media UI remains responsible for review and removal.

The launcher reads and validates the source locally. Temporary mode stages the
required archives for the session and does not add a persistent presentation
cache. Remember mode stores browser file-system handles when supported and may
cache the derived image. Install mode copies the required archives into private
OPFS storage and may cache the derived image. None of these paths uploads the
source or derived presentation.

## Retail presentation boundary

After a library validates, the launcher looks in the prepared user-owned
`EnglishZH.big` for `Data\English\Install_Final.bmp`. It reads only the BIG
directory and that entry, validates a bounded BMP header, and presents the
result as a browser Blob URL. The derived BMP Blob may be cached in IndexedDB;
the cache key covers the prepared archive names, sizes, and entry counts, and a
new manifest replaces the old derived entry. Forgetting the library clears it.

No retail art is written to the repository or served by the project. Before a
valid library exists, after a cache miss, or when the retail image is missing
or unsupported, the project-owned launcher artwork remains visible.
