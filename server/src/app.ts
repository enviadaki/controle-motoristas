import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import { MulterError } from "multer";
import { z, ZodError } from "zod";
import { pool } from "./db/index.js";
import { requireAuth, requirePerfil } from "./lib/auth.js";
import { authRouter } from "./routes/auth.js";
import { basesRouter } from "./routes/bases.js";
import { motoristasRouter } from "./routes/motoristas.js";
import { lancamentosRouter } from "./routes/lancamentos.js";
import { descontosRouter } from "./routes/descontos.js";
import { tabelaValoresRouter } from "./routes/tabela-valores.js";
import { usuariosRouter } from "./routes/usuarios.js";
import { auditoriaRouter } from "./routes/auditoria.js";
import { fechamentosRouter } from "./routes/fechamentos.js";
import { consolidadoRouter } from "./routes/consolidado.js";
import { notasFiscaisRouter } from "./routes/notas-fiscais.js";
import { definirPastaUploads } from "./lib/uploads.js";

// Mensagens de validação em português.
z.config(z.locales.ptBR());

export function criarApp(opcoes: { pastaFrontend?: string; pastaUploads?: string } = {}) {
  const app = express();
  definirPastaUploads(opcoes.pastaUploads ?? path.resolve("uploads"));
  app.set("trust proxy", 1); // atrás do Nginx Proxy Manager
  app.disable("x-powered-by");
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());

  app.get("/api/health", async (_req, res) => {
    await pool.query("select 1");
    res.json({ ok: true });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/bases", requireAuth, basesRouter);
  app.use("/api/motoristas", requireAuth, motoristasRouter);
  app.use("/api/lancamentos", requireAuth, lancamentosRouter);
  app.use("/api/descontos", requireAuth, descontosRouter);
  app.use("/api/fechamentos", requireAuth, fechamentosRouter);
  app.use("/api/consolidado", requireAuth, consolidadoRouter);
  app.use("/api/notas-fiscais", requireAuth, notasFiscaisRouter);
  app.use("/api/tabela-valores", requireAuth, tabelaValoresRouter);
  app.use("/api/usuarios", requireAuth, requirePerfil("ADMIN"), usuariosRouter);
  app.use("/api/auditoria", requireAuth, requirePerfil("ADMIN"), auditoriaRouter);

  app.use("/api", (_req, res) => res.status(404).json({ erro: "Rota não encontrada" }));

  // Em produção a própria API serve o frontend já compilado (um container só).
  const pasta = opcoes.pastaFrontend;
  if (pasta && fs.existsSync(path.join(pasta, "index.html"))) {
    app.use(express.static(pasta, { index: false, maxAge: "1h" }));
    app.get(/.*/, (_req, res) => res.sendFile(path.join(pasta, "index.html")));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof MulterError) {
      const msg = err.code === "LIMIT_FILE_SIZE" ? "Arquivo muito grande (máx. 15MB)" : "Falha ao enviar o arquivo";
      return res.status(400).json({ erro: msg });
    }
    if (err instanceof ZodError) {
      const primeira = err.issues[0];
      return res.status(400).json({
        erro: primeira?.message ?? "Dados inválidos",
        campo: primeira?.path.join("."),
        detalhes: err.issues.map((i) => ({ campo: i.path.join("."), mensagem: i.message })),
      });
    }
    // O Drizzle embrulha o erro do Postgres em DrizzleQueryError (.cause).
    const bruto = err as { cause?: unknown };
    const e = (bruto?.cause && typeof bruto.cause === "object" && "code" in bruto.cause ? bruto.cause : err) as {
      status?: number;
      code?: string;
      message?: string;
      constraint?: string;
    };
    if (e.code === "23505") {
      const msg = e.constraint?.includes("cpf")
        ? "Já existe um motorista com este CPF"
        : e.constraint?.includes("email")
          ? "Já existe um usuário com este e-mail"
          : e.constraint?.includes("codigo")
            ? "Já existe uma base com este código"
            : "Registro duplicado";
      return res.status(409).json({ erro: msg });
    }
    if (e.status && e.status < 500) return res.status(e.status).json({ erro: e.message });
    console.error(err);
    res.status(500).json({ erro: "Erro interno" });
  });

  return app;
}
