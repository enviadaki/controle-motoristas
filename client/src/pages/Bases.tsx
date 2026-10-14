import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api, OPERACOES, type Base, type Operacao } from "../lib/api";
import { AvisoErro, Botao, Cabecalho, Campo, Carregando, Cartao, Modal, Selo } from "../components/ui";

export function Bases() {
  const [editando, setEditando] = useState<Base | "nova" | null>(null);
  const bases = useQuery({ queryKey: ["bases"], queryFn: () => api<Base[]>("/bases") });

  return (
    <>
      <Cabecalho
        titulo="Bases"
        descricao="Bases/filiais e as operações que cada uma atende"
        acoes={
          <Botao onClick={() => setEditando("nova")}>
            <Plus className="h-4 w-4" /> Nova base
          </Botao>
        }
      />
      <Cartao className="overflow-x-auto">
        {bases.isLoading ? (
          <Carregando />
        ) : (
          <table className="tabela w-full">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
                <th>Cidade</th>
                <th>Operações</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {bases.data?.map((b) => (
                <tr key={b.id} className="cursor-pointer" onClick={() => setEditando(b)}>
                  <td className="font-medium">{b.codigo}</td>
                  <td>{b.nome}</td>
                  <td className="text-slate-600">{b.cidade ? `${b.cidade}/${b.uf}` : "—"}</td>
                  <td className="space-x-1">
                    {b.operacoes.map((o) => (
                      <Selo key={o} cor="azul">{o}</Selo>
                    ))}
                  </td>
                  <td>{b.ativo ? <Selo cor="verde">Ativa</Selo> : <Selo>Inativa</Selo>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Cartao>
      {editando && <FormBase base={editando === "nova" ? null : editando} aoFechar={() => setEditando(null)} />}
    </>
  );
}

function FormBase({ base, aoFechar }: { base: Base | null; aoFechar: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    codigo: base?.codigo ?? "",
    nome: base?.nome ?? "",
    cidade: base?.cidade ?? "",
    uf: base?.uf ?? "BA",
    operacoes: base?.operacoes ?? (["AMAZON"] as Operacao[]),
    ativo: base?.ativo ?? true,
  });
  const [erro, setErro] = useState<string | null>(null);
  const salvar = useMutation({
    mutationFn: () =>
      base ? api(`/bases/${base.id}`, { method: "PUT", body: f }) : api("/bases", { method: "POST", body: f }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bases"] });
      aoFechar();
    },
    onError: (e: Error) => setErro(e.message),
  });

  const alternar = (o: Operacao) =>
    setF((v) => ({ ...v, operacoes: v.operacoes.includes(o) ? v.operacoes.filter((x) => x !== o) : [...v.operacoes, o] }));

  return (
    <Modal
      titulo={base ? `Editar base ${base.codigo}` : "Nova base"}
      aberto
      aoFechar={aoFechar}
      largura="max-w-lg"
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
          <Botao carregando={salvar.isPending} onClick={() => { setErro(null); salvar.mutate(); }}>Salvar</Botao>
        </>
      }
    >
      <AvisoErro>{erro}</AvisoErro>
      <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
        <Campo rotulo="Código *">
          <input className="campo uppercase" maxLength={10} value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} />
        </Campo>
        <Campo rotulo="Nome *">
          <input className="campo" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        </Campo>
        <Campo rotulo="UF">
          <input className="campo uppercase" maxLength={2} value={f.uf} onChange={(e) => setF({ ...f, uf: e.target.value })} />
        </Campo>
        <Campo rotulo="Cidade">
          <input className="campo" value={f.cidade} onChange={(e) => setF({ ...f, cidade: e.target.value })} />
        </Campo>
      </div>
      <div className="mt-4">
        <div className="mb-1 text-xs font-medium text-slate-600">Operações atendidas *</div>
        <div className="flex gap-4">
          {OPERACOES.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.operacoes.includes(o)} onChange={() => alternar(o)} /> {o}
            </label>
          ))}
        </div>
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Base ativa
      </label>
    </Modal>
  );
}
