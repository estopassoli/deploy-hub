import { clearToken, getToken, setToken } from './token';

const API_URL = import.meta.env.VITE_API_URL || 'https://api-panel.auraai.chat/api';

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

    if (response.status === 401) {
      this.clearToken();
      window.location.href = '/login';
      throw new Error('Não autorizado');
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

  async getApp(id: string) {
    return this.request<any>(`/apps/${id}`);
  }

  async createApp(data: { name: string; type: string; port: number; domain?: string; repository: string; branch?: string }) {
    return this.request<any>('/apps', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateApp(id: string, data: { domain?: string; branch?: string; envVars?: string; installCommand?: string; buildCommand?: string; migrateCommand?: string; startCommand?: string; appDir?: string; workspacePackage?: string; runtime?: string; containerPort?: number | string | null; dockerContext?: string; healthPath?: string }) {
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

  async deleteVersion(appId: string, versionId: string) {
    return this.request<any>(`/apps/${appId}/versions/${versionId}`, { method: 'DELETE' });
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
