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
  type DuracaoValor,
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
  const { tem, usuario } = useAuth();
  const [aba, setAba] = useState<Aba>("rotas");
  const [baseId, setBaseId] = useState("");
  const [editando, setEditando] = useState<LinhaValor | "nova" | null>(null);
  const [editandoMotorista, setEditandoMotorista] = useState<ValorMotorista | "novo" | null>(null);
  const bases = useQuery({ queryKey: ["bases"], queryFn: () => api<Base[]>("/bases") });

  const podeEditarRotas = tem("ADMIN");
  // Quem negocia o valor por pacote com o entregador é o líder da base.
  const podeEditarMotoristas = tem("ADMIN", "FINANCEIRO", "LIDER");
  const basesDoUsuario = usuario?.perfil === "LIDER" ? (bases.data ?? []).filter((b) => usuario.baseIds.includes(b.id)) : (bases.data ?? []);

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
          bases={basesDoUsuario}
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
      return (
        <>
          {l.valorPacote ? `${moeda(l.valorPacote)}/pacote` : <span className="text-slate-500">valor de cada motorista</span>}
          {l.valorPacoteDomingo && <span className="block text-xs text-slate-500">dom. {moeda(l.valorPacoteDomingo)}</span>}
        </>
      );
    case "POR_PARADA":
      return (
        <>
          {moeda(l.valorParada)}/parada
          {l.valorParadaDomingo && <span className="block text-xs text-slate-500">dom. {moeda(l.valorParadaDomingo)}</span>}
        </>
      );
    case "DIARIA":
      return (
        <>
          {moeda(l.valorRotaSemana)}/dia
          {l.valorRotaDomingo && <span className="block text-xs text-slate-500">dom. {moeda(l.valorRotaDomingo)}</span>}
          {l.valorParadaExtra && l.mediaPacotes != null && (
            <span className="block text-xs text-slate-500">
              +{moeda(l.valorParadaExtra)}/parada acima de {l.mediaPacotes}
            </span>
          )}
        </>
      );
    case "ROTA_HORA":
      return l.duracoes.map((d) => (
        <span key={d.horas} className="block">
          {d.horas}h: {moeda(d.valor)}
          {d.valorDomingo && <span className="text-xs text-slate-500"> · dom. {moeda(d.valorDomingo)}</span>}
        </span>
      ));
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
  POR_PACOTE: [
    ["valorPacote", "Valor por pacote (padrão da rota)", "Motorista com valor próprio usa o dele"],
    ["valorPacoteDomingo", "Valor por pacote no domingo", "Em branco = igual aos outros dias"],
  ],
  POR_PARADA: [
    ["valorParada", "Valor por parada *"],
    ["valorParadaDomingo", "Valor por parada no domingo", "Em branco = igual aos outros dias"],
  ],
  ROTA_HORA: [], // durações têm editor próprio (lista)
  DIARIA: [
    ["valorRotaSemana", "Diária seg. a sáb. *"],
    ["valorRotaDomingo", "Diária dom./feriado", "Em branco = igual à diária normal"],
    ["valorPacoteDevolucao", "Por pacote entregue se devolução > 70%", "Nesse dia não paga a diária, só este valor × entregues"],
  ],
};

type LinhaDuracao = { horas: string; valor: string; valorDomingo: string };
const duracaoParaForm = (d: DuracaoValor): LinhaDuracao => ({
  horas: String(d.horas),
  valor: valorParaCampo(d.valor),
  valorDomingo: valorParaCampo(d.valorDomingo),
});
const DURACOES_PADRAO: LinhaDuracao[] = [
  { horas: "6", valor: "", valorDomingo: "" },
  { horas: "8", valor: "", valorDomingo: "" },
];
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
  const [duracoes, setDuracoes] = useState<LinhaDuracao[]>(() =>
    linha?.duracoes.length ? linha.duracoes.map(duracaoParaForm) : DURACOES_PADRAO,
  );
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
      corpo.mediaPacotes = modelo === "ROTA_FIXA" || modelo === "DIARIA" ? f.mediaPacotes || null : null;
      corpo.duracoes =
        modelo === "ROTA_HORA"
          ? duracoes
              .filter((d) => d.horas || d.valor)
              .map((d) => ({ horas: d.horas, valor: d.valor || null, valorDomingo: d.valorDomingo || null }))
          : [];
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
        {modelo === "ROTA_HORA" && <EditorDuracoes linhas={duracoes} aoMudar={setDuracoes} />}
        {modelo === "ROTA_FIXA" && (
          <Campo rotulo="Média de pacotes inclusos" dica="Pacotes cobertos pelo valor da rota">
            <input className="campo text-right" inputMode="numeric" value={f.mediaPacotes} onChange={set("mediaPacotes")} />
          </Campo>
        )}
        {modelo === "DIARIA" && (
          <Campo rotulo="Paradas inclusas na diária (por dia)" dica="Acima disso paga a 'Parada extra' abaixo, por parada">
            <input className="campo text-right" inputMode="numeric" value={f.mediaPacotes} onChange={set("mediaPacotes")} />
          </Campo>
        )}

        <div className="sm:col-span-3 border-t border-slate-100 pt-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          Valem em qualquer modelo
        </div>
        {CAMPOS_COMUNS.map((c) =>
          modelo === "DIARIA" && c[0] === "valorParadaExtra"
            ? campoValor([c[0], "Parada acima do limite do dia"])
            : campoValor(c),
        )}

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

// Lista de durações de uma rota ROTA_HORA: a rota principal (ex.: 6h, 8h) e
// as durações que podem ser pedidas como complemento (ex.: 2h, 4h).
function EditorDuracoes({ linhas, aoMudar }: { linhas: LinhaDuracao[]; aoMudar: (l: LinhaDuracao[]) => void }) {
  const mudar = (i: number, k: keyof LinhaDuracao, v: string) =>
    aoMudar(linhas.map((l, j) => (j === i ? { ...l, [k]: k === "horas" ? v.replace(/\D/g, "") : v } : l)));
  return (
    <div className="sm:col-span-3">
      <span className="mb-1 block text-sm font-medium text-slate-700">Durações e valores (por dia) *</span>
      <p className="mb-2 text-xs text-slate-500">
        Cadastre cada duração que pode ser lançada — a rota normal e as que podem ser pedidas como complemento. Valor de
        domingo em branco = igual aos outros dias.
      </p>
      <div className="space-y-2">
        <div className="grid grid-cols-[5rem_1fr_1fr_2rem] gap-2 text-xs font-medium text-slate-500">
          <span>Horas</span>
          <span>Valor (R$)</span>
          <span>Domingo (R$)</span>
          <span />
        </div>
        {linhas.map((l, i) => (
          <div key={i} className="grid grid-cols-[5rem_1fr_1fr_2rem] items-center gap-2">
            <input className="campo text-right" inputMode="numeric" value={l.horas} onChange={(e) => mudar(i, "horas", e.target.value)} placeholder="h" aria-label="Horas" />
            <input className="campo text-right tabular-nums" inputMode="decimal" value={l.valor} onChange={(e) => mudar(i, "valor", e.target.value)} placeholder="0,00" aria-label="Valor" />
            <input className="campo text-right tabular-nums" inputMode="decimal" value={l.valorDomingo} onChange={(e) => mudar(i, "valorDomingo", e.target.value)} placeholder="igual" aria-label="Valor no domingo" />
            <button
              type="button"
              className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
              onClick={() => aoMudar(linhas.filter((_, j) => j !== i))}
              aria-label="Remover duração"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <Botao variante="secundario" className="px-2.5 py-1.5 text-xs" onClick={() => aoMudar([...linhas, { horas: "", valor: "", valorDomingo: "" }])}>
          <Plus className="h-3.5 w-3.5" /> Adicionar duração
        </Botao>
      </div>
    </div>
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
        guardado. O líder só altera valores da semana atual em diante.
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
              <th className="text-right">Domingo</th>
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
                <td className="text-right tabular-nums">{v.valorPacoteDomingo ? moeda(v.valorPacoteDomingo) : <span className="text-slate-400">igual</span>}</td>
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
  // Líder com uma base só não precisa escolher.
  const [baseId, setBaseId] = useState(
    valor ? String(valor.baseId) : baseIdInicial || (bases.length === 1 ? String(bases[0].id) : ""),
  );
  const [f, setF] = useState({
    motoristaId: valor ? String(valor.motoristaId) : "",
    valorPacote: valorParaCampo(valor?.valorPacote ?? null),
    valorPacoteDomingo: valorParaCampo(valor?.valorPacoteDomingo ?? null),
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
      const corpo = { ...f, vigenciaFim: f.vigenciaFim || null, valorPacoteDomingo: f.valorPacoteDomingo || null };
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
        <Campo rotulo="Valor por pacote no domingo (R$)" dica="Em branco = igual aos outros dias">
          <input className="campo text-right tabular-nums" inputMode="decimal" value={f.valorPacoteDomingo} onChange={set("valorPacoteDomingo")} placeholder="igual" />
        </Campo>
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
