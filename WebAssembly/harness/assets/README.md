# Launcher UI assets

The files in this directory are launcher and browser-desktop artwork. They are
not extracted from Generals or Zero Hour retail media and are not part of the
runtime BIG archive inventory.

| Group | Origin recorded in this repository |
|---|---|
| `brand/project-new-shoes-*` | Project New Shoes identity created for this port |
| `launcher-logo.webp` | runtime copy of the Project New Shoes mark |
| `zeroh-command-desert.webp` | project-owned launcher artwork; ownership confirmed by the project owner on 2026-07-11 (generation details are not recorded) |
| `zeroh-{bliss-at-war,autumn-offensive,azul-armada,red-moon-front}-*` | project-owned desktop wallpapers and swatches created for the launcher |

The directory contains 16 binary UI files: six brand/icon variants, one runtime
logo, `zeroh-command-desert.webp`, and four full-size wallpaper/swatch pairs.
Twenty unused launcher-concept logo candidates were removed before publication.
The corresponding commits and `DONE.md` describe the retained files as
project-owned UI art.

The code-native `#i-github` symbol in `play.html` is the official
`mark-github-24` path from [Primer Octicons](https://github.com/primer/octicons/blob/main/icons/mark-github-24.svg),
copyright GitHub Inc. It is used only to identify the repository shortcut and
is distributed under the Octicons MIT license copied at
`../vendor/primer-octicons-LICENSE.txt`. Its inclusion does not imply GitHub
endorsement.

Do not add screenshots, extracted textures, faction art, maps, audio, videos, or
other retail game material here. New binary artwork must include an origin and
redistribution note in this file. If an image is adapted from a third-party
source, record the source URL, author, license, and required attribution before
committing it.
