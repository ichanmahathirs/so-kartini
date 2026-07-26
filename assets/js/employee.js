import { totalBase } from "./convert.js";
import { createStore } from "./store.js";
import { createOutbox } from "./cloud.js";
import { SUPABASE_URL, SUPABASE_KEY, EMAIL_DOMAIN } from "./config.js";

const $ = (id) => document.getElementById(id);
const store = createStore(localStorage);
const outbox = createOutbox(localStorage);
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let master = null;
let current = null; // produk yang sedang diinput
let me = null; // { name }

// ---------- sinkronisasi cloud ----------

async function pushItem(it) {
  if (it._delete) {
    const { error } = await sb.from("so_items").delete().match({ rack: it.rack, product: it.product });
    if (error) throw error;
    return;
  }
  const { error } = await sb.from("so_items").upsert(
    {
      employee: me.name,
      rack: it.rack,
      product: it.product,
      counts: it.counts,
      qty_base: it.qtyBase,
      expired_date: it.expiredDate || null,
      master_version: master?.version ?? "",
    },
    { onConflict: "user_id,rack,product" }
  );
  if (error) throw error;
}

async function pushNote(n) {
  const { error } = await sb.from("so_notes").insert({ employee: me.name, rack: n.rack, note: n.note, qty: n.qty ?? 0 });
  if (error) throw error;
}

async function sync() {
  if (!me) return;
  await outbox.flush({ pushItem, pushNote });
  renderSync();
}

function renderSync() {
  const n = outbox.pending().count;
  const el = $("syncStatus");
  el.textContent = n === 0 ? "✓ tersinkron ke pusat" : `⏳ ${n} menunggu sinyal — jangan tutup dulu`;
  el.style.color = n === 0 ? "#2e7d32" : "#b3261e";
}

function queue(op) {
  outbox.enqueueItem(op);
  sync();
}

window.addEventListener("online", sync);
setInterval(sync, 30000);

// ---------- auth ----------

async function whoAmI() {
  const { data } = await sb.auth.getSession();
  const email = data.session?.user?.email;
  return email ? { name: email.split("@")[0] } : null;
}

$("loginBtn").onclick = async () => {
  const username = $("loginUser").value.trim().toLowerCase();
  const password = $("loginPass").value;
  if (!username || !password) return;
  $("loginError").textContent = "";
  const { error } = await sb.auth.signInWithPassword({ email: `${username}@${EMAIL_DOMAIN}`, password });
  if (error) {
    $("loginError").textContent = "Gagal masuk: username/password salah (atau belum ada sinyal).";
    return;
  }
  me = await whoAmI();
  show("setup");
};

$("logoutBtn").onclick = async () => {
  if (outbox.pending().count > 0 && !confirm("Masih ada data belum tersinkron. Tetap keluar?")) return;
  await sb.auth.signOut();
  me = null;
  show("login");
};

// ---------- tampilan ----------

function show(view) {
  $("loginView").classList.toggle("hidden", view !== "login");
  $("setupView").classList.toggle("hidden", view !== "setup");
  $("countView").classList.toggle("hidden", view !== "count");
  if (view === "setup") $("whoami").textContent = me.name;
}

async function loadMaster() {
  try {
    const res = await fetch("master.json", { cache: "no-cache" });
    master = await res.json();
    localStorage.setItem("so-kartini-master", JSON.stringify(master));
  } catch {
    const cached = localStorage.getItem("so-kartini-master");
    if (!cached) {
      alert("Data master gagal dimuat dan belum ada salinan. Butuh internet sekali di HP ini.");
      return;
    }
    master = JSON.parse(cached);
  }
  $("masterVersion").textContent = `master ${master.version}`;
  fillSelect($("rackSelect"), master.racks);
  me = await whoAmI();
  if (!me) {
    show("login");
    return;
  }
  const s = store.getSession();
  if (s?.rack) {
    $("rackSelect").value = s.rack;
    showCount();
  } else {
    show("setup");
  }
  sync();
}

function fillSelect(el, list) {
  el.innerHTML = list.map((x) => `<option>${x}</option>`).join("");
}

function session() {
  return store.getSession();
}

function showCount() {
  show("count");
  const s = session();
  $("sessionInfo").textContent = `${me.name} · ${s.rack}`;
  renderList();
  renderSync();
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
  store.setSession({ employee: me.name, rack: $("rackSelect").value });
  showCount();
};
$("changeRackBtn").onclick = () => show("setup");

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
  outbox.enqueueNote({ rack: session().rack, note: text, qty });
  sync();
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
  const item = { product: current.name, counts: readCounts(), qtyBase, expiredDate: $("entryEd").value, rack: s.rack };
  store.saveItem(s.rack, item);
  queue(item);
  $("entryCard").classList.add("hidden");
  current = null;
  renderList();
};
$("entryCancelBtn").onclick = () => {
  const s = session();
  if (current && store.hasItem(s.rack, current.name) && confirm(`Hapus ${current.name} dari daftar?`)) {
    store.removeItem(s.rack, current.name);
    queue({ product: current.name, rack: s.rack, _delete: true });
    renderList();
  }
  $("entryCard").classList.add("hidden");
  current = null;
};

$("exportBtn").onclick = async () => {
  const s = session();
  const data = store.exportRack(s.rack, {
    masterVersion: master.version,
    employee: me.name,
    exportedAt: new Date().toISOString(),
  });
  if (!data.items.length && !data.notes.length) {
    alert("Belum ada item di rak ini.");
    return;
  }
  const name = `SO_${s.rack}_${me.name}_${new Date().toISOString().slice(0, 10)}.json`.replace(/\s+/g, "-");
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
  if (outbox.pending().count > 0) {
    alert("Masih ada data belum tersinkron. Tunggu ✓ dulu.");
    return;
  }
  if (confirm("Bersihkan data hitungan di HP ini? (Data di pusat TIDAK terhapus)") && confirm("Yakin?")) {
    store.clearAll();
    location.reload();
  }
};

loadMaster();
