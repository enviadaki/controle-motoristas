import { Router } from "express";
import { z } from "zod";
import { and, asc, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { db } from "../db/index.js";
import { ACOES_DESCONTO, bases, descontos, motoristas, STATUS_DESCONTO, STATUS_PARCELAMENTO, TIPOS_RESPONSAVEL, usuarios } from "../db/schema.js";
import { basesPermitidas, podeVerBase, requirePerfil } from "../lib/auth.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { dinheiroObrigatorio, idParam, textoOpcional } from "../lib/util.js";

export const descontosRouter = Router();

// Quem lança/edita desconto: Admin e a área de Descontos (Flávia). Líder e
// Financeiro só visualizam (líder travado na própria base; é o mesmo
// problema do desconto solto na planilha que esse sistema tenta resolver).
const EDITORES = ["ADMIN", "DESCONTOS"] as const;

const colunasLista = {
  id: descontos.id,
  baseId: descontos.baseId,
  baseCodigo: bases.codigo,
  motoristaId: descontos.motoristaId,
  motoristaNome: motoristas.nome,
  tipoResponsavel: descontos.tipoResponsavel,
  nomeResponsavel: descontos.nomeResponsavel,
  tbr: descontos.tbr,
  nodeOrigem: descontos.nodeOrigem,
  motivo: descontos.motivo,
  acao: descontos.acao,
  valor: descontos.valor,
  parcelas: descontos.parcelas,
  parcelaAtual: descontos.parcelaAtual,
  statusParcelamento: descontos.statusParcelamento,
  aprovadoPorNome: usuarios.nome,
  aprovadoEm: descontos.aprovadoEm,
  motivoRejeicaoParcelamento: descontos.motivoRejeicaoParcelamento,
  periodoApuracao: descontos.periodoApuracao,
  mesCobranca: descontos.mesCobranca,
  semanaReferencia: descontos.semanaReferencia,
  origem: descontos.origem,
  status: descontos.status,
  observacoes: descontos.observacoes,
  updatedAt: descontos.updatedAt,
};

function consultaBase() {
  return db
    .select(colunasLista)
    .from(descontos)
    .innerJoin(bases, eq(bases.id, descontos.baseId))
    .leftJoin(motoristas, eq(motoristas.id, descontos.motoristaId))
    .leftJoin(usuarios, eq(usuarios.id, descontos.aprovadoPorId));
}

const filtrosSchema = z.object({
  baseId: z.coerce.number().int().positive().optional(),
  motoristaId: z.coerce.number().int().positive().optional(),
  status: z.enum(STATUS_DESCONTO).optional(),
  statusParcelamento: z.enum(STATUS_PARCELAMENTO).optional(),
  semanaReferencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  busca: z.string().trim().optional(), // nome do responsável, TBR ou motivo
});

descontosRouter.get("/", async (req, res) => {
  const f = filtrosSchema.parse(req.query);
  const permitidas = basesPermitidas(req.usuario!);
  if (permitidas && permitidas.length === 0) return res.json([]);

  const cond: SQL[] = [];
  if (permitidas) cond.push(inArray(descontos.baseId, permitidas));
  if (f.baseId) cond.push(eq(descontos.baseId, f.baseId));
  if (f.motoristaId) cond.push(eq(descontos.motoristaId, f.motoristaId));
  if (f.status) cond.push(eq(descontos.status, f.status));
  if (f.statusParcelamento) cond.push(eq(descontos.statusParcelamento, f.statusParcelamento));
  if (f.semanaReferencia) cond.push(eq(descontos.semanaReferencia, f.semanaReferencia));
  if (f.busca) {
    const termo = `%${f.busca}%`;
    cond.push(or(ilike(descontos.nomeResponsavel, termo), ilike(descontos.tbr, termo), ilike(descontos.motivo, termo))!);
  }

  const lista = await consultaBase()
    .where(cond.length ? and(...cond) : undefined)
    .orderBy(desc(descontos.mesCobranca), desc(descontos.id));
  res.json(lista);
});

descontosRouter.get("/:id", async (req, res) => {
  const id = idParam.parse(req.params.id);
  const [d] = await consultaBase().where(eq(descontos.id, id));
  if (!d || !podeVerBase(req.usuario!, d.baseId)) return res.status(404).json({ erro: "Desconto não encontrado" });
  res.json(d);
});

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD");

const descontoSchema = z.object({
  baseId: z.coerce.number({ message: "Selecione a base" }).int().positive("Selecione a base"),
  motoristaId: z.coerce.number().int().positive().nullish().transform((v) => v ?? null),
  tipoResponsavel: z.enum(TIPOS_RESPONSAVEL).default("MOTORISTA"),
  nomeResponsavel: z.string().trim().min(2, "Informe o nome do responsável"),
  tbr: textoOpcional,
  nodeOrigem: textoOpcional,
  motivo: z.string().trim().min(3, "Informe o motivo"),
  acao: z.enum(ACOES_DESCONTO),
  valor: dinheiroObrigatorio,
  parcelas: z.coerce.number().int().min(1).default(1),
  parcelaAtual: z.coerce.number().int().min(1).default(1),
  periodoApuracao: textoOpcional,
  mesCobranca: dataISO.nullish().transform((v) => v ?? null),
  // Segunda-feira da semana (seg.–dom.) do fechamento ao qual esse desconto
  // deve entrar (Passo 3). Opcional — sem isso o desconto fica só registrado.
  semanaReferencia: dataISO.nullish().transform((v) => v ?? null),
  origem: textoOpcional,
  status: z.enum(STATUS_DESCONTO).default("DEVIDO"),
  observacoes: textoOpcional,
});

async function validarMotorista(baseId: number, motoristaId: number | null) {
  if (motoristaId === null) return;
  const [m] = await db.select({ id: motoristas.id, baseId: motoristas.baseId }).from(motoristas).where(eq(motoristas.id, motoristaId));
  if (!m) throw Object.assign(new Error("Motorista não encontrado"), { status: 400 });
  if (m.baseId !== baseId) throw Object.assign(new Error("Motorista não pertence à base selecionada"), { status: 400 });
}

// Parcelas > 1 nasce (ou volta) pendente de autorização do CFO — qualquer
// edição nos termos do parcelamento exige aprovar de novo, nunca herda a
// aprovação anterior.
function camposParcelamento(parcelas: number) {
  return parcelas > 1
    ? { statusParcelamento: "PENDENTE" as const, aprovadoPorId: null, aprovadoEm: null, motivoRejeicaoParcelamento: null }
    : { statusParcelamento: null, aprovadoPorId: null, aprovadoEm: null, motivoRejeicaoParcelamento: null };
}

descontosRouter.post("/", requirePerfil(...EDITORES), async (req, res) => {
  const dados = descontoSchema.parse(req.body);
  await validarMotorista(dados.baseId, dados.motoristaId);
  const [novo] = await db
    .insert(descontos)
    .values({ ...dados, ...camposParcelamento(dados.parcelas), lancadoPorId: req.usuario!.id })
    .returning();
  await registrarAuditoria(req, "CRIAR", "desconto", novo.id, null, novo);
  res.status(201).json(novo);
});

descontosRouter.put("/:id", requirePerfil(...EDITORES), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const dados = descontoSchema.parse(req.body);
  await validarMotorista(dados.baseId, dados.motoristaId);
  const [antes] = await db.select().from(descontos).where(eq(descontos.id, id));
  if (!antes) return res.status(404).json({ erro: "Desconto não encontrado" });
  const [depois] = await db
    .update(descontos)
    .set({ ...dados, ...camposParcelamento(dados.parcelas), updatedAt: new Date() })
    .where(eq(descontos.id, id))
    .returning();
  await registrarAuditoria(req, "EDITAR", "desconto", id, antes, depois);
  res.json(depois);
});

// Autorização do parcelamento — só o CFO decide. Primeira tela dele no
// sistema é a lista de PENDENTE (ver GET / com ?statusParcelamento=PENDENTE).
const aprovacaoSchema = z.object({
  aprovado: z.boolean(),
  motivoRejeicao: textoOpcional,
});

descontosRouter.put("/:id/aprovar-parcelamento", requirePerfil("CFO"), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const { aprovado, motivoRejeicao } = aprovacaoSchema.parse(req.body);
  const [antes] = await db.select().from(descontos).where(eq(descontos.id, id));
  if (!antes) return res.status(404).json({ erro: "Desconto não encontrado" });
  if (antes.statusParcelamento !== "PENDENTE") {
    return res.status(400).json({ erro: "Este parcelamento já foi avaliado" });
  }
  const [depois] = await db
    .update(descontos)
    .set({
      statusParcelamento: aprovado ? "APROVADO" : "REJEITADO",
      aprovadoPorId: req.usuario!.id,
      aprovadoEm: new Date(),
      motivoRejeicaoParcelamento: aprovado ? null : motivoRejeicao,
      updatedAt: new Date(),
    })
    .where(eq(descontos.id, id))
    .returning();
  await registrarAuditoria(req, aprovado ? "APROVAR_PARCELAMENTO" : "REJEITAR_PARCELAMENTO", "desconto", id, antes, depois);
  res.json(depois);
});

// Financeiro/Admin/Descontos marcam como pago/contestado sem reabrir o
// cadastro todo — é o fluxo do dia a dia de conferência.
const statusSchema = z.object({ status: z.enum(STATUS_DESCONTO) });

descontosRouter.put("/:id/status", requirePerfil("ADMIN", "DESCONTOS", "FINANCEIRO"), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const { status } = statusSchema.parse(req.body);
  const [antes] = await db.select().from(descontos).where(eq(descontos.id, id));
  if (!antes) return res.status(404).json({ erro: "Desconto não encontrado" });
  const [depois] = await db.update(descontos).set({ status, updatedAt: new Date() }).where(eq(descontos.id, id)).returning();
  await registrarAuditoria(req, "EDITAR", "desconto", id, antes, depois);
  res.json(depois);
});

descontosRouter.delete("/:id", requirePerfil(...EDITORES), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const [antes] = await db.delete(descontos).where(eq(descontos.id, id)).returning();
  if (!antes) return res.status(404).json({ erro: "Desconto não encontrado" });
  await registrarAuditoria(req, "EXCLUIR", "desconto", id, antes, null);
  res.json({ ok: true });
});
