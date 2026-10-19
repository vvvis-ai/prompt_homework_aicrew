import "server-only";
import { AiError, DEFAULT_SETTINGS, emptyState, type AiRequest, type AiState, type RequestKind, type Settings } from "@/lib/ai/types";
import { kstDateKey } from "@/lib/time";
export const previewMode = () => process.env.NODE_ENV !== "production" && process.env.AI_PREVIEW === "true";
type Stored = { state: AiState; version: number };
type Memory = { states: Map<number, Stored>; requests: Map<string, AiRequest>; calls: { at: number; requestId: string }[]; settings: Settings };
const globalMemory = globalThis as typeof globalThis & { aiPreviewStore?: Memory };
const memory = ():Memory => globalMemory.aiPreviewStore ??= { states: new Map(), requests: new Map(), calls: [], settings: { ...DEFAULT_SETTINGS } };
export function resetPreview() { delete globalMemory.aiPreviewStore; }

function databaseError(message: string): never {
 const codes: Record<string,string> = {
  VERSION_CONFLICT:"다른 기기에서 내용이 변경되었습니다.", AI_DISABLED:"AI 도우미가 잠시 쉬고 있어요.",
  PERSONAL_LIMIT:"오늘 사용할 수 있는 횟수를 모두 사용했어요.", GLOBAL_DAY_LIMIT:"오늘 AI 이용량에 도달했어요.",
  GLOBAL_MINUTE_LIMIT:"지금 AI 요청을 처리할 수 없습니다.", BUSY:"진행 중인 AI 요청이 있어요.",
  CANCELLED:"취소되었거나 처리 시간이 지났습니다.", PARTICIPANT:"참가자를 다시 선택해주세요.",
  REQUEST_CONFLICT:"요청 정보가 일치하지 않습니다.", LIBRARY_FULL:"보관함은 최대 100개입니다."
 };
 for (const [code,text] of Object.entries(codes)) if (message.includes(code)) throw new AiError(code,text,code.includes("LIMIT") ? 429 : 409);
 throw new AiError("STORAGE","AI 데이터를 처리하지 못했습니다.",503);
}
async function rest<T>(path: string, method="GET", body?: unknown): Promise<T> {
 const base=process.env.SUPABASE_URL, key=process.env.SUPABASE_SECRET_KEY;
 if (!base || !key) throw new AiError("STORAGE","AI 저장소가 아직 준비되지 않았습니다.",503);
 const r=await fetch(base.replace(/\/$/,"")+"/rest/v1/"+path,{method,headers:{apikey:key,...(key.startsWith("sb_secret_")?{}:{Authorization:"Bearer "+key}),"Content-Type":"application/json",Prefer:"return=representation,resolution=ignore-duplicates"},body:body===undefined?undefined:JSON.stringify(body),cache:"no-store",signal:AbortSignal.timeout(15000)});
 if (!r.ok) {
   const error=await r.json().catch(()=>({message:""})) as {message?:string};
   databaseError(String(error.message??""));
 }
 return (r.status===204 ? undefined : await r.json()) as T;
}
const rpc=<T>(name:string,body:unknown)=>rest<T>("rpc/"+name,"POST",body);
function mapRequest(r: {id:string;participant_id:number;kind:RequestKind;status:AiRequest["status"];started_at:string;expires_at:string;day:string;result_id?:string;replay?:boolean}):AiRequest {
 return {id:r.id,participantId:r.participant_id,kind:r.kind,status:r.status,startedAt:r.started_at,expiresAt:r.expires_at,day:r.day,resultId:r.result_id,replay:r.replay};
}
export async function participant(id:number) {
 if(previewMode()) return;
 const rows=await rest<{id:number}[]>("participants?select=id&id=eq."+id+"&is_active=eq.true");
 if(!rows.length) throw new AiError("PARTICIPANT","참가자를 다시 선택해주세요.",404);
}
export async function settings():Promise<Settings> {
 if(previewMode()) return {...memory().settings};
 const [r]=await rest<{enabled:boolean;recommend_limit:number;chat_limit:number;daily_cap:number;minute_cap:number}[]>("ai_settings?select=enabled,recommend_limit,chat_limit,daily_cap,minute_cap&id=eq.true");
 if(!r) throw new AiError("STORAGE","AI 설정이 없습니다.",503);
 return {enabled:r.enabled,recommendLimit:r.recommend_limit,chatLimit:r.chat_limit,dailyCap:r.daily_cap,minuteCap:r.minute_cap};
}
export async function load(id:number):Promise<Stored> {
 if(previewMode()) { if(!memory().states.has(id)) memory().states.set(id,{state:emptyState(),version:0});return structuredClone(memory().states.get(id)!); }
 await rest("ai_states","POST",{participant_id:id});
 const [row]=await rest<{document:AiState;version:number}[]>("ai_states?select=document,version&participant_id=eq."+id);
 return {state:row.document,version:row.version};
}
export async function requests(id:number):Promise<AiRequest[]> {
 if(previewMode()) return structuredClone([...memory().requests.values()].filter(r=>r.participantId===id));
 const rows=await rest<Parameters<typeof mapRequest>[0][]>("ai_requests?select=id,participant_id,kind,status,started_at,expires_at,day,result_id&participant_id=eq."+id+"&order=started_at.desc&limit=1000");
 return rows.map(mapRequest);
}
export async function begin(id:number,requestId:string,kind:RequestKind):Promise<AiRequest> {
 if(!previewMode()) return mapRequest(await rpc("ai_begin",{p_participant:id,p_id:requestId,p_kind:kind}));
 const m=memory(),now=new Date().toISOString();
 if(!m.settings.enabled) databaseError("AI_DISABLED");
 for(const r of m.requests.values()) if(r.status==="running" && r.expiresAt<=now) r.status="failed";
 const old=m.requests.get(requestId);
 if(old) {if(old.participantId!==id || old.kind!==kind) databaseError("REQUEST_CONFLICT"); return {...structuredClone(old),replay:true};}
 if([...m.requests.values()].some(r=>r.participantId===id&&r.status==="running")) databaseError("BUSY");
 const used=[...m.requests.values()].filter(r=>r.participantId===id&&r.kind===kind&&r.day===kstDateKey(now)&&r.status==="success").length;
 if(used>=(kind==="chat"?m.settings.chatLimit:m.settings.recommendLimit)) databaseError("PERSONAL_LIMIT");
 const r:AiRequest={id:requestId,participantId:id,kind,status:"running",startedAt:now,expiresAt:new Date(Date.now()+90000).toISOString(),day:kstDateKey(now)};
 m.requests.set(requestId,r);return structuredClone(r);
}
export async function attempt(id:number,requestId:string) {
 if(!previewMode()) return rpc<void>("ai_attempt",{p_participant:id,p_id:requestId});
 const m=memory(),r=m.requests.get(requestId),now=Date.now();
 if(!r||r.participantId!==id||r.status!=="running"||Date.parse(r.expiresAt)<=now) databaseError("CANCELLED");
 if(!m.settings.enabled) databaseError("AI_DISABLED");
 if(m.calls.filter(c=>kstDateKey(new Date(c.at))===kstDateKey(new Date(now))).length>=m.settings.dailyCap) databaseError("GLOBAL_DAY_LIMIT");
 if(m.calls.filter(c=>c.at>now-60000).length>=m.settings.minuteCap) databaseError("GLOBAL_MINUTE_LIMIT");
 m.calls.push({at:now,requestId});
}
export async function write(id:number,version:number,state:AiState,finish?:string,result?:string) {
 if(!previewMode()) return rpc<number>("ai_write",{p_participant:id,p_version:version,p_document:state,p_finish:finish??null,p_result:result??null});
 const m=memory(),old=m.states.get(id);
 if(old?.version!==version) databaseError("VERSION_CONFLICT");
 if(state.saved.length>100) databaseError("LIBRARY_FULL");
 if(finish) {const r=m.requests.get(finish);if(!r||r.participantId!==id||r.status!=="running"||Date.parse(r.expiresAt)<=Date.now())databaseError("CANCELLED");r.status="success";r.resultId=result;}
 m.states.set(id,{state:structuredClone(state),version:version+1});return version+1;
}
export async function cancel(id:number,requestId:string,status:"failed"|"cancelled"="cancelled") {
 if(!previewMode()) return rpc<void>("ai_cancel",{p_participant:id,p_id:requestId,p_status:status});
 const r=memory().requests.get(requestId);if(r?.participantId===id&&r.status==="running")r.status=status;
}
export async function configure(operatorId:number,value:Settings) {
 if(previewMode()) {memory().settings={...value};return;}
 await rpc("ai_configure",{p_operator:operatorId,p_settings:value});
}
export async function statistics() {
 if(previewMode()) {
  const m=memory();return {requests:m.requests.size,success:[...m.requests.values()].filter(r=>r.status==="success").length,calls:m.calls.length};
 }
 // Only counts leave this layer. No prompts, names, participant IDs or room data.
 return rpc<{requests:number;success:number;calls:number}>("ai_statistics",{});
}
export async function cleanup() {if(!previewMode()) await rpc("ai_cleanup",{});}
