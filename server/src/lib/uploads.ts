import fs from "node:fs";
import path from "node:path";

// Pasta onde ficam os arquivos anexados (hoje: nota fiscal do fechamento,
// Passo 3). Definida uma vez em app.ts/index.ts a partir do env, e lida pelas
// rotas que precisam gravar/servir arquivo. Fica fora do schema porque é
// puramente infraestrutura (caminho em disco).
let pasta = path.resolve("uploads");

export function definirPastaUploads(caminho: string) {
  pasta = caminho;
  fs.mkdirSync(pasta, { recursive: true });
}

export function pastaUploads() {
  return pasta;
}

// Gera um nome de arquivo seguro e único em disco a partir do nome original,
// preservando a extensão (pra abrir certo depois) sem reaproveitar o nome
// como veio (evita path traversal e colisão entre bases/semanas).
export function nomeArquivoUnico(nomeOriginal: string): string {
  const ext = path.extname(nomeOriginal).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, "");
  const aleatorio = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${aleatorio}${ext}`;
}
