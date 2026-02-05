
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

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeDateKey(raw) {
    const s = String(raw ?? "").trim();
    if (!s) return "";

    const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;

    const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m2) {
      let a = parseInt(m2[1], 10);
      let b = parseInt(m2[2], 10);
      const y = parseInt(m2[3], 10);
      let d = a, mo = b;
      if (a <= 12 && b > 12) { mo = a; d = b; }
      const mm = String(mo).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      return `${y}-${mm}-${dd}`;
    }

    const dt = new Date(s);
    if (!isNaN(dt.getTime())) {
      const y = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      const dd = String(dt.getDate()).padStart(2, "0");
      return `${y}-${mm}-${dd}`;
    }
    return s.slice(0, 10);
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

  const state = {
    wallets: [],
    walletsById: {},
    walletIdByName: {},
    txns: [],
    filters: { walletId: "", from: "", to: "" },
    inFlight: false,
    autoTimer: null,
  };

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

  function goTab(tabId) {
    qsa(".tabBtn").forEach((b) => b.classList.remove("active"));
    qsa(".tabPanel").forEach((p) => p.classList.remove("active"));
    qs(`[data-tab="${tabId}"]`)?.classList.add("active");
    $(tabId)?.classList.add("active");
  }

  function renderKpisGrand() {
    const grand = state.wallets.reduce((s, w) => s + toNumber(w.balance), 0);
    $("grand").textContent = fmt(grand);
    $("lastUpdate").textContent = "آخر تحديث: " + new Date().toLocaleString("ar-EG");
  }

  function fillWalletSelect() {
    const sel = $("walletPick");
    sel.innerHTML = state.wallets.map((w) => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join("");
    if (!state.filters.walletId) state.filters.walletId = state.wallets[0]?.id || "";
    sel.value = state.filters.walletId || "";
  }

  function renderBalancesTable() {
    const body = $("balancesBody");
    if (!state.wallets.length) {
      body.innerHTML = `<tr><td colspan="5" class="muted">لا توجد حسابات</td></tr>`;
      return;
    }

    body.innerHTML = "";
    state.wallets.forEach((w) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(w.name)}</td>
        <td>${fmt(w.receipts)}</td>
        <td>${fmt(w.payments)}</td>
        <td>${fmt(w.balance)}</td>
        <td><button class="btn ghost small" data-view="${escapeHtml(w.id)}">عرض العمليات</button></td>
      `;
      body.appendChild(tr);
    });

    qsa("[data-view]").forEach((b) => {
      b.onclick = () => {
        const id = b.getAttribute("data-view");
        state.filters.walletId = id;
        $("walletPick").value = id;

        const t = todayKey();
        if (!state.filters.from) state.filters.from = t;
        if (!state.filters.to) state.filters.to = t;
        $("fromPick").value = state.filters.from;
        $("toPick").value = state.filters.to;

        goTab("txnsTab");
        applyAndRenderTxns();
      };
    });
  }

  function computeBalanceTo(walletId, toKey) {
    const w = state.walletsById[walletId];
    const opening = w ? toNumber(w.opening) : 0;
    const netTo = state.txns
      .filter((r) => r.walletId === walletId && r.dateKey && r.dateKey <= toKey)
      .reduce((s, r) => s + toNumber(r.receipts) - toNumber(r.payments), 0);
    return opening + netTo;
  }

  function applyAndRenderTxns() {
    const walletId = String(state.filters.walletId || "").trim();
    const from = String(state.filters.from || "").trim();
    const to = String(state.filters.to || "").trim();

    if (!walletId || !from || !to) {
      $("txBody").innerHTML = `<tr><td colspan="6" class="muted">اختر الحساب والتاريخ لعرض العمليات</td></tr>`;
      $("txTotals").innerHTML = "";
      $("txCount").textContent = `0 عملية`;
      $("sumRec").textContent = "0";
      $("sumPay").textContent = "0";
      $("balTo").textContent = "0";
      $("kpiScope").textContent = "—";
      return;
    }

    const rows = state.txns
      .filter((r) => r.walletId === walletId && r.dateKey >= from && r.dateKey <= to)
      .sort((a, b) => String(b.dateKey).localeCompare(String(a.dateKey)));

    const rec = rows.reduce((s, r) => s + toNumber(r.receipts), 0);
    const pay = rows.reduce((s, r) => s + toNumber(r.payments), 0);
    const balTo = computeBalanceTo(walletId, to);

    const wName = state.walletsById[walletId]?.name || walletId;
    $("txTitle").textContent = `العمليات — ${wName}`;
    $("txCount").textContent = `${rows.length} عملية`;
    $("sumRec").textContent = fmt(rec);
    $("sumPay").textContent = fmt(pay);
    $("balTo").textContent = fmt(balTo);
    $("kpiScope").textContent = `الحساب: ${wName} • من ${from} إلى ${to}`;

    $("txTotals").innerHTML = `
      <span class="pill">مقبوضات: ${fmt(rec)}</span>
      <span class="pill">مدفوعات: ${fmt(pay)}</span>
      <span class="pill">صافي: ${fmt(rec - pay)}</span>
    `;

    const body = $("txBody");
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="6" class="muted">لا توجد عمليات لهذا الحساب ضمن هذه الفترة</td></tr>`;
      return;
    }

    body.innerHTML = "";
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(r.dateKey)}</td>
        <td>${escapeHtml(r.account || wName)}</td>
        <td>${r.receipts ? fmt(r.receipts) : ""}</td>
        <td>${r.payments ? fmt(r.payments) : ""}</td>
        <td>${escapeHtml(r.desc || "")}</td>
        <td>${escapeHtml(r.ref || "")}</td>
      `;
      body.appendChild(tr);
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
        const w = {
          id,
          name,
          type: String(r[2] || "").trim(),
          opening: toNumber(r[3]),
          receipts: toNumber(r[4]),
          payments: toNumber(r[5]),
          net: toNumber(r[6]),
          balance: toNumber(r[7]),
        };
        wallets.push(w);
      }
      state.wallets = wallets;
      state.walletsById = {};
      state.walletIdByName = {};
      wallets.forEach((w) => {
        state.walletsById[w.id] = w;
        state.walletIdByName[String(w.name || "").trim()] = w.id;
      });

      const tRows = await fetchCSV(LINKS.TXNS);
      const txns = [];
      for (let i = 1; i < tRows.length; i++) {
        const r = tRows[i];
        if (!r || !r.length) continue;

        const dateKey = normalizeDateKey(r[0]);
        const account = String(r[1] || "").trim();
        let walletId = String(r[2] || "").trim();

                if (!walletId && account && state.walletIdByName[account]) walletId = state.walletIdByName[account];

        if (!walletId) continue;

        txns.push({
          dateKey,
          account,
          walletId,
          receipts: toNumber(r[3]),
          payments: toNumber(r[4]),
          desc: String(r[5] || "").trim(),
          ref: String(r[6] || "").trim(),
        });
      }

      }
      state.txns = txns;

      renderKpisGrand();
      fillWalletSelect();
      renderBalancesTable();

      setStatus("تم التحديث ✅", true);
      applyAndRenderTxns();
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

    $("walletPick").onchange = (e) => { state.filters.walletId = e.target.value || ""; applyAndRenderTxns(); };
    $("fromPick").onchange = (e) => { state.filters.from = e.target.value || ""; applyAndRenderTxns(); };
    $("toPick").onchange = (e) => { state.filters.to = e.target.value || ""; applyAndRenderTxns(); };

    qsa("[data-range]").forEach((b) => {
      b.onclick = () => {
        const r = b.getAttribute("data-range");
        const t = todayKey();
        if (r === "today") { state.filters.from = t; state.filters.to = t; }
        if (r === "week") { state.filters.from = daysAgoKey(6); state.filters.to = t; }
        if (r === "month") { state.filters.from = daysAgoKey(29); state.filters.to = t; }
        $("fromPick").value = state.filters.from;
        $("toPick").value = state.filters.to;
        applyAndRenderTxns();
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
