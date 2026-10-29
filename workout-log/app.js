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
  const v=await getRemote();records=v.data.workouts.slice();status='비공개 운동 기록 '+records.length+'개 동기화됨';populateDraft();
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
 h+='</section><button class="btn primary" type="button" data-action="save" '+(busy?'disabled':'')+'>'+(busy?'처리 중…':draft.editingId?'☁️ GitHub에 수정 저장':'☁️ GitHub에 운동 저장')+'</button><p class="help">완료 체크된 세트와 유산소만 저장됩니다. GitHub 연결 전에는 작성한 내용이 휴대폰 브라우저에 임시 보관됩니다.</p>';
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
  h+='<div class="buttons"><button class="btn" data-action="edit" data-id="'+E(w.id)+'">수정</button><button class="btn danger" data-action="delete" data-id="'+E(w.id)+'">삭제</button></div></section>';
 }
 h+=btn('CSV 기록 내보내기','csv','full');return h;
}
function renderSettings(){
 return '<h2>비공개 GitHub 연동</h2><section class="card"><p class="muted">ChatGPT에서 저장한 기록과 웹에서 저장한 기록은 같은 비공개 <b>'+E(REPO)+'</b>의 <b>'+E(PATH)+'</b>를 사용합니다.</p><form id="auth-form"><label class="field" for="pat">GitHub Fine-grained 토큰</label><input class="full" id="pat" type="password" placeholder="'+(token?'기존 토큰 설정됨 · 바꾸려면 새 토큰 입력':'github_pat_...')+'" autocomplete="off"><label class="field" style="font-weight:500"><input type="checkbox" id="remember" '+(remember?'checked':'')+'> 이 기기에 토큰 기억하기</label><button class="btn primary" type="submit">연결 / 토큰 변경</button></form><p class="help">토큰은 diet-health 저장소만 선택하고 <b>Contents: Read and write</b> 권한을 지정하세요. 기억하기는 기본적으로 꺼져 있습니다. 사용하면 토큰이 이 브라우저에 저장되므로 개인 기기에서만 설정하세요.</p><div class="buttons">'+btn('최신 기록 불러오기','sync')+btn('연결 해제','disconnect')+'</div><p class="help"><a href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noopener noreferrer">GitHub 토큰 설정 열기</a></p></section><h2>내 운동 관리</h2><section class="card"><div class="buttons">'+btn('운동 종목 추가','addex')+btn('루틴 초기화','reset')+'</div><div class="buttons">'+btn('JSON 백업 다운로드','backup')+btn('백업 불러오기','import')+'</div><input type="file" id="import-file" accept=".json,application/json" class="hidden"/><p class="help">브라우저에 저장한 임시 루틴은 새 주소로 옮겨지지 않습니다. 운동 기록은 기존 비공개 GitHub에서 다시 불러옵니다. 이 웹사이트의 화면 코드는 공개지만 운동 기록과 토큰은 코드에 포함되지 않습니다.</p></section>';
}
function render(){
 cloud.className='cloud '+(!token||status.includes('오류')||status.includes('실패')?'warn':'');
 cloud.textContent=status||(!token?'연결 전 · 관리 탭에서 GitHub 토큰을 입력해 주세요':'GitHub 연결됨');
 document.getElementById('week').textContent='주 3회 전신 운동';
 document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));
 view.innerHTML=tab==='work'?renderWork():tab==='history'?renderHistory():renderSettings();
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
 if(a==='check'){draft.exercises[i].sets[j].done=!draft.exercises[i].sets[j].done;hydrated=true;persist();render()}
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
