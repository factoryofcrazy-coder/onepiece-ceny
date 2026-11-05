// Vytvorí tajné hodnoty pre súkromné správy. Spusti na vlastnom stroji: node scripts/dm-keys.mjs
// Výstup je tajný: daj ho priamo do Supabase Secrets, nekopíruj ho do repozitára ani do chatu.
import { createECDH, randomBytes } from "node:crypto";

const ecdh = createECDH("prime256v1");
ecdh.generateKeys();
console.log(`DM_KEYS=1:${randomBytes(32).toString("base64")}`);
console.log(`VAPID_PUBLIC=${ecdh.getPublicKey().toString("base64url")}`);
console.log(`VAPID_PRIVATE=${ecdh.getPrivateKey().toString("base64url")}`);
console.log("VAPID_SUBJECT=https://www.grand-line.eu");
