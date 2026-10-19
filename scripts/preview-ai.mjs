import { spawn } from "node:child_process";
const child=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--hostname","127.0.0.1","--port","3100"],{stdio:"inherit",env:{...process.env,DEMO_MODE:"true",AI_PREVIEW:"true",SUPABASE_URL:"",SUPABASE_SECRET_KEY:"",GEMINI_API_KEY:"",GEMINI_MODEL:"",ADMIN_PASSWORD_PBKDF2:"",ADMIN_PASSWORD_HASH:"",ADMIN_PASSWORD:"010723",ADMIN_SESSION_SECRET:"local-review-only-secret-not-for-production"}});
for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>child.kill(signal));
child.on("exit",code=>process.exit(code??0));
