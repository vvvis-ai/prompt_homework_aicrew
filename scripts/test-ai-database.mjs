// An isolated PostgreSQL engine: never reads .env or connects to a remote database.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db=new PGlite();
let checks=0;
const check=(value)=>{assert.ok(value);checks++;};
const query=(sql,params=[])=>db.query(sql,params);
const scalar=async(sql,params=[])=>Object.values((await query(sql,params)).rows[0])[0];
async function rejects(sql,pattern,params=[]){await assert.rejects(()=>query(sql,params),pattern);checks++;}
try{
 await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create table public.participants(id bigint primary key,is_active boolean); create table public.operators(id bigint primary key,is_active boolean); insert into participants values(1,true),(2,true),(3,false); insert into operators values(1,true),(2,false); grant select on participants,operators to service_role;");
 await db.exec(await readFile(new URL("../supabase/migrations/20261019065739_personal_ai_assistant.sql",import.meta.url),"utf8"));
 for(const role of ["anon","authenticated"]){
  await db.exec("set role "+role);
  await rejects("select document from public.ai_states",/permission denied/);
  await rejects("select public.ai_begin(1,gen_random_uuid(),'chat')",/permission denied/);
  await rejects("select public.ai_configure(1,'{}')",/permission denied/);
  await db.exec("reset role");
 }
 await db.exec("set role service_role");
 const first=crypto.randomUUID();
 const begin=await scalar("select ai_begin(1,$1,'chat')",[first]);check(begin.status==="running");
 check((await scalar("select ai_begin(1,$1,'chat')",[first])).replay===true);
 await rejects("select ai_begin(1,gen_random_uuid(),'recommend')",/BUSY/);
 await rejects("select ai_begin(2,$1,'chat')",/REQUEST_CONFLICT/,[first]);
 await rejects("select ai_begin(3,gen_random_uuid(),'chat')",/PARTICIPANT/);
 await query("update ai_settings set minute_cap=1");
 await query("select ai_attempt(1,$1)",[first]);
 const second=crypto.randomUUID();await query("select ai_begin(2,$1,'chat')",[second]);
 await rejects("select ai_attempt(2,$1)",/GLOBAL_MINUTE_LIMIT/,[second]);
 check(Number(await scalar("select count(*) from ai_calls"))===1);
 let state=await scalar("select document from ai_states where participant_id=1");
 await query("select ai_cancel(1,$1,'cancelled')",[first]);
 await rejects("select ai_write(1,0,$1,$2,gen_random_uuid())",/CANCELLED/,[JSON.stringify(state),first]);
 check(Number(await scalar("select count(*) from ai_requests where status='success'"))===0);
 const third=crypto.randomUUID();await query("select ai_begin(1,$1,'chat')",[third]);
 await query("select ai_write(1,0,$1,$2,gen_random_uuid())",[JSON.stringify(state),third]);
 await query("select ai_cancel(1,$1,'cancelled')",[third]);
 check(await scalar("select status from ai_requests where id=$1",[third])==="success");
 await rejects("select ai_write(1,0,$1)",/VERSION_CONFLICT/,[JSON.stringify(state)]);
 await query("update ai_settings set chat_limit=1");
 await rejects("select ai_begin(1,gen_random_uuid(),'chat')",/PERSONAL_LIMIT/);
 await query("update ai_requests set day=day-1 where id=$1",[third]);
 await query("select ai_begin(1,gen_random_uuid(),'chat')");
 state.saved=Array.from({length:101},(_,i)=>({id:String(i)}));
 await rejects("select ai_write(1,1,$1)",/LIBRARY_FULL/,[JSON.stringify(state)]);
 const expired=new Date(Date.now()-1000).toISOString(),future=new Date(Date.now()+100000).toISOString();
 state.rooms=[{id:"room",title:"must disappear",messages:[{id:"old",text:"must disappear",expiresAt:expired},{id:"live",text:"remain",expiresAt:future}],summaries:[{sources:["old","live"],text:"must disappear",expiresAt:future},{sources:["live"],text:"remain",expiresAt:future}]}];
 state.saved=[{id:"saved",prompt:"kept"}];state.drafts=[{text:"must disappear",expiresAt:expired}];
 state.recommendations=[{expiresAt:expired}];state.purposes=[{key:"old",at:new Date(Date.now()-31*86400000).toISOString()}];
 const pruned=await scalar("select ai_prune($1,now())",[JSON.stringify(state)]);
 check(!JSON.stringify(pruned).includes("must disappear"));check(pruned.saved.length===1);check(pruned.purposes.length===0);check(pruned.recommendations.length===0);
 await query("update ai_states set document=$1 where participant_id=1",[JSON.stringify(state)]);
 await query("select ai_cleanup()");
 check(!(await scalar("select document::text from ai_states where participant_id=1")).includes("must disappear"));
 const stats=await scalar("select ai_statistics()");
 check(stats.success===1&&stats.calls===1);check(Object.keys(stats).sort().join()==="calls,requests,success");
 await rejects("select ai_configure(2,$1)",/UNAUTHORIZED/,[JSON.stringify({enabled:true,recommendLimit:3,chatLimit:5,dailyCap:100,minuteCap:5})]);
 await query("select ai_configure(1,$1)",[JSON.stringify({enabled:false,recommendLimit:3,chatLimit:5,dailyCap:100,minuteCap:5})]);
 check(Number(await scalar("select count(*) from ai_settings_audit"))===1);
 await rejects("select ai_begin(1,gen_random_uuid(),'chat')",/AI_DISABLED/);
 console.log("AI PostgreSQL checks passed: "+checks+" (isolated PGlite; no remote database)");
}catch(error){console.error("SQL test failed:",error.message,"position:",error.position??"", "detail:",error.detail??"");process.exitCode=1;}finally{await db.close();}
