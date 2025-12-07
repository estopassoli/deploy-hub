const API_URL = import.meta.env.VITE_API_URL || 'https://api-panel.auraai.chat/api';

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('deployhub_token');
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('deployhub_token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('deployhub_token');
  }

  getToken() {
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
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

  async updateApp(id: string, data: { domain?: string; branch?: string; envVars?: string; installCommand?: string; buildCommand?: string; migrateCommand?: string; startCommand?: string }) {
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
}

export const api = new ApiClient();
export default api;
