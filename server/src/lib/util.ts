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

// ---------------------------------------------------------------------------
// Semana de trabalho (segunda a domingo). Tudo em data "calendário" (string
// YYYY-MM-DD), calculado em UTC pra não sofrer de fuso/horário de verão.
// ---------------------------------------------------------------------------

function paraData(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}
function paraISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface InfoSemana {
  inicio: string; // segunda
  fim: string; // domingo
}

export function semanaDe(dataISO: string): InfoSemana {
  const d = paraData(dataISO);
  const diaSemana = d.getUTCDay(); // 0 = domingo .. 6 = sábado
  const deslocSegunda = diaSemana === 0 ? -6 : 1 - diaSemana;
  const inicio = new Date(d);
  inicio.setUTCDate(d.getUTCDate() + deslocSegunda);
  const fim = new Date(inicio);
  fim.setUTCDate(inicio.getUTCDate() + 6);
  return { inicio: paraISO(inicio), fim: paraISO(fim) };
}

// "Hoje" no fuso da Bahia (America/Bahia) — é esse calendário que decide
// qual semana está aberta pro líder, não o relógio UTC do servidor.
export function hojeISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bahia" });
}

export function semanaAtual(): InfoSemana {
  return semanaDe(hojeISO());
}

// Semanas (segunda-feira) de um mês "AAAA-MM" — pro consolidado mensal
// (Passo 4): uma semana entra no mês em que sua segunda-feira cai, mesmo que
// o domingo já seja do mês seguinte (critério combinado com o Rafael).
export function semanasDoMes(mes: string): string[] {
  const [ano, m] = mes.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  const segundas: string[] = [];
  for (let dia = 1; dia <= ultimoDia; dia++) {
    const d = new Date(Date.UTC(ano, m - 1, dia));
    if (d.getUTCDay() === 1) segundas.push(paraISO(d));
  }
  return segundas;
}

// A semana fecha sozinha ao virar a próxima: líder só lança/edita dias da
// semana corrente. Admin/Financeiro podem corrigir semanas já fechadas.
export function semanaFechada(dataISO: string): boolean {
  return semanaDe(dataISO).inicio < semanaAtual().inicio;
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
