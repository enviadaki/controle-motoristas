import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, ROTULO_PERFIL } from "../lib/api";
import { useAuth } from "../lib/auth";
import { AvisoErro, Botao, Cabecalho, Campo, Cartao } from "../components/ui";

export function MinhaConta() {
  const { usuario } = useAuth();
  const [f, setF] = useState({ senhaAtual: "", novaSenha: "", confirmar: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const trocar = useMutation({
    mutationFn: () => api("/auth/trocar-senha", { method: "POST", body: { senhaAtual: f.senhaAtual, novaSenha: f.novaSenha } }),
    onSuccess: () => {
      setOk(true);
      setF({ senhaAtual: "", novaSenha: "", confirmar: "" });
    },
    onError: (e: Error) => setErro(e.message),
  });

  function enviar() {
    setErro(null);
    setOk(false);
    if (f.novaSenha !== f.confirmar) return setErro("A confirmação não confere com a nova senha");
    trocar.mutate();
  }

  return (
    <>
      <Cabecalho titulo="Minha conta" />
      <Cartao className="max-w-md p-5">
        <div className="mb-4 text-sm">
          <div className="font-medium">{usuario?.nome}</div>
          <div className="text-slate-500">{usuario?.email} · {usuario && ROTULO_PERFIL[usuario.perfil]}</div>
        </div>
        <AvisoErro>{erro}</AvisoErro>
        {ok && <div className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Senha alterada.</div>}
        <div className="space-y-3">
          <Campo rotulo="Senha atual">
            <input className="campo" type="password" autoComplete="current-password" value={f.senhaAtual} onChange={(e) => setF({ ...f, senhaAtual: e.target.value })} />
          </Campo>
          <Campo rotulo="Nova senha" dica="Mínimo de 8 caracteres">
            <input className="campo" type="password" autoComplete="new-password" value={f.novaSenha} onChange={(e) => setF({ ...f, novaSenha: e.target.value })} />
          </Campo>
          <Campo rotulo="Confirmar nova senha">
            <input className="campo" type="password" autoComplete="new-password" value={f.confirmar} onChange={(e) => setF({ ...f, confirmar: e.target.value })} />
          </Campo>
          <Botao carregando={trocar.isPending} onClick={enviar}>Trocar senha</Botao>
        </div>
      </Cartao>
    </>
  );
}
