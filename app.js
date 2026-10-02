(() => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const KEYS={scriptures:'mc_scriptures_v4',sessions:'mc_sessions_v4',active:'mc_active_session_v1'};
  let scriptures=safeJSON(localStorage.getItem(KEYS.scriptures),[]);
  let sessions=safeJSON(localStorage.getItem(KEYS.sessions),[]);
  let history=['home'];
  let editingId=null, importedSource='';
  let previewData=null;
  let activeSession=null, timer=null, lastCompletedId=null, editingSessionId=null, editingSessionOriginal=null;
  let sheetActions=[];
  let statRange='week';
  let statAnchor=new Date();

  function safeJSON(v,fallback){try{return JSON.parse(v)||fallback}catch{return fallback}}
  const fmtDate=d=>{d=new Date(d);return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`};
  const dayKey=d=>{d=new Date(d);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const fmtTime=d=>new Date(d).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',hour12:false});
  const fmtDur=ms=>{const t=Math.max(0,Math.floor(ms/1000)),h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=t%60;return [h,m,s].map(v=>String(v).padStart(2,'0')).join(':')};
  const inputDate=ts=>dayKey(ts);
  const inputTime=ts=>{const d=new Date(ts);return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`};
  const combineLocal=(date,time)=>{const [y,m,d]=date.split('-').map(Number),[hh,mm]=time.split(':').map(Number);return new Date(y,m-1,d,hh,mm,0,0).getTime()};
  const persist=()=>{localStorage.setItem(KEYS.scriptures,JSON.stringify(scriptures));localStorage.setItem(KEYS.sessions,JSON.stringify(sessions))};
  const toast=msg=>{const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1600)};
  const normTitle=s=>(s||'').replace(/\s+/g,'').replace(/[（）()\-—_·・]/g,'').toLowerCase();

  function go(name,push=true){
    closeSheet();
    $$('.screen').forEach(s=>s.classList.toggle('active',s.dataset.screen===name));
    const activeScreen=$(`.screen[data-screen="${name}"]`);
    if(activeScreen) activeScreen.scrollTop=0;
    if(push&&history[history.length-1]!==name) history.push(name);
    $('#menuPop').classList.remove('open');
    if(name==='library')renderLibrary();
    if(name==='records')renderRecords();
    if(name==='stats')renderStats();
    window.scrollTo(0,0);
  }
  $$('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
  $$('[data-back]').forEach(b=>b.addEventListener('click',()=>{history.pop();go(history[history.length-1]||'home',false)}));
  $('#menuBtn').onclick=()=>$('#menuPop').classList.toggle('open');

  function openSheet({title='',note='',actions=[]}){
    sheetActions=actions;
    $('#sheetTitle').textContent=title;
    $('#sheetNote').textContent=note;
    $('#sheetNote').style.display=note?'block':'none';
    $('#sheetActions').innerHTML=actions.map((a,i)=>`<button class="sheet-action ${a.kind==='danger'?'danger':''}" data-sheet-index="${i}">${esc(a.label)}</button>`).join('');
    $('#sheetActions').querySelectorAll('[data-sheet-index]').forEach(btn=>btn.onclick=()=>{
      const a=sheetActions[Number(btn.dataset.sheetIndex)];
      closeSheet();
      setTimeout(()=>a?.run?.(),80);
    });
    $('#sheetBackdrop').classList.add('open');
    $('#actionSheet').classList.add('open');
    $('#actionSheet').setAttribute('aria-hidden','false');
  }
  function closeSheet(){
    $('#sheetBackdrop')?.classList.remove('open');
    $('#actionSheet')?.classList.remove('open');
    $('#actionSheet')?.setAttribute('aria-hidden','true');
  }
  $('#sheetBackdrop').onclick=closeSheet;
  $('#sheetCancel').onclick=closeSheet;

  function openEditor(id=null){
    editingId=id; importedSource='';
    const s=id?scriptures.find(x=>x.id===id):null;
    $('#editorHeading').textContent=s?'編輯經文':'手動新增';
    $('#editTitle').value=s?.title||'';
    $('#editContent').value=s?.content||'';
    $('#editDedication').value=s?.dedication||'';
    $('#sourceChip').style.display=s?.source?'inline-block':'none';
    if(s?.source)$('#sourceChip').textContent=s.source;
    $('#deleteScripture').style.display=s?'block':'none';
    updateCount(); go('editor');
  }
  $('#manualAdd').onclick=()=>openEditor();
  $('#libAdd').onclick=()=>openEditor();
  $('#editContent').oninput=updateCount;
  function updateCount(){ $('#contentCount').textContent=`${$('#editContent').value.length.toLocaleString()} 字`; }

  function writeScripture(data,{overwriteId=null}={}){
    const now=Date.now();
    if(overwriteId){
      const target=scriptures.find(x=>x.id===overwriteId);
      if(target)Object.assign(target,data,{updatedAt:now});
    }else if(editingId){
      const target=scriptures.find(x=>x.id===editingId);

      if(target)Object.assign(target,data,{source:target.source||data.source,updatedAt:now});
    }else{
      scriptures.unshift({id:crypto.randomUUID(),...data,createdAt:now});
    }
    persist(); toast('已儲存'); go('library');
  }
  $('#saveScripture').onclick=()=>{
    const title=$('#editTitle').value.trim(),content=$('#editContent').value.trim(),dedication=$('#editDedication').value.trim();
    if(!title)return toast('請輸入經文名稱');
    const data={title,content,dedication,source:importedSource||($('#sourceChip').style.display!=='none'?$('#sourceChip').textContent.replace(/^來源：/,''):'')};
    if(!editingId){
      const same=scriptures.find(x=>normTitle(x.title)===normTitle(title));
      if(same){
        return openSheet({
          title:`已經有「${title}」`,
          note:'避免不小心重複匯入，你可以更新原本那一份，或刻意保留兩份。',
          actions:[
            {label:'更新原有經文',run:()=>writeScripture(data,{overwriteId:same.id})},
            {label:'保留兩份',run:()=>writeScripture(data)}
          ]
        });
      }
    }
    writeScripture(data);
  };

  function confirmDeleteScripture(id,after){
    const s=scriptures.find(x=>x.id===id); if(!s)return;
    const linked=sessions.filter(x=>x.scriptureId===id).length;
    openSheet({
      title:`刪除「${s.title}」？`,
      note:linked?`這部經文有 ${linked} 筆歷史念誦紀錄。你可以保留紀錄，或一起刪除。`:'這部經文目前沒有歷史念誦紀錄。',
      actions:[
        {label:'只刪除經文，保留歷史紀錄',kind:'danger',run:()=>deleteScripture(id,false,after)},
        ...(linked?[{label:'經文與歷史紀錄一起刪除',kind:'danger',run:()=>deleteScripture(id,true,after)}]:[])
      ]
    });
  }
  function deleteScripture(id,withSessions=false,after){
    scriptures=scriptures.filter(x=>x.id!==id);
    if(withSessions)sessions=sessions.filter(x=>x.scriptureId!==id);
    persist(); renderLibrary(); renderRecords(); renderStats(); toast('已刪除'); after?.();
  }
  $('#deleteScripture').onclick=()=>editingId&&confirmDeleteScripture(editingId,()=>go('library'));

  function renderLibrary(){
    const el=$('#libraryList');
    if(!scriptures.length){el.innerHTML='<div class="empty">還沒有經文。<br>可以從搜尋匯入，或手動新增。</div>';return;}
    el.innerHTML=scriptures.map(s=>{
      const total=sessions.filter(x=>x.scriptureId===s.id).reduce((a,b)=>a+(Number(b.count)||0),0);
      return `<div class="library-item"><button class="library-open" data-start-id="${s.id}"><span><span class="name">${esc(s.title)}</span><span class="meta">累積 ${total.toLocaleString()} 次${s.source?` · ${esc(s.source)}`:''}</span></span><span class="arrow">›</span></button><button class="item-menu" data-manage-id="${s.id}" aria-label="管理 ${attr(s.title)}">···</button></div>`;
    }).join('');
    el.querySelectorAll('[data-start-id]').forEach(b=>b.onclick=()=>startSession(b.dataset.startId));
    el.querySelectorAll('[data-manage-id]').forEach(b=>b.onclick=e=>{e.stopPropagation();openScriptureActions(b.dataset.manageId)});
  }
  function openScriptureActions(id){
    const s=scriptures.find(x=>x.id===id);if(!s)return;
    openSheet({title:s.title,note:'選擇要對這部經文做什麼。',actions:[
      {label:'開始念誦',run:()=>startSession(id)},
      {label:'編輯經文／回向文',run:()=>openEditor(id)},
      {label:'刪除經文',kind:'danger',run:()=>confirmDeleteScripture(id)}
    ]});
  }
  $('#startFromHome').onclick=()=>{
    if(!scriptures.length){toast('先匯入或新增一部經文');go('search');}
    else if(scriptures.length===1)startSession(scriptures[0].id);
    else go('library');
  };

  let searchTimer=null;
  $('#searchInput').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>searchScriptures($('#searchInput').value.trim()),420)});
  $('#clearSearch').onclick=()=>{$('#searchInput').value='';$('#searchResults').innerHTML='';$('#searchStatus').textContent='搜尋結果可先預覽全文，再決定要匯入哪個版本。'};

  async function searchScriptures(q){
    if(!q){$('#searchResults').innerHTML='';$('#searchStatus').textContent='搜尋結果可先預覽全文，再決定要匯入哪個版本。';return;}
    $('#searchStatus').innerHTML='<span class="loading"></span>正在搜尋維基文庫…';
    $('#searchResults').innerHTML='';
    try{
      const url=`https://zh.wikisource.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=12&utf8=1&format=json&origin=*`;
      const r=await fetch(url); if(!r.ok)throw 0;
      const j=await r.json();
      const results=(j.query?.search||[]).filter(x=>!/:/.test(x.title)||/經|咒|品|佛|般若|陀羅尼|心/.test(x.title)).slice(0,10);
      $('#searchStatus').textContent=results.length?`找到 ${results.length} 個結果。點選「預覽」先看全文，再決定是否匯入。`:'沒有找到結果，可改用手動新增。';
      $('#searchResults').innerHTML=results.map((x,i)=>`<div class="result"><div><div class="result-title">${esc(x.title)}</div><div class="result-meta">維基文庫 · 搜尋結果 ${i+1}</div></div><button class="import-btn preview-btn" data-title="${attr(x.title)}">預覽</button></div>`).join('');

      $('#searchResults').querySelectorAll('.preview-btn').forEach(b=>b.onclick=()=>previewPage(b.dataset.title));
    }catch(e){$('#searchStatus').textContent='目前無法連線搜尋。你仍可使用手動新增。';}
  }

  async function fetchPageText(title){
    const url=`https://zh.wikisource.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=text&format=json&origin=*`;
    const r=await fetch(url); if(!r.ok)throw 0;
    const j=await r.json(); const html=j.parse?.text?.['*']; if(!html)throw 0;
    const doc=new DOMParser().parseFromString(html,'text/html');
    doc.querySelectorAll('script,style,.mw-editsection,.noprint,.navbox,table,sup.reference').forEach(n=>n.remove());
    doc.querySelectorAll('br').forEach(br=>br.replaceWith('\n'));
    doc.querySelectorAll('p,div.poem,li').forEach(n=>n.append('\n'));
    return (doc.body.innerText||doc.body.textContent||'').replace(/\n{3,}/g,'\n\n').replace(/[ \t]+\n/g,'\n').trim();
  }
  async function previewPage(title){
    previewData={title,text:'',source:'維基文庫'};
    $('#previewTitle').textContent=title;
    $('#previewBody').innerHTML='<div class="preview-loading"><span class="loading"></span> 正在載入全文…</div>';
    $('#confirmImport').disabled=true; go('preview');
    try{const text=await fetchPageText(title);previewData.text=text;$('#previewBody').textContent=text||'這個版本沒有可讀取的正文內容。';$('#confirmImport').disabled=!text;}
    catch(e){$('#previewBody').innerHTML='<div class="preview-loading">預覽載入失敗。請返回搜尋結果後重試，或改用手動新增。</div>';$('#confirmImport').disabled=true;}
  }
  $('#backToResults').onclick=()=>{history.pop();go('search',false)};
  $('#confirmImport').onclick=()=>{
    if(!previewData?.text)return;
    editingId=null; importedSource=previewData.source;
    $('#editorHeading').textContent='匯入經文';
    $('#editTitle').value=previewData.title;
    $('#editContent').value=previewData.text;
    $('#editDedication').value='';
    $('#sourceChip').textContent='來源：維基文庫';
    $('#sourceChip').style.display='inline-block';
    $('#deleteScripture').style.display='none'; updateCount(); go('editor');
  };

  function persistActiveSession(){
    if(!activeSession)return;
    localStorage.setItem(KEYS.active,JSON.stringify({...activeSession,checkpointAt:Date.now()}));
  }
  function clearActiveSession(){localStorage.removeItem(KEYS.active)}
  function renderActiveSessionUI(s){
    $('#counterTitle').textContent=s.title;
    $('#readingTitle').textContent=s.title;
    $('#readingText').textContent=s.content||'';
    $('#readingText').classList.toggle('reading-empty',!s.content);
    if(!s.content)$('#readingText').textContent='這部經文尚未加入正文內容。';
    if(s.dedication){$('#readingDedication').style.display='block';$('#readingDedicationText').textContent=s.dedication}else{$('#readingDedication').style.display='none';$('#readingDedicationText').textContent=''}
    $('#countNumber').textContent=(activeSession?.count||0).toLocaleString();
    $('#readingCount').textContent=`${(activeSession?.count||0).toLocaleString()} 次`;
    $('#pauseBtn').textContent=activeSession?.pauseStarted?'▶':'Ⅱ';
  }
  function restoreActiveSession(){
    const saved=safeJSON(localStorage.getItem(KEYS.active),null);
    if(!saved?.id||!saved?.scriptureId)return false;
    const s=scriptures.find(x=>x.id===saved.scriptureId);
    if(!s){clearActiveSession();return false}
    const now=Date.now(),checkpoint=Number(saved.checkpointAt)||now;
    activeSession={...saved};
    delete activeSession.checkpointAt;
    activeSession.pausedMs=Number(activeSession.pausedMs)||0;
    activeSession.count=Number(activeSession.count)||0;
    if(activeSession.pauseStarted){
      const pauseStart=Number(activeSession.pauseStarted)||checkpoint;
      activeSession.pausedMs+=Math.max(0,now-pauseStart);
      activeSession.pauseStarted=now;
    }else{
      activeSession.pausedMs+=Math.max(0,now-checkpoint);
      activeSession.pauseStarted=null;
    }
    renderActiveSessionUI(s);
    updateCounterTime();
    go('counter');
    clearInterval(timer);timer=setInterval(updateCounterTime,1000);
    persistActiveSession();
    return true;
  }

  function startSession(scriptureId){
    const s=scriptures.find(x=>x.id===scriptureId);if(!s)return;
    activeSession={id:crypto.randomUUID(),scriptureId,count:0,startedAt:Date.now(),pausedMs:0,pauseStarted:null,endedAt:null};
    renderActiveSessionUI(s);persistActiveSession();updateCounterTime();go('counter');clearInterval(timer);timer=setInterval(updateCounterTime,1000);
  }
  function activeElapsed(){if(!activeSession)return 0;const end=activeSession.endedAt||Date.now();let p=activeSession.pausedMs||0;if(activeSession.pauseStarted)p+=end-activeSession.pauseStarted;return end-activeSession.startedAt-p}
  function updateCounterTime(){if(!activeSession)return;$('#elapsed').textContent=fmtDur(activeElapsed());$('#sessionRange').textContent=`${fmtDate(activeSession.startedAt)} ${fmtTime(activeSession.startedAt)} — ${activeSession.pauseStarted?'paused':fmtTime(Date.now())}`;persistActiveSession()}
  function incrementCount(){if(!activeSession||activeSession.pauseStarted)return;activeSession.count++;$('#countNumber').textContent=activeSession.count;$('#readingCount').textContent=`${activeSession.count.toLocaleString()} 次`;persistActiveSession();if(navigator.vibrate)navigator.vibrate(12)}
  $('#countHit').onclick=incrementCount;
  $('#readingCountHit').onclick=incrementCount;
  $('#pauseBtn').onclick=()=>{if(!activeSession)return;if(activeSession.pauseStarted){activeSession.pausedMs+=Date.now()-activeSession.pauseStarted;activeSession.pauseStarted=null;$('#pauseBtn').textContent='Ⅱ'}else{activeSession.pauseStarted=Date.now();$('#pauseBtn').textContent='▶'}persistActiveSession();updateCounterTime()};
  $('#stopBtn').onclick=()=>finishSession();
  $('#dockDot').onclick=()=>toast(`本次 ${activeSession?.count||0} 次`);
  $('#counterBack').onclick=()=>{
    if(!activeSession)return go('home');
    openSheet({title:'離開這次念誦？',note:`目前 ${activeSession.count} 次。離開時可以儲存，也可以直接放棄，不會再產生誤觸紀錄。`,actions:[
      {label:'儲存並結束',run:()=>finishSession(true)},
      {label:'放棄這次，不留紀錄',kind:'danger',run:()=>discardActiveSession()}
    ]});
  };
  $('#counterMore').onclick=()=>{
    if(!activeSession)return;

    const today=sessions.filter(x=>x.scriptureId===activeSession.scriptureId&&dayKey(x.startedAt)===dayKey(activeSession.startedAt)).reduce((a,b)=>a+(Number(b.count)||0),0)+(activeSession.count||0);
    openSheet({title:`今天目前累積 ${today} 次`,note:'進行中的念誦不會跳去其他編輯頁，避免計時或次數被意外打斷。',actions:[
      {label:'放棄這次念誦',kind:'danger',run:()=>discardActiveSession()}
    ]});
  };
  function discardActiveSession(){clearInterval(timer);clearActiveSession();activeSession=null;toast('這次沒有留下紀錄');go('home')}
  function finishSession(force=false){
    if(!activeSession)return;
    if(activeSession.count===0&&!force){
      return openSheet({title:'這次還是 0 次',note:'如果是誤按開始，可以直接放棄；若你確實想留下 0 次紀錄，也可以儲存。',actions:[
        {label:'儲存 0 次紀錄',run:()=>finishSession(true)},
        {label:'放棄這次，不留紀錄',kind:'danger',run:()=>discardActiveSession()}
      ]});
    }
    clearInterval(timer);
    if(activeSession.pauseStarted){activeSession.pausedMs+=Date.now()-activeSession.pauseStarted;activeSession.pauseStarted=null}
    activeSession.endedAt=Date.now();activeSession.durationMs=activeElapsed();
    sessions.unshift({...activeSession});lastCompletedId=activeSession.id;persist();
    const s=scriptures.find(x=>x.id===activeSession.scriptureId);
    const today=sessions.filter(x=>x.scriptureId===activeSession.scriptureId&&dayKey(x.startedAt)===dayKey(activeSession.startedAt)).reduce((a,b)=>a+(Number(b.count)||0),0);
    $('#completeCount').textContent=activeSession.count.toLocaleString();$('#completeDuration').textContent=fmtDur(activeSession.durationMs);$('#completeDate').textContent=fmtDate(activeSession.startedAt);$('#completeStart').textContent=fmtTime(activeSession.startedAt);$('#completeEnd').textContent=fmtTime(activeSession.endedAt);$('#todayTotal').textContent=today.toLocaleString();
    if(s?.dedication){$('#dedicationCard').style.display='block';$('#completeDedication').textContent=s.dedication}else $('#dedicationCard').style.display='none';
    clearActiveSession();activeSession=null;go('complete');
  }

  $('#completeMore').onclick=()=>{
    const id=lastCompletedId;if(!id||!sessions.find(x=>x.id===id))return toast('這筆紀錄已不存在');
    openSheet({title:'這次念誦紀錄',actions:[
      {label:'編輯這次紀錄',run:()=>openSessionEditor(id)},
      {label:'刪除這次紀錄',kind:'danger',run:()=>confirmDeleteSession(id,()=>go('home'))}
    ]});
  };

  function renderRecords(){
    const el=$('#recordList');if(!sessions.length){el.innerHTML='<div class="empty">還沒有念誦紀錄。</div>';return;}
    const groups={};sessions.forEach(sess=>{const d=dayKey(sess.startedAt);const key=d+'__'+sess.scriptureId;(groups[key]??=[]).push(sess)});
    const dates=[...new Set(Object.values(groups).flat().map(x=>dayKey(x.startedAt)))].sort().reverse();let html='';
    dates.forEach(d=>{
      html+=`<div class="record-date">${d.replaceAll('-','.')}</div>`;
      Object.entries(groups).filter(([k])=>k.startsWith(d+'__')).forEach(([k,arr])=>{
        const sid=k.split('__')[1],s=scriptures.find(x=>x.id===sid),name=s?.title||'已刪除經文',total=arr.reduce((a,b)=>a+(Number(b.count)||0),0);
        html+=`<div class="record-group"><div class="record-head"><div class="scripture">${esc(name)}</div><div><span class="subtle">今日累積</span> <span class="daily">${total.toLocaleString()}</span> 次</div></div>${arr.sort((a,b)=>a.startedAt-b.startedAt).map((x,i)=>`<div class="session-row"><span>第 ${i+1} 次</span><span><strong>${fmtTime(x.startedAt)}–${fmtTime(x.endedAt)}</strong><br>${fmtDur(x.durationMs)}</span><span class="session-actions"><span class="session-time">${Number(x.count||0).toLocaleString()} 次</span><button class="session-menu" data-session-id="${x.id}" aria-label="紀錄選項">···</button></span></div>`).join('')}</div>`;
      });
    });
    el.innerHTML=html;
    el.querySelectorAll('.session-menu').forEach(btn=>btn.onclick=()=>openSessionActions(btn.dataset.sessionId));
  }
  function openSessionActions(id){
    const sess=sessions.find(x=>x.id===id);if(!sess)return;
    const name=scriptures.find(x=>x.id===sess.scriptureId)?.title||'已刪除經文';
    openSheet({title:`${name} · ${fmtDate(sess.startedAt)}`,note:`${fmtTime(sess.startedAt)}–${fmtTime(sess.endedAt)} · ${sess.count} 次`,actions:[
      {label:'編輯這次紀錄',run:()=>openSessionEditor(id)},
      {label:'刪除這次紀錄',kind:'danger',run:()=>confirmDeleteSession(id)}
    ]});
  }
  function confirmDeleteSession(id,after){
    const sess=sessions.find(x=>x.id===id);if(!sess)return;
    const scripture=scriptures.find(x=>x.id===sess.scriptureId);const name=scripture?.title||'這部經文';
    openSheet({title:'確定刪除這次紀錄？',note:`${fmtDate(sess.startedAt)} ${fmtTime(sess.startedAt)} · ${name} · ${sess.count} 次。刪除後，當日累積與統計會同步重算。`,actions:[
      {label:'刪除這次紀錄',kind:'danger',run:()=>deleteSession(id,after)}
    ]});
  }
  function deleteSession(id,after){

    sessions=sessions.filter(x=>x.id!==id);persist();renderRecords();renderStats();toast('已刪除這次紀錄');after?.();
  }

  function openSessionEditor(id){
    const sess=sessions.find(x=>x.id===id);if(!sess)return;
    editingSessionId=id;
    editingSessionOriginal={
      scriptureId:sess.scriptureId,count:Number(sess.count)||0,startedAt:sess.startedAt,endedAt:sess.endedAt||sess.startedAt,durationMs:sess.durationMs||0,
      date:inputDate(sess.startedAt),startTime:inputTime(sess.startedAt),endTime:inputTime(sess.endedAt||sess.startedAt)
    };
    $('#sessionScripture').innerHTML=scriptures.map(s=>`<option value="${s.id}">${esc(s.title)}</option>`).join('') + (!scriptures.some(s=>s.id===sess.scriptureId)?`<option value="${sess.scriptureId}">已刪除經文</option>`:'');
    $('#sessionScripture').value=sess.scriptureId;
    $('#sessionCount').value=Number(sess.count)||0;
    $('#sessionDate').value=editingSessionOriginal.date;
    $('#sessionStartTime').value=editingSessionOriginal.startTime;
    $('#sessionEndTime').value=editingSessionOriginal.endTime;
    updateSessionDurationPreview();go('sessionEditor');
  }
  function getSessionEditTimes(){
    const date=$('#sessionDate').value,start=$('#sessionStartTime').value,end=$('#sessionEndTime').value;
    if(!date||!start||!end)return null;
    const st=combineLocal(date,start);let et=combineLocal(date,end);if(et<st)et+=86400000;return {st,et};
  }
  function updateSessionDurationPreview(){const t=getSessionEditTimes();$('#sessionDurationPreview').textContent=t?fmtDur(t.et-t.st):'—'}
  ['sessionDate','sessionStartTime','sessionEndTime'].forEach(id=>$('#'+id).addEventListener('input',updateSessionDurationPreview));
  $('#saveSessionEdit').onclick=()=>{
    const sess=sessions.find(x=>x.id===editingSessionId);if(!sess)return;
    const t=getSessionEditTimes();if(!t)return toast('請確認日期與時間');
    const count=Math.max(0,Number($('#sessionCount').value)||0);
    const timeFieldsUnchanged=editingSessionOriginal && $('#sessionDate').value===editingSessionOriginal.date && $('#sessionStartTime').value===editingSessionOriginal.startTime && $('#sessionEndTime').value===editingSessionOriginal.endTime;
    const startedAt=timeFieldsUnchanged?editingSessionOriginal.startedAt:t.st;
    const endedAt=timeFieldsUnchanged?editingSessionOriginal.endedAt:t.et;
    const durationMs=timeFieldsUnchanged?editingSessionOriginal.durationMs:(t.et-t.st);
    Object.assign(sess,{scriptureId:$('#sessionScripture').value,count,startedAt,endedAt,durationMs,pausedMs:0,pauseStarted:null,editedAt:Date.now()});
    persist();renderRecords();renderStats();toast('已更新紀錄');go('records');
  };
  $('#deleteSessionEdit').onclick=()=>editingSessionId&&confirmDeleteSession(editingSessionId,()=>go('records'));

  const startOfDay=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
  const endOfDay=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate(),23,59,59,999);
  function statsWindow(range,anchor=statAnchor){
    const now=new Date(anchor);
    if(range==='month'){
      const start=new Date(now.getFullYear(),now.getMonth(),1),end=endOfDay(new Date(now.getFullYear(),now.getMonth()+1,0));
      const daysInMonth=end.getDate(),buckets=[];
      for(let from=1;from<=daysInMonth;from+=7){
        const to=Math.min(from+6,daysInMonth),bs=new Date(now.getFullYear(),now.getMonth(),from),be=endOfDay(new Date(now.getFullYear(),now.getMonth(),to));
        buckets.push({start:bs,end:be,label:`${Math.floor((from-1)/7)+1}週`,tip:`${now.getMonth()+1}/${from}–${now.getMonth()+1}/${to}`});
      }
      return {start,end,buckets,label:`${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}`};
    }
    if(range==='year'){
      const start=new Date(now.getFullYear(),0,1),end=endOfDay(new Date(now.getFullYear(),11,31)),buckets=[];
      for(let m=0;m<12;m++) buckets.push({start:new Date(now.getFullYear(),m,1),end:endOfDay(new Date(now.getFullYear(),m+1,0)),label:String(m+1),tip:`${m+1} 月`});
      return {start,end,buckets,label:String(now.getFullYear())};
    }
    const end=endOfDay(now),start=startOfDay(new Date(now.getFullYear(),now.getMonth(),now.getDate()-6)),buckets=[];
    for(let i=0;i<7;i++){
      const d=new Date(start);d.setDate(start.getDate()+i);const bs=startOfDay(d),be=endOfDay(d);
      buckets.push({start:bs,end:be,label:['日','一','二','三','四','五','六'][d.getDay()],tip:`${d.getMonth()+1}/${d.getDate()} · 週${['日','一','二','三','四','五','六'][d.getDay()]}`});
    }
    return {start,end,buckets,label:`${start.getMonth()+1}/${start.getDate()} – ${end.getMonth()+1}/${end.getDate()}`};
  }
  function sessionsInWindow(start,end){const a=start.getTime(),b=end.getTime();return sessions.filter(x=>Number(x.startedAt)>=a&&Number(x.startedAt)<=b)}
  function renderStats(){

    const w=statsWindow(statRange,statAnchor),filtered=sessionsInWindow(w.start,w.end);
    const activeDays=new Set(filtered.map(x=>dayKey(x.startedAt))).size;
    const total=filtered.reduce((a,b)=>a+(Number(b.count)||0),0);
    $('#statDays').textContent=activeDays.toLocaleString();
    $('#statTotal').textContent=total.toLocaleString();
    $('#statsPeriod').textContent=w.label;
    $('#statListPeriod').textContent=w.label;
    $$('.stats-tab').forEach(btn=>{const on=btn.dataset.range===statRange;btn.classList.toggle('active',on);btn.setAttribute('aria-selected',on?'true':'false')});
    const points=w.buckets.map(b=>{const n=sessionsInWindow(b.start,b.end).reduce((a,x)=>a+(Number(x.count)||0),0);return {...b,n}});
    const mx=Math.max(1,...points.map(x=>x.n));
    const chart=$('#bars');
    chart.innerHTML=`<div class="chart-tip" id="chartTip"></div>`+points.map((x,i)=>{
      const h=x.n===0?2:Math.max(8,Math.round(118*x.n/mx));
      return `<div class="barwrap"><button class="barbtn" data-i="${i}" aria-label="${attr(x.tip)} ${x.n.toLocaleString()} 次"><div class="bar" style="height:${h}px;opacity:${x.n===0?.18:1}"></div><span>${esc(x.label)}</span></button></div>`;
    }).join('');
    const tip=$('#chartTip');
    chart.querySelectorAll('.barbtn').forEach(btn=>btn.onclick=()=>{
      const x=points[Number(btn.dataset.i)];chart.querySelectorAll('.barbtn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');
      tip.textContent=`${x.tip} · ${x.n.toLocaleString()} 次`;tip.classList.add('show');clearTimeout(renderStats._tipTimer);renderStats._tipTimer=setTimeout(()=>tip.classList.remove('show'),2600);
    });
    const by={};filtered.forEach(x=>by[x.scriptureId]=(by[x.scriptureId]||0)+(Number(x.count)||0));
    $('#statByScripture').innerHTML=Object.entries(by).sort((a,b)=>b[1]-a[1]).map(([id,n])=>`<div class="record-head hairline"><div class="scripture">${esc(scriptures.find(s=>s.id===id)?.title||'已刪除經文')}</div><div class="daily">${n.toLocaleString()} <span style="font-size:13px">次</span></div></div>`).join('')||'<div class="empty">這個期間尚無資料</div>';
  }
  function shiftStats(dir){
    const d=new Date(statAnchor);
    if(statRange==='week')d.setDate(d.getDate()+dir*7);
    else if(statRange==='month'){d.setDate(1);d.setMonth(d.getMonth()+dir);}
    else d.setFullYear(d.getFullYear()+dir);
    statAnchor=d;renderStats();
  }
  $('#statsPrev').onclick=()=>shiftStats(-1);
  $('#statsNext').onclick=()=>shiftStats(1);
  $('#statsPeriod').onclick=()=>{
    const picker=statRange==='month'?$('#statsMonthPicker'):$('#statsDatePicker');
    if(statRange==='month')picker.value=`${statAnchor.getFullYear()}-${String(statAnchor.getMonth()+1).padStart(2,'0')}`;
    else picker.value=dayKey(statAnchor);
    try{if(picker.showPicker)picker.showPicker();else picker.click()}catch{picker.click()}
  };
  $('#statsDatePicker').onchange=e=>{
    if(!e.target.value)return;
    const [y,m,d]=e.target.value.split('-').map(Number);
    statAnchor=new Date(y,m-1,d,12,0,0,0);renderStats();
  };
  $('#statsMonthPicker').onchange=e=>{
    if(!e.target.value)return;
    const [y,m]=e.target.value.split('-').map(Number);
    statAnchor=new Date(y,m-1,1,12,0,0,0);renderStats();
  };
  $$('.stats-tab').forEach(btn=>btn.onclick=()=>{statRange=btn.dataset.range;renderStats()});

  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')persistActiveSession()});
  window.addEventListener('pagehide',()=>persistActiveSession());
  restoreActiveSession();

  function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
  function attr(s=''){return esc(s)}
  if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js?v=11').catch(()=>{});
})();
