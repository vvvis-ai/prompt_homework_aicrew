import "server-only";
import { z } from "zod";
import * as store from "./store";
import { AiError, FIELDS, type AiState, type Snapshot } from "@/lib/ai/types";
import { applyFeedback, expiry, findCard, prune } from "@/lib/ai/domain";
import { inspectPrivacy } from "@/lib/ai/privacy";
export const fieldSchema=z.enum(FIELDS);
const fieldsSchema=z.array(fieldSchema).max(3);
export const actionSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("preferences"),interests:z.array(fieldSchema).max(6),excluded:z.array(fieldSchema).max(5)}),
 z.object({action:z.literal("reset")}),
 z.object({action:z.literal("feedback"),cardId:z.string().uuid(),value:z.enum(["used","dislike"])}),
 z.object({action:z.literal("deleteRoom"),roomId:z.string().uuid()}),
 z.object({action:z.literal("deleteSaved"),id:z.string().uuid()}),
 z.object({action:z.literal("draft"),cardId:z.string().uuid(),text:z.string().min(1).max(5000),expectedVersion:z.number().int().min(0),privacyAcknowledged:z.boolean().optional()}),
 z.object({action:z.literal("save"),cardId:z.string().uuid(),title:z.string().trim().min(1).max(100),text:z.string().min(1).max(5000),fields:fieldsSchema.min(1),updateId:z.string().uuid().optional(),expectedVersion:z.number().int().min(1).optional(),confirm:z.boolean().optional(),privacyAcknowledged:z.boolean().optional()}),
]);
export type Action=z.infer<typeof actionSchema>;
export function privacyGate(text:string,acknowledged=false) {
 const findings=inspectPrivacy(text);
 if(findings.some(f=>f.risk==="high")) throw new AiError("PRIVACY_BLOCK","민감한 정보를 지운 뒤 다시 검사해주세요.",422,findings);
 if(findings.length&&!acknowledged) throw new AiError("PRIVACY_WARNING","개인정보로 보이는 부분을 확인해주세요.",422,findings);
}
export async function snapshot(id:number):Promise<Snapshot> {
 await store.participant(id);
 const [loaded,requests,settings]=await Promise.all([store.load(id),store.requests(id),store.settings()]);
 const now=new Date().toISOString();
 return {state:prune(loaded.state,now),version:loaded.version,requests:requests.map(r=>r.status==="running"&&r.expiresAt<=now?{...r,status:"failed"}:r),settings,now,demo:store.previewMode(),configured:store.previewMode()||Boolean(process.env.GEMINI_API_KEY&&process.env.GEMINI_MODEL)};
}
export async function mutate(id:number,change:(state:AiState,now:string)=>void,finish?:string,resultId?:string) {
 for(let retry=0;retry<4;retry++) {
  const loaded=await store.load(id),now=new Date().toISOString(),state=prune(loaded.state,now);
  change(state,now);
  try {await store.write(id,loaded.version,state,finish,resultId);return;}
  catch(e) {if(!(e instanceof AiError)||e.code!=="VERSION_CONFLICT"||retry===3)throw e;}
 }
}
export async function action(id:number,input:Action) {
 await store.participant(id);
 if(input.action==="draft"||input.action==="save") privacyGate(("title" in input?input.title+"\n":"")+input.text,input.privacyAcknowledged);
 await mutate(id,(state,now)=>{
  switch(input.action) {
   case "preferences": state.interests=[...new Set(input.interests)];state.excluded=[...new Set(input.excluded)];break;
   case "reset":state.scores={};state.feedback={};state.exploration=0;break;
   case "feedback":applyFeedback(state,findCard(state,input.cardId),input.value);break;
   case "deleteRoom":state.rooms=state.rooms.filter(r=>r.id!==input.roomId);break;
   case "deleteSaved":state.saved=state.saved.filter(c=>c.id!==input.id);break;
   case "draft": {
    findCard(state,input.cardId);
    const old=state.drafts.find(d=>d.cardId===input.cardId);
    if((old?.version??0)!==input.expectedVersion)throw new AiError("DRAFT_CONFLICT","다른 기기의 초안과 충돌했습니다.",409,old??null);
    const next={cardId:input.cardId,text:input.text,version:(old?.version??0)+1,createdAt:now,expiresAt:expiry(now)};
    state.drafts=state.drafts.filter(d=>d.cardId!==input.cardId).concat(next);break;
   }
   case "save": {
    const source=findCard(state,input.cardId);
    if(input.updateId) {
     const old=state.saved.find(c=>c.id===input.updateId);
     if(!old)throw new AiError("NOT_FOUND","보관한 항목을 찾을 수 없습니다.",404);
     if(!input.confirm)throw new AiError("CONFIRM_REQUIRED","기존 내용을 덮어쓸지 확인해주세요.");
     if(old.version!==input.expectedVersion)throw new AiError("SAVED_CONFLICT","다른 기기에서 보관함 내용이 바뀌었습니다.",409,old);
     Object.assign(old,{title:input.title,prompt:input.text,fields:input.fields,updatedAt:now,version:old.version+1});
    } else {
     if(state.saved.length>=100)throw new AiError("LIBRARY_FULL","보관함은 최대 100개입니다.",409);
     state.saved.push({...source,id:crypto.randomUUID(),title:input.title,prompt:input.text,fields:input.fields,createdAt:now,updatedAt:now,version:1});
    }
    applyFeedback(state,source,"saved");break;
   }
  }
 });
 return snapshot(id);
}
