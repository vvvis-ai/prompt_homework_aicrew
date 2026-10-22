// Local-only browser verification backend. Real application routes and an
// isolated PostgreSQL database; no remote credentials or services are used.
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { hash, compare } from "bcryptjs";

const db = new PGlite({ parsers: { 1082: value => value } });
await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
for (const file of (await readdir("supabase/migrations")).filter(x => x.endsWith(".sql")).sort()) {
  await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
}
await db.exec("insert into challenges(name,start_date,end_date,penalty_start_date,is_active) values ('HTML 검증 기수',current_date-30,current_date+90,current_date-30,true); insert into participants(challenge_id,name,joined_at) values(1,'검증 참가자',current_date-30); insert into operators(name) values('검증 운영자');");
const identifier = value => { if (!/^[a-z_][a-z_0-9]*$/.test(value)) throw Error("Invalid identifier"); return `"${value}"`; };
const api = createServer(async (req, res) => {
  const reply = (status, value) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); };
  try {
    const url = new URL(req.url, "http://127.0.0.1:3198");
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    if (url.pathname === "/functions/v1/password-crypto") {
      reply(200, body.operation === "hash" ? { hash: await hash(body.password, 12) } : { valid: await compare(body.password, body.encoded) }); return;
    }
    if (!url.pathname.startsWith("/rest/v1/")) { reply(404, {}); return; }
    const table = identifier(url.pathname.slice("/rest/v1/".length));
    const values = [], conditions = [];
    for (const [key, value] of url.searchParams) {
      if (["select", "order", "limit", "offset"].includes(key)) continue;
      const dot = value.indexOf("."), op = value.slice(0, dot), operand = value.slice(dot + 1);
      if (op === "is" && operand === "null") conditions.push(`${identifier(key)} is null`);
      else if (op === "in") { const list = operand.slice(1, -1).split(","); conditions.push(`${identifier(key)} in (${list.map(v => { values.push(v); return `$${values.length}`; }).join(",")})`); }
      else { const ops = { eq: "=", gte: ">=", lte: "<=", gt: ">", lt: "<" }; if (!ops[op]) throw Error("Unsupported filter"); values.push(operand === "true" ? true : operand === "false" ? false : operand); conditions.push(`${identifier(key)} ${ops[op]} $${values.length}`); }
    }
    const where = conditions.length ? ` where ${conditions.join(" and ")}` : "";
    const selected = url.searchParams.get("select")?.split(",").map(identifier).join(",") ?? "*";
    let sql;
    if (req.method === "POST") {
      const keys = Object.keys(body); values.length = 0;
      sql = `insert into ${table} (${keys.map(identifier).join(",")}) values (${keys.map(key => { values.push(body[key]); return `$${values.length}`; }).join(",")}) returning ${selected}`;
    } else if (req.method === "PATCH") {
      const sets = Object.entries(body).map(([key, value]) => { values.push(value); return `${identifier(key)}=$${values.length}`; });
      sql = `update ${table} set ${sets.join(",")}${where} returning ${selected}`;
    } else if (req.method === "DELETE") sql = `delete from ${table}${where} returning id`;
    else {
      const order = url.searchParams.get("order")?.split(",").map(x => { const [key, dir] = x.split("."); return `${identifier(key)} ${dir === "desc" ? "desc" : "asc"}`; }).join(",");
      sql = `select ${selected} from ${table}${where}${order ? ` order by ${order}` : ""}`;
      for (const name of ["limit", "offset"]) { const n = url.searchParams.get(name); if (n && /^\d+$/.test(n)) sql += ` ${name} ${n}`; }
    }
    const { rows } = await db.query(sql, values);
    const result = rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value])));
    reply(200, String(req.headers.accept).includes("vnd.pgrst.object") ? result[0] ?? null : result);
  } catch (error) { console.error("Local verification API:", error.message); reply(400, { message: error.message, code: error.code }); }
});
await new Promise(resolve => api.listen(3198, "127.0.0.1", resolve));
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3100"], {
  stdio: "inherit", env: { ...process.env, DEMO_MODE: "false", SUPABASE_URL: "http://127.0.0.1:3198", SUPABASE_SECRET_KEY: "local-verification-only", GEMINI_API_KEY: "", ADMIN_PASSWORD_PBKDF2: "", ADMIN_PASSWORD_HASH: "", ADMIN_PASSWORD: "html-review-only", ADMIN_SESSION_SECRET: "local-html-review-secret-never-for-production" },
});
console.log("HTML verification: http://127.0.0.1:3100 (isolated local DB; admin password: html-review-only)");
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", async code => { api.close(); await db.close(); process.exit(code ?? 0); });
