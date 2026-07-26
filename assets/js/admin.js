import { buildMaster } from "./master.js";
import { mergeResults } from "./merge.js";
import { buildCsv } from "./csv.js";
import { rowsToFiles } from "./cloud.js";
import { SUPABASE_URL, SUPABASE_KEY, EMAIL_DOMAIN } from "./config.js";

const $ = (id) => document.getElementById(id);
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let master = null; // master aktif (dari hosting atau hasil olah baru)
let mergedFiles = []; // bentuk "file hasil" (dari DB atau upload)
let resolutions = {};

const splitList = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
const download = (name, text, type) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
};

// ---------- auth ----------

async function isAdmin() {
  const { data } = await sb.auth.getSession();
  return data.session?.user?.app_metadata?.role === "admin";
}

$("loginBtn").onclick = async () => {
  const username = $("loginUser").value.trim().toLowerCase();
  const password = $("loginPass").value;
  if (!username || !password) return;
  $("loginError").textContent = "";
  const email = username.includes("@") ? username : `${username}@${EMAIL_DOMAIN}`;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    $("loginError").textContent = "Gagal masuk: username/password salah.";
    return;
  }
  if (!(await isAdmin())) {
    await sb.auth.signOut();
    $("loginError").textContent = "Akun ini bukan admin.";
    return;
  }
  showApp(true);
};

$("logoutBtn").onclick = async () => {
  await sb.auth.signOut();
  showApp(false);
};

function showApp(loggedIn) {
  $("loginView").classList.toggle("hidden", loggedIn);
  $("appView").classList.toggle("hidden", !loggedIn);
}

async function init() {
  $("dbDate").value = new Date().toISOString().slice(0, 10);
  try {
    master = await (await fetch("master.json", { cache: "no-cache" })).json();
    $("racksInput").value = master.racks.join(", ");
    $("employeesInput").value = master.employees.join(", ");
    $("masterSummary").textContent = `Master aktif: versi ${master.version}, ${master.products.length} produk (sumber ${master.source}).`;
  } catch {
    $("masterSummary").textContent = "master.json belum ada di hosting — olah xlsx dulu.";
  }
  showApp(await isAdmin());
}

// ---------- tambah akun karyawan ----------

$("createUserBtn").onclick = async () => {
  const username = $("newUser").value.trim().toLowerCase();
  const password = $("newPass").value;
  $("createUserMsg").textContent = "Membuat akun...";
  const { data, error } = await sb.functions.invoke("create-employee", { body: { username, password } });
  if (error) {
    let detail = error.message;
    try { detail = (await error.context.json()).error ?? detail; } catch {}
    $("createUserMsg").textContent = `❌ ${detail}`;
    return;
  }
  $("createUserMsg").textContent = `✅ Akun "${data.username}" jadi. Kasih username+password ke karyawannya, lalu tambahkan namanya ke Daftar karyawan di atas.`;
  $("newUser").value = "";
  $("newPass").value = "";
};

$("tabMasterBtn").onclick = () => setTab(true);
$("tabGabungBtn").onclick = () => setTab(false);
function setTab(m) {
  $("masterTab").classList.toggle("hidden", !m);
  $("gabungTab").classList.toggle("hidden", m);
  $("tabMasterBtn").className = m ? "" : "secondary";
  $("tabGabungBtn").className = m ? "secondary" : "";
}

// ---------- tab Master ----------

$("xlsxInput").onchange = async () => {
  const f = $("xlsxInput").files[0];
  if (!f) return;
  const wb = XLSX.read(await f.arrayBuffer());
  const sheet = wb.Sheets["Bahan Resep (auto)"];
  if (!sheet) {
    alert(`Sheet "Bahan Resep (auto)" tidak ada di file ini. Sheet tersedia: ${wb.SheetNames.join(", ")}`);
    return;
  }
  const tSheet = wb.Sheets["template baru (auto)"];
  if (!tSheet) alert('Sheet "template baru (auto)" tidak ada — kolom sku akan kosong.');
  const { products, warnings } = buildMaster(
    XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }),
    tSheet ? XLSX.utils.sheet_to_json(tSheet, { header: 1, raw: true }) : undefined
  );
  master = {
    version: new Date().toISOString().slice(0, 16),
    source: f.name,
    racks: splitList($("racksInput").value),
    employees: splitList($("employeesInput").value),
    products,
  };
  $("masterSummary").innerHTML =
    `Berhasil: <b>${products.length} produk</b>, ${warnings.length} peringatan.` +
    (warnings.length
      ? `<br>Produk bermasalah (perbaiki di Olsera):<br>` + warnings.map((w) => `• ${w.name} — ${w.problem}`).join("<br>")
      : "");
};

$("downloadMasterBtn").onclick = () => {
  if (!master) {
    alert("Olah xlsx dulu atau tunggu master dari hosting termuat.");
    return;
  }
  master.racks = splitList($("racksInput").value);
  master.employees = splitList($("employeesInput").value);
  download("master.json", JSON.stringify(master, null, 1), "application/json");
};

// ---------- tab Gabung ----------

$("fetchDbBtn").onclick = async () => {
  const d = $("dbDate").value;
  if (!d) return;
  const from = `${d}T00:00:00`;
  const to = `${d}T23:59:59`;
  $("mergeReport").textContent = "Memuat dari pusat...";
  const [items, notes] = await Promise.all([
    sb.from("so_items").select("*").gte("created_at", from).lte("created_at", to).order("created_at"),
    sb.from("so_notes").select("*").gte("created_at", from).lte("created_at", to).order("created_at"),
  ]);
  if (items.error || notes.error) {
    $("mergeReport").textContent = `Gagal memuat: ${(items.error ?? notes.error).message}`;
    return;
  }
  mergedFiles = rowsToFiles(items.data, notes.data);
  resolutions = {};
  renderMerge(`dari database (${items.data.length} item, tanggal ${d})`);
};

$("resultsInput").onchange = async () => {
  mergedFiles = [];
  resolutions = {};
  for (const f of $("resultsInput").files) {
    try {
      const data = JSON.parse(await f.text());
      if (!data.rack || !Array.isArray(data.items)) throw new Error("bukan file hasil SO");
      mergedFiles.push(data);
    } catch (e) {
      alert(`File ${f.name} dilewati: ${e.message}`);
    }
  }
  renderMerge(`dari ${$("resultsInput").files.length} file upload`);
};

function renderMerge(sourceLabel) {
  if (!master) {
    $("mergeReport").textContent = "Master belum termuat.";
    return;
  }
  const r = mergeResults(mergedFiles, master, resolutions);
  const cov = r.rackCoverage.filter((x) => !x.counted).map((x) => x.rack);
  let html = `<p><b>${r.rows.length} baris</b> ${sourceLabel}.</p>`;
  html += `<p>Per rak: ${Object.entries(r.perRack).map(([k, v]) => `${k}=${v}`).join(", ") || "-"}<br>`;
  html += `Per karyawan: ${Object.entries(r.perEmployee).map(([k, v]) => `${k}=${v}`).join(", ") || "-"}</p>`;
  if (cov.length) html += `<p>⚠️ Rak belum ada hasil: <b>${cov.join(", ")}</b></p>`;
  if (r.versionMismatches.length)
    html += `<p>⚠️ Versi master beda: ${r.versionMismatches.map((v) => `${v.employee}/${v.rack} (${v.version})`).join(", ")}</p>`;
  if (r.unknownProducts.length)
    html += `<p>⚠️ Produk tak dikenal (TIDAK masuk CSV): ${r.unknownProducts.map((u) => `${u.product} [${u.rack}]`).join(", ")}</p>`;
  if (r.notes.length) html += `<p>📝 Catatan manual:<br>${r.notes.map((n) => `• [${n.rack}/${n.employee}] ${n.text} (±${n.qty})`).join("<br>")}</p>`;
  for (const d of r.duplicates) {
    html += `<p>⚠️ Duplikat <b>${d.product}</b> di ${d.rack} (beda karyawan): ` +
      `<button data-key="${encodeURIComponent(d.key)}" data-how="sum" class="secondary">Jumlahkan</button> ` +
      `<button data-key="${encodeURIComponent(d.key)}" data-how="last" class="secondary">Pakai terakhir</button></p>`;
  }
  $("mergeReport").innerHTML = html;
  for (const b of $("mergeReport").querySelectorAll("button[data-key]")) {
    b.onclick = () => {
      resolutions[decodeURIComponent(b.dataset.key)] = b.dataset.how;
      renderMerge(sourceLabel);
    };
  }
  $("downloadCsvBtn").disabled = r.rows.length === 0 || r.duplicates.length > 0;
  $("downloadCsvBtn").onclick = () =>
    download(`SO_Olsera_${new Date().toISOString().slice(0, 10)}.csv`, buildCsv(r.rows, $("soTime").value), "text/csv");
}

init();
