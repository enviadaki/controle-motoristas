import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { api, ROTULO_VEICULO, TIPOS_VEICULO, type Base, type LinhaValor, type Operacao } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dataFmt, moeda, valorParaCampo } from "../lib/format";
import { AvisoErro, Botao, Cabecalho, Campo, Carregando, Cartao, Modal, Selo, Vazio } from "../components/ui";

export function TabelaValores() {
  const { tem } = useAuth();
  const podeEditar = tem("ADMIN");
  const [baseId, setBaseId] = useState("");
  const [editando, setEditando] = useState<LinhaValor | "nova" | null>(null);
  const bases = useQuery({ queryKey: ["bases"], queryFn: () => api<Base[]>("/bases") });
  const linhas = useQuery({
    queryKey: ["tabela-valores", { baseId }],
    queryFn: () => api<LinhaValor[]>(`/tabela-valores${baseId ? `?baseId=${baseId}` : ""}`),
  });
  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Cabecalho
        titulo="Tabela de valores"
        descricao="Quanto se paga por rota em cada base, cidade e tipo de veículo. Usada no cálculo automático dos lançamentos."
        acoes={
          podeEditar && (
            <Botao onClick={() => setEditando("nova")}>
              <Plus className="h-4 w-4" /> Nova linha
            </Botao>
          )
        }
      />
      <Cartao className="mb-4 p-3">
        <select className="campo max-w-xs" value={baseId} onChange={(e) => setBaseId(e.target.value)}>
          <option value="">Todas as bases</option>
          {bases.data?.map((b) => (
            <option key={b.id} value={b.id}>{b.codigo} — {b.nome}</option>
          ))}
        </select>
      </Cartao>
      <Cartao className="overflow-x-auto">
        {linhas.isLoading ? (
          <Carregando />
        ) : !linhas.data?.length ? (
          <Vazio>Nenhum valor cadastrado ainda.</Vazio>
        ) : (
          <table className="tabela w-full min-w-[900px]">
            <thead>
              <tr>
                <th>Base</th>
                <th>Operação</th>
                <th>Cidade / rota</th>
                <th>Veículo</th>
                <th className="text-right">Seg–Sáb</th>
                <th className="text-right">Dom/Feriado</th>
                <th className="text-right">Média pct.</th>
                <th className="text-right">Adicional</th>
                <th>Vigência</th>
              </tr>
            </thead>
            <tbody>
              {linhas.data.map((l) => {
                const vigente = l.vigenciaInicio <= hoje && (!l.vigenciaFim || l.vigenciaFim >= hoje);
                return (
                  <tr key={l.id} className={podeEditar ? "cursor-pointer" : ""} onClick={() => podeEditar && setEditando(l)}>
                    <td className="font-medium">{l.baseCodigo}</td>
                    <td><Selo cor="azul">{l.operacao}</Selo></td>
                    <td>
                      {l.cidade}
                      {l.faixaKm && <span className="ml-1 text-xs text-slate-400">{l.faixaKm} km</span>}
                    </td>
                    <td>{ROTULO_VEICULO[l.tipoVeiculo]}</td>
                    <td className="text-right tabular-nums">{moeda(l.valorRotaSemana)}</td>
                    <td className="text-right tabular-nums">{moeda(l.valorRotaDomingo)}</td>
                    <td className="text-right tabular-nums">{l.mediaPacotes ?? "—"}</td>
                    <td className="text-right tabular-nums">{moeda(l.valorAdicional)}</td>
                    <td className="whitespace-nowrap text-xs">
                      {dataFmt(l.vigenciaInicio)} → {l.vigenciaFim ? dataFmt(l.vigenciaFim) : "atual"}{" "}
                      {!vigente && <Selo>fora da vigência</Selo>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Cartao>
      {editando && (
        <FormValor linha={editando === "nova" ? null : editando} bases={bases.data ?? []} aoFechar={() => setEditando(null)} />
      )}
    </>
  );
}

const CAMPOS_VALOR = [
  ["valorRotaSemana", "Rota seg. a sáb. *"],
  ["valorRotaDomingo", "Rota dom./feriado"],
  ["valorAdicional", "Valor adicional"],
  ["valorPacoteExtra", "Pacote extra (por unid.)"],
  ["valorParadaExtra", "Parada extra"],
  ["valorResgate", "Resgate (meia rota)"],
  ["valorDescontoInsucesso", "Desconto por insucesso"],
] as const;

function FormValor({ linha, bases, aoFechar }: { linha: LinhaValor | null; bases: Base[]; aoFechar: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<Record<string, string>>(() => ({
    baseId: String(linha?.baseId ?? ""),
    operacao: linha?.operacao ?? "AMAZON",
    cidade: linha?.cidade ?? "",
    faixaKm: linha?.faixaKm ?? "",
    tipoVeiculo: linha?.tipoVeiculo ?? "PASSEIO",
    mediaPacotes: linha?.mediaPacotes != null ? String(linha.mediaPacotes) : "",
    vigenciaInicio: linha?.vigenciaInicio ?? new Date().toISOString().slice(0, 10),
    vigenciaFim: linha?.vigenciaFim ?? "",
    observacoes: linha?.observacoes ?? "",
    ...Object.fromEntries(CAMPOS_VALOR.map(([k]) => [k, valorParaCampo(linha?.[k] ?? null)])),
  }));
  const [erro, setErro] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value }));
  const base = bases.find((b) => String(b.id) === f.baseId);

  const fechar = () => {
    qc.invalidateQueries({ queryKey: ["tabela-valores"] });
    aoFechar();
  };
  const salvar = useMutation({
    mutationFn: () => {
      const corpo = { ...f, vigenciaFim: f.vigenciaFim || null, mediaPacotes: f.mediaPacotes || null };
      return linha
        ? api(`/tabela-valores/${linha.id}`, { method: "PUT", body: corpo })
        : api("/tabela-valores", { method: "POST", body: corpo });
    },
    onSuccess: fechar,
    onError: (e: Error) => setErro(e.message),
  });
  const excluir = useMutation({
    mutationFn: () => api(`/tabela-valores/${linha!.id}`, { method: "DELETE" }),
    onSuccess: fechar,
    onError: (e: Error) => setErro(e.message),
  });

  return (
    <Modal
      titulo={linha ? "Editar valor" : "Novo valor"}
      aberto
      aoFechar={aoFechar}
      rodape={
        <>
          {linha && (
            <Botao
              variante="fantasma"
              className="mr-auto text-red-600"
              carregando={excluir.isPending}
              onClick={() => confirm("Excluir esta linha da tabela de valores?") && excluir.mutate()}
            >
              <Trash2 className="h-4 w-4" /> Excluir
            </Botao>
          )}
          <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
          <Botao carregando={salvar.isPending} onClick={() => { setErro(null); salvar.mutate(); }}>Salvar</Botao>
        </>
      }
    >
      <AvisoErro>{erro}</AvisoErro>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Base *">
          <select className="campo" value={f.baseId} onChange={set("baseId")}>
            <option value="">Selecione…</option>
            {bases.map((b) => (
              <option key={b.id} value={b.id}>{b.codigo} — {b.nome}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Operação *">
          <select className="campo" value={f.operacao} onChange={set("operacao")}>
            {(base?.operacoes ?? (["AMAZON", "SHOPEE", "LOGGI"] as Operacao[])).map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Tipo de veículo *">
          <select className="campo" value={f.tipoVeiculo} onChange={set("tipoVeiculo")}>
            {TIPOS_VEICULO.map((t) => (
              <option key={t} value={t}>{ROTULO_VEICULO[t]}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Cidade ou rota *" className="sm:col-span-2">
          <input className="campo" value={f.cidade} onChange={set("cidade")} placeholder="Ex.: Cruz das Almas-BA" />
        </Campo>
        <Campo rotulo="Faixa de KM">
          <input className="campo" value={f.faixaKm} onChange={set("faixaKm")} placeholder="Ex.: 50 - 100" />
        </Campo>
        {CAMPOS_VALOR.map(([k, rotulo]) => (
          <Campo key={k} rotulo={`${rotulo} (R$)`}>
            <input className="campo text-right tabular-nums" inputMode="decimal" value={f[k]} onChange={set(k)} placeholder="0,00" />
          </Campo>
        ))}
        <Campo rotulo="Média de pacotes inclusos" dica="Pacotes cobertos pelo valor da rota">
          <input className="campo text-right" inputMode="numeric" value={f.mediaPacotes} onChange={set("mediaPacotes")} />
        </Campo>
        <Campo rotulo="Vigência — início *">
          <input className="campo" type="date" value={f.vigenciaInicio} onChange={set("vigenciaInicio")} />
        </Campo>
        <Campo rotulo="Vigência — fim" dica="Em branco = vale até nova tabela">
          <input className="campo" type="date" value={f.vigenciaFim} onChange={set("vigenciaFim")} />
        </Campo>
        <Campo rotulo="Observações" className="sm:col-span-3">
          <input className="campo" value={f.observacoes} onChange={set("observacoes")} />
        </Campo>
      </div>
    </Modal>
  );
}
