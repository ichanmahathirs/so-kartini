import { test } from "node:test";
import assert from "node:assert/strict";
import { createOutbox, rowsToFiles } from "../assets/js/cloud.js";

const fakeStorage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};

test("outbox: antri lalu flush sukses mengosongkan antrean", async () => {
  const ob = createOutbox(fakeStorage());
  ob.enqueueItem({ product: "Cup", rack: "rack1", qtyBase: 5 });
  ob.enqueueNote({ note: "dus asing", rack: "rack1", qty: 2 });
  assert.equal(ob.pending().count, 2);
  const pushed = [];
  const res = await ob.flush({
    pushItem: async (x) => pushed.push(["item", x.product]),
    pushNote: async (x) => pushed.push(["note", x.note]),
  });
  assert.deepEqual(pushed, [["item", "Cup"], ["note", "dus asing"]]);
  assert.equal(res.sent, 2);
  assert.equal(ob.pending().count, 0);
});

test("outbox: gagal push → item tetap di antrean, yang sukses keluar", async () => {
  const ob = createOutbox(fakeStorage());
  ob.enqueueItem({ product: "A", rack: "r", qtyBase: 1 });
  ob.enqueueItem({ product: "B", rack: "r", qtyBase: 2 });
  const res = await ob.flush({
    pushItem: async (x) => { if (x.product === "B") throw new Error("offline"); },
    pushNote: async () => {},
  });
  assert.equal(res.sent, 1);
  assert.equal(res.failed, 1);
  assert.equal(ob.pending().count, 1);
  assert.equal(ob.pending().items[0].product, "B");
});

test("outbox: item sama (product+rack) di-enqueue ulang menimpa antrean lama", () => {
  const ob = createOutbox(fakeStorage());
  ob.enqueueItem({ product: "A", rack: "r", qtyBase: 1 });
  ob.enqueueItem({ product: "A", rack: "r", qtyBase: 7 });
  assert.equal(ob.pending().count, 1);
  assert.equal(ob.pending().items[0].qtyBase, 7);
});

test("outbox: bertahan antar instance (localStorage)", () => {
  const st = fakeStorage();
  createOutbox(st).enqueueItem({ product: "A", rack: "r", qtyBase: 1 });
  assert.equal(createOutbox(st).pending().count, 1);
});

test("rowsToFiles: kelompokkan baris DB per karyawan+rak jadi bentuk file hasil", () => {
  const items = [
    { employee: "ani", rack: "rack1", product: "Mentega", qty_base: 137, expired_date: "2027-01-15", master_version: "v1" },
    { employee: "ani", rack: "rack1", product: "Cup", qty_base: 5, expired_date: null, master_version: "v1" },
    { employee: "budi", rack: "rack2", product: "Cup", qty_base: 9, expired_date: null, master_version: "v1" },
  ];
  const notes = [{ employee: "ani", rack: "rack1", note: "dus asing", qty: 2 }];
  const files = rowsToFiles(items, notes);
  assert.equal(files.length, 2);
  const ani = files.find((f) => f.employee === "ani");
  assert.equal(ani.rack, "rack1");
  assert.equal(ani.masterVersion, "v1");
  assert.deepEqual(ani.items, [
    { product: "Mentega", qtyBase: 137, expiredDate: "2027-01-15" },
    { product: "Cup", qtyBase: 5, expiredDate: "" },
  ]);
  assert.deepEqual(ani.notes, [{ text: "dus asing", qty: 2 }]);
  const budi = files.find((f) => f.employee === "budi");
  assert.equal(budi.items[0].qtyBase, 9);
  assert.deepEqual(budi.notes, []);
});

test("rowsToFiles: kosong → kosong", () => {
  assert.deepEqual(rowsToFiles([], []), []);
});
