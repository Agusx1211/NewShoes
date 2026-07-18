import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const weaponPath = path.join(
  root,
  "GeneralsMD/Code/GameEngine/Source/GameLogic/Object/Weapon.cpp",
);
const source = fs.readFileSync(weaponPath, "utf8");

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function shouldDestroyFallback(foundInterface, isMine, isBoobyTrap, isDemoTrap) {
  return !foundInterface && (isMine || isBoobyTrap || isDemoTrap);
}

for (const foundInterface of [false, true]) {
  for (let kindMask = 0; kindMask < 8; ++kindMask) {
    const actual = shouldDestroyFallback(
      foundInterface,
      Boolean(kindMask & 1),
      Boolean(kindMask & 2),
      Boolean(kindMask & 4),
    );
    const expected = !foundInterface && kindMask !== 0;
    expect(actual === expected, "disarm fallback truth table changed");
  }
}

const interfaceLookup = source.indexOf("LandMineInterface* lmi");
expect(interfaceLookup >= 0, "Weapon LandMineInterface lookup is missing");
const caseStart = source.lastIndexOf("case DAMAGE_DISARM:", interfaceLookup);
expect(caseStart >= 0, "Weapon DAMAGE_DISARM case is missing");
const caseEnd = source.indexOf("--m_maxShotCount;", interfaceLookup);
expect(caseEnd > caseStart, "Weapon DAMAGE_DISARM case boundary is missing");
const disarmCase = source.slice(caseStart, caseEnd);

expect(
  /lmi->disarm\(\);\s*found = true;/s.test(disarmCase),
  "LandMineInterface success must be recorded before the fallback",
);
expect(
  /if\s*\(\s*!found\s*&&\s*\(\s*victimObj->isKindOf\(\s*KINDOF_MINE\s*\)\s*\|\|\s*victimObj->isKindOf\(\s*KINDOF_BOOBY_TRAP\s*\)\s*\|\|\s*victimObj->isKindOf\(\s*KINDOF_DEMOTRAP\s*\)\s*\)\s*\)\s*\{[\s\S]*?TheGameLogic->destroyObject\(\s*victimObj\s*\);/s.test(
    disarmCase,
  ),
  "fallback destruction must require a missing interface for every trap kind",
);

console.log("weapon disarm fallback contract verified");
