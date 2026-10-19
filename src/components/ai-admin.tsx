"use client";
import { useEffect,useState } from "react";
import type { Settings } from "@/lib/ai/types";
import "./ai-assistant.css";
export function AiAdmin(){
 const [settings,setSettings]=useState<Settings|null>(null),[stats,setStats]=useState<{requests:number;success:number;calls:number}|null>(null),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{const controller=new AbortController();fetch("/api/admin/ai",{cache:"no-store",signal:controller.signal}).then(async r=>{const data=await r.json() as {error?:string;settings:Settings;statistics:{requests:number;success:number;calls:number}};if(!r.ok)throw new Error(data.error);setSettings(data.settings);setStats(data.statistics);}).catch(e=>{if(!controller.signal.aborted)setMessage(e.message);});return()=>controller.abort();},[]);
 return <section className="surface-card"><h2 className="text-xl font-extrabold">AI 도우미 운영</h2><p className="my-3 text-sm text-slate-500">호출 횟수와 성공 횟수만 집계합니다. 개인 대화 내용은 제공하지 않습니다.</p>
 {message&&<p role="status" className="my-3 text-sm text-amber-700">{message}</p>}
 {stats&&<p className="mb-4 text-sm">최근 30일 요청 {stats.requests} · 성공 {stats.success} · API 호출 {stats.calls}</p>}
 {settings&&<form onSubmit={async e=>{e.preventDefault();setBusy(true);try{const r=await fetch("/api/admin/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(settings)});const data=await r.json() as {error?:string};if(!r.ok)throw new Error(data.error);setMessage("설정을 저장했습니다.");}catch(e){setMessage(e instanceof Error?e.message:"저장하지 못했습니다.");}finally{setBusy(false);}}}>
 <label className="mb-4 block text-sm font-bold"><input type="checkbox" checked={settings.enabled} onChange={e=>setSettings({...settings,enabled:e.target.checked})}/> AI 도우미 활성화</label>
 <div className="ai-admin-grid">{([["recommendLimit","참가자 하루 추천"],["chatLimit","참가자 하루 대화"],["dailyCap","전체 하루 API 호출"],["minuteCap","전체 분당 API 호출"]] as const).map(([key,label])=><label key={key}>{label}<input type="number" min={0} max={key==="dailyCap"?100000:key==="minuteCap"?1000:100} value={settings[key]} onChange={e=>setSettings({...settings,[key]:Number(e.target.value)})}/></label>)}</div>
 <p className="my-3 text-xs text-slate-500">재시도도 전체 API 호출 수에 포함됩니다. 개인 한도는 성공한 응답만 차감합니다.</p><button className="primary-button" disabled={busy} type="submit">AI 설정 저장</button></form>}</section>;
}
