import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import { db } from "../db/index.js";
import { bases, fechamentosSemanais, usuarios } from "../db/schema.js";
import { basesPermitidas, podeVerBase, requirePerfil } from "../lib/auth.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { calcularResumoFechamento } from "../lib/fechamento.js";
import { idParam, semanaDe } from "../lib/util.js";
import { nomeArquivoUnico, pastaUploads } from "../lib/uploads.js";

export const fechamentosRouter = Router();

// Quem fecha a semana: Admin, Financeiro e o próprio Líder (só das suas
// bases) — é ele que tem a nota fiscal em mãos. Reabrir é coisa de quem
// confere o consolidado: só Admin e Financeiro.
const FECHAM = ["ADMIN", "FINANCEIRO", "LIDER"] as const;
const REABREM = ["ADMIN", "FINANCEIRO"] as const;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (_req, file, cb) => {
    const ok = /^(application\/pdf|image\/(png|jpe?g))$/.test(file.mimetype);
    if (!ok) return cb(Object.assign(new Error("Envie a nota fiscal em PDF, PNG ou JPG"), { status: 400 }));
    cb(null, true);
  },
});

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
  notaFiscalNomeOriginal: fechamentosSemanais.notaFiscalNomeOriginal,
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
  observacoes: z
    .string()
    .trim()
    .nullish()
    .transform((v) => v ?? null),
});

// Fecha a semana: exige o farol verde (sem pendência de valor nem de
// aprovação de parcelamento) e a nota fiscal anexada. Upsert por base+semana
// — fechar de novo (depois de reabrir) atualiza o registro existente.
fechamentosRouter.post("/fechar", requirePerfil(...FECHAM), upload.single("notaFiscal"), async (req, res) => {
  const dados = fecharSchema.parse(req.body);
  if (!podeVerBase(req.usuario!, dados.baseId)) return res.status(404).json({ erro: "Base não encontrada" });
  if (!req.file) return res.status(400).json({ erro: "Anexe a nota fiscal" });

  const resumo = await calcularResumoFechamento(dados.baseId, dados.data);
  if (!resumo.farolVerde) {
    return res.status(400).json({ erro: "A semana tem pendências — confira o farol antes de fechar" });
  }

  const [existente] = await db
    .select()
    .from(fechamentosSemanais)
    .where(and(eq(fechamentosSemanais.baseId, dados.baseId), eq(fechamentosSemanais.semanaInicio, resumo.semanaInicio)));

  const nomeArquivo = nomeArquivoUnico(req.file.originalname);
  fs.writeFileSync(path.join(pastaUploads(), nomeArquivo), req.file.buffer);
  // Arquivo antigo (se estava reabrindo e fechando de novo com outro anexo)
  // não é mais referenciado — remove para não acumular lixo em disco.
  if (existente?.notaFiscalArquivo) {
    fs.rm(path.join(pastaUploads(), existente.notaFiscalArquivo), { force: true }, () => {});
  }

  const valores = {
    baseId: dados.baseId,
    semanaInicio: resumo.semanaInicio,
    semanaFim: resumo.semanaFim,
    status: "FECHADO" as const,
    notaFiscalArquivo: nomeArquivo,
    notaFiscalNomeOriginal: req.file.originalname,
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

// Download da nota fiscal anexada — autenticado e restrito à base do usuário.
fechamentosRouter.get("/:id/nota-fiscal", async (req, res) => {
  const id = idParam.parse(req.params.id);
  const [f] = await db.select().from(fechamentosSemanais).where(eq(fechamentosSemanais.id, id));
  if (!f || !podeVerBase(req.usuario!, f.baseId) || !f.notaFiscalArquivo) {
    return res.status(404).json({ erro: "Nota fiscal não encontrada" });
  }
  res.download(path.join(pastaUploads(), f.notaFiscalArquivo), f.notaFiscalNomeOriginal ?? f.notaFiscalArquivo);
});
