import path from "node:path";
import { fileURLToPath } from "node:url";
import { criarApp } from "./app.js";
import { env, UPLOADS_DIR } from "./env.js";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const pastaFrontend = process.env.FRONTEND_DIR ?? path.resolve(aqui, "../../client/dist");
const pastaUploads = path.isAbsolute(UPLOADS_DIR) ? UPLOADS_DIR : path.resolve(aqui, "../..", UPLOADS_DIR);

const app = criarApp({ pastaFrontend, pastaUploads });
app.listen(env.PORT, () => {
  console.log(`controle-motoristas API ouvindo na porta ${env.PORT}`);
});
