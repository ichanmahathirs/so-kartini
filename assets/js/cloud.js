const OUTBOX_KEY = "so-kartini-outbox-v1";

export function createOutbox(storage) {
  const load = () => JSON.parse(storage.getItem(OUTBOX_KEY) ?? '{"items":[],"notes":[]}');
  const save = (s) => storage.setItem(OUTBOX_KEY, JSON.stringify(s));
  return {
    enqueueItem(item) {
      const s = load();
      const i = s.items.findIndex((x) => x.product === item.product && x.rack === item.rack);
      if (i >= 0) s.items[i] = item;
      else s.items.push(item);
      save(s);
    },
    enqueueNote(note) {
      const s = load();
      s.notes.push(note);
      save(s);
    },
    pending() {
      const s = load();
      return { items: s.items, notes: s.notes, count: s.items.length + s.notes.length };
    },
    async flush({ pushItem, pushNote }) {
      const s = load();
      let sent = 0;
      let failed = 0;
      const keepItems = [];
      for (const it of s.items) {
        try {
          await pushItem(it);
          sent++;
        } catch {
          failed++;
          keepItems.push(it);
        }
      }
      const keepNotes = [];
      for (const n of s.notes) {
        try {
          await pushNote(n);
          sent++;
        } catch {
          failed++;
          keepNotes.push(n);
        }
      }
      save({ items: keepItems, notes: keepNotes });
      return { sent, failed };
    },
  };
}

export function rowsToFiles(items, notes) {
  const files = new Map();
  const fileFor = (employee, rack, masterVersion) => {
    const key = `${employee}|${rack}`;
    if (!files.has(key)) files.set(key, { masterVersion: masterVersion ?? "", employee, rack, items: [], notes: [] });
    return files.get(key);
  };
  for (const r of items) {
    fileFor(r.employee, r.rack, r.master_version).items.push({
      product: r.product,
      qtyBase: Number(r.qty_base),
      expiredDate: r.expired_date ?? "",
    });
  }
  for (const n of notes) {
    fileFor(n.employee, n.rack).notes.push({ text: n.note, qty: n.qty ?? 0 });
  }
  return [...files.values()];
}
