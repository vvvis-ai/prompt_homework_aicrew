import { spawnSync } from 'node:child_process';
import env from '@next/env';
// Never print parsed env values or provider response bodies.
env.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const missing = ['GEMINI_API_KEY', 'GEMINI_MODEL'].filter(name => !process.env[name]?.trim());
if (missing.length) {
  console.error('실제 API 테스트를 실행하지 않았습니다. .env.local 설정 필요: ' + missing.join(', '));
  process.exit(2);
}
if (!/^[a-zA-Z0-9._-]+$/.test(process.env.GEMINI_MODEL)) {
  console.error('GEMINI_MODEL에 올바른 모델 ID를 입력해주세요.');
  process.exit(2);
}
console.log('Gemini 실제 호출 검사: 개인정보 없는 예제 1개, 일시 오류 재시도 포함 최대 2회. 운영 DB는 사용하지 않습니다.');
const child = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'scripts/vitest.gemini-live.config.ts'], {
  stdio: 'inherit',
  env: { ...process.env, RUN_GEMINI_LIVE: 'true' },
});
process.exit(child.status ?? 1);
