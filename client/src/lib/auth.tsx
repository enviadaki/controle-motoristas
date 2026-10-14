import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Perfil, type Usuario } from "./api";

interface AuthCtx {
  usuario: Usuario | null;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  tem: (...perfis: Perfil[]) => boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

// Limpa o cache de dados (de outro usuário) sem derrubar a query "me",
// que é observada pelo AuthProvider — qc.clear() desconectaria o observador.
function limparDados(qc: ReturnType<typeof useQueryClient>) {
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<Usuario>("/auth/me").catch(() => null),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const limpar = () => {
      limparDados(qc);
      qc.setQueryData(["me"], null);
    };
    window.addEventListener("sessao-expirada", limpar);
    return () => window.removeEventListener("sessao-expirada", limpar);
  }, [qc]);

  const usuario = data ?? null;
  const valor: AuthCtx = {
    usuario,
    carregando: isLoading,
    entrar: async (email, senha) => {
      const u = await api<Usuario>("/auth/login", { method: "POST", body: { email, senha } });
      limparDados(qc);
      qc.setQueryData(["me"], u);
    },
    sair: async () => {
      await api("/auth/logout", { method: "POST" }).catch(() => undefined);
      limparDados(qc);
      qc.setQueryData(["me"], null);
    },
    tem: (...perfis) => !!usuario && perfis.includes(usuario.perfil),
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth fora do AuthProvider");
  return c;
}
