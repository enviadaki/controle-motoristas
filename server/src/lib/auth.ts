import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { usuarios, usuarioBases, type Perfil } from "../db/schema.js";
import { env, isProd } from "../env.js";

export const COOKIE = "cm_sessao";
const DURACAO_H = 12;

export interface UsuarioSessao {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
  baseIds: number[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: UsuarioSessao;
    }
  }
}

export function emitirSessao(res: Response, usuarioId: number) {
  const token = jwt.sign({ sub: String(usuarioId) }, env.JWT_SECRET, { expiresIn: `${DURACAO_H}h` });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: DURACAO_H * 3600 * 1000,
    path: "/",
  });
}

export function encerrarSessao(res: Response) {
  res.clearCookie(COOKIE, { path: "/" });
}

// Carrega o usuário do banco a cada requisição: desativar um usuário ou trocar
// o perfil/bases dele vale na hora, sem esperar o token expirar.
export async function carregarUsuario(id: number): Promise<UsuarioSessao | null> {
  const [u] = await db.select().from(usuarios).where(eq(usuarios.id, id));
  if (!u || !u.ativo) return null;
  const vinculos = await db
    .select({ baseId: usuarioBases.baseId })
    .from(usuarioBases)
    .where(eq(usuarioBases.usuarioId, id));
  return { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, baseIds: vinculos.map((v) => v.baseId) };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ erro: "Não autenticado" });
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string };
    const usuario = await carregarUsuario(Number(payload.sub));
    if (!usuario) {
      encerrarSessao(res);
      return res.status(401).json({ erro: "Sessão inválida" });
    }
    req.usuario = usuario;
    next();
  } catch {
    encerrarSessao(res);
    return res.status(401).json({ erro: "Sessão expirada" });
  }
}

export function requirePerfil(...perfis: Perfil[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.usuario || !perfis.includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: "Sem permissão para esta ação" });
    }
    next();
  };
}

// Bases que o usuário enxerga. null = todas (ADMIN, FINANCEIRO, DESCONTOS).
// Líder só enxerga as bases vinculadas a ele.
export function basesPermitidas(u: UsuarioSessao): number[] | null {
  return u.perfil === "LIDER" ? u.baseIds : null;
}

export function podeVerBase(u: UsuarioSessao, baseId: number): boolean {
  const permitidas = basesPermitidas(u);
  return permitidas === null || permitidas.includes(baseId);
}
