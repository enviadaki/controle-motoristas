import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import {
  api,
  ErroApi,
  ROTULO_VEICULO,
  STATUS_MOTORISTA,
  TIPOS_VEICULO,
  type Base,
  type Motorista,
  type StatusMotorista,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { cnpjFmt, cpfFmt, telefoneFmt } from "../lib/format";
import { AvisoErro, Botao, Cabecalho, Campo, Carregando, Cartao, Modal, Selo, Vazio } from "../components/ui";

const COR_STATUS = { ATIVO: "verde", INATIVO: "amarelo", DESLIGADO: "cinza" } as const;

export function Motoristas() {
  const { tem } = useAuth();
  const podeEditar = tem("ADMIN", "FINANCEIRO");
  const [baseId, setBaseId] = useState("");
  const [status, setStatus] = useState<StatusMotorista | "">("ATIVO");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Motorista | "novo" | null>(null);

  const bases = useQuery({ queryKey: ["bases"], queryFn: () => api<Base[]>("/bases") });
  const filtros = { baseId, status };
  const lista = useQuery({
    queryKey: ["motoristas", filtros],
    queryFn: () => {
      const p = new URLSearchParams();
      if (baseId) p.set("baseId", baseId);
      if (status) p.set("status", status);
      return api<Motorista[]>(`/motoristas?${p}`);
    },
  });

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return lista.data ?? [];
    const dig = t.replace(/\D/g, "");
    return (lista.data ?? []).filter(
      (m) =>
        m.nome.toLowerCase().includes(t) ||
        m.placa?.toLowerCase().includes(t.replace(/[^a-z0-9]/g, "")) ||
        (dig && (m.cpf?.includes(dig) || m.cnpj?.includes(dig))),
    );
  }, [lista.data, busca]);

  return (
    <>
      <Cabecalho
        titulo="Motoristas"
        descricao={podeEditar ? "Cadastro dos prestadores de serviço por base" : "Consulta dos motoristas da sua base"}
        acoes={
          podeEditar && (
            <Botao onClick={() => setEditando("novo")}>
              <Plus className="h-4 w-4" /> Novo motorista
            </Botao>
          )
        }
      />

      <Cartao className="mb-4 grid gap-3 p-3 sm:grid-cols-[1fr_200px_160px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className="campo pl-9"
            placeholder="Buscar por nome, CPF, CNPJ ou placa"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <select className="campo" value={baseId} onChange={(e) => setBaseId(e.target.value)}>
          <option value="">Todas as bases</option>
          {bases.data?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.codigo} — {b.nome}
            </option>
          ))}
        </select>
        <select className="campo" value={status} onChange={(e) => setStatus(e.target.value as StatusMotorista | "")}>
          <option value="">Todos os status</option>
          {STATUS_MOTORISTA.map((s) => (
            <option key={s} value={s}>
              {s[0] + s.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </Cartao>

      <Cartao className="overflow-x-auto">
        {lista.isLoading ? (
          <Carregando />
        ) : filtrados.length === 0 ? (
          <Vazio>Nenhum motorista encontrado.</Vazio>
        ) : (
          <table className="tabela w-full min-w-[760px]">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Base</th>
                <th>CPF / CNPJ</th>
                <th>Veículo</th>
                <th>Recebe por</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((m) => (
                <tr key={m.id} className="cursor-pointer" onClick={() => setEditando(m)}>
                  <td className="font-medium">{m.nome}</td>
                  <td>{m.baseCodigo}</td>
                  <td className="tabular-nums text-slate-600">{m.cpf ? cpfFmt(m.cpf) : cnpjFmt(m.cnpj)}</td>
                  <td className="text-slate-600">
                    {m.tipoVeiculo ? ROTULO_VEICULO[m.tipoVeiculo] : "—"}
                    {m.placa && <span className="ml-1 text-xs text-slate-400">{m.placa}</span>}
                  </td>
                  <td className="text-slate-600">{m.responsavelPagamentoNome ?? "Ele mesmo"}</td>
                  <td>
                    <Selo cor={COR_STATUS[m.status]}>{m.status[0] + m.status.slice(1).toLowerCase()}</Selo>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Cartao>
      {!!filtrados.length && <p className="mt-2 text-xs text-slate-500">{filtrados.length} motorista(s)</p>}

      {editando && (
        <FormMotorista
          motorista={editando === "novo" ? null : editando}
          bases={bases.data ?? []}
          somenteLeitura={!podeEditar}
          aoFechar={() => setEditando(null)}
        />
      )}
    </>
  );
}

type Form = Record<
  | "nome" | "cpf" | "cnpj" | "telefone" | "email" | "placa" | "tipoVeiculo" | "baseId" | "responsavelPagamentoId"
  | "chavePix" | "favorecido" | "dadosBancarios" | "idCortex" | "rotaPadrao" | "status" | "observacoes",
  string
> & { contratoAssinado: boolean };

function inicial(m: Motorista | null, bases: Base[]): Form {
  return {
    nome: m?.nome ?? "",
    cpf: m?.cpf ? cpfFmt(m.cpf) : "",
    cnpj: m?.cnpj ? cnpjFmt(m.cnpj) : "",
    telefone: m?.telefone ? telefoneFmt(m.telefone) : "",
    email: m?.email ?? "",
    placa: m?.placa ?? "",
    tipoVeiculo: m?.tipoVeiculo ?? "",
    baseId: String(m?.baseId ?? (bases.length === 1 ? bases[0].id : "")),
    responsavelPagamentoId: m?.responsavelPagamentoId ? String(m.responsavelPagamentoId) : "",
    chavePix: m?.chavePix ?? "",
    favorecido: m?.favorecido ?? "",
    dadosBancarios: m?.dadosBancarios ?? "",
    idCortex: m?.idCortex ?? "",
    rotaPadrao: m?.rotaPadrao ?? "",
    status: m?.status ?? "ATIVO",
    observacoes: m?.observacoes ?? "",
    contratoAssinado: m?.contratoAssinado ?? false,
  };
}

function FormMotorista({
  motorista,
  bases,
  somenteLeitura,
  aoFechar,
}: {
  motorista: Motorista | null;
  bases: Base[];
  somenteLeitura: boolean;
  aoFechar: () => void;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState<Form>(() => inicial(motorista, bases));
  const [erro, setErro] = useState<ErroApi | null>(null);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value }));

  // Possíveis responsáveis de pagamento: motoristas da mesma base.
  const candidatos = useQuery({
    queryKey: ["motoristas", { baseId: f.baseId, status: "" }],
    queryFn: () => api<Motorista[]>(`/motoristas?baseId=${f.baseId}`),
    enabled: !!f.baseId,
  });

  const salvar = useMutation({
    mutationFn: () => {
      const corpo = { ...f, tipoVeiculo: f.tipoVeiculo || null, responsavelPagamentoId: f.responsavelPagamentoId || null };
      return motorista
        ? api(`/motoristas/${motorista.id}`, { method: "PUT", body: corpo })
        : api("/motoristas", { method: "POST", body: corpo });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["motoristas"] });
      aoFechar();
    },
    onError: (e: Error) => setErro(e instanceof ErroApi ? e : new ErroApi(e.message, 0)),
  });

  const erroDe = (c: string) =>
    erro?.detalhes.find((d) => d.campo === c)?.mensagem ?? (erro?.campo === c ? erro.message : null);
  const ro = somenteLeitura;

  return (
    <Modal
      titulo={ro ? motorista?.nome ?? "" : motorista ? "Editar motorista" : "Novo motorista"}
      aberto
      aoFechar={aoFechar}
      largura="max-w-3xl"
      rodape={
        ro ? (
          <Botao variante="secundario" onClick={aoFechar}>Fechar</Botao>
        ) : (
          <>
            {erro && <span className="mr-auto self-center text-sm text-red-600">{erro.campo ? "Corrija os campos destacados" : erro.message}</span>}
            <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
            <Botao carregando={salvar.isPending} onClick={() => { setErro(null); salvar.mutate(); }}>Salvar</Botao>
          </>
        )
      }
    >
      {erro && !erro.campo && <AvisoErro>{erro.message}</AvisoErro>}
      <fieldset disabled={ro} className="space-y-5">
        <Secao titulo="Identificação">
          <Campo rotulo="Nome completo *" erro={erroDe("nome")} className="sm:col-span-2">
            <input className="campo" value={f.nome} onChange={set("nome")} />
          </Campo>
          <Campo rotulo="CPF" erro={erroDe("cpf")}>
            <input className="campo" value={f.cpf} onChange={set("cpf")} placeholder="000.000.000-00" />
          </Campo>
          <Campo rotulo="CNPJ (MEI)" erro={erroDe("cnpj")}>
            <input className="campo" value={f.cnpj} onChange={set("cnpj")} placeholder="00.000.000/0000-00" />
          </Campo>
          <Campo rotulo="Telefone" erro={erroDe("telefone")}>
            <input className="campo" value={f.telefone} onChange={set("telefone")} placeholder="(75) 99999-9999" />
          </Campo>
          <Campo rotulo="E-mail" erro={erroDe("email")}>
            <input className="campo" value={f.email} onChange={set("email")} />
          </Campo>
        </Secao>

        <Secao titulo="Operação">
          <Campo rotulo="Base *" erro={erroDe("baseId")}>
            <select className="campo" value={f.baseId} onChange={(e) => setF((v) => ({ ...v, baseId: e.target.value, responsavelPagamentoId: "" }))}>
              <option value="">Selecione…</option>
              {bases.map((b) => (
                <option key={b.id} value={b.id}>{b.codigo} — {b.nome}</option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Status">
            <select className="campo" value={f.status} onChange={set("status")}>
              {STATUS_MOTORISTA.map((s) => (
                <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Tipo de veículo">
            <select className="campo" value={f.tipoVeiculo} onChange={set("tipoVeiculo")}>
              <option value="">—</option>
              {TIPOS_VEICULO.map((t) => (
                <option key={t} value={t}>{ROTULO_VEICULO[t]}</option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Placa">
            <input className="campo uppercase" value={f.placa} onChange={set("placa")} />
          </Campo>
          <Campo rotulo="Rota padrão">
            <input className="campo" value={f.rotaPadrao} onChange={set("rotaPadrao")} />
          </Campo>
          <Campo rotulo="ID Cortex (Amazon)">
            <input className="campo" value={f.idCortex} onChange={set("idCortex")} />
          </Campo>
        </Secao>

        <Secao titulo="Pagamento">
          <Campo
            rotulo="Responsável pelo pagamento"
            dica="Quem emite a nota e recebe. Deixe em branco se o próprio motorista recebe."
            erro={erroDe("responsavelPagamentoId")}
            className="sm:col-span-2"
          >
            <select className="campo" value={f.responsavelPagamentoId} onChange={set("responsavelPagamentoId")} disabled={ro || !f.baseId}>
              <option value="">O próprio motorista</option>
              {candidatos.data
                ?.filter((c) => c.id !== motorista?.id && !c.responsavelPagamentoId)
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
            </select>
          </Campo>
          <Campo rotulo="Chave PIX">
            <input className="campo" value={f.chavePix} onChange={set("chavePix")} />
          </Campo>
          <Campo rotulo="Favorecido (nome na conta)">
            <input className="campo" value={f.favorecido} onChange={set("favorecido")} />
          </Campo>
          <Campo rotulo="Banco / agência / conta" className="sm:col-span-2">
            <input className="campo" value={f.dadosBancarios} onChange={set("dadosBancarios")} />
          </Campo>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={f.contratoAssinado} onChange={(e) => setF((v) => ({ ...v, contratoAssinado: e.target.checked }))} />
            Contrato de prestação de serviço assinado
          </label>
        </Secao>

        <Campo rotulo="Observações">
          <textarea className="campo min-h-[70px]" value={f.observacoes} onChange={set("observacoes")} />
        </Campo>
      </fieldset>
    </Modal>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-marca-700">{titulo}</div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}
