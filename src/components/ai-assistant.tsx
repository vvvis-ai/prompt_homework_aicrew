"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FIELDS, type Card, type Draft, type Field, type Saved, type Snapshot } from "@/lib/ai/types";
import { anonymize, inspectPrivacy } from "@/lib/ai/privacy";
import { DAY, remainingReset, context } from "@/lib/ai/domain";
import { kstDateKey } from "@/lib/time";
import { starterMission, type DailyMission } from "@/lib/habits";
import type { Action } from "@/server/ai/service";
import "./ai-assistant.css";

type ApiProblem={error:string;code:string;details?:unknown};
async function json<T>(response:Response):Promise<T>{
 const data=await response.json();if(!response.ok)throw data as ApiProblem;return data as T;
}
function message(error:unknown){return typeof error==="object"&&error&&"error" in error?String(error.error):"처리하지 못했습니다. 다시 확인해주세요.";}
function PrivacyView({text,onChange,ack,onAck}:{text:string;onChange:(s:string)=>void;ack:boolean;onAck:(v:boolean)=>void}){
 const findings=inspectPrivacy(text);
 if(!findings.length)return null;
 let cursor=0;const pieces:React.ReactNode[]=[];
 for(const f of findings){pieces.push(text.slice(cursor,f.start));pieces.push(<mark key={f.start} title={f.label}>{text.slice(f.start,f.end)}</mark>);cursor=f.end;}
 pieces.push(text.slice(cursor));
 return <div className="ai-privacy"><strong>개인정보로 보이는 부분을 확인해주세요</strong><pre>{pieces}</pre>
 <button type="button" onClick={()=>{onChange(anonymize(text));onAck(false);}}>표시된 정보 익명화</button>
 {findings.some(f=>f.risk==="high")?<p>민감한 정보는 지운 뒤 다시 검사합니다.</p>:<label><input type="checkbox" checked={ack} onChange={e=>onAck(e.target.checked)}/> 내용을 확인했으며 계속 진행합니다</label>}</div>;
}
function PromptCard({card,draft,saved,expiresAt,now,disabled,act,onImprove,notify}:{card:Card;draft?:Draft;saved?:Saved;expiresAt?:string;now:string;disabled:boolean;act:(a:Action)=>Promise<Snapshot>;onImprove:(c:Card,text:string)=>void;notify:(s:string)=>void}){
 const [editing,setEditing]=useState(false),[text,setText]=useState(draft?.text??card.prompt),[title,setTitle]=useState(card.title),[fields,setFields]=useState<Field[]>(card.fields);
 const [draftVersion,setDraftVersion]=useState(draft?.version??0),[ack,setAck]=useState(false),[conflict,setConflict]=useState<Draft|null|undefined>(undefined),[pending,setPending]=useState(false);
 const [savedVersion,setSavedVersion]=useState(saved?.version),[savedConflict,setSavedConflict]=useState<Saved|null>(null);
 const perform=async(fn:()=>Promise<unknown>)=>{setPending(true);try{await fn();}catch(e){notify(message(e));}finally{setPending(false);}};
 const persistDraft=async(version=draftVersion)=>{
  try{const next=await act({action:"draft",cardId:card.id,text,expectedVersion:version,privacyAcknowledged:ack});setDraftVersion(next.state.drafts.find(d=>d.cardId===card.id)?.version??0);setConflict(undefined);notify("초안을 7일간 저장했어요.");}
  catch(e){if((e as ApiProblem).code==="DRAFT_CONFLICT")setConflict((e as ApiProblem).details as Draft|null);else throw e;}
 };
 const save=async(version=savedVersion)=>{
  const target=saved;
  if(target&&!window.confirm("보관함의 기존 내용을 이 수정본으로 덮어쓸까요?"))return;
  try {
   const next=await act({action:"save",cardId:card.id,title,text,fields,updateId:target?.id,expectedVersion:version,confirm:Boolean(target),privacyAcknowledged:ack});
   setSavedVersion(next.state.saved.find(s=>s.id===target?.id)?.version);setSavedConflict(null);
  } catch(e) {if((e as ApiProblem).code==="SAVED_CONFLICT"){setSavedConflict((e as ApiProblem).details as Saved);setEditing(true);return;}throw e;}
  notify(target?"보관함을 업데이트했어요.":"보관함에 저장했어요.");
 };
 const blocked=disabled||pending;
 return <article className="ai-prompt-card">
  <div className="ai-card-heading"><span>{card.source==="explore"?"새로운 발견":card.source==="personal"?"맞춤 추천":"프롬프트"}</span>{expiresAt&&Date.parse(expiresAt)-Date.parse(now)<DAY&&<strong>24시간 이내 만료</strong>}</div>
  <h3>{card.title}</h3><div className="ai-tags">{card.fields.map(f=><span key={f}>{f}</span>)}</div>
  {editing?<div className="ai-editor">
   <label>제목<input value={title} maxLength={100} onChange={e=>{setTitle(e.target.value);setAck(false);}}/></label>
   <label>프롬프트 직접 편집<textarea value={text} maxLength={5000} onChange={e=>{setText(e.target.value);setAck(false);}} rows={7}/></label>
   <fieldset><legend>분야 (최대 3개)</legend>{FIELDS.map(f=><label key={f}><input type="checkbox" checked={fields.includes(f)} disabled={!fields.includes(f)&&fields.length>=3} onChange={e=>setFields(e.target.checked?[...fields,f]:fields.filter(v=>v!==f))}/>{f}</label>)}</fieldset>
   <PrivacyView text={title} onChange={setTitle} ack={ack} onAck={setAck}/>
   <PrivacyView text={text} onChange={setText} ack={ack} onAck={setAck}/>
   <button disabled={blocked} onClick={()=>perform(()=>persistDraft())}>수정 초안 저장 · 7일</button>
   {conflict!==undefined&&<div className="ai-conflict"><p>다른 기기의 수정본이 있습니다. 사용할 내용을 선택해주세요.</p><pre>{conflict?.text??"저장된 초안이 만료되었습니다."}</pre>
    <button onClick={()=>{setText(conflict?.text??card.prompt);setDraftVersion(conflict?.version??0);setConflict(undefined);}}>다른 기기 내용 사용</button>
    <button onClick={()=>perform(()=>persistDraft(conflict?.version??0))}>내 수정본으로 저장</button></div>}
  {savedConflict&&<div className="ai-conflict"><p>다른 기기에서 보관함을 수정했습니다. 사용할 내용을 선택해주세요.</p><strong>{savedConflict.title}</strong><pre>{savedConflict.prompt}</pre><button disabled={blocked} onClick={()=>{setTitle(savedConflict.title);setText(savedConflict.prompt);setFields(savedConflict.fields);setSavedVersion(savedConflict.version);setSavedConflict(null);setAck(false);}}>다른 기기 보관본 사용</button><button disabled={blocked} onClick={()=>perform(()=>save(savedConflict.version))}>내 수정본으로 보관함 업데이트</button></div>}
  </div>:<pre>{text}</pre>}
  <div className="ai-actions">
   <button disabled={blocked} onClick={()=>navigator.clipboard.writeText(text).then(()=>notify("복사했어요.")).catch(()=>notify("복사 권한을 확인해주세요."))}>복사</button>
   <button disabled={blocked} onClick={()=>setEditing(!editing)}>{editing?"편집 접기":"직접 편집"}</button>
   <button disabled={blocked} onClick={()=>perform(()=>save())}>{saved?"보관함 업데이트":"보관"}</button>
   <button disabled={blocked} onClick={()=>onImprove(card,text)}>{saved?.id===card.id?"새 방에서 발전":"이 프롬프트 개선"}</button>
  </div>
  <div className="ai-feedback"><button disabled={blocked} onClick={()=>perform(()=>act({action:"feedback",cardId:card.id,value:"used"}))}>써봤어요</button><button disabled={blocked} onClick={()=>perform(()=>act({action:"feedback",cardId:card.id,value:"dislike"}))}>관심없어요</button>
  {saved&&<button disabled={blocked} onClick={()=>{if(window.confirm("보관함에서 삭제할까요?"))void perform(()=>act({action:"deleteSaved",id:saved.id}));}}>삭제</button>}</div>
 </article>;
}
const QUICK_STARTERS = [
 {title:"오늘 할 일 정리하기",prompt:"오늘 해야 할 일은 [할 일 목록]이고, 쓸 수 있는 시간은 [시간]입니다. 우선순위를 정하고 바로 시작할 첫 행동을 알려주세요."},
 {title:"긴 글 요약하기",prompt:"다음 글의 핵심을 세 줄로 요약하고, 내가 할 일을 따로 정리해주세요. 글에 없는 내용은 추가하지 마세요. 글: [공개 가능한 내용]"},
 {title:"아이디어 3개 얻기",prompt:"[해결하고 싶은 작은 문제]에 대해 오늘 바로 시도할 수 있는 아이디어 3개를 제안해주세요. 준비와 비용이 적게 드는 순서로 알려주세요."},
];
function QuickStart({today,hasMessages,disabled,onChoose}:{today:string;hasMessages:boolean;disabled:boolean;onChoose:(prompt:string)=>void}){
 const [mission,setMission]=useState<DailyMission|null>(null);
 useEffect(()=>{
  const controller=new AbortController();
  fetch("/api/missions",{cache:"no-store",signal:controller.signal}).then(async response=>{
   if(response.ok){const next=await response.json() as DailyMission;if(!controller.signal.aborted)setMission(next);}
  }).catch(()=>{});
  return()=>controller.abort();
 },[today]);
 const daily=mission?.date===today?mission:starterMission(today);
 return <details className="ai-quick-start" open={!hasMessages}>
  <summary>가볍게 시작하기 <span>작은 질문 하나부터</span></summary>
  <p>예시를 누른 뒤 [괄호] 안을 내 상황에 맞게 바꿔보세요. 전송을 눌러야 대화가 시작돼요.</p>
  <div className="ai-starter-buttons">{QUICK_STARTERS.map(item=><button type="button" key={item.title} disabled={disabled} onClick={()=>onChoose(item.prompt)}>{item.title} ↗</button>)}</div>
  <div className="ai-daily-starter"><small>오늘의 시작 아이디어</small><button type="button" disabled={disabled} onClick={()=>onChoose(daily.prompt)}>{daily.title} →</button></div>
 </details>;
}
export function AiAssistant({participantId}:{participantId:string}){
 const [open,setOpen]=useState(false);
 return <><button type="button" className="ai-launch" onClick={()=>setOpen(true)}><span>✦</span><span><strong>나만의 AI 도우미</strong><small>오늘의 추천부터 프롬프트 개선까지</small></span><span>열기 →</span></button>
 {open&&<AssistantDialog key={participantId} participantId={participantId} onClose={()=>setOpen(false)}/>}</>;
}
function AssistantDialog({participantId,onClose}:{participantId:string;onClose:()=>void}){
 const watchedRequest=useRef<string|null>(null);
 const messageInput=useRef<HTMLTextAreaElement>(null);
 const [anonymizedRoom,setAnonymizedRoom]=useState<string>();
 const dialog=useRef<HTMLDialogElement>(null),initial=useRef(true),connection=useRef<AbortController|null>(null);
 const [snap,setSnap]=useState<Snapshot|null>(null),[tab,setTab]=useState<"chat"|"recommend"|"saved">("chat"),[roomId,setRoomId]=useState<string|undefined>();
 const [text,setText]=useState(""),[selected,setSelected]=useState<{card:Card;text:string;savedId?:string}|null>(null);
 const [notice,setNotice]=useState(""),[preview,setPreview]=useState(""),[sending,setSending]=useState(false),[requestId,setRequestId]=useState<string>();
 const [ack,setAck]=useState(false),[detail,setDetail]=useState(false),[count,setCount]=useState(1),[search,setSearch]=useState(""),[filter,setFilter]=useState(""),[sort,setSort]=useState("updated");
 const headers={"Content-Type":"application/json","x-ai-participant":participantId};
 const load=useCallback(async()=>{
  const next=await json<Snapshot>(await fetch("/api/ai",{headers:{"x-ai-participant":participantId},cache:"no-store"}));
  setSnap(previous=>previous&&previous.version>next.version?previous:next);
  if(watchedRequest.current){const finished=next.requests.find(r=>r.id===watchedRequest.current);if(finished&&finished.status!=="running"){if(finished.status==="success"&&finished.kind==="chat"){const restored=next.state.rooms.find(r=>r.messages.some(m=>m.id===finished.resultId));if(restored)setRoomId(restored.id);}watchedRequest.current=null;}}
  if(!watchedRequest.current)watchedRequest.current=next.requests.find(r=>r.status==="running")?.id??null;
  if(initial.current){initial.current=false;const recent=[...next.state.rooms].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];setRoomId(recent?.id);}
  return next;
 },[participantId]);
 useEffect(()=>{dialog.current?.showModal();const previous=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{document.body.style.overflow=previous;connection.current?.abort();};},[]);
 useEffect(()=>{
  const refresh=()=>{if(document.visibilityState==="visible")void load().catch(e=>setNotice(message(e)));};
  const first=setTimeout(refresh,0),timer=setInterval(refresh,5000);window.addEventListener("focus",refresh);
  return()=>{clearTimeout(first);clearInterval(timer);window.removeEventListener("focus",refresh);};
 },[load]);
 const act=async(a:Action)=>{const next=await json<Snapshot>(await fetch("/api/ai",{method:"POST",headers,body:JSON.stringify(a)}));setSnap(next);return next;};
 const running=snap?.requests.find(r=>r.status==="running"),busy=sending||Boolean(running);
 const today=kstDateKey(snap?.now??new Date());
 const remaining=(kind:"chat"|"recommend")=>Math.max(0,(kind==="chat"?snap?.settings.chatLimit??5:snap?.settings.recommendLimit??3)-(snap?.requests.filter(r=>r.kind===kind&&r.status==="success"&&r.day===today).length??0));
 const room=snap?.state.rooms.find(r=>r.id===roomId);
 const improve=(card:Card,value:string)=>{
  const saved=snap?.state.saved.find(c=>c.id===card.id);
  if(saved)setRoomId(undefined);
  setSelected({card,text:value,savedId:saved?.id??card.savedId});setText("이 프롬프트를 더 발전시켜 주세요.");setTab("chat");setAck(false);
 };
 const send=async(kind:"chat"|"recommend")=>{
  if(busy)return;
  const id=crypto.randomUUID();watchedRequest.current=id;setRequestId(id);setSending(true);setPreview("");setNotice("");
  const abort=new AbortController();connection.current=abort;
  try{
   const response=await fetch("/api/ai/generate",{method:"POST",headers,signal:abort.signal,body:JSON.stringify({requestId:id,kind,text:kind==="recommend"?"오늘의 프롬프트 추천":text,roomId:kind==="chat"?roomId:undefined,selectedCardId:kind==="chat"?selected?.card.id:undefined,selectedText:kind==="chat"?selected?.text:undefined,savedId:kind==="chat"&&!roomId?selected?.savedId:undefined,count,detail,anonymizeContext:kind==="chat"&&Boolean(roomId)&&anonymizedRoom===roomId,privacyAcknowledged:ack})});
   if(!response.ok)throw await response.json();
   if(response.headers.get("content-type")?.includes("application/json")){const data=await response.json() as {snapshot:Snapshot};setSnap(data.snapshot);return;}
   const reader=response.body!.getReader(),decoder=new TextDecoder();let buffer="",completed=false;
   const consume=(line:string)=>{
    if(!line.trim())return;
    const event=JSON.parse(line);
    if(event.type==="preview")setPreview(event.text);
    if(event.type==="error")throw event;
    if(event.type==="done"){
     const next=event.snapshot as Snapshot;setSnap(next);completed=true;
     if(kind==="chat"){setText("");setSelected(null);setRoomId([...next.state.rooms].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]?.id);}
    }
   };
   try{while(true){const chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true});const lines=buffer.split("\n");buffer=lines.pop()??"";lines.forEach(consume);}buffer+=decoder.decode();consume(buffer);}
   finally{reader.releaseLock();}
   if(!completed)setNotice("연결이 끊겼습니다. 완료된 답변은 다시 불러옵니다.");
  }catch(e){if(!abort.signal.aborted)setNotice(message(e));}
  finally{setSending(false);setPreview("");setRequestId(undefined);void load().catch(()=>{});}
 };
 const stop=async()=>{try{await json(await fetch("/api/ai/cancel",{method:"POST",headers,body:JSON.stringify({requestId:requestId??running?.id})}));setNotice("취소 요청을 보냈어요.");await load();}catch(e){setNotice(message(e));}};
 const cardView=(card:Card,expiresAt?:string,saved?:Saved)=><PromptCard key={card.id} card={card} expiresAt={expiresAt} now={snap?.now??""} saved={saved??(card.savedId?snap?.state.saved.find(s=>s.id===card.savedId):undefined)} draft={snap?.state.drafts.find(d=>d.cardId===card.id)} disabled={busy} act={act} onImprove={improve} notify={setNotice}/>;
 const batches=[...(snap?.state.recommendations??[])].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 const current=batches.find(b=>kstDateKey(b.createdAt)===today);
 const saved=(snap?.state.saved??[]).filter(c=>(!filter||c.fields.includes(filter as Field))&&(c.title+" "+c.prompt).toLowerCase().includes(search.toLowerCase())).sort((a,b)=>sort==="title"?a.title.localeCompare(b.title):sort==="oldest"?a.createdAt.localeCompare(b.createdAt):b.updatedAt.localeCompare(a.updatedAt));
 return <dialog ref={dialog} className="ai-dialog" aria-labelledby="ai-title" onCancel={onClose}>
  <header className="ai-header"><div><small>매일 1 프롬프트</small><h2 id="ai-title">나만의 AI 도우미</h2></div><button onClick={onClose} aria-label="AI 도우미 닫기">✕</button></header>
  <div className="ai-quota">추천 {remaining("recommend")}회 · 대화 {remaining("chat")}회 남음 <span>매일 한국시간 00:00 초기화{snap?" · 다음 "+new Date(remainingReset(snap.now)).toLocaleDateString("ko-KR",{timeZone:"Asia/Seoul"}):""}</span></div>
  {snap?.demo&&<p className="ai-demo">검토용 체험 모드 · 실제 Gemini 호출과 운영 데이터 저장 없이 동작합니다.</p>}
  <nav className="ai-tabs" aria-label="AI 메뉴">{(["recommend","chat","saved"] as const).map(t=><button key={t} aria-pressed={tab===t} onClick={()=>setTab(t)}>{t==="recommend"?"오늘의 추천":t==="chat"?"대화":"개인 보관함"}</button>)}</nav>
  <div className="ai-body">
   {notice&&<p className="ai-notice" role="status">{notice}</p>}
   {snap&&!snap.settings.enabled&&<p className="ai-notice">AI 도우미가 잠시 쉬고 있어요. 저장한 내용은 계속 이용할 수 있습니다.</p>}
   {tab==="recommend"&&<>
    <div className="ai-section-title"><div><h3>오늘 무엇을 해볼까요?</h3><p>내 취향 2개, 새로운 발견 1개</p></div><button className="ai-primary" disabled={busy||!snap?.settings.enabled||!remaining("recommend")} onClick={()=>void send("recommend")}>추천 받기</button></div>
    <details className="ai-preferences"><summary>관심사와 취향 설정</summary><p>써봤어요는 강한 긍정, 보관은 약한 긍정, 관심없어요는 부정 신호로 반영해요.</p>
     {FIELDS.map(f=><div key={f}><strong>{f}</strong><span>취향 점수 {snap?.state.scores[f]??0}</span>
      <label><input type="checkbox" checked={snap?.state.interests.includes(f)??false} disabled={busy} onChange={e=>void act({action:"preferences",interests:e.target.checked?[...(snap?.state.interests??[]),f]:(snap?.state.interests??[]).filter(v=>v!==f),excluded:snap?.state.excluded??[]}).catch(e=>setNotice(message(e)))}/>관심</label>
      <label><input type="checkbox" checked={snap?.state.excluded.includes(f)??false} disabled={busy} onChange={e=>void act({action:"preferences",interests:snap?.state.interests??[],excluded:e.target.checked?[...(snap?.state.excluded??[]),f]:(snap?.state.excluded??[]).filter(v=>v!==f)}).catch(e=>setNotice(message(e)))}/>추천 제외</label></div>)}
     <button onClick={()=>{if(window.confirm("학습한 취향 점수를 초기화할까요?"))void act({action:"reset"}).catch(e=>setNotice(message(e)));}}>취향 학습 초기화</button>
    </details>
    {current?current.cards.map(c=>cardView(c,current.expiresAt)):<p className="ai-empty">관심 분야를 고르고 오늘의 첫 추천을 받아보세요.</p>}
    {batches.filter(b=>b.id!==current?.id).length>0&&<details><summary>이전 추천 펼치기</summary>{batches.filter(b=>b.id!==current?.id).map(b=><section key={b.id}><h4>{new Date(b.createdAt).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</h4>{b.cards.map(c=>cardView(c,b.expiresAt))}</section>)}</details>}
   </>}
   {tab==="chat"&&<>
    <div className="ai-room-bar"><select aria-label="대화방 선택" value={roomId??""} onChange={e=>{setRoomId(e.target.value||undefined);setSelected(null);}}><option value="">새 주제의 대화</option>{[...(snap?.state.rooms??[])].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select>
    <button onClick={()=>{setRoomId(undefined);setSelected(null);}}>새 대화</button>
    {room&&<button disabled={busy} onClick={()=>{if(window.confirm("이 대화방과 내용을 삭제할까요?"))void act({action:"deleteRoom",roomId:room.id}).then(()=>{setRoomId(undefined);setSelected(null);}).catch(e=>setNotice(message(e)));}}>방 삭제</button>}</div>
    {snap&&<QuickStart key={roomId??"new"} today={today} hasMessages={Boolean(room?.messages.length)} disabled={busy} onChoose={prompt=>{setText(prompt);setSelected(null);setAck(false);messageInput.current?.focus();}}/>}
    {room?.messages.map(m=><section className={"ai-message "+(m.role==="user"?"ai-user":"")} key={m.id}><small>{m.role==="user"?"나":"AI 도우미"} · {new Date(m.createdAt).toLocaleDateString("ko-KR",{timeZone:"Asia/Seoul"})}</small><p>{m.text}</p>{m.cards.map(c=>cardView(c,m.expiresAt))}<div className="ai-suggestions">{m.suggestions.map(s=><button key={s} disabled={busy} onClick={()=>{setText(s);setAck(false);}}>{s}</button>)}</div></section>)}
    <p className="ai-caption">대화와 요약은 작성일부터 각각 7일간 보관해요. 남기고 싶은 프롬프트는 직접 보관해주세요.</p>
   </>}
   {tab==="saved"&&<><div className="ai-section-title"><h3>직접 보관한 프롬프트</h3><span>{snap?.state.saved.length??0} / 100</span></div>
    <div className="ai-filters"><input aria-label="보관함 검색" placeholder="제목·내용 검색" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="분야 필터" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">모든 분야</option>{FIELDS.map(f=><option key={f}>{f}</option>)}</select><select aria-label="보관함 정렬" value={sort} onChange={e=>setSort(e.target.value)}><option value="updated">최근 수정순</option><option value="oldest">오래된 순</option><option value="title">제목순</option></select></div>
    {saved.length?saved.map(c=>cardView(c,undefined,c)):<p className="ai-empty">보관한 프롬프트가 없습니다.</p>}</>}
   {busy&&<section className="ai-stream" aria-live="polite"><strong>답변 작성 중</strong><p>{preview||"요청을 처리하고 있어요. 완료되면 카드 버튼을 사용할 수 있습니다."}</p><button onClick={()=>void stop()}>응답 취소</button></section>}
   <details className="ai-fallback"><summary>AI 연결이 어려울 때 · 기본 프롬프트</summary><p>저장된 추천과 보관함은 계속 이용할 수 있어요.</p><pre>내가 하려는 일은 [목표]입니다. 필요한 정보를 먼저 정리하고, 바로 사용할 수 있는 초안과 개선할 질문 3개를 제시해주세요. 개인정보는 포함하지 마세요.</pre><button onClick={()=>{setText("내가 하려는 일은 [목표]입니다. 바로 쓸 수 있는 초안과 개선 질문을 제시해주세요.");setTab("chat");}}>입력창에 넣기</button></details>
  </div>
  {tab==="chat"&&<form className="ai-composer" onSubmit={e=>{e.preventDefault();void send("chat");}}>
   {selected&&<div className="ai-selected"><strong>개선 기준: {selected.card.title}</strong><textarea aria-label="개선 기준 수정본" value={selected.text} maxLength={5000} onChange={e=>{setSelected({...selected,text:e.target.value});setAck(false);}}/><button type="button" onClick={()=>setSelected(null)}>선택 해제</button><PrivacyView text={selected.text} onChange={value=>setSelected({...selected,text:value})} ack={ack} onAck={setAck}/></div>}
   {room&&inspectPrivacy(context(room)).length>0&&<details className="ai-history-privacy" open><summary>이전 대화에 포함된 개인정보 확인</summary><PrivacyView text={anonymizedRoom===roomId?anonymize(context(room)):context(room)} onChange={()=>{setAnonymizedRoom(roomId);setAck(false);}} ack={ack} onAck={setAck}/>{anonymizedRoom===roomId&&<p>이전 대화의 표시된 정보를 익명화해서 전송합니다.</p>}</details>}
   <label className="ai-caption">개인정보와 비공개 업무 자료를 넣지 마세요. <span>{text.length} / 5,000</span></label>
   <textarea ref={messageInput} aria-label="AI에게 보낼 메시지" value={text} maxLength={5000} onChange={e=>{setText(e.target.value);setAck(false);}} placeholder="어떤 프롬프트가 필요한가요?" rows={2}/>
   <PrivacyView text={text} onChange={setText} ack={ack} onAck={setAck}/>
   <div className="ai-compose-actions"><label><input type="checkbox" checked={detail} onChange={e=>setDetail(e.target.checked)}/>자세한 답변</label><label>프롬프트 <select value={count} onChange={e=>setCount(Number(e.target.value))}>{[1,2,3].map(n=><option key={n} value={n}>{n}개</option>)}</select></label><button className="ai-primary" type="submit" disabled={busy||!text.trim()||!snap?.settings.enabled||!remaining("chat")}>전송</button></div>
  </form>}
 </dialog>;
}
