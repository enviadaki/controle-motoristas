import { Router } from "express";
import { z } from "zod";
import { and, asc, eq, inArray, type SQL } from "drizzle-orm";
import { db } from "../db/index.js";
import { bases, tabelaValores, MODELOS_CALCULO, OPERACOES, TIPOS_VEICULO } from "../db/schema.js";
import { basesPermitidas, requirePerfil } from "../lib/auth.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { dinheiroOpcional, idParam, textoOpcional } from "../lib/util.js";

export const tabelaValoresRouter = Router();

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD");

const { createdAt: _c, updatedAt: _u, ...tabelaValoresColunas } = {
  id: tabelaValores.id,
  baseId: tabelaValores.baseId,
  operacao: tabelaValores.operacao,
  cidade: tabelaValores.cidade,
  faixaKm: tabelaValores.faixaKm,
  tipoVeiculo: tabelaValores.tipoVeiculo,
  modeloCalculo: tabelaValores.modeloCalculo,
  valorRotaSemana: tabelaValores.valorRotaSemana,
  valorRotaDomingo: tabelaValores.valorRotaDomingo,
  valorPacote: tabelaValores.valorPacote,
  valorParada: tabelaValores.valorParada,
  valorRota6h: tabelaValores.valorRota6h,
  valorRota8h: tabelaValores.valorRota8h,
  mediaPacotes: tabelaValores.mediaPacotes,
  valorAdicional: tabelaValores.valorAdicional,
  valorPacoteExtra: tabelaValores.valorPacoteExtra,
  valorParadaExtra: tabelaValores.valorParadaExtra,
  valorResgate: tabelaValores.valorResgate,
  valorDescontoInsucesso: tabelaValores.valorDescontoInsucesso,
  vigenciaInicio: tabelaValores.vigenciaInicio,
  vigenciaFim: tabelaValores.vigenciaFim,
  observacoes: tabelaValores.observacoes,
  createdAt: tabelaValores.createdAt,
  updatedAt: tabelaValores.updatedAt,
};

tabelaValoresRouter.get("/", async (req, res) => {
  const f = z
    .object({ baseId: z.coerce.number().int().positive().optional(), operacao: z.enum(OPERACOES).optional() })
    .parse(req.query);
  const permitidas = basesPermitidas(req.usuario!);
  if (permitidas && permitidas.length === 0) return res.json([]);
  const cond: SQL[] = [];
  if (permitidas) cond.push(inArray(tabelaValores.baseId, permitidas));
  if (f.baseId) cond.push(eq(tabelaValores.baseId, f.baseId));
  if (f.operacao) cond.push(eq(tabelaValores.operacao, f.operacao));
  const linhas = await db
    .select({ ...tabelaValoresColunas, baseCodigo: bases.codigo, baseNome: bases.nome })
    .from(tabelaValores)
    .innerJoin(bases, eq(bases.id, tabelaValores.baseId))
    .where(cond.length ? and(...cond) : undefined)
    .orderBy(asc(bases.nome), asc(tabelaValores.cidade), asc(tabelaValores.tipoVeiculo));
  res.json(linhas);
});


const valorSchema = z
  .object({
    baseId: z.coerce.number({ message: "Selecione a base" }).int().positive("Selecione a base"),
    operacao: z.enum(OPERACOES),
    cidade: z.string().trim().min(2, "Informe a cidade ou rota"),
    faixaKm: textoOpcional,
    tipoVeiculo: z.enum(TIPOS_VEICULO),
    modeloCalculo: z.enum(MODELOS_CALCULO).default("ROTA_FIXA"),
    valorRotaSemana: dinheiroOpcional,
    valorRotaDomingo: dinheiroOpcional,
    valorPacote: dinheiroOpcional,
    valorParada: dinheiroOpcional,
    valorRota6h: dinheiroOpcional,
    valorRota8h: dinheiroOpcional,
    mediaPacotes: z.coerce.number().int().nonnegative().nullish().transform((v) => v ?? null),
    valorAdicional: dinheiroOpcional,
    valorPacoteExtra: dinheiroOpcional,
    valorParadaExtra: dinheiroOpcional,
    valorResgate: dinheiroOpcional,
    valorDescontoInsucesso: dinheiroOpcional,
    vigenciaInicio: dataISO,
    vigenciaFim: dataISO.nullish().transform((v) => v ?? null),
    observacoes: textoOpcional,
  })
  .superRefine((v, ctx) => {
    if (v.vigenciaFim && v.vigenciaFim < v.vigenciaInicio) {
      ctx.addIssue({ code: "custom", path: ["vigenciaFim"], message: "Fim da vigência antes do início" });
    }
    // Cada modelo exige o valor que ele usa pra calcular. POR_PACOTE não exige
    // valorPacote: a rota pode ter só valores individuais por motorista.
    if (v.modeloCalculo === "ROTA_FIXA" && v.valorRotaSemana === null) {
      ctx.addIssue({ code: "custom", path: ["valorRotaSemana"], message: "Informe o valor da rota (seg. a sáb.)" });
    }
    if (v.modeloCalculo === "POR_PARADA" && v.valorParada === null) {
      ctx.addIssue({ code: "custom", path: ["valorParada"], message: "Informe o valor por parada" });
    }
    if (v.modeloCalculo === "ROTA_HORA" && v.valorRota6h === null && v.valorRota8h === null) {
      ctx.addIssue({ code: "custom", path: ["valorRota6h"], message: "Informe o valor da rota de 6h e/ou de 8h" });
    }
  });

async function validarOperacaoDaBase(baseId: number, operacao: string) {
  const [b] = await db.select().from(bases).where(eq(bases.id, baseId));
  if (!b) throw Object.assign(new Error("Base não encontrada"), { status: 400 });
  if (!b.operacoes.includes(operacao)) {
    throw Object.assign(new Error(`A base ${b.codigo} não atende a operação ${operacao}`), { status: 400 });
  }
}

tabelaValoresRouter.post("/", requirePerfil("ADMIN"), async (req, res) => {
  const dados = valorSchema.parse(req.body);
  await validarOperacaoDaBase(dados.baseId, dados.operacao);
  const [nova] = await db.insert(tabelaValores).values(dados as typeof tabelaValores.$inferInsert).returning();
  await registrarAuditoria(req, "CRIAR", "tabela_valores", nova.id, null, nova);
  res.status(201).json(nova);
});

tabelaValoresRouter.put("/:id", requirePerfil("ADMIN"), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const dados = valorSchema.parse(req.body);
  await validarOperacaoDaBase(dados.baseId, dados.operacao);
  const [antes] = await db.select().from(tabelaValores).where(eq(tabelaValores.id, id));
  if (!antes) return res.status(404).json({ erro: "Linha não encontrada" });
  const [depois] = await db
    .update(tabelaValores)
    .set({ ...(dados as typeof tabelaValores.$inferInsert), updatedAt: new Date() })
    .where(eq(tabelaValores.id, id))
    .returning();
  await registrarAuditoria(req, "EDITAR", "tabela_valores", id, antes, depois);
  res.json(depois);
});

tabelaValoresRouter.delete("/:id", requirePerfil("ADMIN"), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const [antes] = await db.delete(tabelaValores).where(eq(tabelaValores.id, id)).returning();
  if (!antes) return res.status(404).json({ erro: "Linha não encontrada" });
  await registrarAuditoria(req, "EXCLUIR", "tabela_valores", id, antes, null);
  res.json({ ok: true });
});
