import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import {
  api,
  DICA_MODELO,
  MODELOS_CALCULO,
  ROTULO_MODELO,
  ROTULO_VEICULO,
  TIPOS_VEICULO,
  type Base,
  type LinhaValor,
  type ModeloCalculo,
  type Motorista,
  type Operacao,
  type ValorMotorista,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { dataFmt, moeda, valorParaCampo } from "../lib/format";
import { AvisoErro, Botao, Cabecalho, Campo, Carregando, Cartao, Modal, Selo, Vazio } from "../components/ui";

type Aba = "rotas" | "motoristas";

const hojeISO = () => new Date().toISOString().slice(0, 10);
const vigente = (inicio: string, fim: string | null) => inicio <= hojeISO() && (!fim || fim >= hojeISO());

export function TabelaValores() {
  const { tem } = useAuth();
  const [aba, setAba] = useState<Aba>("rotas");
  const [baseId, setBaseId] = useState("");
  const [editando, setEditando] = useState<LinhaValor | "nova" | null>(null);
  const [editandoMotorista, setEditandoMotorista] = useState<ValorMotorista | "novo" | null>(null);
  const bases = useQuery({ queryKey: ["bases"], queryFn: () => api<Base[]>("/bases") });

  const podeEditarRotas = tem("ADMIN");
  const podeEditarMotoristas = tem("ADMIN", "FINANCEIRO");

  return (
    <>
      <Cabecalho
        titulo="Tabela de valores"
        descricao="Como cada rota é paga (rota fixa, por pacote, por parada ou por duração) e o valor por pacote individual de cada motorista."
        acoes={
          aba === "rotas"
            ? podeEditarRotas && (
                <Botao onClick={() => setEditando("nova")}>
                  <Plus className="h-4 w-4" /> Nova linha
                </Botao>
              )
            : podeEditarMotoristas && (
                <Botao onClick={() => setEditandoMotorista("novo")}>
                  <Plus className="h-4 w-4" /> Novo valor de motorista
                </Botao>
              )
        }
      />
      <Cartao className="mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="inline-flex rounded-md border border-slate-200 p-0.5" role="tablist">
          {(
            [
              ["rotas", "Por rota / cidade"],
              ["motoristas", "Valor por motorista"],
            ] as const
          ).map(([k, rotulo]) => (
            <button
              key={k}
              role="tab"
              aria-selected={aba === k}
              className={`rounded px-3 py-1.5 text-sm font-medium ${aba === k ? "bg-marca-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              onClick={() => setAba(k)}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <select className="campo max-w-xs" value={baseId} onChange={(e) => setBaseId(e.target.value)}>
          <option value="">Todas as bases</option>
          {bases.data?.map((b) => (
            <option key={b.id} value={b.id}>{b.codigo} — {b.nome}</option>
          ))}
        </select>
      </Cartao>

      {aba === "rotas" ? (
        <ListaRotas baseId={baseId} podeEditar={podeEditarRotas} aoEditar={setEditando} />
      ) : (
        <ListaValoresMotorista baseId={baseId} podeEditar={podeEditarMotoristas} aoEditar={setEditandoMotorista} />
      )}

      {editando && (
        <FormValor linha={editando === "nova" ? null : editando} bases={bases.data ?? []} aoFechar={() => setEditando(null)} />
      )}
      {editandoMotorista && (
        <FormValorMotorista
          valor={editandoMotorista === "novo" ? null : editandoMotorista}
          baseIdInicial={baseId}
          bases={bases.data ?? []}
          aoFechar={() => setEditandoMotorista(null)}
        />
      )}
    </>
  );
}

// Resumo do "valor principal" de uma linha, conforme o modelo — o que o
// líder/Financeiro precisa ver de relance na listagem.
function valorPrincipal(l: LinhaValor) {
  switch (l.modeloCalculo) {
    case "ROTA_FIXA":
      return (
        <>
          {moeda(l.valorRotaSemana)}/semana
          {l.valorRotaDomingo && <span className="block text-xs text-slate-500">dom. {moeda(l.valorRotaDomingo)}</span>}
        </>
      );
    case "POR_PACOTE":
      return l.valorPacote ? `${moeda(l.valorPacote)}/pacote` : <span className="text-slate-500">valor de cada motorista</span>;
    case "POR_PARADA":
      return `${moeda(l.valorParada)}/parada`;
    case "ROTA_HORA":
      return (
        <>
          {l.valorRota6h && <span className="block">6h: {moeda(l.valorRota6h)}</span>}
          {l.valorRota8h && <span className="block">8h: {moeda(l.valorRota8h)}</span>}
        </>
      );
  }
}

function ListaRotas({
  baseId,
  podeEditar,
  aoEditar,
}: {
  baseId: string;
  podeEditar: boolean;
  aoEditar: (l: LinhaValor) => void;
}) {
  const linhas = useQuery({
    queryKey: ["tabela-valores", { baseId }],
    queryFn: () => api<LinhaValor[]>(`/tabela-valores${baseId ? `?baseId=${baseId}` : ""}`),
  });
  return (
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
              <th>Modelo</th>
              <th className="text-right">Valor</th>
              <th>Vigência</th>
            </tr>
          </thead>
          <tbody>
            {linhas.data.map((l) => (
              <tr key={l.id} className={podeEditar ? "cursor-pointer" : ""} onClick={() => podeEditar && aoEditar(l)}>
                <td className="font-medium">{l.baseCodigo}</td>
                <td><Selo cor="azul">{l.operacao}</Selo></td>
                <td>
                  {l.cidade}
                  {l.faixaKm && <span className="ml-1 text-xs text-slate-400">{l.faixaKm} km</span>}
                </td>
                <td>{ROTULO_VEICULO[l.tipoVeiculo]}</td>
                <td className="whitespace-nowrap text-sm">{ROTULO_MODELO[l.modeloCalculo]}</td>
                <td className="text-right tabular-nums">{valorPrincipal(l)}</td>
                <td className="whitespace-nowrap text-xs">
                  {dataFmt(l.vigenciaInicio)} → {l.vigenciaFim ? dataFmt(l.vigenciaFim) : "atual"}{" "}
                  {!vigente(l.vigenciaInicio, l.vigenciaFim) && <Selo>fora da vigência</Selo>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Cartao>
  );
}

// Campos de valor de cada modelo. Os "comuns" valem pra todos.
const CAMPOS_MODELO: Record<ModeloCalculo, (readonly [keyof LinhaValor, string, string?])[]> = {
  ROTA_FIXA: [
    ["valorRotaSemana", "Rota seg. a sáb. *"],
    ["valorRotaDomingo", "Rota dom./feriado"],
    ["valorAdicional", "Valor adicional"],
    ["valorPacoteExtra", "Pacote extra (por unid.)", "Acima da média de pacotes inclusos"],
  ],
  POR_PACOTE: [["valorPacote", "Valor por pacote (padrão da rota)", "Motorista com valor próprio usa o dele"]],
  POR_PARADA: [["valorParada", "Valor por parada *"]],
  ROTA_HORA: [
    ["valorRota6h", "Rota de 6 horas (por dia)"],
    ["valorRota8h", "Rota de 8 horas (por dia)"],
  ],
};
const CAMPOS_COMUNS = [
  ["valorParadaExtra", "Parada extra"],
  ["valorResgate", "Resgate (meia rota)"],
  ["valorDescontoInsucesso", "Desconto por insucesso (por pacote)"],
] as const;
const TODOS_CAMPOS_MODELO = [...new Set(Object.values(CAMPOS_MODELO).flatMap((cs) => cs.map(([k]) => k)))];

function FormValor({ linha, bases, aoFechar }: { linha: LinhaValor | null; bases: Base[]; aoFechar: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<Record<string, string>>(() => ({
    baseId: String(linha?.baseId ?? ""),
    operacao: linha?.operacao ?? "AMAZON",
    cidade: linha?.cidade ?? "",
    faixaKm: linha?.faixaKm ?? "",
    tipoVeiculo: linha?.tipoVeiculo ?? "PASSEIO",
    modeloCalculo: linha?.modeloCalculo ?? "ROTA_FIXA",
    mediaPacotes: linha?.mediaPacotes != null ? String(linha.mediaPacotes) : "",
    vigenciaInicio: linha?.vigenciaInicio ?? hojeISO(),
    vigenciaFim: linha?.vigenciaFim ?? "",
    observacoes: linha?.observacoes ?? "",
    ...Object.fromEntries(
      [...TODOS_CAMPOS_MODELO, ...CAMPOS_COMUNS.map(([k]) => k)].map((k) => [k, valorParaCampo((linha?.[k] as string | null) ?? null)]),
    ),
  }));
  const [erro, setErro] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value }));
  const base = bases.find((b) => String(b.id) === f.baseId);
  const modelo = f.modeloCalculo as ModeloCalculo;

  const fechar = () => {
    qc.invalidateQueries({ queryKey: ["tabela-valores"] });
    aoFechar();
  };
  const salvar = useMutation({
    mutationFn: () => {
      // Zera os campos de outros modelos pra não sobrar valor "fantasma" de um
      // modelo anterior quando o Admin troca o modelo da rota.
      const doModelo = new Set<string>(CAMPOS_MODELO[modelo].map(([k]) => k));
      const corpo: Record<string, unknown> = { ...f, vigenciaFim: f.vigenciaFim || null };
      for (const k of TODOS_CAMPOS_MODELO) if (!doModelo.has(k)) corpo[k] = null;
      corpo.mediaPacotes = modelo === "ROTA_FIXA" ? f.mediaPacotes || null : null;
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

  const campoValor = ([k, rotulo, dica]: readonly [string, string, string?]) => (
    <Campo key={k} rotulo={`${rotulo} (R$)`} dica={dica}>
      <input className="campo text-right tabular-nums" inputMode="decimal" value={f[k]} onChange={set(k)} placeholder="0,00" />
    </Campo>
  );

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
        <Campo rotulo="Cidade ou rota *" className="sm:col-span-2" dica="Tem que ser igual à 'Rota padrão' do cadastro do motorista">
          <input className="campo" value={f.cidade} onChange={set("cidade")} placeholder="Ex.: Cruz das Almas-BA" />
        </Campo>
        <Campo rotulo="Faixa de KM">
          <input className="campo" value={f.faixaKm} onChange={set("faixaKm")} placeholder="Ex.: 50 - 100" />
        </Campo>

        <Campo rotulo="Como é pago *" className="sm:col-span-3" dica={DICA_MODELO[modelo]}>
          <select className="campo" value={f.modeloCalculo} onChange={set("modeloCalculo")}>
            {MODELOS_CALCULO.map((m) => (
              <option key={m} value={m}>{ROTULO_MODELO[m]}</option>
            ))}
          </select>
        </Campo>
        {CAMPOS_MODELO[modelo].map((c) => campoValor(c as readonly [string, string, string?]))}
        {modelo === "ROTA_FIXA" && (
          <Campo rotulo="Média de pacotes inclusos" dica="Pacotes cobertos pelo valor da rota">
            <input className="campo text-right" inputMode="numeric" value={f.mediaPacotes} onChange={set("mediaPacotes")} />
          </Campo>
        )}

        <div className="sm:col-span-3 border-t border-slate-100 pt-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          Valem em qualquer modelo
        </div>
        {CAMPOS_COMUNS.map((c) => campoValor(c))}

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

// ---------------------------------------------------------------------------
// Valor por pacote individual de cada motorista (rotas POR_PACOTE)
// ---------------------------------------------------------------------------

function ListaValoresMotorista({
  baseId,
  podeEditar,
  aoEditar,
}: {
  baseId: string;
  podeEditar: boolean;
  aoEditar: (v: ValorMotorista) => void;
}) {
  const lista = useQuery({
    queryKey: ["valores-motorista", { baseId }],
    queryFn: () => api<ValorMotorista[]>(`/valores-motorista${baseId ? `?baseId=${baseId}` : ""}`),
  });
  return (
    <Cartao className="overflow-x-auto">
      <p className="border-b border-slate-100 px-4 py-2.5 text-sm text-slate-500">
        Usado nas rotas pagas <strong>por pacote</strong>: quando o motorista tem valor próprio vigente, ele vale no lugar do
        valor padrão da rota. Para mudar o valor de alguém, preencha o fim da vigência atual e cadastre o novo — o histórico fica
        guardado.
      </p>
      {lista.isLoading ? (
        <Carregando />
      ) : !lista.data?.length ? (
        <Vazio>Nenhum valor individual cadastrado.</Vazio>
      ) : (
        <table className="tabela w-full min-w-[720px]">
          <thead>
            <tr>
              <th>Motorista</th>
              <th>Base</th>
              <th>Rota padrão</th>
              <th className="text-right">Valor por pacote</th>
              <th>Vigência</th>
            </tr>
          </thead>
          <tbody>
            {lista.data.map((v) => (
              <tr key={v.id} className={podeEditar ? "cursor-pointer" : ""} onClick={() => podeEditar && aoEditar(v)}>
                <td className="font-medium">{v.motoristaNome}</td>
                <td>{v.baseCodigo}</td>
                <td>{v.rotaPadrao ?? "—"}</td>
                <td className="text-right tabular-nums">{moeda(v.valorPacote)}</td>
                <td className="whitespace-nowrap text-xs">
                  {dataFmt(v.vigenciaInicio)} → {v.vigenciaFim ? dataFmt(v.vigenciaFim) : "atual"}{" "}
                  {vigente(v.vigenciaInicio, v.vigenciaFim) ? <Selo cor="verde">vigente</Selo> : <Selo>histórico</Selo>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Cartao>
  );
}

function FormValorMotorista({
  valor,
  baseIdInicial,
  bases,
  aoFechar,
}: {
  valor: ValorMotorista | null;
  baseIdInicial: string;
  bases: Base[];
  aoFechar: () => void;
}) {
  const qc = useQueryClient();
  const [baseId, setBaseId] = useState(valor ? String(valor.baseId) : baseIdInicial);
  const [f, setF] = useState({
    motoristaId: valor ? String(valor.motoristaId) : "",
    valorPacote: valorParaCampo(valor?.valorPacote ?? null),
    vigenciaInicio: valor?.vigenciaInicio ?? hojeISO(),
    vigenciaFim: valor?.vigenciaFim ?? "",
    observacoes: valor?.observacoes ?? "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value }));

  const motoristas = useQuery({
    queryKey: ["motoristas", { baseId }],
    queryFn: () => api<Motorista[]>(`/motoristas?baseId=${baseId}`),
    enabled: !!baseId,
  });

  const fechar = () => {
    qc.invalidateQueries({ queryKey: ["valores-motorista"] });
    aoFechar();
  };
  const salvar = useMutation({
    mutationFn: () => {
      const corpo = { ...f, vigenciaFim: f.vigenciaFim || null };
      return valor
        ? api(`/valores-motorista/${valor.id}`, { method: "PUT", body: corpo })
        : api("/valores-motorista", { method: "POST", body: corpo });
    },
    onSuccess: fechar,
    onError: (e: Error) => setErro(e.message),
  });
  const excluir = useMutation({
    mutationFn: () => api(`/valores-motorista/${valor!.id}`, { method: "DELETE" }),
    onSuccess: fechar,
    onError: (e: Error) => setErro(e.message),
  });

  return (
    <Modal
      titulo={valor ? "Editar valor do motorista" : "Novo valor por pacote do motorista"}
      aberto
      aoFechar={aoFechar}
      rodape={
        <>
          {valor && (
            <Botao
              variante="fantasma"
              className="mr-auto text-red-600"
              carregando={excluir.isPending}
              onClick={() => confirm("Excluir este valor? Para trocar o valor, prefira encerrar a vigência e cadastrar um novo.") && excluir.mutate()}
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Base *">
          <select
            className="campo"
            value={baseId}
            disabled={!!valor}
            onChange={(e) => {
              setBaseId(e.target.value);
              setF((v) => ({ ...v, motoristaId: "" }));
            }}
          >
            <option value="">Selecione…</option>
            {bases.map((b) => (
              <option key={b.id} value={b.id}>{b.codigo} — {b.nome}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Motorista *">
          <select className="campo" value={f.motoristaId} disabled={!!valor || !baseId} onChange={set("motoristaId")}>
            <option value="">{baseId ? "Selecione…" : "Escolha a base primeiro"}</option>
            {motoristas.data?.map((m) => (
              <option key={m.id} value={m.id}>{m.nome}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Valor por pacote (R$) *">
          <input className="campo text-right tabular-nums" inputMode="decimal" value={f.valorPacote} onChange={set("valorPacote")} placeholder="0,00" />
        </Campo>
        <div />
        <Campo rotulo="Vigência — início *">
          <input className="campo" type="date" value={f.vigenciaInicio} onChange={set("vigenciaInicio")} />
        </Campo>
        <Campo rotulo="Vigência — fim" dica="Em branco = vale até um novo valor">
          <input className="campo" type="date" value={f.vigenciaFim} onChange={set("vigenciaFim")} />
        </Campo>
        <Campo rotulo="Observações" className="sm:col-span-2">
          <input className="campo" value={f.observacoes} onChange={set("observacoes")} />
        </Campo>
      </div>
    </Modal>
  );
}
