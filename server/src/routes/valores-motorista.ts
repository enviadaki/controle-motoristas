import { Router, type Request } from "express";
import { z } from "zod";
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, type SQL } from "drizzle-orm";
import { db } from "../db/index.js";
import { bases, motoristas, valoresMotorista } from "../db/schema.js";
import { basesPermitidas, podeVerBase, requirePerfil } from "../lib/auth.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { dinheiroOpcional, idParam, textoOpcional } from "../lib/util.js";

// Valor por pacote individual de cada motorista (rotas POR_PACOTE). É dado de
// pagamento do motorista — mesma regra do PIX/favorecido: Admin e Financeiro
// cadastram; o Líder só enxerga (das bases dele).
export const valoresMotoristaRouter = Router();

const EDITORES = ["ADMIN", "FINANCEIRO"] as const;
const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD");

const colunas = {
  id: valoresMotorista.id,
  motoristaId: valoresMotorista.motoristaId,
  motoristaNome: motoristas.nome,
  baseId: motoristas.baseId,
  baseCodigo: bases.codigo,
  rotaPadrao: motoristas.rotaPadrao,
  valorPacote: valoresMotorista.valorPacote,
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
    vigenciaInicio: dataISO,
    vigenciaFim: dataISO.nullish().transform((v) => v ?? null),
    observacoes: textoOpcional,
  })
  .refine((v) => !v.vigenciaFim || v.vigenciaFim >= v.vigenciaInicio, {
    path: ["vigenciaFim"],
    message: "Fim da vigência antes do início",
  });

type Dados = z.infer<typeof valorSchema>;

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
  const [novo] = await db.insert(valoresMotorista).values(dados as typeof valoresMotorista.$inferInsert).returning();
  await registrarAuditoria(req, "CRIAR", "valor_motorista", novo.id, null, novo);
  res.status(201).json(novo);
});

valoresMotoristaRouter.put("/:id", requirePerfil(...EDITORES), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const dados = valorSchema.parse(req.body);
  const [antes] = await db.select().from(valoresMotorista).where(eq(valoresMotorista.id, id));
  if (!antes) return res.status(404).json({ erro: "Valor não encontrado" });
  await validar(req, dados, id);
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
  const [antes] = await db.delete(valoresMotorista).where(eq(valoresMotorista.id, id)).returning();
  if (!antes) return res.status(404).json({ erro: "Valor não encontrado" });
  await registrarAuditoria(req, "EXCLUIR", "valor_motorista", id, antes, null);
  res.json({ ok: true });
});
