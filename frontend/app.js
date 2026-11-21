// 떠날까 - 해외여행 검색 관심도 AI 비서 (순수 JavaScript)
// 서버에서 받은 글은 모두 textContent로만 화면에 넣는다 (HTML로 해석하지 않음).
// 아이콘은 index.html에 들어 있는 SVG 모음(#i-plane)을 <use>로 가져다 쓴다.

(function () {
  "use strict";

  const API = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL || "").replace(/\/+$/, "");
  const WAKE_TIMEOUT_MS = 70000;   // 잠든 무료 서버가 깨어나는 시간을 넉넉히 기다린다
  const REQUEST_TIMEOUT_MS = 60000;
  const CHAT_TIMEOUT_MS = 120000;  // AI 답변은 더 오래 걸릴 수 있다
  const PAGE_SIZE = 10;
  const SVG_NS = "http://www.w3.org/2000/svg";

  const $ = (id) => document.getElementById(id);

  // ---------- 공통: DOM 도우미 ----------
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function svgEl(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach((k) => node.setAttribute(k, attrs[k]));
    return node;
  }

  // 비행기 아이콘 (index.html의 #i-plane을 가져다 쓴다)
  function planeIcon(className) {
    const svg = svgEl("svg", { "class": className || "", "aria-hidden": "true" });
    svg.appendChild(svgEl("use", { href: "#i-plane" }));
    return svg;
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
      if (e.name === "AbortError") throw new Error("서버 응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.");
      throw new Error("서버에 연결하지 못했어요. 네트워크와 서버 상태를 확인해 주세요.");
    } finally {
      clearTimeout(timer);
    }

    let data = null;
    try { data = await res.json(); } catch (e) { /* 본문이 없거나 JSON이 아님 */ }

    if (!res.ok) {
      const message = data && data.detail !== undefined ? detailToText(data.detail) : "요청에 실패했어요 (HTTP " + res.status + ")";
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
        $("wake-text").textContent = "서버를 깨우는 중이에요. 무료 서버라 처음에는 최대 1분 정도 걸릴 수 있어요. (" + sec + "초)";
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
      $("wake-text").textContent = "서버에 연결하지 못했어요: " + e.message;
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

  // ---------- 주 표기 ----------
  // 날짜(그 주의 시작일, 일요일)를 "2026년 11월 1주 (11.1~11.7)"처럼 바꾼다.
  // n주 = 그 달의 n번째 일요일에 시작하는 주
  function parseDate(iso) {
    const [y, mo, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, mo - 1, d));
  }
  function weekName(iso) {
    const d = parseDate(iso);
    return d.getUTCFullYear() + "년 " + (d.getUTCMonth() + 1) + "월 " + (Math.floor((d.getUTCDate() - 1) / 7) + 1) + "주";
  }
  function weekRange(iso) {
    const d = parseDate(iso);
    const e = new Date(d.getTime() + 6 * 86400000);
    return (d.getUTCMonth() + 1) + "." + d.getUTCDate() + "~" + (e.getUTCMonth() + 1) + "." + e.getUTCDate();
  }
  function weekLabel(iso) {
    return /^\d{4}-\d{2}-\d{2}$/.test(iso || "") ? weekName(iso) + " (" + weekRange(iso) + ")" : (iso || "");
  }
  function shortWeek(iso) {
    const d = parseDate(iso);
    return (d.getUTCMonth() + 1) + "월 " + (Math.floor((d.getUTCDate() - 1) / 7) + 1) + "주";
  }

  // ---------- 데이터 요약 + 그래프 ----------
  let allData = [];   // 날짜 오름차순

  // 서버의 추세 문장에서 숫자를 그대로 꺼내 읽기 쉬운 문장으로 바꾼다.
  // 형식이 다르면(예: 판단 불가) 서버 문구를 그대로 보여 준다.
  function trendSentence(trend) {
    const m = /^(\S+) \(최근 8주 평균 ([\d.]+), 직전 8주 평균 ([\d.]+), 변화율 ([+-]?[\d.]+)%\)/.exec(trend || "");
    if (!m) return trend;
    const label = m[1], recent = m[2], previous = m[3], rate = m[4];
    // 지수 값에는 "점"을 붙인다 ("점" 뒤 조사는 받침이 있어 "이"). %는 변화율에만 쓴다.
    const head = "최근 8주 평균 " + recent + "점이 직전 8주 " + previous + "점";
    const magnitude = rate.replace(/^[+-]/, "");
    if (label === "상승") return head + "보다 " + magnitude + "% 높아요 → 상승";
    if (label === "하락") return head + "보다 " + magnitude + "% 낮아요 → 하락";
    return head + "과 비슷해요 (변화율 " + rate + "%) → " + label;
  }

  // 카드 하나를 만든다. value는 { main, of }(숫자 카드) 또는 { text }(문장 카드)
  function stat(label, value, subs, extraClass) {
    const box = el("div", "stat" + (extraClass ? " " + extraClass : ""));
    box.appendChild(el("div", "label", label));
    if (value.text !== undefined) {
      box.appendChild(el("div", "text", value.text));
    } else {
      const v = el("div", "value", value.main);
      if (value.of) v.appendChild(el("span", "of", " " + value.of));
      box.appendChild(v);
    }
    (subs || []).forEach((s) => box.appendChild(el("div", "sub" + (s.strong ? " strong" : ""), s.text)));
    return box;
  }

  function renderSummary(s) {
    const root = $("summary");
    clear(root);
    if (!s || s.count === 0) {
      root.appendChild(el("div", "empty", "아직 데이터가 없어요."));
      return;
    }
    const m = s.metrics;
    const P = "점";          // 관심도 지수의 단위
    const OF = "/ 100점";
    const years = Math.round(s.count / 52);
    const countText = s.count + "주" + (years >= 1 ? " (약 " + years + "년)" : "");

    const [first, last] = (s.period || "").split(" ~ ");
    const periodMain = first && last ? weekName(first) + " ~ " + weekName(last) : s.period;
    const periodSub = first && last
      ? first.replace(/-/g, ".") + " ~ " + new Date(parseDate(last).getTime() + 6 * 86400000).toISOString().slice(0, 10).replace(/-/g, ".") + " · 한 주 = 일요일~토요일"
      : "";
    root.appendChild(stat("기간", { main: periodMain }, [{ text: periodSub }], "wide period"));
    root.appendChild(stat("데이터 수", { main: countText }));
    root.appendChild(stat("평균", { main: m.average + P, of: OF }));
    root.appendChild(stat("최대", { main: m.max.value + P, of: OF }, [{ text: weekLabel(m.max.date) }], "max"));
    root.appendChild(stat("최소", { main: m.min.value + P, of: OF }, [{ text: weekLabel(m.min.date) }]));

    const latestSubs = [{ text: weekLabel(m.latest.date) }];
    if (m.average > 0) {
      latestSubs.push({ text: "평균의 약 " + (m.latest.value / m.average).toFixed(1) + "배", strong: true });
    }
    root.appendChild(stat("최근값", { main: m.latest.value + P, of: OF }, latestSubs, "latest"));
    root.appendChild(stat("최근 추세", { text: trendSentence(s.trend) }, null, "wide"));
  }

  function renderChart(rows) {
    const root = $("chart");
    clear(root);
    if (!rows.length) return;
    const W = 420, H = 180, padL = 46, padR = 22, padT = 28, padB = 24;
    const svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "주간 관심도 지수 꺾은선 그래프" });

    const x = (i) => padL + (rows.length === 1 ? 0 : (i / (rows.length - 1)) * (W - padL - padR));
    const y = (v) => padT + (1 - v / 100) * (H - padT - padB);

    function text(attrs, content) {
      const t = svgEl("text", Object.assign({ "font-size": "11.5", fill: "#5b6b7e" }, attrs));
      t.textContent = content;
      return t;
    }

    [0, 50, 100].forEach((v) => {
      svg.appendChild(svgEl("line", { x1: padL, x2: W - padR, y1: y(v), y2: y(v), stroke: "#e3eef9" }));
      svg.appendChild(text({ x: padL - 5, y: y(v) + 4, "text-anchor": "end" }, String(v)));
    });
    // 세로축 단위 (세로로 돌린 한글은 일부 브라우저에서 깨져 보여 가로로 쓴다)
    svg.appendChild(text({ x: padL - 5, y: padT - 14, "text-anchor": "end" }, "(점)"));

    svg.appendChild(svgEl("polyline", {
      points: rows.map((r, i) => x(i).toFixed(1) + "," + y(r.value).toFixed(1)).join(" "),
      fill: "none", stroke: "#378add", "stroke-width": "1.6", "stroke-linejoin": "round",
    }));

    // 가장 높은 지점에 작은 비행기를 표시한다
    let maxIdx = 0;
    rows.forEach((r, i) => { if (r.value > rows[maxIdx].value) maxIdx = i; });
    const mx = x(maxIdx), my = y(rows[maxIdx].value);
    svg.appendChild(svgEl("circle", { cx: mx, cy: my, r: 3, fill: "#378add" }));
    const plane = svgEl("use", { href: "#i-plane", x: mx - 12, y: my - 19, width: 24, height: 20 });
    svg.appendChild(plane);
    const onRight = maxIdx > rows.length / 2;
    svg.appendChild(text({ x: onRight ? mx - 14 : mx + 14, y: my - 6, "text-anchor": onRight ? "end" : "start", fill: "#1f2d3d", "font-weight": "700" },
      "최고 " + rows[maxIdx].value + "점 (" + weekName(rows[maxIdx].date) + ")"));

    // 가로축: 처음과 끝 날짜
    svg.appendChild(text({ x: x(0), y: H - 5, "text-anchor": "start" }, weekName(rows[0].date)));
    svg.appendChild(text({ x: x(rows.length - 1), y: H - 5, "text-anchor": "end" }, weekName(rows[rows.length - 1].date)));
    root.appendChild(svg);
  }

  async function loadSummary() {
    try {
      renderSummary(await api("GET", "/api/data/summary"));
    } catch (e) {
      clear($("summary"));
      $("summary").appendChild(el("div", "empty", "요약을 불러오지 못했어요: " + e.message));
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
      toast("데이터를 불러오지 못했어요: " + e.message);
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
      const td = el("td", "empty", "아직 데이터가 없어요.");
      td.colSpan = 4;
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }
    slice.forEach((row) => body.appendChild(row.id === editingId ? editRow(row) : viewRow(row)));
  }

  function viewRow(row) {
    const tr = el("tr");
    const dateTd = el("td", null, row.date);
    dateTd.appendChild(el("span", "week-tag", shortWeek(row.date)));
    tr.appendChild(dateTd);
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
    if (value === "" || isNaN(Number(value))) { toast("관심도 지수는 숫자로 입력해 주세요."); return; }
    if (Number(value) !== row.value) changes.value = Number(value);
    if (memo !== (row.memo || "")) changes.memo = memo;
    if (!Object.keys(changes).length) { editingId = null; renderTable(); return; }
    try {
      await api("PUT", "/api/data/" + encodeURIComponent(row.id), changes);
      editingId = null;
      toast("수정했어요.", true);
      await Promise.all([loadData(), loadSummary()]);
    } catch (e) {
      toast(e.message);
    }
  }

  async function deleteData(row) {
    if (!confirm(row.date + " 데이터를 삭제할까요?")) return;
    try {
      await api("DELETE", "/api/data/" + encodeURIComponent(row.id));
      toast("삭제했어요.", true);
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
      toast("추가했어요.", true);
      await Promise.all([loadData(), loadSummary()]);
    } catch (e) {
      toast(e.message);
    }
  });

  // ---------- 데이터 내보내기 (보너스) ----------
  // 서버에서 받아 둔 전체 데이터(allData, 날짜 오름차순)를 파일로 내려받는다.
  function today() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function download(filename, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type: type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // 쉼표·따옴표·줄바꿈이 든 칸은 따옴표로 감싸고, 안의 따옴표는 두 번 쓴다
  function csvCell(v) {
    const s = String(v == null ? "" : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportData(format) {
    if (!allData.length) {
      toast("내려받을 데이터가 없어요.");
      return;
    }
    const rows = allData.map((r) => ({ date: r.date, value: r.value, memo: r.memo || "" }));
    const name = "tteonalkka_data_" + today();
    if (format === "csv") {
      const lines = ["date,value,memo"].concat(
        rows.map((r) => [r.date, r.value, r.memo].map(csvCell).join(","))
      );
      // 맨 앞 BOM(﻿): 엑셀에서 한글 메모가 깨지지 않게 한다
      download(name + ".csv", "﻿" + lines.join("\r\n") + "\r\n", "text/csv;charset=utf-8");
    } else {
      download(name + ".json", JSON.stringify(rows, null, 2), "application/json;charset=utf-8");
    }
    toast(rows.length + "건을 " + format.toUpperCase() + " 파일로 내려받았어요.", true);
  }

  $("export-csv").addEventListener("click", () => exportData("csv"));
  $("export-json").addEventListener("click", () => exportData("json"));

  $("page-prev").addEventListener("click", () => { page -= 1; editingId = null; renderTable(); });
  $("page-next").addEventListener("click", () => { page += 1; editingId = null; renderTable(); });

  // ---------- 채팅 ----------
  const chat = { id: null, title: "새 대화", messages: [] };
  let sending = false;

  // **굵게** 만 <strong>으로 바꾼다. 글자는 모두 텍스트 노드로 넣어 다른 HTML은 해석되지 않는다.
  function appendRichText(node, text) {
    text.split(/(\*\*[^*\n]+\*\*)/).forEach((part) => {
      if (/^\*\*[^*\n]+\*\*$/.test(part)) {
        const s = document.createElement("strong");
        s.textContent = part.slice(2, -2);
        node.appendChild(s);
      } else if (part) {
        node.appendChild(document.createTextNode(part));
      }
    });
  }

  function bubble(role, text) {
    const node = el("div", "bubble " + role);
    if (role === "assistant") appendRichText(node, text);
    else node.textContent = text;
    return node;
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
    renderMessages($("messages"), chat.messages, "함께 여행 관심도를 살펴볼까요? 아래에 궁금한 점을 적어 주세요.");
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

  // 작은 비행기가 점선 위를 좌우로 오가는 로딩 말풍선
  function loadingBubble() {
    const box = el("div", "bubble assistant loading");
    const flight = el("div", "flight");
    flight.appendChild(el("span", "track"));
    flight.appendChild(planeIcon("flyer"));
    box.appendChild(flight);
    box.appendChild(el("span", null, "답변을 준비하고 있어요"));
    return box;
  }

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
    const loading = loadingBubble();
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
        list.appendChild(el("li", "empty", "아직 저장된 여행 이야기가 없어요."));
        return;
      }
      items.forEach((item) => list.appendChild(historyItem(item)));
    } catch (e) {
      toast("대화 목록을 불러오지 못했어요: " + e.message);
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
      renderMessages($("preview"), selected.messages, "메시지가 없어요.");
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
    $("preview").appendChild(el("div", "empty", "왼쪽에서 여행 이야기를 골라 보세요."));
  }

  async function deleteConversation(id, title) {
    if (!confirm("'" + title + "' 대화를 삭제할까요?")) return;
    try {
      await api("DELETE", "/api/conversations/" + encodeURIComponent(id));
      if (selected && selected.id === id) clearPreview();
      if (chat.id === id) newChat();
      toast("삭제했어요.", true);
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
