# 개인 AI 운영 배포 기록

## 2026-10-19 배포 준비

- 사용자가 기존 로컬 검토 제한을 해제하고 커밋·GitHub 푸시·Cloudflare 배포를 명시적으로 요청함.
- 대상: origin/main (vvvis-ai/prompt_homework_aicrew), Cloudflare Worker prompt-homework-aicrew.
- 검증: Next.js 빌드 및 타입 검사, ESLint, Vitest 150개, 격리 PostgreSQL 29개, vinext 운영 빌드, Wrangler dry-run 통과.
- 운영 AI DB migration은 이미 적용되어 재실행하지 않음. 기존 과제·정산 테이블 변경 없음.
- 배포 전에 GEMINI_API_KEY와 GEMINI_MODEL을 Worker 서버 비밀값으로 설정해야 함. 기존 Supabase·관리자·알림 키는 유지.
- Cloudflare 인증 만료로 로그인 갱신 중. 첫 기본 OAuth 요청은 불필요하게 넓은 권한 때문에 자동 검토에서 차단되었고 취소함. 계정 조회와 workers_scripts:write 권한만으로 다시 요청.
- 배포 후 홈/AI 설정 여부, 비인증 관리자 및 정리 API 차단, 기존 앱 데이터, 만료 정리 cron 등록을 확인할 것.
- 원문88개와의 전체 대조 및 분당 제한 UX 선택은 기존 문서대로 미확정이며 배포 요청을 추가 설계 결정으로 간주하지 않음.

## 배포 완료

- 코드 커밋: 7706049, origin/main 푸시 완료.
- Cloudflare 제한 권한 로그인 갱신 성공, 기존 서버 비밀값 유지. Gemini 키·모델만 서버 비밀값으로 추가. Git 및 클라이언트 산출물 비밀값 검사 통과.
- 배포 URL: https://prompt-homework-aicrew.antae98.workers.dev
- Worker 버전: d981da54-8444-43d1-bc94-0c1d1dd76355
- 기존 알림 cron 및 AI 정리 cron(5분 간격) 배포 등록 확인. 실제 정기 실행 결과는 아직 관측하지 않음.
- 운영 HTTP: 홈200, 관리자화면200, 일반 앱200(demo=false, 참가자36명), 개인AI200(configured=true, demo=false), 비인증 AI관리자401, 비인증 정리401 확인.
- 운영 설정: 추천3/대화5, 전체 하루100/분5 유지.
- 공개 manifest에서 번들명을 찾는 보조 검사는 일치하지 않았으며, 실제 배포 로그의 JS/CSS URL 직접 검사로 확인.
- 이번 배포 검증에서 실제 Gemini 질문은 전송하지 않았으므로 사용자 한도를 차감하지 않음. 운영 전체 대화 스트리밍 및 실제 cron 실행은 추가 관측 필요. 이전 로컬 Gemini 실호출 검증 결과는 GEMINI-LIVE-TEST.md 참조.
- 사용자 미추적 예시.png는 이번 코드 변경과 무관하여 보존하고 커밋에서 제외.
