import { beforeAll, afterAll, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import {getAppData} from "@/server/app-data";
import {getAdminData,getOperatorChoices} from "@/server/admin-data";
import {isDatabaseConfigured,isDemoMode} from "@/server/supabase";
const realFetch=globalThis.fetch;
let guard:ReturnType<typeof vi.spyOn>;
beforeAll(()=>{
 if(!isDatabaseConfigured()||isDemoMode())throw new Error("실제 Supabase 설정이 필요합니다.");
 guard=vi.spyOn(globalThis,"fetch").mockImplementation(async(input,init)=>{
  const method=(init?.method??(input instanceof Request?input.method:"GET")).toUpperCase();
  if(!["GET","HEAD"].includes(method))throw new Error("READ_ONLY_TEST_BLOCKED_WRITE");
  return realFetch(input,{...init,signal:AbortSignal.timeout(20000)});
 });
});
afterAll(()=>guard?.mockRestore());
async function safeCheck(run:()=>Promise<void>){try{await run();}catch(e){const code=e&&typeof e==='object'&&'code' in e&&typeof e.code==='string'&&/^[A-Z0-9_]{1,30}$/.test(e.code)?e.code:'READ_CHECK_FAILED';throw new Error(code);}}
it("실제 홈·공유·성장 데이터 조립",()=>safeCheck(async()=>{
 const result=await getAppData({date:"all"});
 if(result.demo||!result.challenge||!result.participants.length)throw new Error();
 const selected=await getAppData({date:"all",participantId:result.participants[0].id});
 if(selected.demo||!selected.selectedParticipant||!selected.calendar.length||!Number.isFinite(selected.summary.totalLinks))throw new Error();
}));
it("실제 관리자·정산 데이터 조립 (로그인 검사는 별도)",()=>safeCheck(async()=>{
 const operators=await getOperatorChoices();if(!operators.length)throw new Error();
 const operator=operators[0];
 // Internal data-builder test only; no session cookie is created, login is not bypassed in the app.
 const result=await getAdminData(undefined,undefined,{authenticated:true,operatorId:operator.id,operatorName:operator.name});
 if(result.demo||!result.challenge||!result.participants.length||!Number.isFinite(result.metrics.monthPenalty))throw new Error();
}));
it("미인증 관리자 데이터 차단",async()=>{
 try{await getAdminData(undefined,undefined,{authenticated:false,operatorId:null,operatorName:null});}catch(e){if(e instanceof Error&&e.message==='UNAUTHORIZED')return;}
 throw new Error("AUTH_GUARD_FAILED");
});
