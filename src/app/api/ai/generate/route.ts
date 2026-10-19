import { after } from "next/server";
import { generationSchema, prepare, run } from "@/server/ai/generation";
import { body, errorPayload, failure, noStore, participantId } from "@/server/ai/http";
import { snapshot } from "@/server/ai/service";
export const maxDuration=90;
export async function POST(request:Request){
 try{
  const id=participantId(request),input=generationSchema.parse(await body(request)),prepared=await prepare(id,input);
  // Idempotent replay never starts a second provider call.
  if(prepared.request.replay)
   return Response.json({replay:true,snapshot:await snapshot(id)},{headers:noStore});
  const encoder=new TextEncoder();let connected=true;
  let send:(value:unknown)=>void=()=>{};
  let close:()=>void=()=>{};
  const stream=new ReadableStream<Uint8Array>({
   start(controller){close=()=>{if(connected){controller.close();connected=false;}};send=value=>{if(connected){try{controller.enqueue(encoder.encode(JSON.stringify(value)+"\n"));}catch{connected=false;}}};},
   cancel(){connected=false;},
  });
  const job=run(id,input,prepared,text=>send({type:"preview",text}))
   .then(result=>send({type:"done",snapshot:result}))
   .catch(error=>send({type:"error",...errorPayload(error)}))
   .finally(()=>{send({type:"end"});close();});
  // Promise form starts immediately; waitUntil keeps work alive after disconnect.
  after(job);
  return new Response(stream,{headers:{...noStore,"Content-Type":"application/x-ndjson","X-Accel-Buffering":"no"}});
 }catch(e){return failure(e);}
}
