/* app.js — VIP (GitHub Pages) + Google Sheets CRUD عبر Apps Script API
   ✅ إصلاح الدخول/CORS: POST via URLSearchParams بدون headers
   ✅ Login / Init / Txns / Add / Update / Delete
   ✅ فلترة (حساب + من/إلى) + بحث
   ✅ تحديث تلقائي كل 20 ثانية (يتوقف أثناء المودال/الكتابة)
*/

import { CONFIG } from "./config.js";

/* -------------------- DOM helpers -------------------- */
const $ = (id) => document.getElementById(id);
const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));

function fmt(n) {
  n = Number(n || 0);
  return n.toLocaleString("ar-EG", { maximumFractionDigits: 2 });
}
function toNumber(x) {
  const n = Number(String(x ?? "").replace(/,/g, "").trim());
  return isNaN(n) ? 0 : n;
}
function setMsg(id, msg, ok = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = ok ? "var(--ok)" : "var(--muted)";
}
function show(el, yes) {
  if (!el) return;
  el.style.display = yes ? "" : "none";
}
function mustApi() {
  const b = (CONFIG && CONFIG.API_BASE) ? String(CONFIG.API_BASE).trim() : "";
  if (!b) throw new Error("API_BASE غير مضبوط داخل config.js");
  return b;
}

/* -------------------- API (Form POST to avoid CORS preflight) -------------------- */
async function apiPost(body) {
  const base = mustApi();

  const form = new URLSearchParams();
  Object.entries(body || {}).forEach(([k, v]) => {
    form.set(k, typeof v === "object" ? JSON.stringify(v) : String(v ?? ""));
  });

  const res = await fetch(base, {
    method: "POST",
    body: form,           // ✅ بدون headers
    cache: "no-store"
  });

  const j = await res.json();
  return j;
}

/* -------------------- State -------------------- */
const state = {
  token: localStorage.getItem("wm_token") || "",
  user: JSON.parse(localStorage.getItem("wm_user") || "null"),
  wallets: [],
  txns: [],
  selectedWalletId: "ALL",
  from: "",
  to: "",
  q: "",
  updatedAt: null,
};

/* -------------------- UI sections -------------------- */
function showApp(yes) {
  show($("loginCard"), !yes);
  show($("appArea"), yes);
  show($("btnRefresh"), yes);
  show($("btnPrint"), yes);
  show($("btnLogout"), yes);
}

function isModalOpen() {
  const m = $("modal");
  return m && m.style.display && m.style.display !== "none";
}

function isUserTyping() {
  const active = document.activeElement;
  if (!active) return false;
  const id = active.id || "";
  return [
    "u","p","q","fromPick","toPick","walletPick",
    "mDate","mWallet","mAccount","mRec","mPay","mDesc","mRef"
  ].includes(id);
}

/* -------------------- Render wallets / balances -------------------- */
function renderWalletStrip() {
  const wrap = $("walletStrip");
  if (!wrap) return;

  wrap.innerHTML = "";

  // ALL chip
  const all = document.createElement("button");
  all.className = "chip" + (state.selectedWalletId === "ALL" ? " active" : "");
  all.textContent = "كل الحسابات";
  all.onclick = () => { state.selectedWalletId = "ALL"; $("walletPick").value = "ALL"; applyFilters(); };
  wrap.appendChild(all);

  state.wallets.forEach(w => {
    const b = document.createElement("button");
    b.className = "chip" + (state.selectedWalletId === w.id ? " active" : "");
    b.innerHTML = `${w.name} <span class="chipNum">${fmt(w.balance)}</span>`;
    b.onclick = () => {
      state.selectedWalletId = w.id;
      $("walletPick").value = w.id;
      applyFilters();
    };
    wrap.appendChild(b);
  });
}

function renderBalances() {
  const list = $("balancesList");
  if (!list) return;

  list.innerHTML = "";

  state.wallets.forEach(w => {
    const div = document.createElement("div");
    div.className = "balCard";
    div.innerHTML = `
      <div class="balTop">
        <div class="balName">${w.name}</div>
        <div class="balType">${w.type || ""}</div>
      </div>
      <div class="balValue">${fmt(w.balance)}</div>
      <div class="balMeta">
        افتتاحي: ${fmt(w.opening)} • صافي: ${fmt(w.net)}
      </div>
      <div class="balActions">
        <button class="btn small" data-act="view" data-id="${w.id}">عرض العمليات</button>
        <button class="btn small ghost" data-act="add" data-id="${w.id}">إضافة عملية</button>
      </div>
    `;
    list.appendChild(div);
  });

  // bind buttons
  qsa("#balancesList [data-act]").forEach(btn => {
    btn.onclick = () => {
      const act = btn.getAttribute("data-act");
      const id  = btn.getAttribute("data-id");
      if (act === "view") {
        state.selectedWalletId = id;
        $("walletPick").value = id;
        goTab("txnsTab");
        applyFilters();
      }
      if (act === "add") {
        openAdd({ walletId: id });
      }
    };
  });
}

/* -------------------- Render txns table -------------------- */
function renderTxnsTable(rows) {
  const body = $("txBody");
  const totals = $("txTotals");
  if (!body || !totals) return;

  const rec = rows.reduce((s, r) => s + toNumber(r.receipts), 0);
  const pay = rows.reduce((s, r) => s + toNumber(r.payments), 0);

  totals.innerHTML = `
    <span class="pill">مقبوضات: ${fmt(rec)}</span>
    <span class="pill">مدفوعات: ${fmt(pay)}</span>
    <span class="pill">صافي: ${fmt(rec - pay)}</span>
  `;

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6" class="muted">لا توجد عمليات ضمن الفلتر</td></tr>`;
    return;
  }

  body.innerHTML = "";
  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.dateKey || ""}</td>
      <td>${r.account || ""}</td>
      <td>${r.receipts ? fmt(r.receipts) : ""}</td>
      <td>${r.payments ? fmt(r.payments) : ""}</td>
      <td>${r.desc || ""}</td>
      <td class="actionsCell">
        <button class="iconBtn" title="تعديل" data-edit="${r.rowNumber}">✏️</button>
        <button class="iconBtn danger" title="حذف" data-del="${r.rowNumber}">🗑️</button>
      </td>
    `;
    body.appendChild(tr);
  });

  // bind edit/delete
  qsa("[data-edit]").forEach(b => b.onclick = () => openEdit(Number(b.getAttribute("data-edit"))));
  qsa("[data-del]").forEach(b => b.onclick = () => delTxn(Number(b.getAttribute("data-del"))));
}

/* -------------------- Tabs -------------------- */
function goTab(tabId) {
  qsa(".tabBtn").forEach(b => b.classList.remove("active"));
  qsa(".tabPanel").forEach(p => p.classList.remove("active"));

  qs(`[data-tab="${tabId}"]`)?.classList.add("active");
  $(tabId)?.classList.add("active");
}

/* -------------------- Filters -------------------- */
function applyFilters() {
  const walletId = state.selectedWalletId || "ALL";
  const from = state.from || "";
  const to = state.to || "";
  const q = (state.q || "").trim().toLowerCase();

  let rows = state.txns.slice();

  if (walletId && walletId !== "ALL") rows = rows.filter(r => String(r.walletId || "") === walletId);
  if (from) rows = rows.filter(r => String(r.dateKey || "") >= from);
  if (to) rows = rows.filter(r => String(r.dateKey || "") <= to);

  if (q) {
    rows = rows.filter(r => {
      const hay = `${r.dateKey} ${r.account} ${r.desc} ${r.ref} ${r.walletId}`.toLowerCase();
      return hay.includes(q);
    });
  }

  // sort by date then rowNumber desc
  rows.sort((a, b) => {
    const ad = String(a.dateKey || "");
    const bd = String(b.dateKey || "");
    if (ad !== bd) return bd.localeCompare(ad);
    return Number(b.rowNumber || 0) - Number(a.rowNumber || 0);
  });

  renderTxnsTable(rows);

  // header info
  const title = $("txTitle");
  if (title) {
    const wName = walletId === "ALL"
      ? "كل الحسابات"
      : (state.wallets.find(w => w.id === walletId)?.name || walletId);
    title.textContent = `العمليات — ${wName}`;
  }
}

/* -------------------- Data loading -------------------- */
async function loadInit() {
  const res = await apiPost({ action: "init", token: state.token });
  if (!res.ok) throw new Error(res.msg || "فشل init");
  state.wallets = res.wallets || [];
  const grand = (res.totals && res.totals.grand) ? toNumber(res.totals.grand) : state.wallets.reduce((s,w)=>s+toNumber(w.balance),0);
  $("grand").textContent = fmt(grand);
  $("todayLabel").textContent = `اليوم: ${res.todayKey || ""}`;

  // fill wallet select
  const sel = $("walletPick");
  if (sel) {
    sel.innerHTML = `<option value="ALL">كل الحسابات</option>` + state.wallets.map(w =>
      `<option value="${w.id}">${w.name}</option>`
    ).join("");
    sel.value = state.selectedWalletId || "ALL";
  }

  // fill modal wallet select
  const mSel = $("mWallet");
  if (mSel) {
    mSel.innerHTML = state.wallets.map(w => `<option value="${w.id}">${w.name}</option>`).join("");
  }

  renderWalletStrip();
  renderBalances();
}

async function loadTxnsFromApi() {
  // نحمّل نطاق واسع، والفلترة تتم محليًا
  const from = state.from || "";
  const to = state.to || "";

  const res = await apiPost({
    action: "txns",
    token: state.token,
    walletId: "ALL",
    from,
    to
  });

  if (!res.ok) throw new Error(res.msg || "فشل txns");
  state.txns = res.rows || [];
}

/* -------------------- Auto sync -------------------- */
let __syncTimer = null;
let __syncInFlight = false;

async function syncNow(reason = "") {
  if (!state.token) return;
  if (document.hidden) return;
  if (__syncInFlight) return;
  if (isModalOpen()) return;
  if (isUserTyping()) return;

  __syncInFlight = true;
  try {
    await loadInit();
    await loadTxnsFromApi();
    applyFilters();
    state.updatedAt = new Date();
    $("chipUpdated").textContent = `آخر تحديث: ${state.updatedAt.toLocaleString("ar-EG")}`;
    if (reason) setMsg("statusMsg", `تحديث تلقائي ✅ (${reason})`, true);
  } catch (e) {
    console.error(e);
    setMsg("statusMsg", "تعذر التحديث التلقائي", false);
  } finally {
    __syncInFlight = false;
  }
}

function startAutoSync() {
  stopAutoSync();
  __syncTimer = setInterval(() => syncNow("Auto"), 20000);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncNow("Resume");
  });
  window.addEventListener("online", () => syncNow("Online"));
}

function stopAutoSync() {
  if (__syncTimer) clearInterval(__syncTimer);
  __syncTimer = null;
}

/* -------------------- Auth -------------------- */
async function login() {
  const u = ($("u").value || "").trim();
  const p = ($("p").value || "").trim();
  if (!u || !p) return setMsg("loginMsg", "اكتب اسم المستخدم وكلمة المرور");

  setMsg("loginMsg", "جاري تسجيل الدخول...");

  const res = await apiPost({ action: "login", u, p });
  if (!res.ok) return setMsg("loginMsg", res.msg || "فشل الدخول");

  state.token = res.token;
  state.user = res.user || null;
  localStorage.setItem("wm_token", state.token);
  localStorage.setItem("wm_user", JSON.stringify(state.user || null));

  setMsg("loginMsg", "تم ✅", true);
  showApp(true);

  await bootAfterLogin();
}

function logout() {
  stopAutoSync();
  state.token = "";
  state.user = null;
  localStorage.removeItem("wm_token");
  localStorage.removeItem("wm_user");
  showApp(false);
}

/* -------------------- CRUD -------------------- */
function openModal(yes) {
  const m = $("modal");
  if (!m) return;
  m.style.display = yes ? "flex" : "none";
}

function openAdd(pref = {}) {
  $("mMode").value = "add";
  $("mRow").value = "";

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth()+1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  $("mDate").value = `${yyyy}-${mm}-${dd}`;

  $("mWallet").value = pref.walletId || (state.wallets[0]?.id || "");
  $("mAccount").value = pref.account || (state.wallets.find(w=>w.id===($("mWallet").value))?.name || "");
  $("mRec").value = "";
  $("mPay").value = "";
  $("mDesc").value = "";
  $("mRef").value = "";
  setMsg("mMsg", "");
  openModal(true);
}

function openEdit(rowNumber) {
  const r = state.txns.find(x => Number(x.rowNumber) === Number(rowNumber));
  if (!r) return;

  $("mMode").value = "edit";
  $("mRow").value = String(r.rowNumber);

  $("mDate").value = r.dateKey || "";
  $("mWallet").value = r.walletId || (state.wallets[0]?.id || "");
  $("mAccount").value = r.account || "";
  $("mRec").value = r.receipts ? String(r.receipts) : "";
  $("mPay").value = r.payments ? String(r.payments) : "";
  $("mDesc").value = r.desc || "";
  $("mRef").value = r.ref || "";
  setMsg("mMsg", "");
  openModal(true);
}

function closeModal() {
  openModal(false);
}

async function saveTxn() {
  const mode = $("mMode").value;
  const rowNumber = $("mRow").value;

  const payload = {
    dateKey: ($("mDate").value || "").trim(),
    walletId: ($("mWallet").value || "").trim(),
    account: ($("mAccount").value || "").trim(),
    receipts: toNumber($("mRec").value),
    payments: toNumber($("mPay").value),
    desc: ($("mDesc").value || "").trim(),
    ref: ($("mRef").value || "").trim(),
  };

  if (!payload.walletId) return setMsg("mMsg", "اختر الحساب");
  if ((payload.receipts > 0 && payload.payments > 0) || (payload.receipts <= 0 && payload.payments <= 0)) {
    return setMsg("mMsg", "اكتب مبلغ في المقبوضات أو المدفوعات فقط");
  }

  setMsg("mMsg", "جاري الحفظ...");

  let res;
  if (mode === "add") {
    res = await apiPost({ action: "add", token: state.token, payload });
  } else {
    res = await apiPost({ action: "update", token: state.token, rowNumber, payload });
  }

  if (!res.ok) return setMsg("mMsg", res.msg || "فشل الحفظ");

  setMsg("mMsg", "تم ✅", true);
  closeModal();

  // تحديث فوري بعد الحفظ
  await syncNow("Saved");
}

async function delTxn(rowNumber) {
  if (!confirm("هل تريد حذف هذه العملية؟")) return;

  const res = await apiPost({ action: "delete", token: state.token, rowNumber });
  if (!res.ok) return alert(res.msg || "فشل الحذف");

  await syncNow("Deleted");
}

/* -------------------- Boot -------------------- */
async function bootAfterLogin() {
  try {
    // default filter: today
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth()+1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const todayKey = `${yyyy}-${mm}-${dd}`;

    if (!state.from) state.from = todayKey;
    if (!state.to) state.to = todayKey;

    $("fromPick").value = state.from;
    $("toPick").value = state.to;
    $("walletPick").value = state.selectedWalletId;

    await loadInit();
    await loadTxnsFromApi();
    applyFilters();

    state.updatedAt = new Date();
    $("chipUpdated").textContent = `آخر تحديث: ${state.updatedAt.toLocaleString("ar-EG")}`;
    startAutoSync();
    setMsg("statusMsg", "تم التحميل ✅", true);
  } catch (e) {
    console.error(e);
    setMsg("statusMsg", e.message || String(e));
  }
}

async function boot() {
  // bind UI actions
  $("btnLogin").onclick = () => login();
  $("btnLogout").onclick = () => logout();
  $("btnRefresh").onclick = () => syncNow("Manual");
  $("btnPrint").onclick = () => window.print();

  qs(`[data-tab="balancesTab"]`)?.addEventListener("click", () => goTab("balancesTab"));
  qs(`[data-tab="txnsTab"]`)?.addEventListener("click", () => goTab("txnsTab"));

  $("walletPick").onchange = (e) => { state.selectedWalletId = e.target.value || "ALL"; renderWalletStrip(); applyFilters(); };
  $("fromPick").onchange = (e) => { state.from = e.target.value || ""; syncNow("Range"); };
  $("toPick").onchange = (e) => { state.to = e.target.value || ""; syncNow("Range"); };
  $("q").oninput = (e) => { state.q = e.target.value || ""; applyFilters(); };

  $("btnAdd").onclick = () => openAdd();
  $("btnCloseModal").onclick = () => closeModal();
  $("btnSaveTxn").onclick = () => saveTxn();

  // auto fill account when wallet changes in modal
  $("mWallet").onchange = () => {
    const id = $("mWallet").value;
    const w = state.wallets.find(x => x.id === id);
    if (w && !$("mAccount").value) $("mAccount").value = w.name || "";
  };

  // session
  if (state.token) {
    showApp(true);
    await bootAfterLogin();
  } else {
    showApp(false);
  }
}

// expose for inline calls if any
window.App = {
  login, logout,
  openAdd, closeModal, saveTxn,
  syncNow
};

boot();

