# AI 러닝크루 프롬프트 챌린지 아키텍처

이 문서는 개발 명세의 사전 검토 결과이며 구현의 기준이다. 사용자 화면은 모바일 우선 단일 작업 화면으로, 운영자 화면은 별도 `/admin` 작업 공간으로 구성한다.

## 1. 전체 구조

- Next.js 16 App Router + TypeScript + Tailwind CSS
- Vercel의 Node.js 서버 런타임에서 Route Handler를 실행한다.
- Supabase PostgreSQL은 영구 데이터의 단일 원본이다.
- 브라우저는 Supabase에 직접 접근하지 않는다. `src/server`의 Data Access Layer만 서버 전용 Supabase secret key를 사용한다.
- 참가자 선택값과 북마크만 브라우저 `localStorage`에 저장한다.
- 화면에 전달하는 데이터는 목적별 DTO로 제한하며 `edit_password_hash`, 금액, 면제 상세 등은 공개 DTO에 포함하지 않는다.

## 2. Next.js 폴더 구조

```text
src/
  app/
    api/                 # 공개/관리자 Route Handler
    admin/               # 관리자 화면
    page.tsx             # 참가자 앱
  components/            # 참가자/관리자 UI
  lib/                   # 시간, 상태, 정산, 검증 등 순수 로직
  server/                # server-only DB, 세션, DTO, 서비스
supabase/
  migrations/            # 재현 가능한 스키마 변경
  tests/                 # RLS/제약 테스트
docs/                    # 설계와 운영 문서
```

## 3. 데이터 모델과 마이그레이션

핵심 테이블은 `challenges`, `participants`, `submissions`, `exemptions`, `excluded_dates`, `penalty_rates`, `notices`, `operators`, `audit_logs`다. 금액은 원 단위 `bigint`, 업무 날짜는 `date`, 실제 시각은 `timestamptz`로 저장한다. 모든 외래키는 조회 경로에 맞는 인덱스를 둔다.

`submissions.submitted_at`은 DB 기본값으로 한 번만 기록하고 트리거로 변경을 차단한다. `updated_at`은 내용 수정 시각일 뿐 완료 판정에는 사용하지 않는다. 참가자와 정규화 URL 조합은 유일해야 한다.

기수 생성 트리거가 시작일을 `effective_from`으로 하는 최초 `penalty_rates` 행을 같은 트랜잭션에서 만든다. 계산 결과(완료/미제출/면제/스트릭/차감/반환액/순위)는 저장하지 않고 원본에서 재계산한다.

## 4. RLS와 공개 범위

- 노출 스키마의 모든 테이블에 RLS를 활성화한다.
- `anon`, `authenticated`, `PUBLIC`의 테이블·시퀀스·함수 권한을 명시적으로 회수한다.
- 서버의 secret/service-role 키에만 필요한 권한을 부여한다.
- 공개 Route Handler도 안전한 열만 명시적으로 선택한다. `select('*')`를 금지한다.
- 참가자 개인 캘린더는 요청한 `participant_id` 한 명의 데이터만 반환한다. 다른 사람의 미제출·면제·금액 자료는 반환하지 않는다.

참가자 본인 확인 기능을 의도적으로 두지 않는 명세 특성상, 이름을 바꿔 선택하면 그 참가자의 개인 현황을 볼 수 있다. 다만 게시물 변경은 게시물별 비밀번호가 필요하며 금액·관리자 자료는 관리자 세션 없이는 접근할 수 없다.

## 5. 관리자 인증

- `ADMIN_PASSWORD_HASH`(권장) 또는 `ADMIN_PASSWORD`를 Vercel 환경변수에 둔다. 초기 운영값은 배포 환경에서만 설정한다.
- 로그인 Route Handler가 서버에서 비밀번호를 검증하고, `ADMIN_SESSION_SECRET`으로 서명한 짧은 수명의 JWT를 HttpOnly·Secure·SameSite=Lax 쿠키에 저장한다.
- 운영자 선택 이후 운영자 ID도 서버가 검증해 세션에 넣는다.
- 각 관리자 읽기/쓰기 엔드포인트와 Data Access Layer에서 세션과 운영자 활성 상태를 다시 확인한다.

## 6. 게시물 비밀번호

등록 Route Handler에서 bcrypt로 해시하고 `edit_password_hash`만 저장한다. 수정·삭제 시 서버가 등록일과 현재 KST 날짜가 같고 제출 마감 전인지 먼저 확인한 뒤 비밀번호를 비교한다. 관리자 변경은 관리자 세션을 재검증한다. 해시 열은 어떤 DTO/API 응답에도 포함하지 않는다.

## 7. Asia/Seoul 시간 규칙

모든 업무 날짜와 시각 판정은 `Asia/Seoul` 유틸리티 하나를 통한다. 저장은 `timestamptz`, 표시와 날짜 범위 생성은 KST다. 브라우저 시각은 신뢰하지 않고 서버/DB 시각을 사용한다.

- 숙제 인정: 해당 KST 날짜 `00:00:00.000` 이상 `23:01:00.000` 미만. 즉 마지막 인정 시각은 `23:00:59.999`다.
- 미제출 확정: KST `23:01:00.000`부터다.
- 참가자 수정·삭제: 최초 등록 KST 날짜와 같은 날이며 제출 인정 마감과 동일하게 `23:01:00.000` 미만이다. 화면에는 `23:00 마감`으로 안내한다.
- 완료 판정은 오직 `submitted_at`을 사용한다.

## 8. 일별 상태 계산

1. 참가 시작일 이전 또는 하차일 이후(하차일 포함 제외)면 대상 아님.
2. 토·일, `excluded_dates`의 공휴일/관리자 비대상일이면 대상 아님.
3. 대상일이면서 개인 `exemptions`가 있으면 면제.
4. `submitted_at` 기준 KST 마감 전 링크가 하나 이상이면 완료.
5. 오늘이고 23:01 이전이면 아직 미제출.
6. 과거이거나 오늘 23:01 이후면 미제출 확정.
7. 미래 날짜에는 상태를 표시하지 않는다.

마감 뒤 등록, 주말·공휴일 등록도 공유 피드와 전체 링크 수에는 포함한다.

## 9. 공휴일·비대상일

두 종류 모두 `excluded_dates`에 저장하고 `source`를 `holiday` 또는 `admin`으로 구분한다. 운영기간 공휴일은 배포 전 seed/import하고, 관리자가 추가·삭제할 수 있다. 같은 기수·날짜는 한 행만 허용한다.

## 10. 스트릭

참가 시작일부터 오늘(오늘 23:01 이전 미제출이면 직전 확정일까지)까지 숙제 대상일만 순회한다. 완료는 1 증가, 면제와 비대상일은 건너뛰고, 확정 미제출에서 0으로 끊는다. 마감 뒤 링크는 증가나 복원에 사용하지 않는다.

## 11. 차감과 정산

각 확정 미제출일마다 `effective_from <= 날짜`인 가장 최근 차감단가를 적용한다. 현재 단가를 과거 날짜에 소급하지 않는다. 예상 반환액은 `paid_amount - 일별 차감 합계`다. 금액 DTO와 내보내기는 관리자 전용이다.

## 12. Audit Log

관리자 변경 서비스가 변경 전 행을 읽고 작업을 수행한 뒤 변경 후 행과 함께 로그를 남긴다. 기수/운영자/작업/엔터티/대상 ID/전후 JSON/시각을 기록한다. 운영자 작업은 가능한 한 DB 함수 또는 단일 서비스 흐름에서 원자적으로 처리한다.

## 13. 구현 순서와 검증

명세의 Phase 1~8 순서를 유지한다. 각 Phase 종료 때 `typecheck`, `lint`, `build`, 핵심 Vitest를 실행한다. DB 연결이 제공되면 Supabase 마이그레이션·RLS 테스트와 DB advisor도 실행한다. 최종 산출물은 `.env.example`, 마이그레이션, seed, 운영 문서와 함께 Vercel에 배포 가능한 상태로 만든다.
