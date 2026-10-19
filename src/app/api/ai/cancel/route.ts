import { z } from "zod";
import { cancel, participant } from "@/server/ai/store";
import { body, failure, noStore, participantId } from "@/server/ai/http";
export async function POST(request:Request){try{const id=participantId(request);await participant(id);const input=z.object({requestId:z.string().uuid()}).parse(await body(request));await cancel(id,input.requestId);return Response.json({ok:true},{headers:noStore});}catch(e){return failure(e);}}
