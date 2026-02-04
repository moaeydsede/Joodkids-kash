import { CONFIG } from "./config.js";
const $ = (id) => document.getElementById(id);

const fmt = (n) => Number(n || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
const toast = (msg) => {
  const t = $("toast");
  t.textContent = msg || "";
  t.style.display = msg ? "block" : "none";
  if (msg) setTimeout(() => (t.style.display = "none"), 2400);
};
const setMsg = (id, msg, ok = false) => {
  const el = $(id);
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = ok ? "var(--ok)" : "var(--muted)";
};
const toNumber = (x) => {
  const n = Number(String(x ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};
const dateKey = (d) => {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const escapeHtml = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const parseCSV = (csvText) => {
  const lines = csvText
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  const rows = [];
  for (const line of lines) {
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = !inQ;
      } else if (ch === "," && !inQ) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    rows.push(out.map((c) => c.trim()));
  }
  return rows;
};
async function fetchCSV(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`فشل تحميل CSV: ${r.status}`);
  const txt = await r.text();
  return parseCSV(txt);
}

/* ---------- API ---------- */
function mustApi() {
  const u = String(CONFIG.API_BASE || "").trim();
  if (!u) throw new Error("API_BASE غير مضبوط داخل config.js");
  return u;
}
async function apiGet(params) {
  const base = mustApi();
  const qs = new URLSearchParams(params);
  const url = `${base}?${qs.toString()}`;
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json();
  return j;
}
async function apiPost(body) {
  const base = mustApi();
  const r = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  return j;
}

/* ---------- Session ---------- */
function persistSession(s) {
  localStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(s));
}
function readSession() {
  try {
    const raw = localStorage.getItem(CONFIG.SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function clearSession() {
  localStorage.removeItem(CONFIG.SESSION_KEY);
}

const state = {
  wallets: [],
  txns: [],
  token: "",
  user: null,
  selectedWalletId: "ALL",
  modalEditing: null, // { rowNumber, ...row }
  updatedAt: null,
};

/* ---------- UI ---------- */
function showApp(yes) {
  $("loginCard").style.display = yes ? "none" : "block";
  $("appArea").style.display = yes ? "block" : "none";
  $("btnRefresh").style.display = yes ? "inline-flex" : "none";
  $("btnPrint").style.display = yes ? "inline-flex" : "none";
  $("btnLogout").style.display = yes ? "inline-flex" : "none";
  $("btnAddTop").style.display = yes ? "inline-flex" : "none";
}

function openBalances() {
  $("viewBalances").style.display = "block";
  $("viewTxns").style.display = "none";
  $("tabBalances").classList.add("active");
  $("tabTxns").classList.remove("active");
}
function openTxns() {
  $("viewBalances").style.display = "none";
  $("viewTxns").style.display = "block";
  $("tabBalances").classList.remove("active");
  $("tabTxns").classList.add("active");
}

function fillWalletPick() {
  $("walletPick").innerHTML = [
    `<option value="ALL">كل الحسابات</option>`,
    ...state.wallets.map((w) => `<option value="${escapeHtml(w.id)}">${escapeHtml(w.name)}</option>`),
  ].join("");
  $("walletPick").value = state.selectedWalletId || "ALL";

  // modal
  $("mWallet").innerHTML = state.wallets
    .map((w) => `<option value="${escapeHtml(w.id)}">${escapeHtml(w.name)}</option>`)
    .join("");
}

function renderWalletStrip() {
  const wrap = $("walletStrip");
  wrap.innerHTML = "";
  const items = [
    { id: "ALL", name: "كل الحسابات", balance: state.wallets.reduce((s, w) => s + toNumber(w.balance), 0), type: "—" },
    ...state.wallets,
  ];
  for (const w of items) {
    const div = document.createElement("div");
    div.className = "wchip" + (state.selectedWalletId === w.id ? " active" : "");
    div.innerHTML = `
      <div class="n">${escapeHtml(w.name)}</div>
      <div class="b">${fmt(w.balance)}</div>
      <div class="m">${escapeHtml(w.type || "")}</div>
    `;
    div.addEventListener("click", () => {
      state.selectedWalletId = w.id;
      $("walletPick").value = w.id;
      openTxns();
      applyFilters();
      renderWalletStrip();
      toast("تم اختيار الحساب");
    });
    wrap.appendChild(div);
  }
}

function renderBalances() {
  const grid = $("walletGrid");
  grid.innerHTML = "";
  for (const w of state.wallets) {
    const div = document.createElement("div");
    div.className = "wcard";
    div.innerHTML = `
      <div class="whead">
        <div>
          <div class="wname">${escapeHtml(w.name)}</div>
          <div class="wtype">${escapeHtml(w.type || "")}</div>
        </div>
        <span class="sourcePill">Sheet</span>
      </div>
      <div class="wbal">${fmt(w.balance)}</div>
      <div class="wmeta">
        <span class="tag">افتتاحي: ${fmt(w.opening)}</span>
        <span class="tag">مقبوضات: ${fmt(w.receipts)}</span>
        <span class="tag">مدفوعات: ${fmt(w.payments)}</span>
        <span class="tag">صافي: ${fmt(w.net)}</span>
      </div>
      <div class="row" style="margin-top:12px">
        <button class="btn" type="button" data-open="${escapeHtml(w.id)}">عرض العمليات</button>
        <button class="btn" type="button" data-add="${escapeHtml(w.id)}">+ عملية</button>
      </div>
    `;
    div.querySelector("[data-open]").addEventListener("click", (e) => {
      const id = e.currentTarget.getAttribute("data-open");
      $("walletPick").value = id;
      state.selectedWalletId = id;
      openTxns();
      applyFilters();
      renderWalletStrip();
    });
    div.querySelector("[data-add]").addEventListener("click", (e) => {
      const id = e.currentTarget.getAttribute("data-add");
      openModal({ walletId: id });
    });
    grid.appendChild(div);
  }
}

function currentRange() {
  const quick = $("datePick").value || "";
  const from = $("fromPick").value || "";
  const to = $("toPick").value || "";
  if (quick) return { from: quick, to: quick };
  return { from, to: to || from };
}
function inRange(key, from, to) {
  if (!from && !to) return true;
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

/* ---------- Data Loading ---------- */
async function loadWalletsFromCSV() {
  const walletsCsv = await fetchCSV(CONFIG.CSV.WALLETS);
  const w = walletsCsv
    .slice(1)
    .map((r) => ({
      id: (r[0] || "").trim(),
      name: (r[1] || "").trim(),
      type: (r[2] || "").trim(),
      opening: toNumber(r[3]),
      receipts: toNumber(r[4]),
      payments: toNumber(r[5]),
      net: toNumber(r[6]),
      balance: toNumber(r[7]),
    }))
    .filter((x) => x.id && x.name);
  state.wallets = w;
}

async function loadInitAndTxns() {
  setMsg("statusMsg", "جارِ التحميل…");
  await loadWalletsFromCSV();

  // init from API (to get todayKey + grand safely)
  const init = await apiGet({ action: "init", token: state.token });
  if (!init.ok) throw new Error(init.msg || "INIT_FAILED");

  const grand = init.totals?.grand ?? state.wallets.reduce((s,w)=>s+toNumber(w.balance),0);
  $("grand").textContent = fmt(grand);
  $("todayLabel").textContent = `اليوم: ${init.todayKey || dateKey(new Date())}`;

  fillWalletPick();

  const today = init.todayKey || dateKey(new Date());
  if (!$("datePick").value) $("datePick").value = today;
  if (!$("fromPick").value) $("fromPick").value = today;
  if (!$("toPick").value) $("toPick").value = today;

  await reloadTxnsFromApi(); // respects current range + wallet filter in applyFilters
  state.updatedAt = new Date();
  $("chipUpdated").textContent = `آخر تحديث: ${state.updatedAt.toLocaleString("ar-EG")}`;

  renderWalletStrip();
  renderBalances();
  applyFilters();

  setMsg("statusMsg", "تم التحميل ✅", true);
  startAutoSync();
}

async function reloadTxnsFromApi() {
  const walletId = $("walletPick")?.value || state.selectedWalletId || "ALL";
  const { from, to } = currentRange();
  const res = await apiGet({
    action: "txns",
    token: state.token,
    walletId: walletId === "ALL" ? "ALL" : walletId,
    from: from || "",
    to: to || "",
  });
  if (!res.ok) throw new Error(res.msg || "TXNS_FAILED");

  state.txns = (res.rows || []).map((r) => ({
    rowNumber: r.rowNumber,
    dateKey: r.dateKey,
    account: r.account,
    walletId: r.walletId,
    receipts: toNumber(r.receipts),
    payments: toNumber(r.payments),
    desc: r.desc || "",
    ref: r.ref || "",
    createdAt: r.createdAt || "",
  }));
}

/* ---------- Rendering TXNS ---------- */
function applyFilters() {
  const walletId = $("walletPick").value || "ALL";
  state.selectedWalletId = walletId;

  const { from, to } = currentRange();
  const q = String($("q").value || "").trim().toLowerCase();

  const filtered = state.txns
    .filter((x) => {
      if (walletId !== "ALL" && x.walletId !== walletId) return false;
      if (!inRange(x.dateKey, from, to)) return false;
      if (q) {
        const blob = `${x.desc} ${x.ref} ${x.account}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => (a.dateKey === b.dateKey ? 0 : a.dateKey < b.dateKey ? 1 : -1));

  renderTxns(filtered);

  let rec = 0, pay = 0;
  for (const r of filtered) { rec += toNumber(r.receipts); pay += toNumber(r.payments); }
  $("rangeRec").textContent = fmt(rec);
  $("rangePay").textContent = fmt(pay);

  $("chipRange").textContent = from && to ? (from === to ? `تاريخ: ${from}` : `من ${from} إلى ${to}`) : "بدون تاريخ";
  if (walletId === "ALL") $("chipWallet").textContent = "كل الحسابات";
  else {
    const w = state.wallets.find((x) => x.id === walletId);
    $("chipWallet").textContent = w ? `الحساب: ${w.name}` : `الحساب: ${walletId}`;
  }

  renderWalletStrip();
}

function renderTxns(rows) {
  const body = $("txBody");
  body.innerHTML = "";

  let receipts = 0, payments = 0;
  for (const r of rows) { receipts += toNumber(r.receipts); payments += toNumber(r.payments); }
  $("txTotals").innerHTML = `
    <span class="pill">مقبوضات: ${fmt(receipts)}</span>
    <span class="pill">مدفوعات: ${fmt(payments)}</span>
    <span class="pill">صافي: ${fmt(receipts - payments)}</span>
    <span class="pill">عدد: ${rows.length.toLocaleString("ar-EG")}</span>
  `;

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="7" class="muted">لا توجد عمليات حسب التصفية</td></tr>`;
    return;
  }

  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.dateKey)}</td>
      <td>${escapeHtml(r.account || "")}</td>
      <td>${r.receipts ? fmt(r.receipts) : ""}</td>
      <td>${r.payments ? fmt(r.payments) : ""}</td>
      <td>${escapeHtml(r.desc || "")}</td>
      <td>${escapeHtml(r.ref || "")}</td>
      <td>
        <button class="actBtn" data-edit="${r.rowNumber}">تعديل</button>
        <button class="actBtn d" data-del="${r.rowNumber}">حذف</button>
      </td>
    `;
    body.appendChild(tr);

    tr.querySelector("[data-edit]").addEventListener("click", (e) => {
      const rowNumber = Number(e.currentTarget.getAttribute("data-edit"));
      const row = state.txns.find(x => x.rowNumber === rowNumber);
      if (row) openModal({ row });
    });
    tr.querySelector("[data-del]").addEventListener("click", (e) => {
      const rowNumber = Number(e.currentTarget.getAttribute("data-del"));
      deleteTxn(rowNumber);
    });
  }
}

/* ---------- Modal CRUD (API -> Google Sheet) ---------- */
function openModal({ walletId = null, row = null } = {}) {
  const today = dateKey(new Date());
  state.modalEditing = row ? { ...row } : null;

  const isEdit = !!row;
  $("mTitle").textContent = isEdit ? "تعديل عملية (Google Sheet)" : "إضافة عملية (Google Sheet)";
  $("btnDeleteModal").style.display = isEdit ? "inline-flex" : "none";

  $("mDate").value = row?.dateKey || today;

  $("mWallet").value = row?.walletId || walletId || (state.wallets[0]?.id || "");
  $("mRec").value = row?.receipts ? String(row.receipts) : "";
  $("mPay").value = row?.payments ? String(row.payments) : "";
  $("mDesc").value = row?.desc || "";
  $("mRef").value = row?.ref || "";
  setMsg("mMsg", "");

  $("modal").style.display = "flex";
}
function closeModal() {
  $("modal").style.display = "none";
  state.modalEditing = null;
}

function buildPayloadFromModal() {
  const d = $("mDate").value;
  const walletId = $("mWallet").value;
  const w = state.wallets.find((x) => x.id === walletId);
  const account = w?.name || walletId;

  const receipts = toNumber($("mRec").value);
  const payments = toNumber($("mPay").value);
  const desc = String($("mDesc").value || "").trim();
  const ref = String($("mRef").value || "").trim();

  if (!d) throw new Error("اختر التاريخ");
  if (!walletId) throw new Error("اختر الحساب");
  if ((receipts > 0 && payments > 0) || (receipts <= 0 && payments <= 0)) {
    throw new Error("اكتب مبلغ في المقبوضات أو المدفوعات فقط");
  }

  return { dateKey: d, walletId, account, receipts, payments, desc, ref };
}

async function saveModal() {
  try {
    const payload = buildPayloadFromModal();
    const editing = state.modalEditing;

    if (!editing) {
      const res = await apiPost({ action: "add", token: state.token, payload });
      if (!res.ok) throw new Error(res.msg || "ADD_FAILED");
      setMsg("mMsg", "تمت الإضافة ✅", true);
      toast("تمت إضافة العملية");
    } else {
      const res = await apiPost({ action: "update", token: state.token, rowNumber: editing.rowNumber, payload: { ...payload, createdAt: editing.createdAt } });
      if (!res.ok) throw new Error(res.msg || "UPDATE_FAILED");
      setMsg("mMsg", "تم التعديل ✅", true);
      toast("تم تعديل العملية");
    }

    await reloadTxnsFromApi();
    applyFilters();
    closeModal();
  } catch (e) {
    setMsg("mMsg", String(e?.message || e));
  }
}

async function deleteTxn(rowNumber) {
  const ok = confirm("حذف العملية من Google Sheet نهائيًا؟");
  if (!ok) return;
  const res = await apiPost({ action: "delete", token: state.token, rowNumber });
  if (!res.ok) {
    toast("فشل الحذف");
    return;
  }
  toast("تم الحذف");
  await reloadTxnsFromApi();
  applyFilters();
}

async function deleteFromModal() {
  const row = state.modalEditing;
  if (!row) return;
  await deleteTxn(row.rowNumber);
  closeModal();
}

/* ---------- Auth ---------- */
async function login() {
  if (!CONFIG.AUTH.ENABLED) {
    showApp(true);
    await loadInitAndTxns();
    openBalances();
    return;
  }

  const u = String($("u").value || "").trim();
  const p = String($("p").value || "").trim();
  if (!u || !p) return setMsg("loginMsg", "اكتب اسم المستخدم وكلمة المرور");

  const res = await apiPost({ action: "login", u, p });
  if (!res.ok) return setMsg("loginMsg", res.msg || "فشل الدخول");

  state.token = res.token;
  state.user = res.user;
  persistSession({ token: res.token, user: res.user, at: Date.now() });

  setMsg("loginMsg", "تم الدخول ✅", true);
  showApp(true);
  await loadInitAndTxns();
  openBalances();
  toast(`أهلاً ${res.user?.username || ""}`);
}

function logout() {
  stopAutoSync();
  clearSession();
  state.token = "";
  state.user = null;
  showApp(false);
  setMsg("loginMsg", "تم تسجيل الخروج");
  toast("تم الخروج");
}

/* ---------- Filters ---------- */
function resetFilters() {
  const today = dateKey(new Date());
  $("walletPick").value = "ALL";
  $("q").value = "";
  $("datePick").value = today;
  $("fromPick").value = today;
  $("toPick").value = today;
  applyFilters();
  toast("تمت إعادة الضبط");
}

/* ---------- Wiring ---------- */
function wireUI() {
  $("btnRefresh").addEventListener("click", async () => {
    try {
      await loadInitAndTxns();
      toast("تحديث تم ✅");
    } catch (e) {
      console.error(e);
      toast("حصل خطأ في التحديث");
      setMsg("statusMsg", String(e?.message || e));
    }
  });

  $("btnPrint").addEventListener("click", () => window.print());
  $("btnLogout").addEventListener("click", logout);
  $("btnLogin").addEventListener("click", login);

  $("tabBalances").addEventListener("click", openBalances);
  $("tabTxns").addEventListener("click", openTxns);

  $("btnResetFilters").addEventListener("click", resetFilters);

  $("btnApply").addEventListener("click", async () => {
    // لو المستخدم اختار range يدوي نفرّغ quick day
    const from = $("fromPick").value;
    const to = $("toPick").value;
    if ((from || to) && $("datePick").value) {
      if (!(from === $("datePick").value && to === $("datePick").value)) $("datePick").value = "";
    }
    await reloadTxnsFromApi();
    applyFilters();
    toast("تم عرض العمليات");
  });

  $("walletPick").addEventListener("change", async () => {
    await reloadTxnsFromApi();
    applyFilters();
  });

  $("q").addEventListener("input", () => {
    clearTimeout(window.__qTimer);
    window.__qTimer = setTimeout(applyFilters, 250);
  });

  $("datePick").addEventListener("change", async () => {
    const d = $("datePick").value;
    if (d) {
      $("fromPick").value = d;
      $("toPick").value = d;
      await reloadTxnsFromApi();
      applyFilters();
    }
  });

  $("fromPick").addEventListener("change", () => { if ($("datePick").value) $("datePick").value = ""; });
  $("toPick").addEventListener("change", () => { if ($("datePick").value) $("datePick").value = ""; });

  $("btnAdd").addEventListener("click", () => openModal({}));
  $("btnAddTop").addEventListener("click", () => openModal({}));
  $("btnCloseModal").addEventListener("click", closeModal);
  $("btnSaveModal").addEventListener("click", saveModal);
  $("btnDeleteModal").addEventListener("click", deleteFromModal);

  $("modal").addEventListener("click", (e) => { if (e.target === $("modal")) closeModal(); });
}


/* ---------- Auto Sync (تحديث تلقائي بدون زر) ---------- */
let __syncTimer = null;
let __syncInFlight = false;

function isModalOpen() {
  const m = $("modal");
  return m && m.style.display && m.style.display !== "none";
}

function isUserTyping() {
  const active = document.activeElement;
  if (!active) return false;
  const id = active.id || "";
  // لا نزعج المستخدم أثناء الكتابة/التاريخ/البحث
  return ["q", "fromPick", "toPick", "datePick", "mDate", "mRec", "mPay", "mDesc", "mRef", "u", "p"].includes(id);
}

async function syncNow(reason = "") {
  if (!state.token) return;
  if (document.hidden) return;
  if (__syncInFlight) return;
  if (isModalOpen()) return;
  if (isUserTyping()) return;

  __syncInFlight = true;
  try {
    // تحديث المحافظ + العمليات حسب الفلاتر الحالية
    await loadWalletsFromCSV();
    await reloadTxnsFromApi();

    // تحديث إجمالي الرصيد الحالي من wallets
    const grand = state.wallets.reduce((s, w) => s + toNumber(w.balance), 0);
    $("grand").textContent = fmt(grand);

    state.updatedAt = new Date();
    $("chipUpdated").textContent = `آخر تحديث: ${state.updatedAt.toLocaleString("ar-EG")}`;

    renderWalletStrip();
    renderBalances();
    applyFilters();
    if (reason) setMsg("statusMsg", `تحديث تلقائي ✅ (${reason})`, true);
  } catch (e) {
    // لا نغرق المستخدم برسائل — نعرض خطأ بسيط
    console.error(e);
    setMsg("statusMsg", "تعذر التحديث التلقائي", false);
  } finally {
    __syncInFlight = false;
  }
}

function startAutoSync() {
  stopAutoSync();
  // كل 20 ثانية (تقدر تغيرها)
  __syncTimer = setInterval(() => syncNow("Auto"), 20000);

  // عند الرجوع للتبويب
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncNow("Resume");
  });

  // عند استرجاع الاتصال
  window.addEventListener("online", () => syncNow("Online"));
}

function stopAutoSync() {
  if (__syncTimer) clearInterval(__syncTimer);
  __syncTimer = null;
}


/* ---------- Boot ---------- */
async function boot() {
  wireUI();

  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("./sw.js"); } catch {}
  }

  $("appTitle").textContent = CONFIG.APP_TITLE;

  const sess = readSession();
  if (!CONFIG.AUTH.ENABLED) {
    showApp(true);
    await loadInitAndTxns();
    openBalances();
    return;
  }

  if (sess?.token) {
    state.token = sess.token;
    state.user = sess.user || null;
    showApp(true);
    try {
      await loadInitAndTxns();
      openBalances();
      toast(`مرحباً ${sess.user?.username || ""}`);
    } catch (e) {
      console.error(e);
      toast("تعذر التحميل — تأكد من API_BASE");
      setMsg("statusMsg", String(e?.message || e));
      showApp(false);
      stopAutoSync();
    }
  } else {
    showApp(false);
  }
}

boot();
