# 운영 및 배포 안내

## 1. Supabase 준비

1. 새 Supabase 프로젝트를 만듭니다.
2. 프로젝트 루트에서 `npx supabase login` 후 `npx supabase link --project-ref <프로젝트 참조값>`을 실행합니다.
3. `npx supabase db push`로 마이그레이션을 적용합니다.
4. 실제 운영 데이터는 관리자 화면에서 등록합니다. `supabase/seed.sql`은 로컬 개발용이며 원격 운영 DB에 자동 적용하지 않습니다.
5. Project Settings의 API 화면에서 프로젝트 URL과 서버용 Secret Key를 확인합니다.

Secret Key는 브라우저에 전달하면 안 됩니다. 이 프로젝트는 공개 참가자 화면도 Next.js 서버 API를 거쳐서만 DB에 접근합니다.

## 2. 관리자 비밀값

- `ADMIN_SESSION_SECRET`: 32자 이상, 예측 불가능한 값
- `ADMIN_PASSWORD_PBKDF2`: Cloudflare 운영용 PBKDF2 관리자 비밀번호 검증값
- `ADMIN_PASSWORD_HASH`: 이전 bcrypt 검증값과의 호환용
- 초기 비밀번호 `010723`은 로컬 체험 모드에서만 자동 제공됩니다. 운영 배포에서는 환경변수에 명시적으로 설정해야 하며, 첫 운영 전에 새로운 비밀번호로 바꾸는 것을 권장합니다.

## 3. Cloudflare Workers Secrets

다음 값은 `wrangler.jsonc`가 필수 Secret으로 선언합니다. 값 자체를 설정 파일에 적지 말고 Wrangler Secret으로 등록합니다.

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
ADMIN_PASSWORD_PBKDF2
ADMIN_PASSWORD_HASH
ADMIN_SESSION_SECRET
```

`DEMO_MODE=false`는 비밀값이 아니므로 `wrangler.jsonc`에 일반 변수로 고정되어 있습니다. Preview와 Production에 같은 운영 DB를 연결하면 시험 제출·삭제가 실제 데이터에 반영됩니다.

## 4. Cloudflare Workers 배포

```bash
npx wrangler login
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put ADMIN_PASSWORD_PBKDF2
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put ADMIN_SESSION_SECRET
npm run typecheck
npm run lint
npm test
npm run build
npm run build:vinext
npm run deploy:dry-run
npm run deploy
```

배포 전에 먼저 Supabase DB 마이그레이션을 적용합니다. 배포가 끝난 뒤 참가자 화면, `/admin` 로그인, 제출 등록/수정/삭제, 관리자 정산 파일 다운로드를 확인합니다. 앱은 Cloudflare Workers에서 실행되고 데이터는 기존 Supabase에 계속 저장됩니다.

## 5. 운영 점검표

- 활성 기수는 한 개만 지정되어 있는가
- 기수 시작일 기준 첫 벌금 단가가 자동 생성되었는가
- 운영 기간의 대한민국 공휴일이 제외일에 등록되어 있는가
- 참가자별 참여일·하차일·실제 입금액이 정확한가
- `23:00:59`, `23:01:00`, `23:59:59` 경계 테스트가 통과하는가
- 참가자 API 응답과 브라우저 개발자 도구에 비밀번호 해시가 노출되지 않는가
- CSV와 엑셀의 월별 합계가 관리자 화면과 일치하는가
- Workers 설정에서 `DEMO_MODE=false`인가

## 6. 알려진 로컬 요구사항

Supabase 통합 테스트는 Docker Desktop 또는 Podman이 필요합니다. 컨테이너 런타임이 없는 PC에서도 TypeScript, 린트, 단위 테스트, Next.js 프로덕션 빌드는 실행할 수 있습니다.
