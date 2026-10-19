import { afterEach,describe,it,expect,vi } from "vitest";
vi.mock("server-only",()=>({}));
import { generate,readGeminiStream } from "./gemini";
const output={text:"안녕하세요",cards:[],suggestions:[]};
function response(finish="STOP"){
 const s="data: "+JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(output)}]},finishReason:finish}]})+"\n\n";
 const bytes=new TextEncoder().encode(s);
 return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=3)c.enqueue(bytes.slice(i,i+3));c.close();}}));
}
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe("Gemini transport",()=>{
 it("decodes split UTF-8 SSE and requires STOP",async()=>{
  expect(await readGeminiStream(response(),()=>{},new AbortController().signal)).toEqual(output);
  await expect(readGeminiStream(response("SAFETY"),()=>{},new AbortController().signal)).rejects.toMatchObject({code:"BLOCKED"});
 });
 it("retries a transient 503 only once and never retries 429",async()=>{
  vi.stubEnv("GEMINI_API_KEY","test");vi.stubEnv("GEMINI_MODEL","test-model");
  const fetcher=vi.fn().mockResolvedValueOnce(new Response("",{status:503})).mockResolvedValueOnce(response());vi.stubGlobal("fetch",fetcher);
  const beforeAttempt=vi.fn().mockResolvedValue(undefined),options={instruction:"test",input:"test",signal:new AbortController().signal,onPreview:vi.fn(),beforeAttempt};
  await generate(options);expect(fetcher).toHaveBeenCalledTimes(2);expect(beforeAttempt).toHaveBeenCalledTimes(2);
  fetcher.mockReset().mockResolvedValue(new Response("",{status:429}));beforeAttempt.mockClear();
  await expect(generate(options)).rejects.toMatchObject({code:"PROVIDER_LIMIT"});expect(fetcher).toHaveBeenCalledTimes(1);expect(beforeAttempt).toHaveBeenCalledTimes(1);
 });
 it("does not accept truncated responses or leak provider errors",async()=>{
  await expect(readGeminiStream(new Response('data: {"candidates":[]}\n\n'),()=>{},new AbortController().signal)).rejects.toMatchObject({code:"INCOMPLETE"});
 });
});
