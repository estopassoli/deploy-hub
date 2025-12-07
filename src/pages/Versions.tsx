import { useState } from 'react';
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
  AlertTriangle
} from 'lucide-react';
import { mockApps } from '@/data/mockData';
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

export default function Versions() {
  const [selectedAppId, setSelectedAppId] = useState(mockApps[0].id);
  const selectedApp = mockApps.find(app => app.id === selectedAppId);

  const handleRollback = (versionId: string) => {
    toast.success(`Rolling back to version ${versionId}...`);
  };

  const handleDeleteVersion = (versionId: string) => {
    toast.success(`Version ${versionId} deleted`);
  };

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
              {mockApps.map(app => (
                <SelectItem key={app.id} value={app.id}>
                  {app.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedApp && (
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
                    {selectedApp.versions.find(v => v.isCurrent)?.commitMessage}
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
              
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-6 top-0 bottom-0 w-px bg-border" />
                
                {selectedApp.versions.map((version, index) => (
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
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {version.commitMessage}
                          </p>
                          {version.commitHash && (
                            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                              <GitCommit className="h-3 w-3" />
                              <span className="font-mono">{version.commitHash}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
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
                                      This will switch the active version to <span className="font-mono">{version.timestamp}</span> and restart the PM2 process. The current version will remain available for future rollback.
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
                                  <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive">
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
                                      This will permanently delete the release files for version <span className="font-mono">{version.timestamp}</span>. This action cannot be undone.
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
    </Layout>
  );
}
