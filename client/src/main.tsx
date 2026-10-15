import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import { AuthProvider, useAuth } from "./lib/auth";
import type { Perfil } from "./lib/api";
import { Layout } from "./components/Layout";
import { Carregando } from "./components/ui";
import { Login } from "./pages/Login";
import { Inicio } from "./pages/Inicio";
import { Motoristas } from "./pages/Motoristas";
import { Lancamentos } from "./pages/Lancamentos";
import { Descontos } from "./pages/Descontos";
import { AprovacaoParcelamentos } from "./pages/AprovacaoParcelamentos";
import { PainelLider } from "./pages/PainelLider";
import { Fechamentos, FechamentosHistorico } from "./pages/Fechamentos";
import { Consolidado } from "./pages/Consolidado";
import { Bases } from "./pages/Bases";
import { TabelaValores } from "./pages/TabelaValores";
import { Usuarios } from "./pages/Usuarios";
import { Auditoria } from "./pages/Auditoria";
import { MinhaConta } from "./pages/MinhaConta";

const qc = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

function Protegido({ perfis, children }: { perfis?: Perfil[]; children: React.ReactNode }) {
  const { usuario, carregando, tem } = useAuth();
  if (carregando) return <Carregando />;
  if (!usuario) return <Navigate to="/login" replace />;
  if (perfis && !tem(...perfis)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Rotas() {
  const { usuario, carregando } = useAuth();
  // CFO (Linsmar) é o único que autoriza parcelamento — a primeira tela dele
  // ao entrar é a fila de aprovação, não o painel geral. Líder também tem
  // tela própria: atalhos grandes pro dia a dia, sem números de cadastro
  // nem roteiro do projeto (ver PainelLider).
  return (
    <Routes>
      <Route path="/login" element={!carregando && usuario ? <Navigate to="/" replace /> : <Login />} />
      <Route
        element={
          <Protegido>
            <Layout />
          </Protegido>
        }
      >
        <Route
          index
          element={usuario?.perfil === "CFO" ? <AprovacaoParcelamentos /> : usuario?.perfil === "LIDER" ? <PainelLider /> : <Inicio />}
        />
        <Route path="aprovacoes" element={<Protegido perfis={["CFO", "ADMIN"]}><AprovacaoParcelamentos /></Protegido>} />
        <Route path="lancamentos" element={<Lancamentos />} />
        <Route path="descontos" element={<Descontos />} />
        <Route path="fechamentos" element={<Fechamentos />} />
        <Route path="fechamentos/historico" element={<Protegido perfis={["ADMIN", "FINANCEIRO"]}><FechamentosHistorico /></Protegido>} />
        <Route path="consolidado" element={<Protegido perfis={["ADMIN", "FINANCEIRO"]}><Consolidado /></Protegido>} />
        <Route path="motoristas" element={<Motoristas />} />
        <Route path="tabela-valores" element={<TabelaValores />} />
        <Route path="bases" element={<Protegido perfis={["ADMIN"]}><Bases /></Protegido>} />
        <Route path="usuarios" element={<Protegido perfis={["ADMIN"]}><Usuarios /></Protegido>} />
        <Route path="auditoria" element={<Protegido perfis={["ADMIN"]}><Auditoria /></Protegido>} />
        <Route path="minha-conta" element={<MinhaConta />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AuthProvider>
          <Rotas />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
