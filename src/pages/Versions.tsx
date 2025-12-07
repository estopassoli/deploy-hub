import { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  RotateCcw,
  CheckCircle2,
  Clock,
  GitCommit,
  Trash2,
  AlertTriangle,
  Loader2,
  FileText,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import api from '@/lib/api';
import { App } from '@/types/app';

interface Version {
  id: string;
  timestamp: string;
  commitHash?: string;
  commitMessage?: string;
  status?: string;
  isCurrent: boolean;
}

export default function Versions() {
  const [apps, setApps] = useState<App[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [versions, setVersions] = useState<Version[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [selectedDeployLogs, setSelectedDeployLogs] = useState<{ version: string; logs: string; status: string } | null>(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  
  const selectedApp = apps.find(app => app.id === selectedAppId);

  useEffect(() => {
    loadApps();
  }, []);

  useEffect(() => {
    if (selectedAppId) {
      loadVersions();
    }
  }, [selectedAppId]);

  const loadApps = async () => {
    try {
      const data = await api.getApps();
      setApps(data);
      if (data.length > 0) {
        setSelectedAppId(data[0].id);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to load apps');
    } finally {
      setIsLoading(false);
    }
  };

  const loadVersions = async () => {
    setIsLoadingVersions(true);
    try {
      const data = await api.getAppVersions(selectedAppId);
      setVersions(data);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load versions');
    } finally {
      setIsLoadingVersions(false);
    }
  };

  const handleRollback = async (versionId: string) => {
    try {
      await api.rollbackApp(selectedAppId, versionId);
      toast.success(`Rolling back to version ${versionId}...`);
      loadVersions();
    } catch (error: any) {
      toast.error(error.message || 'Failed to rollback');
    }
  };

  const handleDeleteVersion = async (versionId: string) => {
    try {
      await api.deleteVersion(selectedAppId, versionId);
      toast.success(`Version ${versionId} deleted`);
      loadVersions();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete version');
    }
  };

  const handleViewLogs = async (deployId: string, version: string) => {
    setLogsModalOpen(true);
    setIsLoadingLogs(true);
    setSelectedDeployLogs(null);
    
    try {
      const data = await api.getDeployLogs(deployId);
      setSelectedDeployLogs({
        version: data.version,
        logs: data.logs,
        status: data.status,
      });
    } catch (error: any) {
      toast.error(error.message || 'Failed to load deploy logs');
      setLogsModalOpen(false);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (apps.length === 0) {
    return (
      <Layout>
        <div className="flex h-[50vh] flex-col items-center justify-center text-center">
          <GitCommit className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold">No apps found</h2>
          <p className="text-muted-foreground mt-2">Deploy an app first to manage versions</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Version Management</h1>
            <p className="mt-1 text-muted-foreground">
              Manage releases and perform rollbacks
            </p>
          </div>
          <Select value={selectedAppId} onValueChange={setSelectedAppId}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Select app" />
            </SelectTrigger>
            <SelectContent>
              {apps.map(app => (
                <SelectItem key={app.id} value={app.id}>
                  {app.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoadingVersions ? (
          <div className="flex h-[30vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : selectedApp && (
          <>
            {/* Current Version Card */}
            <div className="mb-8 rounded-xl border border-primary/30 bg-card p-6 glow-primary">
              <div className="flex items-center gap-2 text-sm text-primary mb-4">
                <CheckCircle2 className="h-4 w-4" />
                Current Active Version
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-foreground font-mono">
                    {selectedApp.currentVersion}
                  </h3>
                  <p className="mt-1 text-muted-foreground">
                    {versions.find(v => v.isCurrent)?.commitMessage || 'No commit message'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Path</p>
                  <p className="font-mono text-sm text-foreground">
                    ~/apps/{selectedApp.name}/current
                  </p>
                </div>
              </div>
            </div>

            {/* Version Timeline */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground">Release History</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Versions are retained for 30 days. Click rollback to switch to a previous version.
              </p>
              
              {versions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No versions found
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-6 top-0 bottom-0 w-px bg-border" />
                  
                  {versions.map((version, index) => (
                    <div 
                      key={version.id}
                      className={cn(
                        'relative flex items-start gap-4 pb-6',
                        'opacity-0 animate-slide-in',
                        `stagger-${Math.min(index + 1, 5)}`
                      )}
                    >
                      {/* Timeline dot */}
                      <div className={cn(
                        'relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full',
                        version.isCurrent 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-secondary text-muted-foreground'
                      )}>
                        {version.isCurrent ? (
                          <CheckCircle2 className="h-5 w-5" />
                        ) : (
                          <GitCommit className="h-5 w-5" />
                        )}
                      </div>

                      {/* Content */}
                      <div className={cn(
                        'flex-1 rounded-xl border p-4',
                        version.isCurrent 
                          ? 'border-primary/30 bg-primary/5' 
                          : 'border-border bg-card hover:border-primary/20'
                      )}>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-mono font-semibold text-foreground">
                                {version.timestamp}
                              </h4>
                              {version.isCurrent && (
                                <span className="inline-flex items-center rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                                  Active
                                </span>
                              )}
                              {/* Status Badge */}
                              {version.status === 'success' && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-success/20 px-2 py-0.5 text-xs font-medium text-success">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Success
                                </span>
                              )}
                              {version.status === 'failed' && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2 py-0.5 text-xs font-medium text-destructive">
                                  <AlertTriangle className="h-3 w-3" />
                                  Failed
                                </span>
                              )}
                              {version.status === 'building' && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Building
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {version.commitMessage || 'No commit message'}
                            </p>
                            {version.commitHash && (
                              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                                <GitCommit className="h-3 w-3" />
                                <span className="font-mono">{version.commitHash}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleViewLogs(version.id, version.timestamp)}
                            >
                              <FileText className="h-4 w-4" />
                              Logs
                            </Button>
                            {!version.isCurrent && (
                              <>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="outline" size="sm">
                                      <RotateCcw className="h-4 w-4" />
                                      Rollback
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Confirm Rollback</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will switch the active version to <span className="font-mono">{version.timestamp}</span> and restart the PM2 process.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleRollback(version.id)}>
                                        Confirm Rollback
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>

                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle className="flex items-center gap-2">
                                        <AlertTriangle className="h-5 w-5 text-destructive" />
                                        Delete Version
                                      </AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will permanently delete version <span className="font-mono">{version.timestamp}</span>.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction 
                                        onClick={() => handleDeleteVersion(version.id)}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Retention Notice */}
            <div className="mt-8 rounded-lg border border-border bg-secondary/30 p-4 flex items-start gap-3">
              <Clock className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Automatic Cleanup</p>
                <p className="text-sm text-muted-foreground">
                  Versions older than 30 days are automatically deleted. A cron job runs daily to clean up old releases.
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Logs Modal */}
      <Dialog open={logsModalOpen} onOpenChange={setLogsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Deploy Logs - {selectedDeployLogs?.version}
            </DialogTitle>
          </DialogHeader>
          {isLoadingLogs ? (
            <div className="flex h-[300px] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <ScrollArea className="h-[500px] rounded-lg border border-border bg-background p-4">
              <pre className="font-mono text-sm whitespace-pre-wrap text-foreground/90">
                {selectedDeployLogs?.logs}
              </pre>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
