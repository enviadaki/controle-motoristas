import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { usuarios } from "../db/schema.js";
import { emitirSessao, encerrarSessao, requireAuth, carregarUsuario } from "../lib/auth.js";
import { registrarAuditoria } from "../lib/auditoria.js";

export const authRouter = Router();

// Limite simples de tentativas de login (por IP + e-mail), em memória.
const tentativas = new Map<string, { n: number; ate: number }>();
const MAX = 8;
const JANELA_MS = 15 * 60 * 1000;

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  senha: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const { email, senha } = loginSchema.parse(req.body);
  const chave = `${req.ip}|${email}`;
  const agora = Date.now();
  const t = tentativas.get(chave);
  if (t && t.ate > agora && t.n >= MAX) {
    return res.status(429).json({ erro: "Muitas tentativas. Aguarde 15 minutos." });
  }

  const [u] = await db.select().from(usuarios).where(eq(usuarios.email, email));
  const ok = u && u.ativo && (await bcrypt.compare(senha, u.senhaHash));
  if (!ok) {
    tentativas.set(chave, { n: (t && t.ate > agora ? t.n : 0) + 1, ate: agora + JANELA_MS });
    return res.status(401).json({ erro: "E-mail ou senha inválidos" });
  }
  tentativas.delete(chave);

  await db.update(usuarios).set({ ultimoAcesso: new Date() }).where(eq(usuarios.id, u.id));
  emitirSessao(res, u.id);
  req.usuario = (await carregarUsuario(u.id)) ?? undefined;
  await registrarAuditoria(req, "LOGIN", "usuario", u.id);
  res.json(req.usuario);
});

authRouter.post("/logout", (_req, res) => {
  encerrarSessao(res);
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json(req.usuario);
});

const trocarSenhaSchema = z.object({
  senhaAtual: z.string().min(1),
  novaSenha: z.string().min(8, "A nova senha precisa ter pelo menos 8 caracteres"),
});

authRouter.post("/trocar-senha", requireAuth, async (req, res) => {
  const { senhaAtual, novaSenha } = trocarSenhaSchema.parse(req.body);
  const [u] = await db.select().from(usuarios).where(eq(usuarios.id, req.usuario!.id));
  if (!u || !(await bcrypt.compare(senhaAtual, u.senhaHash))) {
    return res.status(400).json({ erro: "Senha atual incorreta" });
  }
  await db
    .update(usuarios)
    .set({ senhaHash: await bcrypt.hash(novaSenha, 12), updatedAt: new Date() })
    .where(eq(usuarios.id, u.id));
  await registrarAuditoria(req, "TROCAR_SENHA", "usuario", u.id);
  res.json({ ok: true });
});
