import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import {
  ACOES_DESCONTO,
  api,
  ROTULO_ACAO,
  ROTULO_STATUS_DESCONTO,
  STATUS_DESCONTO,
  TIPOS_RESPONSAVEL,
  type AcaoDesconto,
  type Base,
  type Desconto,
  type Motorista,
  type StatusDesconto,
  type TipoResponsavel,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { dataFmt, moeda, valorParaCampo } from "../lib/format";
import { AvisoErro, Botao, Cabecalho, Campo, Carregando, Cartao, Modal, Selo, Vazio } from "../components/ui";

const CORES_STATUS: Record<StatusDesconto, "verde" | "amarelo" | "vermelho" | "cinza"> = {
  DEVIDO: "amarelo",
  PAGO: "verde",
  CONTESTADO: "vermelho",
  CANCELADO: "cinza",
};

export function Descontos() {
  const { tem } = useAuth();
  const podeEditar = tem("ADMIN", "DESCONTOS");
  const [baseId, setBaseId] = useState("");
  const [status, setStatus] = useState("");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Desconto | "novo" | null>(null);
  const qc = useQueryClient();

  const bases = useQuery({ queryKey: ["bases"], queryFn: () => api<Base[]>("/bases") });
  const lista = useQuery({
    queryKey: ["descontos", { baseId, status, busca }],
    queryFn: () => {
      const p = new URLSearchParams();
      if (baseId) p.set("baseId", baseId);
      if (status) p.set("status", status);
      if (busca) p.set("busca", busca);
      const qs = p.toString();
      return api<Desconto[]>(`/descontos${qs ? `?${qs}` : ""}`);
    },
  });

  const marcarStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: StatusDesconto }) =>
      api(`/descontos/${id}/status`, { method: "PUT", body: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["descontos"] }),
  });

  return (
    <>
      <Cabecalho
        titulo="Descontos de avaria/extravio"
        descricao="Lançados pela área de Descontos a partir da apuração da Amazon — travado para o líder, que só visualiza."
        acoes={
          podeEditar && (
            <Botao onClick={() => setEditando("novo")}>
              <Plus className="h-4 w-4" /> Novo desconto
            </Botao>
          )
        }
      />
      <Cartao className="mb-4 flex flex-wrap gap-2 p-3">
        <select className="campo max-w-xs" value={baseId} onChange={(e) => setBaseId(e.target.value)}>
          <option value="">Todas as bases</option>
          {bases.data?.map((b) => (
            <option key={b.id} value={b.id}>{b.codigo} — {b.nome}</option>
          ))}
        </select>
        <select className="campo max-w-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {STATUS_DESCONTO.map((s) => (
            <option key={s} value={s}>{ROTULO_STATUS_DESCONTO[s]}</option>
          ))}
        </select>
        <input
          className="campo max-w-xs"
          placeholder="Buscar por nome, TBR ou motivo"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </Cartao>
      <Cartao className="overflow-x-auto">
        {lista.isLoading ? (
          <Carregando />
        ) : !lista.data?.length ? (
          <Vazio>Nenhum desconto lançado ainda.</Vazio>
        ) : (
          <table className="tabela w-full min-w-[980px]">
            <thead>
              <tr>
                <th>Base</th>
                <th>Responsável</th>
                <th>Motivo</th>
                <th>Ação</th>
                <th className="text-right">Valor</th>
                <th>Período</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lista.data.map((d) => (
                <tr key={d.id}>
                  <td className="font-medium">{d.baseCodigo}</td>
                  <td>
                    {d.nomeResponsavel}
                    {d.parcelas > 1 && <span className="ml-1 text-xs text-slate-400">({d.parcelaAtual}/{d.parcelas})</span>}
                    {d.tbr && <div className="text-xs text-slate-400">{d.tbr}</div>}
                  </td>
                  <td className="max-w-xs truncate" title={d.motivo}>{d.motivo}</td>
                  <td className="text-xs">{ROTULO_ACAO[d.acao]}</td>
                  <td className="text-right tabular-nums">{moeda(d.valor)}</td>
                  <td className="whitespace-nowrap text-xs">
                    {d.periodoApuracao}
                    {d.mesCobranca && <div className="text-slate-400">{dataFmt(d.mesCobranca)}</div>}
                  </td>
                  <td>
                    {podeEditar || tem("FINANCEIRO") ? (
                      <select
                        className="campo py-1 text-xs"
                        value={d.status}
                        onChange={(e) => marcarStatus.mutate({ id: d.id, status: e.target.value as StatusDesconto })}
                      >
                        {STATUS_DESCONTO.map((s) => (
                          <option key={s} value={s}>{ROTULO_STATUS_DESCONTO[s]}</option>
                        ))}
                      </select>
                    ) : (
                      <Selo cor={CORES_STATUS[d.status]}>{ROTULO_STATUS_DESCONTO[d.status]}</Selo>
                    )}
                  </td>
                  <td>
                    {podeEditar && (
                      <button className="text-xs text-marca-700 hover:underline" onClick={() => setEditando(d)}>
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Cartao>
      {editando && (
        <FormDesconto desconto={editando === "novo" ? null : editando} bases={bases.data ?? []} aoFechar={() => setEditando(null)} />
      )}
    </>
  );
}

function FormDesconto({ desconto, bases, aoFechar }: { desconto: Desconto | null; bases: Base[]; aoFechar: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState(() => ({
    baseId: String(desconto?.baseId ?? ""),
    motoristaId: desconto?.motoristaId ? String(desconto.motoristaId) : "",
    tipoResponsavel: (desconto?.tipoResponsavel ?? "MOTORISTA") as TipoResponsavel,
    nomeResponsavel: desconto?.nomeResponsavel ?? "",
    tbr: desconto?.tbr ?? "",
    motivo: desconto?.motivo ?? "",
    acao: (desconto?.acao ?? "COBRAR_ENTREGADOR") as AcaoDesconto,
    valor: valorParaCampo(desconto?.valor ?? null),
    parcelas: String(desconto?.parcelas ?? 1),
    parcelaAtual: String(desconto?.parcelaAtual ?? 1),
    periodoApuracao: desconto?.periodoApuracao ?? "",
    mesCobranca: desconto?.mesCobranca ?? "",
    origem: desconto?.origem ?? "",
    observacoes: desconto?.observacoes ?? "",
  }));
  const [erro, setErro] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value }));

  const motoristas = useQuery({
    queryKey: ["motoristas", { baseId: f.baseId }],
    queryFn: () => api<Motorista[]>(`/motoristas?baseId=${f.baseId}`),
    enabled: !!f.baseId && f.tipoResponsavel === "MOTORISTA",
  });

  const fechar = () => {
    qc.invalidateQueries({ queryKey: ["descontos"] });
    aoFechar();
  };
  const salvar = useMutation({
    mutationFn: () => {
      const corpo = {
        ...f,
        motoristaId: f.tipoResponsavel === "MOTORISTA" && f.motoristaId ? f.motoristaId : null,
        mesCobranca: f.mesCobranca || null,
      };
      return desconto ? api(`/descontos/${desconto.id}`, { method: "PUT", body: corpo }) : api("/descontos", { method: "POST", body: corpo });
    },
    onSuccess: fechar,
    onError: (e: Error) => setErro(e.message),
  });
  const excluir = useMutation({
    mutationFn: () => api(`/descontos/${desconto!.id}`, { method: "DELETE" }),
    onSuccess: fechar,
    onError: (e: Error) => setErro(e.message),
  });

  return (
    <Modal
      titulo={desconto ? "Editar desconto" : "Novo desconto"}
      aberto
      aoFechar={aoFechar}
      rodape={
        <>
          {desconto && (
            <Botao
              variante="fantasma"
              className="mr-auto text-red-600"
              carregando={excluir.isPending}
              onClick={() => confirm("Excluir este desconto?") && excluir.mutate()}
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
        <Campo rotulo="Tipo de responsável *">
          <select className="campo" value={f.tipoResponsavel} onChange={set("tipoResponsavel")}>
            {TIPOS_RESPONSAVEL.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </Campo>
        {f.tipoResponsavel === "MOTORISTA" && (
          <Campo rotulo="Motorista cadastrado" dica="Deixe em branco se ainda não tiver cadastro">
            <select className="campo" value={f.motoristaId} onChange={set("motoristaId")} disabled={!f.baseId}>
              <option value="">(sem vínculo ainda)</option>
              {motoristas.data?.map((m) => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
            </select>
          </Campo>
        )}
        <Campo rotulo="Nome do responsável *" className={f.tipoResponsavel === "MOTORISTA" ? "" : "sm:col-span-2"} dica="Nome como veio da apuração, mesmo sem cadastro">
          <input className="campo" value={f.nomeResponsavel} onChange={set("nomeResponsavel")} placeholder="Ex.: João da Silva ou BASE" />
        </Campo>
        <Campo rotulo="TBR / rastreio">
          <input className="campo" value={f.tbr} onChange={set("tbr")} placeholder="TBR123456789" />
        </Campo>
        <Campo rotulo="Motivo *" className="sm:col-span-3">
          <input className="campo" value={f.motivo} onChange={set("motivo")} placeholder="Ex.: Pacote com último bipe em SSR9" />
        </Campo>
        <Campo rotulo="Ação *">
          <select className="campo" value={f.acao} onChange={set("acao")}>
            {ACOES_DESCONTO.map((a) => (
              <option key={a} value={a}>{ROTULO_ACAO[a]}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Valor (R$) *">
          <input className="campo text-right tabular-nums" inputMode="decimal" value={f.valor} onChange={set("valor")} placeholder="0,00" />
        </Campo>
        <Campo rotulo="Origem" dica="Ex.: LOST, DNR, Bônus">
          <input className="campo" value={f.origem} onChange={set("origem")} />
        </Campo>
        <Campo rotulo="Parcelas">
          <input className="campo text-right" inputMode="numeric" value={f.parcelas} onChange={set("parcelas")} />
        </Campo>
        <Campo rotulo="Parcela atual">
          <input className="campo text-right" inputMode="numeric" value={f.parcelaAtual} onChange={set("parcelaAtual")} />
        </Campo>
        <Campo rotulo="Período de apuração" dica='Ex.: "SEMANA 35"'>
          <input className="campo" value={f.periodoApuracao} onChange={set("periodoApuracao")} />
        </Campo>
        <Campo rotulo="Mês de cobrança">
          <input className="campo" type="date" value={f.mesCobranca} onChange={set("mesCobranca")} />
        </Campo>
        <Campo rotulo="Observações" className="sm:col-span-3">
          <input className="campo" value={f.observacoes} onChange={set("observacoes")} />
        </Campo>
      </div>
    </Modal>
  );
}
