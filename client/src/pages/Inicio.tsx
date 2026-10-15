import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle } from "lucide-react";
import { api, type Base, type LinhaValor, type Motorista } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Cabecalho, Cartao, Selo } from "../components/ui";

const ROTEIRO = [
  { passo: "Passo 0", titulo: "Cadastros: bases, motoristas, tabela de valores, usuários e perfis", feito: true },
  { passo: "Passo 1", titulo: "Lançamento diário de rota pelo líder (substitui a planilha da base)", feito: true },
  { passo: "Passo 2", titulo: "Lançamento de descontos (avaria/extravio) travados, com parcelamento autorizado pelo CFO", feito: true },
  { passo: "Passo 3", titulo: "Fechamento automático com farol + nota fiscal anexada pelo líder", feito: false },
  { passo: "Passo 4", titulo: "Consolidado do Financeiro (todas as bases, pronto para o dia 10)", feito: false },
];

export function Inicio() {
  const { usuario } = useAuth();
  const bases = useQuery({ queryKey: ["bases"], queryFn: () => api<Base[]>("/bases") });
  const motoristas = useQuery({ queryKey: ["motoristas", {}], queryFn: () => api<Motorista[]>("/motoristas") });
  const valores = useQuery({ queryKey: ["tabela-valores", {}], queryFn: () => api<LinhaValor[]>("/tabela-valores") });

  const ativos = motoristas.data?.filter((m) => m.status === "ATIVO") ?? [];

  return (
    <>
      <Cabecalho titulo={`Olá, ${usuario?.nome.split(" ")[0]}`} descricao="Resumo dos cadastros por base" />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Indicador rotulo="Bases" valor={bases.data?.filter((b) => b.ativo).length} link="/bases" />
        <Indicador rotulo="Motoristas ativos" valor={ativos.length} link="/motoristas" />
        <Indicador rotulo="Linhas na tabela de valores" valor={valores.data?.length} link="/tabela-valores" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Cartao>
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Motoristas ativos por base</div>
          <table className="tabela w-full">
            <thead>
              <tr>
                <th>Base</th>
                <th>Operações</th>
                <th className="text-right">Ativos</th>
              </tr>
            </thead>
            <tbody>
              {bases.data?.map((b) => (
                <tr key={b.id}>
                  <td>
                    <span className="font-medium">{b.codigo}</span> <span className="text-slate-500">{b.nome}</span>
                  </td>
                  <td className="space-x-1">
                    {b.operacoes.map((o) => (
                      <Selo key={o} cor="azul">
                        {o}
                      </Selo>
                    ))}
                  </td>
                  <td className="text-right tabular-nums">{ativos.filter((m) => m.baseId === b.id).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Cartao>

        <Cartao>
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Roteiro do sistema</div>
          <ul className="divide-y divide-slate-100">
            {ROTEIRO.map((r) => (
              <li key={r.passo} className="flex gap-3 px-4 py-3 text-sm">
                {r.feito ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                )}
                <div>
                  <div className="font-medium">{r.passo}</div>
                  <div className="text-slate-600">{r.titulo}</div>
                </div>
              </li>
            ))}
          </ul>
        </Cartao>
      </div>
    </>
  );
}

function Indicador({ rotulo, valor, link }: { rotulo: string; valor?: number; link: string }) {
  return (
    <Link to={link}>
      <Cartao className="px-4 py-4 transition hover:border-marca-200">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{rotulo}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{valor ?? "—"}</div>
      </Cartao>
    </Link>
  );
}
