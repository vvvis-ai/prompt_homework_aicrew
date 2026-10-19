import { z } from "zod";
import { requireOperator } from "@/server/admin-session";
import { getSupabaseAdmin } from "@/server/supabase";
import { configure, previewMode, settings, statistics } from "@/server/ai/store";
import { body, failure, noStore } from "@/server/ai/http";
import { AiError } from "@/lib/ai/types";
async function operator(){
 try{
  const session=await requireOperator();
  if(!previewMode()){
   const {data,error}=await getSupabaseAdmin().from("operators").select("id,is_active").eq("id",Number(session.operatorId)).maybeSingle();
   if(error||!data?.is_active)throw new Error("UNAUTHORIZED");
  }
  return Number(session.operatorId);
 }catch{throw new AiError("UNAUTHORIZED","관리자 인증이 필요합니다.",401);}
}
export async function GET(){try{await operator();return Response.json({settings:await settings(),statistics:await statistics()},{headers:noStore});}catch(e){return failure(e);}}
export async function POST(request:Request){
 try{const id=await operator();const input=z.object({enabled:z.boolean(),recommendLimit:z.number().int().min(0).max(100),chatLimit:z.number().int().min(0).max(100),dailyCap:z.number().int().min(0).max(100000),minuteCap:z.number().int().min(0).max(1000)}).parse(await body(request));await configure(id,input);return Response.json({ok:true},{headers:noStore});}
 catch(e){return failure(e);}
}
