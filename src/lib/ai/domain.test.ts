import { describe,it,expect } from "vitest";
import { emptyState,type Card,type Room } from "./types";
import { expiry,prune,summarize,remainingReset,applyFeedback,recommendationFields } from "./domain";
import { inspectPrivacy,anonymize } from "./privacy";
import { choosePurposes } from "./recommendations";
const now="2026-10-19T15:00:00.000Z";
const card:Card={id:"one",title:"정리",prompt:"정리해주세요",fields:["업무 정리"],purpose:"one"};
describe("AI retention and context",()=>{
 it("expires each message and invalidates every dependent summary without deleting saved cards",()=>{
  const state=emptyState(),old="2026-10-12T14:59:59.999Z";
  const room:Room={id:"room",title:"사라져야 함",updatedAt:now,messages:[
   {id:"old",role:"user",text:"사라져야 함",cards:[],suggestions:[],createdAt:old,expiresAt:expiry(old)},
   {id:"live",role:"assistant",text:"남아 있음",cards:[],suggestions:[],createdAt:now,expiresAt:expiry(now)}
  ],summaries:[]};
  summarize(room,now);state.rooms=[room];state.saved=[{...card,createdAt:old,updatedAt:old,version:1}];
  const cleaned=prune(state,now);
  expect(cleaned.rooms[0].messages.map(m=>m.id)).toEqual(["live"]);
  expect(JSON.stringify(cleaned.rooms[0])).not.toContain("사라져야 함");
  expect(cleaned.saved).toHaveLength(1);
 });
 it("removes empty rooms and exactly-seven-day drafts",()=>{
  const state=emptyState();state.rooms=[{id:"r",title:"r",updatedAt:now,messages:[],summaries:[]}];
  state.drafts=[{cardId:"x",text:"초안",version:1,createdAt:"2026-10-12T15:00:00.000Z",expiresAt:now}];
  expect(prune(state,now).rooms).toEqual([]);expect(prune(state,now).drafts).toEqual([]);
 });
 it("does not extend an unchanged summary lifetime",()=>{
  const room:Room={id:"r",title:"r",updatedAt:now,messages:[{id:"m",role:"user",text:"x",cards:[],suggestions:[],createdAt:now,expiresAt:expiry(now)}],summaries:[]};
  summarize(room,now);summarize(room,"2026-10-20T15:00:00.000Z");expect(room.summaries[0].createdAt).toBe(now);
 });
 it("uses midnight KST rather than UTC",()=>{expect(remainingReset("2026-10-19T14:59:59.000Z")).toBe(now);expect(remainingReset(now)).toBe("2026-10-20T15:00:00.000Z");});
});
describe("AI personalization",()=>{
 it("uses idempotent feedback and honors negative choices",()=>{
  const state=emptyState();applyFeedback(state,card,"used");applyFeedback(state,card,"used");expect(state.scores["업무 정리"]).toBe(3);
  applyFeedback(state,card,"saved");expect(state.scores["업무 정리"]).toBe(3);
  applyFeedback(state,card,"dislike");expect(state.scores["업무 정리"]).toBe(-3);
 });
 it("rotates exploration and never uses excluded fields",()=>{
  const state=emptyState();state.interests=["문서 작성","업무 정리"];state.excluded=["창작"];
  const first=recommendationFields(state);state.exploration++;const second=recommendationFields(state);
  expect(first.slice(0,2)).toEqual(["문서 작성","업무 정리"]);expect(first).not.toContain("창작");expect(first[2]).not.toBe(second[2]);
 });
 it("does not repeat a purpose across 30 days of three batches per day",()=>{
  const state=emptyState();const seen=new Set<string>();
  for(let i=0;i<90;i++){const chosen=choosePurposes(state);for(const p of chosen){expect(seen.has(p.key)).toBe(false);seen.add(p.key);state.purposes.push({key:p.key,at:now});}state.exploration++;}
  expect(seen.size).toBe(270);
 });
});
describe("AI privacy checks",()=>{
 it("blocks high-risk IDs and credentials and marks exact warning locations",()=>{
  expect(inspectPrivacy("번호 900101-1234567")[0].risk).toBe("high");
  expect(inspectPrivacy("password=top-secret-value")[0].risk).toBe("high");
  const text="문의: test@example.com";const f=inspectPrivacy(text)[0];expect(text.slice(f.start,f.end)).toBe("test@example.com");expect(f.risk).toBe("warning");
  expect(inspectPrivacy(anonymize(text))).toEqual([]);
 });
 it("does not classify ordinary prose as private data",()=>expect(inspectPrivacy("회의 내용을 세 문장으로 요약해주세요.")).toEqual([]));
});
