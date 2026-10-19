import { jwtVerify } from "jose";
import { cleanup } from "@/server/ai/store";
export async function POST(request:Request){
 try{
  const secret=process.env.ADMIN_SESSION_SECRET;if(!secret)throw new Error();
  await jwtVerify(request.headers.get("authorization")?.replace(/^Bearer /,"")??"",new TextEncoder().encode(secret),{algorithms:["HS256"],audience:"ai-cleanup-cron",issuer:"ai-worker"});
 }catch{return Response.json({error:"Unauthorized"},{status:401});}
 try{await cleanup();return Response.json({ok:true});}catch{return Response.json({error:"Cleanup failed"},{status:503});}
}
