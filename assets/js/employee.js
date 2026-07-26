import { totalBase } from "./convert.js";
import { createStore } from "./store.js";

const $ = (id) => document.getElementById(id);
const store = createStore(localStorage);
let master = null;
let current = null; // produk yang sedang diinput

async function loadMaster() {
  try {
    const res = await fetch("master.json", { cache: "no-cache" });
    master = await res.json();
    localStorage.setItem("so-kartini-master", JSON.stringify(master));
  } catch {
    const cached = localStorage.getItem("so-kartini-master");
    if (!cached) {
      alert("Data master gagal dimuat dan belum ada salinan. Hubungi admin, butuh internet sekali.");
      return;
    }
    master = JSON.parse(cached);
  }
  $("masterVersion").textContent = `master ${master.version}`;
  fillSelect($("employeeSelect"), master.employees);
  fillSelect($("rackSelect"), master.racks);
  const s = store.getSession();
  if (s) {
    $("employeeSelect").value = s.employee;
    $("rackSelect").value = s.rack;
    showCount();
  }
}

function fillSelect(el, list) {
  el.innerHTML = list.map((x) => `<option>${x}</option>`).join("");
}

function session() {
  return store.getSession();
}

function showCount() {
  $("setupView").classList.add("hidden");
  $("countView").classList.remove("hidden");
  const s = session();
  $("sessionInfo").textContent = `${s.employee} · ${s.rack}`;
  renderList();
}

function renderList() {
  const s = session();
  const items = store.listItems(s.rack);
  const notes = store.listNotes(s.rack);
  $("itemCount").textContent = `${items.length} item`;
  $("resultList").innerHTML =
    items
      .map(
        (it, i) =>
          `<div class="list-item" data-i="${i}"><span>${it.product}</span><strong>${it.qtyBase}</strong></div>`
      )
      .join("") +
    notes.map((n) => `<div class="list-item muted"><span>📝 ${n.text}</span><span>${n.qty ?? ""}</span></div>`).join("");
  for (const el of $("resultList").querySelectorAll(".list-item[data-i]")) {
    el.onclick = () => openEntry(store.listItems(session().rack)[Number(el.dataset.i)].product);
  }
}

function search(q) {
  q = q.trim().toLowerCase();
  if (q.length < 2) return [];
  return master.products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 12);
}

function openEntry(name) {
  const p = master.products.find((x) => x.name === name);
  if (!p) return;
  current = p;
  const existing = store.listItems(session().rack).find((x) => x.product === name);
  $("entryProduct").textContent = p.name;
  $("variantInputs").innerHTML = p.variants
    .map(
      (v, i) =>
        `<div class="variant-row"><span>${v.label} <span class="muted">×${v.factor}</span></span>` +
        `<input type="number" inputmode="decimal" min="0" step="any" data-label="${encodeURIComponent(v.label)}" id="vq${i}" value="${existing?.counts?.[v.label] ?? ""}"></div>`
    )
    .join("");
  $("entryEd").value = existing?.expiredDate ?? "";
  for (const inp of $("variantInputs").querySelectorAll("input")) inp.oninput = updateTotal;
  updateTotal();
  $("entryCard").classList.remove("hidden");
  $("searchResults").innerHTML = "";
  $("searchInput").value = "";
  $("manualBtn").classList.add("hidden");
}

function readCounts() {
  const counts = {};
  for (const inp of $("variantInputs").querySelectorAll("input")) {
    counts[decodeURIComponent(inp.dataset.label)] = inp.value;
  }
  return counts;
}

function updateTotal() {
  try {
    $("entryTotal").textContent = totalBase(readCounts(), current.variants);
  } catch (e) {
    $("entryTotal").textContent = "⚠️ " + e.message;
  }
}

$("startBtn").onclick = () => {
  store.setSession({ employee: $("employeeSelect").value, rack: $("rackSelect").value });
  showCount();
};
$("changeRackBtn").onclick = () => {
  $("countView").classList.add("hidden");
  $("setupView").classList.remove("hidden");
};

$("searchInput").oninput = () => {
  const hits = search($("searchInput").value);
  $("searchResults").innerHTML = hits.map((p) => `<div>${p.name}</div>`).join("");
  [...$("searchResults").children].forEach((el, i) => (el.onclick = () => openEntry(hits[i].name)));
  $("manualBtn").classList.toggle("hidden", $("searchInput").value.trim().length < 2);
};

$("manualBtn").onclick = () => {
  const text = prompt("Tulis nama/ciri barang yang tidak ada di daftar:", $("searchInput").value);
  if (!text) return;
  const qty = Number(prompt("Perkiraan jumlah (angka saja):", "1")) || 0;
  store.addNote(session().rack, { text, qty });
  $("searchInput").value = "";
  $("searchResults").innerHTML = "";
  renderList();
};

$("entrySaveBtn").onclick = () => {
  let qtyBase;
  try {
    qtyBase = totalBase(readCounts(), current.variants);
  } catch (e) {
    alert(e.message);
    return;
  }
  const s = session();
  if (store.hasItem(s.rack, current.name)) {
    const prev = store.listItems(s.rack).find((x) => x.product === current.name);
    if (!confirm(`${current.name} sudah tercatat ${prev.qtyBase} di ${s.rack}. Timpa dengan ${qtyBase}?`)) return;
  }
  store.saveItem(s.rack, { product: current.name, counts: readCounts(), qtyBase, expiredDate: $("entryEd").value });
  $("entryCard").classList.add("hidden");
  current = null;
  renderList();
};
$("entryCancelBtn").onclick = () => {
  if (current && store.hasItem(session().rack, current.name) && confirm(`Hapus ${current.name} dari daftar?`)) {
    store.removeItem(session().rack, current.name);
    renderList();
  }
  $("entryCard").classList.add("hidden");
  current = null;
};

$("exportBtn").onclick = async () => {
  const s = session();
  const data = store.exportRack(s.rack, {
    masterVersion: master.version,
    employee: s.employee,
    exportedAt: new Date().toISOString(),
  });
  if (!data.items.length && !data.notes.length) {
    alert("Belum ada item di rak ini.");
    return;
  }
  const name = `SO_${s.rack}_${s.employee}_${new Date().toISOString().slice(0, 10)}.json`.replace(/\s+/g, "-");
  const file = new File([JSON.stringify(data, null, 1)], name, { type: "application/json" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: name }).catch(() => {});
  } else {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
  }
};

$("resetBtn").onclick = () => {
  if (confirm("Hapus SEMUA data hitungan di HP ini?") && confirm("Yakin? Data yang belum dikirim akan hilang.")) {
    store.clearAll();
    location.reload();
  }
};

loadMaster();
