import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "../db/index.js";
import { descontos, motoristas } from "../db/schema.js";
import { calcularSemanaMotorista, type ResumoSemana } from "./calculo.js";
import { semanaDe } from "./util.js";

// ---------------------------------------------------------------------------
// Fechamento semanal por base (Passo 3): junta o resumo operacional de cada
// motorista ativo (Passo 1, lançamentos) com os descontos de avaria/extravio
// da mesma semana (Passo 2) e acende o farol:
//   - vermelho se faltar tabela de valor pra algum motorista que rodou, ou se
//     houver desconto parcelado ainda PENDENTE de aprovação do CFO na semana;
//   - verde se não houver nenhuma dessas pendências (a semana "confere").
// Um desconto só entra na conta (totalLiquido) quando não está parcelado
// (statusParcelamento null) ou já foi APROVADO pelo CFO — um REJEITADO não
// desconta nada, mas também não é mais "pendente" (não derruba o farol).
// ---------------------------------------------------------------------------

export interface LinhaFecho {
  motoristaId: number;
  motoristaNome: string;
  resumo: ResumoSemana;
  descontosAplicados: number; // soma do que já pode ser cobrado nesta semana
  totalLiquido: number; // resumo.valorTotal - descontosAplicados (nunca < 0)
  temPendenciaValor: boolean; // avisoValor !== null e motorista rodou na semana
}

export interface ResumoFechamentoBase {
  baseId: number;
  semanaInicio: string;
  semanaFim: string;
  linhas: LinhaFecho[];
  totalOperacional: number;
  totalDescontos: number;
  totalLiquido: number;
  descontosPendentes: number; // quantidade de descontos parcelados ainda PENDENTE nesta semana
  farolVerde: boolean;
}

export async function calcularResumoFechamento(baseId: number, dataRef: string): Promise<ResumoFechamentoBase> {
  const { inicio, fim } = semanaDe(dataRef);

  const motoristasAtivos = await db
    .select({ id: motoristas.id, nome: motoristas.nome })
    .from(motoristas)
    .where(and(eq(motoristas.baseId, baseId), eq(motoristas.status, "ATIVO")));

  const descontosSemana = motoristasAtivos.length
    ? await db
        .select()
        .from(descontos)
        .where(
          and(
            eq(descontos.baseId, baseId),
            eq(descontos.semanaReferencia, inicio),
            ne(descontos.status, "CANCELADO"),
            inArray(descontos.motoristaId, motoristasAtivos.map((m) => m.id)),
          ),
        )
    : [];

  let descontosPendentes = 0;
  const porMotorista = new Map<number, number>(); // motoristaId -> soma aplicável
  for (const d of descontosSemana) {
    if (d.motoristaId === null) continue;
    if (d.statusParcelamento === "PENDENTE") {
      descontosPendentes++;
      continue; // não entra na conta enquanto o CFO não decidir
    }
    if (d.statusParcelamento === "REJEITADO") continue; // decidido, não cobra
    // null (não parcelado) ou APROVADO -> cobra
    porMotorista.set(d.motoristaId, (porMotorista.get(d.motoristaId) ?? 0) + Number(d.valor));
  }

  const linhas: LinhaFecho[] = [];
  for (const m of motoristasAtivos) {
    const resumo = await calcularSemanaMotorista(m.id, inicio);
    const descontosAplicados = porMotorista.get(m.id) ?? 0;
    const totalLiquido = Math.max(0, resumo.valorTotal - descontosAplicados);
    const temPendenciaValor = resumo.avisoValor !== null && resumo.diasTrabalhados > 0;
    linhas.push({ motoristaId: m.id, motoristaNome: m.nome, resumo, descontosAplicados, totalLiquido, temPendenciaValor });
  }

  const totalOperacional = linhas.reduce((acc, l) => acc + l.resumo.valorTotal, 0);
  const totalDescontos = linhas.reduce((acc, l) => acc + l.descontosAplicados, 0);
  const totalLiquido = linhas.reduce((acc, l) => acc + l.totalLiquido, 0);
  const farolVerde = descontosPendentes === 0 && linhas.every((l) => !l.temPendenciaValor);

  return { baseId, semanaInicio: inicio, semanaFim: fim, linhas, totalOperacional, totalDescontos, totalLiquido, descontosPendentes, farolVerde };
}
