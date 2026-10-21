// Všetky skripty efektov podľa herného kódu karty.
import type { Script } from "../dsl";
import { META_A } from "./metaA";
import { META_B } from "./metaB";
import { META_C } from "./metaC";
import { META_D } from "./metaD";
import { STARTER } from "./starter";

export const SCRIPTS: Record<string, Script> = { ...STARTER, ...META_A, ...META_B, ...META_C, ...META_D };
