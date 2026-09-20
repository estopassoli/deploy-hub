import { ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NotificationSettings } from '@/components/NotificationSettings';
import { useNotifications } from '@/hooks/useNotifications';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Initialize notifications listener
  useNotifications();

  return (
    // `overflow-x-hidden` no container raiz: tabelas, blocos <pre> de YAML e linhas
    // longas de log estouravam a largura e faziam a PÁGINA INTEIRA rolar na
    // horizontal, junto com a sidebar. Cada área que precisa rolar tem o próprio
    // overflow interno.
    <div className="min-h-screen overflow-x-hidden bg-background">
      {/* Mobile Header */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between border-b border-border bg-sidebar px-4 pt-[env(safe-area-inset-top)] h-[calc(3.5rem+env(safe-area-inset-top))] md:hidden">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="DeployHub" className="h-8 w-8 rounded-lg" />
          <span className="font-semibold text-foreground">DeployHub</span>
        </div>
        <div className="flex items-center gap-1">
          <NotificationSettings compact />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content */}
      <main className="min-w-0 pt-[calc(3.5rem+env(safe-area-inset-top))] md:pt-0 md:pl-64 pb-[env(safe-area-inset-bottom)]">
        <div className="min-w-0 p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
