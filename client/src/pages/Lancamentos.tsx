import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { api, type Base, type Lancamento, type Motorista, type ResumoSemana, type SemanaLancamentos } from "../lib/api";
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
  pacotesEntregues: string;
  pacotesInsucesso: string;
  paradasExtras: string;
  resgates: string;
  observacoes: string;
};

const LINHA_VAZIA: LinhaForm = { rodou: true, pacotesEntregues: "0", pacotesInsucesso: "0", paradasExtras: "0", resgates: "0", observacoes: "" };

function linhaParaForm(l: Lancamento | undefined): LinhaForm {
  if (!l) return LINHA_VAZIA;
  return {
    rodou: l.rodou,
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

      <Cartao className="overflow-x-auto">
        {!baseId ? (
          <Vazio>Selecione uma base.</Vazio>
        ) : motoristas.isLoading || semana.isLoading ? (
          <Carregando />
        ) : !motoristas.data?.length ? (
          <Vazio>Nenhum motorista ativo nesta base.</Vazio>
        ) : (
          <table className="tabela w-full min-w-[920px]">
            <thead>
              <tr>
                <th>Motorista</th>
                <th className="text-center">Rodou</th>
                <th className="text-right">Entregues</th>
                <th className="text-right">Insucesso</th>
                <th className="text-right">Paradas extra</th>
                <th className="text-right">Resgates</th>
                <th>Observação</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {motoristas.data.map((m) => (
                <LinhaLancamento
                  key={m.id}
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
        )}
      </Cartao>

      {resumoMotoristaId && (
        <ResumoSemanaModal motoristaId={resumoMotoristaId} data={data} aoFechar={() => setResumoMotoristaId(null)} />
      )}
    </>
  );
}

function LinhaLancamento({
  motorista,
  data,
  lancamento,
  travado,
  aoSalvar,
  aoVerResumo,
}: {
  motorista: Motorista;
  data: string;
  lancamento: Lancamento | undefined;
  travado: boolean;
  aoSalvar: () => void;
  aoVerResumo: () => void;
}) {
  const [f, setF] = useState<LinhaForm>(() => linhaParaForm(lancamento));
  const [sujo, setSujo] = useState(false);
  useEffect(() => {
    setF(linhaParaForm(lancamento));
    setSujo(false);
  }, [lancamento, data]);

  const salvar = useMutation({
    mutationFn: () =>
      api("/lancamentos", {
        method: "POST",
        body: {
          motoristaId: motorista.id,
          data,
          rodou: f.rodou,
          pacotesEntregues: f.pacotesEntregues || 0,
          pacotesInsucesso: f.pacotesInsucesso || 0,
          paradasExtras: f.paradasExtras || 0,
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

  return (
    <tr>
      <td className="font-medium">
        <button className="text-left hover:underline" onClick={aoVerResumo}>
          {motorista.nome}
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
      <td>
        <input className="campo w-20 text-right tabular-nums" inputMode="numeric" disabled={travado} value={f.pacotesEntregues} onChange={num("pacotesEntregues")} />
      </td>
      <td>
        <input className="campo w-20 text-right tabular-nums" inputMode="numeric" disabled={travado} value={f.pacotesInsucesso} onChange={num("pacotesInsucesso")} />
      </td>
      <td>
        <input className="campo w-20 text-right tabular-nums" inputMode="numeric" disabled={travado} value={f.paradasExtras} onChange={num("paradasExtras")} />
      </td>
      <td>
        <input className="campo w-20 text-right tabular-nums" inputMode="numeric" disabled={travado} value={f.resgates} onChange={num("resgates")} />
      </td>
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

const CAMPOS_RESUMO: [keyof ResumoSemana, string][] = [
  ["valorRotaSemana", "Rota (seg.–sáb.)"],
  ["valorAdicional", "Adicional"],
  ["valorRotaDomingo", "Rota domingo"],
  ["valorPacotesExtra", "Pacotes extra"],
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
          </div>
          {resumo.data.avisoValor && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{resumo.data.avisoValor}</div>
          )}
          <table className="tabela w-full">
            <tbody>
              {CAMPOS_RESUMO.map(([k, rotulo]) => (
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
