import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type RegistroAuditoria } from "../lib/api";
import { dataHoraFmt } from "../lib/format";
import { Cabecalho, Carregando, Cartao, Modal, Selo, Vazio } from "../components/ui";

const ENTIDADES = [
  ["", "Tudo"],
  ["motorista", "Motoristas"],
  ["tabela_valores", "Tabela de valores"],
  ["base", "Bases"],
  ["usuario", "Usuários"],
] as const;

export function Auditoria() {
  const [entidade, setEntidade] = useState("");
  const [detalhe, setDetalhe] = useState<RegistroAuditoria | null>(null);
  const q = useQuery({
    queryKey: ["auditoria", entidade],
    queryFn: () => api<RegistroAuditoria[]>(`/auditoria?limite=300${entidade ? `&entidade=${entidade}` : ""}`),
  });

  return (
    <>
      <Cabecalho titulo="Auditoria" descricao="Histórico de quem alterou o quê e quando" />
      <Cartao className="mb-4 p-3">
        <select className="campo max-w-xs" value={entidade} onChange={(e) => setEntidade(e.target.value)}>
          {ENTIDADES.map(([v, r]) => (
            <option key={v} value={v}>{r}</option>
          ))}
        </select>
      </Cartao>
      <Cartao className="overflow-x-auto">
        {q.isLoading ? (
          <Carregando />
        ) : !q.data?.length ? (
          <Vazio>Nenhum registro.</Vazio>
        ) : (
          <table className="tabela w-full min-w-[640px]">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Quem</th>
                <th>Ação</th>
                <th>O quê</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((a) => (
                <tr key={a.id} className="cursor-pointer" onClick={() => setDetalhe(a)}>
                  <td className="whitespace-nowrap text-xs text-slate-500">{dataHoraFmt(a.createdAt)}</td>
                  <td>{a.usuarioNome ?? "—"}</td>
                  <td><Selo cor={a.acao === "EXCLUIR" ? "vermelho" : a.acao === "CRIAR" ? "verde" : "azul"}>{a.acao}</Selo></td>
                  <td className="text-slate-600">
                    {a.entidade} #{a.entidadeId}
                    {nome(a) && <span className="ml-1 text-slate-900">— {nome(a)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Cartao>
      {detalhe && (
        <Modal titulo={`${detalhe.acao} · ${detalhe.entidade} #${detalhe.entidadeId}`} aberto aoFechar={() => setDetalhe(null)}>
          <Diferencas antes={detalhe.antes} depois={detalhe.depois} />
        </Modal>
      )}
    </>
  );
}

function nome(a: RegistroAuditoria) {
  const r = a.depois ?? a.antes;
  return (r?.nome ?? r?.cidade ?? r?.codigo ?? null) as string | null;
}

const IGNORAR = new Set(["createdAt", "updatedAt", "id"]);

function Diferencas({ antes, depois }: { antes: Record<string, unknown> | null; depois: Record<string, unknown> | null }) {
  const chaves = [...new Set([...Object.keys(antes ?? {}), ...Object.keys(depois ?? {})])].filter((k) => !IGNORAR.has(k));
  const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : Array.isArray(v) ? v.join(", ") : String(v));
  const linhas = chaves
    .map((k) => ({ k, a: fmt(antes?.[k]), d: fmt(depois?.[k]) }))
    .filter((l) => !antes || !depois || l.a !== l.d);
  if (!linhas.length) return <Vazio>Sem alteração de campos.</Vazio>;
  return (
    <table className="tabela w-full">
      <thead>
        <tr>
          <th>Campo</th>
          {antes && <th>Antes</th>}
          {depois && <th>Depois</th>}
        </tr>
      </thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.k}>
            <td className="font-medium">{l.k}</td>
            {antes && <td className="text-red-700">{l.a}</td>}
            {depois && <td className="text-emerald-700">{l.d}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
