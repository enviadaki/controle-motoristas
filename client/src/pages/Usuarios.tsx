import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api, PERFIS, ROTULO_PERFIL, type Base, type Perfil, type UsuarioAdmin } from "../lib/api";
import { dataHoraFmt } from "../lib/format";
import { AvisoErro, Botao, Cabecalho, Campo, Carregando, Cartao, Modal, Selo } from "../components/ui";

const DESCRICAO_PERFIL: Record<Perfil, string> = {
  ADMIN: "Acesso total, incluindo usuários, bases e tabela de valores.",
  DESCONTOS: "Lança e gerencia os descontos de avaria/extravio (a partir do Passo 2).",
  LIDER: "Lança a operação diária da(s) sua(s) base(s) e vê os descontos travados. Só enxerga as próprias bases.",
  FINANCEIRO: "Confere fechamentos e o consolidado de todas as bases; mantém dados de pagamento dos motoristas.",
};

export function Usuarios() {
  const [editando, setEditando] = useState<UsuarioAdmin | "novo" | null>(null);
  const usuarios = useQuery({ queryKey: ["usuarios"], queryFn: () => api<UsuarioAdmin[]>("/usuarios") });
  const bases = useQuery({ queryKey: ["bases"], queryFn: () => api<Base[]>("/bases") });
  const codigo = (id: number) => bases.data?.find((b) => b.id === id)?.codigo ?? id;

  return (
    <>
      <Cabecalho
        titulo="Usuários"
        descricao="Quem acessa o sistema e com qual perfil"
        acoes={
          <Botao onClick={() => setEditando("novo")}>
            <Plus className="h-4 w-4" /> Novo usuário
          </Botao>
        }
      />
      <Cartao className="overflow-x-auto">
        {usuarios.isLoading ? (
          <Carregando />
        ) : (
          <table className="tabela w-full min-w-[700px]">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Bases</th>
                <th>Último acesso</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.data?.map((u) => (
                <tr key={u.id} className="cursor-pointer" onClick={() => setEditando(u)}>
                  <td className="font-medium">{u.nome}</td>
                  <td className="text-slate-600">{u.email}</td>
                  <td>{ROTULO_PERFIL[u.perfil]}</td>
                  <td className="text-slate-600">{u.perfil === "LIDER" ? u.baseIds.map(codigo).join(", ") : "Todas"}</td>
                  <td className="text-xs text-slate-500">{dataHoraFmt(u.ultimoAcesso)}</td>
                  <td>{u.ativo ? <Selo cor="verde">Ativo</Selo> : <Selo>Inativo</Selo>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Cartao>
      {editando && (
        <FormUsuario usuario={editando === "novo" ? null : editando} bases={bases.data ?? []} aoFechar={() => setEditando(null)} />
      )}
    </>
  );
}

function FormUsuario({ usuario, bases, aoFechar }: { usuario: UsuarioAdmin | null; bases: Base[]; aoFechar: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    nome: usuario?.nome ?? "",
    email: usuario?.email ?? "",
    perfil: usuario?.perfil ?? ("LIDER" as Perfil),
    ativo: usuario?.ativo ?? true,
    baseIds: usuario?.baseIds ?? ([] as number[]),
    senha: "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const salvar = useMutation({
    mutationFn: () => {
      const corpo = { ...f, senha: f.senha || undefined };
      return usuario ? api(`/usuarios/${usuario.id}`, { method: "PUT", body: corpo }) : api("/usuarios", { method: "POST", body: corpo });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      aoFechar();
    },
    onError: (e: Error) => setErro(e.message),
  });
  const alternarBase = (id: number) =>
    setF((v) => ({ ...v, baseIds: v.baseIds.includes(id) ? v.baseIds.filter((x) => x !== id) : [...v.baseIds, id] }));

  return (
    <Modal
      titulo={usuario ? "Editar usuário" : "Novo usuário"}
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
      <div className="space-y-3">
        <Campo rotulo="Nome *">
          <input className="campo" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        </Campo>
        <Campo rotulo="E-mail *">
          <input className="campo" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Campo>
        <Campo rotulo="Perfil *" dica={DESCRICAO_PERFIL[f.perfil]}>
          <select className="campo" value={f.perfil} onChange={(e) => setF({ ...f, perfil: e.target.value as Perfil })}>
            {PERFIS.map((p) => (
              <option key={p} value={p}>{ROTULO_PERFIL[p]}</option>
            ))}
          </select>
        </Campo>
        {f.perfil === "LIDER" && (
          <div>
            <div className="mb-1 text-xs font-medium text-slate-600">Bases deste líder *</div>
            <div className="grid grid-cols-2 gap-1.5 rounded-md border border-slate-200 p-2">
              {bases.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={f.baseIds.includes(b.id)} onChange={() => alternarBase(b.id)} />
                  {b.codigo} <span className="truncate text-slate-500">{b.nome}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        <Campo
          rotulo={usuario ? "Redefinir senha" : "Senha inicial *"}
          dica={usuario ? "Deixe em branco para manter a senha atual" : "Mínimo de 8 caracteres. O usuário pode trocar depois em Minha conta."}
        >
          <input className="campo" type="password" autoComplete="new-password" value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} />
        </Campo>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Usuário ativo
        </label>
      </div>
    </Modal>
  );
}
