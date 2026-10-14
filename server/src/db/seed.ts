import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, pool } from "./index.js";
import { bases, usuarios } from "./schema.js";

// Seed idempotente: pode rodar várias vezes sem duplicar.
// 1) Bases vistas nas planilhas de setembro/2026 (editáveis depois na tela).
// 2) Primeiro administrador a partir de ADMIN_EMAIL / ADMIN_SENHA.

const BASES_INICIAIS = [
  { codigo: "VDC", nome: "Vitória da Conquista (sede)", cidade: "Vitória da Conquista", operacoes: ["AMAZON", "SHOPEE", "LOGGI"] },
  { codigo: "SAJ", nome: "Santo Antônio de Jesus", cidade: "Santo Antônio de Jesus", operacoes: ["AMAZON"] },
  { codigo: "SSR9", nome: "Lauro de Freitas (SSR9)", cidade: "Lauro de Freitas", operacoes: ["AMAZON"] },
  { codigo: "ALG", nome: "Alagoinhas", cidade: "Alagoinhas", operacoes: ["AMAZON"] },
  { codigo: "BAR", nome: "Barreiras", cidade: "Barreiras", operacoes: ["AMAZON"] },
  { codigo: "EUN", nome: "Eunápolis", cidade: "Eunápolis", operacoes: ["AMAZON"] },
  { codigo: "JEQ", nome: "Jequié", cidade: "Jequié", operacoes: ["AMAZON"] },
  { codigo: "PSG", nome: "Porto Seguro", cidade: "Porto Seguro", operacoes: ["AMAZON"] },
];

for (const b of BASES_INICIAIS) {
  await db.insert(bases).values(b).onConflictDoNothing({ target: bases.codigo });
}
console.log(`Bases: ${BASES_INICIAIS.length} verificadas`);

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const senha = process.env.ADMIN_SENHA;
const nome = process.env.ADMIN_NOME ?? "Administrador";
if (email && senha) {
  const existe = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email));
  if (existe.length === 0) {
    await db.insert(usuarios).values({ nome, email, senhaHash: await bcrypt.hash(senha, 12), perfil: "ADMIN" });
    console.log(`Administrador criado: ${email}`);
  } else {
    console.log(`Administrador já existe: ${email}`);
  }
} else {
  console.log("ADMIN_EMAIL/ADMIN_SENHA não definidos — nenhum administrador criado");
}

await pool.end();
