import { and, asc, eq, gte, lte, or, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  lancamentos,
  motoristas,
  tabelaValores,
  tabelaValoresDuracoes,
  valoresMotorista,
  type ModeloCalculo,
  type TipoVeiculo,
} from "../db/schema.js";
import { semanaDe } from "./util.js";

// ---------------------------------------------------------------------------
// Cálculo do valor da semana de um motorista, a partir dos lançamentos
// diários do líder + da tabela de valores vigente da rota dele. Cada rota tem
// um modelo de cálculo (tabela_valores.modeloCalculo):
//
//   ROTA_FIXA (estilo "SAJ", o modelo original):
//     - Rodou pelo menos 1 dia seg.–sáb. -> valor fixo da rota
//       (valorRotaSemana) + valorAdicional, por completo (não é rateado).
//     - Rodou também no domingo -> soma valorRotaDomingo.
//     - Pacotes acima da média inclusa (mediaPacotes) -> valorPacoteExtra/unid.
//   POR_PACOTE (rotas filhas do interior):
//     - Cada pacote entregue × valor por pacote do DIA: o valor individual do
//       motorista vigente naquele dia (valores_motorista) ou, se não houver, o
//       valorPacote da rota.
//   POR_PARADA:
//     - Paradas lançadas × valorParada.
//   ROTA_HORA:
//     - Cada dia rodado vale o valor da duração que o líder marcou (6h, 8h...,
//       cadastradas por rota em tabela_valores_duracoes) + o valor do
//       complemento, se pediram uma rota extra de outra duração no dia.
//   Domingo nos três modelos acima: se houver valor de domingo cadastrado, ele
//   vale no domingo; em branco, domingo vale igual aos outros dias. No POR_PACOTE
//   a ordem é: domingo do motorista > domingo da rota > valor normal do dia.
//
// Em TODOS os modelos: paradas extras e resgates somam (valorParadaExtra /
// valorResgate) e cada pacote em insucesso desconta valorDescontoInsucesso.
// Isto é o cálculo "operacional" (Passo 1). Os descontos de avaria/extravio
// lançados pela área de Descontos (Passo 2) entram depois, por fora disto.
// ---------------------------------------------------------------------------

// Uma linha do detalhamento do que foi produzido nos modelos por unidade
// (pacote, parada, rota de 6h/8h) — é o que aparece no resumo da semana.
export interface ItemProducao {
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  total: number;
}

export interface ResumoSemana {
  motoristaId: number;
  semanaInicio: string;
  semanaFim: string;
  modeloCalculo: ModeloCalculo | null; // null = sem tabela de valor vigente
  diasTrabalhados: number; // dias rodados de seg. a sáb.
  trabalhouDomingo: boolean;
  pacotesEntregues: number;
  pacotesInsucesso: number;
  paradas: number;
  paradasExtras: number;
  resgates: number;
  tabelaValorId: number | null;
  avisoValor: string | null; // pendências que impedem o cálculo certo (derrubam o farol)
  // ROTA_FIXA
  valorRotaSemana: number;
  valorRotaDomingo: number;
  valorAdicional: number;
  valorPacotesExtra: number;
  // POR_PACOTE / POR_PARADA / ROTA_HORA (detalhe de cada valor unitário usado)
  itensProducao: ItemProducao[];
  valorProducao: number;
  // todos os modelos
  valorParadasExtra: number;
  valorResgates: number;
  valorDescontoInsucesso: number;
  valorTotal: number;
}

type LinhaTabela = typeof tabelaValores.$inferSelect;

export async function buscarTabelaVigente(
  baseId: number,
  tipoVeiculo: TipoVeiculo | null,
  rotaPadrao: string | null,
  dataRef: string,
): Promise<{ linha: LinhaTabela | null; aviso: string | null }> {
  if (!tipoVeiculo || !rotaPadrao) {
    return { linha: null, aviso: "Motorista sem tipo de veículo ou rota padrão cadastrada" };
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
  if (candidatas.length === 0) return { linha: null, aviso: "Nenhuma tabela de valor vigente para esta rota/veículo" };
  if (candidatas.length > 1) {
    // Mais de uma operação com a mesma cidade/veículo vigente (ex.: VDC com
    // AMAZON e SHOPEE) — não dá pra saber qual usar sem ambiguidade; fica
    // pendente de ajuste manual (Admin pode fechar a vigência de uma delas).
    return { linha: candidatas[candidatas.length - 1], aviso: "Mais de uma tabela de valor compatível — confira a vigência" };
  }
  return { linha: candidatas[0], aviso: null };
}

const n = (v: string | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));
const ehDomingo = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay() === 0;
const arred = (v: number) => Math.round(v * 100) / 100;

export async function calcularSemanaMotorista(motoristaId: number, dataRef: string): Promise<ResumoSemana> {
  const { inicio, fim } = semanaDe(dataRef);
  const [motorista] = await db.select().from(motoristas).where(eq(motoristas.id, motoristaId));
  if (!motorista) throw Object.assign(new Error("Motorista não encontrado"), { status: 404 });

  const dias = await db
    .select()
    .from(lancamentos)
    .where(and(eq(lancamentos.motoristaId, motoristaId), gte(lancamentos.data, inicio), lte(lancamentos.data, fim)))
    .orderBy(asc(lancamentos.data));

  const trabalhados = dias.filter((d) => d.rodou);
  const diasSegASab = trabalhados.filter((d) => !ehDomingo(d.data));
  const trabalhouDomingo = trabalhados.some((d) => ehDomingo(d.data));
  const rodouNaSemana = diasSegASab.length > 0;

  const soma = (campo: "pacotesEntregues" | "pacotesInsucesso" | "paradas" | "paradasExtras" | "resgates") =>
    dias.reduce((acc, d) => acc + d[campo], 0);
  const pacotesEntregues = soma("pacotesEntregues");
  const pacotesInsucesso = soma("pacotesInsucesso");
  const paradas = soma("paradas");
  const paradasExtras = soma("paradasExtras");
  const resgates = soma("resgates");

  const { linha: tv, aviso } = await buscarTabelaVigente(motorista.baseId, motorista.tipoVeiculo, motorista.rotaPadrao, inicio);
  const avisos: string[] = aviso ? [aviso] : [];
  const modelo = tv?.modeloCalculo ?? null;

  let valorRotaSemana = 0;
  let valorAdicional = 0;
  let valorRotaDomingo = 0;
  let valorPacotesExtra = 0;
  const itensProducao: ItemProducao[] = [];

  if (modelo === "ROTA_FIXA") {
    valorRotaSemana = rodouNaSemana ? n(tv?.valorRotaSemana) : 0;
    valorAdicional = rodouNaSemana ? n(tv?.valorAdicional) : 0;
    valorRotaDomingo = trabalhouDomingo ? n(tv?.valorRotaDomingo) : 0;
    const pacotesExtra = tv?.mediaPacotes != null ? Math.max(0, pacotesEntregues - tv.mediaPacotes) : 0;
    valorPacotesExtra = pacotesExtra * n(tv?.valorPacoteExtra);
  } else if (modelo === "POR_PACOTE") {
    itensProducao.push(...(await producaoPorPacote(motoristaId, tv!, dias, inicio, fim, avisos)));
  } else if (modelo === "POR_PARADA") {
    const agrupar = new Agrupador();
    for (const d of dias) {
      if (d.paradas === 0) continue;
      const dom = ehDomingo(d.data) && tv!.valorParadaDomingo != null;
      const valor = dom ? tv!.valorParadaDomingo : tv!.valorParada;
      if (valor == null) continue;
      agrupar.somar(dom ? "Paradas (domingo)" : "Paradas", d.paradas, Number(valor));
    }
    if (paradas > 0 && tv!.valorParada == null) avisos.push("Rota por parada sem valor por parada cadastrado");
    itensProducao.push(...agrupar.itens());
  } else if (modelo === "ROTA_HORA") {
    itensProducao.push(...(await producaoPorDuracao(tv!, trabalhados, avisos)));
  }

  const valorProducao = arred(itensProducao.reduce((acc, i) => acc + i.total, 0));
  const valorParadasExtra = paradasExtras * n(tv?.valorParadaExtra);
  const valorResgates = resgates * n(tv?.valorResgate);
  const valorDescontoInsucesso = pacotesInsucesso * n(tv?.valorDescontoInsucesso);

  const valorTotal = arred(
    Math.max(
      0,
      valorRotaSemana +
        valorAdicional +
        valorRotaDomingo +
        valorPacotesExtra +
        valorProducao +
        valorParadasExtra +
        valorResgates -
        valorDescontoInsucesso,
    ),
  );

  return {
    motoristaId,
    semanaInicio: inicio,
    semanaFim: fim,
    modeloCalculo: modelo,
    diasTrabalhados: diasSegASab.length,
    trabalhouDomingo,
    pacotesEntregues,
    pacotesInsucesso,
    paradas,
    paradasExtras,
    resgates,
    tabelaValorId: tv?.id ?? null,
    avisoValor: avisos.length ? avisos.join(" · ") : null,
    valorRotaSemana,
    valorRotaDomingo,
    valorAdicional,
    valorPacotesExtra,
    itensProducao,
    valorProducao,
    valorParadasExtra,
    valorResgates,
    valorDescontoInsucesso,
    valorTotal,
  };
}

function item(descricao: string, quantidade: number, valorUnitario: number): ItemProducao {
  return { descricao, quantidade, valorUnitario, total: arred(quantidade * valorUnitario) };
}

// POR_PACOTE: o valor por pacote é decidido dia a dia, porque o valor
// individual do motorista pode mudar no meio da semana (nova vigência).
// Agrupa por (valor, origem) pra o resumo mostrar uma linha por valor usado.
async function producaoPorPacote(
  motoristaId: number,
  tv: LinhaTabela,
  dias: (typeof lancamentos.$inferSelect)[],
  inicio: string,
  fim: string,
  avisos: string[],
): Promise<ItemProducao[]> {
  const individuais = await db
    .select()
    .from(valoresMotorista)
    .where(
      and(
        eq(valoresMotorista.motoristaId, motoristaId),
        lte(valoresMotorista.vigenciaInicio, fim),
        or(isNull(valoresMotorista.vigenciaFim), gte(valoresMotorista.vigenciaFim, inicio)),
      ),
    )
    .orderBy(asc(valoresMotorista.vigenciaInicio));

  const agrupar = new Agrupador();
  let pacotesSemValor = 0;
  for (const d of dias) {
    if (d.pacotesEntregues === 0) continue;
    const domingo = ehDomingo(d.data);
    // Se houver sobreposição de vigências, vale a que começou por último.
    const vigente = individuais
      .filter((v) => v.vigenciaInicio <= d.data && (!v.vigenciaFim || v.vigenciaFim >= d.data))
      .at(-1);
    let valor: string | null = null;
    let origem = "";
    if (domingo && vigente?.valorPacoteDomingo != null) [valor, origem] = [vigente.valorPacoteDomingo, "valor do motorista, domingo"];
    else if (domingo && tv.valorPacoteDomingo != null) [valor, origem] = [tv.valorPacoteDomingo, "valor da rota, domingo"];
    else if (vigente) [valor, origem] = [vigente.valorPacote, "valor do motorista"];
    else if (tv.valorPacote != null) [valor, origem] = [tv.valorPacote, "valor da rota"];
    if (valor === null) {
      pacotesSemValor += d.pacotesEntregues;
      continue;
    }
    agrupar.somar(`Pacotes entregues (${origem})`, d.pacotesEntregues, Number(valor));
  }
  if (pacotesSemValor > 0) {
    avisos.push(`${pacotesSemValor} pacote(s) sem valor por pacote cadastrado (nem do motorista, nem da rota)`);
  }
  return agrupar.itens();
}

// ROTA_HORA: cada dia rodado vale a duração principal marcada pelo líder +
// o complemento (se houver), pelos valores cadastrados na linha da tabela.
async function producaoPorDuracao(
  tv: LinhaTabela,
  trabalhados: (typeof lancamentos.$inferSelect)[],
  avisos: string[],
): Promise<ItemProducao[]> {
  const duracoes = await db.select().from(tabelaValoresDuracoes).where(eq(tabelaValoresDuracoes.tabelaValorId, tv.id));
  const porHoras = new Map(duracoes.map((d) => [d.horas, d]));
  const agrupar = new Agrupador();
  const semValor = new Set<number>();
  let semDuracao = 0;
  for (const d of trabalhados) {
    if (d.horasRota == null) semDuracao++;
    const domingo = ehDomingo(d.data);
    for (const [horas, tipo] of [
      [d.horasRota, "Rota"],
      [d.horasComplemento, "Complemento"],
    ] as const) {
      if (horas == null) continue;
      const faixa = porHoras.get(horas);
      if (!faixa) {
        semValor.add(horas);
        continue;
      }
      const dom = domingo && faixa.valorDomingo != null;
      agrupar.somar(`${tipo} de ${horas}h${dom ? " (domingo)" : ""}`, 1, Number(dom ? faixa.valorDomingo : faixa.valor));
    }
  }
  if (semDuracao > 0) avisos.push(`${semDuracao} dia(s) rodado(s) sem a duração da rota informada`);
  for (const h of semValor) avisos.push(`Sem valor cadastrado para rota de ${h}h nesta rota`);
  return agrupar.itens();
}

// Junta quantidades com a mesma descrição e o mesmo valor unitário numa
// linha só do resumo (ex.: "Rota de 8h: 4 × R$ 160,00").
class Agrupador {
  private grupos = new Map<string, { descricao: string; quantidade: number; valorUnitario: number }>();
  somar(descricao: string, quantidade: number, valorUnitario: number) {
    const chave = `${descricao}|${valorUnitario}`;
    const g = this.grupos.get(chave) ?? { descricao, quantidade: 0, valorUnitario };
    g.quantidade += quantidade;
    this.grupos.set(chave, g);
  }
  itens(): ItemProducao[] {
    return [...this.grupos.values()].map((g) => item(g.descricao, g.quantidade, g.valorUnitario));
  }
}

// Modelo de cálculo vigente da rota de um motorista numa data (e, se for
// ROTA_HORA, as durações cadastradas) — a tela de lançamentos usa isto pra
// mostrar só os campos que importam pra cada um.
export interface ModeloMotorista {
  modelo: ModeloCalculo | null;
  duracoes: number[];
}

export async function modeloVigenteMotorista(
  m: { baseId: number; tipoVeiculo: TipoVeiculo | null; rotaPadrao: string | null },
  dataRef: string,
): Promise<ModeloMotorista> {
  const { linha } = await buscarTabelaVigente(m.baseId, m.tipoVeiculo, m.rotaPadrao, dataRef);
  if (!linha) return { modelo: null, duracoes: [] };
  if (linha.modeloCalculo !== "ROTA_HORA") return { modelo: linha.modeloCalculo, duracoes: [] };
  const duracoes = await db
    .select({ horas: tabelaValoresDuracoes.horas })
    .from(tabelaValoresDuracoes)
    .where(eq(tabelaValoresDuracoes.tabelaValorId, linha.id))
    .orderBy(asc(tabelaValoresDuracoes.horas));
  return { modelo: "ROTA_HORA", duracoes: duracoes.map((d) => d.horas) };
}
