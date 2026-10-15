import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { api, ROTULO_ACAO, type Desconto } from "../lib/api";
import { dataFmt, moeda } from "../lib/format";
import { AvisoErro, Botao, Cabecalho, Carregando, Cartao, Modal, Vazio } from "../components/ui";

// Primeira tela do CFO (Linsmar) ao entrar — é o único perfil que autoriza
// parcelamento de desconto; sem essa aprovação, o parcelamento lançado pela
// Descontos fica pendente e não vale ainda.
export function AprovacaoParcelamentos() {
  const qc = useQueryClient();
  const [rejeitando, setRejeitando] = useState<Desconto | null>(null);

  const pendentes = useQuery({
    queryKey: ["descontos", { statusParcelamento: "PENDENTE" }],
    queryFn: () => api<Desconto[]>("/descontos?statusParcelamento=PENDENTE"),
  });

  const decidir = useMutation({
    mutationFn: ({ id, aprovado, motivoRejeicao }: { id: number; aprovado: boolean; motivoRejeicao?: string }) =>
      api(`/descontos/${id}/aprovar-parcelamento`, { method: "PUT", body: { aprovado, motivoRejeicao } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["descontos"] });
      setRejeitando(null);
    },
  });

  return (
    <>
      <Cabecalho
        titulo="Aprovação de parcelamentos"
        descricao="Descontos que a área de Descontos marcou como parcelados — só valem depois da sua autorização."
      />
      <Cartao className="overflow-x-auto">
        {pendentes.isLoading ? (
          <Carregando />
        ) : !pendentes.data?.length ? (
          <Vazio>Nenhum parcelamento pendente de aprovação no momento.</Vazio>
        ) : (
          <table className="tabela w-full min-w-[900px]">
            <thead>
              <tr>
                <th>Base</th>
                <th>Responsável</th>
                <th>Motivo</th>
                <th>Ação</th>
                <th className="text-right">Valor</th>
                <th className="text-right">Parcelas</th>
                <th>Período</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pendentes.data.map((d) => (
                <tr key={d.id}>
                  <td className="font-medium">{d.baseCodigo}</td>
                  <td>
                    {d.nomeResponsavel}
                    {d.tbr && <div className="text-xs text-slate-400">{d.tbr}</div>}
                  </td>
                  <td className="max-w-xs truncate" title={d.motivo}>{d.motivo}</td>
                  <td className="text-xs">{ROTULO_ACAO[d.acao]}</td>
                  <td className="text-right tabular-nums">{moeda(d.valor)}</td>
                  <td className="text-right tabular-nums">{d.parcelas}x</td>
                  <td className="whitespace-nowrap text-xs">
                    {d.periodoApuracao}
                    {d.mesCobranca && <div className="text-slate-400">{dataFmt(d.mesCobranca)}</div>}
                  </td>
                  <td className="whitespace-nowrap">
                    <div className="flex justify-end gap-1.5">
                      <Botao
                        variante="secundario"
                        className="px-2.5 py-1.5 text-xs text-red-600"
                        onClick={() => setRejeitando(d)}
                        disabled={decidir.isPending}
                      >
                        <X className="h-3.5 w-3.5" /> Rejeitar
                      </Botao>
                      <Botao
                        className="px-2.5 py-1.5 text-xs"
                        carregando={decidir.isPending}
                        onClick={() => decidir.mutate({ id: d.id, aprovado: true })}
                      >
                        <Check className="h-3.5 w-3.5" /> Aprovar
                      </Botao>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Cartao>
      {rejeitando && (
        <RejeitarModal
          desconto={rejeitando}
          carregando={decidir.isPending}
          aoFechar={() => setRejeitando(null)}
          aoConfirmar={(motivo) => decidir.mutate({ id: rejeitando.id, aprovado: false, motivoRejeicao: motivo })}
        />
      )}
    </>
  );
}

function RejeitarModal({
  desconto,
  carregando,
  aoFechar,
  aoConfirmar,
}: {
  desconto: Desconto;
  carregando: boolean;
  aoFechar: () => void;
  aoConfirmar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  return (
    <Modal
      titulo="Rejeitar parcelamento"
      aberto
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="perigo" carregando={carregando} onClick={() => aoConfirmar(motivo)}>Rejeitar</Botao>
        </>
      }
    >
      <AvisoErro>{null}</AvisoErro>
      <p className="mb-3 text-sm text-slate-600">
        {desconto.nomeResponsavel} — {moeda(desconto.valor)} em {desconto.parcelas}x. A Descontos vai precisar ajustar e
        reenviar pra uma nova aprovação.
      </p>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Motivo (opcional)</span>
        <textarea className="campo" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </label>
    </Modal>
  );
}
