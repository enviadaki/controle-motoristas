import { and, asc, eq, gte, lte, or, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { lancamentos, motoristas, tabelaValores, type TipoVeiculo } from "../db/schema.js";
import { semanaDe } from "./util.js";

// ---------------------------------------------------------------------------
// Cálculo do valor da semana de um motorista, a partir dos lançamentos
// diários do líder + da tabela de valores vigente. Modelo (confirmado com o
// Rafael, estilo "SAJ"):
//   - Rodou pelo menos 1 dia seg.–sáb. na semana -> recebe o valor fixo da
//     rota (valorRotaSemana) + valorAdicional, por completo (não é rateado
//     por dia).
//   - Rodou também no domingo -> some valorRotaDomingo.
//   - Pacotes entregues acima da média inclusa (mediaPacotes) geram
//     valorPacoteExtra por unidade.
//   - Paradas extras e resgates somam valorParadaExtra / valorResgate.
//   - Cada pacote em insucesso desconta valorDescontoInsucesso (o motorista
//     não perde o valor fixo da rota por não completar — perde por pacote).
// Isto é o cálculo "operacional" (Passo 1). Os descontos de avaria/extravio
// lançados pela área de Descontos (Passo 2) entram depois, por fora disto.
// ---------------------------------------------------------------------------

export interface ResumoSemana {
  motoristaId: number;
  semanaInicio: string;
  semanaFim: string;
  diasTrabalhados: number;
  trabalhouDomingo: boolean;
  pacotesEntregues: number;
  pacotesInsucesso: number;
  paradasExtras: number;
  resgates: number;
  tabelaValorId: number | null;
  avisoValor: string | null; // ex.: "nenhuma tabela de valor vigente" / "mais de uma tabela compatível"
  valorRotaSemana: number;
  valorRotaDomingo: number;
  valorAdicional: number;
  valorPacotesExtra: number;
  valorParadasExtra: number;
  valorResgates: number;
  valorDescontoInsucesso: number;
  valorTotal: number;
}

async function buscarTabelaVigente(
  baseId: number,
  tipoVeiculo: TipoVeiculo | null,
  rotaPadrao: string | null,
  dataRef: string,
) {
  if (!tipoVeiculo || !rotaPadrao) {
    return { linha: null, aviso: "Motorista sem tipo de veículo ou rota padrão cadastrada" as const };
  }
  const candidatas = await db
    .select()
    .from(tabelaValores)
    .where(
      and(
        eq(tabelaValores.baseId, baseId),
        eq(tabelaValores.tipoVeiculo, tipoVeiculo),
        eq(tabelaValores.cidade, rotaPadrao),
        lte(tabelaValores.vigenciaInicio, dataRef),
        or(isNull(tabelaValores.vigenciaFim), gte(tabelaValores.vigenciaFim, dataRef)),
      ),
    )
    .orderBy(asc(tabelaValores.vigenciaInicio));
  if (candidatas.length === 0) return { linha: null, aviso: "Nenhuma tabela de valor vigente para esta rota/veículo" as const };
  if (candidatas.length > 1) {
    // Mais de uma operação com a mesma cidade/veículo vigente (ex.: VDC com
    // AMAZON e SHOPEE) — não dá pra saber qual usar sem ambiguidade; fica
    // pendente de ajuste manual (Admin pode fechar a vigência de uma delas).
    return { linha: candidatas[candidatas.length - 1], aviso: "Mais de uma tabela de valor compatível — confira a vigência" as const };
  }
  return { linha: candidatas[0], aviso: null };
}

export async function calcularSemanaMotorista(motoristaId: number, dataRef: string): Promise<ResumoSemana> {
  const { inicio, fim } = semanaDe(dataRef);
  const [motorista] = await db.select().from(motoristas).where(eq(motoristas.id, motoristaId));
  if (!motorista) throw Object.assign(new Error("Motorista não encontrado"), { status: 404 });

  const dias = await db
    .select()
    .from(lancamentos)
    .where(and(eq(lancamentos.motoristaId, motoristaId), gte(lancamentos.data, inicio), lte(lancamentos.data, fim)));

  const trabalhados = dias.filter((d) => d.rodou);
  const diasSegASab = trabalhados.filter((d) => {
    const dow = new Date(`${d.data}T00:00:00Z`).getUTCDay();
    return dow !== 0;
  });
  const trabalhouDomingo = trabalhados.some((d) => new Date(`${d.data}T00:00:00Z`).getUTCDay() === 0);

  const soma = (campo: "pacotesEntregues" | "pacotesInsucesso" | "paradasExtras" | "resgates") =>
    dias.reduce((acc, d) => acc + d[campo], 0);
  const pacotesEntregues = soma("pacotesEntregues");
  const pacotesInsucesso = soma("pacotesInsucesso");
  const paradasExtras = soma("paradasExtras");
  const resgates = soma("resgates");

  const { linha: tv, aviso } = await buscarTabelaVigente(motorista.baseId, motorista.tipoVeiculo, motorista.rotaPadrao, inicio);

  const n = (v: string | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));
  const rodouNaSemana = diasSegASab.length > 0;

  const valorRotaSemana = rodouNaSemana ? n(tv?.valorRotaSemana) : 0;
  const valorAdicional = rodouNaSemana ? n(tv?.valorAdicional) : 0;
  const valorRotaDomingo = trabalhouDomingo ? n(tv?.valorRotaDomingo) : 0;
  const pacotesExtra = tv?.mediaPacotes != null ? Math.max(0, pacotesEntregues - tv.mediaPacotes) : 0;
  const valorPacotesExtra = pacotesExtra * n(tv?.valorPacoteExtra);
  const valorParadasExtra = paradasExtras * n(tv?.valorParadaExtra);
  const valorResgates = resgates * n(tv?.valorResgate);
  const valorDescontoInsucesso = pacotesInsucesso * n(tv?.valorDescontoInsucesso);

  const valorTotal = Math.max(
    0,
    valorRotaSemana + valorAdicional + valorRotaDomingo + valorPacotesExtra + valorParadasExtra + valorResgates - valorDescontoInsucesso,
  );

  return {
    motoristaId,
    semanaInicio: inicio,
    semanaFim: fim,
    diasTrabalhados: diasSegASab.length,
    trabalhouDomingo,
    pacotesEntregues,
    pacotesInsucesso,
    paradasExtras,
    resgates,
    tabelaValorId: tv?.id ?? null,
    avisoValor: aviso,
    valorRotaSemana,
    valorRotaDomingo,
    valorAdicional,
    valorPacotesExtra,
    valorParadasExtra,
    valorResgates,
    valorDescontoInsucesso,
    valorTotal,
  };
}
