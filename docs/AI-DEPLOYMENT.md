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
