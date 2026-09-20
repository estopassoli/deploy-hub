import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppShell } from "./components/shell/AppShell";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LegacyAppRedirect } from "./routes/LegacyAppRedirect";

import Login from "./pages/Login";
import Overview from "./pages/Overview";
import NewDeploy from "./pages/NewDeploy";
import DeploymentsGlobal from "./pages/DeploymentsGlobal";
import Logs from "./pages/Logs";
import Terminal from "./pages/Terminal";
import Settings from "./pages/Settings";
import Audit from "./pages/Audit";
import SearchPage from "./pages/SearchPage";
import NotFound from "./pages/NotFound";

import AppPage from "./pages/app/AppPage";
import AppOverviewTab from "./pages/app/AppOverviewTab";
import AppDeploymentsTab from "./pages/app/AppDeploymentsTab";
import AppLogsTab from "./pages/app/AppLogsTab";
import AppEnvTab from "./pages/app/AppEnvTab";
import AppGitTab from "./pages/app/AppGitTab";
import AppSettingsTab from "./pages/app/AppSettingsTab";

import ProjectPage from "./pages/project/ProjectPage";
import ProjectServicesTab from "./pages/project/ProjectServicesTab";
import ProjectEnvTab from "./pages/project/ProjectEnvTab";
import ProjectDeploymentsTab from "./pages/project/ProjectDeploymentsTab";
import ProjectSettingsTab from "./pages/project/ProjectSettingsTab";

const queryClient = new QueryClient();

/**
 * Roteamento por **objeto**, não por ferramenta.
 *
 * A nav tinha nove destinos, dois deles formulários de criação, e a entidade com 21
 * instâncias — apps — não aparecia em lugar nenhum. Cada aba da página do app vivia em
 * `useState`, então não existia `/apps/:name/deployments` para uma notificação, um
 * favorito ou o ⌘K apontarem.
 *
 * O shell entra **uma vez**, como layout route. Antes, onze páginas importavam
 * `<Layout>` e ele remontava a cada navegação: a sidebar refazia fetch e o scroll se
 * perdia entre rotas.
 */
const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster position="bottom-right" />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<ErrorBoundary><Login /></ErrorBoundary>} />

            <Route
              element={
                <ProtectedRoute>
                  <ErrorBoundary>
                    <AppShell />
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            >
              <Route index element={<Overview />} />
              <Route path="new" element={<NewDeploy />} />
              <Route path="deployments" element={<DeploymentsGlobal />} />
              <Route path="logs" element={<Logs />} />
              <Route path="terminal" element={<Terminal />} />
              <Route path="settings" element={<Settings />} />
              <Route path="audit" element={<Audit />} />
              <Route path="buscar" element={<SearchPage />} />

              <Route path="apps/:name" element={<AppPage />}>
                <Route index element={<AppOverviewTab />} />
                <Route path="deployments" element={<AppDeploymentsTab />} />
                <Route path="logs" element={<AppLogsTab />} />
                <Route path="env" element={<AppEnvTab />} />
                <Route path="git" element={<AppGitTab />} />
                <Route path="settings" element={<AppSettingsTab />} />
              </Route>

              <Route path="projects/:id" element={<ProjectPage />}>
                <Route index element={<ProjectServicesTab />} />
                <Route path="env" element={<ProjectEnvTab />} />
                <Route path="deployments" element={<ProjectDeploymentsTab />} />
                <Route path="settings" element={<ProjectSettingsTab />} />
              </Route>

              {/* Rotas legadas — ver `routes/LegacyAppRedirect.tsx`. */}
              <Route path="deploy" element={<Navigate to="/new" replace />} />
              <Route path="projects/new" element={<Navigate to="/new" replace />} />
              <Route path="versions" element={<LegacyAppRedirect tab="deployments" />} />
              <Route path="github" element={<LegacyAppRedirect tab="git" />} />

              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
