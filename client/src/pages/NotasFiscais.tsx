import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, FileText, Upload } from "lucide-react";
import { api, apiUpload, type Base, type NotasFiscaisMes } from "../lib/api";
import { useAuth } from "../lib/auth";
import { moeda } from "../lib/format";
import { AvisoErro, Botao, Cabecalho, Carregando, Cartao, Selo, Vazio } from "../components/ui";

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

// Notas fiscais mensais (Passo 4): cada responsável de pagamento tira uma
// nota só por mês, do acumulado, perto do dia 10 — não é por semana. Quem
// anexa normalmente é o líder da base; Admin/Financeiro também podem.
export function NotasFiscais() {
  const { tem } = useAuth();
  const [mes, setMes] = useState(mesAtual());
  const [baseId, setBaseId] = useState("");
  const [enviandoPara, setEnviandoPara] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const podeAnexar = tem("ADMIN", "FINANCEIRO", "LIDER");
  const bases = useQuery({ queryKey: ["bases"], queryFn: () => api<Base[]>("/bases"), enabled: tem("ADMIN", "FINANCEIRO") });
  const basesVisiveis = bases.data;

  const lista = useQuery({
    queryKey: ["notas-fiscais", { mes, baseId }],
    queryFn: () => api<NotasFiscaisMes>(`/notas-fiscais?mes=${mes}${baseId ? `&baseId=${baseId}` : ""}`),
  });

  const enviar = useMutation({
    mutationFn: ({ responsavelId, arquivo }: { responsavelId: number; arquivo: File }) => {
      const form = new FormData();
      form.set("mes", mes);
      form.set("responsavelId", String(responsavelId));
      form.set("arquivo", arquivo);
      return apiUpload("/notas-fiscais", form);
    },
    onSuccess: () => {
      setEnviandoPara(null);
      setErro(null);
      qc.invalidateQueries({ queryKey: ["notas-fiscais"] });
    },
    onError: (e: Error) => setErro(e.message),
  });

  function escolherArquivo(responsavelId: number) {
    setErro(null);
    setEnviandoPara(responsavelId);
    inputRef.current?.click();
  }
  function arquivoEscolhido(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (arquivo && enviandoPara) enviar.mutate({ responsavelId: enviandoPara, arquivo });
  }

  return (
    <>
      <Cabecalho
        titulo="Notas fiscais do mês"
        descricao="Cada responsável tira uma nota só por mês, do acumulado, perto do dia 10 — anexe aqui."
        acoes={
          tem("ADMIN", "FINANCEIRO") ? (
            <select className="campo" value={baseId} onChange={(e) => setBaseId(e.target.value)}>
              <option value="">Todas as bases</option>
              {basesVisiveis?.map((b) => (
                <option key={b.id} value={b.id}>{b.codigo} — {b.nome}</option>
              ))}
            </select>
          ) : undefined
        }
      />

      <input ref={inputRef} type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={arquivoEscolhido} />

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
      </Cartao>

      <AvisoErro>{erro}</AvisoErro>

      {lista.isLoading ? (
        <Cartao><Carregando /></Cartao>
      ) : !lista.data?.responsaveis.length ? (
        <Cartao><Vazio>Nenhum valor a pagar neste mês ainda.</Vazio></Cartao>
      ) : (
        <div className="space-y-2.5">
          {lista.data.responsaveis.map((r) => (
            <Cartao key={r.responsavelId} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <FileText className={`mt-0.5 h-7 w-7 shrink-0 ${r.nota ? "text-emerald-600" : "text-slate-400"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium text-slate-900">{r.responsavelNome}</span>
                    {r.nota ? <Selo cor="verde">enviada</Selo> : <Selo cor="amarelo">pendente</Selo>}
                  </div>
                  <div className="text-sm text-slate-500">Acumulado do mês: <span className="tabular-nums">{moeda(r.totalLiquido)}</span></div>
                  {r.nota ? (
                    <a
                      className="mt-1 inline-flex items-center gap-1 text-xs text-marca-600 hover:underline"
                      href={`/api/notas-fiscais/${r.nota.id}/arquivo`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Download className="h-3 w-3" /> {r.nota.nomeOriginal}
                    </a>
                  ) : (
                    <div className="mt-1 text-xs text-amber-700">Nota ainda não anexada</div>
                  )}
                </div>
              </div>
              {podeAnexar && (
                <Botao
                  variante="secundario"
                  className="w-full shrink-0 sm:w-auto"
                  carregando={enviar.isPending && enviandoPara === r.responsavelId}
                  onClick={() => escolherArquivo(r.responsavelId)}
                >
                  <Upload className="h-4 w-4" /> {r.nota ? "Substituir" : "Anexar"}
                </Botao>
              )}
            </Cartao>
          ))}
        </div>
      )}
    </>
  );
}
