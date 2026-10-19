# 실제 Gemini 연결 테스트

프로젝트 루트 `.env.local`의 기존 설정을 유지한 채 다음 두 항목을 추가한다. 키를 채팅·Git·브라우저 코드에 넣지 않는다.

```dotenv
GEMINI_API_KEY=발급받은_API_키
GEMINI_MODEL=gemini-3.5-flash-lite
```

모델 예시는 2026-10-19 공식 모델/가격 문서에 무료 티어가 표시된 텍스트 모델이다. 실제 프로젝트의 사용 가능 여부와 할당량은 호출 시 확인한다. 결제가 연결된 프로젝트의 무료 적용을 보장하는 설정은 아니다.

- 키 발급: https://aistudio.google.com/apikey
- 공식 가격: https://ai.google.dev/gemini-api/docs/pricing
- 공식 모델 목록: https://ai.google.dev/gemini-api/docs/models

실행: `npm run test:gemini-live`

앱의 `src/server/ai/gemini.ts` 연결 코드를 직접 호출한다. 가상의 독서 모임 프롬프트를 1개 요청하며, 일시 오류 때 최대 1회 재시도한다. HTTP 상태·소요시간·스트리밍 이벤트 수·검증된 카드 수만 출력하고 키·응답 원문은 출력하지 않는다. Supabase 연결과 배포는 실행하지 않는다. 이 검사는 실제 웹 UI→DB 전체 흐름 검증을 대신하지 않는다.

일반 `npm test`는 이 실제 호출 검사를 실행하지 않는다. 실제 호출은 위 전용 명령으로만 실행한다. 기존 `npm run review:ai` 화면은 계속 모의 응답이므로 여기에 키를 추가해도 체험 화면이 실제 호출로 바뀌지는 않는다.

2026-10-19 준비 결과: 환경변수 점검 시 Gemini 키·모델이 모두 없었다. 설정 누락 안내와 외부 호출 없이 종료되는 것을 확인했다. 실제 API 성공 여부는 아직 미검증이다.

실제 호출 결과 (2026-10-19 17:14 KST): 사용자가 Gemini 키를 저장한 뒤 누락된 모델명만 `gemini-3.5-flash-lite`로 추가했다. `npm run test:gemini-live` 1개 검사 통과. 앱의 Gemini 연결 코드를 통한 실제 응답 수신, 비어 있지 않은 스트리밍 미리보기, 프롬프트 카드 1개와 구조화 응답 검증 성공. Supabase·운영 DB는 사용하지 않았고 배포도 하지 않았다. 이는 Gemini 단독 전송 계층 검사이며 웹 화면과 운영 DB 전체 연결 검사를 뜻하지 않는다.
