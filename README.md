# AI 러닝크루

AI 프롬프트 숙제 제출, 공유, 개인·크루 성장 확인, 면제·미제출 판정과 월별 정산을 한곳에서 운영하는 모바일 우선 웹앱입니다.

- 운영 사이트: <https://prompt-homework-aicrew.antae98.workers.dev>
- 관리자 화면: <https://prompt-homework-aicrew.antae98.workers.dev/admin>

## 주요 기능

- 매일 AI를 한 번 써보도록 돕는 선택형 3분 미션과 시작 프롬프트 복사
- 운영진의 날짜별 미션 예약, 미등록 날짜의 기본 미션 자동 제공
- 이번 주 실천 기록, 미제출 뒤 다시 시작 안내, 링크 우선 제출과 완료 확인
- 기기별 선택형 웹 푸시 알림(08:00~22:45 KST, 15분 단위 설정, 최대 약 5분 후 발송)
- 제출 완료·휴일·면제·참여 기간 밖에는 알림 제외, 기기에서 언제든 해제
- 관리자 전용 오늘 미제출 필터·안내문 복사·연속 미제출 안부 확인·주간 실천 집계
- 순위 대신 따라 해보기 쉬운 사례 추천. 실천 수치는 제출 기록 기준이며 실제 AI 사용을 자동 측정하지 않음

- 로그인 없는 참가자 이름 선택과 기기별 선택 기억
- URL·선택 제목·선택 설명·수정/삭제 비밀번호를 포함한 제출
- 한국 시간 기준 `23:00:59` 제출 인정, `23:01:00` 미제출 확정
- 제출 당일 숙제 제출 마감 시각(`23:00`)까지 참가자 수정·삭제
- 주말·대한민국 공휴일·운영 제외일·개인 면제일 처리
- 공유 피드, 날짜 탐색, 검색, 추천 프롬프트, 기기별 북마크
- 비교 없는 개인 성장 기록, 크루 공동 목표, 전체 링크 수와 연속 달성
- 관리자 인증, 운영자 선택, 다기수·참가자·공지·제출물 관리
- 날짜별 벌금 단가, 실제 납부액, 예상 환급액, CSV/XLSX 정산
- 모든 주요 관리자 변경의 감사 기록

## 로컬 실행

```bash
npm install
npm run dev
```

Supabase 없이 실행하면 개발 환경에서 자동으로 체험 데이터가 표시됩니다. 참가자 화면은 `http://localhost:3000`, 관리자 화면은 `http://localhost:3000/admin`입니다. 로컬 체험 모드의 초기 관리자 비밀번호는 `010723`입니다.

실제 DB를 사용하려면 `.env.example`을 참고해 `.env.local`을 만들고 `DEMO_MODE=false`로 설정하세요. 비밀값에는 절대로 `NEXT_PUBLIC_` 접두사를 붙이지 않습니다.

## 필수 환경변수

| 이름 | 설명 |
| --- | --- |
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_SECRET_KEY` | 서버 전용 Supabase Secret Key |
| `ADMIN_PASSWORD_PBKDF2` | Cloudflare 운영용 PBKDF2 관리자 비밀번호 검증값 |
| `ADMIN_PASSWORD_HASH` | 이전 bcrypt 검증값과의 호환용 |
| `ADMIN_PASSWORD` | 로컬 개발에서만 사용하는 대체 관리자 비밀번호 |
| `ADMIN_SESSION_SECRET` | 32자 이상의 임의 문자열 |
| `DEMO_MODE` | 운영 환경에서는 반드시 `false` |
| `VAPID_PUBLIC_KEY` | 웹 푸시 구독용 P-256 공개키(base64url) |
| `VAPID_PRIVATE_JWK` | 웹 푸시 발송용 P-256 비밀키(JWK JSON), Workers Secret에만 저장 |

운영 환경에서는 `ADMIN_PASSWORD_PBKDF2`를 사용합니다. 비밀값은 Git에 커밋하지 않고 Cloudflare Workers Secret으로만 관리합니다.

## 데이터베이스

마이그레이션과 개발용 초기 데이터는 `supabase/` 아래에 있습니다.

```bash
npx supabase start
npx supabase db reset
npx supabase test db
```

브라우저 역할은 DB 테이블 권한이 없고, 앱의 서버 API만 Secret Key로 접근합니다. RLS와 권한 회귀 검사는 `supabase/tests/database/security.test.sql`에 있습니다.

## 검증

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Cloudflare Workers 배포 순서와 운영 전 점검은 [운영 및 배포 안내](docs/OPERATIONS.md)를 확인하세요. 설계 근거는 [아키텍처 문서](docs/ARCHITECTURE.md)에 정리되어 있습니다.

## 여러 PC에서 작업하기

GitHub의 `main` 브랜치를 두 PC 사이의 기준으로 사용합니다.

1. 작업을 시작하기 전에 `git pull`로 최신 내용을 받습니다.
2. Codex 앱에서 이 저장소 폴더를 로컬 프로젝트로 엽니다.
3. 수정 후 타입 검사, 린트, 테스트와 Cloudflare 빌드를 실행합니다.
4. 작업이 끝나면 변경 내용을 커밋하고 `git push`합니다.
5. 다른 PC에서는 다시 `git pull`한 뒤 작업합니다.

두 PC에서 같은 파일을 동시에 수정하지 않습니다. `.env*`, `.dev.vars*`, Supabase Secret Key, 관리자 비밀번호와 Cloudflare 인증 정보는 절대로 커밋하지 않습니다.
