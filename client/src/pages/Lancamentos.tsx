import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import {
  api,
  ROTULO_MODELO,
  type Base,
  type Lancamento,
  type ModeloCalculo,
  type ModeloMotorista,
  type Motorista,
  type ResumoSemana,
  type SemanaLancamentos,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { dataFmt, moeda } from "../lib/format";
import { Botao, Cabecalho, Carregando, Cartao, Modal, Selo, Vazio } from "../components/ui";

function hojeISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function somarDias(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
function nomeDia(iso: string) {
  return DIAS_SEMANA[new Date(`${iso}T00:00:00Z`).getUTCDay()];
}

type LinhaForm = {
  rodou: boolean;
  horasRota: string; // "" = não marcado
  horasComplemento: string; // "" = sem complemento
  paradas: string;
  pacotesEntregues: string;
  pacotesInsucesso: string;
  paradasExtras: string;
  resgates: string;
  observacoes: string;
};

const LINHA_VAZIA: LinhaForm = {
  rodou: true,
  horasRota: "",
  horasComplemento: "",
  paradas: "0",
  pacotesEntregues: "0",
  pacotesInsucesso: "0",
  paradasExtras: "0",
  resgates: "0",
  observacoes: "",
};

// Quais campos o líder preenche em cada modelo de cálculo da rota. Motorista
// sem tabela de valor vigente (modelo null) vê os campos do modelo original.
type CampoNum = "horasRota" | "horasComplemento" | "paradas" | "pacotesEntregues" | "pacotesInsucesso" | "paradasExtras" | "resgates";
const CAMPOS_HORAS: CampoNum[] = ["horasRota", "horasComplemento"];
const ORDEM_CAMPOS: CampoNum[] = ["horasRota", "horasComplemento", "paradas", "pacotesEntregues", "pacotesInsucesso", "paradasExtras", "resgates"];
const CAMPOS_POR_MODELO: Record<ModeloCalculo, CampoNum[]> = {
  ROTA_FIXA: ["pacotesEntregues", "pacotesInsucesso", "paradasExtras", "resgates"],
  POR_PACOTE: ["pacotesEntregues", "pacotesInsucesso", "paradasExtras", "resgates"],
  POR_PARADA: ["paradas", "pacotesEntregues", "pacotesInsucesso", "resgates"],
  ROTA_HORA: ["horasRota", "horasComplemento", "pacotesEntregues", "pacotesInsucesso", "paradasExtras", "resgates"],
  DIARIA: ["paradas", "pacotesEntregues", "pacotesInsucesso", "resgates"],
};
const ROTULO_CAMPO: Record<CampoNum, string> = {
  horasRota: "Rota (horas)",
  horasComplemento: "Complemento",
  paradas: "Paradas",
  pacotesEntregues: "Entregues",
  pacotesInsucesso: "Insucesso",
  paradasExtras: "Paradas extra",
  resgates: "Resgates",
};
// Rótulo curto pra caber embaixo do nome do motorista na grade.
const MODELO_CURTO: Record<ModeloCalculo, string> = {
  ROTA_FIXA: "rota fixa",
  POR_PACOTE: "por pacote",
  POR_PARADA: "por parada",
  ROTA_HORA: "por duração",
  DIARIA: "diária",
};
const camposDo = (modelo: ModeloCalculo | null | undefined) => CAMPOS_POR_MODELO[modelo ?? "ROTA_FIXA"];

function linhaParaForm(l: Lancamento | undefined): LinhaForm {
  if (!l) return LINHA_VAZIA;
  return {
    rodou: l.rodou,
    horasRota: l.horasRota != null ? String(l.horasRota) : "",
    horasComplemento: l.horasComplemento != null ? String(l.horasComplemento) : "",
    paradas: String(l.paradas),
    pacotesEntregues: String(l.pacotesEntregues),
    pacotesInsucesso: String(l.pacotesInsucesso),
    paradasExtras: String(l.paradasExtras),
    resgates: String(l.resgates),
    observacoes: l.observacoes ?? "",
  };
}

export function Lancamentos() {
  const { usuario, tem } = useAuth();
  const [data, setData] = useState(hojeISO());
  const [baseId, setBaseId] = useState("");
  const [resumoMotoristaId, setResumoMotoristaId] = useState<number | null>(null);
  const qc = useQueryClient();

  const bases = useQuery({ queryKey: ["bases"], queryFn: () => api<Base[]>("/bases") });
  useEffect(() => {
    if (baseId || !bases.data?.length) return;
    const minhas = usuario?.baseIds?.length ? bases.data.filter((b) => usuario.baseIds.includes(b.id)) : bases.data;
    if (minhas[0]) setBaseId(String(minhas[0].id));
  }, [bases.data, usuario, baseId]);

  const motoristas = useQuery({
    queryKey: ["motoristas", { baseId, status: "ATIVO" }],
    queryFn: () => api<Motorista[]>(`/motoristas?status=ATIVO${baseId ? `&baseId=${baseId}` : ""}`),
    enabled: !!baseId,
  });
  const modelos = useQuery({
    queryKey: ["lancamentos-modelos", { baseId, data }],
    queryFn: () => api<Record<number, ModeloMotorista>>(`/lancamentos/modelos?baseId=${baseId}&data=${data}`),
    enabled: !!baseId,
  });
  const semana = useQuery({
    queryKey: ["lancamentos", { baseId, semana: data }],
    queryFn: () => api<SemanaLancamentos>(`/lancamentos?semana=${data}${baseId ? `&baseId=${baseId}` : ""}`),
    enabled: !!baseId,
  });

  const porMotoristaNaData = useMemo(() => {
    const m = new Map<number, Lancamento>();
    semana.data?.itens.filter((i) => i.data === data).forEach((i) => m.set(i.motoristaId, i));
    return m;
  }, [semana.data, data]);

  const travado = !!semana.data?.fechada && !tem("ADMIN", "FINANCEIRO");

  // Colunas da tabela = campos usados por pelo menos um motorista da base
  // (na maioria das bases todo mundo é pago do mesmo jeito).
  const colunas = useMemo(() => {
    const usados = new Set<CampoNum>();
    motoristas.data?.forEach((m) => camposDo(modelos.data?.[m.id]?.modelo).forEach((c) => usados.add(c)));
    return ORDEM_CAMPOS.filter((c) => usados.has(c));
  }, [motoristas.data, modelos.data]);

  const basesVisiveis = usuario?.baseIds?.length ? bases.data?.filter((b) => usuario.baseIds.includes(b.id)) : bases.data;

  return (
    <>
      <Cabecalho
        titulo="Lançamentos diários"
        descricao="Marque, dia a dia, o que cada motorista rodou. O valor da semana é calculado sozinho pela tabela de valores."
        acoes={
          <div className="flex items-center gap-2">
            <select className="campo" value={baseId} onChange={(e) => setBaseId(e.target.value)}>
              {basesVisiveis?.map((b) => (
                <option key={b.id} value={b.id}>{b.codigo} — {b.nome}</option>
              ))}
            </select>
          </div>
        }
      />

      <Cartao className="mb-4 flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-1">
          <button className="rounded p-1.5 hover:bg-slate-100" onClick={() => setData((d) => somarDias(d, -1))} aria-label="Dia anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input className="campo w-auto" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          <button
            className="rounded p-1.5 hover:bg-slate-100 disabled:opacity-30"
            disabled={data >= hojeISO()}
            onClick={() => setData((d) => somarDias(d, 1))}
            aria-label="Próximo dia"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="ml-2 text-sm text-slate-600">{nomeDia(data)}</span>
        </div>
        {semana.data && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            Semana {dataFmt(semana.data.semanaInicio)} → {dataFmt(semana.data.semanaFim)}
            {semana.data.fechada && (
              <Selo cor="amarelo">
                <Lock className="mr-1 inline h-3 w-3" /> fechada
              </Selo>
            )}
          </div>
        )}
      </Cartao>

      {!baseId ? (
        <Cartao><Vazio>Selecione uma base.</Vazio></Cartao>
      ) : motoristas.isLoading || semana.isLoading || modelos.isLoading ? (
        <Cartao><Carregando /></Cartao>
      ) : !motoristas.data?.length ? (
        <Cartao><Vazio>Nenhum motorista ativo nesta base.</Vazio></Cartao>
      ) : (
        <>
          {/* Telas largas: tabela compacta */}
          <Cartao className="hidden overflow-x-auto sm:block">
            <table className="tabela w-full min-w-[920px]">
              <thead>
                <tr>
                  <th>Motorista</th>
                  <th className="text-center">Rodou</th>
                  {colunas.map((c) => (
                    <th key={c} className={CAMPOS_HORAS.includes(c) ? "" : "text-right"}>{ROTULO_CAMPO[c]}</th>
                  ))}
                  <th>Observação</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {motoristas.data.map((m) => (
                  <LinhaLancamento
                    key={m.id}
                    modo="tabela"
                    colunas={colunas}
                    modelo={modelos.data?.[m.id]?.modelo}
                    duracoes={modelos.data?.[m.id]?.duracoes ?? []}
                    motorista={m}
                    data={data}
                    lancamento={porMotoristaNaData.get(m.id)}
                    travado={travado}
                    aoSalvar={() => qc.invalidateQueries({ queryKey: ["lancamentos"] })}
                    aoVerResumo={() => setResumoMotoristaId(m.id)}
                  />
                ))}
              </tbody>
            </table>
          </Cartao>

          {/* Celular: um cartão por motorista, campos com rótulo à vista */}
          <div className="space-y-3 sm:hidden">
            {motoristas.data.map((m) => (
              <LinhaLancamento
                key={m.id}
                modo="cartao"
                colunas={colunas}
                modelo={modelos.data?.[m.id]?.modelo}
                    duracoes={modelos.data?.[m.id]?.duracoes ?? []}
                motorista={m}
                data={data}
                lancamento={porMotoristaNaData.get(m.id)}
                travado={travado}
                aoSalvar={() => qc.invalidateQueries({ queryKey: ["lancamentos"] })}
                aoVerResumo={() => setResumoMotoristaId(m.id)}
              />
            ))}
          </div>
        </>
      )}

      {resumoMotoristaId && (
        <ResumoSemanaModal motoristaId={resumoMotoristaId} data={data} aoFechar={() => setResumoMotoristaId(null)} />
      )}
    </>
  );
}

function LinhaLancamento({
  motorista,
  modelo,
  duracoes,
  colunas,
  data,
  lancamento,
  travado,
  aoSalvar,
  aoVerResumo,
  modo,
}: {
  motorista: Motorista;
  modelo: ModeloCalculo | null | undefined;
  duracoes: number[];
  colunas: CampoNum[];
  data: string;
  lancamento: Lancamento | undefined;
  travado: boolean;
  aoSalvar: () => void;
  aoVerResumo: () => void;
  modo: "tabela" | "cartao";
}) {
  const [f, setF] = useState<LinhaForm>(() => linhaParaForm(lancamento));
  const [sujo, setSujo] = useState(false);
  useEffect(() => {
    setF(linhaParaForm(lancamento));
    setSujo(false);
  }, [lancamento, data]);

  const meus = camposDo(modelo);
  const usa = (c: CampoNum) => meus.includes(c);
  const faltaDuracao = usa("horasRota") && f.rodou && !f.horasRota;

  const salvar = useMutation({
    mutationFn: () =>
      api("/lancamentos", {
        method: "POST",
        body: {
          motoristaId: motorista.id,
          data,
          rodou: f.rodou,
          // Campo que não vale pro modelo do motorista vai zerado.
          horasRota: usa("horasRota") && f.horasRota ? Number(f.horasRota) : null,
          horasComplemento: usa("horasComplemento") && f.horasComplemento ? Number(f.horasComplemento) : null,
          paradas: usa("paradas") ? f.paradas || 0 : 0,
          pacotesEntregues: f.pacotesEntregues || 0,
          pacotesInsucesso: f.pacotesInsucesso || 0,
          paradasExtras: usa("paradasExtras") ? f.paradasExtras || 0 : 0,
          resgates: f.resgates || 0,
          observacoes: f.observacoes || null,
        },
      }),
    onSuccess: () => {
      setSujo(false);
      aoSalvar();
    },
  });

  const num = (v: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF((prev) => ({ ...prev, [v]: e.target.value.replace(/\D/g, "") }));
    setSujo(true);
  };
  const setHoras = (campo: "horasRota" | "horasComplemento") => (e: React.ChangeEvent<HTMLSelectElement>) => {
    setF((prev) => ({ ...prev, [campo]: e.target.value }));
    setSujo(true);
  };

  const seloModelo =
    modelo === undefined ? null : modelo === null ? (
      <span className="block text-xs font-normal text-amber-700">sem tabela de valor</span>
    ) : (
      <span className="block text-xs font-normal text-slate-500" title={ROTULO_MODELO[modelo]}>{MODELO_CURTO[modelo]}</span>
    );

  // Opções = durações cadastradas na tabela de valores da rota do motorista.
  // Se o dia já tem uma duração que saiu da tabela, ela continua aparecendo.
  const seletorHoras = (campo: "horasRota" | "horasComplemento", classe: string) => {
    const atual = f[campo] ? Number(f[campo]) : null;
    const opcoes = atual !== null && !duracoes.includes(atual) ? [...duracoes, atual].sort((a, b) => a - b) : duracoes;
    const destaque = campo === "horasRota" && faltaDuracao ? "border-amber-400" : "";
    return (
      <select className={`campo ${classe} ${destaque}`} disabled={travado} value={f[campo]} onChange={setHoras(campo)}>
        <option value="">{campo === "horasRota" ? "—" : "nenhum"}</option>
        {opcoes.map((h) => (
          <option key={h} value={h}>{h} horas</option>
        ))}
      </select>
    );
  };

  if (modo === "cartao") {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <button className="text-left text-base font-medium hover:underline" onClick={aoVerResumo}>
            {motorista.nome}
            {seloModelo}
          </button>
          <label className="flex shrink-0 items-center gap-1.5 text-sm text-slate-600">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={f.rodou}
              disabled={travado}
              onChange={(e) => {
                setF((prev) => ({ ...prev, rodou: e.target.checked }));
                setSujo(true);
              }}
            />
            Rodou
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {meus.map((c) =>
            c === "horasRota" || c === "horasComplemento" ? (
              <label key={c} className="block">
                <span className="mb-0.5 block text-xs font-medium text-slate-500">
                  {c === "horasRota" ? "Duração da rota" : "Complemento"}
                </span>
                {seletorHoras(c, "w-full")}
              </label>
            ) : (
              <CampoCartao key={c} rotulo={ROTULO_CAMPO[c]} value={f[c]} disabled={travado} onChange={num(c)} />
            ),
          )}
        </div>
        {faltaDuracao && <p className="mt-1.5 text-xs text-amber-700">Marque a duração da rota do dia.</p>}
        <input
          className="campo mt-2.5 w-full"
          disabled={travado}
          value={f.observacoes}
          placeholder="Observação (opcional)"
          onChange={(e) => {
            setF((prev) => ({ ...prev, observacoes: e.target.value }));
            setSujo(true);
          }}
        />
        {!travado && (
          <Botao className="mt-2.5 w-full" disabled={!sujo} carregando={salvar.isPending} onClick={() => salvar.mutate()}>
            Salvar
          </Botao>
        )}
      </div>
    );
  }

  return (
    <tr>
      <td className="min-w-[180px] font-medium">
        <button className="text-left hover:underline" onClick={aoVerResumo}>
          {motorista.nome}
          {seloModelo}
        </button>
      </td>
      <td className="text-center">
        <input
          type="checkbox"
          checked={f.rodou}
          disabled={travado}
          onChange={(e) => {
            setF((prev) => ({ ...prev, rodou: e.target.checked }));
            setSujo(true);
          }}
        />
      </td>
      {colunas.map((c) => (
        <td key={c} className={usa(c) ? "" : "text-center text-slate-300"}>
          {!usa(c) ? (
            "—"
          ) : c === "horasRota" || c === "horasComplemento" ? (
            seletorHoras(c, c === "horasRota" ? "w-28" : "w-40")
          ) : (
            <input className="campo w-20 text-right tabular-nums" inputMode="numeric" disabled={travado} value={f[c]} onChange={num(c)} />
          )}
        </td>
      ))}
      <td>
        <input
          className="campo"
          disabled={travado}
          value={f.observacoes}
          onChange={(e) => {
            setF((prev) => ({ ...prev, observacoes: e.target.value }));
            setSujo(true);
          }}
          placeholder="opcional"
        />
      </td>
      <td>
        {!travado && (
          <Botao className="px-2.5 py-1.5 text-xs" disabled={!sujo} carregando={salvar.isPending} onClick={() => salvar.mutate()}>
            Salvar
          </Botao>
        )}
      </td>
    </tr>
  );
}

const CAMPOS_ROTA_FIXA: [keyof ResumoSemana, string][] = [
  ["valorRotaSemana", "Rota (seg.–sáb.)"],
  ["valorAdicional", "Adicional"],
  ["valorRotaDomingo", "Rota domingo"],
  ["valorPacotesExtra", "Pacotes extra"],
];
const CAMPOS_COMUNS_RESUMO: [keyof ResumoSemana, string][] = [
  ["valorParadasExtra", "Paradas extra"],
  ["valorResgates", "Resgates"],
];

function ResumoSemanaModal({ motoristaId, data, aoFechar }: { motoristaId: number; data: string; aoFechar: () => void }) {
  const resumo = useQuery({
    queryKey: ["lancamentos-resumo", motoristaId, data],
    queryFn: () => api<ResumoSemana>(`/lancamentos/resumo/${motoristaId}?semana=${data}`),
  });

  return (
    <Modal titulo="Resumo da semana" aberto aoFechar={aoFechar} rodape={<Botao variante="secundario" onClick={aoFechar}>Fechar</Botao>}>
      {resumo.isLoading ? (
        <Carregando />
      ) : !resumo.data ? (
        <Vazio>Não foi possível calcular.</Vazio>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-slate-500">
            {dataFmt(resumo.data.semanaInicio)} → {dataFmt(resumo.data.semanaFim)} · {resumo.data.diasTrabalhados} dia(s) rodado(s)
            {resumo.data.trabalhouDomingo && " + domingo"}
            {resumo.data.modeloCalculo && <> · {ROTULO_MODELO[resumo.data.modeloCalculo]}</>}
          </div>
          {resumo.data.avisoValor && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{resumo.data.avisoValor}</div>
          )}
          <table className="tabela w-full">
            <tbody>
              {resumo.data.modeloCalculo === "ROTA_FIXA" &&
                CAMPOS_ROTA_FIXA.map(([k, rotulo]) => (
                  <tr key={k}>
                    <td>{rotulo}</td>
                    <td className="text-right tabular-nums">{moeda(resumo.data![k] as number)}</td>
                  </tr>
                ))}
              {resumo.data.itensProducao.map((i) => (
                <tr key={`${i.descricao}-${i.valorUnitario}`}>
                  <td>
                    {i.descricao}
                    <span className="block text-xs text-slate-500">
                      {i.quantidade} × {moeda(i.valorUnitario)}
                    </span>
                  </td>
                  <td className="text-right tabular-nums">{moeda(i.total)}</td>
                </tr>
              ))}
              {CAMPOS_COMUNS_RESUMO.map(([k, rotulo]) => (
                <tr key={k}>
                  <td>{rotulo}</td>
                  <td className="text-right tabular-nums">{moeda(resumo.data![k] as number)}</td>
                </tr>
              ))}
              <tr>
                <td>Desconto por insucesso ({resumo.data.pacotesInsucesso} pct.)</td>
                <td className="text-right tabular-nums text-red-600">− {moeda(resumo.data.valorDescontoInsucesso)}</td>
              </tr>
              <tr className="font-semibold">
                <td>Total da semana</td>
                <td className="text-right tabular-nums">{moeda(resumo.data.valorTotal)}</td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-slate-400">
            Não inclui descontos de avaria/extravio lançados pela área de Descontos (Passo 2).
          </p>
        </div>
      )}
    </Modal>
  );
}

// Campo numérico com rótulo sempre visível acima — no modo cartão, não dá pra
// contar com cabeçalho de coluna distante do valor como na tabela.
function CampoCartao({
  rotulo,
  value,
  disabled,
  onChange,
}: {
  rotulo: string;
  value: string;
  disabled: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-xs font-medium text-slate-500">{rotulo}</span>
      <input className="campo text-right tabular-nums" inputMode="numeric" disabled={disabled} value={value} onChange={onChange} />
    </label>
  );
}
