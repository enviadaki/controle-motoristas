import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { motoristas, notasFiscaisMensais, usuarios } from "../db/schema.js";
import { basesPermitidas, podeVerBase, requirePerfil } from "../lib/auth.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { calcularConsolidado } from "../lib/consolidado.js";
import { idParam } from "../lib/util.js";
import { nomeArquivoUnico, pastaUploads } from "../lib/uploads.js";

// ---------------------------------------------------------------------------
// Nota fiscal mensal por responsável de pagamento (Passo 4) — o motorista (ou
// quem recebe por ele) tira uma nota só por mês, do acumulado, perto do dia
// 10. Quem anexa no sistema normalmente é o líder da base do responsável,
// mas Financeiro/Admin também podem (ex.: responsável atende mais de uma
// base, ou o líder não conseguiu). Por isso não fica atrás de um
// requirePerfil único — a permissão é por responsável (podeVerBase na base
// dele), checada em cada rota — mas o acesso à feature como um todo é só de
// quem lida com pagamento (nem Descontos, nem CFO têm nada a ver com isso).
// ---------------------------------------------------------------------------

export const notasFiscaisRouter = Router();
notasFiscaisRouter.use(requirePerfil("ADMIN", "FINANCEIRO", "LIDER"));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (_req, file, cb) => {
    const ok = /^(application\/pdf|image\/(png|jpe?g))$/.test(file.mimetype);
    if (!ok) return cb(Object.assign(new Error("Envie a nota fiscal em PDF, PNG ou JPG"), { status: 400 }));
    cb(null, true);
  },
});

// Lista os responsáveis de pagamento do mês (com o total do consolidado) e o
// status da nota fiscal de cada um. Líder só vê a própria base (ou as bases
// dele); Admin/Financeiro podem filtrar por base ou ver tudo.
notasFiscaisRouter.get("/", async (req, res) => {
  const q = z
    .object({ mes: z.string().regex(/^\d{4}-\d{2}$/, "Informe o mês no formato AAAA-MM"), baseId: z.coerce.number().int().positive().optional() })
    .parse(req.query);

  const permitidas = basesPermitidas(req.usuario!);
  if (q.baseId && !podeVerBase(req.usuario!, q.baseId)) return res.status(404).json({ erro: "Base não encontrada" });
  if (permitidas && permitidas.length === 0) return res.json({ mes: q.mes, responsaveis: [] });

  const baseIds = q.baseId ? [q.baseId] : (permitidas ?? undefined);
  const consolidado = await calcularConsolidado(q.mes, baseIds);

  const notas = await db
    .select({
      id: notasFiscaisMensais.id,
      responsavelId: notasFiscaisMensais.responsavelId,
      nomeOriginal: notasFiscaisMensais.nomeOriginal,
      enviadoEm: notasFiscaisMensais.enviadoEm,
      enviadoPorNome: usuarios.nome,
    })
    .from(notasFiscaisMensais)
    .leftJoin(usuarios, eq(usuarios.id, notasFiscaisMensais.enviadoPorId))
    .where(eq(notasFiscaisMensais.mes, q.mes));
  const porResponsavel = new Map(notas.map((n) => [n.responsavelId, n]));

  res.json({
    mes: q.mes,
    responsaveis: consolidado.responsaveis.map((r) => ({
      responsavelId: r.responsavelId,
      responsavelNome: r.responsavelNome,
      totalLiquido: r.totalLiquido,
      nota: porResponsavel.get(r.responsavelId) ?? null,
    })),
  });
});

const enviarSchema = z.object({
  mes: z.string().regex(/^\d{4}-\d{2}$/, "Informe o mês no formato AAAA-MM"),
  responsavelId: z.coerce.number().int().positive(),
});

// Anexa (ou substitui) a nota fiscal do mês de um responsável — upsert por
// (mes, responsavelId).
notasFiscaisRouter.post("/", upload.single("arquivo"), async (req, res) => {
  const dados = enviarSchema.parse(req.body);
  if (!req.file) return res.status(400).json({ erro: "Anexe a nota fiscal" });

  const [responsavel] = await db.select().from(motoristas).where(eq(motoristas.id, dados.responsavelId));
  if (!responsavel) return res.status(404).json({ erro: "Responsável não encontrado" });
  if (!podeVerBase(req.usuario!, responsavel.baseId)) return res.status(404).json({ erro: "Responsável não encontrado" });

  const [existente] = await db
    .select()
    .from(notasFiscaisMensais)
    .where(and(eq(notasFiscaisMensais.mes, dados.mes), eq(notasFiscaisMensais.responsavelId, dados.responsavelId)));

  const nomeArquivo = nomeArquivoUnico(req.file.originalname);
  fs.writeFileSync(path.join(pastaUploads(), nomeArquivo), req.file.buffer);
  if (existente?.arquivo) {
    fs.rm(path.join(pastaUploads(), existente.arquivo), { force: true }, () => {});
  }

  const valores = {
    mes: dados.mes,
    responsavelId: dados.responsavelId,
    arquivo: nomeArquivo,
    nomeOriginal: req.file.originalname,
    enviadoPorId: req.usuario!.id,
    enviadoEm: new Date(),
  };

  if (existente) {
    const [depois] = await db
      .update(notasFiscaisMensais)
      .set({ ...valores, updatedAt: new Date() })
      .where(eq(notasFiscaisMensais.id, existente.id))
      .returning();
    await registrarAuditoria(req, "EDITAR", "nota_fiscal_mensal", depois.id, existente, depois);
    return res.json(depois);
  }
  const [novo] = await db.insert(notasFiscaisMensais).values(valores).returning();
  await registrarAuditoria(req, "CRIAR", "nota_fiscal_mensal", novo.id, null, novo);
  res.status(201).json(novo);
});

// Download da nota fiscal — autenticado e restrito à base do responsável.
notasFiscaisRouter.get("/:id/arquivo", async (req, res) => {
  const id = idParam.parse(req.params.id);
  const [n] = await db
    .select({ arquivo: notasFiscaisMensais.arquivo, nomeOriginal: notasFiscaisMensais.nomeOriginal, baseId: motoristas.baseId })
    .from(notasFiscaisMensais)
    .innerJoin(motoristas, eq(motoristas.id, notasFiscaisMensais.responsavelId))
    .where(eq(notasFiscaisMensais.id, id));
  if (!n || !podeVerBase(req.usuario!, n.baseId)) return res.status(404).json({ erro: "Nota fiscal não encontrada" });
  res.download(path.join(pastaUploads(), n.arquivo), n.nomeOriginal ?? n.arquivo);
});
