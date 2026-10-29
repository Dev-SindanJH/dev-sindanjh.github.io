(()=>{
'use strict';
const REPO='Dev-SindanJH/diet-health',PATH='workouts.json',API='https://api.github.com/repos/'+REPO+'/contents/'+PATH;
const STATE_KEY='workout-pages-state-v1',TOKEN_KEY='workout-pages-token-v1',SESSION_KEY='workout-pages-session-v1';
const view=document.getElementById('view'),cloud=document.getElementById('cloud');
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&#39;'}[c]));
const N=x=>{const v=Number(x);return Number.isFinite(v)?Math.max(0,Math.min(v,9999)):0};
const date=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const templates=[['레그프레스','하체'],['랫풀다운','등'],['체스트프레스','가슴'],['이너타이','하체'],['글루트 브리지','엉덩이']];
function newDraft(){return {date:date(),editingId:null,exercises:templates.map(t=>({name:t[0],group:t[1],sets:[{kg:0,reps:12,done:false},{kg:0,reps:12,done:false}]})),cardio:[{name:'준비 걷기',minutes:0,done:false},{name:'마무리 걷기',minutes:0,done:false}]}}
const stored=localStorage.getItem(STATE_KEY);let draft;
try{draft=JSON.parse(stored)?.draft||newDraft()}catch(e){draft=newDraft()}
if(!draft.exercises||!draft.cardio)draft=newDraft();
let tab='work',records=[],token='',remember=false,busy=false,status='',currentId=null,hydrated=!!stored;
let bodyProfile={heightCm:177},bodyWeights=[],chartRange='all';
try{let v=JSON.parse(localStorage.getItem(TOKEN_KEY)||'{}');remember=!!v.remember;token=v.token||sessionStorage.getItem(SESSION_KEY)||''}catch(e){}
function persist(){localStorage.setItem(STATE_KEY,JSON.stringify({draft}))}
function alertError(e){alert((e&&e.message)||String(e))}
function btn(label,act,extra=''){return '<button class="btn '+extra+'" type="button" data-action="'+act+'">'+label+'</button>'}
function authHeaders(){return {'Accept':'application/vnd.github+json','Authorization':'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'}}
function apiError(r){return new Error(r.status===401?'GitHub 토큰이 유효하지 않습니다 (401)':r.status===403?'GitHub 권한을 확인해 주세요. 저장하려면 Contents 읽기/쓰기 권한이 필요합니다 (403)':r.status===404?'비공개 저장소 또는 workouts.json에 접근할 수 없습니다 (404)':'GitHub 요청 실패 ('+r.status+')')}
function decode(s){return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s+/g,'')),x=>x.charCodeAt(0))))}
function encode(o){let bin='',b=new TextEncoder().encode(JSON.stringify(o,null,2)+'\n');for(let i=0;i<b.length;i+=8192)bin+=String.fromCharCode(...b.slice(i,i+8192));return btoa(bin)}
async function getRemote(){
 const r=await fetch(API,{headers:authHeaders(),cache:'no-store'});
 if(!r.ok)throw apiError(r);
 const d=await r.json();
 const v=decode(d.content);
 if(!v||!Array.isArray(v.workouts)||!d.sha)throw Error('운동 기록 파일의 구조가 올바르지 않습니다');
 return {data:v,sha:d.sha};
}
function latest(){return records.slice().sort((a,b)=>b.date.localeCompare(a.date))[0]}
function populateDraft(){
 if(hydrated||draft.editingId)return;
 const r=latest();
 if(!r)return;
 for(const e of draft.exercises){
  const last=r.exercises.find(x=>x.name===e.name);
  if(last)e.sets=last.sets.map(s=>({kg:N(s.kg),reps:N(s.reps),done:false}));
 }
 for(const c of draft.cardio){const last=r.cardio.find(x=>x.name===c.name);if(last)c.minutes=N(last.minutes)}
 hydrated=true;persist();
}
async function sync(showMessage=false){
 if(!token||busy)return;
 busy=true;status='최신 기록 불러오는 중';render();
 try{
  const v=await getRemote();records=v.data.workouts.slice();bodyProfile=v.data.profile||{heightCm:177};bodyWeights=Array.isArray(v.data.bodyWeights)?v.data.bodyWeights.slice():[];status='비공개 운동 기록 '+records.length+'개 동기화됨';populateDraft();
  if(showMessage)alert('GitHub 운동 기록 '+records.length+'개를 불러왔습니다.');
 }catch(e){status='연결 오류 · '+e.message;if(showMessage)alertError(e)}
 finally{busy=false;render()}
}
async function mutate(change,message){
 if(!token)throw Error('관리 탭에서 GitHub 토큰을 연결해주세요.');
 if(busy)throw Error('작업 중입니다. 잠시 후 다시 시도해주세요.');
 busy=true;status='GitHub에 저장 중';render();
 try{
  for(let attempt=0;attempt<3;attempt++){
   const v=await getRemote();
   const next=change(v.data.workouts.slice());
   if(!Array.isArray(next))throw Error('저장할 데이터가 올바르지 않습니다.');
   const body=JSON.stringify({message,content:encode({...v.data,version:v.data.version||1,workouts:next}),sha:v.sha});
   const r=await fetch(API,{method:'PUT',headers:{...authHeaders(),'Content-Type':'application/json'},body});
   if((r.status===409||r.status===422)&&attempt<2)continue;
   if(!r.ok)throw apiError(r);
   records=next;status='비공개 운동 기록 '+next.length+'개 동기화됨';return;
  }
  throw Error('다른 기기에서 기록이 변경되었습니다. 다시 저장해주세요.');
 }catch(e){status='저장 실패 · '+e.message;throw e}
 finally{busy=false;render()}
}
function stats(d){let total=0,done=0;for(const e of d.exercises)for(const s of e.sets){total++;if(s.done)done++}return {done,total,minutes:d.cardio.reduce((sum,c)=>sum+(c.done?N(c.minutes):0),0)}}
function previous(name){
 const sorted=records.slice().sort((a,b)=>b.date.localeCompare(a.date));
 const found=sorted.map(w=>w.exercises.find(e=>e.name===name)).find(Boolean);
 return found?'지난 '+found.sets.map(s=>N(s.kg)+'kg × '+N(s.reps)+'회').join(' · '):'이전 기록 없음';
}

/* Additional exercise energy (resting expenditure excluded).
   2024 Compendium: resistance training, 8–15 reps at varied resistance = 3.5 MET.
   Moderate treadmill/walking approximation = 3.5 MET (speed not recorded).
   Strength session duration estimate = 2 minutes per completed set, including breaks.
   https://pacompendium.com/adult-compendium/ */
const FOOD_ENERGY=[
 {name:'흰쌀밥',portion:'공기',kcal:300,icon:'🍚',unit:'1공기 · 약 300kcal'},
 {name:'라면',portion:'봉지',kcal:500,icon:'🍜',unit:'1봉지 · 약 500kcal'},
 {name:'삶은 달걀',portion:'개',kcal:75,icon:'🥚',unit:'1개 · 약 75kcal'},
 {name:'사과',portion:'개',kcal:95,icon:'🍎',unit:'중간 크기 1개 · 약 95kcal'}
];
function calcWorkoutEnergy(workout,isDraft=false){
 const sets=(workout.exercises||[]).reduce((n,ex)=>n+(ex.sets||[]).filter(st=>!isDraft||st.done).length,0);
 const mins=(workout.cardio||[]).reduce((n,c)=>n+((!isDraft||c.done)?N(c.minutes):0),0);
 const measures=sortedWeights();
 const older=measures.filter(x=>x.date<=workout.date).at(-1);
 const selected=older||measures.at(-1);
 if(!selected||(!sets&&!mins))return {available:false,sets,mins};
 const weight=Number(selected.kg);
 const strengthMinutes=sets*2;
 const caloriesPerMin=(3.5-1)*3.5*weight/200;
 const strength=Math.round(strengthMinutes*caloriesPerMin);
 const cardio=Math.round(mins*caloriesPerMin);
 return {available:true,total:strength+cardio,strength,cardio,weight,
   weightDate:selected.date,stale:Math.abs(Date.parse(workout.date+'T00:00:00Z')-Date.parse(selected.date+'T00:00:00Z'))>30*86400000,
   sets,mins};
}
function foodEnergyItems(total){
 return '<div class="food-list">'+FOOD_ENERGY.map(f=>{
 const ratio=total/f.kcal;
 return '<div class="food-item"><div class="food-info"><span class="food-icon" aria-hidden="true">'+f.icon+'</span><span><span class="food-name">'+f.name+'</span><br><span class="food-unit">'+f.unit+'</span></span></div>'+
 '<div class="row" style="margin-top:7px"><span class="food-qty">'+num(ratio,2)+f.portion+'</span><span class="muted">열량 비교</span></div>'+
 '<div class="food-track"><span class="food-fill" style="width:'+Math.min(100,Math.max(0,ratio*100)).toFixed(1)+'%"></span></div></div>';
 }).join('')+'</div>';
}
function renderEnergyCard(workout,isDraft=false){
 const v=calcWorkoutEnergy(workout,isDraft);
 if(!v.available){
  return '<div class="energy-empty">'+(v.sets+v.mins===0?'운동 세트를 체크하면 예상 칼로리가 표시됩니다.':'체중·BMI 탭에 몸무게를 기록하면 예상 칼로리를 계산할 수 있습니다.')+'</div>';
 }
 return '<section class="energy-card"><div class="energy-head"><div><div class="energy-label">🔥 예상 운동 소모 칼로리</div><div class="energy-total">약 '+v.total+'<span style="font-size:13px;font-weight:700"> kcal</span></div></div><span class="pill">활동 칼로리</span></div>'+
 '<div class="energy-parts"><span>🏋️ 근력 약 '+v.strength+'kcal</span><span>🚶 걷기 약 '+v.cardio+'kcal</span></div>'+
 '<div class="energy-compact">몸무게 '+num(v.weight)+'kg ('+E(v.weightDate)+' 기록) 기준'+(v.stale?' · <b>과거 체중으로 계산했어요. 현재 체중을 업데이트하면 더 유용합니다.</b>':'')+'</div>'+
 '<div style="font-weight:850;font-size:13px;margin:14px 0 0;color:#31486c">이 열량을 음식으로 비교하면?</div>'+foodEnergyItems(v.total)+
 '<details class="energy-details"><summary>계산 기준과 주의사항 보기</summary><p>2024 성인 신체활동 MET 표를 참고했습니다. 근력운동은 완료한 세트당 2분(휴식 포함 추정), 걷기는 기록된 시간에 각각 3.5 MET를 적용하고, 휴식 시 소모량(1 MET)을 제외한 <b>추가 활동 칼로리</b>만 표시합니다. 실제 칼로리는 걷기 속도·경사·세트 간 휴식·강도와 개인차에 따라 크게 달라질 수 있습니다. 음식은 일반적인 1회 제공량의 대략적인 열량이며, 영양적 동등성이나 식사 조절 지침을 뜻하지 않습니다.</p></details></section>';
}

function renderWork(){
 const s=stats(draft);
 let h='<section class="hero"><div style="font-size:11px;font-weight:750;color:#b4c6fa">MY WORKOUT · 주 3회 전신</div><h1>'+(draft.editingId?'운동 기록 수정':'오늘도 한 세트씩.')+'</h1><p>무게와 횟수를 입력하고 완료하면 체크하세요.</p><div class="stats"><div><strong>'+s.done+' / '+s.total+'</strong><br><span>완료 근력 세트</span></div><div style="text-align:right"><strong>'+s.minutes+'분</strong><br><span>유산소</span></div></div><div class="bar"><div style="width:'+(s.total?Math.round(100*s.done/s.total):0)+'%"></div></div></section>';
 h+='<div class="row"><h2>운동하기</h2><input type="date" id="work-date" value="'+E(draft.date)+'" aria-label="운동 날짜"></div>';
 draft.exercises.forEach((ex,i)=>{
  h+='<section class="card"><div class="row"><strong class="ex-title">'+E(ex.name)+'</strong><span class="pill">'+ex.sets.filter(x=>x.done).length+'/'+ex.sets.length+'</span></div><div class="ex-sub">'+E(previous(ex.name))+'</div><div class="fields head"><span>세트</span><span>무게 kg</span><span>횟수</span><span>완료</span></div>';
  ex.sets.forEach((s,j)=>{
   h+='<div class="fields"><span class="index">'+(j+1)+'</span><input type="number" min="0" step="0.5" inputmode="decimal" data-field="kg" data-i="'+i+'" data-j="'+j+'" value="'+N(s.kg)+'" aria-label="'+E(ex.name)+' 무게"><input type="number" min="0" step="1" inputmode="numeric" data-field="reps" data-i="'+i+'" data-j="'+j+'" value="'+N(s.reps)+'" aria-label="'+E(ex.name)+' 횟수"><button class="btn '+(s.done?'checked':'')+'" type="button" data-action="check" data-i="'+i+'" data-j="'+j+'" aria-pressed="'+s.done+'">'+(s.done?'✓':'○')+'</button></div>';
  });
  h+='<div class="flex" style="margin-top:9px">'+btn('+ 세트','addset','tiny') .replace('data-action="addset"','data-action="addset" data-i="'+i+'"')+btn('세트 삭제','delset','tiny').replace('data-action="delset"','data-action="delset" data-i="'+i+'"')+btn('종목 삭제','delex','tiny').replace('data-action="delex"','data-action="delex" data-i="'+i+'"')+'</div></section>';
 });
 h+='<h2>유산소</h2><section class="card">';
 draft.cardio.forEach((c,i)=>{h+='<div class="row" style="margin:7px 0"><strong>'+E(c.name)+'</strong><div class="flex"><input style="width:82px" type="number" min="0" inputmode="numeric" data-cardio="'+i+'" value="'+N(c.minutes)+'" aria-label="유산소 분"><span class="muted">분</span><button class="btn '+(c.done?'checked':'')+'" type="button" data-action="checkcardio" data-i="'+i+'">'+(c.done?'✓':'○')+'</button></div></div>'});
 h+='</section><h2>예상 칼로리 · 음식 비교</h2>'+renderEnergyCard(draft,true)+'<button class="btn primary" type="button" data-action="save" '+(busy?'disabled':'')+'>'+(busy?'처리 중…':draft.editingId?'☁️ GitHub에 수정 저장':'☁️ GitHub에 운동 저장')+'</button><p class="help">완료 체크된 세트와 유산소만 저장됩니다. GitHub 연결 전에는 작성한 내용이 휴대폰 브라우저에 임시 보관됩니다.</p>';
 if(draft.editingId)h+=btn('수정 취소','cancel','full');
 return h;
}
function datePretty(s){const p=String(s||'').split('-');return p.length===3?Number(p[1])+'월 '+Number(p[2])+'일':E(s)}
function renderHistory(){
 let h='<div class="row"><h2>운동 기록</h2><span class="muted">총 '+records.length+'회</span></div>';
 if(!records.length)h+='<section class="card" style="text-align:center;padding:40px">저장된 운동이 없습니다. 관리에서 GitHub를 연결해 주세요.</section>';
 for(const w of records.slice().sort((a,b)=>b.date.localeCompare(a.date))){
  const n=w.exercises.reduce((v,e)=>v+e.sets.length,0),rep=w.exercises.reduce((v,e)=>v+e.sets.reduce((x,s)=>x+N(s.reps),0),0),mins=w.cardio.reduce((x,c)=>x+N(c.minutes),0);
  h+='<section class="card"><div class="row"><span class="history-date">'+datePretty(w.date)+'</span><span class="pill">☁ 비공개 저장</span></div><div class="muted">'+E(w.label||'전신 운동')+'</div><div class="history-stat"><div><strong>'+n+'</strong><span>근력 세트</span></div><div><strong>'+rep+'</strong><span>총 반복</span></div><div><strong>'+mins+'분</strong><span>유산소</span></div></div>';
  w.exercises.forEach(ex=>h+='<div class="line"><b>'+E(ex.name)+'</b><span>'+ex.sets.map(s=>N(s.kg)+'kg×'+N(s.reps)).join(' / ')+'</span></div>');
  w.cardio.forEach(c=>h+='<div class="line"><b>'+E(c.name)+'</b><span>'+N(c.minutes)+'분</span></div>');
  h+=renderEnergyCard(w,false);
  h+='<div class="buttons"><button class="btn" data-action="edit" data-id="'+E(w.id)+'">수정</button><button class="btn danger" data-action="delete" data-id="'+E(w.id)+'">삭제</button></div></section>';
 }
 h+=btn('CSV 기록 내보내기','csv','full');return h;
}

function safeWeight(w){const v=Number(w);return Number.isFinite(v)&&v>=25&&v<=400?v:null}
function safeHeight(v){const n=Number(v);return Number.isFinite(n)&&n>=100&&n<=250?n:null}
function prettyDate(s){const a=String(s).split('-');return a.length===3?Number(a[0])+'년 '+Number(a[1])+'월 '+Number(a[2])+'일':E(s)}
function sortedWeights(){return bodyWeights.filter(x=>x&&/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&safeWeight(x.kg)!==null).slice().sort((a,b)=>a.date.localeCompare(b.date))}
function bmiCategory(b){return b<18.5?'저체중':b<23?'정상':b<25?'비만 전단계':b<30?'1단계 비만':b<35?'2단계 비만':'3단계 비만'}
function num(v,d=1){return Number(v).toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d})}
function bodyChart(items){
 if(!items.length)return '<div style="padding:30px;text-align:center;color:#8898ad;font-size:13px">선택한 기간에 저장된 체중 기록이 없습니다.</div>';
 const W=380,H=205,L=44,R=14,T=17,B=32,iw=W-L-R,ih=H-T-B;
 const times=items.map(x=>Date.parse(x.date+'T00:00:00Z')),rawMin=Math.min(...items.map(x=>Number(x.kg))),rawMax=Math.max(...items.map(x=>Number(x.kg)));
 const yMin=Math.floor((rawMin-1.5)*2)/2,yMax=Math.ceil((rawMax+1.5)*2)/2,ySpan=Math.max(1,yMax-yMin);
 const xMin=Math.min(...times),xMax=Math.max(...times), xSpan=Math.max(1,xMax-xMin);
 const x=i=>items.length===1?L+iw/2:L+(times[i]-xMin)/xSpan*iw;
 const y=v=>T+(yMax-v)/ySpan*ih;
 let axes='';for(let i=0;i<=4;i++){const v=yMin+ySpan*i/4,yy=y(v);axes+='<line class="grid-line" x1="'+L+'" y1="'+yy.toFixed(1)+'" x2="'+(W-R)+'" y2="'+yy.toFixed(1)+'"></line><text class="chart-label" x="'+(L-6)+'" y="'+(yy+4).toFixed(1)+'" text-anchor="end">'+num(v)+'</text>'}
 const points=items.map((p,i)=>({x:x(i),y:y(Number(p.kg)),p})),path=points.map((p,i)=>(i?'L':'M')+p.x.toFixed(2)+' '+p.y.toFixed(2)).join(' ');
 let area=points.length>1?'<path d="'+path+' L'+points.at(-1).x.toFixed(2)+' '+(T+ih)+' L'+points[0].x.toFixed(2)+' '+(T+ih)+'Z" fill="url(#wtfade)"></path>':'';
 const dots=points.map(p=>'<circle cx="'+p.x.toFixed(2)+'" cy="'+p.y.toFixed(2)+'" r="5" fill="#4967ea" stroke="#fff" stroke-width="2"><title>'+E(p.p.date)+' · '+num(p.p.kg)+' kg</title></circle>').join('');
 const lab=s=>s.slice(5).replace('-','/');
 return '<div class="chart-wrap"><svg viewBox="0 0 380 205" role="img" aria-label="체중 변화 그래프, '+items.length+'개 기록, '+num(rawMin)+'kg에서 '+num(rawMax)+'kg"><defs><linearGradient id="wtfade" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#7893fb" stop-opacity=".30"/><stop offset="1" stop-color="#7893fb" stop-opacity=".015"/></linearGradient></defs>'+axes+area+'<path d="'+path+'" fill="none" stroke="#4967ea" stroke-width="3.3" stroke-linecap="round" stroke-linejoin="round"></path>'+dots+'<text class="chart-label" x="'+L+'" y="'+(H-8)+'" text-anchor="start">'+E(lab(items[0].date))+'</text><text class="chart-label" x="'+(W-R)+'" y="'+(H-8)+'" text-anchor="end">'+E(lab(items.at(-1).date))+'</text></svg></div>';
}
function renderBody(){
 const list=sortedWeights(),last=list.at(-1),first=list[0],ht=safeHeight(bodyProfile.heightCm)||177;
 const idx=last?Number(last.kg)/((ht/100)**2):null,delta=last&&first&&list.length>1?Number(last.kg)-Number(first.kg):null;
 const rangeDays=chartRange==='all'?Infinity:Number(chartRange),cutoff=Number.isFinite(rangeDays)?Date.parse(date()+'T00:00:00Z')-rangeDays*86400000:-Infinity;
 const selected=list.filter(x=>Date.parse(x.date+'T00:00:00Z')>=cutoff);
 let h='<h2>체중 & BMI</h2><div class="weight-hero"><div class="body-head"><div><div class="small">최근 기록 기반 BMI</div><div class="bmi-big">'+(idx===null?'—':num(idx))+'</div><div class="sub">'+(last?prettyDate(last.date)+' 측정값 기준':'체중을 먼저 기록해 주세요')+'</div></div><div style="text-align:right"><span class="bmi-tag">'+(idx===null?'기록 없음':E(bmiCategory(idx)))+'</span><div class="sub">한국 성인 BMI 기준</div></div></div><div class="metric-grid"><div class="metric"><small>최근 기록 체중</small><strong>'+(last?num(last.kg)+'<small style="display:inline;font-size:12px"> kg</small>':'—')+'</strong></div><div class="metric"><small>첫 기록 대비</small><strong class="'+(delta===null?'':delta>0?'positive':'negative')+'">'+(delta===null?'—':(delta>0?'+':'')+num(delta)+' kg')+'</strong></div></div></div>';
 h+='<section class="card"><div class="row"><strong>내 키</strong><div class="flex"><input style="width:93px" id="height-cm" type="number" min="100" max="250" step="0.1" inputmode="decimal" value="'+ht+'"><span class="muted">cm</span><button class="btn" data-action="heightsave">저장</button></div></div><div class="footnote" style="margin-top:10px">BMI = 체중(kg) ÷ 키(m)² · BMI는 건강 상태를 간단히 살펴보는 참고 지표입니다.</div></section>';
 h+='<h2>체중 기록하기</h2><section class="card"><div class="entry-grid"><label><span class="field">측정 날짜</span><input type="date" id="weight-date" value="'+E(date())+'"></label><label><span class="field">몸무게 (kg)</span><input type="number" id="weight-kg" inputmode="decimal" min="25" max="400" step="0.1" placeholder="예: 100.5"></label></div><button class="btn primary" type="button" data-action="weightsave" id="weight-save-label" style="margin-top:14px">☁ 체중 기록 저장</button><p class="footnote">같은 날짜에 다시 기록하면 기존 체중을 수정합니다. 운동 기록과 동일한 비공개 GitHub 저장소에 저장됩니다.</p></section>';
 h+='<div class="row"><h2>몸무게 변화</h2><div class="range-pills">'+[['30','30일'],['90','90일'],['all','전체']].map(x=>'<button class="btn '+(chartRange===x[0]?'on':'')+'" data-action="weightrange" data-range="'+x[0]+'">'+x[1]+'</button>').join('')+'</div></div><section class="card">'+bodyChart(selected)+'<div class="footnote" style="text-align:center;margin-top:7px">점 위에 표시되는 날짜와 체중으로 변화 확인 · 총 '+selected.length+'개 기록</div></section>';
 h+='<div class="row"><h2>일자별 체중 기록</h2><span class="muted">총 '+list.length+'일</span></div><section class="card">';
 if(!list.length)h+='<p class="muted">아직 기록된 체중이 없습니다.</p>';
 for(let i=list.length-1;i>=0;i--){const w=list[i],prev=list[i-1],diff=prev?(Number(w.kg)-Number(prev.kg)):null;h+='<div class="weight-row"><div><strong>'+E(prettyDate(w.date))+'</strong><div class="muted">'+(diff===null?'첫 기록':('직전 기록 대비 '+(diff>0?'+':'')+num(diff)+'kg'))+'</div></div><div style="display:flex;align-items:center;gap:10px"><span class="value">'+num(w.kg)+'<span class="muted"> kg</span></span><span class="mini"><button class="btn" data-action="weightedit" data-date="'+E(w.date)+'">수정</button><button class="btn danger" data-action="weightdelete" data-date="'+E(w.date)+'">삭제</button></span></div></div>'}
 h+='</section>';
 return h;
}
async function updateBodyData(transform,message){
 if(!token)throw Error('관리 탭에서 GitHub 토큰을 연결해주세요.');
 if(busy)throw Error('동기화 중입니다. 잠시 후 다시 시도해주세요.');
 busy=true;status='체중 기록 저장 중';render();
 try{
  for(let attempt=0;attempt<3;attempt++){
   const r=await getRemote();let value=transform({...r.data,bodyWeights:Array.isArray(r.data.bodyWeights)?r.data.bodyWeights.slice():[],profile:{...(r.data.profile||{})}});
   if(!value||!Array.isArray(value.bodyWeights))throw Error('체중 기록 데이터가 올바르지 않습니다.');
   const response=await fetch(API,{method:'PUT',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({message,content:encode(value),sha:r.sha})});
   if((response.status===409||response.status===422)&&attempt<2)continue;
   if(!response.ok)throw apiError(response);
   bodyProfile=value.profile||{heightCm:177};bodyWeights=value.bodyWeights;records=value.workouts.slice();
   status='비공개 체중 기록 '+bodyWeights.length+'건 저장됨';
   return;
  }
  throw Error('다른 기기에서 기록이 변경되었습니다. 다시 시도해주세요.');
 }catch(e){status='체중 저장 실패 · '+e.message;throw e}
 finally{busy=false;render()}
}
async function saveHeight(){
 const h=safeHeight(document.getElementById('height-cm')?.value);
 if(!h){alert('키는 100~250cm 사이로 입력해주세요.');return}
 try{await updateBodyData(v=>({...v,profile:{...v.profile,heightCm:h}}),'Update height profile');alert('키 '+num(h)+'cm가 비공개 GitHub에 저장되었습니다.')}catch(e){alertError(e)}
}
async function saveBodyWeight(){
 const dateEl=document.getElementById('weight-date'), kgEl=document.getElementById('weight-kg');
 const d=dateEl?.value,k=safeWeight(kgEl?.value);
 if(!d||!(/^\d{4}-\d{2}-\d{2}$/.test(d))){alert('측정 날짜를 확인해주세요.');return}
 if(k===null){alert('체중을 25~400kg 사이로 입력해주세요.');return}
 const existing=bodyWeights.find(x=>x.date===d);
 if(existing&&!confirm(d+'의 기존 체중 기록을 '+num(k)+'kg로 수정할까요?'))return;
 try{
  await updateBodyData(v=>{
    const i=v.bodyWeights.findIndex(x=>x.date===d);
    const row={id:i>=0?v.bodyWeights[i].id||'body-'+d:'body-'+d,date:d,kg:k};
    if(i>=0)v.bodyWeights[i]=row;else v.bodyWeights.push(row);
    v.bodyWeights.sort((a,b)=>a.date.localeCompare(b.date));return v;
  },'Save body weight '+d);
  const e=document.getElementById('weight-kg');if(e)e.value='';
  alert('비공개 GitHub에 '+d+' 체중 '+num(k)+'kg을 저장했습니다.');
 }catch(e){alertError(e)}
}
function editBodyWeight(d){
 const item=bodyWeights.find(x=>x.date===d),dateEl=document.getElementById('weight-date'),kgEl=document.getElementById('weight-kg');
 if(!item||!dateEl||!kgEl)return;
 dateEl.value=item.date;kgEl.value=item.kg;
 document.getElementById('weight-save-label').textContent='☁ 체중 수정 저장';
 kgEl.focus();
 window.scrollTo({top:0,behavior:'smooth'});
}
async function deleteBodyWeight(d){
 if(!confirm(d+' 체중 기록을 삭제할까요?'))return;
 try{await updateBodyData(v=>{v.bodyWeights=v.bodyWeights.filter(x=>x.date!==d);return v;},'Delete body weight '+d);alert(d+' 체중 기록을 삭제했습니다.')}catch(e){alertError(e)}
}

function renderSettings(){
 return '<h2>비공개 GitHub 연동</h2><section class="card"><p class="muted">ChatGPT에서 저장한 기록과 웹에서 저장한 기록은 같은 비공개 <b>'+E(REPO)+'</b>의 <b>'+E(PATH)+'</b>를 사용합니다.</p><form id="auth-form"><label class="field" for="pat">GitHub Fine-grained 토큰</label><input class="full" id="pat" type="password" placeholder="'+(token?'기존 토큰 설정됨 · 바꾸려면 새 토큰 입력':'github_pat_...')+'" autocomplete="off"><label class="field" style="font-weight:500"><input type="checkbox" id="remember" '+(remember?'checked':'')+'> 이 기기에 토큰 기억하기</label><button class="btn primary" type="submit">연결 / 토큰 변경</button></form><p class="help">토큰은 diet-health 저장소만 선택하고 <b>Contents: Read and write</b> 권한을 지정하세요. 기억하기는 기본적으로 꺼져 있습니다. 사용하면 토큰이 이 브라우저에 저장되므로 개인 기기에서만 설정하세요.</p><div class="buttons">'+btn('최신 기록 불러오기','sync')+btn('연결 해제','disconnect')+'</div><p class="help"><a href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noopener noreferrer">GitHub 토큰 설정 열기</a></p></section><h2>내 운동 관리</h2><section class="card"><div class="buttons">'+btn('운동 종목 추가','addex')+btn('루틴 초기화','reset')+'</div><div class="buttons">'+btn('JSON 백업 다운로드','backup')+btn('백업 불러오기','import')+'</div><input type="file" id="import-file" accept=".json,application/json" class="hidden"/><p class="help">브라우저에 저장한 임시 루틴은 새 주소로 옮겨지지 않습니다. 운동 기록은 기존 비공개 GitHub에서 다시 불러옵니다. 이 웹사이트의 화면 코드는 공개지만 운동 기록과 토큰은 코드에 포함되지 않습니다.</p></section>';
}
function render(){
 cloud.className='cloud '+(!token||status.includes('오류')||status.includes('실패')?'warn':'');
 cloud.textContent=status||(!token?'연결 전 · 관리 탭에서 GitHub 토큰을 입력해 주세요':'GitHub 연결됨');
 document.getElementById('week').textContent='주 3회 전신 운동';
 document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));
 view.innerHTML=tab==='work'?renderWork():tab==='history'?renderHistory():tab==='body'?renderBody():renderSettings();
}
async function save(){
 const x={id:draft.editingId||String(Date.now())+'-'+Math.random().toString(36).slice(2,9),date:draft.date||date(),label:'전신 운동',exercises:draft.exercises.map(e=>({name:e.name,group:e.group,sets:e.sets.filter(s=>s.done).map(s=>({kg:N(s.kg),reps:N(s.reps)}))})).filter(e=>e.sets.length),cardio:draft.cardio.filter(c=>c.done).map(c=>({name:c.name,minutes:N(c.minutes)}))};
 if(!x.exercises.length&&!x.cardio.length){alert('완료한 세트 또는 유산소를 먼저 체크해주세요.');return;}
 try{
  await mutate(list=>{const i=list.findIndex(w=>w.id===x.id);if(i>=0)list[i]=x;else list.push(x);return list;},(draft.editingId?'Update ':'Add ')+'workout '+x.date);
  draft={...draft,date:date(),editingId:null,exercises:draft.exercises.map(e=>({...e,sets:e.sets.map(s=>({...s,done:false}))})),cardio:draft.cardio.map(c=>({...c,done:false}))};
  hydrated=true;persist();tab='history';render();alert('비공개 GitHub에 운동 기록을 저장했습니다.');
 }catch(e){alertError(e)}
}
async function removeRecord(id){
 if(!confirm('이 운동 기록을 비공개 GitHub에서 삭제할까요?'))return;
 try{await mutate(list=>list.filter(w=>w.id!==id),'Delete workout record');if(draft.editingId===id)draft=newDraft();persist();render()}catch(e){alertError(e)}
}
function makeCsv(){
 const lines=[['날짜','운동','세트','무게(kg)','횟수','유산소(분)']];
 for(const w of records){for(const ex of w.exercises)ex.sets.forEach((s,i)=>lines.push([w.date,ex.name,i+1,N(s.kg),N(s.reps),'']));for(const c of w.cardio)lines.push([w.date,c.name,'','','',N(c.minutes)])}
 return '\ufeff'+lines.map(a=>a.map(s=>'"'+String(s).replaceAll('"','""')+'"').join(',')).join('\r\n');
}
function download(name,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
document.addEventListener('click',async ev=>{
 const tb=ev.target.closest('[data-tab]');if(tb){tab=tb.dataset.tab;render();window.scrollTo(0,0);return}
 const b=ev.target.closest('[data-action]');if(!b||busy)return;const a=b.dataset.action,i=Number(b.dataset.i),j=Number(b.dataset.j);
 if(a==='weightsave'){await saveBodyWeight();return}
 else if(a==='heightsave'){await saveHeight();return}
 else if(a==='weightdelete'){await deleteBodyWeight(b.dataset.date);return}
 else if(a==='weightedit'){editBodyWeight(b.dataset.date);return}
 else if(a==='weightcancel'){document.getElementById('weight-date').value=date();document.getElementById('weight-kg').value='';document.getElementById('weight-date').disabled=false;document.getElementById('weight-save-label').textContent='☁ 체중 기록 저장';return}
 else if(a==='weightrange'){chartRange=b.dataset.range;render();return}
 else if(a==='check'){draft.exercises[i].sets[j].done=!draft.exercises[i].sets[j].done;hydrated=true;persist();render()}
 else if(a==='checkcardio'){draft.cardio[i].done=!draft.cardio[i].done;hydrated=true;persist();render()}
 else if(a==='addset'){const ex=draft.exercises[i],s=ex.sets.at(-1)||{kg:0,reps:12};if(ex.sets.length<30)ex.sets.push({...s,done:false});hydrated=true;persist();render()}
 else if(a==='delset'){const ex=draft.exercises[i];if(ex.sets.length>1)ex.sets.pop();hydrated=true;persist();render()}
 else if(a==='delex'){if(confirm('현재 루틴에서 '+draft.exercises[i].name+' 종목을 삭제할까요?')){draft.exercises.splice(i,1);hydrated=true;persist();render()}}
 else if(a==='save')await save();
 else if(a==='sync')await sync(true);
 else if(a==='edit'){const rec=records.find(w=>String(w.id)===b.dataset.id);if(rec){if(!confirm('현재 작성 중인 루틴 대신 이 운동 기록을 수정할까요?'))return;draft={date:rec.date,editingId:rec.id,exercises:rec.exercises.map(e=>({...e,sets:e.sets.map(s=>({...s,done:true}))})),cardio:rec.cardio.map(c=>({...c,done:true}))};hydrated=true;persist();tab='work';render();window.scrollTo(0,0)}}
 else if(a==='delete')await removeRecord(b.dataset.id);
 else if(a==='cancel'){draft=newDraft();persist();render()}
 else if(a==='addex'){const name=prompt('추가할 운동 이름은 무엇인가요?');if(name&&name.trim()&&name.trim().length<=40){draft.exercises.push({name:name.trim(),group:'추가 운동',sets:[{kg:0,reps:12,done:false},{kg:0,reps:12,done:false}]});hydrated=true;persist();tab='work';render()}}
 else if(a==='reset'){if(confirm('현재 루틴 입력 내용만 초기화할까요? GitHub 운동 기록은 유지됩니다.')){draft=newDraft();hydrated=true;persist();render()}}
 else if(a==='disconnect'){if(confirm('이 브라우저의 GitHub 토큰을 삭제할까요?')){token='';remember=false;records=[];status='';sessionStorage.removeItem(SESSION_KEY);localStorage.removeItem(TOKEN_KEY);render()}}
 else if(a==='csv')download('운동기록.csv',makeCsv(),'text/csv;charset=utf-8');
 else if(a==='backup')download('운동로그-백업.json',JSON.stringify({version:1,workouts:records,draft},null,2),'application/json');
 else if(a==='import')document.getElementById('import-file').click();
});
document.addEventListener('change',async ev=>{
 const el=ev.target;
 if(el.matches('[data-field]')){const s=draft.exercises[Number(el.dataset.i)]?.sets[Number(el.dataset.j)];if(s){s[el.dataset.field]=N(el.value);hydrated=true;persist()}}
 if(el.matches('[data-cardio]')){draft.cardio[Number(el.dataset.cardio)].minutes=N(el.value);hydrated=true;persist()}
 if(el.id==='work-date'&&/^\d{4}-\d{2}-\d{2}$/.test(el.value)){draft.date=el.value;hydrated=true;persist()}
 if(el.id==='import-file'&&el.files?.length){
  try{const data=JSON.parse(await el.files[0].text());if(!data||!Array.isArray(data.workouts)||!confirm('백업의 운동 기록을 비공개 GitHub에 병합할까요?'))return;await mutate(list=>{const ids=new Set(list.map(x=>String(x.id)));return list.concat(data.workouts.filter(x=>x&&x.id&&!ids.has(String(x.id))))},'Import workout backup');if(data.draft&&Array.isArray(data.draft.exercises)){draft=data.draft;persist()}render();alert('백업을 반영했습니다.')}
  catch(e){alertError(e)}
 }
});
document.addEventListener('submit',async ev=>{
 if(ev.target.id!=='auth-form')return;ev.preventDefault();const val=document.getElementById('pat').value.trim();if(val)token=val;if(!token){alert('GitHub 토큰을 입력해주세요');return}
 remember=document.getElementById('remember').checked;
 localStorage.setItem(TOKEN_KEY,JSON.stringify({remember,token:remember?token:''}));
 if(remember)sessionStorage.removeItem(SESSION_KEY);else sessionStorage.setItem(SESSION_KEY,token);
 await sync(true);
});
render();if(token)sync();
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&token&&!busy)sync()});
})();
