/* VIP Cashbook - Ultimate stable build (GitHub Pages, no server)
   - Login (admin + local users)
   - Dashboard balances (NO add/edit operations)
   - Transactions CRUD + filters + Excel import
   - Accounts CRUD
   - Users page (admin only)
   - Mobile: top nav + tables as cards
*/

const OWNER = { username: "admin", password: "12345", role: "owner", name: "Admin" };

const LS_KEYS = {
  session: "vipUser",
  theme: "vipTheme",
  users: "vipUsers",
  accounts: "vipAccounts",
  tx: "vipTransactions",
  txView: "vipTxViewMode"
};

const el = (id) => document.getElementById(id);

function on(id, ev, fn){
  const node = document.getElementById(id);
  if (node) node.addEventListener(ev, fn);
  return node;
}


function normalizeDigits(str){
  // Convert Arabic-Indic and Eastern Arabic-Indic digits to Latin
  return String(str ?? "")
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

function toast(msg){
  const t = el("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._tm);
  toast._tm = setTimeout(()=>t.classList.add("hidden"), 2200);
}

function nowISODate(){
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off*60*1000);
  return local.toISOString().slice(0,10);
}

function fmtMoney(n){
  const x = Number(n || 0);
  return x.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function safeParse(json, fallback){
  try{ return JSON.parse(json); }catch{ return fallback; }
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, (c)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,"&quot;"); }

function setRowLabels(tr, labels){
  const tds = tr.querySelectorAll("td");
  for(let i=0;i<tds.length && i<labels.length;i++){
    tds[i].setAttribute("data-label", labels[i]);
  }
}

/* ========= DATA ========= */
function getUsers(){ return safeParse(localStorage.getItem(LS_KEYS.users) || "[]", []); }
function saveUsers(users){ localStorage.setItem(LS_KEYS.users, JSON.stringify(users)); }

function seedAccountsIfEmpty(){
  const existing = safeParse(localStorage.getItem(LS_KEYS.accounts) || "null", null);
  if (Array.isArray(existing) && existing.length) return;
  const seed = [
    { id: crypto.randomUUID(), name: "صندوق", type: "cash", note: "" },
    { id: crypto.randomUUID(), name: "Vodafone Cash", type: "wallet", note: "" },
    { id: crypto.randomUUID(), name: "InstaPay", type: "wallet", note: "" },
    { id: crypto.randomUUID(), name: "Instagram 1", type: "insta", note: "" }
  ];
  localStorage.setItem(LS_KEYS.accounts, JSON.stringify(seed));
}

function getAccounts(){
  seedAccountsIfEmpty();
  return safeParse(localStorage.getItem(LS_KEYS.accounts) || "[]", []);
}
function saveAccounts(accs){ localStorage.setItem(LS_KEYS.accounts, JSON.stringify(accs)); }

function seedTxIfEmpty(){
  const existing = safeParse(localStorage.getItem(LS_KEYS.tx) || "null", null);
  if (Array.isArray(existing) && existing.length) return;
  const accs = getAccounts();
  const today = nowISODate();
  const seed = [
    { id: crypto.randomUUID(), date: today, accountId: accs[0].id, type: "in", amount: 1500, note: "مبيعات" }
  ];
  localStorage.setItem(LS_KEYS.tx, JSON.stringify(seed));
}

function getTx(){
  seedTxIfEmpty();
  return safeParse(localStorage.getItem(LS_KEYS.tx) || "[]", []);
}
function saveTx(list){ localStorage.setItem(LS_KEYS.tx, JSON.stringify(list)); }

/* ========= AUTH ========= */
function setSession(user){ localStorage.setItem(LS_KEYS.session, JSON.stringify(user)); }
function getSession(){ return safeParse(localStorage.getItem(LS_KEYS.session) || "null", null); }
function clearSession(){ localStorage.removeItem(LS_KEYS.session); }

function login(username, password){
  username = normalizeDigits(username).trim();
  password = normalizeDigits(password).trim();

  if (username === OWNER.username && password === OWNER.password){
    setSession(OWNER);
    return { ok:true, user: OWNER };
  }

  const users = getUsers();
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return { ok:false, error:"اسم المستخدم أو كلمة المرور غير صحيحة" };

  setSession(user);
  return { ok:true, user };
}

function requireOwner(){
  const u = getSession();
  return !!(u && u.role === "owner");
}

/* ========= THEME ========= */
function applyTheme(theme){
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(LS_KEYS.theme, theme);
}

function getTxViewMode(){
  return localStorage.getItem(LS_KEYS.txView) || "";
}
function setTxViewMode(mode){
  localStorage.setItem(LS_KEYS.txView, mode);
}
function applyTxViewMode(){
  // Default: cards on small screens, table on large screens
  const saved = getTxViewMode(); // 'table' or 'cards' or ''
  const isMobile = window.matchMedia("(max-width: 720px)").matches;
  let mode = saved;
  if (!mode){
    mode = isMobile ? "cards" : "table";
  }
  document.body.classList.toggle("tx-cards", mode === "cards");
  document.body.classList.toggle("tx-table", mode === "table");
  const btn = document.getElementById("viewModeBtn");
  if (btn){
    btn.textContent = mode === "cards" ? "📋 جدول" : "📱 بطاقات";
    btn.title = mode === "cards" ? "التبديل إلى جدول" : "التبديل إلى بطاقات";
  }
}
function toggleTxViewMode(){
  const cur = document.body.classList.contains("tx-cards") ? "cards" : "table";
  const next = cur === "cards" ? "table" : "cards";
  setTxViewMode(next);
  applyTxViewMode();
  // re-render to ensure labels exist
  if (typeof renderTransactions === "function") renderTransactions();
}

function toggleTheme(){
  const cur = localStorage.getItem(LS_KEYS.theme) || "dark";
  applyTheme(cur === "dark" ? "light" : "dark");
}

/* ========= UI ========= */
function showLogin(){
  el("loginView").classList.remove("hidden");
  el("appView").classList.add("hidden");
}
function showApp(){
  el("loginView").classList.add("hidden");
  el("appView").classList.remove("hidden");
  initAfterLogin();
}
function setSubtitle(text){ el("subtitleLine").textContent = text; }
function setActiveNav(view){
  document.querySelectorAll(".nav-item").forEach(b=>{
    b.classList.toggle("active", b.dataset.view === view);
  });
}
function showView(view){
  const views = ["dashboard","transactions","accounts","users"];
  for (const v of views){
    el(`view-${v}`).classList.toggle("hidden", v !== view);
  }
  const subMap = { dashboard:"الأرصدة", transactions:"العمليات", accounts:"الحسابات", users:"المستخدمين" };
  setSubtitle(subMap[view] || "");
  setActiveNav(view);

  if (view === "dashboard") renderDashboard();
  if (view === "transactions") renderTransactions();
  if (view === "accounts") renderAccounts();
  if (view === "users") renderUsers();
}

/* ========= CALCS ========= */
function accountLabel(type){
  const map = { cash:"صندوق", wallet:"محفظة", insta:"انستا", other:"أخرى" };
  return map[type] || type;
}
function computeBalances(txList, accounts){
  const byAcc = new Map();
  for (const a of accounts) byAcc.set(a.id, { in:0, out:0, net:0 });
  for (const t of txList){
    const rec = byAcc.get(t.accountId) || { in:0, out:0, net:0 };
    const amt = Number(t.amount || 0);
    if (t.type === "in") rec.in += amt; else rec.out += amt;
    rec.net = rec.in - rec.out;
    byAcc.set(t.accountId, rec);
  }
  return byAcc;
}

function fillAccountSelect(selectEl, { includeAll=false } = {}){
  const current = selectEl.value;
  const accs = getAccounts();
  selectEl.innerHTML = "";
  if (includeAll){
    const op = document.createElement("option");
    op.value = "all";
    op.textContent = "كل الحسابات";
    selectEl.appendChild(op);
  }
  for (const a of accs){
    const op = document.createElement("option");
    op.value = a.id;
    op.textContent = `${a.name} • ${accountLabel(a.type)}`;
    selectEl.appendChild(op);
  }
  if (current) selectEl.value = current;
}
  for (const a of accs){
    const op = document.createElement("option");
    op.value = a.id;
    op.textContent = `${a.name} • ${accountLabel(a.type)}`;
    selectEl.appendChild(op);
  }
}

/* ========= FILTER ========= */
function filterTx(){
  const tx = getTx();
  const fAcc = el("fAccount").value;
  const from = el("fFrom").value;
  const to = el("fTo").value;
  const q = (el("fSearch").value || "").trim().toLowerCase();

  return tx.filter(t=>{
    if (fAcc && fAcc !== "all" && t.accountId !== fAcc) return false;
    if (from && t.date < from) return false;
    if (to && t.date > to) return false;
    if (q){
      const blob = `${t.note || ""}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  }).sort((a,b)=> (a.date === b.date ? (b.id.localeCompare(a.id)) : (b.date.localeCompare(a.date))));
}

/* ========= RENDER ========= */
function renderDashboard(){
  const today = nowISODate();
  el("todayLabel").textContent = `تاريخ اليوم: ${today}`;

  const txToday = getTx().filter(t=> t.date === today);
  const totalIn = txToday.filter(t=>t.type==="in").reduce((s,t)=>s+Number(t.amount||0),0);
  const totalOut = txToday.filter(t=>t.type==="out").reduce((s,t)=>s+Number(t.amount||0),0);
  const net = totalIn - totalOut;

  el("kpiIn").textContent = fmtMoney(totalIn);
  el("kpiOut").textContent = fmtMoney(totalOut);
  el("kpiNet").textContent = fmtMoney(net);

  const accs = getAccounts();
  const byAcc = computeBalances(getTx(), accs);
  const tbody = el("balancesTable").querySelector("tbody");
  tbody.innerHTML = "";
  for (const a of accs){
    const b = byAcc.get(a.id) || { in:0, out:0, net:0 };
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(a.name)}</strong></td>
      <td><span class="badge">${escapeHtml(accountLabel(a.type))}</span></td>
      <td>${fmtMoney(b.in)}</td>
      <td>${fmtMoney(b.out)}</td>
      <td><strong>${fmtMoney(b.net)}</strong></td>
    `;
    setRowLabels(tr, ["الحساب","النوع","مقبوضات","مدفوعات","الرصيد"]);
    tbody.appendChild(tr);
  }
}

function renderTransactions(){
  fillAccountSelect(el("tAccount"));
  fillAccountSelect(el("fAccount"), { includeAll:true });

  const accs = getAccounts();
  const accById = new Map(accs.map(a=>[a.id,a]));

  const list = filterTx();
  const tbody = el("txTable").querySelector("tbody");
  tbody.innerHTML = "";

  for (const t of list){
    const a = accById.get(t.accountId);
    const accName = a ? `${a.name} • ${accountLabel(a.type)}` : "(محذوف)";
    const badge = t.type === "in" ? '<span class="badge in">قبض</span>' : '<span class="badge out">دفع</span>';

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(t.date)}</td>
      <td>${escapeHtml(accName)}</td>
      <td>${badge}</td>
      <td><strong>${fmtMoney(t.amount)}</strong></td>
      <td>${escapeHtml(t.note || "")}</td>
      <td>
        <div class="actions">
          <button class="btn small ghost" data-act="edit" data-id="${t.id}">تعديل</button>
          <button class="btn small danger ghost" data-act="del" data-id="${t.id}">حذف</button>
        </div>
      </td>
    `;
    setRowLabels(tr, ["التاريخ","الحساب","النوع","المبلغ","ملاحظة","إجراءات"]);
    tbody.appendChild(tr);
  }
  el("txCount").textContent = `عدد العمليات المعروضة: ${list.length}`;
}

function renderAccounts(){
  const accs = getAccounts();
  const tbody = el("accTable").querySelector("tbody");
  tbody.innerHTML = "";
  for (const a of accs){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(a.name)}</strong></td>
      <td><span class="badge">${escapeHtml(accountLabel(a.type))}</span></td>
      <td>${escapeHtml(a.note || "")}</td>
      <td>
        <div class="actions">
          <button class="btn small ghost" data-act="editAcc" data-id="${a.id}">تعديل</button>
          <button class="btn small danger ghost" data-act="delAcc" data-id="${a.id}">حذف</button>
        </div>
      </td>
    `;
    setRowLabels(tr, ["اسم الحساب","النوع","ملاحظة","إجراءات"]);
    tbody.appendChild(tr);
  }
  el("aName").value = "";
  el("aType").value = "cash";
  el("aNote").value = "";
  el("aEditId").value = "";
}

function renderUsers(){
  if (!requireOwner()){
    toast("غير مسموح");
    showView("dashboard");
    return;
  }
  const tbody = el("usersTable").querySelector("tbody");
  tbody.innerHTML = "";
  const users = getUsers();
  for (const u of users){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(u.username)}</strong></td>
      <td>${escapeHtml(u.name || "")}</td>
      <td><span class="badge">${escapeHtml(u.role || "user")}</span></td>
      <td>
        <div class="actions">
          <button class="btn small danger ghost" data-act="delUser" data-username="${escapeAttr(u.username)}">حذف</button>
        </div>
      </td>
    `;
    setRowLabels(tr, ["اسم المستخدم","الاسم","الدور","إجراءات"]);
    tbody.appendChild(tr);
  }
  el("uUsername").value = "";
  el("uPassword").value = "";
  el("uName").value = "";
}

/* ========= MUTATIONS ========= */
function addTransaction({ accountId, type, amount, date, note }){
  const list = getTx();
  list.push({ id: crypto.randomUUID(), accountId, type, amount: Number(amount||0), date, note: note||"" });
  saveTx(list);
}
function updateTransaction(id, patch){
  const list = getTx();
  const idx = list.findIndex(t=>t.id===id);
  if (idx < 0) return false;
  list[idx] = { ...list[idx], ...patch };
  saveTx(list);
  return true;
}
function deleteTransaction(id){
  saveTx(getTx().filter(t=>t.id!==id));
}

function addAccount({ name, type, note }){
  const accs = getAccounts();
  accs.push({ id: crypto.randomUUID(), name, type, note: note||"" });
  saveAccounts(accs);
}
function updateAccount(id, patch){
  const accs = getAccounts();
  const idx = accs.findIndex(a=>a.id===id);
  if (idx < 0) return false;
  accs[idx] = { ...accs[idx], ...patch };
  saveAccounts(accs);
  return true;
}
function deleteAccount(id){
  saveAccounts(getAccounts().filter(a=>a.id!==id));
}

function addUser({ username, password, name }){
  const users = getUsers();
  if (users.find(u=>u.username===username)) return { ok:false, error:"اسم المستخدم موجود بالفعل" };
  users.push({ username, password, name: name||"", role:"user" });
  saveUsers(users);
  return { ok:true };
}
function deleteUser(username){
  saveUsers(getUsers().filter(u=>u.username!==username));
}

/* ========= EXPORT / PRINT ========= */
function downloadText(filename, text){
  const blob = new Blob([text], { type:"text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportCSV(){
  const accs = getAccounts();
  const accById = new Map(accs.map(a=>[a.id,a]));
  const list = filterTx();
  const rows = [];
  rows.push(["date","account","account_type","type","amount","note","id"]);
  for (const t of list){
    const a = accById.get(t.accountId);
    rows.push([t.date, a?a.name:"(deleted)", a?accountLabel(a.type):"", t.type, String(Number(t.amount||0)), t.note||"", t.id]);
  }
  const csv = rows.map(r => r.map(cell=>{
    const s = String(cell ?? "");
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
    return s;
  }).join(",")).join("\n");
  downloadText(`transactions_${nowISODate()}.csv`, csv);
  toast("تم تصدير CSV");
}
function printCurrent(){ window.print(); }

/* ========= EXCEL IMPORT ========= */
function handleImport(e){
  const file = e.target.files[0];
  if(!file) return;

  const reader = new FileReader();
  reader.onload = function(evt){
    const data = new Uint8Array(evt.target.result);
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const accounts = getAccounts();

    let imported = 0;
    rows.forEach(r=>{
      const accName = String(r["الحساب"] || "").trim();
      const acc = accounts.find(a => a.name.trim() === accName);
      if(!acc) return;

      const typRaw = String(r["النوع"] || "").trim();
      const type = (typRaw === "قبض" || typRaw.toLowerCase() === "in") ? "in" : "out";

      const date = String(r["التاريخ"] || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

      addTransaction({
        accountId: acc.id,
        type,
        amount: parseFloat(r["المبلغ"] || 0),
        date,
        note: String(r["ملاحظة"] || "")
      });
      imported++;
    });

    renderDashboard();
    renderTransactions();
    alert(`✅ تم استيراد العمليات بنجاح: ${imported}`);
    e.target.value = "";
  };
  reader.readAsArrayBuffer(file);
}

/* ========= INIT ========= */
function initAfterLogin(){
  const u = getSession();
  el("currentUserName").textContent = u?.name || u?.username || "—";
  el("currentUserRole").textContent = u?.role || "—";

  document.querySelectorAll(".owner-only").forEach(x=>{
    x.style.display = (u && u.role === "owner") ? "" : "none";
  });

  // set defaults
  el("tDate").value = nowISODate();
  el("fFrom").value = "";
  el("fTo").value = "";
  el("fSearch").value = "";

  showView("dashboard");
}

function wireEvents(){
  applyTheme(localStorage.getItem(LS_KEYS.theme) || "dark");
  on("themeBtn","click",toggleTheme);

  on("togglePass","click", ()=>{
    const p = el("loginPassword");
    p.type = (p.type === "password") ? "text" : "password";
  });

  on("loginForm","submit", (e)=>{
    e.preventDefault();
    const res = login(el("loginUsername").value, el("loginPassword").value);
    if (!res.ok){ toast(res.error); return; }
    toast("تم تسجيل الدخول");
    showApp();
  });

  on("logoutBtn","click", ()=>{
    clearSession();
    toast("تم تسجيل الخروج");
    setTimeout(()=>location.reload(), 250);
  });

  document.querySelectorAll(".nav-item").forEach(btn=>{
    btn.addEventListener("click", ()=> showView(btn.dataset.view));
  });

  // filters
  ["fAccount","fFrom","fTo","fSearch"].forEach(id=>{ const n = document.getElementById(id); if(n) n.addEventListener("input", renderTransactions); });
  on("clearFiltersBtn","click", ()=>{
    el("fAccount").value = "all";
    el("fFrom").value = "";
    el("fTo").value = "";
    el("fSearch").value = "";
    renderTransactions();
  });

  // tx form
  on("txForm","submit", (e)=>{
    e.preventDefault();
    const id = el("editId").value;
    const payload = {
      accountId: el("tAccount").value,
      type: el("tType").value,
      amount: Number(el("tAmount").value || 0),
      date: el("tDate").value,
      note: el("tNote").value
    };

    if (id){
      updateTransaction(id, payload);
      toast("تم التعديل");
    } else {
      addTransaction(payload);
      toast("تمت الإضافة");
    }
    el("editId").value = "";
    el("tAmount").value = "";
    el("tNote").value = "";
    el("tDate").value = nowISODate();
    renderDashboard();
    renderTransactions();
  });

  on("txTable","click", (e)=>{
    const btn = e.target.closest("button");
    if (!btn) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;
    if (!act || !id) return;

    if (act === "del"){
      if (!confirm("حذف العملية؟")) return;
      deleteTransaction(id);
      toast("تم الحذف");
      renderDashboard();
      renderTransactions();
      return;
    }
    if (act === "edit"){
      const tx = getTx().find(t=>t.id===id);
      if (!tx) return;
      el("editId").value = tx.id;
      el("tAccount").value = tx.accountId;
      el("tType").value = tx.type;
      el("tAmount").value = tx.amount;
      el("tDate").value = tx.date;
      el("tNote").value = tx.note || "";
      toast("وضع التعديل");
      showView("transactions");
    }
  });

  // accounts
  on("accForm","submit", (e)=>{
    e.preventDefault();
    const id = el("aEditId").value;
    const payload = { name: el("aName").value.trim(), type: el("aType").value, note: el("aNote").value.trim() };
    if (!payload.name) return toast("اكتب اسم الحساب");

    if (id){ updateAccount(id, payload); toast("تم التعديل"); }
    else { addAccount(payload); toast("تمت الإضافة"); }

    renderAccounts();
    renderDashboard();
    renderTransactions();
  });

  on("accTable","click", (e)=>{
    const btn = e.target.closest("button");
    if (!btn) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;
    if (!act || !id) return;

    if (act === "delAcc"){
      if (!confirm("حذف الحساب؟")) return;
      deleteAccount(id);
      toast("تم الحذف");
      renderAccounts(); renderDashboard(); renderTransactions();
      return;
    }
    if (act === "editAcc"){
      const a = getAccounts().find(x=>x.id===id);
      if (!a) return;
      el("aEditId").value = a.id;
      el("aName").value = a.name;
      el("aType").value = a.type;
      el("aNote").value = a.note || "";
      toast("وضع تعديل الحساب");
      showView("accounts");
    }
  });

  // users (admin only)
  on("userForm","submit", (e)=>{
    e.preventDefault();
    if (!requireOwner()) return toast("غير مسموح");
    const username = normalizeDigits(el("uUsername").value.trim());
    const password = normalizeDigits(el("uPassword").value.trim());
    const name = el("uName").value.trim();
    if (!username || !password) return toast("أدخل البيانات");
    if (username === OWNER.username) return toast("هذا اسم الأدمن");

    const res = addUser({ username, password, name });
    if (!res.ok) return toast(res.error);
    toast("تمت إضافة المستخدم");
    renderUsers();
  });

  on("usersTable","click", (e)=>{
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.dataset.act !== "delUser") return;
    if (!requireOwner()) return toast("غير مسموح");
    const username = btn.dataset.username;
    if (!confirm(`حذف المستخدم ${username}؟`)) return;
    deleteUser(username);
    toast("تم الحذف");
    renderUsers();
  });

  // export / print
  on("exportBtn","click",exportCSV);
  on("printBtn","click",printCurrent);

  // import
  const fileInput = el("importFile");
  if (fileInput) fileInput.addEventListener("change", handleImport);
}

function boot(){
  console.log("BOOT OK: VIP Cashbook loaded");
  wireEvents();
  const session = getSession();
  if (session) showApp();
  else showLogin();
}

document.addEventListener("DOMContentLoaded", boot);


