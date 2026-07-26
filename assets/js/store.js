const KEY = "so-kartini-v1";

export function createStore(storage) {
  const load = () => JSON.parse(storage.getItem(KEY) ?? '{"session":null,"racks":{},"notes":{}}');
  const save = (s) => storage.setItem(KEY, JSON.stringify(s));
  return {
    getSession: () => load().session,
    setSession(session) {
      const s = load();
      s.session = session;
      save(s);
    },
    listItems: (rack) => load().racks[rack] ?? [],
    hasItem: (rack, product) => (load().racks[rack] ?? []).some((x) => x.product === product),
    saveItem(rack, item) {
      const s = load();
      const list = s.racks[rack] ?? [];
      const i = list.findIndex((x) => x.product === item.product);
      if (i >= 0) list[i] = item;
      else list.push(item);
      s.racks[rack] = list;
      save(s);
    },
    removeItem(rack, product) {
      const s = load();
      s.racks[rack] = (s.racks[rack] ?? []).filter((x) => x.product !== product);
      save(s);
    },
    addNote(rack, note) {
      const s = load();
      s.notes[rack] = [...(s.notes[rack] ?? []), note];
      save(s);
    },
    listNotes: (rack) => load().notes[rack] ?? [],
    exportRack(rack, meta) {
      const s = load();
      return {
        masterVersion: meta.masterVersion,
        employee: meta.employee,
        rack,
        exportedAt: meta.exportedAt,
        items: s.racks[rack] ?? [],
        notes: s.notes[rack] ?? [],
      };
    },
    clearAll: () => storage.removeItem(KEY),
  };
}
