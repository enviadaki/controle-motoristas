import { Router } from "express";
import { z } from "zod";
import { and, asc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db/index.js";
import { bases, motoristas, STATUS_MOTORISTA, TIPOS_VEICULO } from "../db/schema.js";
import { basesPermitidas, podeVerBase, requirePerfil, type UsuarioSessao } from "../lib/auth.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { idParam, soDigitos, textoOpcional, validarCpf, validarNomeCompleto } from "../lib/util.js";

export const motoristasRouter = Router();

// Quem pode cadastrar/editar motorista: Admin, Financeiro e Líder (só da
// própria base). Dados de pagamento (PIX, favorecido, banco, responsável
// pelo pagamento) ficam travados para o Líder — só Admin/Financeiro mexem
// nisso, pra não virar o mesmo problema do desconto solto na planilha.
const EDITORES = ["ADMIN", "FINANCEIRO", "LIDER"] as const;
const CAMPOS_PAGAMENTO = ["responsavelPagamentoId", "chavePix", "favorecido", "dadosBancarios", "contratoAssinado"] as const;

const responsavel = alias(motoristas, "responsavel");

const colunasLista = {
  id: motoristas.id,
  nome: motoristas.nome,
  cpf: motoristas.cpf,
  cnpj: motoristas.cnpj,
  telefone: motoristas.telefone,
  email: motoristas.email,
  placa: motoristas.placa,
  tipoVeiculo: motoristas.tipoVeiculo,
  baseId: motoristas.baseId,
  baseCodigo: bases.codigo,
  baseNome: bases.nome,
  responsavelPagamentoId: motoristas.responsavelPagamentoId,
  responsavelPagamentoNome: responsavel.nome,
  chavePix: motoristas.chavePix,
  favorecido: motoristas.favorecido,
  dadosBancarios: motoristas.dadosBancarios,
  idCortex: motoristas.idCortex,
  rotaPadrao: motoristas.rotaPadrao,
  contratoAssinado: motoristas.contratoAssinado,
  status: motoristas.status,
  observacoes: motoristas.observacoes,
  updatedAt: motoristas.updatedAt,
};

function consultaBase() {
  return db
    .select(colunasLista)
    .from(motoristas)
    .innerJoin(bases, eq(bases.id, motoristas.baseId))
    .leftJoin(responsavel, eq(responsavel.id, motoristas.responsavelPagamentoId));
}

const filtrosSchema = z.object({
  baseId: z.coerce.number().int().positive().optional(),
  status: z.enum(STATUS_MOTORISTA).optional(),
  busca: z.string().trim().optional(),
});

motoristasRouter.get("/", async (req, res) => {
  const f = filtrosSchema.parse(req.query);
  const permitidas = basesPermitidas(req.usuario!);
  if (permitidas && permitidas.length === 0) return res.json([]);

  const cond: SQL[] = [];
  if (permitidas) cond.push(inArray(motoristas.baseId, permitidas));
  if (f.baseId) cond.push(eq(motoristas.baseId, f.baseId));
  if (f.status) cond.push(eq(motoristas.status, f.status));
  if (f.busca) {
    const termo = `%${f.busca}%`;
    const digitos = soDigitos(f.busca);
    const ors = [ilike(motoristas.nome, termo), ilike(motoristas.placa, termo)];
    if (digitos) ors.push(ilike(motoristas.cpf, `%${digitos}%`), ilike(motoristas.cnpj, `%${digitos}%`));
    cond.push(or(...ors)!);
  }
  const lista = await consultaBase()
    .where(cond.length ? and(...cond) : undefined)
    .orderBy(asc(motoristas.nome));
  res.json(lista);
});

motoristasRouter.get("/:id", async (req, res) => {
  const id = idParam.parse(req.params.id);
  const [m] = await consultaBase().where(eq(motoristas.id, id));
  if (!m || !podeVerBase(req.usuario!, m.baseId)) return res.status(404).json({ erro: "Motorista não encontrado" });
  res.json(m);
});

const motoristaSchema = z
  .object({
    nome: z
      .string()
      .trim()
      .min(3, "Informe o nome completo")
      .refine(validarNomeCompleto, "Informe o nome completo (nome e sobrenome), sem apelido"),
    cpf: textoOpcional.transform(soDigitos),
    cnpj: textoOpcional.transform(soDigitos),
    telefone: textoOpcional.transform(soDigitos),
    email: textoOpcional.pipe(z.string().email("E-mail inválido").nullable()),
    placa: textoOpcional.transform((v) => (v ? v.toUpperCase().replace(/[^A-Z0-9]/g, "") : null)),
    tipoVeiculo: z.enum(TIPOS_VEICULO).nullish().transform((v) => v ?? null),
    baseId: z.coerce.number({ message: "Selecione a base" }).int().positive("Selecione a base"),
    responsavelPagamentoId: z.coerce.number().int().positive().nullish().transform((v) => v ?? null),
    chavePix: textoOpcional,
    favorecido: textoOpcional,
    dadosBancarios: textoOpcional,
    idCortex: textoOpcional,
    rotaPadrao: textoOpcional,
    contratoAssinado: z.boolean().default(false),
    status: z.enum(STATUS_MOTORISTA).default("ATIVO"),
    observacoes: textoOpcional,
  })
  .superRefine((m, ctx) => {
    if (m.cpf && !validarCpf(m.cpf)) ctx.addIssue({ code: "custom", path: ["cpf"], message: "CPF inválido" });
    if (m.cnpj && m.cnpj.length !== 14) ctx.addIssue({ code: "custom", path: ["cnpj"], message: "CNPJ deve ter 14 dígitos" });
  });

async function validarResponsavel(id: number | null, proprioId?: number) {
  if (id === null) return null;
  if (id === proprioId) return null; // apontar para si mesmo = recebe ele mesmo
  const [r] = await db.select({ id: motoristas.id }).from(motoristas).where(eq(motoristas.id, id));
  if (!r) throw Object.assign(new Error("Responsável de pagamento não encontrado"), { status: 400 });
  return id;
}

type DadosMotorista = z.infer<typeof motoristaSchema>;

// Líder não mexe em dados de pagamento nem move o motorista pra outra base:
// no cadastro, esses campos nascem vazios/falsos; na edição, mantém o que já
// estava gravado — ignora silenciosamente o que vier da tela (a tela do
// Líder nem mostra esses campos, então isso é só uma segunda trava).
function aplicarRestricoesLider(
  usuario: UsuarioSessao,
  dados: DadosMotorista,
  existente: typeof motoristas.$inferSelect | null,
) {
  if (usuario.perfil !== "LIDER") return dados;
  const baseId = existente ? existente.baseId : dados.baseId;
  if (!podeVerBase(usuario, baseId)) {
    throw Object.assign(new Error("Você só pode cadastrar motoristas da sua própria base"), { status: 403 });
  }
  const ajustado: DadosMotorista = { ...dados, baseId };
  for (const campo of CAMPOS_PAGAMENTO) {
    (ajustado as Record<string, unknown>)[campo] = existente
      ? existente[campo as keyof typeof existente]
      : campo === "contratoAssinado"
        ? false
        : null;
  }
  return ajustado;
}

motoristasRouter.post("/", requirePerfil(...EDITORES), async (req, res) => {
  let dados = motoristaSchema.parse(req.body);
  dados = aplicarRestricoesLider(req.usuario!, dados, null);
  dados.responsavelPagamentoId = await validarResponsavel(dados.responsavelPagamentoId);
  const [novo] = await db.insert(motoristas).values(dados).returning();
  await registrarAuditoria(req, "CRIAR", "motorista", novo.id, null, novo);
  res.status(201).json(novo);
});

motoristasRouter.put("/:id", requirePerfil(...EDITORES), async (req, res) => {
  const id = idParam.parse(req.params.id);
  let dados = motoristaSchema.parse(req.body);
  const [antes] = await db.select().from(motoristas).where(eq(motoristas.id, id));
  if (!antes || !podeVerBase(req.usuario!, antes.baseId)) return res.status(404).json({ erro: "Motorista não encontrado" });
  dados = aplicarRestricoesLider(req.usuario!, dados, antes);
  dados.responsavelPagamentoId = await validarResponsavel(dados.responsavelPagamentoId, id);
  const [depois] = await db
    .update(motoristas)
    .set({ ...dados, updatedAt: new Date() })
    .where(eq(motoristas.id, id))
    .returning();
  await registrarAuditoria(req, "EDITAR", "motorista", id, antes, depois);
  res.json(depois);
});
