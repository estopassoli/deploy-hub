import { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Github,
  Copy,
  Check,
  RefreshCw,
  Shield,
  Webhook,
  FileCode,
  ExternalLink
} from 'lucide-react';
import { mockApps } from '@/data/mockData';
import { toast } from 'sonner';

export default function GitHub() {
  const [selectedAppId, setSelectedAppId] = useState(mockApps[0].id);
  const [copiedYaml, setCopiedYaml] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  
  const selectedApp = mockApps.find(app => app.id === selectedAppId);
  const webhookSecret = 'whsec_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

  const generateYaml = () => {
    return `name: Deploy to VPS

on:
  push:
    branches:
      - ${selectedApp?.branch || 'main'}

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - name: Trigger Deploy Webhook
        run: |
          curl -X POST \\
            -H "Content-Type: application/json" \\
            -H "X-Hub-Signature-256: sha256=\${{ secrets.DEPLOY_WEBHOOK_SECRET }}" \\
            -d '{
              "app": "${selectedApp?.name}",
              "branch": "${selectedApp?.branch}",
              "commit": "\${{ github.sha }}",
              "message": "\${{ github.event.head_commit.message }}"
            }' \\
            https://62.72.9.22:10001/api/deploy/webhook
            
      - name: Check Deploy Status
        run: |
          echo "Deploy triggered for ${selectedApp?.name}"
          echo "Commit: \${{ github.sha }}"`;
  };

  const copyToClipboard = (text: string, type: 'yaml' | 'secret') => {
    navigator.clipboard.writeText(text);
    if (type === 'yaml') {
      setCopiedYaml(true);
      setTimeout(() => setCopiedYaml(false), 2000);
    } else {
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
    toast.success('Copied to clipboard!');
  };

  const regenerateSecret = () => {
    toast.success('New webhook secret generated');
  };

  return (
    <Layout>
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Github className="h-8 w-8" />
            GitHub Actions Integration
          </h1>
          <p className="mt-1 text-muted-foreground">
            Configure automatic deployments from your GitHub repository
          </p>
        </div>

        {/* App Selector */}
        <div className="mb-8">
          <Label>Select Application</Label>
          <Select value={selectedAppId} onValueChange={setSelectedAppId}>
            <SelectTrigger className="w-full mt-2">
              <SelectValue placeholder="Select app" />
            </SelectTrigger>
            <SelectContent>
              {mockApps.map(app => (
                <SelectItem key={app.id} value={app.id}>
                  <div className="flex items-center gap-2">
                    <span>{app.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      ({app.branch})
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedApp && (
          <div className="space-y-8">
            {/* Webhook Secret */}
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-foreground">Webhook Secret</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Add this secret to your GitHub repository settings under <strong>Settings → Secrets → Actions</strong> with the name <code className="px-1 py-0.5 bg-secondary rounded text-primary">DEPLOY_WEBHOOK_SECRET</code>
              </p>
              <div className="flex gap-2">
                <Input
                  value={webhookSecret}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button 
                  variant="outline" 
                  onClick={() => copyToClipboard(webhookSecret, 'secret')}
                >
                  {copiedSecret ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
                <Button variant="outline" onClick={regenerateSecret}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Webhook Endpoint */}
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Webhook className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-foreground">Webhook Endpoint</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                The deploy webhook endpoint that GitHub Actions will call:
              </p>
              <div className="flex gap-2">
                <Input
                  value={`https://62.72.9.22:10001/api/deploy/webhook`}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button 
                  variant="outline" 
                  onClick={() => copyToClipboard(`https://62.72.9.22:10001/api/deploy/webhook`, 'yaml')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Workflow File */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <FileCode className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">GitHub Actions Workflow</h3>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => copyToClipboard(generateYaml(), 'yaml')}
                >
                  {copiedYaml ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copiedYaml ? 'Copied!' : 'Copy'}
                </Button>
              </div>
              <p className="px-4 py-3 text-sm text-muted-foreground border-b border-border bg-secondary/30">
                Create this file at <code className="px-1 py-0.5 bg-secondary rounded text-primary">.github/workflows/deploy.yml</code> in your repository
              </p>
              <pre className="p-4 overflow-auto font-mono text-sm text-foreground/90 bg-background terminal-scroll">
                {generateYaml()}
              </pre>
            </div>

            {/* Setup Steps */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="font-semibold text-foreground mb-4">Setup Instructions</h3>
              <ol className="space-y-4">
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    1
                  </span>
                  <div>
                    <p className="font-medium text-foreground">Add Webhook Secret</p>
                    <p className="text-sm text-muted-foreground">
                      Go to your GitHub repo → Settings → Secrets → Actions → New repository secret
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    2
                  </span>
                  <div>
                    <p className="font-medium text-foreground">Create Workflow File</p>
                    <p className="text-sm text-muted-foreground">
                      Copy the YAML above and save it as <code>.github/workflows/deploy.yml</code>
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    3
                  </span>
                  <div>
                    <p className="font-medium text-foreground">Push to Trigger</p>
                    <p className="text-sm text-muted-foreground">
                      Push to the <code className="px-1 py-0.5 bg-secondary rounded">{selectedApp.branch}</code> branch to trigger automatic deployment
                    </p>
                  </div>
                </li>
              </ol>
            </div>

            {/* External Link */}
            <div className="flex justify-center">
              <Button variant="outline" asChild>
                <a 
                  href={selectedApp.repository.replace('git@github.com:', 'https://github.com/').replace('.git', '/settings/secrets/actions')}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open Repository Settings
                </a>
              </Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
