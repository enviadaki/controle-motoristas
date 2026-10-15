import { Router, type Request } from "express";
import { z } from "zod";
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, type SQL } from "drizzle-orm";
import { db } from "../db/index.js";
import { bases, motoristas, valoresMotorista } from "../db/schema.js";
import { basesPermitidas, podeVerBase, requirePerfil } from "../lib/auth.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { dinheiroOpcional, idParam, semanaAtual, textoOpcional } from "../lib/util.js";

// Valor por pacote individual de cada motorista (rotas POR_PACOTE). Quem
// negocia o valor com o entregador é o líder da base, então o Líder cadastra
// (só motoristas das bases dele), além de Admin e Financeiro. Tudo vai pra
// auditoria.
//
// Trava de semana fechada: o fechamento é recalculado a partir destes valores,
// então mudar um valor com data no passado mudaria o pagamento de uma semana
// já fechada. O Líder só pode mexer da semana atual em diante (mesma regra dos
// lançamentos); Admin e Financeiro podem corrigir o passado.
export const valoresMotoristaRouter = Router();

const EDITORES = ["ADMIN", "FINANCEIRO", "LIDER"] as const;
const MSG_SEMANA_FECHADA =
  "Isso mudaria o valor de uma semana que já fechou — o líder só altera da semana atual em diante. Peça pro Financeiro ou Admin corrigir.";
const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD");

const colunas = {
  id: valoresMotorista.id,
  motoristaId: valoresMotorista.motoristaId,
  motoristaNome: motoristas.nome,
  baseId: motoristas.baseId,
  baseCodigo: bases.codigo,
  rotaPadrao: motoristas.rotaPadrao,
  valorPacote: valoresMotorista.valorPacote,
  valorPacoteDomingo: valoresMotorista.valorPacoteDomingo,
  vigenciaInicio: valoresMotorista.vigenciaInicio,
  vigenciaFim: valoresMotorista.vigenciaFim,
  observacoes: valoresMotorista.observacoes,
  updatedAt: valoresMotorista.updatedAt,
};

valoresMotoristaRouter.get("/", async (req, res) => {
  const f = z
    .object({
      baseId: z.coerce.number().int().positive().optional(),
      motoristaId: z.coerce.number().int().positive().optional(),
    })
    .parse(req.query);
  const permitidas = basesPermitidas(req.usuario!);
  if (permitidas && permitidas.length === 0) return res.json([]);
  const cond: SQL[] = [];
  if (permitidas) cond.push(inArray(motoristas.baseId, permitidas));
  if (f.baseId) cond.push(eq(motoristas.baseId, f.baseId));
  if (f.motoristaId) cond.push(eq(valoresMotorista.motoristaId, f.motoristaId));
  const lista = await db
    .select(colunas)
    .from(valoresMotorista)
    .innerJoin(motoristas, eq(motoristas.id, valoresMotorista.motoristaId))
    .innerJoin(bases, eq(bases.id, motoristas.baseId))
    .where(cond.length ? and(...cond) : undefined)
    .orderBy(asc(motoristas.nome), desc(valoresMotorista.vigenciaInicio));
  res.json(lista);
});

const valorSchema = z
  .object({
    motoristaId: z.coerce.number({ message: "Selecione o motorista" }).int().positive("Selecione o motorista"),
    valorPacote: dinheiroOpcional.refine((v) => v !== null, "Informe o valor por pacote"),
    valorPacoteDomingo: dinheiroOpcional,
    vigenciaInicio: dataISO,
    vigenciaFim: dataISO.nullish().transform((v) => v ?? null),
    observacoes: textoOpcional,
  })
  .refine((v) => !v.vigenciaFim || v.vigenciaFim >= v.vigenciaInicio, {
    path: ["vigenciaFim"],
    message: "Fim da vigência antes do início",
  });

type Dados = z.infer<typeof valorSchema>;
type Registro = typeof valoresMotorista.$inferSelect;

// Último dia já fechado (domingo da semana passada).
function ultimoDiaFechado() {
  const d = new Date(`${semanaAtual().inicio}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// O pedaço de uma vigência que cai em semanas fechadas, com os valores que
// valiam nele. Se o pedaço e os valores não mudam, as semanas fechadas não
// mudam. null = não toca em semana fechada.
function trechoFechado(r: { vigenciaInicio: string; vigenciaFim: string | null; valorPacote: string | null; valorPacoteDomingo: string | null }) {
  const limite = ultimoDiaFechado();
  if (r.vigenciaInicio > limite) return null;
  const fim = r.vigenciaFim && r.vigenciaFim < limite ? r.vigenciaFim : limite;
  const n = (v: string | null) => (v === null ? null : Number(v));
  return JSON.stringify([r.vigenciaInicio, fim, n(r.valorPacote), n(r.valorPacoteDomingo)]);
}

function travaLider(req: Request, antes: Registro | null, depois: Dados | null) {
  if (req.usuario!.perfil !== "LIDER") return;
  const a = antes ? trechoFechado(antes) : null;
  const d = depois ? trechoFechado({ ...depois, valorPacote: depois.valorPacote ?? null }) : null;
  if (a !== d) throw Object.assign(new Error(MSG_SEMANA_FECHADA), { status: 403 });
}

async function validar(req: Request, dados: Dados, proprioId?: number) {
  const [m] = await db.select().from(motoristas).where(eq(motoristas.id, dados.motoristaId));
  if (!m || !podeVerBase(req.usuario!, m.baseId)) {
    throw Object.assign(new Error("Motorista não encontrado"), { status: 400 });
  }
  // Duas vigências sobrepostas deixariam o cálculo ambíguo — pede pra fechar
  // a anterior (preencher o "fim") antes de abrir a nova.
  const fimNovo = dados.vigenciaFim ?? "9999-12-31";
  const conflito = await db
    .select({ id: valoresMotorista.id, vigenciaInicio: valoresMotorista.vigenciaInicio })
    .from(valoresMotorista)
    .where(
      and(
        eq(valoresMotorista.motoristaId, dados.motoristaId),
        proprioId ? ne(valoresMotorista.id, proprioId) : undefined,
        lte(valoresMotorista.vigenciaInicio, fimNovo),
        or(isNull(valoresMotorista.vigenciaFim), gte(valoresMotorista.vigenciaFim, dados.vigenciaInicio)),
      ),
    );
  if (conflito.length) {
    throw Object.assign(
      new Error(
        `Já existe um valor vigente para este motorista nesse período (desde ${conflito[0].vigenciaInicio}) — preencha o fim da vigência anterior primeiro`,
      ),
      { status: 400, campo: "vigenciaInicio" },
    );
  }
}

valoresMotoristaRouter.post("/", requirePerfil(...EDITORES), async (req, res) => {
  const dados = valorSchema.parse(req.body);
  await validar(req, dados);
  travaLider(req, null, dados);
  const [novo] = await db.insert(valoresMotorista).values(dados as typeof valoresMotorista.$inferInsert).returning();
  await registrarAuditoria(req, "CRIAR", "valor_motorista", novo.id, null, novo);
  res.status(201).json(novo);
});

valoresMotoristaRouter.put("/:id", requirePerfil(...EDITORES), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const dados = valorSchema.parse(req.body);
  const [antes] = await db.select().from(valoresMotorista).where(eq(valoresMotorista.id, id));
  if (!antes) return res.status(404).json({ erro: "Valor não encontrado" });
  if (dados.motoristaId !== antes.motoristaId) {
    return res.status(400).json({ erro: "Não dá pra trocar o motorista de um valor — cadastre um valor novo pro outro motorista" });
  }
  await validar(req, dados, id);
  travaLider(req, antes, dados);
  const [depois] = await db
    .update(valoresMotorista)
    .set({ ...(dados as typeof valoresMotorista.$inferInsert), updatedAt: new Date() })
    .where(eq(valoresMotorista.id, id))
    .returning();
  await registrarAuditoria(req, "EDITAR", "valor_motorista", id, antes, depois);
  res.json(depois);
});

valoresMotoristaRouter.delete("/:id", requirePerfil(...EDITORES), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const [registro] = await db.select().from(valoresMotorista).where(eq(valoresMotorista.id, id));
  if (!registro) return res.status(404).json({ erro: "Valor não encontrado" });
  const [dono] = await db.select({ baseId: motoristas.baseId }).from(motoristas).where(eq(motoristas.id, registro.motoristaId));
  if (!dono || !podeVerBase(req.usuario!, dono.baseId)) return res.status(404).json({ erro: "Valor não encontrado" });
  travaLider(req, registro, null);
  const [antes] = await db.delete(valoresMotorista).where(eq(valoresMotorista.id, id)).returning();
  await registrarAuditoria(req, "EXCLUIR", "valor_motorista", id, antes, null);
  res.json({ ok: true });
});
