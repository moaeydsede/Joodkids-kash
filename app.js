
(() => {
  const USERS = [
    { u: "admin", p: "123456" },
    { u: "فرزات", p: "123" },
  ];

  const LINKS = window.LINKS || {};
  const BUILD = window.BUILD || "build";
  const SESSION_KEY = "wm_ro_session_" + BUILD;

  const $ = (id) => document.getElementById(id);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));
  const qs = (sel) => document.querySelector(sel);

  const fmt = (n) => Number(n || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
  const toNumber = (x) => {
    const n = Number(String(x ?? "").replace(/,/g, "").trim());
    return isNaN(n) ? 0 : n;
  };

  const state = {
    wallets: [],
    walletsById: {},
    txns: [],
    filters: { walletId: "ALL", from: "", to: "", q: "" },
    inFlight: false,
    autoTimer: null,
    balSearch: "",
    balSort: "balance_desc",
  };

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];
      if (inQuotes) {
        if (ch === '"' && next === '"') { cur += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else cur += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ",") { row.push(cur); cur = ""; }
        else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
        else if (ch === "\r") {}
        else cur += ch;
      }
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  async function fetchCSV(url) {
    const bust = (url.includes("?") ? "&" : "?") + "t=" + Date.now();
    const res = await fetch(url + bust, { cache: "no-store" });
    if (!res.ok) throw new Error("فشل تحميل البيانات (" + res.status + ")");
    const text = await res.text();
    return parseCSV(text);
  }

  function todayKey() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function daysAgoKey(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function showApp(yes) {
    $("loginCard").style.display = yes ? "none" : "block";
    $("appArea").style.display = yes ? "block" : "none";
    $("btnRefresh").style.display = yes ? "inline-flex" : "none";
    $("btnLogout").style.display = yes ? "inline-flex" : "none";
  }

  function setStatus(msg, ok = false) {
    const el = $("statusMsg");
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = ok ? "var(--ok)" : "var(--muted)";
  }

  function renderKpis() {
    const grand = state.wallets.reduce((s, w) => s + toNumber(w.balance), 0);
    $("grand").textContent = fmt(grand);
    $("lastUpdate").textContent = "آخر تحديث: " + new Date().toLocaleString("ar-EG");
  }

  function fillWalletSelect() {
    const sel = $("walletPick");
    sel.innerHTML =
      `<option value="ALL">كل الحسابات</option>` +
      state.wallets.map((w) => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join("");
    sel.value = state.filters.walletId || "ALL";
  }

  function goTab(tabId) {
    qsa(".tabBtn").forEach((b) => b.classList.remove("active"));
    qsa(".tabPanel").forEach((p) => p.classList.remove("active"));
    qs(`[data-tab="${tabId}"]`)?.classList.add("active");
    $(tabId)?.classList.add("active");
  }

  function computeBalanceTo() {
    const wid = state.filters.walletId || "ALL";
    const to = state.filters.to || "";
    if (!to) { $("balTo").textContent = "0"; return; }

    if (wid === "ALL") {
      let total = 0;
      for (const w of state.wallets) {
        const opening = toNumber(w.opening);
        const net = state.txns
          .filter((r) => String(r.walletId) === String(w.id) && r.dateKey && r.dateKey <= to)
          .reduce((s, r) => s + toNumber(r.receipts) - toNumber(r.payments), 0);
        total += opening + net;
      }
      $("balTo").textContent = fmt(total);
      return;
    }

    const w = state.walletsById[wid];
    const opening = w ? toNumber(w.opening) : 0;
    const net = state.txns
      .filter((r) => String(r.walletId) === String(wid) && r.dateKey && r.dateKey <= to)
      .reduce((s, r) => s + toNumber(r.receipts) - toNumber(r.payments), 0);

    $("balTo").textContent = fmt(opening + net);
  }

  function renderTxnsTable(rows) {
    const body = $("txBody");
    const rec = rows.reduce((s, r) => s + toNumber(r.receipts), 0);
    const pay = rows.reduce((s, r) => s + toNumber(r.payments), 0);

    $("sumRec").textContent = fmt(rec);
    $("sumPay").textContent = fmt(pay);

    $("txTotals").innerHTML = `
      <span class="pill">مقبوضات: ${fmt(rec)}</span>
      <span class="pill">مدفوعات: ${fmt(pay)}</span>
      <span class="pill">صافي: ${fmt(rec - pay)}</span>
    `;

    $("txCount").textContent = `${rows.length} عملية`;

    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="6" class="muted">لا توجد عمليات ضمن الفلتر</td></tr>`;
      return;
    }

    body.innerHTML = "";
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(r.dateKey || "")}</td>
        <td>${escapeHtml(r.account || "")}</td>
        <td>${r.receipts ? fmt(r.receipts) : ""}</td>
        <td>${r.payments ? fmt(r.payments) : ""}</td>
        <td>${escapeHtml(r.desc || "")}</td>
        <td>${escapeHtml(r.ref || "")}</td>
      `;
      body.appendChild(tr);
    });
  }

  function applyFilters() {
    const walletId = state.filters.walletId || "ALL";
    const from = state.filters.from || "";
    const to = state.filters.to || "";
    const q = (state.filters.q || "").trim().toLowerCase();

    let rows = state.txns.slice();

    if (walletId !== "ALL") rows = rows.filter((r) => String(r.walletId) === String(walletId));
    if (from) rows = rows.filter((r) => (r.dateKey || "") >= from);
    if (to) rows = rows.filter((r) => (r.dateKey || "") <= to);
    if (q) {
      rows = rows.filter((r) => {
        const s = `${r.dateKey} ${r.account} ${r.desc} ${r.ref} ${r.walletId}`.toLowerCase();
        return s.includes(q);
      });
    }

    rows.sort((a, b) => (String(b.dateKey || "").localeCompare(String(a.dateKey || ""))));

    const wName = walletId === "ALL" ? "كل الحسابات" : (state.walletsById[walletId]?.name || walletId);
    $("txTitle").textContent = `العمليات — ${wName}`;

    renderTxnsTable(rows);
    computeBalanceTo();
  }

  function renderBalances() {
    const wrap = $("balancesList");
    wrap.innerHTML = "";

    const q = (state.balSearch || "").trim().toLowerCase();
    let rows = state.wallets.slice();

    if (q) rows = rows.filter(w => String(w.name||"").toLowerCase().includes(q));

    if (state.balSort === "balance_desc") rows.sort((a,b)=>toNumber(b.balance)-toNumber(a.balance));
    else if (state.balSort === "balance_asc") rows.sort((a,b)=>toNumber(a.balance)-toNumber(b.balance));
    else rows.sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""), "ar"));

    rows.forEach((w) => {
      const div = document.createElement("div");
      div.className = "balCard";
      div.innerHTML = `
        <div class="balTop">
          <div class="balName">${escapeHtml(w.name)}</div>
          <div class="balType">${escapeHtml(w.type || "")}</div>
        </div>
        <div class="balValue">${fmt(w.balance)}</div>
        <div class="balMeta">افتتاحي: ${fmt(w.opening)} • صافي حركة: ${fmt(w.net)}</div>
        <div class="balActions">
          <button class="btn ghost small" data-view="${w.id}">عرض العمليات</button>
        </div>
      `;
      wrap.appendChild(div);
    });

    qsa("[data-view]").forEach((b) => {
      b.onclick = () => {
        state.filters.walletId = b.getAttribute("data-view");
        $("walletPick").value = state.filters.walletId;
        goTab("txnsTab");
        applyFilters();
      };
    });
  }

  async function refreshAll(reason = "") {
    if (state.inFlight) return;
    state.inFlight = true;
    try {
      setStatus(reason ? `جاري التحديث... (${reason})` : "جاري التحديث...");

      const wRows = await fetchCSV(LINKS.WALLETS);
      const wallets = [];
      for (let i = 1; i < wRows.length; i++) {
        const r = wRows[i];
        const id = String(r[0] || "").trim();
        const name = String(r[1] || "").trim();
        if (!id || !name) continue;
        wallets.push({
          id,
          name,
          type: String(r[2] || "").trim(),
          opening: toNumber(r[3]),
          receipts: toNumber(r[4]),
          payments: toNumber(r[5]),
          net: toNumber(r[6]),
          balance: toNumber(r[7]),
        });
      }
      state.wallets = wallets;
      state.walletsById = {};
      wallets.forEach((w) => (state.walletsById[w.id] = w));

      const tRows = await fetchCSV(LINKS.TXNS);
      const txns = [];
      for (let i = 1; i < tRows.length; i++) {
        const r = tRows[i];
        if (!r || !r.length) continue;
        txns.push({
          dateKey: String(r[0] || "").trim(),
          account: String(r[1] || "").trim(),
          walletId: String(r[2] || "").trim(),
          receipts: toNumber(r[3]),
          payments: toNumber(r[4]),
          desc: String(r[5] || "").trim(),
          ref: String(r[6] || "").trim(),
        });
      }
      state.txns = txns;

      renderKpis();
      fillWalletSelect();
      renderBalances();
      setStatus("تم التحديث ✅", true);
      applyFilters();
    } catch (e) {
      console.error(e);
      setStatus("خطأ: " + (e.message || String(e)));
    } finally {
      state.inFlight = false;
    }
  }

  function startAuto() {
    stopAuto();
    state.autoTimer = setInterval(() => refreshAll("تلقائي"), 20000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshAll("عودة");
    });
    window.addEventListener("online", () => refreshAll("Online"));
  }

  function stopAuto() {
    if (state.autoTimer) clearInterval(state.autoTimer);
    state.autoTimer = null;
  }

  function login() {
    const u = ($("u").value || "").trim();
    const p = ($("p").value || "").trim();
    const ok = USERS.find((x) => x.u === u && x.p === p);
    if (!ok) {
      $("loginMsg").textContent = "اسم المستخدم أو كلمة المرور غير صحيحة";
      $("loginMsg").style.color = "var(--danger)";
      return;
    }
    localStorage.setItem(SESSION_KEY, "1");
    showApp(true);

    const t = todayKey();
    state.filters.from = t;
    state.filters.to = t;
    $("fromPick").value = t;
    $("toPick").value = t;

    refreshAll("تحميل");
    startAuto();
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    stopAuto();
    showApp(false);
  }

  function bind() {
    qsa(".tabBtn").forEach((b) => (b.onclick = () => goTab(b.getAttribute("data-tab"))));
    $("btnLogin").onclick = login;
    $("btnLogout").onclick = logout;
    $("btnRefresh").onclick = () => refreshAll("يدوي");

    $("walletPick").onchange = (e) => { state.filters.walletId = e.target.value || "ALL"; applyFilters(); };
    $("fromPick").onchange = (e) => { state.filters.from = e.target.value || ""; applyFilters(); };
    $("toPick").onchange = (e) => { state.filters.to = e.target.value || ""; applyFilters(); };
    $("q").oninput = (e) => { state.filters.q = e.target.value || ""; applyFilters(); };

    $("balSearch").oninput = (e) => { state.balSearch = e.target.value || ""; renderBalances(); };
    $("balSort").onchange = (e) => { state.balSort = e.target.value || "balance_desc"; renderBalances(); };

    qsa("[data-range]").forEach((b) => {
      b.onclick = () => {
        const r = b.getAttribute("data-range");
        const t = todayKey();
        if (r === "today") { state.filters.from = t; state.filters.to = t; }
        if (r === "week") { state.filters.from = daysAgoKey(6); state.filters.to = t; }
        if (r === "month") { state.filters.from = daysAgoKey(29); state.filters.to = t; }
        $("fromPick").value = state.filters.from;
        $("toPick").value = state.filters.to;
        applyFilters();
      };
    });
  }

  function start() {
    bind();
    const saved = localStorage.getItem(SESSION_KEY) === "1";
    if (saved) {
      showApp(true);
      const t = todayKey();
      state.filters.from = t;
      state.filters.to = t;
      $("fromPick").value = t;
      $("toPick").value = t;
      refreshAll("تحميل");
      startAuto();
    } else {
      showApp(false);
    }
  }

  start();
})();
