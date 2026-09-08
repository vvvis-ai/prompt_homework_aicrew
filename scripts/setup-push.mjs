// One-time setup. Generates keys in memory and passes them to Wrangler over stdin.
// Existing key pairs are preserved; no secret values are printed or written to disk.
import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";

const cli = "node_modules/wrangler/bin/wrangler.js";
const listed = spawnSync(process.execPath, [cli, "secret", "list", "--format", "json", "--config", "wrangler.jsonc"], { encoding: "utf8" });
if (listed.status !== 0) throw new Error("Unable to list Worker secrets. Check Wrangler authentication.");
const secrets = JSON.parse(listed.stdout);
const names = new Set(secrets.map((item) => item.name));
const present = ["VAPID_PRIVATE_JWK", "VAPID_PUBLIC_KEY"].filter((name) => names.has(name));
if (present.length === 2) {
  console.log("Existing push key pair preserved.");
} else {
  if (present.length) throw new Error("Incomplete existing key pair; refusing to replace it automatically.");
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = publicKey.export({ format: "jwk" });
  const publicValue = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]).toString("base64url");
  const input = JSON.stringify({ VAPID_PRIVATE_JWK: JSON.stringify(privateKey.export({ format: "jwk" })), VAPID_PUBLIC_KEY: publicValue });
  const result = spawnSync(process.execPath, [cli, "secret", "bulk", "--config", "wrangler.jsonc"], { input, encoding: "utf8" });
  if (result.status !== 0) throw new Error("Push key installation failed. Secret values were not logged.");
  console.log("Push key pair installed securely.");
}
