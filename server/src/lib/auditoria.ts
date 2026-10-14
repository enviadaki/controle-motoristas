import type { Request } from "express";
import { db } from "../db/index.js";
import { auditoria } from "../db/schema.js";

// Remove campos sensíveis antes de gravar o histórico.
function limpar(obj: unknown) {
  if (!obj || typeof obj !== "object") return obj ?? null;
  const { senhaHash: _s, ...resto } = obj as Record<string, unknown>;
  return resto;
}

export async function registrarAuditoria(
  req: Request,
  acao: string,
  entidade: string,
  entidadeId: string | number | null,
  antes?: unknown,
  depois?: unknown,
) {
  await db.insert(auditoria).values({
    usuarioId: req.usuario?.id ?? null,
    usuarioNome: req.usuario?.nome ?? null,
    acao,
    entidade,
    entidadeId: entidadeId === null ? null : String(entidadeId),
    antes: limpar(antes),
    depois: limpar(depois),
  });
}
