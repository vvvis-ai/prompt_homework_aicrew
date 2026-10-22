// Uses an isolated PostgreSQL engine; never loads .env or touches remote data.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const db = new PGlite();
try {
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  await db.exec(await readFile("supabase/migrations/20260906124435_initial_schema.sql", "utf8"));
  await db.exec("insert into challenges(name,start_date,end_date,is_active) values ('Test','2026-01-01','2026-12-31',true); insert into participants(challenge_id,name,joined_at) values (1,'Test','2026-01-01'); insert into submissions(challenge_id,participant_id,url,normalized_url,edit_password_hash) values(1,1,'https://example.com/share/old','https://example.com/share/old','hash');");
  await db.exec(await readFile("supabase/migrations/20261022053003_html_submissions.sql", "utf8"));
  assert.equal((await db.query("select html_content from submissions where id=1")).rows[0].html_content, null);
  const insert = "insert into submissions(challenge_id,participant_id,url,normalized_url,edit_password_hash,html_file_name,html_content) values(1,1,'html:test','html:test','hash',$1,$2) returning id,submitted_at";
  for (const values of [["x.png", "<h1>hello</h1>"], ["x.html", null], [null, "<html></html>"], ["x.html", ""], ["x.html", "a".repeat(2097153)]]) {
    await assert.rejects(db.query(insert, values), /submissions_html_file_check/);
  }
  const { rows: [created] } = await db.query(insert, ["숙제.html", "<h1>안녕하세요</h1>"]);
  await db.query("update submissions set html_content='<h1>changed</h1>',html_file_name='new.html' where id=$1", [created.id]);
  assert.equal(new Date((await db.query("select submitted_at from submissions where id=$1", [created.id])).rows[0].submitted_at).getTime(), new Date(created.submitted_at).getTime());
  await assert.rejects(db.query("update submissions set submitted_at=now()+interval '1 day' where id=$1", [created.id]), /immutable/);
  await db.exec("set role anon");
  await assert.rejects(db.query("select html_content from public.submissions"), /permission denied/);
  await db.exec("reset role; set role authenticated");
  await assert.rejects(db.query("select html_content from public.submissions"), /permission denied/);
  await db.exec("reset role; set role service_role");
  assert.equal((await db.query("select html_file_name from submissions where id=$1", [created.id])).rows[0].html_file_name, "new.html");
  await db.query("delete from submissions where id=$1", [created.id]);
  assert.equal((await db.query("select id from submissions where id=$1", [created.id])).rows.length, 0);
  console.log("HTML database checks passed: migration compatibility, constraints, UTF-8, replacement, immutable time, browser roles, service role and atomic deletion.");
} finally { await db.close(); }
