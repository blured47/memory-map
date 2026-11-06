const api = async (path, options = {}) => {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  if (!res.ok) throw new Error((await res.json()).detail ?? res.statusText);
  return res.status === 204 ? null : res.json();
};

const fmtDate = (s) => (s ? new Date(s).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" }) : "-");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const pad = (n) => String(n).padStart(2, "0");
const toLocalISOString = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

const initMeetingTime = () => {
  const input = document.querySelector('input[name="met_at"]');
  if (input) input.value = toLocalISOString();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMeetingTime);
} else {
  initMeetingTime();
}

let cachedPersons = [];
const collapsedCategories = new Set();
const selectedPersonIds = new Set();
let currentPersonSort = "name_asc";
let meetingDateFilter = "";
let placeSearchTimer = null;
let selectedPlace = null;   // { name, lat, lon }
let kakaoMap = null;
let kakaoMarkers = [];
let cachedMeetings = [];

function sortPersons(arr, criteria) {
  return [...arr].sort((a, b) => {
    if (criteria === "name_asc") {
      return a.name.localeCompare(b.name, "ko");
    }
    if (criteria === "frequency_high") {
      // 만남 횟수 0이면 빈도 0 — 맨 뒤로
      const mcA = a.meeting_count ?? 0;
      const mcB = b.meeting_count ?? 0;
      if (mcA === 0 && mcB === 0) return a.name.localeCompare(b.name, "ko");
      if (mcA === 0) return 1;
      if (mcB === 0) return -1;
      const cycleA = a.usual_cycle_days != null ? a.usual_cycle_days : 999999;
      const cycleB = b.usual_cycle_days != null ? b.usual_cycle_days : 999999;
      return cycleA - cycleB;
    }
    if (criteria === "frequency_low") {
      // 만남 횟수 0이면 빈도 0 — 맨 앞으로 (가장 낮은 빈도)
      const mcA = a.meeting_count ?? 0;
      const mcB = b.meeting_count ?? 0;
      if (mcA === 0 && mcB === 0) return a.name.localeCompare(b.name, "ko");
      if (mcA === 0) return -1;
      if (mcB === 0) return 1;
      const cycleA = a.usual_cycle_days != null ? a.usual_cycle_days : -1;
      const cycleB = b.usual_cycle_days != null ? b.usual_cycle_days : -1;
      return cycleB - cycleA;
    }
    if (criteria === "meeting_desc") {
      return (b.meeting_count ?? 0) - (a.meeting_count ?? 0);
    }
    if (criteria === "meeting_asc") {
      return (a.meeting_count ?? 0) - (b.meeting_count ?? 0);
    }
    return 0;
  });
}

function updateRelationOptions(persons) {
  const relations = [...new Set(persons.map((p) => p.relation?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  const datalist = document.getElementById("relation-options");
  if (datalist) {
    datalist.innerHTML = relations.map((r) => `<option value="${esc(r)}"></option>`).join("");
  }
  const chipsEl = document.getElementById("person-relation-chips");
  if (chipsEl) {
    chipsEl.innerHTML = relations.map((r) => `
      <button type="button" class="relation-chip" data-fill-relation="${esc(r)}">${esc(r)}</button>
    `).join("");
  }
}

function updateRelationInputAutocomplete(query = "") {
  const dropdown = document.getElementById("add-relation-autocomplete");
  if (!dropdown) return;
  const q = query.trim().toLowerCase();
  const relations = [...new Set(cachedPersons.map((p) => p.relation?.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ko"));

  const matched = q ? relations.filter((r) => r.toLowerCase().includes(q)) : relations;

  if (matched.length === 0) {
    dropdown.style.display = "none";
    return;
  }

  dropdown.innerHTML = matched.map((r) => `
    <div class="autocomplete-item" data-choose-add-relation="${esc(r)}">
      <span>📁 ${esc(r)}</span>
      <span class="autocomplete-item-relation">기존 관계</span>
    </div>
  `).join("");
  dropdown.style.display = "block";
}

async function renderPersons() {
  const persons = await api("/api/persons");
  cachedPersons = persons;
  updateRelationOptions(persons);
  const listEl = document.getElementById("person-list");

  if (persons.length === 0) {
    listEl.innerHTML = `<div class="meta" style="padding:8px 0;">등록된 사람이 없습니다.</div>`;
  } else {
    const groups = {};
    for (const p of persons) {
      const rel = (p.relation && p.relation.trim()) ? p.relation.trim() : "미지정";
      if (!groups[rel]) groups[rel] = [];
      groups[rel].push(p);
    }

    const sortedCategories = Object.keys(groups).sort((a, b) => {
      if (a === "미지정") return 1;
      if (b === "미지정") return -1;
      return a.localeCompare(b, "ko");
    });

    listEl.innerHTML = sortedCategories.map((cat) => {
      const isOpen = !collapsedCategories.has(cat);
      return `
        <details class="category-group" data-cat-name="${esc(cat)}" ${isOpen ? "open" : ""}>
          <summary class="category-title">
            <span class="category-title-left">
              <span class="toggle-arrow">▶</span>
              <span>📁 ${esc(cat)}</span>
            </span>
            <span class="category-count">${groups[cat].length}명</span>
          </summary>
          <ul>
            ${sortPersons(groups[cat], currentPersonSort).map((p) => `
              <li id="person-row-${p.id}">
                <div>
                  <div>
                    <strong>${esc(p.name)}</strong>
                    <span class="badge">주기 ${p.contact_cycle_days ?? 30}일</span>
                  </div>
                  <div class="meta">만남 ${p.meeting_count}회 · 마지막 ${fmtDate(p.last_met_at)}</div>
                </div>
                <div class="actions">
                  <button class="link" data-edit-person="${p.id}">수정</button>
                  <button class="link" data-del-person="${p.id}">삭제</button>
                </div>
              </li>
            `).join("")}
          </ul>
        </details>
      `;
    }).join("");
  }

  // 삭제된 인물이 있으면 선택 목록에서도 제거
  const existingIds = new Set(persons.map((p) => p.id));
  for (const id of selectedPersonIds) {
    if (!existingIds.has(id)) selectedPersonIds.delete(id);
  }
  renderSelectedPeople();
}

function renderSelectedPeople() {
  const container = document.getElementById("selected-people");
  if (!container) return;
  const selectedPersons = cachedPersons.filter((p) => selectedPersonIds.has(p.id));
  if (selectedPersons.length === 0) {
    container.innerHTML = `<span class="meta" style="font-size:12px; padding:2px 0;">선택된 사람 없음 (아래에서 검색해 추가)</span>`;
    return;
  }
  container.innerHTML = selectedPersons.map((p) => `
    <span class="selected-person-chip">
      <span class="chip-name">👤 ${esc(p.name)}</span>
      ${p.relation ? `<span class="chip-rel">(${esc(p.relation)})</span>` : ""}
      <button type="button" class="remove-btn" data-remove-selected="${p.id}" title="제거">✕</button>
    </span>
  `).join("");
}

function updateAutocomplete(query = "") {
  const dropdown = document.getElementById("person-autocomplete");
  if (!dropdown) return;

  const q = query.trim().toLowerCase();
  const unselected = cachedPersons.filter((p) => !selectedPersonIds.has(p.id));

  if (cachedPersons.length === 0) {
    dropdown.innerHTML = `<div class="autocomplete-empty">등록된 사람이 없습니다. 먼저 사람을 추가해 주세요.</div>`;
    dropdown.style.display = "block";
    return;
  }

  const items = [];

  // 1. 관계(카테고리) 일치 검색
  if (q) {
    const matchedRelations = [...new Set(cachedPersons.map((p) => p.relation?.trim()).filter(Boolean))]
      .filter((r) => r.toLowerCase().includes(q));

    for (const rel of matchedRelations) {
      const relPersons = unselected.filter((p) => p.relation?.trim() === rel);
      if (relPersons.length > 0) {
        items.push(`
          <div class="autocomplete-item autocomplete-group-item" data-select-relation="${esc(rel)}">
            <span>👥 '${esc(rel)}' 그룹 전체 추가</span>
            <span class="autocomplete-item-relation">${relPersons.length}명</span>
          </div>
        `);
      }
    }
  }

  // 2. 인물 일치 검색
  const matchedPersons = q
    ? unselected.filter((p) => p.name.toLowerCase().includes(q) || (p.relation && p.relation.toLowerCase().includes(q)))
    : unselected;

  for (const p of matchedPersons.slice(0, 15)) {
    items.push(`
      <div class="autocomplete-item" data-select-person="${p.id}">
        <span class="autocomplete-item-name">👤 ${esc(p.name)}</span>
        <span class="autocomplete-item-relation">${esc(p.relation || "미지정")}</span>
      </div>
    `);
  }

  // 3. 새 인물 바로 등록 옵션
  if (q && !cachedPersons.some((p) => p.name.toLowerCase() === q)) {
    items.push(`
      <div class="autocomplete-item autocomplete-new-item" data-add-new-person="${esc(query.trim())}">
        <span>➕ "<strong>${esc(query.trim())}</strong>" 새로 등록하고 추가</span>
        <span class="autocomplete-item-relation">새 인물</span>
      </div>
    `);
  }

  if (items.length === 0) {
    if (unselected.length === 0) {
      dropdown.innerHTML = `<div class="autocomplete-empty">모든 사람이 이미 선택되었습니다.</div>`;
    } else {
      dropdown.innerHTML = `<div class="autocomplete-empty">일치하는 인물이나 관계가 없습니다.</div>`;
    }
  } else {
    dropdown.innerHTML = items.join("");
  }

  dropdown.style.display = "block";
}

function startEditPerson(id) {
  const p = cachedPersons.find((x) => x.id === Number(id));
  if (!p) return;
  const row = document.getElementById(`person-row-${id}`);
  if (!row) return;

  const existingRelations = [...new Set(cachedPersons.map((x) => x.relation?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));

  row.innerHTML = `
    <form class="edit-form" data-edit-form-id="${p.id}">
      <div class="edit-row">
        <input name="edit_name" value="${esc(p.name)}" placeholder="이름" required title="이름">
        <input name="edit_relation" list="relation-options" value="${esc(p.relation ?? '')}" placeholder="관계(카테고리)" autocomplete="off" title="관계">
        <input name="edit_cycle" type="number" min="1" value="${p.contact_cycle_days ?? 30}" placeholder="주기(일)" title="연락 주기(일)" style="max-width: 85px;">
      </div>
      ${existingRelations.length > 0 ? `
        <div class="relation-chips" style="margin-top: 4px;">
          ${existingRelations.map((r) => `
            <button type="button" class="relation-chip" data-fill-relation="${esc(r)}">${esc(r)}</button>
          `).join("")}
        </div>
      ` : ""}
      <div class="actions" style="justify-content: flex-end; margin-top: 4px;">
        <button type="submit" class="btn-sm">저장</button>
        <button type="button" class="btn-sm" style="background:#888;" data-cancel-edit="${p.id}">취소</button>
      </div>
    </form>
  `;
}

const fmtDateOnly = (s) => {
  if (!s) return "-";
  const d = new Date(s);
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const dow = dayNames[d.getDay()];
  return `${y}년 ${m}월 ${day}일 (${dow})`;
};

const meetingDateKey = (s) => {
  if (!s) return "날짜 없음";
  const d = new Date(s);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const collapsedMeetingDates = new Set();

async function renderMeetings() {
  const allMeetings = await api("/api/meetings");
  cachedMeetings = allMeetings;  // 지도 마커용 캐시
  const listEl = document.getElementById("meeting-list");

  // 날짜 필터 적용
  let meetings = allMeetings;
  if (meetingDateFilter) {
    meetings = allMeetings.filter((m) => meetingDateKey(m.met_at) === meetingDateFilter);
  }

  if (meetings.length === 0) {
    listEl.innerHTML = `<div class="meta" style="padding:8px 0;">${meetingDateFilter ? "해당 날짜의 만남 기록이 없습니다." : "만남 기록이 없습니다."}</div>`;
    return;
  }

  // 날짜별 그룹화
  const groups = {};
  for (const m of meetings) {
    const key = meetingDateKey(m.met_at);
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  }

  // 날짜 내림차순(최신순) 정렬
  const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  listEl.innerHTML = sortedKeys.map((dateKey) => {
    const dayMeetings = groups[dateKey];
    const isOpen = !collapsedMeetingDates.has(dateKey);
    const displayDate = dayMeetings[0]?.met_at ? fmtDateOnly(dayMeetings[0].met_at) : dateKey;
    return `
      <details class="meeting-date-group" data-meeting-date="${esc(dateKey)}" ${isOpen ? "open" : ""}>
        <summary class="meeting-date-title">
          <span class="category-title-left">
            <span class="toggle-arrow">▶</span>
            <span>📅 ${esc(displayDate)}</span>
          </span>
          <span class="category-count">${dayMeetings.length}건</span>
        </summary>
        <ul>
          ${dayMeetings.map((m) => `
            <li>
              <div>
                <strong>${esc(m.place_name ?? "미지정")}</strong>
                <span class="meta">${fmtDate(m.met_at)}</span>
                <div class="meta">${m.people.map((p) => esc(p.name)).join(", ")}</div>
                <div>${esc(m.memo)}</div>
              </div>
              <button class="link" data-del-meeting="${m.id}">삭제</button>
            </li>
          `).join("")}
        </ul>
      </details>
    `;
  }).join("");

  // 지도 마커 갱신
  renderMapMarkers();
}

async function renderDeletedPersons() {
  const deleted = await api("/api/persons/deleted");
  const countEl = document.getElementById("deleted-count");
  if (countEl) countEl.textContent = deleted.length;
  const listEl = document.getElementById("deleted-list");
  if (!listEl) return;

  if (deleted.length === 0) {
    listEl.innerHTML = `<div class="meta" style="padding:8px 0; font-size:12px;">휴지통이 비어 있습니다.</div>`;
    return;
  }

  const now = new Date();
  listEl.innerHTML = deleted.map((p) => {
    const deletedAt = new Date(p.deleted_at);
    const daysPassed = Math.floor((now - deletedAt) / (1000 * 60 * 60 * 24));
    const daysLeft = Math.max(30 - daysPassed, 0);
    return `
      <div class="deleted-item">
        <div class="deleted-info">
          <div>
            <span class="deleted-name">${esc(p.name)}</span>
            ${p.relation ? `<span class="meta">(${esc(p.relation)})</span>` : ""}
          </div>
          <span class="deleted-days">⏱️ ${daysLeft}일 후 자동 완전 삭제</span>
        </div>
        <div class="actions">
          <button type="button" class="btn-restore" data-restore-person="${p.id}" title="원래 목록으로 복구">복구</button>
          <button type="button" class="btn-permanent" data-permanent-delete-person="${p.id}" title="영구 완전 삭제">완전 삭제</button>
        </div>
      </div>
    `;
  }).join("");
}

const refresh = () => Promise.all([renderPersons(), renderMeetings(), renderDeletedPersons()]);

document.getElementById("person-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const name = f.get("name")?.trim();
  const relation = f.get("relation")?.trim() || null;
  const cycleDays = f.get("contact_cycle_days") ? Number(f.get("contact_cycle_days")) : 30;

  if (!name) return;

  // 중복 및 동명이인 검사
  const sameNamePersons = cachedPersons.filter(
    (p) => p.name.trim().toLowerCase() === name.toLowerCase()
  );

  if (sameNamePersons.length > 0) {
    // 1. 이름과 관계가 모두 동일한 완전 중복
    const exactMatch = sameNamePersons.find(
      (p) => (p.relation?.trim() || null) === relation
    );
    if (exactMatch) {
      alert(`⚠️ 이미 등록된 인물입니다.\n이름: ${name}\n관계: ${relation || "미지정"}`);
      return;
    }

    // 2. 이름은 같지만 관계가 다른 동명이인
    const existingRels = sameNamePersons
      .map((p) => p.relation ? `'${p.relation}'` : "'미지정'")
      .join(", ");
    const confirmAdd = confirm(
      `동일한 이름('${name}')의 인물이 이미 등록되어 있습니다.\n(기존 관계: ${existingRels})\n\n새로운 관계('${relation || "미지정"}')의 동명이인으로 새로 추가하시겠습니까?`
    );
    if (!confirmAdd) return;
  }

  try {
    await api("/api/persons", {
      method: "POST",
      body: JSON.stringify({
        name,
        relation,
        contact_cycle_days: cycleDays,
      }),
    });
    e.target.reset();
    refresh();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById("meeting-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const personIds = Array.from(selectedPersonIds);
  if (personIds.length === 0) return alert("함께한 사람을 한 명 이상 선택하세요");
  try {
    const body = {
      met_at: f.get("met_at") || toLocalISOString(),
      place_name: f.get("place_name") || null,
      memo: f.get("memo") || null,
      person_ids: personIds,
    };
    // 장소 좌표가 있으면 함께 전송
    const lat = document.getElementById("place-lat")?.value;
    const lon = document.getElementById("place-lon")?.value;
    if (lat && lon) {
      body.latitude = parseFloat(lat);
      body.longitude = parseFloat(lon);
    }
    await api("/api/meetings", { method: "POST", body: JSON.stringify(body) });
    selectedPersonIds.clear();
    selectedPlace = null;
    renderSelectedPeople();
    const searchInput = document.getElementById("person-search-input");
    if (searchInput) searchInput.value = "";
    document.getElementById("place-lat").value = "";
    document.getElementById("place-lon").value = "";
    e.target.reset();
    initMeetingTime();
    refresh();
  } catch (err) { alert(err.message); }
});

const searchInput = document.getElementById("person-search-input");
if (searchInput) {
  searchInput.addEventListener("input", (e) => updateAutocomplete(e.target.value));
  searchInput.addEventListener("focus", (e) => updateAutocomplete(e.target.value));
}

const addRelInput = document.getElementById("add-relation-input");
if (addRelInput) {
  addRelInput.addEventListener("input", (e) => updateRelationInputAutocomplete(e.target.value));
  addRelInput.addEventListener("focus", (e) => updateRelationInputAutocomplete(e.target.value));
}

const sortSelect = document.getElementById("person-sort-select");
if (sortSelect) {
  sortSelect.addEventListener("change", (e) => {
    currentPersonSort = e.target.value;
    renderPersons();
  });
}

// 만남 기록 날짜 필터
const meetingDateFilterInput = document.getElementById("meeting-date-filter");
if (meetingDateFilterInput) {
  meetingDateFilterInput.addEventListener("change", (e) => {
    meetingDateFilter = e.target.value;
    renderMeetings();
  });
}

document.addEventListener("submit", async (e) => {
  const editFormId = e.target.dataset.editFormId;
  if (!editFormId) return;
  e.preventDefault();
  const f = new FormData(e.target);
  const name = f.get("edit_name").trim();
  const relation = f.get("edit_relation").trim() || null;
  const cycle = f.get("edit_cycle") ? Number(f.get("edit_cycle")) : 30;

  if (!name) return;

  // 수정 시 다른 인물과의 중복/동명이인 검사
  const otherSamePersons = cachedPersons.filter(
    (p) => p.id !== Number(editFormId) && p.name.trim().toLowerCase() === name.toLowerCase()
  );

  if (otherSamePersons.length > 0) {
    const exactMatch = otherSamePersons.find(
      (p) => (p.relation?.trim() || null) === relation
    );
    if (exactMatch) {
      alert(`⚠️ 이미 동일한 인물('${name}', '${relation || "미지정"}')이 등록되어 있습니다.`);
      return;
    }

    const existingRels = otherSamePersons
      .map((p) => p.relation ? `'${p.relation}'` : "'미지정'")
      .join(", ");
    const confirmEdit = confirm(
      `동일한 이름('${name}')의 다른 인물이 이미 등록되어 있습니다.\n(기존 관계: ${existingRels})\n\n동명이인으로 정보를 변경하시겠습니까?`
    );
    if (!confirmEdit) return;
  }

  try {
    await api(`/api/persons/${editFormId}`, {
      method: "PATCH",
      body: JSON.stringify({
        name,
        relation,
        contact_cycle_days: cycle,
      }),
    });
    refresh();
  } catch (err) {
    alert(err.message);
  }
});

document.addEventListener("click", async (e) => {
  // 모두 펼치기 / 접어두기
  if (e.target.id === "btn-expand-all") {
    document.querySelectorAll("details.category-group").forEach((d) => (d.open = true));
    collapsedCategories.clear();
    return;
  }
  if (e.target.id === "btn-collapse-all") {
    document.querySelectorAll("details.category-group").forEach((d) => {
      d.open = false;
      if (d.dataset.catName) collapsedCategories.add(d.dataset.catName);
    });
    return;
  }

  // 만남 기록 날짜 필터 초기화
  if (e.target.id === "btn-meeting-clear-filter") {
    meetingDateFilter = "";
    const dateInput = document.getElementById("meeting-date-filter");
    if (dateInput) dateInput.value = "";
    renderMeetings();
    return;
  }

  // 만남 기록 모두 펼치기 / 모두 접기
  if (e.target.id === "btn-meeting-expand-all") {
    document.querySelectorAll("details.meeting-date-group").forEach((d) => (d.open = true));
    collapsedMeetingDates.clear();
    return;
  }
  if (e.target.id === "btn-meeting-collapse-all") {
    document.querySelectorAll("details.meeting-date-group").forEach((d) => {
      d.open = false;
      if (d.dataset.meetingDate) collapsedMeetingDates.add(d.dataset.meetingDate);
    });
    return;
  }

  // 장소 자동완성 드롭다운 바깥 클릭 시 닫기
  const placeWrapper = e.target.closest("#meeting-form .autocomplete-wrapper");
  const placeDropdown = document.getElementById("place-autocomplete");
  if (!placeWrapper && placeDropdown) {
    placeDropdown.style.display = "none";
  }

  // 장소 자동완성 항목 선택
  const placeItem = e.target.closest("[data-select-place]");
  if (placeItem) {
    const name = placeItem.dataset.placeName;
    const lat = placeItem.dataset.placeLat;
    const lon = placeItem.dataset.placeLon;
    const placeInput = document.getElementById("place-search-input");
    if (placeInput) placeInput.value = name;
    document.getElementById("place-lat").value = lat;
    document.getElementById("place-lon").value = lon;
    selectedPlace = { name, lat: parseFloat(lat), lon: parseFloat(lon) };
    if (placeDropdown) placeDropdown.style.display = "none";
    return;
  }

  // 사람 추가 관계 자동완성 드롭다운 바깥 클릭 시 닫기
  const addRelWrapper = e.target.closest("#person-form .autocomplete-wrapper");
  const addRelDropdown = document.getElementById("add-relation-autocomplete");
  if (!addRelWrapper && addRelDropdown) {
    addRelDropdown.style.display = "none";
  }

  // 사람 추가 관계 자동완성 선택
  const chooseRel = e.target.closest("[data-choose-add-relation]")?.dataset.chooseAddRelation;
  if (chooseRel) {
    const input = document.getElementById("add-relation-input");
    if (input) {
      input.value = chooseRel;
      input.focus();
    }
    if (addRelDropdown) addRelDropdown.style.display = "none";
    return;
  }

  // 만남 기록 함께한 사람 자동완성 드롭다운 외부 클릭 시 닫기
  const wrapper = e.target.closest(".people-picker-box .autocomplete-wrapper");
  const dropdown = document.getElementById("person-autocomplete");
  if (!wrapper && dropdown) {
    dropdown.style.display = "none";
  }

  // 자동완성: 개별 인물 선택
  const selectPersonId = e.target.closest("[data-select-person]")?.dataset.selectPerson;
  if (selectPersonId) {
    selectedPersonIds.add(Number(selectPersonId));
    const sInput = document.getElementById("person-search-input");
    if (sInput) { sInput.value = ""; sInput.focus(); }
    if (dropdown) dropdown.style.display = "none";
    renderSelectedPeople();
    return;
  }

  // 자동완성: 관계(그룹) 전체 선택
  const selectRelation = e.target.closest("[data-select-relation]")?.dataset.selectRelation;
  if (selectRelation) {
    const targets = cachedPersons.filter((p) => p.relation?.trim() === selectRelation);
    for (const t of targets) selectedPersonIds.add(t.id);
    const sInput = document.getElementById("person-search-input");
    if (sInput) { sInput.value = ""; sInput.focus(); }
    if (dropdown) dropdown.style.display = "none";
    renderSelectedPeople();
    return;
  }

  // 자동완성: 새 인물 바로 등록하고 추가
  const addNewPersonName = e.target.closest("[data-add-new-person]")?.dataset.addNewPerson;
  if (addNewPersonName) {
    const name = addNewPersonName.trim();
    const sameNamePersons = cachedPersons.filter(
      (p) => p.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (sameNamePersons.length > 0) {
      const existingRels = sameNamePersons
        .map((p) => p.relation ? `'${p.relation}'` : "'미지정'")
        .join(", ");
      const confirmAdd = confirm(
        `동일한 이름('${name}')의 인물이 이미 등록되어 있습니다.\n(기존 관계: ${existingRels})\n\n동명이인으로 새로 등록하고 추가하시겠습니까?`
      );
      if (!confirmAdd) return;
    }
    try {
      const newPerson = await api("/api/persons", {
        method: "POST",
        body: JSON.stringify({ name, contact_cycle_days: 30 })
      });
      cachedPersons.push(newPerson);
      selectedPersonIds.add(newPerson.id);
      const sInput = document.getElementById("person-search-input");
      if (sInput) { sInput.value = ""; }
      if (dropdown) dropdown.style.display = "none";
      renderSelectedPeople();
      renderPersons();
    } catch (err) {
      alert(err.message);
    }
    return;
  }

  // 선택된 사람 태그 제거
  const removeSelectedId = e.target.closest("[data-remove-selected]")?.dataset.removeSelected;
  if (removeSelectedId) {
    selectedPersonIds.delete(Number(removeSelectedId));
    renderSelectedPeople();
    return;
  }

  // 삭제된 인물 복구
  const restorePersonId = e.target.closest("[data-restore-person]")?.dataset.restorePerson;
  if (restorePersonId) {
    try {
      await api(`/api/persons/${restorePersonId}/restore`, { method: "POST" });
      refresh();
    } catch (err) {
      alert(err.message);
    }
    return;
  }

  // 삭제된 인물 영구 완전 삭제
  const permDeleteId = e.target.closest("[data-permanent-delete-person]")?.dataset.permanentDeletePerson;
  if (permDeleteId) {
    if (confirm("이 인물을 완전히 삭제하시겠습니까?\n모든 기록에서 영구적으로 삭제되며 복구할 수 없습니다.")) {
      try {
        await api(`/api/persons/${permDeleteId}/permanent`, { method: "DELETE" });
        refresh();
      } catch (err) {
        alert(err.message);
      }
    }
    return;
  }

  const fillRel = e.target.closest("[data-fill-relation]")?.dataset.fillRelation;
  if (fillRel) {
    const form = e.target.closest("form");
    if (form) {
      const input = form.querySelector('input[name="relation"], input[name="edit_relation"]');
      if (input) {
        input.value = fillRel;
        input.focus();
      }
    }
    return;
  }

  const { delPerson, delMeeting, editPerson, cancelEdit } = e.target.dataset;
  if (delPerson && confirm("이 인물을 삭제하시겠습니까?\n삭제된 인물은 아래 '삭제한 인물' 칸(휴지통)으로 이동하며, 30일간 보관 후 자동 완전 삭제됩니다.")) {
    await api(`/api/persons/${delPerson}`, { method: "DELETE" });
    refresh();
  } else if (delMeeting && confirm("이 기록을 삭제할까요?")) {
    await api(`/api/meetings/${delMeeting}`, { method: "DELETE" });
    refresh();
  } else if (editPerson) {
    startEditPerson(editPerson);
  } else if (cancelEdit) {
    renderPersons();
  }
});

document.addEventListener("toggle", (e) => {
  if (e.target.matches("details.category-group")) {
    const cat = e.target.dataset.catName;
    if (!cat) return;
    if (e.target.open) {
      collapsedCategories.delete(cat);
    } else {
      collapsedCategories.add(cat);
    }
  }
  // 만남 기록 날짜 그룹 접기/펼치기 상태 유지
  if (e.target.matches("details.meeting-date-group")) {
    const dateKey = e.target.dataset.meetingDate;
    if (!dateKey) return;
    if (e.target.open) {
      collapsedMeetingDates.delete(dateKey);
    } else {
      collapsedMeetingDates.add(dateKey);
    }
  }
}, true);

initMeetingTime();

// ─── 장소 검색 자동완성 ─────────────────────────────────────
const placeSearchInput = document.getElementById("place-search-input");
if (placeSearchInput) {
  placeSearchInput.addEventListener("input", (e) => {
    const q = e.target.value.trim();
    // 사용자가 직접 타이핑하면 좌표 초기화
    document.getElementById("place-lat").value = "";
    document.getElementById("place-lon").value = "";
    selectedPlace = null;

    clearTimeout(placeSearchTimer);
    if (q.length < 2) {
      const dd = document.getElementById("place-autocomplete");
      if (dd) dd.style.display = "none";
      return;
    }
    // 300ms 디바운스
    placeSearchTimer = setTimeout(() => searchPlaces(q), 300);
  });
  placeSearchInput.addEventListener("focus", (e) => {
    const q = e.target.value.trim();
    if (q.length >= 2) searchPlaces(q);
  });
}

async function searchPlaces(query) {
  const dropdown = document.getElementById("place-autocomplete");
  if (!dropdown) return;
  try {
    const places = await api(`/api/places/search?query=${encodeURIComponent(query)}&limit=8`);
    if (places.length === 0) {
      dropdown.innerHTML = `<div class="autocomplete-empty">검색 결과가 없습니다.</div>`;
    } else {
      dropdown.innerHTML = places.map((p) => `
        <div class="autocomplete-item" data-select-place
             data-place-name="${esc(p.name)}"
             data-place-lat="${p.latitude}"
             data-place-lon="${p.longitude}">
          <div>
            <span class="autocomplete-item-name">📍 ${esc(p.name)}</span>
            ${p.address ? `<div class="meta" style="font-size:11px; margin-top:2px;">${esc(p.address)}</div>` : ""}
          </div>
          ${p.category ? `<span class="autocomplete-item-relation">${esc(p.category)}</span>` : ""}
        </div>
      `).join("");
    }
    dropdown.style.display = "block";
  } catch (err) {
    dropdown.innerHTML = `<div class="autocomplete-empty">장소 검색 실패: ${esc(err.message)}</div>`;
    dropdown.style.display = "block";
  }
}

// ─── 카카오맵 지도 초기화 ────────────────────────────────────
async function initKakaoMap() {
  try {
    const config = await api("/api/config");
    if (!config.kakaoJsKey) {
      document.getElementById("map").innerHTML = `<div class="map-placeholder-msg">카카오맵 JS 키가 설정되지 않았습니다.</div>`;
      return;
    }
    // SDK 동적 로드
    await new Promise((resolve, reject) => {
      if (window.kakao && window.kakao.maps) { resolve(); return; }
      const script = document.createElement("script");

      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${config.kakaoJsKey}&autoload=false`;
      script.onload = () => {
        window.kakao.maps.load(resolve);
      };
      script.onerror = () => reject(new Error("카카오맵 SDK 로드 실패"));
      document.head.appendChild(script);
    });

    const mapEl = document.getElementById("map");
    kakaoMap = new kakao.maps.Map(mapEl, {
      center: new kakao.maps.LatLng(37.5665, 126.9780), // 서울시청 기본
      level: 8,
    });
    // 지도 크기 변경 시 자동 리사이즈
    new ResizeObserver(() => kakaoMap.relayout()).observe(mapEl);

    renderMapMarkers();
  } catch (err) {
    console.warn("카카오맵 초기화 실패:", err);
    document.getElementById("map").innerHTML = `<div class="map-placeholder-msg">지도를 불러올 수 없습니다.<br><span class="meta">${esc(err.message)}</span></div>`;
  }
}

function renderMapMarkers() {
  if (!kakaoMap) return;

  // 기존 마커 제거
  for (const m of kakaoMarkers) m.setMap(null);
  kakaoMarkers = [];

  const meetings = cachedMeetings.filter((m) => m.latitude && m.longitude);
  if (meetings.length === 0) return;

  const bounds = new kakao.maps.LatLngBounds();

  for (const m of meetings) {
    const pos = new kakao.maps.LatLng(m.latitude, m.longitude);
    bounds.extend(pos);

    const marker = new kakao.maps.Marker({ map: kakaoMap, position: pos });
    const peopleNames = m.people.map((p) => p.name).join(", ");
    const infoContent = `
      <div style="padding:6px 10px; font-size:12px; max-width:220px; line-height:1.5;">
        <strong>${esc(m.place_name || "미지정")}</strong><br>
        <span style="color:#777;">${fmtDate(m.met_at)}</span><br>
        <span>👥 ${esc(peopleNames)}</span>
        ${m.memo ? `<br><span style="color:#555;">${esc(m.memo).substring(0, 50)}</span>` : ""}
      </div>
    `;
    const infowindow = new kakao.maps.InfoWindow({ content: infoContent });
    kakao.maps.event.addListener(marker, "click", () => {
      infowindow.open(kakaoMap, marker);
    });
    kakaoMarkers.push(marker);
  }

  kakaoMap.setBounds(bounds);
}

refresh();

// 카카오맵 초기화 (네트워크 필요 — 비동기)
initKakaoMap();
