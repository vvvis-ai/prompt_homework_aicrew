import { action, actionSchema, snapshot } from "@/server/ai/service";
import { body, failure, noStore, participantId } from "@/server/ai/http";
export async function GET(request:Request){try{return Response.json(await snapshot(participantId(request)),{headers:noStore});}catch(e){return failure(e);}}
export async function POST(request:Request){try{return Response.json(await action(participantId(request),actionSchema.parse(await body(request))),{headers:noStore});}catch(e){return failure(e);}}
