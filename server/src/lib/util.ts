import { z } from "zod";

export const soDigitos = (v: string | null | undefined) => (v ? v.replace(/\D/g, "") || null : null);

export const textoOpcional = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null));

// Aceita "1.234,56", "1234.56" ou número; guarda como string "1234.56".
export const dinheiroOpcional = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === "") return null;
    let s = String(v).trim();
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: "custom", message: "Valor inválido" });
      return z.NEVER;
    }
    return n.toFixed(2);
  });

export const dinheiroObrigatorio = dinheiroOpcional.refine((v) => v !== null, "Valor obrigatório");

export const idParam = z.coerce.number().int().positive();

// Exige nome e sobrenome (pelo menos 2 palavras de 2+ letras cada) para o
// Financeiro não confundir motoristas por apelido ou nome incompleto na hora
// de bater com a nota fiscal/PIX. Aceita acentos, hífen e apóstrofo (ex.:
// "Maria d'Ávila", "João Pedro-Neto").
const PALAVRA_NOME = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'-]+$/;
export function validarNomeCompleto(nome: string): boolean {
  const palavras = nome.trim().split(/\s+/);
  return palavras.length >= 2 && palavras.every((p) => PALAVRA_NOME.test(p));
}

export function validarCpf(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(cpf[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(cpf[9]) && dv(10) === Number(cpf[10]);
}
