import { Router } from "express";
import { z } from "zod";
import { and, asc, eq, inArray, type SQL } from "drizzle-orm";
import { db } from "../db/index.js";
import { bases, tabelaValores, tabelaValoresDuracoes, MODELOS_CALCULO, OPERACOES, TIPOS_VEICULO } from "../db/schema.js";
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
  valorPacoteDomingo: tabelaValores.valorPacoteDomingo,
  valorParada: tabelaValores.valorParada,
  valorParadaDomingo: tabelaValores.valorParadaDomingo,
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

type Duracao = { horas: number; valor: string; valorDomingo: string | null };

async function duracoesDe(ids: number[]): Promise<Map<number, Duracao[]>> {
  const mapa = new Map<number, Duracao[]>();
  if (!ids.length) return mapa;
  const linhas = await db
    .select()
    .from(tabelaValoresDuracoes)
    .where(inArray(tabelaValoresDuracoes.tabelaValorId, ids))
    .orderBy(asc(tabelaValoresDuracoes.horas));
  for (const d of linhas) {
    const lista = mapa.get(d.tabelaValorId) ?? [];
    lista.push({ horas: d.horas, valor: d.valor, valorDomingo: d.valorDomingo });
    mapa.set(d.tabelaValorId, lista);
  }
  return mapa;
}

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
  const duracoes = await duracoesDe(linhas.map((l) => l.id));
  res.json(linhas.map((l) => ({ ...l, duracoes: duracoes.get(l.id) ?? [] })));
});

const duracaoSchema = z.object({
  horas: z.coerce.number({ message: "Informe as horas" }).int("Horas inteiras").min(1, "Mínimo 1 hora").max(24, "Máximo 24 horas"),
  valor: dinheiroOpcional.refine((v) => v !== null, "Informe o valor da rota"),
  valorDomingo: dinheiroOpcional,
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
    valorPacoteDomingo: dinheiroOpcional,
    valorParada: dinheiroOpcional,
    valorParadaDomingo: dinheiroOpcional,
    mediaPacotes: z.coerce.number().int().nonnegative().nullish().transform((v) => v ?? null),
    valorAdicional: dinheiroOpcional,
    valorPacoteExtra: dinheiroOpcional,
    valorParadaExtra: dinheiroOpcional,
    valorResgate: dinheiroOpcional,
    valorDescontoInsucesso: dinheiroOpcional,
    vigenciaInicio: dataISO,
    vigenciaFim: dataISO.nullish().transform((v) => v ?? null),
    observacoes: textoOpcional,
    duracoes: z.array(duracaoSchema).default([]),
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
    if (v.modeloCalculo === "ROTA_HORA") {
      if (v.duracoes.length === 0) {
        ctx.addIssue({ code: "custom", path: ["duracoes"], message: "Cadastre pelo menos uma duração de rota (ex.: 6h, 8h)" });
      }
      const horas = v.duracoes.map((d) => d.horas);
      if (new Set(horas).size !== horas.length) {
        ctx.addIssue({ code: "custom", path: ["duracoes"], message: "Duração repetida — cada quantidade de horas só uma vez" });
      }
    }
  });

type DadosValor = z.infer<typeof valorSchema>;

async function validarOperacaoDaBase(baseId: number, operacao: string) {
  const [b] = await db.select().from(bases).where(eq(bases.id, baseId));
  if (!b) throw Object.assign(new Error("Base não encontrada"), { status: 400 });
  if (!b.operacoes.includes(operacao)) {
    throw Object.assign(new Error(`A base ${b.codigo} não atende a operação ${operacao}`), { status: 400 });
  }
}

// Separa a linha da tabela das durações (que vão pra tabela própria). Fora do
// modelo ROTA_HORA, a lista de durações é sempre gravada vazia.
function separar(dados: DadosValor) {
  const { duracoes, ...linha } = dados;
  const lista = linha.modeloCalculo === "ROTA_HORA" ? duracoes : [];
  return { linha: linha as typeof tabelaValores.$inferInsert, duracoes: lista };
}

tabelaValoresRouter.post("/", requirePerfil("ADMIN"), async (req, res) => {
  const dados = valorSchema.parse(req.body);
  await validarOperacaoDaBase(dados.baseId, dados.operacao);
  const { linha, duracoes } = separar(dados);
  const nova = await db.transaction(async (tx) => {
    const [n] = await tx.insert(tabelaValores).values(linha).returning();
    if (duracoes.length) {
      await tx.insert(tabelaValoresDuracoes).values(duracoes.map((d) => ({ ...d, valor: d.valor!, tabelaValorId: n.id })));
    }
    return n;
  });
  const depois = { ...nova, duracoes };
  await registrarAuditoria(req, "CRIAR", "tabela_valores", nova.id, null, depois);
  res.status(201).json(depois);
});

tabelaValoresRouter.put("/:id", requirePerfil("ADMIN"), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const dados = valorSchema.parse(req.body);
  await validarOperacaoDaBase(dados.baseId, dados.operacao);
  const [antesLinha] = await db.select().from(tabelaValores).where(eq(tabelaValores.id, id));
  if (!antesLinha) return res.status(404).json({ erro: "Linha não encontrada" });
  const antes = { ...antesLinha, duracoes: (await duracoesDe([id])).get(id) ?? [] };
  const { linha, duracoes } = separar(dados);
  const atualizada = await db.transaction(async (tx) => {
    const [d] = await tx
      .update(tabelaValores)
      .set({ ...linha, updatedAt: new Date() })
      .where(eq(tabelaValores.id, id))
      .returning();
    await tx.delete(tabelaValoresDuracoes).where(eq(tabelaValoresDuracoes.tabelaValorId, id));
    if (duracoes.length) {
      await tx.insert(tabelaValoresDuracoes).values(duracoes.map((x) => ({ ...x, valor: x.valor!, tabelaValorId: id })));
    }
    return d;
  });
  const depois = { ...atualizada, duracoes };
  await registrarAuditoria(req, "EDITAR", "tabela_valores", id, antes, depois);
  res.json(depois);
});

tabelaValoresRouter.delete("/:id", requirePerfil("ADMIN"), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const duracoes = (await duracoesDe([id])).get(id) ?? [];
  // As durações saem junto (ON DELETE CASCADE).
  const [antes] = await db.delete(tabelaValores).where(eq(tabelaValores.id, id)).returning();
  if (!antes) return res.status(404).json({ erro: "Linha não encontrada" });
  await registrarAuditoria(req, "EXCLUIR", "tabela_valores", id, { ...antes, duracoes }, null);
  res.json({ ok: true });
});
