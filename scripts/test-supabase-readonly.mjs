import env from '@next/env';
import {spawnSync} from 'node:child_process';
env.loadEnvConfig(process.cwd(),true,{info(){},error(){}});
if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY){console.error('Supabase 설정이 필요합니다.');process.exit(2);}
const result=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run','--config','scripts/vitest.supabase-readonly.config.ts'],{stdio:'inherit',env:{...process.env,DEMO_MODE:'false',AI_PREVIEW:'false'}});
process.exit(result.status??1);
