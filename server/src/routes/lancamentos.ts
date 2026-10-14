import { Router } from "express";
import { z } from "zod";
import { and, asc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { db } from "../db/index.js";
import { bases, lancamentos, motoristas } from "../db/schema.js";
import { basesPermitidas, podeVerBase, requirePerfil } from "../lib/auth.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { calcularSemanaMotorista } from "../lib/calculo.js";
import { hojeISO, idParam, semanaDe, semanaFechada } from "../lib/util.js";

export const lancamentosRouter = Router();

// Quem lança a operação diária: Admin, Financeiro e Líder (só das suas
// bases). Líder só pode mexer na semana corrente — a anterior já fechou.
const EDITORES = ["ADMIN", "FINANCEIRO", "LIDER"] as const;

const colunasLista = {
  id: lancamentos.id,
  motoristaId: lancamentos.motoristaId,
  motoristaNome: motoristas.nome,
  baseId: lancamentos.baseId,
  baseCodigo: bases.codigo,
  data: lancamentos.data,
  rodou: lancamentos.rodou,
  pacotesEntregues: lancamentos.pacotesEntregues,
  pacotesInsucesso: lancamentos.pacotesInsucesso,
  paradasExtras: lancamentos.paradasExtras,
  resgates: lancamentos.resgates,
  observacoes: lancamentos.observacoes,
  updatedAt: lancamentos.updatedAt,
};

function consultaBase() {
  return db
    .select(colunasLista)
    .from(lancamentos)
    .innerJoin(motoristas, eq(motoristas.id, lancamentos.motoristaId))
    .innerJoin(bases, eq(bases.id, lancamentos.baseId));
}

const filtrosSchema = z.object({
  baseId: z.coerce.number().int().positive().optional(),
  motoristaId: z.coerce.number().int().positive().optional(),
  // Qualquer data dentro da semana desejada; default = semana atual.
  semana: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// Lista os lançamentos da semana (default: semana atual) — é a grade que o
// líder preenche dia a dia.
lancamentosRouter.get("/", async (req, res) => {
  const f = filtrosSchema.parse(req.query);
  const permitidas = basesPermitidas(req.usuario!);
  if (permitidas && permitidas.length === 0) return res.json([]);

  const { inicio, fim } = semanaDe(f.semana ?? hojeISO());
  const cond: SQL[] = [gte(lancamentos.data, inicio), lte(lancamentos.data, fim)];
  if (permitidas) cond.push(inArray(lancamentos.baseId, permitidas));
  if (f.baseId) cond.push(eq(lancamentos.baseId, f.baseId));
  if (f.motoristaId) cond.push(eq(lancamentos.motoristaId, f.motoristaId));

  const lista = await consultaBase()
    .where(and(...cond))
    .orderBy(asc(motoristas.nome), asc(lancamentos.data));
  res.json({ semanaInicio: inicio, semanaFim: fim, fechada: semanaFechada(inicio), itens: lista });
});

// Resumo calculado da semana para um motorista (valor a pagar, com o
// detalhamento de como chegou nele).
lancamentosRouter.get("/resumo/:motoristaId", async (req, res) => {
  const motoristaId = idParam.parse(req.params.motoristaId);
  const semana = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .parse(req.query.semana) ?? hojeISO();
  const [m] = await db.select({ baseId: motoristas.baseId }).from(motoristas).where(eq(motoristas.id, motoristaId));
  if (!m || !podeVerBase(req.usuario!, m.baseId)) return res.status(404).json({ erro: "Motorista não encontrado" });
  res.json(await calcularSemanaMotorista(motoristaId, semana));
});

const lancamentoSchema = z.object({
  motoristaId: z.coerce.number().int().positive(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  rodou: z.boolean().default(true),
  pacotesEntregues: z.coerce.number().int().min(0).default(0),
  pacotesInsucesso: z.coerce.number().int().min(0).default(0),
  paradasExtras: z.coerce.number().int().min(0).default(0),
  resgates: z.coerce.number().int().min(0).default(0),
  observacoes: z
    .string()
    .trim()
    .nullish()
    .transform((v) => v ?? null),
});

function validarData(dados: { data: string }, usuario: { perfil: string }) {
  if (dados.data > hojeISO()) throw Object.assign(new Error("Data não pode ser no futuro"), { status: 400 });
  if (usuario.perfil === "LIDER" && semanaFechada(dados.data)) {
    throw Object.assign(
      new Error("Esta semana já fechou — peça pro Financeiro ou Admin corrigir"),
      { status: 403 },
    );
  }
}

// Cria ou atualiza o lançamento do dia (upsert por motorista+data) — é assim
// que a grade diária do líder funciona: ele marca a célula do dia e salva.
lancamentosRouter.post("/", requirePerfil(...EDITORES), async (req, res) => {
  const dados = lancamentoSchema.parse(req.body);
  validarData(dados, req.usuario!);

  const [motorista] = await db.select().from(motoristas).where(eq(motoristas.id, dados.motoristaId));
  if (!motorista || !podeVerBase(req.usuario!, motorista.baseId)) {
    return res.status(404).json({ erro: "Motorista não encontrado" });
  }

  const [existente] = await db
    .select()
    .from(lancamentos)
    .where(and(eq(lancamentos.motoristaId, dados.motoristaId), eq(lancamentos.data, dados.data)));

  if (existente && req.usuario!.perfil === "LIDER" && semanaFechada(existente.data)) {
    return res.status(403).json({ erro: "Esta semana já fechou — peça pro Financeiro ou Admin corrigir" });
  }

  const valores = { ...dados, baseId: motorista.baseId, lancadoPorId: req.usuario!.id };

  if (existente) {
    const [depois] = await db
      .update(lancamentos)
      .set({ ...valores, updatedAt: new Date() })
      .where(eq(lancamentos.id, existente.id))
      .returning();
    await registrarAuditoria(req, "EDITAR", "lancamento", depois.id, existente, depois);
    return res.json(depois);
  }
  const [novo] = await db.insert(lancamentos).values(valores).returning();
  await registrarAuditoria(req, "CRIAR", "lancamento", novo.id, null, novo);
  res.status(201).json(novo);
});

lancamentosRouter.delete("/:id", requirePerfil(...EDITORES), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const [antes] = await db.select().from(lancamentos).where(eq(lancamentos.id, id));
  if (!antes || !podeVerBase(req.usuario!, antes.baseId)) return res.status(404).json({ erro: "Lançamento não encontrado" });
  if (req.usuario!.perfil === "LIDER" && semanaFechada(antes.data)) {
    return res.status(403).json({ erro: "Esta semana já fechou — peça pro Financeiro ou Admin corrigir" });
  }
  await db.delete(lancamentos).where(eq(lancamentos.id, id));
  await registrarAuditoria(req, "EXCLUIR", "lancamento", id, antes, null);
  res.status(204).end();
});
