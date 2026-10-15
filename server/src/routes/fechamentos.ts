import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import { db } from "../db/index.js";
import { bases, fechamentosSemanais, usuarios } from "../db/schema.js";
import { basesPermitidas, podeVerBase, requirePerfil } from "../lib/auth.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { calcularResumoFechamento } from "../lib/fechamento.js";
import { idParam, textoOpcional } from "../lib/util.js";

export const fechamentosRouter = Router();

// Quem fecha a semana: Admin, Financeiro e o próprio Líder (só das suas
// bases). A nota fiscal NÃO entra aqui — o motorista só tira a nota do
// acumulado 1x por mês, perto do dia 10 (ver /api/notas-fiscais). Reabrir é
// coisa de quem confere o consolidado: só Admin e Financeiro.
const FECHAM = ["ADMIN", "FINANCEIRO", "LIDER"] as const;
const REABREM = ["ADMIN", "FINANCEIRO"] as const;

// Resumo com farol da base+semana (data = qualquer dia dentro da semana;
// default = hoje). Não exige que já exista linha em fechamentos_semanais —
// enquanto não fechar, é tudo calculado na hora.
fechamentosRouter.get("/resumo", async (req, res) => {
  const q = z
    .object({ baseId: z.coerce.number().int().positive(), data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })
    .parse(req.query);
  if (!podeVerBase(req.usuario!, q.baseId)) return res.status(404).json({ erro: "Base não encontrada" });

  const resumo = await calcularResumoFechamento(q.baseId, q.data ?? new Date().toISOString().slice(0, 10));
  const [registro] = await db
    .select()
    .from(fechamentosSemanais)
    .where(and(eq(fechamentosSemanais.baseId, q.baseId), eq(fechamentosSemanais.semanaInicio, resumo.semanaInicio)));

  res.json({ ...resumo, fechamento: registro ?? null });
});

const colunasHistorico = {
  id: fechamentosSemanais.id,
  baseId: fechamentosSemanais.baseId,
  baseCodigo: bases.codigo,
  semanaInicio: fechamentosSemanais.semanaInicio,
  semanaFim: fechamentosSemanais.semanaFim,
  status: fechamentosSemanais.status,
  fechadoPorNome: usuarios.nome,
  fechadoEm: fechamentosSemanais.fechadoEm,
  observacoes: fechamentosSemanais.observacoes,
};

// Histórico de fechamentos já feitos — base pro Financeiro acompanhar.
fechamentosRouter.get("/", async (req, res) => {
  const f = z.object({ baseId: z.coerce.number().int().positive().optional() }).parse(req.query);
  const permitidas = basesPermitidas(req.usuario!);
  if (permitidas && permitidas.length === 0) return res.json([]);

  const cond: SQL[] = [];
  if (permitidas) cond.push(inArray(fechamentosSemanais.baseId, permitidas));
  if (f.baseId) cond.push(eq(fechamentosSemanais.baseId, f.baseId));

  const lista = await db
    .select(colunasHistorico)
    .from(fechamentosSemanais)
    .innerJoin(bases, eq(bases.id, fechamentosSemanais.baseId))
    .leftJoin(usuarios, eq(usuarios.id, fechamentosSemanais.fechadoPorId))
    .where(cond.length ? and(...cond) : undefined)
    .orderBy(desc(fechamentosSemanais.semanaInicio));
  res.json(lista);
});

const fecharSchema = z.object({
  baseId: z.coerce.number().int().positive(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de referência da semana"),
  observacoes: textoOpcional,
});

// Fecha a semana: exige só o farol verde (sem pendência de valor nem de
// aprovação de parcelamento). Upsert por base+semana — fechar de novo
// (depois de reabrir) atualiza o registro existente.
fechamentosRouter.post("/fechar", requirePerfil(...FECHAM), async (req, res) => {
  const dados = fecharSchema.parse(req.body);
  if (!podeVerBase(req.usuario!, dados.baseId)) return res.status(404).json({ erro: "Base não encontrada" });

  const resumo = await calcularResumoFechamento(dados.baseId, dados.data);
  if (!resumo.farolVerde) {
    return res.status(400).json({ erro: "A semana tem pendências — confira o farol antes de fechar" });
  }

  const [existente] = await db
    .select()
    .from(fechamentosSemanais)
    .where(and(eq(fechamentosSemanais.baseId, dados.baseId), eq(fechamentosSemanais.semanaInicio, resumo.semanaInicio)));

  const valores = {
    baseId: dados.baseId,
    semanaInicio: resumo.semanaInicio,
    semanaFim: resumo.semanaFim,
    status: "FECHADO" as const,
    fechadoPorId: req.usuario!.id,
    fechadoEm: new Date(),
    observacoes: dados.observacoes,
  };

  if (existente) {
    const [depois] = await db
      .update(fechamentosSemanais)
      .set({ ...valores, updatedAt: new Date() })
      .where(eq(fechamentosSemanais.id, existente.id))
      .returning();
    await registrarAuditoria(req, "EDITAR", "fechamento_semanal", depois.id, existente, depois);
    return res.json(depois);
  }
  const [novo] = await db.insert(fechamentosSemanais).values(valores).returning();
  await registrarAuditoria(req, "CRIAR", "fechamento_semanal", novo.id, null, novo);
  res.status(201).json(novo);
});

// Reabre uma semana fechada (ex.: achou um desconto depois) — só quem
// confere o consolidado faz isso, não o líder.
fechamentosRouter.put("/:id/reabrir", requirePerfil(...REABREM), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const [antes] = await db.select().from(fechamentosSemanais).where(eq(fechamentosSemanais.id, id));
  if (!antes) return res.status(404).json({ erro: "Fechamento não encontrado" });
  const [depois] = await db
    .update(fechamentosSemanais)
    .set({ status: "ABERTO", updatedAt: new Date() })
    .where(eq(fechamentosSemanais.id, id))
    .returning();
  await registrarAuditoria(req, "EDITAR", "fechamento_semanal", id, antes, depois);
  res.json(depois);
});
