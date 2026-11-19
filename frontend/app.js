// 해외여행 검색 관심도 AI 비서 - 프론트엔드 (순수 JavaScript)
// 서버에서 받은 글은 모두 textContent로만 화면에 넣는다 (HTML로 해석하지 않음).

(function () {
  "use strict";

  const API = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL || "").replace(/\/+$/, "");
  const WAKE_TIMEOUT_MS = 70000;   // 잠든 무료 서버가 깨어나는 시간을 넉넉히 기다린다
  const REQUEST_TIMEOUT_MS = 60000;
  const CHAT_TIMEOUT_MS = 120000;  // AI 답변은 더 오래 걸릴 수 있다
  const PAGE_SIZE = 10;

  const $ = (id) => document.getElementById(id);

  // ---------- 공통: DOM 도우미 ----------
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function formatTime(iso) {
    const d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
  }

  // ---------- 공통: API 호출 ----------
  // 서버가 보낸 detail 문구를 그대로 오류 메시지로 쓴다.
  function detailToText(detail) {
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail.map((d) => (d && d.msg) ? d.msg : JSON.stringify(d)).join(" / ");
    }
    return JSON.stringify(detail);
  }

  async function api(method, path, body, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || REQUEST_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(API + path, {
        method,
        headers: body !== undefined ? { "Content-Type": "application/json" } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (e) {
      if (e.name === "AbortError") throw new Error("서버 응답이 너무 오래 걸립니다. 잠시 후 다시 시도해 주세요.");
      throw new Error("서버에 연결하지 못했습니다. 네트워크와 서버 상태를 확인해 주세요.");
    } finally {
      clearTimeout(timer);
    }

    let data = null;
    try { data = await res.json(); } catch (e) { /* 본문이 없거나 JSON이 아님 */ }

    if (!res.ok) {
      const message = data && data.detail !== undefined ? detailToText(data.detail) : "요청에 실패했습니다 (HTTP " + res.status + ")";
      throw new Error(message);
    }
    return data;
  }

  // ---------- 알림 ----------
  let toastTimer = null;
  function toast(message, isOk) {
    $("toast-text").textContent = message;
    $("toast").classList.toggle("ok", !!isOk);
    $("toast").hidden = false;
    clearTimeout(toastTimer);
    if (isOk) toastTimer = setTimeout(() => { $("toast").hidden = true; }, 3000);
  }
  $("toast-close").addEventListener("click", () => { $("toast").hidden = true; });

  // ---------- 서버 깨우기 ----------
  let wakeTimer = null;
  let wakeStart = 0;

  function setStatus(kind, text) {
    const badge = $("server-status");
    badge.className = "badge badge-" + kind;
    badge.textContent = text;
  }

  async function wakeServer() {
    $("wake-retry").hidden = true;
    setStatus("wait", "서버 확인 중");
    wakeStart = Date.now();

    // 응답이 빠르면 안내 없이 지나가고, 1초 넘게 걸리면 안내를 보여 준다
    const showTimer = setTimeout(() => {
      $("wake-banner").hidden = false;
      const update = () => {
        const sec = Math.floor((Date.now() - wakeStart) / 1000);
        $("wake-text").textContent = "서버를 깨우는 중입니다. 무료 서버는 처음 접속할 때 최대 1분 정도 걸릴 수 있어요. (" + sec + "초)";
      };
      update();
      wakeTimer = setInterval(update, 1000);
    }, 1000);

    try {
      await api("GET", "/api/health", undefined, WAKE_TIMEOUT_MS);
      clearTimeout(showTimer);
      clearInterval(wakeTimer);
      $("wake-banner").hidden = true;
      setStatus("ok", "서버 연결됨");
      await loadAll();
    } catch (e) {
      clearTimeout(showTimer);
      clearInterval(wakeTimer);
      $("wake-banner").hidden = false;
      $("wake-text").textContent = "서버에 연결하지 못했습니다: " + e.message;
      $("wake-retry").hidden = false;
      setStatus("bad", "연결 실패");
    }
  }
  $("wake-retry").addEventListener("click", wakeServer);

  // ---------- 탭 ----------
  function showTab(name) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    ["chat", "data", "history"].forEach((n) => { $("tab-" + n).hidden = n !== name; });
    if (name === "history") loadHistory();
  }
  document.querySelectorAll(".tab").forEach((t) => {
    t.addEventListener("click", () => showTab(t.dataset.tab));
  });

  // ---------- 데이터 요약 + 그래프 ----------
  let allData = [];   // 날짜 오름차순

  function stat(label, value, sub, extraClass) {
    const box = el("div", "stat" + (extraClass ? " " + extraClass : ""));
    box.appendChild(el("div", "label", label));
    box.appendChild(el("div", extraClass === "wide" ? "text" : "value", value));
    if (sub) box.appendChild(el("div", "sub", sub));
    return box;
  }

  function renderSummary(s) {
    const root = $("summary");
    clear(root);
    if (!s || s.count === 0) {
      root.appendChild(el("div", "empty", "저장된 데이터가 없습니다."));
      return;
    }
    const m = s.metrics;
    root.appendChild(stat("기간", s.period, null, "wide"));
    root.appendChild(stat("데이터 수", s.count + "주"));
    root.appendChild(stat("평균", String(m.average)));
    root.appendChild(stat("최대", String(m.max.value), m.max.date));
    root.appendChild(stat("최소", String(m.min.value), m.min.date));
    root.appendChild(stat("최근값", String(m.latest.value), m.latest.date));
    root.appendChild(stat("최근 추세", s.trend, null, "wide"));
  }

  function renderChart(rows) {
    const root = $("chart");
    clear(root);
    if (!rows.length) return;
    const W = 560, H = 150, padL = 26, padR = 8, padT = 8, padB = 20;
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "주간 관심도 꺾은선 그래프");

    const x = (i) => padL + (rows.length === 1 ? 0 : (i / (rows.length - 1)) * (W - padL - padR));
    const y = (v) => padT + (1 - v / 100) * (H - padT - padB);

    [0, 50, 100].forEach((v) => {
      const line = document.createElementNS(NS, "line");
      line.setAttribute("x1", padL); line.setAttribute("x2", W - padR);
      line.setAttribute("y1", y(v)); line.setAttribute("y2", y(v));
      line.setAttribute("stroke", "#e2e7ee");
      svg.appendChild(line);
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", padL - 4); t.setAttribute("y", y(v) + 4);
      t.setAttribute("text-anchor", "end"); t.setAttribute("font-size", "10"); t.setAttribute("fill", "#6b7686");
      t.textContent = String(v);
      svg.appendChild(t);
    });

    const poly = document.createElementNS(NS, "polyline");
    poly.setAttribute("points", rows.map((r, i) => x(i).toFixed(1) + "," + y(r.value).toFixed(1)).join(" "));
    poly.setAttribute("fill", "none");
    poly.setAttribute("stroke", "#2563eb");
    poly.setAttribute("stroke-width", "1.6");
    svg.appendChild(poly);

    const last = rows[rows.length - 1];
    const dot = document.createElementNS(NS, "circle");
    dot.setAttribute("cx", x(rows.length - 1)); dot.setAttribute("cy", y(last.value));
    dot.setAttribute("r", "3.5"); dot.setAttribute("fill", "#2563eb");
    svg.appendChild(dot);

    [[0, "start"], [rows.length - 1, "end"]].forEach(([i, anchor]) => {
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", x(i)); t.setAttribute("y", H - 5);
      t.setAttribute("text-anchor", anchor); t.setAttribute("font-size", "10"); t.setAttribute("fill", "#6b7686");
      t.textContent = rows[i].date;
      svg.appendChild(t);
    });
    root.appendChild(svg);
  }

  async function loadSummary() {
    try {
      renderSummary(await api("GET", "/api/data/summary"));
    } catch (e) {
      clear($("summary"));
      $("summary").appendChild(el("div", "empty", "요약을 불러오지 못했습니다: " + e.message));
    }
  }

  // ---------- 데이터 관리 ----------
  let page = 0;
  let editingId = null;

  async function loadData() {
    try {
      allData = await api("GET", "/api/data");
      renderChart(allData);
      renderTable();
    } catch (e) {
      toast("데이터를 불러오지 못했습니다: " + e.message);
    }
  }

  function renderTable() {
    const rows = allData.slice().reverse();   // 최신 날짜가 위
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    page = Math.min(page, pages - 1);
    const start = page * PAGE_SIZE;
    const slice = rows.slice(start, start + PAGE_SIZE);

    $("data-count").textContent = "전체 " + rows.length + "건";
    $("page-info").textContent = (page + 1) + " / " + pages + " 페이지";
    $("page-prev").disabled = page === 0;
    $("page-next").disabled = page >= pages - 1;

    const body = $("data-body");
    clear(body);
    if (!slice.length) {
      const tr = el("tr");
      const td = el("td", "empty", "데이터가 없습니다.");
      td.colSpan = 4;
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }
    slice.forEach((row) => body.appendChild(row.id === editingId ? editRow(row) : viewRow(row)));
  }

  function viewRow(row) {
    const tr = el("tr");
    tr.appendChild(el("td", null, row.date));
    tr.appendChild(el("td", null, String(row.value)));
    tr.appendChild(el("td", null, row.memo || ""));
    const td = el("td");
    const box = el("div", "actions");
    const edit = el("button", "btn btn-ghost btn-small", "수정");
    edit.type = "button";
    edit.addEventListener("click", () => { editingId = row.id; renderTable(); });
    const del = el("button", "btn btn-danger btn-small", "삭제");
    del.type = "button";
    del.addEventListener("click", () => deleteData(row));
    box.append(edit, del);
    td.appendChild(box);
    tr.appendChild(td);
    return tr;
  }

  function editRow(row) {
    const tr = el("tr");
    const dateIn = el("input"); dateIn.type = "date"; dateIn.value = row.date;
    const valueIn = el("input"); valueIn.type = "number"; valueIn.min = "0"; valueIn.max = "100"; valueIn.step = "any"; valueIn.value = row.value;
    const memoIn = el("input"); memoIn.type = "text"; memoIn.maxLength = 200; memoIn.value = row.memo || "";
    [dateIn, valueIn, memoIn].forEach((input) => {
      const td = el("td");
      td.appendChild(input);
      tr.appendChild(td);
    });
    const td = el("td");
    const box = el("div", "actions");
    const save = el("button", "btn btn-primary btn-small", "저장");
    save.type = "button";
    save.addEventListener("click", () => saveEdit(row, dateIn.value, valueIn.value, memoIn.value));
    const cancel = el("button", "btn btn-ghost btn-small", "취소");
    cancel.type = "button";
    cancel.addEventListener("click", () => { editingId = null; renderTable(); });
    box.append(save, cancel);
    td.appendChild(box);
    tr.appendChild(td);
    return tr;
  }

  // 바뀐 항목만 보낸다 (서버의 부분 수정 방식)
  async function saveEdit(row, date, value, memo) {
    const changes = {};
    if (date !== row.date) changes.date = date;
    if (value === "" || isNaN(Number(value))) { toast("관심도는 숫자로 입력해 주세요."); return; }
    if (Number(value) !== row.value) changes.value = Number(value);
    if (memo !== (row.memo || "")) changes.memo = memo;
    if (!Object.keys(changes).length) { editingId = null; renderTable(); return; }
    try {
      await api("PUT", "/api/data/" + encodeURIComponent(row.id), changes);
      editingId = null;
      toast("수정했습니다.", true);
      await Promise.all([loadData(), loadSummary()]);
    } catch (e) {
      toast(e.message);
    }
  }

  async function deleteData(row) {
    if (!confirm(row.date + " 데이터를 삭제할까요?")) return;
    try {
      await api("DELETE", "/api/data/" + encodeURIComponent(row.id));
      toast("삭제했습니다.", true);
      await Promise.all([loadData(), loadSummary()]);
    } catch (e) {
      toast(e.message);
    }
  }

  $("add-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = {
      date: $("add-date").value,
      value: Number($("add-value").value),
      memo: $("add-memo").value,
    };
    try {
      await api("POST", "/api/data", body);
      $("add-form").reset();
      page = 0;
      toast("추가했습니다.", true);
      await Promise.all([loadData(), loadSummary()]);
    } catch (e) {
      toast(e.message);
    }
  });

  $("page-prev").addEventListener("click", () => { page -= 1; editingId = null; renderTable(); });
  $("page-next").addEventListener("click", () => { page += 1; editingId = null; renderTable(); });

  // ---------- 채팅 ----------
  const chat = { id: null, title: "새 대화", messages: [] };
  let sending = false;

  function bubble(role, text) {
    return el("div", "bubble " + role, text);
  }

  function renderMessages(root, messages, emptyText) {
    clear(root);
    if (!messages.length) {
      root.appendChild(el("div", "empty", emptyText));
      return;
    }
    messages.forEach((m) => root.appendChild(bubble(m.role, m.content)));
    root.scrollTop = root.scrollHeight;
  }

  function renderChat() {
    $("chat-title").textContent = chat.title;
    renderMessages($("messages"), chat.messages, "궁금한 점을 물어보세요. 예: 최근 관심도 추세를 알려줘");
  }

  function newChat() {
    chat.id = null;
    chat.title = "새 대화";
    chat.messages = [];
    renderChat();
  }
  $("new-chat").addEventListener("click", () => {
    if (sending) return;
    newChat();
    $("chat-input").focus();
  });

  async function sendChat() {
    if (sending) return;
    const input = $("chat-input");
    const text = input.value.trim();
    if (!text) return;

    sending = true;
    $("chat-send").disabled = true;
    input.value = "";

    const box = $("messages");
    if (!chat.messages.length) clear(box);   // 안내 문구 제거
    box.appendChild(bubble("user", text));
    const loading = el("div", "bubble assistant loading");
    loading.appendChild(document.createTextNode("답변을 작성하는 중"));
    loading.appendChild(el("span", "dots"));
    box.appendChild(loading);
    box.scrollTop = box.scrollHeight;

    try {
      const payload = { message: text };
      if (chat.id) payload.conversation_id = chat.id;
      const res = await api("POST", "/api/chat", payload, CHAT_TIMEOUT_MS);
      chat.messages.push({ role: "user", content: text }, { role: "assistant", content: res.answer });
      if (!chat.id) chat.title = text.slice(0, 30);   // 서버의 자동 제목 규칙과 같다
      chat.id = res.conversation_id;
      renderChat();
    } catch (e) {
      loading.remove();
      box.appendChild(bubble("error", e.message));   // 서버의 detail 문구 그대로
      box.scrollTop = box.scrollHeight;
    } finally {
      sending = false;
      $("chat-send").disabled = false;
      input.focus();
    }
  }

  $("chat-form").addEventListener("submit", (event) => { event.preventDefault(); sendChat(); });
  $("chat-input").addEventListener("keydown", (event) => {
    // 한글 입력 중(조합 중) Enter는 전송하지 않는다
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendChat();
    }
  });

  // ---------- 대화 기록 ----------
  let selected = null;   // 미리보기 중인 대화 { id, title, messages }

  async function loadHistory() {
    const list = $("history-list");
    try {
      const items = await api("GET", "/api/conversations");
      clear(list);
      if (!items.length) {
        list.appendChild(el("li", "empty", "저장된 대화가 없습니다."));
        return;
      }
      items.forEach((item) => list.appendChild(historyItem(item)));
    } catch (e) {
      toast("대화 목록을 불러오지 못했습니다: " + e.message);
    }
  }

  function historyItem(item) {
    const li = el("li", "history-item" + (selected && selected.id === item.id ? " selected" : ""));
    const info = el("div", "info");
    info.appendChild(el("div", "title", item.title));
    info.appendChild(el("div", "time", formatTime(item.updated_at)));
    const del = el("button", "btn btn-danger btn-small", "삭제");
    del.type = "button";
    del.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteConversation(item.id, item.title);
    });
    li.append(info, del);
    li.addEventListener("click", () => openConversation(item.id));
    return li;
  }

  async function openConversation(id) {
    try {
      selected = await api("GET", "/api/conversations/" + encodeURIComponent(id));
      $("preview-title").textContent = selected.title;
      $("preview-actions").hidden = false;
      renderMessages($("preview"), selected.messages, "메시지가 없습니다.");
      document.querySelectorAll(".history-item").forEach((n) => n.classList.remove("selected"));
      await loadHistory();
    } catch (e) {
      toast(e.message);
    }
  }

  function clearPreview() {
    selected = null;
    $("preview-title").textContent = "대화 내용";
    $("preview-actions").hidden = true;
    clear($("preview"));
    $("preview").appendChild(el("div", "empty", "왼쪽 목록에서 대화를 선택하세요."));
  }

  async function deleteConversation(id, title) {
    if (!confirm("'" + title + "' 대화를 삭제할까요?")) return;
    try {
      await api("DELETE", "/api/conversations/" + encodeURIComponent(id));
      if (selected && selected.id === id) clearPreview();
      if (chat.id === id) newChat();
      toast("삭제했습니다.", true);
      await loadHistory();
    } catch (e) {
      toast(e.message);
    }
  }

  // 불러온 대화를 채팅 화면으로 가져와 이어서 대화한다
  $("preview-continue").addEventListener("click", () => {
    if (!selected || sending) return;
    chat.id = selected.id;
    chat.title = selected.title;
    chat.messages = selected.messages.slice();
    renderChat();
    showTab("chat");
    $("chat-input").focus();
  });
  $("preview-delete").addEventListener("click", () => {
    if (selected) deleteConversation(selected.id, selected.title);
  });
  $("history-refresh").addEventListener("click", loadHistory);

  // ---------- 시작 ----------
  async function loadAll() {
    await Promise.all([loadSummary(), loadData()]);
  }

  renderChat();
  clearPreview();
  wakeServer();
})();
