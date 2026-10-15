import { alias } from "drizzle-orm/pg-core";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { bases, fechamentosSemanais, motoristas } from "../db/schema.js";
import { calcularResumoFechamento } from "./fechamento.js";
import { semanasDoMes } from "./util.js";

// ---------------------------------------------------------------------------
// Consolidado do Financeiro (Passo 4): junta os fechamentos semanais (Passo 3)
// de todas as bases dentro de um mês — uma semana entra no mês em que cai sua
// segunda-feira — e agrupa o líquido por quem efetivamente recebe o
// pagamento (responsavelPagamentoId do motorista, quando tem; senão o
// próprio motorista). Mostra o que já tiver, mesmo com semana pendente de
// fechar — a lista de pendências deixa claro o que falta pro Financeiro.
// ---------------------------------------------------------------------------

export interface MotoristaConsolidado {
  motoristaId: number;
  motoristaNome: string;
  baseId: number;
  baseCodigo: string;
  totalLiquido: number;
}

export interface ResponsavelConsolidado {
  responsavelId: number; // id do motorista que recebe (ele mesmo, se não tem responsável)
  responsavelNome: string;
  chavePix: string | null;
  favorecido: string | null;
  dadosBancarios: string | null;
  motoristas: MotoristaConsolidado[];
  totalLiquido: number;
}

export interface BaseConsolidado {
  baseId: number;
  baseCodigo: string;
  totalLiquido: number;
}

export interface PendenciaConsolidado {
  baseId: number;
  baseCodigo: string;
  semanaInicio: string;
  semanaFim: string;
  motivo: string;
}

export interface Consolidado {
  mes: string;
  semanas: string[];
  responsaveis: ResponsavelConsolidado[];
  porBase: BaseConsolidado[];
  totalGeral: number;
  pendencias: PendenciaConsolidado[];
}

export async function calcularConsolidado(mes: string): Promise<Consolidado> {
  const semanas = semanasDoMes(mes);
  const todasBases = await db.select().from(bases).where(eq(bases.ativo, true));

  const responsavelAlias = alias(motoristas, "responsavel_pagamento");
  const todosMotoristas = await db
    .select({
      id: motoristas.id,
      baseId: motoristas.baseId,
      responsavelPagamentoId: motoristas.responsavelPagamentoId,
      responsavelNome: responsavelAlias.nome,
      responsavelChavePix: responsavelAlias.chavePix,
      responsavelFavorecido: responsavelAlias.favorecido,
      responsavelDadosBancarios: responsavelAlias.dadosBancarios,
      nome: motoristas.nome,
      chavePix: motoristas.chavePix,
      favorecido: motoristas.favorecido,
      dadosBancarios: motoristas.dadosBancarios,
    })
    .from(motoristas)
    .leftJoin(responsavelAlias, eq(responsavelAlias.id, motoristas.responsavelPagamentoId));
  const porMotoristaId = new Map(todosMotoristas.map((m) => [m.id, m]));

  const pendencias: PendenciaConsolidado[] = [];
  const acumuladoMotorista = new Map<number, number>(); // motoristaId -> soma do líquido no mês
  const porBase = new Map<number, number>();

  for (const base of todasBases) {
    for (const semanaInicio of semanas) {
      const resumo = await calcularResumoFechamento(base.id, semanaInicio);
      const [registro] = await db
        .select()
        .from(fechamentosSemanais)
        .where(and(eq(fechamentosSemanais.baseId, base.id), eq(fechamentosSemanais.semanaInicio, resumo.semanaInicio)));
      const fechado = registro?.status === "FECHADO";

      if (!fechado) {
        pendencias.push({
          baseId: base.id,
          baseCodigo: base.codigo,
          semanaInicio: resumo.semanaInicio,
          semanaFim: resumo.semanaFim,
          motivo: resumo.farolVerde ? "Semana ainda não fechada" : "Farol vermelho — confira pendências no fechamento",
        });
      }

      for (const linha of resumo.linhas) {
        acumuladoMotorista.set(linha.motoristaId, (acumuladoMotorista.get(linha.motoristaId) ?? 0) + linha.totalLiquido);
        porBase.set(base.id, (porBase.get(base.id) ?? 0) + linha.totalLiquido);
      }
    }
  }

  const porResponsavel = new Map<number, ResponsavelConsolidado>();
  for (const [motoristaId, total] of acumuladoMotorista) {
    const m = porMotoristaId.get(motoristaId);
    if (!m) continue;
    const base = todasBases.find((b) => b.id === m.baseId);
    const responsavelId = m.responsavelPagamentoId ?? m.id;
    const existente = porResponsavel.get(responsavelId);
    const linhaMotorista: MotoristaConsolidado = {
      motoristaId,
      motoristaNome: m.nome,
      baseId: base?.id ?? 0,
      baseCodigo: base?.codigo ?? "—",
      totalLiquido: total,
    };
    if (existente) {
      existente.motoristas.push(linhaMotorista);
      existente.totalLiquido += total;
    } else {
      porResponsavel.set(responsavelId, {
        responsavelId,
        responsavelNome: m.responsavelPagamentoId ? (m.responsavelNome ?? m.nome) : m.nome,
        chavePix: m.responsavelPagamentoId ? m.responsavelChavePix : m.chavePix,
        favorecido: m.responsavelPagamentoId ? m.responsavelFavorecido : m.favorecido,
        dadosBancarios: m.responsavelPagamentoId ? m.responsavelDadosBancarios : m.dadosBancarios,
        motoristas: [linhaMotorista],
        totalLiquido: total,
      });
    }
  }

  const totalGeral = [...porBase.values()].reduce((a, b) => a + b, 0);

  return {
    mes,
    semanas,
    responsaveis: [...porResponsavel.values()].sort((a, b) => a.responsavelNome.localeCompare(b.responsavelNome, "pt-BR")),
    porBase: todasBases
      .map((b) => ({ baseId: b.id, baseCodigo: b.codigo, totalLiquido: porBase.get(b.id) ?? 0 }))
      .filter((b) => b.totalLiquido > 0 || pendencias.some((p) => p.baseId === b.baseId)),
    totalGeral,
    pendencias,
  };
}
