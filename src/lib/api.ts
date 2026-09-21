import { clearToken, getToken, setToken } from './token';


/** Configuração de preview por branch. Ver `backend/src/system/settings.ts`. */
export interface PreviewConfig {
  previewEnabled: boolean;
  /** Lista separada por vírgula, com `*` como curinga. Vazio = nenhuma branch. */
  previewBranchPattern: string;
  /** Dias sem push até o preview ser removido. Zero desliga a expiração. */
  previewTtlDays: number;
}

export interface PreviewItem {
  id: string;
  name: string;
  domain: string | null;
  port: number;
  status: string;
  previewBranch: string | null;
  previewOfAppId: string | null;
  parentName: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

/** Cota semanal do Let's Encrypt para um domínio registrado (eTLD+1). */
export interface CertificateQuotaDomain {
  registeredDomain: string;
  level: 'ok' | 'warning' | 'exhausted';
  used: number;
  remaining: number;
  limit: number;
  resetsAt: string | null;
}

/**
 * Base da API.
 *
 * Exportada porque duplicar este fallback já causou bug: a sondagem da tela de login
 * tinha a própria cópia apontando para `http://localhost:10001/api`, então em produção
 * ela batia na máquina de quem abria o painel — o Chrome bloqueava como acesso ao
 * espaço de loopback e o rodapé dizia "API sem resposta" com a API no ar.
 */
export const API_URL = import.meta.env.VITE_API_URL || 'https://api-panel.auraai.chat/api';

class ApiClient {
  // O token vive em token.ts para que o cliente WebSocket leia o mesmo valor e seja
  // avisado no login/logout — ele precisa do JWT no handshake desde a Fase 1.
  setToken(token: string) {
    setToken(token);
  }

  clearToken() {
    clearToken();
  }

  getToken() {
    return getToken();
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    // 401 em /auth/* é resposta da tela, não sessão expirada.
    //
    // O interceptor antigo redirecionava para /login em QUALQUER 401 — inclusive no
    // próprio POST /auth/login. Senha errada recarregava a página inteira antes de o
    // `catch` do formulário rodar, então o erro nunca aparecia: a tela só piscava. É a
    // razão de o painel ter 81 `toast.error` e 2 erros inline.
    if (response.status === 401 && !endpoint.startsWith('/auth/')) {
      this.clearToken();
      // `replace` e não `href`: sessão expirada não deve empilhar entrada no histórico,
      // senão o "voltar" do navegador tenta a rota protegida de novo.
      const de = window.location.pathname + window.location.search;
      window.location.replace(`/login?de=${encodeURIComponent(de)}`);
      throw new Error('Sua sessão expirou. Entre de novo.');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Erro desconhecido' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Auth
  async login(email: string, password: string) {
    const result = await this.request<{ access_token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(result.access_token);
    return result;
  }

  async register(email: string, password: string, name?: string, secret?: string) {
    const result = await this.request<{ access_token: string; user: any }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, secret }),
    });
    this.setToken(result.access_token);
    return result;
  }

  async getMe() {
    return this.request<{ id: string; email: string; name: string }>('/auth/me');
  }

  // Apps
  async getApps() {
    return this.request<any[]>('/apps');
  }

  /** Presets de aplicação suportados (tipo, rótulo, se é estático). */
  async getAppPresets() {
    return this.request<Array<{ id: string; label: string; description: string; kind: string }>>('/apps/presets');
  }

  async getApp(id: string) {
    return this.request<any>(`/apps/${id}`);
  }

  async createApp(data: { name: string; type: string; port: number; domain?: string; repository: string; branch?: string }) {
    return this.request<any>('/apps', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateApp(id: string, data: { domain?: string; branch?: string; envVars?: string; installCommand?: string; buildCommand?: string; migrateCommand?: string; startCommand?: string; appDir?: string; workspacePackage?: string; runtime?: string; containerPort?: number | string | null; dockerContext?: string; healthPath?: string; maxMemoryMb?: number | string | null; cpuLimit?: number | string | null }) {
    return this.request<any>(`/apps/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getAppConfig(id: string) {
    const app = await this.request<any>(`/apps/${id}`);
    return { 
      envVars: app.envVars || '', 
      installCommand: app.installCommand || '',
      buildCommand: app.buildCommand || '',
      migrateCommand: app.migrateCommand || '',
      startCommand: app.startCommand || '',
      appDir: app.appDir || '',
      workspacePackage: app.workspacePackage || '',
    };
  }

  async deleteApp(id: string) {
    return this.request<any>(`/apps/${id}`, { method: 'DELETE' });
  }

  async startApp(id: string) {
    return this.request<any>(`/apps/${id}/start`, { method: 'POST' });
  }

  async stopApp(id: string) {
    return this.request<any>(`/apps/${id}/stop`, { method: 'POST' });
  }

  async restartApp(id: string) {
    return this.request<any>(`/apps/${id}/restart`, { method: 'POST' });
  }

  async getAppVersions(id: string) {
    return this.request<any[]>(`/apps/${id}/versions`);
  }

  async rollbackApp(appId: string, versionId: string) {
    return this.request<any>(`/apps/${appId}/rollback/${versionId}`, { method: 'POST' });
  }

  /** Remove uma release do disco e do histórico. O servidor recusa a que está no ar. */
  async deleteVersion(appId: string, versionId: string) {
    return this.request<{ removed: number; version: string }>(
      `/apps/${appId}/versions/${versionId}`,
      { method: 'DELETE' },
    );
  }

  /**
   * Limpeza em lote: mantém a release atual e as `keep` mais recentes depois dela.
   * `keep: 0` deixa só a que está em produção.
   */
  async pruneVersions(appId: string, keep: number) {
    return this.request<{ removed: number; failed: string[] }>(`/apps/${appId}/versions/prune`, {
      method: 'POST',
      body: JSON.stringify({ keep }),
    });
  }

  // GitHub/Webhook
  async getGithubWorkflow(appId: string) {
    const result = await this.request<{ workflow: string }>(`/webhook/github/workflow/${appId}`);
    return result.workflow;
  }

  async regenerateWebhookSecret(appId: string) {
    return this.request<{ secret: string }>(`/webhook/regenerate-secret/${appId}`, { method: 'POST' });
  }

  // Deploy
  async deploy(data: { 
    repository: string; 
    name: string; 
    port: number; 
    domain?: string; 
    type: string; 
    branch?: string; 
    installCommand?: string; 
    buildCommand?: string;
    migrateCommand?: string;
    startCommand?: string;
    appDir?: string;
    workspacePackage?: string;
    envVars?: string;
    generateSSL?: boolean
  }) {
    return this.request<any>('/deploy', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async redeploy(appId: string) {
    return this.request<any>(`/deploy/${appId}`, { method: 'POST' });
  }

  async checkPort(port: number) {
    return this.request<{ available: boolean; usedBy?: string; isSystemPort: boolean }>(`/deploy/check-port/${port}`);
  }

  async getDeployHistory() {
    return this.request<any[]>('/deploy/history');
  }

  /** Deploys em andamento agora, por chave (nome do app ou do projeto). */
  async getRunningDeploys() {
    return this.request<Array<{ key: string; startedAt: string; deployId?: string; source?: string }>>('/deploy/running');
  }

  /** Cancela o deploy em andamento; `key` é o nome do app ou do projeto. */
  async cancelDeploy(key: string) {
    return this.request<{ success: boolean; message: string }>(`/deploy/cancel/${encodeURIComponent(key)}`, {
      method: 'POST',
    });
  }

  /**
   * Reescreve o .env da release atual e reinicia, sem rebuild.
   * `diff.buildRequired` traz as chaves NEXT_PUBLIC_/VITE_ que só valem após redeploy.
   */
  async applyEnv(appId: string) {
    return this.request<{
      success: boolean;
      restarted: boolean;
      message: string;
      diff: { added: string[]; removed: string[]; changed: string[]; buildRequired: string[]; isEmpty: boolean };
    }>(`/apps/${appId}/apply-env`, { method: 'POST' });
  }

  async getDeployLogs(deployId: string) {
    return this.request<{ id: string; version: string; status: string; logs: string; createdAt: string }>(`/deploy/${deployId}/logs`);
  }

  // Logs
  async getSystemLogs(options?: { level?: string; appId?: string; limit?: number }) {
    const params = new URLSearchParams();
    if (options?.level) params.set('level', options.level);
    if (options?.appId) params.set('appId', options.appId);
    if (options?.limit) params.set('limit', options.limit.toString());
    return this.request<any[]>(`/logs?${params}`);
  }

  async getAppLogs(appId: string, lines?: number) {
    const params = lines ? `?lines=${lines}` : '';
    return this.request<any[]>(`/logs/app/${appId}${params}`);
  }

  async getPM2Logs(appName: string, lines?: number) {
    const params = lines ? `?lines=${lines}` : '';
    return this.request<any[]>(`/logs/pm2/${appName}${params}`);
  }

  // System
  async getStats() {
    return this.request<{
      totalApps: number;
      runningApps: number;
      stoppedApps: number;
      totalDeploys: number;
      cpuUsage: number;
      memoryUsage: number;
      diskUsage: number;
    }>('/system/stats');
  }

  async healthCheck() {
    return this.request<{ status: string; timestamp: string }>('/system/health');
  }

  async getSettings() {
    return this.request<{ emailEnabled: boolean; emailRecipient: string | null; slackWebhook: string | null }>('/system/settings');
  }

  /** Retenção de releases/logs e liga-desliga da limpeza automática. */
  async getGeneralSettings() {
    return this.request<{ retentionDays: number; autoCleanup: boolean }>('/system/settings/general');
  }

  async updateGeneralSettings(data: { retentionDays?: number; autoCleanup?: boolean }) {
    return this.request<{ retentionDays: number; autoCleanup: boolean }>('/system/settings/general', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  /** Canais de notificação. As credenciais nunca voltam do servidor. */
  async getNotificationSettings() {
    return this.request<{
      slackConfigured: boolean;
      discordConfigured: boolean;
      telegramConfigured: boolean;
      emailConfigured: boolean;
      notifyDeployFailed: boolean;
      notifyDeploySuccess: boolean;
      notifyRollback: boolean;
      notifyAppDown: boolean;
      notifySslExpiring: boolean;
    }>('/system/settings/notifications');
  }

  async updateNotificationSettings(data: Record<string, unknown>) {
    return this.request<any>('/system/settings/notifications', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async testNotifications() {
    return this.request<{
      results: Array<{ channel: string; ok: boolean; error?: string }>;
      message?: string;
    }>('/system/settings/notifications/test', { method: 'POST' });
  }

  /** Apaga o histórico de logs do sistema (Danger Zone). */
  async clearSystemLogs() {
    return this.request<{ removed: number }>('/system/logs/clear', { method: 'POST' });
  }

  async updateEmailSettings(data: { emailEnabled: boolean; emailRecipient?: string }) {
    return this.request<{ emailEnabled: boolean; emailRecipient: string | null }>('/system/settings/email', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Previews por branch (Fase 6.7)
  async getPreviews() {
    return this.request<{
      items: PreviewItem[];
      config: PreviewConfig;
      portRange: { start: number; end: number };
    }>('/previews');
  }

  async updatePreviewSettings(data: Partial<PreviewConfig>) {
    return this.request<PreviewConfig>('/previews/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deletePreview(name: string) {
    return this.request<{ handled: boolean; message: string }>(`/previews/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
  }

  async getCertificateQuota() {
    return this.request<{ limit: number; domains: CertificateQuotaDomain[] }>('/previews/certificate-quota');
  }

  // Backups
  async getBackups() {
    return this.request<{
      files: Array<{ name: string; sizeBytes: number; modifiedAt: string; kind: 'panel' | 'app'; appName?: string }>;
      config: { backupEnabled: boolean; backupRetentionDays: number; backupApps: boolean };
      directory: string;
    }>('/backups');
  }

  async updateBackupSettings(data: { backupEnabled?: boolean; backupRetentionDays?: number; backupApps?: boolean }) {
    return this.request<{ backupEnabled: boolean; backupRetentionDays: number; backupApps: boolean }>('/backups/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async runBackupNow() {
    return this.request<{ results: Array<{ ok: boolean; file?: string; error?: string; target: string }> }>('/backups/run', {
      method: 'POST',
    });
  }

  async deleteBackup(name: string) {
    return this.request<{ success: boolean }>(`/backups/${encodeURIComponent(name)}`, { method: 'DELETE' });
  }

  /**
   * Baixa um backup.
   *
   * Um `<a download>` não manda header, e o endpoint exige JWT. Então o arquivo é
   * buscado com o header e entregue ao navegador como blob — o que também evita
   * expor o token numa URL, onde ele acabaria no histórico e no log do nginx.
   */
  async downloadBackup(name: string): Promise<void> {
    const token = getToken();
    const response = await fetch(`${API_URL}/backups/download/${encodeURIComponent(name)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!response.ok) {
      throw new Error(`Não foi possível baixar o backup (HTTP ${response.status})`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // Auditoria
  /** Trilha de auditoria. O servidor nunca devolve valores de variáveis nem segredos. */
  async getAuditLog(params: { limit?: number; cursor?: string; action?: string; targetId?: string; userEmail?: string } = {}) {
    const query = new URLSearchParams();
    if (params.limit) query.set('limit', String(params.limit));
    if (params.cursor) query.set('cursor', params.cursor);
    if (params.action) query.set('action', params.action);
    if (params.targetId) query.set('targetId', params.targetId);
    if (params.userEmail) query.set('userEmail', params.userEmail);

    return this.request<{
      entries: Array<{
        id: string;
        userEmail: string | null;
        action: string;
        targetType: string | null;
        targetId: string | null;
        targetName: string | null;
        metadata: Record<string, unknown> | null;
        ip: string | null;
        success: boolean;
        createdAt: string;
      }>;
      nextCursor: string | null;
    }>(`/audit?${query}`);
  }

  async getAuditActions() {
    return this.request<string[]>('/audit/actions');
  }

  // Uptime e SSL
  /** Disponibilidade do domínio e validade do certificado. */
  async getUptime(appId: string, hours = 24) {
    return this.request<{
      domain: string | null;
      enabled: boolean;
      currentStatus: string | null;
      lastCheckedAt: string | null;
      uptimePercentage: number | null;
      averageResponseMs: number | null;
      checks: Array<{ status: string; statusCode: number | null; responseMs: number | null; error: string | null; checkedAt: string }>;
      ssl: { expiresAt: string | null; daysRemaining: number | null; status: 'ok' | 'expiring' | 'expired' | 'unknown' };
    }>(`/uptime/${appId}?hours=${hours}`);
  }

  /** Força uma checagem agora, sem esperar o cron. */
  async checkUptimeNow(appId: string) {
    return this.request<{ status: string; statusCode?: number; responseMs?: number; error?: string; sslExpiresAt: string | null }>(
      `/uptime/${appId}/check`,
      { method: 'POST' },
    );
  }

  // Metrics
  async getAppMetrics(appId: string, hours: number = 1) {
    return this.request<Array<{ cpu: number; memory: number; time: string }>>(`/metrics/${appId}?hours=${hours}`);
  }

  // Projects (monorepo)
  async detectProject(data: { repository: string; branch?: string }) {
    return this.request<{ packageManager: string; services: Array<{ appDir: string; workspacePackage: string; type: string; suggestedPort: number | null; suggestedName: string; hasPrisma: boolean }> }>('/projects/detect', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async createProject(data: {
    name: string;
    repository: string;
    branch?: string;
    envVars?: string;
    generateSSL?: boolean;
    services: Array<{ name: string; appDir: string; workspacePackage?: string; type: string; port: number; domain?: string; envVars?: string }>;
  }) {
    return this.request<any>('/projects', { method: 'POST', body: JSON.stringify(data) });
  }

  async getProjects() {
    return this.request<any[]>('/projects');
  }

  async redeployProject(id: string) {
    return this.request<any>(`/projects/${id}/redeploy`, { method: 'POST' });
  }

  async rollbackProject(id: string, deployId: string) {
    return this.request<any>(`/projects/${id}/rollback/${deployId}`, { method: 'POST' });
  }

  async deleteProject(id: string) {
    return this.request<any>(`/projects/${id}`, { method: 'DELETE' });
  }

  async generateProjectSsl(id: string) {
    return this.request<{ results: Array<{ domain: string | null; ok: boolean; error?: string }>; message?: string }>(`/projects/${id}/generate-ssl`, { method: 'POST' });
  }

  async getProject(id: string) {
    return this.request<any>(`/projects/${id}`);
  }

  async updateProject(id: string, data: { envVars?: string; branch?: string }) {
    return this.request<any>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async getAvailableServices(id: string, source: 'release' | 'repo' = 'release') {
    return this.request<{
      source: 'release' | 'repo';
      services: Array<{ appDir: string; workspacePackage: string; type: string; suggestedPort: number | null; suggestedName: string; hasPrisma: boolean }>;
      reason?: string;
    }>(`/projects/${id}/available-services?source=${source}`);
  }

  async addProjectService(id: string, data: {
    name: string;
    appDir: string;
    workspacePackage?: string;
    type: string;
    port: number;
    domain?: string;
    envVars?: string;
    generateSSL?: boolean;
  }) {
    return this.request<any>(`/projects/${id}/services`, { method: 'POST', body: JSON.stringify(data) });
  }

  async deployProjectService(id: string, appId: string) {
    return this.request<any>(`/projects/${id}/services/${appId}/deploy`, { method: 'POST' });
  }

  async removeProjectService(id: string, appId: string) {
    return this.request<any>(`/projects/${id}/services/${appId}`, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
export default api;
