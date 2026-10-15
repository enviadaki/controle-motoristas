import { Router } from "express";
import ExcelJS from "exceljs";
import { z } from "zod";
import { requirePerfil } from "../lib/auth.js";
import { calcularConsolidado } from "../lib/consolidado.js";

export const consolidadoRouter = Router();

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const moeda = (v: number) => brl.format(v);

// Consolidado do Financeiro (Passo 4): só quem paga mexe nisso — Admin e
// Financeiro. Líder e Descontos não têm visão de todas as bases juntas.
consolidadoRouter.use(requirePerfil("ADMIN", "FINANCEIRO"));

const mesSchema = z.object({ mes: z.string().regex(/^\d{4}-\d{2}$/, "Informe o mês no formato AAAA-MM") });

consolidadoRouter.get("/", async (req, res) => {
  const { mes } = mesSchema.parse(req.query);
  res.json(await calcularConsolidado(mes));
});

consolidadoRouter.get("/exportar", async (req, res) => {
  const { mes } = mesSchema.parse(req.query);
  const dados = await calcularConsolidado(mes);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Controle de Motoristas — Envia Daki";
  wb.created = new Date();

  const pagar = wb.addWorksheet("Pagamento");
  pagar.columns = [
    { header: "Responsável", key: "responsavel", width: 32 },
    { header: "Chave PIX", key: "pix", width: 22 },
    { header: "Favorecido", key: "favorecido", width: 28 },
    { header: "Dados bancários", key: "banco", width: 30 },
    { header: "Base(s)", key: "bases", width: 16 },
    { header: "Motorista(s)", key: "motoristas", width: 36 },
    { header: "Total líquido (R$)", key: "total", width: 18 },
  ];
  for (const r of dados.responsaveis) {
    pagar.addRow({
      responsavel: r.responsavelNome,
      pix: r.chavePix ?? "",
      favorecido: r.favorecido ?? "",
      banco: r.dadosBancarios ?? "",
      bases: [...new Set(r.motoristas.map((m) => m.baseCodigo))].join(", "),
      motoristas: r.motoristas.map((m) => `${m.motoristaNome} (${moeda(m.totalLiquido)})`).join("; "),
      total: Number(r.totalLiquido.toFixed(2)),
    });
  }
  pagar.getRow(1).font = { bold: true };
  pagar.getColumn("total").numFmt = '"R$" #,##0.00';
  pagar.addRow({});
  pagar.addRow({ responsavel: "Total geral", total: Number(dados.totalGeral.toFixed(2)) }).font = { bold: true };

  const porBase = wb.addWorksheet("Por base");
  porBase.columns = [
    { header: "Base", key: "base", width: 16 },
    { header: "Total líquido (R$)", key: "total", width: 18 },
  ];
  dados.porBase.forEach((b) => porBase.addRow({ base: b.baseCodigo, total: Number(b.totalLiquido.toFixed(2)) }));
  porBase.getRow(1).font = { bold: true };
  porBase.getColumn("total").numFmt = '"R$" #,##0.00';

  if (dados.pendencias.length) {
    const pend = wb.addWorksheet("Pendências");
    pend.columns = [
      { header: "Base", key: "base", width: 16 },
      { header: "Semana", key: "semana", width: 24 },
      { header: "Motivo", key: "motivo", width: 40 },
    ];
    dados.pendencias.forEach((p) => pend.addRow({ base: p.baseCodigo, semana: `${p.semanaInicio} → ${p.semanaFim}`, motivo: p.motivo }));
    pend.getRow(1).font = { bold: true };
  }

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="consolidado-${mes}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});
