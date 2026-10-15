import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { api, type Consolidado } from "../lib/api";
import { dataFmt, moeda } from "../lib/format";
import { Botao, Cabecalho, Carregando, Cartao, Selo, Vazio } from "../components/ui";

function mesAtual() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 7);
}
function somarMeses(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function rotuloMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

// Consolidado do Financeiro (Passo 4): junta os fechamentos semanais de
// todas as bases dentro do mês (semana entra no mês da sua segunda-feira) e
// agrupa por quem recebe o pagamento — pronto pro Financeiro pagar e
// exportar pro dia 10, mesmo que ainda falte alguma semana fechar.
export function Consolidado() {
  const [mes, setMes] = useState(mesAtual());

  const consolidado = useQuery({
    queryKey: ["consolidado", mes],
    queryFn: () => api<Consolidado>(`/consolidado?mes=${mes}`),
  });

  return (
    <>
      <Cabecalho
        titulo="Consolidado do Financeiro"
        descricao="Todas as bases juntas, agrupado por quem recebe o pagamento — pronto para o dia 10."
        acoes={
          <>
            <Link
              to="/notas-fiscais"
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <FileText className="h-4 w-4" /> Notas fiscais
            </Link>
            <Botao variante="secundario" onClick={() => window.open(`/api/consolidado/exportar?mes=${mes}`, "_blank")}>
              <Download className="h-4 w-4" /> Exportar Excel
            </Botao>
          </>
        }
      />

      <Cartao className="mb-4 flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-1">
          <button className="rounded p-1.5 hover:bg-slate-100" onClick={() => setMes((m) => somarMeses(m, -1))} aria-label="Mês anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input className="campo w-auto" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
          <button className="rounded p-1.5 hover:bg-slate-100" onClick={() => setMes((m) => somarMeses(m, 1))} aria-label="Próximo mês">
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="ml-2 text-sm capitalize text-slate-600">{rotuloMes(mes)}</span>
        </div>
        {consolidado.data && (
          <div className="text-sm text-slate-500">
            {consolidado.data.semanas.length} semana(s) no mês · Total geral{" "}
            <span className="font-semibold text-slate-900">{moeda(consolidado.data.totalGeral)}</span>
          </div>
        )}
      </Cartao>

      {consolidado.isLoading ? (
        <Cartao><Carregando /></Cartao>
      ) : !consolidado.data ? (
        <Cartao><Vazio>Não foi possível calcular o consolidado.</Vazio></Cartao>
      ) : (
        <>
          {consolidado.data.pendencias.length > 0 && (
            <Cartao className="mb-4 border-amber-200 bg-amber-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-800">
                <AlertTriangle className="h-4 w-4" /> {consolidado.data.pendencias.length} semana(s) ainda pendente(s) neste mês — os
                valores abaixo não incluem essas semanas.
              </div>
              <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-amber-800">
                {consolidado.data.pendencias.map((p, i) => (
                  <li key={i}>
                    <span className="font-medium">{p.baseCodigo}</span> — {dataFmt(p.semanaInicio)} → {dataFmt(p.semanaFim)}: {p.motivo}
                  </li>
                ))}
              </ul>
            </Cartao>
          )}

          <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {consolidado.data.porBase.map((b) => (
              <Cartao key={b.baseId} className="px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{b.baseCodigo}</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{moeda(b.totalLiquido)}</div>
              </Cartao>
            ))}
          </div>

          <Cartao className="overflow-x-auto">
            {!consolidado.data.responsaveis.length ? (
              <Vazio>Nenhum valor a pagar neste mês ainda.</Vazio>
            ) : (
              <table className="tabela w-full min-w-[900px]">
                <thead>
                  <tr>
                    <th>Responsável</th>
                    <th>PIX / dados bancários</th>
                    <th>Motoristas</th>
                    <th className="text-right">Total líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {consolidado.data.responsaveis.map((r) => (
                    <tr key={r.responsavelId}>
                      <td className="font-medium">
                        {r.responsavelNome}
                        {r.motoristas.length > 1 && <Selo cor="azul">responde por {r.motoristas.length}</Selo>}
                      </td>
                      <td className="text-xs text-slate-600">
                        {r.chavePix && <div>PIX: {r.chavePix}</div>}
                        {r.favorecido && <div>{r.favorecido}</div>}
                        {r.dadosBancarios && <div className="text-slate-400">{r.dadosBancarios}</div>}
                        {!r.chavePix && !r.favorecido && !r.dadosBancarios && "—"}
                      </td>
                      <td className="text-xs text-slate-600">
                        {r.motoristas.map((m) => (
                          <div key={m.motoristaId}>
                            {m.motoristaNome} <span className="text-slate-400">({m.baseCodigo})</span> — {moeda(m.totalLiquido)}
                          </div>
                        ))}
                      </td>
                      <td className="text-right font-semibold tabular-nums">{moeda(r.totalLiquido)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td colSpan={3}>Total geral</td>
                    <td className="text-right tabular-nums">{moeda(consolidado.data.totalGeral)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </Cartao>
        </>
      )}
    </>
  );
}
