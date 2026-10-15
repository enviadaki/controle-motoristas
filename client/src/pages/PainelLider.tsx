import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ClipboardCheck, ClipboardList, FileText, Lock } from "lucide-react";
import { api, type Base, type Motorista, type ResumoFechamento, type SemanaLancamentos } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Cartao, Selo } from "../components/ui";

function hojeISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Tela inicial do líder: nada de números de cadastro ou roteiro do projeto —
// só o que ele precisa ver e fazer hoje. Pensada pra quem não é íntimo de
// computador: atalhos grandes, letra grande, uma coisa de cada vez.
export function PainelLider() {
  const { usuario } = useAuth();
  const [baseId, setBaseId] = useState("");
  const hoje = hojeISO();

  const bases = useQuery({ queryKey: ["bases"], queryFn: () => api<Base[]>("/bases") });
  useEffect(() => {
    if (baseId || !bases.data?.length) return;
    const minhas = usuario?.baseIds?.length ? bases.data.filter((b) => usuario.baseIds.includes(b.id)) : bases.data;
    if (minhas[0]) setBaseId(String(minhas[0].id));
  }, [bases.data, usuario, baseId]);
  const basesVisiveis = usuario?.baseIds?.length ? bases.data?.filter((b) => usuario.baseIds.includes(b.id)) : bases.data;
  const baseAtual = bases.data?.find((b) => String(b.id) === baseId);

  const motoristas = useQuery({
    queryKey: ["motoristas", { baseId, status: "ATIVO" }],
    queryFn: () => api<Motorista[]>(`/motoristas?status=ATIVO&baseId=${baseId}`),
    enabled: !!baseId,
  });
  const semana = useQuery({
    queryKey: ["lancamentos", { baseId, semana: hoje }],
    queryFn: () => api<SemanaLancamentos>(`/lancamentos?semana=${hoje}&baseId=${baseId}`),
    enabled: !!baseId,
  });
  const fechamento = useQuery({
    queryKey: ["fechamentos-resumo", { baseId, data: hoje }],
    queryFn: () => api<ResumoFechamento>(`/fechamentos/resumo?baseId=${baseId}&data=${hoje}`),
    enabled: !!baseId,
  });

  const lancadosHoje = new Set(semana.data?.itens.filter((i) => i.data === hoje).map((i) => i.motoristaId));
  const faltam = motoristas.data?.filter((m) => !lancadosHoje.has(m.id)) ?? [];
  const totalAtivos = motoristas.data?.length ?? 0;

  const fechado = fechamento.data?.fechamento?.status === "FECHADO";

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-slate-900">Olá, {usuario?.nome.split(" ")[0]}</h1>
        {basesVisiveis && basesVisiveis.length > 1 ? (
          <select className="campo mt-2 w-auto" value={baseId} onChange={(e) => setBaseId(e.target.value)}>
            {basesVisiveis.map((b) => (
              <option key={b.id} value={b.id}>{b.codigo} — {b.nome}</option>
            ))}
          </select>
        ) : (
          <p className="mt-0.5 text-sm text-slate-500">{baseAtual ? `${baseAtual.codigo} — ${baseAtual.nome}` : ""}</p>
        )}
      </div>

      <Cartao className="mb-4 p-4">
        <div className="mb-1 text-sm font-medium text-slate-700">Hoje</div>
        {motoristas.isLoading || semana.isLoading ? (
          <div className="text-sm text-slate-400">Carregando…</div>
        ) : totalAtivos === 0 ? (
          <div className="text-sm text-slate-500">Nenhum motorista ativo cadastrado.</div>
        ) : faltam.length === 0 ? (
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">Todo mundo já foi lançado hoje ({totalAtivos} de {totalAtivos}).</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">
              Falta lançar {faltam.length} de {totalAtivos}: {faltam.map((m) => m.nome.split(" ")[0]).join(", ")}
            </span>
          </div>
        )}
      </Cartao>

      <div className="space-y-3">
        <Link
          to="/lancamentos"
          className="flex items-center gap-4 rounded-lg border border-marca-200 bg-marca-50 p-5 shadow-sm transition hover:border-marca-300 active:scale-[0.99]"
        >
          <ClipboardList className="h-8 w-8 shrink-0 text-marca-700" />
          <div>
            <div className="text-base font-semibold text-marca-900">Lançar hoje</div>
            <div className="text-sm text-marca-700/80">Marcar o que cada motorista rodou</div>
          </div>
        </Link>

        <Link
          to="/descontos"
          className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 active:scale-[0.99]"
        >
          <AlertTriangle className="h-8 w-8 shrink-0 text-slate-500" />
          <div>
            <div className="text-base font-semibold text-slate-900">Ver descontos</div>
            <div className="text-sm text-slate-500">Avaria e extravio lançados pela Descontos</div>
          </div>
        </Link>

        <Link
          to="/fechamentos"
          className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 active:scale-[0.99]"
        >
          {fechado ? <Lock className="h-8 w-8 shrink-0 text-slate-500" /> : <ClipboardCheck className="h-8 w-8 shrink-0 text-slate-500" />}
          <div className="flex-1">
            <div className="text-base font-semibold text-slate-900">Fechamento da semana</div>
            <div className="text-sm text-slate-500">
              {fechamento.isLoading ? (
                "Carregando…"
              ) : fechado ? (
                "Semana já fechada"
              ) : fechamento.data?.farolVerde ? (
                "Confere — pode fechar"
              ) : (
                "Ainda tem pendência"
              )}
            </div>
          </div>
          {!fechamento.isLoading && (
            <Selo cor={fechado ? "cinza" : fechamento.data?.farolVerde ? "verde" : "vermelho"}>
              {fechado ? "fechada" : fechamento.data?.farolVerde ? "confere" : "pendente"}
            </Selo>
          )}
        </Link>

        <Link
          to="/notas-fiscais"
          className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 active:scale-[0.99]"
        >
          <FileText className="h-8 w-8 shrink-0 text-slate-500" />
          <div>
            <div className="text-base font-semibold text-slate-900">Notas fiscais do mês</div>
            <div className="text-sm text-slate-500">Anexar a nota do acumulado, perto do dia 10</div>
          </div>
        </Link>
      </div>
    </div>
  );
}
