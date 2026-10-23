// Isolated PostgreSQL only: never reads credentials or changes production data.
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";

const db = new PGlite();
try {
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  for (const file of (await readdir("supabase/migrations")).filter((name) => name.endsWith(".sql")).sort()) {
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  }
  const snapshot = async () => (await db.query("select * from dashboard_snapshot")).rows[0];
  const warm = async () => {
    await db.exec("update dashboard_snapshot set payload='{\"count\":1}',format_version=1,valid_until=now()+interval '1 hour',built_at=now()");
    return snapshot();
  };
  for (const table of ["challenges", "participants", "submissions", "exemptions", "excluded_dates", "notices", "penalty_rates"]) {
    const before = await warm();
    await db.exec(`update ${table} set created_at=created_at where false`);
    const after = await snapshot();
    assert.notEqual(after.revision, before.revision, `${table} invalidates the snapshot`);
    assert.equal(after.payload, null);
    assert.equal(after.valid_until, null);
    const stale = await db.query("update dashboard_snapshot set payload='{}' where revision=$1 returning id", [before.revision]);
    assert.equal(stale.rows.length, 0, "a stale build cannot be published");
  }
  await db.exec("insert into challenges(name,start_date,end_date,penalty_start_date,is_active) values ('Cache test','2026-01-01','2026-12-31','2026-01-01',true); insert into participants(challenge_id,name,joined_at) values(1,'Test','2026-01-01');");
  for (const sql of [
    "insert into submissions(challenge_id,participant_id,url,normalized_url,edit_password_hash) values(1,1,'https://example.com/test','https://example.com/test','hash')",
    "update submissions set title='Edited' where id=1",
    "delete from submissions where id=1",
  ]) {
    const before = await warm();
    await db.exec(`set role service_role; ${sql}; reset role;`);
    assert.notEqual((await snapshot()).revision, before.revision);
    assert.equal((await snapshot()).payload, null);
  }
  const beforeRollback = await warm();
  await db.exec("begin; update participants set name='Rolled back' where id=1; rollback;");
  assert.equal((await snapshot()).revision, beforeRollback.revision);
  assert.deepEqual((await snapshot()).payload, beforeRollback.payload);
  // Test the table/function ACLs even if an installation grants schema usage.
  await db.exec("grant usage on schema public to anon, authenticated");
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query("select * from dashboard_snapshot"), /permission denied/);
    await assert.rejects(db.query("update dashboard_snapshot set payload='{}'"), /permission denied/);
    await assert.rejects(db.query("select invalidate_dashboard_snapshot()"), /permission denied/);
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  assert.equal((await db.query("select id from dashboard_snapshot")).rows.length, 1);
  await db.exec("update dashboard_snapshot set payload='{}'; reset role");
  assert.equal((await db.query("select count(*)::int as count from dashboard_snapshot")).rows[0].count, 1);
  console.log("Dashboard SQL passed: all migrations, seven source triggers, real insert/update/delete, stale-write rejection, rollback, role permissions and a single bounded snapshot.");
} catch (error) {
  console.error(error.message, error.query ?? "");
  process.exitCode = 1;
} finally { await db.close(); }
