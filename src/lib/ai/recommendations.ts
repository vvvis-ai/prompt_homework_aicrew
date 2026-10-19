import { AiError, type AiState } from "./types";
import { recommendationFields } from "./domain";
const subjects = ["하루 계획", "주간 회고", "회의 준비", "자료 조사", "일정 관리", "문제 해결", "아이디어 정리", "설명 자료", "피드백", "의사 결정", "학습 계획", "성과 기록"];
const tasks = ["초안 작성", "핵심 요약", "체크리스트 만들기", "질문 만들기", "비교 기준 세우기", "실행 순서 정하기", "위험요소 찾기", "예시 만들기", "표 구성", "대안 탐색", "문장 다듬기", "자기 점검", "목표 구체화", "우선순위 정하기", "원인 분석", "관점 전환", "쉬운 설명", "발표 구성", "시간 배분", "평가 기준 만들기", "다음 행동 정하기", "반론 검토", "핵심 용어 정리", "개선 실험 설계"];
export function choosePurposes(state:AiState) {
 const seen=new Set(state.purposes.map(p=>p.key));
 return recommendationFields(state).map((field,index)=>{
  const pool=subjects.flatMap(subject=>tasks.map(task=>({key:field+"/"+subject+"/"+task,title:field+" · "+subject+" "+task,field})));
  const item=pool.find(p=>!seen.has(p.key));
  if(!item)throw new AiError("PURPOSES_EXHAUSTED","최근 30일과 겹치지 않는 목적을 찾지 못했어요. 관심 분야를 넓혀주세요.");
  seen.add(item.key);
  return {...item,source:index===2?"explore" as const:"personal" as const};
 });
}
