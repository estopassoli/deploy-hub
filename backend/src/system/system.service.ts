import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);

@Injectable()
export class SystemService {
  constructor(private prisma: PrismaService) {}

  async getStats() {
    const [apps, deploys, runningApps] = await Promise.all([
      this.prisma.app.count(),
      this.prisma.deploy.count(),
      this.prisma.app.count({ where: { status: 'running' } }),
    ]);

    const stoppedApps = await this.prisma.app.count({ where: { status: 'stopped' } });

    // Get system metrics
    const cpuUsage = await this.getCpuUsage();
    const memoryUsage = this.getMemoryUsage();
    const diskUsage = await this.getDiskUsage();

    return {
      totalApps: apps,
      runningApps,
      stoppedApps,
      totalDeploys: deploys,
      cpuUsage,
      memoryUsage,
      diskUsage,
    };
  }

  private async getCpuUsage(): Promise<number> {
    try {
      const { stdout } = await execAsync("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'");
      return Math.round(parseFloat(stdout.trim()) || 0);
    } catch {
      // Fallback: calculate from os module
      const cpus = os.cpus();
      const totalIdle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
      const totalTick = cpus.reduce((acc, cpu) => 
        acc + cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq, 0
      );
      return Math.round(100 - (totalIdle / totalTick * 100));
    }
  }

  private getMemoryUsage(): number {
    const total = os.totalmem();
    const free = os.freemem();
    return Math.round(((total - free) / total) * 100);
  }

  private async getDiskUsage(): Promise<number> {
    try {
      const { stdout } = await execAsync("df -h / | tail -1 | awk '{print $5}'");
      return parseInt(stdout.trim().replace('%', '')) || 0;
    } catch {
      return 0;
    }
  }
}
