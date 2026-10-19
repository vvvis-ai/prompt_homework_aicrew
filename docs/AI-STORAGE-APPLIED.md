# AI 저장소 적용 및 관리자 로그인 복원

2026-10-19 (한국시간). 사용자가 취소된 적용을 재승인하여 진행.

- 대상: ai-learning-crew (`aaalqeduizqnjovcocuv`), 로컬 SUPABASE_URL과 일치.
- 원격 migration: `20261019082716_personal_ai_assistant`. 로컬 원본 `20261019065739_personal_ai_assistant.sql`과 같은 SQL. 원격 도구가 적용 시각으로 버전을 부여했으므로 추후 CLI migration 동기화 시 이 매핑을 사용하고 같은 파일을 재적용하지 않는다.
- ai_settings / ai_states / ai_requests / ai_calls / ai_settings_audit 5개 테이블 및 8개 함수 생성.
- 초기값: AI 켜짐, 개인 추천3/대화5, 전체 하루100/분당5. 전역 한도는 구현 기본값이며 공급자 프로젝트 한도에 맞춰 운영자가 조정해야 한다.
- 기존 참가자36, 제출346, 운영자5 유지. 기존 테이블 수정 없음.
- 새5개 테이블 RLS 활성, anon/authenticated SELECT 권한 없음, service_role SELECT 허용 확인.
- 보안 advisor의 RLS enabled/no policy INFO는 서버 전용 테이블의 공개 접근 차단 설계에 따른 알림이다. 공개 정책을 추가하지 않았다. 참고: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- AI 요청 시작→호출 카운트→결과 저장→성공 상태를 실제 DB에서 검증. 서버 역할(service_role)에서도 재검증. 두 검사 모두 트랜잭션을 ROLLBACK하여 시험 기록과 개인 한도 변경을 남기지 않음.
- 사용자 지정 관리자 비밀번호는 bcrypt cost12 해시로 `.env.local`에 저장. dotenv의 달러 치환을 피하도록 이스케이프. 평문 설정은 비우고 누락된 로컬 세션 비밀값을 생성. 키·해시·비밀번호는 본 문서에 기록하지 않음.
- 기존 Supabase password-crypto에서 해시 검증 성공. 실제 로컬 HTTP 로그인200→운영자선택200→관리자데이터200→AI설정200. 미인증 AI관리자401 확인. 일반 앱 데이터 demo=false 확인.

## 검토 화면

현재 실제 연결 로컬 서버: http://127.0.0.1:3101
관리자: http://127.0.0.1:3101/admin

서버를 다시 시작하려면 프로젝트에서 `npm run build` 후 `npm run start -- --hostname 127.0.0.1 --port 3101`.
`npm run review:ai`의 3100은 계속 고정 예시/메모리 체험 모드다. 3101에서 AI를 요청하면 실제 Gemini 호출과 Supabase 저장이 이루어진다.

## 범위와 남은 일

웹앱 배포, GitHub push, 배포된 서버 환경변수 변경은 하지 않음. 이번 관리자 비밀번호 복원은 로컬 서버에 적용된 것이며 배포 서버 설정을 바꾼 것은 아님.
AI 만료 정리 함수는 등록되었으나 Cloudflare 정기 실행 설정은 아직 배포하지 않았다. 로컬 조회 시 만료 콘텐츠는 걸러지지만 DB의 정기 물리 삭제는 웹앱 배포 시 cron 실행 확인이 필요하다. 이번 작업에서 별도 운영 스케줄러를 임의로 활성화하지 않았다.
기존 GEMINI-LIVE-TEST의 실제 Gemini 단독 스트리밍 검사 통과 결과는 유효하다. 이번 적용 검증에서는 참가자 이름으로 새 모델 요청을 추가하지 않았다.
