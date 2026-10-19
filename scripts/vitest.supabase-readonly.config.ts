import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import env from "@next/env";
env.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
export default defineConfig({
 resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
 test: { environment:"node",include:["scripts/supabase-readonly.check.ts"],maxWorkers:1,testTimeout:60000,env:{DEMO_MODE:"false",AI_PREVIEW:"false"} },
});
