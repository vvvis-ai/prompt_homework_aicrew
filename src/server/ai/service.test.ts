import { beforeEach,afterEach,describe,it,expect,vi } from "vitest";
vi.mock("server-only",()=>({}));
import * as store from "./store";
import { action,mutate,privacyGate,snapshot } from "./service";
import { prepare,run,generationSchema } from "./generation";
import { expiry } from "@/lib/ai/domain";
beforeEach(()=>{vi.stubEnv("AI_PREVIEW","true");store.resetPreview();});
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers();});
const id=1;
async function seed(){
 const state=await store.load(id);const card={id:crypto.randomUUID(),title:"초안",prompt:"업무를 정리해주세요",fields:["업무 정리" as const],purpose:"p"};
 state.state.recommendations.push({id:crypto.randomUUID(),createdAt:new Date().toISOString(),expiresAt:expiry(new Date().toISOString()),cards:[card]});
 await store.write(id,state.version,state.state);return card;
}
describe("AI requests",()=>{
 it("rejects concurrent requests and replays the same request without another claim",async()=>{
  await store.load(id);const requestId=crypto.randomUUID();await store.begin(id,requestId,"chat");
  expect((await store.begin(id,requestId,"chat")).replay).toBe(true);
  await expect(store.begin(id,crypto.randomUUID(),"recommend")).rejects.toMatchObject({code:"BUSY"});
 });
 it("counts only success and cannot commit a cancelled request",async()=>{
  const state=await store.load(id),req=crypto.randomUUID();await store.begin(id,req,"chat");await store.cancel(id,req);
  await expect(store.write(id,state.version,state.state,req,crypto.randomUUID())).rejects.toMatchObject({code:"CANCELLED"});
  expect((await store.requests(id)).filter(r=>r.status==="success")).toHaveLength(0);
 });
 it("charges once and enforces personal limit, then resets at midnight KST",async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-19T14:59:00Z"));
  await store.configure(1,{enabled:true,chatLimit:1,recommendLimit:3,minuteCap:5,dailyCap:100});
  const loaded=await store.load(id),req=crypto.randomUUID();await store.begin(id,req,"chat");await store.write(id,loaded.version,loaded.state,req,crypto.randomUUID());
  await store.cancel(id,req);expect((await store.requests(id))[0].status).toBe("success");
  await expect(store.begin(id,crypto.randomUUID(),"chat")).rejects.toMatchObject({code:"PERSONAL_LIMIT"});
  vi.setSystemTime(new Date("2026-10-19T15:00:00Z"));await expect(store.begin(id,crypto.randomUUID(),"chat")).resolves.toMatchObject({status:"running"});
 });
 it("applies a global minute cap across participants and counts attempts",async()=>{
  await store.configure(1,{enabled:true,chatLimit:5,recommendLimit:3,minuteCap:1,dailyCap:100});
  const a=crypto.randomUUID(),b=crypto.randomUUID();await store.begin(1,a,"chat");await store.begin(2,b,"chat");await store.attempt(1,a);
  await expect(store.attempt(2,b)).rejects.toMatchObject({code:"GLOBAL_MINUTE_LIMIT"});
  expect((await store.statistics()).success).toBe(0);
 });
 it("persists a completed streamed response and restores it on a new snapshot",async()=>{
  const input=generationSchema.parse({requestId:crypto.randomUUID(),kind:"chat",text:"정리 프롬프트를 만들어줘"});
  const prepared=await prepare(id,input),chunks:string[]=[];await run(id,input,prepared,s=>chunks.push(s));
  const restored=await snapshot(id);expect(chunks.length).toBeGreaterThan(1);expect(restored.state.rooms[0].messages).toHaveLength(2);expect(restored.requests[0].status).toBe("success");
 });
});
describe("AI document writes",()=>{
 it("requires explicit choice after a draft revision conflict",async()=>{
  const card=await seed();
  await action(id,{action:"draft",cardId:card.id,text:"기기 A 수정",expectedVersion:0});
  await expect(action(id,{action:"draft",cardId:card.id,text:"기기 B 수정",expectedVersion:0})).rejects.toMatchObject({code:"DRAFT_CONFLICT"});
  await action(id,{action:"draft",cardId:card.id,text:"선택한 수정",expectedVersion:1});
  expect((await snapshot(id)).state.drafts[0].text).toBe("선택한 수정");
 });
 it("requires confirmation and a current saved revision before overwriting",async()=>{
  const card=await seed();await action(id,{action:"save",cardId:card.id,title:"제목",text:"저장 내용",fields:["업무 정리"]});
  const saved=(await snapshot(id)).state.saved[0];
  await expect(action(id,{action:"save",cardId:card.id,title:"제목",text:"다른 내용",fields:["업무 정리"],updateId:saved.id,expectedVersion:1})).rejects.toMatchObject({code:"CONFIRM_REQUIRED"});
  await action(id,{action:"save",cardId:card.id,title:"제목",text:"다른 내용",fields:["업무 정리"],updateId:saved.id,expectedVersion:1,confirm:true});
  await expect(action(id,{action:"save",cardId:card.id,title:"제목",text:"오래된 수정",fields:["업무 정리"],updateId:saved.id,expectedVersion:1,confirm:true})).rejects.toMatchObject({code:"SAVED_CONFLICT"});
 });
 it("enforces library capacity and does not persist blocked PII",async()=>{
  const card=await seed();await mutate(id,state=>{state.saved=Array.from({length:100},()=>({...card,id:crypto.randomUUID(),version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}));});
  await expect(action(id,{action:"save",cardId:card.id,title:"새 항목",text:"내용",fields:["학습"]})).rejects.toMatchObject({code:"LIBRARY_FULL"});
  await expect(action(id,{action:"draft",cardId:card.id,text:"주민번호 900101-1234567",expectedVersion:0,privacyAcknowledged:true})).rejects.toMatchObject({code:"PRIVACY_BLOCK"});
  expect((await snapshot(id)).state.drafts).toEqual([]);
 });
 it("warns on ordinary PII but acknowledgements cannot bypass high-risk blocking",()=>{
  expect(()=>privacyGate("test@example.com")).toThrow();expect(()=>privacyGate("test@example.com",true)).not.toThrow();
  expect(()=>privacyGate("password=very-secret",true)).toThrow();
 });
});


describe("AI context privacy",()=>{
 it("checks raw multiline history and sends only manually anonymized context",async()=>{
  const now=new Date().toISOString(),roomId=crypto.randomUUID();
  await mutate(id,state=>{state.rooms.push({id:roomId,title:"테스트",updatedAt:now,messages:[{id:crypto.randomUUID(),role:"user",text:"회의 준비\n이름: 홍길동",cards:[],suggestions:[],createdAt:now,expiresAt:expiry(now)}],summaries:[]});});
  const input=generationSchema.parse({requestId:crypto.randomUUID(),kind:"chat",roomId,text:"계속 다듬어주세요"});
  await expect(prepare(id,input)).rejects.toMatchObject({code:"PRIVACY_WARNING"});
  const prepared=await prepare(id,{...input,anonymizeContext:true});
  expect(prepared.payload).not.toContain("홍길동");
  expect((await snapshot(id)).state.rooms[0].messages[0].text).toContain("홍길동");
  await store.cancel(id,input.requestId);
 });
});
