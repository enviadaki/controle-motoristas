import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";
import { AvisoErro, Botao, Campo } from "../components/ui";

export function Login() {
  const { entrar } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar(email, senha);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-b from-marca-50 to-slate-50 px-4">
      <form onSubmit={enviar} className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-7 shadow-sm">
        <img src="/enviadaki-logo.png" alt="Envia Daki" className="mx-auto mb-3 h-12 w-auto" />
        <h1 className="text-center text-lg font-semibold text-slate-900">Controle de Motoristas</h1>
        <p className="mb-6 text-center text-sm text-slate-500">Entre com seu e-mail corporativo</p>
        <AvisoErro>{erro}</AvisoErro>
        <div className="space-y-4">
          <Campo rotulo="E-mail">
            <input className="campo" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Campo>
          <Campo rotulo="Senha">
            <input className="campo" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
          </Campo>
          <Botao type="submit" carregando={enviando} className="w-full">
            Entrar
          </Botao>
        </div>
      </form>
    </div>
  );
}
