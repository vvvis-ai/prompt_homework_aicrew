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

비밀번호 해시 생성·검증은 기존 Supabase 프로젝트의 `password-crypto` Edge Function에서 처리합니다. Workers 무료 요금제의 요청당 CPU 한도 안에서 bcrypt/PBKDF2를 실행하지 않기 위한 분리입니다. 관리자 PBKDF2/bcrypt 해시와 기존 게시물의 bcrypt 해시는 그대로 사용하며, 비밀번호를 다시 설정할 필요가 없습니다.

앱보다 함수를 먼저 배포합니다. `verify_jwt = false`는 새 Supabase secret key가 JWT가 아니기 때문이며, 함수의 `withSupabase({ auth: "secret" })`가 서버의 `apikey`를 검증합니다. 이 인증 검사를 제거하거나 브라우저에서 함수를 직접 호출하면 안 됩니다. 요청 본문과 비밀번호·해시는 로그에 기록하지 않습니다. 함수 장애 시에는 로그인·등록을 실패 처리하며 Workers에서 고비용 연산을 재시도하지 않습니다.

```bash
npx supabase functions deploy password-crypto --use-api
```

함수와 앱은 기존 `SUPABASE_URL`, `SUPABASE_SECRET_KEY`를 사용합니다. 함수 의존성 버전은 `supabase/functions/password-crypto/deno.json`에서 관리합니다. 함수는 Deno 런타임에서 실행하므로 Next.js 타입 검사 대상에서 제외하며, 핵심 계산은 Vitest 및 실제 함수 호출로 검증합니다.

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

로그인/링크 등록 장애가 재발하면 `wrangler tail`에서 `Exceeded CPU Limit` 여부를 확인하고, Supabase 함수 상태도 확인합니다. 실제 오류가 발생한 단계와 저장 성공 여부를 구분하세요. 링크 저장 후 제출 현황 조회만 실패한 경우에는 재등록을 유도하지 않습니다.

배포 전에 먼저 Supabase DB 마이그레이션을 적용합니다. 배포가 끝난 뒤 참가자 화면, `/admin` 로그인, 제출 등록/수정/삭제, 관리자 정산 파일 다운로드를 확인합니다. 앱은 Cloudflare Workers에서 실행되고 데이터는 기존 Supabase에 계속 저장됩니다.

## 5. 운영 점검표

- 활성 기수는 한 개만 지정되어 있는가
- 기수 시작일 기준 첫 벌금 단가가 자동 생성되었는가
- 기수의 차감 시작일이 실제 운영 시작일과 일치하는가 (2기는 2026-09-14)
- 운영 기간의 대한민국 공휴일이 제외일에 등록되어 있는가
- 참가자별 참여일·하차일·실제 입금액이 정확한가
- 실제 납부자에게 납부 확인일이 기록되어 있고, 미납자는 납부액 0원으로 남아 있는가
- `23:00:59`, `23:01:00`, `23:59:59` 경계 테스트가 통과하는가
- 참가자 API 응답과 브라우저 개발자 도구에 비밀번호 해시가 노출되지 않는가
- CSV와 엑셀의 월별 합계가 관리자 화면과 일치하는가
- Workers 설정에서 `DEMO_MODE=false`인가

## 6. 알려진 로컬 요구사항

Supabase 통합 테스트는 Docker Desktop 또는 Podman이 필요합니다. 컨테이너 런타임이 없는 PC에서도 TypeScript, 린트, 단위 테스트, Next.js 프로덕션 빌드는 실행할 수 있습니다.

## 매일 실천 기능 운영

- `daily_habits` 마이그레이션을 앱 배포 전에 적용합니다. 미션·푸시 테이블은 RLS를 켜고 서버 역할에만 권한을 부여합니다.
- 운영 설정에서 날짜별 선택 미션을 예약합니다. 등록이 없으면 기본 3분 미션이 제공됩니다. 면제는 기존처럼 운영진의 예외 처리입니다.
- 참가자가 브라우저 알림 권한을 직접 허용해야 합니다. iPhone/iPad는 홈 화면에 추가한 웹앱에서 설정합니다. OS·브라우저 알림 설정과 네트워크 상태에 따라 수신이 지연되거나 제한될 수 있습니다.
- Cron은 UTC `*/5 0-13,23 * * *`로 실행됩니다. KST 08:00~23:00 전, 선택 시간이 지난 미제출 참가자만 전송 직전에 재확인합니다.
- 기기당 하루 한 번의 발송 시도를 원자적으로 선점합니다. 중복 방지를 위해 수신 여부가 불분명한 실패는 같은 날 재전송하지 않습니다. 로그의 `sent`/`failed`를 확인하세요. 만료된 구독(404/410)은 제거합니다.
- 푸시는 이름·금액을 포함하지 않는 일반 안내입니다. 전송 직후 제출하는 경우 이미 전송된 알림은 회수되지 않습니다. TTL은 60초입니다.
- 같은 기기의 이름 변경은 알림을 자동 변경하지 않습니다. 현재 이름으로 ‘알림 켜기’를 누르면 갱신됩니다. 다른 기기의 설정에는 영향이 없습니다.
- `VAPID_PRIVATE_JWK`와 `VAPID_PUBLIC_KEY`는 한 쌍으로 유지합니다. 키를 교체하면 기존 브라우저 구독을 다시 등록해야 하므로 임의 재생성하지 마세요.
- 관리자 미제출 안내문은 복사만 하며 자동으로 메신저를 보내지 않습니다. 주간 실천은 월 조회와 독립적이며, 확정·대기 대상일 중 제출 완료 횟수를 셉니다.

- 최초 알림 키 등록은 `node scripts/setup-push.mjs`로 수행합니다. 기존 키 쌍은 보존하고, 신규 키는 메모리에서 생성하여 Wrangler 표준입력으로 전달합니다.

## 납부 확인 운영

- `participants.paid_at`은 실제 납부를 확인한 날짜입니다. 비어 있으면 납부 확인 전이며, 기존 참가자는 백필하지 않았으므로 첫 정산 전에 실제 납부자만 관리자 화면에서 '납부 확인'을 눌러 처리합니다.
- 납부 상태는 저장하지 않고 납부액과 확인일에서 파생합니다. 금액 0원은 미납, 확인일 없이 금액만 있으면 확인 필요, 확인일이 있고 기수 참가비 이상이면 납부 완료, 참가비보다 적으면 부분 납부입니다.
- 부분 납부는 관리자 화면의 참가자 수정에서 실제 입금액을 낮추고 확인일을 함께 입력합니다. 목록의 '납부 확인' 버튼은 미납·확인 필요 상태에만 나타납니다.
- 미제출 차감은 납부 여부와 무관하게 그대로 누적됩니다. 미납자는 예상 환급액과 함께 '납부 대기'가 표시되며, 정산 파일에는 납부 상태와 납부 확인일 열이 포함됩니다.
- 납부 확인일은 오늘 이후로 지정할 수 없고, 납부액이 0원이면 확인일은 자동으로 비워집니다. 확인일 변경은 감사 기록에 `payment_confirm_update`로 남습니다.

## 차감 시작일 운영

- `challenges.penalty_start_date`는 차감 집계를 시작하는 날짜입니다. 2기는 2026-09-14이며, 그 이전 평일은 운영 제외일 등록 여부와 무관하게 미제출로 판정하지 않습니다.
- 이 필드는 제외일 삭제 사고에 대한 안전장치입니다. 09-01~09-12 운영 제외일과 이중으로 보호하고 있으므로 둘 중 하나만 남기지 마세요.
- 차감 시작일은 기수 기간 안에서만 지정할 수 있습니다. 설정 화면의 기수 만들기·현재 기수 수정에서 변경하며, 비우면 시작일과 같아집니다.
- 차감 시작일 이전 평일은 참가자 달력에서 주말·휴일과 같은 '숙제 없는 날'로 표시됩니다. 별도 상태를 만들지 않았습니다.
- 참가자 홈에는 차감 시작 전 남은 일수와 시작 당일 안내 배너가 자동으로 표시되고, 시작 다음 날부터 사라집니다.
- 관리자 실천 현황의 '이번 주 확정 차감'은 조회 월과 무관하게 이번 주 확정 미제출만 집계합니다. 마감 전 대기는 포함하지 않습니다.
