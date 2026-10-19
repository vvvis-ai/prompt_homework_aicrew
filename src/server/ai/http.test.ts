import { describe,it,expect,vi } from "vitest";
vi.mock("server-only",()=>({}));
import { sameOrigin,body } from "./http";
describe("AI HTTP boundary",()=>{
 it("accepts actual browser Host despite internal Next localhost normalization",()=>expect(()=>sameOrigin(new Request("http://localhost:3100/api/ai",{headers:{host:"127.0.0.1:3100",origin:"http://127.0.0.1:3100","sec-fetch-site":"same-origin"}}))).not.toThrow());
 it("rejects cross-site origin and fetch metadata",()=>{
 expect(()=>sameOrigin(new Request("https://example.com/api/ai",{headers:{origin:"https://attacker.test"}}))).toThrow();
 expect(()=>sameOrigin(new Request("https://example.com/api/ai",{headers:{"sec-fetch-site":"cross-site"}}))).toThrow();
 });
 it("enforces actual request size and rejects non-JSON",async()=>{
 await expect(body(new Request("http://localhost/api/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:"x".repeat(100001)})}))).rejects.toMatchObject({code:"BODY_SIZE"});
 await expect(body(new Request("http://localhost/api/ai",{method:"POST",body:"text"}))).rejects.toMatchObject({code:"CONTENT_TYPE"});
 });
});
