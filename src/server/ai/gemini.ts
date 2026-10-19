import "server-only";
import { z } from "zod";
import { AiError, FIELDS } from "@/lib/ai/types";
export const outputSchema=z.object({
 text:z.string().max(12000),
 cards:z.array(z.object({title:z.string().min(1).max(100),prompt:z.string().min(1).max(5000),fields:z.array(z.enum(FIELDS)).min(1).max(3)})).max(3),
 suggestions:z.array(z.string().min(1).max(200)).max(3),
});
export type Output=z.infer<typeof outputSchema>;
export type GenerateOptions={instruction:string;input:string;signal:AbortSignal;onPreview:(text:string)=>void;beforeAttempt:()=>Promise<void>};
const responseSchema={type:"OBJECT",properties:{text:{type:"STRING"},cards:{type:"ARRAY",maxItems:3,items:{type:"OBJECT",properties:{title:{type:"STRING"},prompt:{type:"STRING"},fields:{type:"ARRAY",items:{type:"STRING",enum:[...FIELDS]},minItems:1,maxItems:3}},required:["title","prompt","fields"]}},suggestions:{type:"ARRAY",maxItems:3,items:{type:"STRING"}}},required:["text","cards","suggestions"],propertyOrdering:["text","cards","suggestions"]};
function preview(raw:string) {
 const parts=[...raw.matchAll(/"(?:text|prompt)"\s*:\s*"((?:\\.|[^"\\])*)/g)];
 return parts.map(m=>{try{return JSON.parse('"'+m[1]+'"') as string;}catch{return m[1].replace(/\\n/g,"\n").replace(/\\[^ ]*$/,"");}}).join("\n\n");
}
export async function readGeminiStream(response:Response,onPreview:(text:string)=>void,signal:AbortSignal):Promise<Output> {
 if(!response.body)throw new AiError("EMPTY","AI 응답이 비어 있습니다.",502);
 const reader=response.body.getReader(),decoder=new TextDecoder();
 let buffer="",raw="",finished=false;
 const frame=(line:string)=>{
  if(!line.startsWith("data:"))return;
  const data=JSON.parse(line.slice(5).trim()) as {promptFeedback?:{blockReason?:string};candidates?:{finishReason?:string;content?:{parts?:{text?:string;thought?:boolean}[]}}[]};
  if(data.promptFeedback?.blockReason)throw new AiError("BLOCKED","AI가 이 요청에 답변할 수 없어요.",422);
  const candidate=data.candidates?.[0];
  if(candidate?.finishReason&&candidate.finishReason!=="STOP")throw new AiError("BLOCKED","AI 응답을 완료하지 못했어요.",422);
  for(const p of candidate?.content?.parts??[])if(p.text&&!p.thought)raw+=p.text;
  if(raw.length>40000)throw new AiError("RESPONSE_TOO_LARGE","응답이 너무 길어 중단했습니다.",502);
  if(candidate?.finishReason==="STOP")finished=true;
  onPreview(preview(raw));
 };
 try{
  while(true){
   signal.throwIfAborted();
   const chunk=await reader.read();if(chunk.done)break;
   buffer+=decoder.decode(chunk.value,{stream:true});
   const lines=buffer.split(/\r?\n/);buffer=lines.pop()??"";
   for(const line of lines)frame(line);
  }
  buffer+=decoder.decode();if(buffer.trim())frame(buffer);
  if(!finished)throw new AiError("INCOMPLETE","AI 응답이 완료되기 전에 연결이 끝났어요.",502);
  return outputSchema.parse(JSON.parse(raw));
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export async function generate(options:GenerateOptions):Promise<Output>{
 const key=process.env.GEMINI_API_KEY,model=process.env.GEMINI_MODEL;
 if(!key||!model||!/^[a-zA-Z0-9._-]+$/.test(model))throw new AiError("NOT_CONFIGURED","AI 연결 설정이 아직 준비되지 않았어요.",503);
 for(let attempt=0;attempt<2;attempt++){
  options.signal.throwIfAborted();
  await options.beforeAttempt(); // Retries also count against global provider caps.
  let response:Response;
  try{
   response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":streamGenerateContent?alt=sse",{
    method:"POST",headers:{"x-goog-api-key":key,"Content-Type":"application/json"},signal:options.signal,
    body:JSON.stringify({systemInstruction:{parts:[{text:options.instruction}]},contents:[{role:"user",parts:[{text:options.input}]}],generationConfig:{responseMimeType:"application/json",responseSchema,maxOutputTokens:8192}}),
   });
  }catch(error){if(attempt===0&&!options.signal.aborted){options.onPreview("");continue;}throw error;}
  if(!response.ok){
   await response.body?.cancel();
   if(attempt===0&&[500,502,503,504].includes(response.status)){options.onPreview("");continue;}
   throw new AiError(response.status===429?"PROVIDER_LIMIT":"PROVIDER_ERROR","AI 연결이 일시적으로 원활하지 않습니다.",response.status===429?429:502);
  }
  // Do not retry partial output, safety blocks or invalid structured responses.
  return readGeminiStream(response,options.onPreview,options.signal);
 }
 throw new AiError("PROVIDER_ERROR","AI 응답을 받지 못했습니다.",502);
}
