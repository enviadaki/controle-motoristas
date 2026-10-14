import { Router } from "express";
import { z } from "zod";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { bases, OPERACOES } from "../db/schema.js";
import { basesPermitidas, requirePerfil } from "../lib/auth.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { idParam, textoOpcional } from "../lib/util.js";

export const basesRouter = Router();

basesRouter.get("/", async (req, res) => {
  const permitidas = basesPermitidas(req.usuario!);
  if (permitidas && permitidas.length === 0) return res.json([]);
  const q = db.select().from(bases).orderBy(asc(bases.nome));
  res.json(permitidas ? await q.where(inArray(bases.id, permitidas)) : await q);
});

const baseSchema = z.object({
  codigo: z.string().trim().toUpperCase().min(2).max(10),
  nome: z.string().trim().min(2),
  cidade: textoOpcional,
  uf: z.string().trim().toUpperCase().length(2).default("BA"),
  operacoes: z.array(z.enum(OPERACOES)).min(1, "Selecione ao menos uma operação"),
  ativo: z.boolean().default(true),
});

basesRouter.post("/", requirePerfil("ADMIN"), async (req, res) => {
  const dados = baseSchema.parse(req.body);
  const [nova] = await db.insert(bases).values(dados).returning();
  await registrarAuditoria(req, "CRIAR", "base", nova.id, null, nova);
  res.status(201).json(nova);
});

basesRouter.put("/:id", requirePerfil("ADMIN"), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const dados = baseSchema.parse(req.body);
  const [antes] = await db.select().from(bases).where(eq(bases.id, id));
  if (!antes) return res.status(404).json({ erro: "Base não encontrada" });
  const [depois] = await db
    .update(bases)
    .set({ ...dados, updatedAt: new Date() })
    .where(eq(bases.id, id))
    .returning();
  await registrarAuditoria(req, "EDITAR", "base", id, antes, depois);
  res.json(depois);
});
