import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../assets/js/store.js";

const fakeStorage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};

test("session tersimpan dan terbaca", () => {
  const s = createStore(fakeStorage());
  assert.equal(s.getSession(), null);
  s.setSession({ employee: "Ani", rack: "rack1" });
  assert.deepEqual(s.getSession(), { employee: "Ani", rack: "rack1" });
});

test("saveItem menimpa item dengan product sama di rak sama", () => {
  const s = createStore(fakeStorage());
  s.saveItem("rack1", { product: "Cup", counts: { Pcs: 5 }, qtyBase: 5 });
  s.saveItem("rack1", { product: "Cup", counts: { Pcs: 8 }, qtyBase: 8 });
  s.saveItem("rack2", { product: "Cup", counts: { Pcs: 1 }, qtyBase: 1 });
  assert.equal(s.listItems("rack1").length, 1);
  assert.equal(s.listItems("rack1")[0].qtyBase, 8);
  assert.equal(s.listItems("rack2")[0].qtyBase, 1);
  assert.ok(s.hasItem("rack1", "Cup"));
  assert.ok(!s.hasItem("rack1", "Mentega"));
});

test("removeItem", () => {
  const s = createStore(fakeStorage());
  s.saveItem("rack1", { product: "Cup", counts: {}, qtyBase: 5 });
  s.removeItem("rack1", "Cup");
  assert.equal(s.listItems("rack1").length, 0);
});

test("exportRack menghasilkan bentuk file hasil", () => {
  const s = createStore(fakeStorage());
  s.saveItem("rack1", { product: "Cup", counts: { Pcs: 5 }, qtyBase: 5, expiredDate: "" });
  s.addNote("rack1", { text: "3 dus merek X", qty: 3 });
  const f = s.exportRack("rack1", { masterVersion: "v1", employee: "Ani", exportedAt: "2026-07-26T21:00" });
  assert.deepEqual(f, {
    masterVersion: "v1",
    employee: "Ani",
    rack: "rack1",
    exportedAt: "2026-07-26T21:00",
    items: [{ product: "Cup", counts: { Pcs: 5 }, qtyBase: 5, expiredDate: "" }],
    notes: [{ text: "3 dus merek X", qty: 3 }],
  });
});

test("clearAll mengosongkan semua", () => {
  const s = createStore(fakeStorage());
  s.setSession({ employee: "Ani", rack: "rack1" });
  s.saveItem("rack1", { product: "Cup", counts: {}, qtyBase: 5 });
  s.clearAll();
  assert.equal(s.getSession(), null);
  assert.equal(s.listItems("rack1").length, 0);
});

test("data bertahan antar instance store (simulasi buka ulang browser)", () => {
  const storage = fakeStorage();
  createStore(storage).saveItem("rack1", { product: "Cup", counts: {}, qtyBase: 5 });
  assert.equal(createStore(storage).listItems("rack1").length, 1);
});
