// app.20260205vULT.js — GitHub Pages + Apps Script CRUD (NO CACHE)
(() => {
  const CONFIG = window.CONFIG || {};
  const API_BASE = String(CONFIG.API_BASE || "").trim();
  const $ = (id) => document.getElementById(id);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));
  const qs = (sel) => document.querySelector(sel);

  const fmt = (n) => Number(n || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
  const toNumber = (x) => {
    const n = Number(String(x ?? "").replace(/,/g, "").trim());
    return isNaN(n) ? 0 : n;
  };

  const setMsg = (id, msg, ok=false) => {
    const el = $(id);
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = ok ? "var(--ok)" : "var(--muted)";
  };

  const showApp = (yes) => {
    $("loginCard").style.display = yes ? "none" : "block";
    $("appArea").style.display = yes ? "block" : "none";
    $("btnRefresh").style.display = yes ? "inline-flex" : "none";
    $("btnPrint").style.display = yes ? "inline-flex" : "none";
    $("btnLogout").style.display = yes ? "inline-flex" : "none";
  };

  async function apiPost(body) {
    if (!API_BASE) throw new Error("API_BASE غير مضبوط داخل ملف config");
    const form = new URLSearchParams();
    Object.entries(body || {}).forEach(([k, v]) => {
      form.set(k, typeof v === "object" ? JSON.stringify(v) : String(v ?? ""));
    });
    const res = await fetch(API_BASE, { method: "POST", body: form, cache: "no-store" });
    return await res.json();
  }

  const state = {
    token: localStorage.getItem(CONFIG.SESSION_KEY || "wm_session") || "",
    wallets: [],
    txns: [],
    txnsUpToTo: [],
    selectedWalletId: "ALL",
    from: "",
    to: "",
    q: "",
    autoTimer: null,
    inFlight: false
  };

  function goTab(tabId){
    qsa(".tabBtn").forEach(b => b.classList.remove("active"));
    qsa(".tabPanel").forEach(p => p.classList.remove("active"));
    qs(`[data-tab="${tabId}"]`)?.classList.add("active");
    $(tabId)?.classList.add("active");
  }

  function todayKey(){
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const dd = String(d.getDate()).padStart(2,"0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function computeBalanceAtTo(){
    const to = state.to || "";
    const wid = state.selectedWalletId || "ALL";
    const el = $("balAt");
    if (!el) return;
    if (!to) { el.textContent = "0"; return; }

    const upRows = state.txnsUpToTo || [];
    if (wid === "ALL"){
      let total = 0;
      state.wallets.forEach(w => {
        const net = upRows
          .filter(r => String(r.walletId||"") === String(w.id))
          .reduce((s,r)=> s + toNumber(r.receipts) - toNumber(r.payments), 0);
        total += toNumber(w.opening) + net;
      });
      el.textContent = fmt(total);
      return;
    }

    const w = state.wallets.find(x => String(x.id) === String(wid));
    const opening = w ? toNumber(w.opening) : 0;
    const net = upRows
      .filter(r => String(r.walletId||"") === String(wid))
      .reduce((s,r)=> s + toNumber(r.receipts) - toNumber(r.payments), 0);
    el.textContent = fmt(opening + net);
  }

  async function login(){
    const u = ($("u").value || "").trim();
    const p = ($("p").value || "").trim();
    if (!u || !p) return setMsg("loginMsg", "اكتب اسم المستخدم وكلمة المرور");
    setMsg("loginMsg", "جاري تسجيل الدخول...");
    const res = await apiPost({ action: "login", u, p });
    if (!res.ok) return setMsg("loginMsg", res.msg || "فشل الدخول");
    state.token = res.token;
    localStorage.setItem(CONFIG.SESSION_KEY || "wm_session", state.token);
    setMsg("loginMsg", "تم ✅", true);
    showApp(true);
    await bootAfterLogin();
  }

  function logout(){
    stopAuto();
    state.token = "";
    localStorage.removeItem(CONFIG.SESSION_KEY || "wm_session");
    showApp(false);
  }

  function renderKpis(grand, today){
    $("grand").textContent = fmt(grand || 0);
    $("todayLabel").textContent = `اليوم: ${today || ""}`;
  }

  function fillSelects(){
    $("walletPick").innerHTML = `<option value="ALL">كل الحسابات</option>` +
      state.wallets.map(w => `<option value="${w.id}">${w.name}</option>`).join("");
    $("walletPick").value = state.selectedWalletId || "ALL";
    $("mWallet").innerHTML = state.wallets.map(w => `<option value="${w.id}">${w.name}</option>`).join("");
  }

  function renderBalances(){
    const wrap = $("balancesList");
    wrap.innerHTML = "";
    state.wallets.forEach(w => {
      const div = document.createElement("div");
      div.className = "balCard";
      div.innerHTML = `
        <div class="balTop">
          <div class="balName">${w.name}</div>
          <div class="balType">${w.type || ""}</div>
        </div>
        <div class="balValue">${fmt(w.balance)}</div>
        <div class="balMeta">افتتاحي: ${fmt(w.opening)} • صافي: ${fmt(w.net)}</div>
        <div class="balActions">
          <button class="btn small" data-act="view" data-id="${w.id}">عرض العمليات</button>
          <button class="btn small ghost" data-act="add" data-id="${w.id}">إضافة عملية</button>
        </div>
      `;
      wrap.appendChild(div);
    });

    qsa("#balancesList [data-act]").forEach(b => {
      b.onclick = () => {
        const act = b.getAttribute("data-act");
        const id = b.getAttribute("data-id");
        if (act === "view") {
          state.selectedWalletId = id;
          $("walletPick").value = id;
          goTab("txnsTab");
          applyFilters();
        } else if (act === "add") {
          openAdd({ walletId: id });
        }
      };
    });
  }

  function renderTxnsTable(rows){
    const body = $("txBody");
    const rec = rows.reduce((s,r)=>s+toNumber(r.receipts),0);
    const pay = rows.reduce((s,r)=>s+toNumber(r.payments),0);

    $("fltRec").textContent = fmt(rec);
    $("fltPay").textContent = fmt(pay);

    $("txTotals").innerHTML = `
      <span class="pill">مقبوضات: ${fmt(rec)}</span>
      <span class="pill">مدفوعات: ${fmt(pay)}</span>
      <span class="pill">صافي: ${fmt(rec-pay)}</span>
    `;

    if (!rows.length){
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
          <button class="iconBtn" data-edit="${r.rowNumber}" title="تعديل">✏️</button>
          <button class="iconBtn danger" data-del="${r.rowNumber}" title="حذف">🗑️</button>
        </td>
      `;
      body.appendChild(tr);
    });

    qsa("[data-edit]").forEach(b => b.onclick = () => openEdit(Number(b.getAttribute("data-edit"))));
    qsa("[data-del]").forEach(b => b.onclick = () => delTxn(Number(b.getAttribute("data-del"))));
  }

  function applyFilters(){
    const walletId = state.selectedWalletId || "ALL";
    const from = state.from || "";
    const to = state.to || "";
    const q = (state.q || "").trim().toLowerCase();

    let rows = state.txns.slice();
    if (walletId !== "ALL") rows = rows.filter(r => String(r.walletId||"") === walletId);
    if (from) rows = rows.filter(r => String(r.dateKey||"") >= from);
    if (to) rows = rows.filter(r => String(r.dateKey||"") <= to);

    if (q){
      rows = rows.filter(r => {
        const hay = `${r.dateKey} ${r.account} ${r.desc} ${r.ref} ${r.walletId}`.toLowerCase();
        return hay.includes(q);
      });
    }

    rows.sort((a,b) => {
      const ad = String(a.dateKey||"");
      const bd = String(b.dateKey||"");
      if (ad !== bd) return bd.localeCompare(ad);
      return Number(b.rowNumber||0) - Number(a.rowNumber||0);
    });

    const wName = walletId === "ALL" ? "كل الحسابات" : (state.wallets.find(w=>w.id===walletId)?.name || walletId);
    $("txTitle").textContent = `العمليات — ${wName}`;

    renderTxnsTable(rows);
    computeBalanceAtTo();
  }

  async function refreshAll(reason=""){
    if (!state.token || state.inFlight) return;
    state.inFlight = true;
    try{
      const init = await apiPost({ action:"init", token: state.token });
      if (!init.ok) throw new Error(init.msg || "فشل init");
      state.wallets = init.wallets || [];
      const grand = (init.totals && init.totals.grand) ? toNumber(init.totals.grand) : state.wallets.reduce((s,w)=>s+toNumber(w.balance),0);
      renderKpis(grand, init.todayKey || "");
      fillSelects();
      renderBalances();

      const tx = await apiPost({ action:"txns", token: state.token, walletId:"ALL", from: state.from || "", to: state.to || "" });
      if (!tx.ok) throw new Error(tx.msg || "فشل txns");
      state.txns = tx.rows || [];

      const tx2 = await apiPost({ action:"txns", token: state.token, walletId:"ALL", from:"", to: state.to || "" });
      if (!tx2.ok) throw new Error(tx2.msg || "فشل txns");
      state.txnsUpToTo = tx2.rows || [];

      applyFilters();
      $("chipUpdated").textContent = `آخر تحديث: ${new Date().toLocaleString("ar-EG")}`;
      if (reason) setMsg("statusMsg", `تحديث ✅ (${reason})`, true);
    }catch(e){
      console.error(e);
      setMsg("statusMsg", e.message || String(e));
    }finally{
      state.inFlight = false;
    }
  }

  function startAuto(){
    stopAuto();
    state.autoTimer = setInterval(()=>refreshAll("تلقائي"), 20000);
    document.addEventListener("visibilitychange", ()=>{ if(!document.hidden) refreshAll("عودة"); });
    window.addEventListener("online", ()=>refreshAll("Online"));
  }
  function stopAuto(){
    if (state.autoTimer) clearInterval(state.autoTimer);
    state.autoTimer = null;
  }

  function openModal(yes){ $("modal").style.display = yes ? "flex" : "none"; }

  function openAdd(pref={}){
    $("mMode").value = "add";
    $("mRow").value = "";
    $("mTitle").textContent = "إضافة عملية";
    $("mDate").value = todayKey();
    $("mWallet").value = pref.walletId || (state.wallets[0]?.id || "");
    $("mAccount").value = pref.account || (state.wallets.find(w=>w.id===($("mWallet").value))?.name || "");
    $("mRec").value = "";
    $("mPay").value = "";
    $("mDesc").value = "";
    $("mRef").value = "";
    setMsg("mMsg", "");
    openModal(true);
  }

  function openEdit(rowNumber){
    const r = state.txns.find(x => Number(x.rowNumber) === Number(rowNumber));
    if (!r) return;
    $("mMode").value = "edit";
    $("mRow").value = String(r.rowNumber);
    $("mTitle").textContent = "تعديل عملية";
    $("mDate").value = r.dateKey || todayKey();
    $("mWallet").value = r.walletId || (state.wallets[0]?.id || "");
    $("mAccount").value = r.account || "";
    $("mRec").value = r.receipts ? String(r.receipts) : "";
    $("mPay").value = r.payments ? String(r.payments) : "";
    $("mDesc").value = r.desc || "";
    $("mRef").value = r.ref || "";
    setMsg("mMsg", "");
    openModal(true);
  }

  async function saveTxn(){
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
    if ((payload.receipts>0 && payload.payments>0) || (payload.receipts<=0 && payload.payments<=0)){
      return setMsg("mMsg","اكتب مبلغ في المقبوضات أو المدفوعات فقط");
    }

    setMsg("mMsg","جاري الحفظ...");
    try{
      let res;
      if (mode === "add"){
        res = await apiPost({ action:"add", token:state.token, payload });
      } else {
        res = await apiPost({ action:"update", token:state.token, rowNumber, payload });
      }
      if (!res.ok) throw new Error(res.msg || "فشل الحفظ");
      setMsg("mMsg","تم ✅",true);
      openModal(false);
      await refreshAll("بعد الحفظ");
    }catch(e){
      console.error(e);
      setMsg("mMsg", e.message || String(e));
    }
  }

  async function delTxn(rowNumber){
    if (!confirm("هل تريد حذف هذه العملية؟")) return;
    try{
      const res = await apiPost({ action:"delete", token:state.token, rowNumber });
      if (!res.ok) throw new Error(res.msg || "فشل الحذف");
      await refreshAll("بعد الحذف");
    }catch(e){
      alert(e.message || String(e));
    }
  }

  async function bootAfterLogin(){
    if (!state.from) state.from = todayKey();
    if (!state.to) state.to = todayKey();
    $("fromPick").value = state.from;
    $("toPick").value = state.to;
    await refreshAll("تحميل");
    startAuto();
  }

  function bind(){
    $("appTitle").textContent = CONFIG.APP_TITLE || "Cash & Wallet Manager VIP";
    qsa(".tabBtn").forEach(b => b.onclick = () => goTab(b.getAttribute("data-tab")));
    $("btnLogin").onclick = login;
    $("btnLogout").onclick = logout;
    $("btnRefresh").onclick = () => refreshAll("يدوي");
    $("btnPrint").onclick = () => window.print();
    $("btnAdd").onclick = () => openAdd();
    $("btnCloseModal").onclick = () => openModal(false);
    $("btnSaveTxn").onclick = saveTxn;

    $("walletPick").onchange = (e) => { state.selectedWalletId = e.target.value || "ALL"; applyFilters(); };
    $("fromPick").onchange = (e) => { state.from = e.target.value || ""; refreshAll("تغيير تاريخ"); };
    $("toPick").onchange = (e) => { state.to = e.target.value || ""; refreshAll("تغيير تاريخ"); };
    $("q").oninput = (e) => { state.q = e.target.value || ""; applyFilters(); };

    $("mWallet").onchange = () => {
      const id = $("mWallet").value;
      const w = state.wallets.find(x => x.id === id);
      if (w && !$("mAccount").value) $("mAccount").value = w.name || "";
    };
  }

  async function start(){
    bind();
    if (state.token){
      showApp(true);
      await bootAfterLogin();
    } else {
      showApp(false);
    }
  }

  start();
})();
