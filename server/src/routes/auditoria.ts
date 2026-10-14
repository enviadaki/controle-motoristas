import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { db } from "../db/index.js";
import { auditoria } from "../db/schema.js";

export const auditoriaRouter = Router();

auditoriaRouter.get("/", async (req, res) => {
  const f = z
    .object({
      entidade: z.string().optional(),
      entidadeId: z.string().optional(),
      limite: z.coerce.number().int().min(1).max(500).default(200),
    })
    .parse(req.query);
  const cond: SQL[] = [];
  if (f.entidade) cond.push(eq(auditoria.entidade, f.entidade));
  if (f.entidadeId) cond.push(eq(auditoria.entidadeId, f.entidadeId));
  const linhas = await db
    .select()
    .from(auditoria)
    .where(cond.length ? and(...cond) : undefined)
    .orderBy(desc(auditoria.createdAt))
    .limit(f.limite);
  res.json(linhas);
});
