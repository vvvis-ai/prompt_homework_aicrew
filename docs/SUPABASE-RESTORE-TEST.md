# Supabase 키 복원 검증

검증일: 2026-10-19 17:18 KST. 사용자 지정 프로젝트의 `.env.local`로 검사했다. 비밀값을 출력하거나 변경하지 않았다.

## 통과

- Supabase URL과 서버용 sb_secret 키가 존재하며 실제 원격 조회 성공.
- 기존10개 테이블 조회 HTTP200: challenges2, participants36, submissions346, operators5, penalty_rates2, exemptions17, excluded_dates15, notices0, audit_logs109, push_reminders5.
- 앱의 실제 getAppData를 실행해 홈/공유 데이터 및 선택 참가자의 달력/성장 집계 생성 확인.
- 앱의 실제 getAdminData를 실행해 관리자/정산 데이터 조립 확인. 내부 테스트용 세션 객체만 제공했으며 로그인 성공이나 세션 발급을 검증한 것은 아님.
- 미인증 관리자 데이터 차단 확인.
- 읽기 전용 실연결 테스트3개 통과. fetch에서 GET/HEAD 외 메서드를 차단했다.
- 기존 회귀 테스트17개 파일150개 통과.

## 미복원·미적용

- 로컬 ADMIN_SESSION_SECRET 및 관리자 비밀번호 설정(ADMIN_PASSWORD_PBKDF2/ADMIN_PASSWORD_HASH/ADMIN_PASSWORD)이 모두 없음. 따라서 로컬 관리자 로그인은 원상복구 완료가 아니다. 임의 비밀번호/세션키를 만들지 않았다. 운영 배포의 설정은 별도로 확인하지 않았으며 변경하지 않았다.
- ai_settings/ai_states/ai_requests/ai_calls는 직접 REST GET에서 HTTP404, PGRST205. 새 AI migration을 아직 운영에 적용하지 않은 상태와 일치한다. HEAD 조회의 성공처럼 보이는 응답은 존재 증거로 사용하지 않았다.
- 기존 과제 제출·정산의 실제 쓰기 작업은 실행하지 않았다. 해당 로직은 기존 자동 테스트로 확인했다.

## 재검사

`node scripts/test-supabase-readonly.mjs`

일반 npm test에는 포함되지 않는 명시적 실연결 검사다. 운영 데이터 수정·배포·DB migration은 실행하지 않는다. 기존 review:ai 화면은 운영 DB와 분리된 체험 모드이므로 이 검사 결과와 구분한다.
