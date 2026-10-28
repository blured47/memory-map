const api = async (path, options = {}) => {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  if (!res.ok) throw new Error((await res.json()).detail ?? res.statusText);
  return res.status === 204 ? null : res.json();
};

const fmtDate = (s) => (s ? new Date(s).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" }) : "-");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function renderPersons() {
  const persons = await api("/api/persons");
  document.getElementById("person-list").innerHTML = persons.map((p) => `
    <li>
      <div><strong>${esc(p.name)}</strong> <span class="meta">${esc(p.relation)}</span>
        <div class="meta">만남 ${p.meeting_count}회 · 마지막 ${fmtDate(p.last_met_at)}</div></div>
      <button class="link" data-del-person="${p.id}">삭제</button>
    </li>`).join("");
  document.getElementById("people-picker").innerHTML = "<legend>함께한 사람</legend>" + persons.map((p) => `
    <label><input type="checkbox" name="person_ids" value="${p.id}"> ${esc(p.name)}</label>`).join("");
}

async function renderMeetings() {
  const meetings = await api("/api/meetings");
  document.getElementById("meeting-list").innerHTML = meetings.map((m) => `
    <li>
      <div><strong>${esc(m.place_name ?? "미지정")}</strong> <span class="meta">${fmtDate(m.met_at)}</span>
        <div class="meta">${m.people.map((p) => esc(p.name)).join(", ")}</div>
        <div>${esc(m.memo)}</div></div>
      <button class="link" data-del-meeting="${m.id}">삭제</button>
    </li>`).join("");
}

const refresh = () => Promise.all([renderPersons(), renderMeetings()]);

document.getElementById("person-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  await api("/api/persons", { method: "POST", body: JSON.stringify({
    name: f.get("name"),
    relation: f.get("relation") || null,
    contact_cycle_days: f.get("contact_cycle_days") ? Number(f.get("contact_cycle_days")) : null,
  }) });
  e.target.reset();
  refresh();
});

document.getElementById("meeting-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const personIds = f.getAll("person_ids").map(Number);
  if (personIds.length === 0) return alert("함께한 사람을 한 명 이상 선택하세요");
  try {
    await api("/api/meetings", { method: "POST", body: JSON.stringify({
      met_at: f.get("met_at"),
      place_name: f.get("place_name") || null,
      memo: f.get("memo") || null,
      person_ids: personIds,
    }) });
    e.target.reset();
    refresh();
  } catch (err) { alert(err.message); }
});

document.addEventListener("click", async (e) => {
  const { delPerson, delMeeting } = e.target.dataset;
  if (delPerson && confirm("이 사람을 삭제할까요?")) await api(`/api/persons/${delPerson}`, { method: "DELETE" });
  else if (delMeeting && confirm("이 기록을 삭제할까요?")) await api(`/api/meetings/${delMeeting}`, { method: "DELETE" });
  else return;
  refresh();
});

refresh();
