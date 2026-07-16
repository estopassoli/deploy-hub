export type AppType = 'nextjs' | 'nestjs' | 'vitejs';
export type AppStatus = 'running' | 'stopped' | 'error' | 'deploying';

export interface AppVersion {
  id: string;
  timestamp: string;
  commitHash?: string;
  commitMessage?: string;
  isCurrent: boolean;
}

export interface App {
  id: string;
  name: string;
  type: AppType;
  port: number;
  domain: string;
  status: AppStatus;
  uptime: string;
  currentVersion: string;
  versions: AppVersion[];
  repository: string;
  branch: string;
  appDir?: string;
  workspacePackage?: string;
  projectId?: string;
  lastDeploy: string;
  cpu?: number;
  memory?: number;
  webhookSecret?: string;
}

export interface DeployConfig {
  repository: string;
  name: string;
  port: number;
  domain: string;
  type: AppType;
  branch: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source?: string;
}

export interface SystemStats {
  totalApps: number;
  runningApps: number;
  stoppedApps: number;
  totalDeploys: number;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
}

export interface DetectedService {
  appDir: string;
  workspacePackage: string;
  type: AppType;
  suggestedPort: number | null;
  suggestedName: string;
  hasPrisma: boolean;
}

export interface Project {
  id: string;
  name: string;
  repository: string;
  branch: string;
  packageManager?: string;
  status: AppStatus;
  apps: App[];
}
