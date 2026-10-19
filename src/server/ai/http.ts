import "server-only";
import { z } from "zod";
import { AiError } from "@/lib/ai/types";
export const noStore={"Cache-Control":"no-store, private"};
export function participantId(request:Request) {return z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(request.headers.get("x-ai-participant"));}
export function sameOrigin(request:Request) {
 const origin=request.headers.get("origin");
 const target=new URL(request.url);
 const expected=target.protocol+"//"+(request.headers.get("host")??target.host);
 if(origin&&origin!==expected)throw new AiError("ORIGIN","요청 출처가 올바르지 않습니다.",403);
 if(request.headers.get("sec-fetch-site")==="cross-site")throw new AiError("ORIGIN","요청 출처가 올바르지 않습니다.",403);
}
export async function body(request:Request) {
 sameOrigin(request);
 if(!request.headers.get("content-type")?.startsWith("application/json"))throw new AiError("CONTENT_TYPE","JSON 요청만 지원합니다.",415);
 // Bound the actual streamed body, not just the untrusted Content-Length.
 const reader=request.body?.getReader();if(!reader)throw new AiError("BODY","요청 내용이 없습니다.");
 const decoder=new TextDecoder();let text="",size=0;
 try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>100000)throw new AiError("BODY_SIZE","요청이 너무 큽니다.",413);text+=decoder.decode(r.value,{stream:true});}text+=decoder.decode();return JSON.parse(text) as unknown;}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export function errorPayload(error:unknown) {
 if(error instanceof AiError)return {error:error.message,code:error.code,details:error.details};
 if(error instanceof z.ZodError)return {error:"입력 길이와 필수 항목을 확인해주세요.",code:"VALIDATION"};
 return {error:"요청을 완료하지 못했습니다. 저장된 추천이나 기본 프롬프트를 이용해주세요.",code:"UNAVAILABLE"};
}
export function failure(error:unknown){return Response.json(errorPayload(error),{status:error instanceof AiError?error.status:error instanceof z.ZodError?400:503,headers:noStore});}
