import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Download, Lock, Unlock, Upload } from "lucide-react";
import { api, apiUpload, type Base, type FechamentoHistorico, type ResumoFechamento } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dataFmt, moeda } from "../lib/format";
import { AvisoErro, Botao, Cabecalho, Carregando, Cartao, Modal, Selo, Vazio } from "../components/ui";

function hojeISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function somarDias(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Fechamento semanal por base (Passo 3): junta o resumo do Passo 1 com os
// descontos aprovados do Passo 2 e acende o farol. O líder anexa a nota
// fiscal e fecha; Admin/Financeiro conferem o histórico e podem reabrir.
export function Fechamentos() {
  const { usuario, tem } = useAuth();
  const [data, setData] = useState(hojeISO());
  const [baseId, setBaseId] = useState("");
  const [fechando, setFechando] = useState(false);
  const qc = useQueryClient();

  const bases = useQuery({ queryKey: ["bases"], queryFn: () => api<Base[]>("/bases") });
  const basesVisiveis = usuario?.baseIds?.length ? bases.data?.filter((b) => usuario.baseIds.includes(b.id)) : bases.data;
  useEffect(() => {
    if (baseId || !bases.data?.length) return;
    const minhas = usuario?.baseIds?.length ? bases.data.filter((b) => usuario.baseIds.includes(b.id)) : bases.data;
    if (minhas[0]) setBaseId(String(minhas[0].id));
  }, [bases.data, usuario, baseId]);

  const resumo = useQuery({
    queryKey: ["fechamentos-resumo", { baseId, data }],
    queryFn: () => api<ResumoFechamento>(`/fechamentos/resumo?baseId=${baseId}&data=${data}`),
    enabled: !!baseId,
  });

  const reabrir = useMutation({
    mutationFn: (id: number) => api(`/fechamentos/${id}/reabrir`, { method: "PUT" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fechamentos-resumo"] }),
  });

  const fechado = resumo.data?.fechamento?.status === "FECHADO";
  const podeFechar = tem("ADMIN", "FINANCEIRO", "LIDER");
  const podeReabrir = tem("ADMIN", "FINANCEIRO");

  return (
    <>
      <Cabecalho
        titulo="Fechamento semanal"
        descricao="Confere o farol da semana (operação + descontos) e anexa a nota fiscal pra fechar."
        acoes={
          <select className="campo" value={baseId} onChange={(e) => setBaseId(e.target.value)}>
            {basesVisiveis?.map((b) => (
              <option key={b.id} value={b.id}>{b.codigo} — {b.nome}</option>
            ))}
          </select>
        }
      />

      <Cartao className="mb-4 flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-1">
          <button className="rounded p-1.5 hover:bg-slate-100" onClick={() => setData((d) => somarDias(d, -7))} aria-label="Semana anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input className="campo w-auto" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          <button className="rounded p-1.5 hover:bg-slate-100" onClick={() => setData((d) => somarDias(d, 7))} aria-label="Próxima semana">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {resumo.data && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            Semana {dataFmt(resumo.data.semanaInicio)} → {dataFmt(resumo.data.semanaFim)}
            {fechado ? (
              <Selo cor="verde"><Lock className="mr-1 inline h-3 w-3" /> fechada</Selo>
            ) : resumo.data.farolVerde ? (
              <Selo cor="verde"><CheckCircle2 className="mr-1 inline h-3 w-3" /> confere</Selo>
            ) : (
              <Selo cor="vermelho"><AlertTriangle className="mr-1 inline h-3 w-3" /> pendente</Selo>
            )}
          </div>
        )}
      </Cartao>

      {!baseId ? (
        <Cartao><Vazio>Selecione uma base.</Vazio></Cartao>
      ) : resumo.isLoading ? (
        <Cartao><Carregando /></Cartao>
      ) : !resumo.data ? (
        <Cartao><Vazio>Não foi possível calcular o fechamento.</Vazio></Cartao>
      ) : (
        <>
          {!resumo.data.linhas.length ? (
            <Cartao className="mb-4"><Vazio>Nenhum motorista ativo nesta base.</Vazio></Cartao>
          ) : (
            <>
              {/* Telas largas: tabela compacta */}
              <Cartao className="mb-4 hidden overflow-x-auto sm:block">
                <table className="tabela w-full min-w-[760px]">
                  <thead>
                    <tr>
                      <th>Motorista</th>
                      <th className="text-right">Dias rodados</th>
                      <th className="text-right">Valor operacional</th>
                      <th className="text-right">Descontos</th>
                      <th className="text-right">Líquido</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumo.data.linhas.map((l) => (
                      <tr key={l.motoristaId}>
                        <td className="font-medium">{l.motoristaNome}</td>
                        <td className="text-right tabular-nums">
                          {l.resumo.diasTrabalhados}
                          {l.resumo.trabalhouDomingo && " +dom"}
                        </td>
                        <td className="text-right tabular-nums">{moeda(l.resumo.valorTotal)}</td>
                        <td className="text-right tabular-nums text-red-600">{l.descontosAplicados > 0 ? `− ${moeda(l.descontosAplicados)}` : "—"}</td>
                        <td className="text-right font-semibold tabular-nums">{moeda(l.totalLiquido)}</td>
                        <td className="whitespace-nowrap text-xs">
                          {l.temPendenciaValor && (
                            <span className="inline-flex items-center gap-1 text-amber-700">
                              <AlertTriangle className="h-3.5 w-3.5" /> {l.resumo.avisoValor}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold">
                      <td>Total</td>
                      <td></td>
                      <td className="text-right tabular-nums">{moeda(resumo.data.totalOperacional)}</td>
                      <td className="text-right tabular-nums text-red-600">{resumo.data.totalDescontos > 0 ? `− ${moeda(resumo.data.totalDescontos)}` : "—"}</td>
                      <td className="text-right tabular-nums">{moeda(resumo.data.totalLiquido)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
                {resumo.data.descontosPendentes > 0 && (
                  <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
                    {resumo.data.descontosPendentes} desconto(s) parcelado(s) ainda aguardando aprovação do CFO nesta semana — não entraram na conta.
                  </div>
                )}
              </Cartao>

              {/* Celular: um cartão por motorista */}
              <div className="mb-4 space-y-2.5 sm:hidden">
                {resumo.data.linhas.map((l) => (
                  <Cartao key={l.motoristaId} className="p-3.5">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="font-medium">{l.motoristaNome}</span>
                      <span className="text-xs text-slate-500">
                        {l.resumo.diasTrabalhados} dia(s){l.resumo.trabalhouDomingo && " +dom"}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Operacional</span>
                      <span className="tabular-nums">{moeda(l.resumo.valorTotal)}</span>
                    </div>
                    {l.descontosAplicados > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Descontos</span>
                        <span className="tabular-nums text-red-600">− {moeda(l.descontosAplicados)}</span>
                      </div>
                    )}
                    <div className="mt-1 flex justify-between border-t border-slate-100 pt-1 text-sm font-semibold">
                      <span>Líquido</span>
                      <span className="tabular-nums">{moeda(l.totalLiquido)}</span>
                    </div>
                    {l.temPendenciaValor && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {l.resumo.avisoValor}
                      </div>
                    )}
                  </Cartao>
                ))}
                <Cartao className="flex justify-between p-3.5 font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{moeda(resumo.data.totalLiquido)}</span>
                </Cartao>
                {resumo.data.descontosPendentes > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {resumo.data.descontosPendentes} desconto(s) parcelado(s) ainda aguardando aprovação do CFO — não entraram na conta.
                  </div>
                )}
              </div>
            </>
          )}

          <Cartao className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="text-sm text-slate-600">
              {fechado ? (
                <>
                  Fechada em {resumo.data.fechamento?.fechadoEm ? new Date(resumo.data.fechamento.fechadoEm).toLocaleString("pt-BR", { timeZone: "America/Bahia" }) : "—"}.
                  {resumo.data.fechamento?.notaFiscalNomeOriginal && (
                    <>
                      {" "}
                      <a
                        className="inline-flex items-center gap-1 text-marca-600 hover:underline"
                        href={`/api/fechamentos/${resumo.data.fechamento.id}/nota-fiscal`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Download className="h-3.5 w-3.5" /> {resumo.data.fechamento.notaFiscalNomeOriginal}
                      </a>
                    </>
                  )}
                </>
              ) : (
                "Semana ainda aberta."
              )}
            </div>
            <div className="flex gap-2">
              {fechado && podeReabrir && (
                <Botao
                  variante="secundario"
                  carregando={reabrir.isPending}
                  onClick={() => resumo.data?.fechamento && reabrir.mutate(resumo.data.fechamento.id)}
                >
                  <Unlock className="h-4 w-4" /> Reabrir
                </Botao>
              )}
              {!fechado && podeFechar && (
                <Botao disabled={!resumo.data.farolVerde} onClick={() => setFechando(true)}>
                  <Upload className="h-4 w-4" /> Fechar semana
                </Botao>
              )}
            </div>
          </Cartao>
        </>
      )}

      {fechando && resumo.data && (
        <FecharModal
          baseId={baseId}
          data={data}
          aoFechar={() => setFechando(false)}
          aoConcluir={() => {
            setFechando(false);
            qc.invalidateQueries({ queryKey: ["fechamentos-resumo"] });
          }}
        />
      )}
    </>
  );
}

function FecharModal({
  baseId,
  data,
  aoFechar,
  aoConcluir,
}: {
  baseId: string;
  data: string;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const fechar = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.set("baseId", baseId);
      form.set("data", data);
      if (observacoes) form.set("observacoes", observacoes);
      form.set("notaFiscal", arquivo!);
      return apiUpload("/fechamentos/fechar", form);
    },
    onSuccess: aoConcluir,
    onError: (e: Error) => setErro(e.message),
  });

  return (
    <Modal
      titulo="Fechar semana"
      aberto
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
          <Botao carregando={fechar.isPending} disabled={!arquivo} onClick={() => { setErro(null); fechar.mutate(); }}>
            Fechar semana
          </Botao>
        </>
      }
    >
      <AvisoErro>{erro}</AvisoErro>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Nota fiscal (PDF, PNG ou JPG) *</span>
          <input
            className="campo"
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Observações (opcional)</span>
          <textarea className="campo" rows={3} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}

export function FechamentosHistorico() {
  const { usuario } = useAuth();
  const [baseId, setBaseId] = useState("");
  const bases = useQuery({ queryKey: ["bases"], queryFn: () => api<Base[]>("/bases") });
  const basesVisiveis = usuario?.baseIds?.length ? bases.data?.filter((b) => usuario.baseIds.includes(b.id)) : bases.data;

  const historico = useQuery({
    queryKey: ["fechamentos-historico", { baseId }],
    queryFn: () => api<FechamentoHistorico[]>(`/fechamentos${baseId ? `?baseId=${baseId}` : ""}`),
  });

  return (
    <>
      <Cabecalho
        titulo="Histórico de fechamentos"
        descricao="Todas as semanas já fechadas, por base."
        acoes={
          <select className="campo" value={baseId} onChange={(e) => setBaseId(e.target.value)}>
            <option value="">Todas as bases</option>
            {basesVisiveis?.map((b) => (
              <option key={b.id} value={b.id}>{b.codigo} — {b.nome}</option>
            ))}
          </select>
        }
      />
      <Cartao className="overflow-x-auto">
        {historico.isLoading ? (
          <Carregando />
        ) : !historico.data?.length ? (
          <Vazio>Nenhum fechamento ainda.</Vazio>
        ) : (
          <table className="tabela w-full min-w-[800px]">
            <thead>
              <tr>
                <th>Base</th>
                <th>Semana</th>
                <th>Situação</th>
                <th>Nota fiscal</th>
                <th>Fechado por</th>
                <th>Em</th>
              </tr>
            </thead>
            <tbody>
              {historico.data.map((f) => (
                <tr key={f.id}>
                  <td className="font-medium">{f.baseCodigo}</td>
                  <td>{dataFmt(f.semanaInicio)} → {dataFmt(f.semanaFim)}</td>
                  <td>
                    {f.status === "FECHADO" ? <Selo cor="verde">Fechada</Selo> : <Selo cor="amarelo">Reaberta</Selo>}
                  </td>
                  <td>
                    {f.notaFiscalNomeOriginal ? (
                      <a className="inline-flex items-center gap-1 text-marca-600 hover:underline" href={`/api/fechamentos/${f.id}/nota-fiscal`} target="_blank" rel="noreferrer">
                        <Download className="h-3.5 w-3.5" /> {f.notaFiscalNomeOriginal}
                      </a>
                    ) : "—"}
                  </td>
                  <td className="text-slate-600">{f.fechadoPorNome ?? "—"}</td>
                  <td className="text-xs text-slate-500">{f.fechadoEm ? new Date(f.fechadoEm).toLocaleString("pt-BR", { timeZone: "America/Bahia" }) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Cartao>
    </>
  );
}
