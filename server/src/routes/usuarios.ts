import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { usuarios, usuarioBases, PERFIS } from "../db/schema.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { idParam } from "../lib/util.js";

// Todas as rotas daqui são só para ADMIN (aplicado no app.ts).
export const usuariosRouter = Router();

async function listar() {
  const lista = await db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      perfil: usuarios.perfil,
      ativo: usuarios.ativo,
      ultimoAcesso: usuarios.ultimoAcesso,
    })
    .from(usuarios)
    .orderBy(asc(usuarios.nome));
  const vinculos = await db.select().from(usuarioBases);
  return lista.map((u) => ({ ...u, baseIds: vinculos.filter((v) => v.usuarioId === u.id).map((v) => v.baseId) }));
}

usuariosRouter.get("/", async (_req, res) => {
  res.json(await listar());
});

const usuarioSchema = z
  .object({
    nome: z.string().trim().min(3),
    email: z.string().trim().toLowerCase().email(),
    perfil: z.enum(PERFIS),
    ativo: z.boolean().default(true),
    baseIds: z.array(z.coerce.number().int().positive()).default([]),
    senha: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres").optional(),
  })
  .refine((u) => u.perfil !== "LIDER" || u.baseIds.length > 0, {
    path: ["baseIds"],
    message: "Líder precisa estar vinculado a pelo menos uma base",
  });

async function salvarBases(usuarioId: number, baseIds: number[]) {
  await db.delete(usuarioBases).where(eq(usuarioBases.usuarioId, usuarioId));
  if (baseIds.length) {
    await db.insert(usuarioBases).values([...new Set(baseIds)].map((baseId) => ({ usuarioId, baseId })));
  }
}

usuariosRouter.post("/", async (req, res) => {
  const { baseIds, senha, ...dados } = usuarioSchema.parse(req.body);
  if (!senha) return res.status(400).json({ erro: "Informe uma senha inicial" });
  const [novo] = await db
    .insert(usuarios)
    .values({ ...dados, senhaHash: await bcrypt.hash(senha, 12) })
    .returning();
  await salvarBases(novo.id, dados.perfil === "LIDER" ? baseIds : []);
  await registrarAuditoria(req, "CRIAR", "usuario", novo.id, null, { ...novo, baseIds });
  res.status(201).json({ id: novo.id });
});

usuariosRouter.put("/:id", async (req, res) => {
  const id = idParam.parse(req.params.id);
  const { baseIds, senha, ...dados } = usuarioSchema.parse(req.body);
  const [antes] = await db.select().from(usuarios).where(eq(usuarios.id, id));
  if (!antes) return res.status(404).json({ erro: "Usuário não encontrado" });
  if (id === req.usuario!.id && (dados.perfil !== "ADMIN" || !dados.ativo)) {
    return res.status(400).json({ erro: "Você não pode remover seu próprio acesso de administrador" });
  }
  const set: Partial<typeof usuarios.$inferInsert> = { ...dados, updatedAt: new Date() };
  if (senha) set.senhaHash = await bcrypt.hash(senha, 12);
  const [depois] = await db.update(usuarios).set(set).where(eq(usuarios.id, id)).returning();
  await salvarBases(id, dados.perfil === "LIDER" ? baseIds : []);
  await registrarAuditoria(req, senha ? "EDITAR_E_REDEFINIR_SENHA" : "EDITAR", "usuario", id, antes, { ...depois, baseIds });
  res.json({ id });
});
