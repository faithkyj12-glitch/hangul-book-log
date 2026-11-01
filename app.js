(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const DB_NAME = "our-home-book-log";
  const DB_VERSION = 1;
  let db, activeReader = "mina", viewMonth = new Date(), selectedDate = dateKey(new Date());
  let coverData = null, editingId = null, cloudClient = null, cloudUser = null, cloudReady = false;
  let records = [];
  const readerNames = {mina:"민아", yuna:"윤아"};
  const configKey = "booklog-supabase-config";

  function dateKey(d) { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`; }
  function parseDate(s) { const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); }
  function monthKey(s) { return s.slice(0,7); }
  function escapeHtml(s="") { return String(s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function fmtDate(s, opts={month:"long",day:"numeric",weekday:"short"}) { return parseDate(s).toLocaleDateString("ko-KR",opts); }
  function id() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  function toast(msg) { const el=$("toast"); el.textContent=msg; el.classList.add("show"); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove("show"),2600); }
  function openDialog(id) { $(id).showModal(); }
  function closeDialog(id) { $(id).close(); }

  function openDB() {
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains("records")){const s=d.createObjectStore("records",{keyPath:"id"});s.createIndex("reader","reader");s.createIndex("date","date");}};
      req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
    });
  }
  function store(mode="readonly") { return db.transaction("records",mode).objectStore("records"); }
  function getAllLocal() { return new Promise((resolve,reject)=>{const r=store().getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);}); }
  function putLocal(item) { return new Promise((resolve,reject)=>{const r=store("readwrite").put(item);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);}); }
  function deleteLocal(key) { return new Promise((resolve,reject)=>{const r=store("readwrite").delete(key);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);}); }

  function readerRecords() { return records.filter(r=>r.reader===activeReader); }
  function monthRecords() { return readerRecords().filter(r=>monthKey(r.date)===dateKey(new Date(viewMonth.getFullYear(),viewMonth.getMonth(),1)).slice(0,7)); }
  function selectedRecords() { return readerRecords().filter(r=>r.date===selectedDate).sort((a,b)=>(a.createdAt||"").localeCompare(b.createdAt||"")); }
  function render() {
    document.querySelectorAll(".reader-tab").forEach(b=>b.classList.toggle("active",b.dataset.reader===activeReader));
    const mk=`${viewMonth.getFullYear()}-${String(viewMonth.getMonth()+1).padStart(2,"0")}`;
    $("monthTitle").textContent=`${viewMonth.getFullYear()}년 ${viewMonth.getMonth()+1}월 독서`;
    const mr=monthRecords(), today=dateKey(new Date());
    $("monthCount").innerHTML=`${mr.length}<span>권</span>`;
    $("monthSub").textContent=mr.length ? `기록한 책 ${new Set(mr.map(r=>r.title.trim().toLowerCase())).size}종` : "책을 읽을 때마다 기록해 보세요";
    $("todayCount").innerHTML=`${readerRecords().filter(r=>r.date===today).length}<span>권</span>`;
    $("todaySub").textContent=activeReader=== "mina" ? "민아의 오늘 기록" : "윤아의 오늘 기록";
    $("daysCount").innerHTML=`${new Set(mr.map(r=>r.date)).size}<span>일</span>`;
    renderCalendar(mr);
    $("selectedDateTitle").textContent=`${fmtDate(selectedDate,{month:"long",day:"numeric"})} 읽은 책`;
    $("selectedDateSub").textContent=`${readerNames[activeReader]} · ${selectedRecords().length}권 기록`;
    renderBookList();
    $("totalLabel").textContent=`${mr.length}권`;
    renderRecent(mr);
  }
  function renderCalendar(mr) {
    const cal=$("calendar"); cal.innerHTML="";
    const year=viewMonth.getFullYear(), month=viewMonth.getMonth();
    const first=new Date(year,month,1), last=new Date(year,month+1,0), start=first.getDay();
    const counts={}; mr.forEach(r=>counts[r.date]=(counts[r.date]||0)+1);
    const cells=Math.ceil((start+last.getDate())/7)*7;
    for(let i=0;i<cells;i++){
      const day=i-start+1, valid=day>=1&&day<=last.getDate();
      const key=valid?dateKey(new Date(year,month,day)):"";
      const b=document.createElement("button"); b.className="day-cell";
      if(!valid){b.disabled=true;b.classList.add("other");b.innerHTML="<span class='day-num'> </span>";}
      else{
        if(counts[key])b.classList.add("has-books");
        if(key===selectedDate)b.classList.add("selected");
        if(key===dateKey(new Date()))b.classList.add("today");
        b.innerHTML=`<span class="day-num">${day}</span><span class="day-count">${counts[key]?`${counts[key]}권`:""}</span>`;
        b.addEventListener("click",()=>{selectedDate=key;render();});
        b.setAttribute("aria-label",`${key}, ${counts[key]||0}권`);
      }
      cal.appendChild(b);
    }
  }
  function renderBookList() {
    const list=$("bookList"), arr=selectedRecords(); list.innerHTML="";
    $("emptyState").hidden=arr.length>0;
    list.hidden=arr.length===0;
    arr.forEach(r=>{
      const row=document.createElement("article");row.className="book-row";
      const img=document.createElement("img");img.className="book-cover";img.alt="책 표지";img.src=r.cover||"";
      if(!r.cover){img.classList.add("no-cover");img.alt="표지 사진 없음";img.src="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100"><rect width="100%" height="100%" fill="#f5e6d9"/><text x="50%" y="54%" text-anchor="middle" font-size="30">📖</text></svg>');}
      const info=document.createElement("div");info.className="book-info";info.innerHTML=`<strong>${escapeHtml(r.title)}</strong><small>${escapeHtml(readerNames[r.reader])}${r.memo?` · ${escapeHtml(r.memo)}`:""}</small>`;
      const actions=document.createElement("div");actions.className="row-actions";
      const detail=document.createElement("button");detail.className="tiny-btn";detail.textContent="보기";detail.onclick=()=>showDetail(r.id);
      const del=document.createElement("button");del.className="tiny-btn";del.textContent="삭제";del.onclick=()=>removeRecord(r.id);
      actions.append(detail,del);row.append(img,info,actions);list.appendChild(row);
    });
  }
  function renderRecent(mr) {
    const list=$("recentList");list.innerHTML="";
    [...mr].sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).slice(0,8).forEach(r=>{
      const item=document.createElement("div");item.className="recent-item";
      const img=document.createElement("img");img.className="mini-cover";img.alt="";img.src=r.cover||"data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="50"><rect width="100%" height="100%" fill="#f5e6d9"/><text x="50%" y="58%" text-anchor="middle" font-size="18">📖</text></svg>');
      const d=document.createElement("div");d.innerHTML=`<strong>${escapeHtml(r.title)}</strong><small>${escapeHtml(r.date)} · ${escapeHtml(readerNames[r.reader])}</small>`;
      item.append(img,d);list.appendChild(item);
    });
    if(!list.children.length)list.innerHTML='<p class="help-text">이번 달 기록이 아직 없어요.</p>';
  }
  async function refresh() { records=await getAllLocal(); render(); }
  function showDetail(recordId) {
    const r=records.find(x=>x.id===recordId);if(!r)return;
    $("detailContent").innerHTML=`<div class="detail-text">${r.cover?`<img class="detail-cover" src="${r.cover}" alt="책 표지">`:""}<p class="eyebrow">BOOK DETAIL</p><h2>${escapeHtml(r.title)}</h2><p>${escapeHtml(r.date)} · ${escapeHtml(readerNames[r.reader])}</p><p>${escapeHtml(r.memo||"메모 없음")}</p></div><div class="modal-actions"><button class="secondary-btn" id="editRecordBtn">수정하기</button><button class="primary-btn" id="deleteRecordDetailBtn">삭제하기</button></div>`;
    $("editRecordBtn").onclick=()=>{closeDialog("detailDialog");editRecord(recordId);};
    $("deleteRecordDetailBtn").onclick=()=>removeRecord(recordId);
    openDialog("detailDialog");
  }
  function resetBookForm() {
    $("bookForm").reset();coverData=null;editingId=null;$("coverPreview").hidden=true;$("coverPreview").src="";$("photoPlaceholder").hidden=false;$("ocrBtn").disabled=true;$("ocrStatus").textContent="사진을 등록하면 제목을 자동으로 읽어볼 수 있어요.";
    $("readDate").value=selectedDate;$("saveBookBtn").textContent="기록 저장";
  }
  function openNewBook() { resetBookForm();openDialog("bookDialog");setTimeout(()=>$("bookTitle").focus(),100); }
  function editRecord(recordId) {
    const r=records.find(x=>x.id===recordId);if(!r)return;
    resetBookForm();editingId=r.id;coverData=r.cover||null;
    $("bookTitle").value=r.title;$("readDate").value=r.date;$("memo").value=r.memo||"";
    if(r.cover){$("coverPreview").src=r.cover;$("coverPreview").hidden=false;$("photoPlaceholder").hidden=true;$("ocrBtn").disabled=false;}
    $("saveBookBtn").textContent="수정 저장";openDialog("bookDialog");
  }
  async function removeRecord(recordId) {
    if(!confirm("이 독서 기록을 삭제할까요?"))return;
    const r=records.find(x=>x.id===recordId);await deleteLocal(recordId);
    if(cloudReady&&cloudUser){try{await cloudClient.from("book_records").delete().eq("id",recordId).eq("user_id",cloudUser.id);}catch(e){console.warn(e);}}
    closeDialog("detailDialog");await refresh();toast("독서 기록을 삭제했어요.");
  }
  async function compressImage(file) {
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();reader.onerror=reject;reader.onload=()=>{
        const img=new Image();img.onerror=()=>resolve(reader.result);img.onload=()=>{
          const max=1200, scale=Math.min(1,max/Math.max(img.width,img.height));
          const canvas=document.createElement("canvas");canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
          const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0,canvas.width,canvas.height);
          resolve(canvas.toDataURL("image/jpeg",.78));
        };img.src=reader.result;
      };reader.readAsDataURL(file);
    });
  }
  async function runOCR() {
    if(!coverData)return;
    if(!window.Tesseract){toast("OCR 라이브러리를 불러오지 못했어요.");return;}
    $("ocrBtn").disabled=true;$("ocrStatus").textContent="사진에서 글자를 읽는 중이에요. 잠시 기다려 주세요.";
    try{
      const result=await Tesseract.recognize(coverData,"kor+eng",{logger:m=>{if(m.status==="recognizing text")$("ocrStatus").textContent=`제목 인식 중… ${Math.round((m.progress||0)*100)}%`;}});
      const text=result.data.text.split("\n").map(s=>s.trim()).filter(Boolean).sort((a,b)=>b.length-a.length);
      const cleaned=(text[0]||"").replace(/[|_~]/g," ").trim();
      if(cleaned){$("bookTitle").value=cleaned;$("ocrStatus").textContent="제목 후보를 입력했어요. 정확한지 확인하고 수정해 주세요.";}
      else $("ocrStatus").textContent="제목을 찾지 못했어요. 책 제목을 직접 입력해 주세요.";
    }catch(e){console.error(e);$("ocrStatus").textContent="자동 인식에 실패했어요. 제목을 직접 입력해 주세요.";}
    finally{$("ocrBtn").disabled=false;}
  }
  async function saveRecord(event) {
    event.preventDefault();
    const title=$("bookTitle").value.trim(), date=$("readDate").value;
    if(!title||!date){toast("책 제목과 읽은 날짜를 입력해 주세요.");return;}
    const previous=editingId?records.find(r=>r.id===editingId):null;
    const item={id:editingId||id(),reader:activeReader,title,date,memo:$("memo").value.trim(),cover:coverData||(previous&&previous.cover)||null,createdAt:previous?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),syncStatus:"local"};
    await putLocal(item);closeDialog("bookDialog");selectedDate=date;viewMonth=parseDate(date);await refresh();toast("독서 기록을 저장했어요.");
    if(cloudReady&&cloudUser) syncRecord(item).catch(e=>{console.error(e);toast("기기는 저장됐지만 클라우드 동기화에 실패했어요.");});
  }
  async function exportBackup() {
    const all=await getAllLocal();
    const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),records:all},null,2)],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`독서기록-백업-${dateKey(new Date())}.json`;a.click();URL.revokeObjectURL(a.href);toast("백업 파일을 만들었어요.");
  }
  function loadConfig() { try{return JSON.parse(localStorage.getItem(configKey)||"{}");}catch{return{};} }
  function saveConfig() { localStorage.setItem(configKey,JSON.stringify({url:$("supabaseUrl").value.trim(),key:$("supabaseKey").value.trim()})); }
  async function setupCloud() {
    saveConfig();const c=loadConfig();
    if(!c.url||!c.key){$("cloudMessage").textContent="프로젝트 URL과 키를 입력해 주세요.";return false;}
    if(!window.supabase){$("cloudMessage").textContent="클라우드 라이브러리를 불러오지 못했어요.";return false;}
    try{
      cloudClient=window.supabase.createClient(c.url,c.key);
      const {data,error}=await cloudClient.auth.getSession();if(error)throw error;
      cloudUser=data.session?.user||null;cloudReady=true;
      $("storageStatus").textContent=cloudUser?`클라우드 연결됨 · ${cloudUser.email}`:"클라우드 설정 완료 · 로그인 전";
      $("cloudMessage").textContent=cloudUser?"로그인되어 있어요. 새 기록은 클라우드에 동기화됩니다.":"연결됐어요. 이메일 로그인 링크를 받아 로그인해 주세요.";
      if(cloudUser)await syncAllLocal();
      cloudClient.auth.onAuthStateChange((_event,session)=>{cloudUser=session?.user||null;$("storageStatus").textContent=cloudUser?`클라우드 연결됨 · ${cloudUser.email}`:"로그인 필요";if(cloudUser)syncAllLocal().catch(console.error);});
      return true;
    }catch(e){console.error(e);$("cloudMessage").textContent="연결 실패: URL, 키, 네트워크를 확인해 주세요.";cloudReady=false;return false;}
  }
  async function loginEmail() {
    if(!cloudClient){const ok=await setupCloud();if(!ok)return;}
    const email=$("userEmail").value.trim();if(!email){$("cloudMessage").textContent="로그인 이메일을 입력해 주세요.";return;}
    $("cloudMessage").textContent="로그인 링크를 보내는 중이에요…";
    const {error}=await cloudClient.auth.signInWithOtp({email,options:{emailRedirectTo:location.href.split("#")[0]}});
    $("cloudMessage").textContent=error?`로그인 링크 전송 실패: ${error.message}`:"로그인 링크를 보냈어요. 이메일을 확인해 주세요.";
  }
  async function syncRecord(r) {
    if(!cloudClient||!cloudUser) return;
    let coverPath=null;
    if(r.cover){
      const blob=await (await fetch(r.cover)).blob();
      coverPath=`${cloudUser.id}/${r.id}.jpg`;
      const {error:uploadError}=await cloudClient.storage.from("book-covers").upload(coverPath,blob,{contentType:"image/jpeg",upsert:true});
      if(uploadError)throw uploadError;
    }
    const payload={id:r.id,user_id:cloudUser.id,reader:r.reader,title:r.title,read_date:r.date,memo:r.memo||"",cover_path:coverPath,created_at:r.createdAt,updated_at:r.updatedAt};
    const {error}=await cloudClient.from("book_records").upsert(payload,{onConflict:"id"});
    if(error)throw error;
    r.syncStatus="synced";await putLocal(r);
  }
  async function syncAllLocal() {
    if(!cloudUser||!cloudClient)return;
    $("cloudMessage").textContent="기록을 동기화하는 중이에요…";
    try{
      const local=await getAllLocal();
      for(const r of local)await syncRecord(r);
      const {data,error}=await cloudClient.from("book_records").select("*").eq("user_id",cloudUser.id);
      if(error)throw error;
      for(const c of (data||[])){
        let cover=null;
        if(c.cover_path){const {data:blobData,error:downloadError}=await cloudClient.storage.from("book-covers").download(c.cover_path);if(!downloadError&&blobData)cover=await new Promise(resolve=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.readAsDataURL(blobData);});}
        const existing=(await getAllLocal()).find(x=>x.id===c.id);
        const item={id:c.id,reader:c.reader,title:c.title,date:c.read_date,memo:c.memo||"",cover:cover||(existing?.cover)||null,createdAt:c.created_at||new Date().toISOString(),updatedAt:c.updated_at||new Date().toISOString(),syncStatus:"synced"};
        await putLocal(item);
      }
      await refresh();$("cloudMessage").textContent="동기화가 완료됐어요.";
    }catch(e){console.error(e);$("cloudMessage").textContent="동기화 실패. README의 SQL과 Storage 설정을 확인해 주세요.";}
  }

  document.querySelectorAll(".reader-tab").forEach(b=>b.addEventListener("click",()=>{activeReader=b.dataset.reader;render();}));
  $("prevMonth").addEventListener("click",()=>{viewMonth=new Date(viewMonth.getFullYear(),viewMonth.getMonth()-1,1);selectedDate=dateKey(viewMonth);render();});
  $("nextMonth").addEventListener("click",()=>{viewMonth=new Date(viewMonth.getFullYear(),viewMonth.getMonth()+1,1);selectedDate=dateKey(viewMonth);render();});
  $("addBookBtn").addEventListener("click",openNewBook);$("emptyAddBtn").addEventListener("click",openNewBook);
  $("bookForm").addEventListener("submit",saveRecord);
  $("coverInput").addEventListener("change",async e=>{
    const file=e.target.files?.[0];if(!file)return;
    if(!file.type.startsWith("image/")){toast("이미지 파일을 선택해 주세요.");return;}
    try{coverData=await compressImage(file);$("coverPreview").src=coverData;$("coverPreview").hidden=false;$("photoPlaceholder").hidden=true;$("ocrBtn").disabled=false;$("ocrStatus").textContent="사진을 준비했어요. 제목 자동 인식을 눌러 보세요.";}catch(err){console.error(err);toast("사진을 불러오지 못했어요.");}
  });
  $("ocrBtn").addEventListener("click",runOCR);
  $("settingsBtn").addEventListener("click",()=>{const c=loadConfig();$("supabaseUrl").value=c.url||"";$("supabaseKey").value=c.key||"";$("storageStatus").textContent=cloudUser?`클라우드 연결됨 · ${cloudUser.email}`:"이 기기 저장";openDialog("settingsDialog");});
  $("connectBtn").addEventListener("click",setupCloud);$("loginBtn").addEventListener("click",loginEmail);$("exportBtn").addEventListener("click",exportBackup);
  document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>closeDialog(b.dataset.close)));
  document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>{
    document.querySelectorAll(".nav-item").forEach(n=>n.classList.toggle("active",n===b));
    if(b.dataset.nav==="stats"){const mr=monthRecords();toast(`${viewMonth.getMonth()+1}월: ${mr.length}권 · ${new Set(mr.map(r=>r.date)).size}일 독서`);}
    if(b.dataset.nav==="books"){const arr=readerRecords().sort((a,b)=>b.date.localeCompare(a.date));$("detailContent").innerHTML=`<p class="eyebrow">ALL BOOKS</p><h2>${readerNames[activeReader]} 전체 기록 · ${arr.length}권</h2><div class="recent-list">${arr.map(r=>`<div class="recent-item"><img class="mini-cover" alt="" src="${r.cover||""}"><div><strong>${escapeHtml(r.title)}</strong><small>${escapeHtml(r.date)}</small></div><button class="tiny-btn" data-open-record="${r.id}">보기</button></div>`).join("")||"<p>아직 기록이 없어요.</p>"}</div>`;$("detailContent").querySelectorAll("[data-open-record]").forEach(x=>x.onclick=()=>showDetail(x.dataset.openRecord));openDialog("detailDialog");}
  }));
  window.addEventListener("online",()=>toast("인터넷에 연결됐어요."));
  (async()=>{try{db=await openDB();await refresh();const c=loadConfig();if(c.url&&c.key){$("supabaseUrl").value=c.url;$("supabaseKey").value=c.key;await setupCloud();}}catch(e){console.error(e);toast("저장소를 열지 못했어요. 최신 브라우저에서 다시 시도해 주세요.");}})();
})();
