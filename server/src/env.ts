function obrigatorio(nome: string): string {
  const v = process.env[nome];
  if (!v) {
    console.error(`Variável de ambiente obrigatória ausente: ${nome}`);
    process.exit(1);
  }
  return v;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? 5000),
  DATABASE_URL: obrigatorio("DATABASE_URL"),
  get JWT_SECRET() {
    return obrigatorio("JWT_SECRET");
  },
};

// Pasta onde ficam as notas fiscais anexadas no fechamento (Passo 3). Em
// produção é um volume Docker persistente; em dev, uma pasta local ignorada
// pelo git.
export const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "uploads";

export const isProd = env.NODE_ENV === "production";
