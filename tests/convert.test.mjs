import { test } from "node:test";
import assert from "node:assert/strict";
import { totalBase } from "../assets/js/convert.js";

const VAR = [
  { label: "Krtn (15 Kg)", factor: 60 },
  { label: "Kg (4 250gr)", factor: 4 },
  { label: "250gr", factor: 1 },
];

test("contoh spec: 2 Krtn + 3 Kg + 5 = 137", () => {
  assert.equal(totalBase({ "Krtn (15 Kg)": 2, "Kg (4 250gr)": 3, "250gr": 5 }, VAR), 137);
});

test("qty kosong dianggap 0", () => {
  assert.equal(totalBase({ "Krtn (15 Kg)": "", "250gr": 5 }, VAR), 5);
  assert.equal(totalBase({}, VAR), 0);
});

test("desimal boleh, dibulatkan 3 desimal", () => {
  assert.equal(totalBase({ "Kg (4 250gr)": 0.5 }, VAR), 2);
  assert.equal(totalBase({ "250gr": 0.1234 }, VAR), 0.123);
});

test("qty string angka tetap dihitung", () => {
  assert.equal(totalBase({ "250gr": "7" }, VAR), 7);
});

test("label tak dikenal melempar error", () => {
  assert.throws(() => totalBase({ Dus: 1 }, VAR), /tidak dikenal/);
});

test("qty negatif atau bukan angka melempar error", () => {
  assert.throws(() => totalBase({ "250gr": -1 }, VAR), /tidak valid/);
  assert.throws(() => totalBase({ "250gr": "abc" }, VAR), /tidak valid/);
});
