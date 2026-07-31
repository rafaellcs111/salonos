import assert from "node:assert/strict";
import test from "node:test";

import { formatCpf, isValidCpf, normalizeCpf } from "../app/lib/cpf.ts";

test("normaliza e formata CPF", () => {
  assert.equal(normalizeCpf("529.982.247-25"), "52998224725");
  assert.equal(formatCpf("52998224725"), "529.982.247-25");
});

test("aceita CPFs com dígitos verificadores válidos", () => {
  assert.equal(isValidCpf("529.982.247-25"), true);
  assert.equal(isValidCpf("111.444.777-35"), true);
});

test("rejeita CPF incompleto, repetido ou com dígito inválido", () => {
  assert.equal(isValidCpf("123"), false);
  assert.equal(isValidCpf("111.111.111-11"), false);
  assert.equal(isValidCpf("529.982.247-24"), false);
});
