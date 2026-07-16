import { NotificationHistoryPanel } from '@/components/NotificationHistoryPanel';
import { NotificationSettings } from '@/components/NotificationSettings';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  Boxes,
  Github,
  History,
  LayoutDashboard,
  LogOut,
  Rocket,
  ScrollText,
  Settings,
  Terminal
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Deploy', href: '/deploy', icon: Rocket },
  { name: 'Monorepo', href: '/projects/new', icon: Boxes },
  { name: 'Logs', href: '/logs', icon: ScrollText },
  { name: 'Versions', href: '/versions', icon: History },
  { name: 'Terminal', href: '/terminal', icon: Terminal },
  { name: 'GitHub Actions', href: '/github', icon: Github },
  { name: 'Settings', href: '/settings', icon: Settings },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const location = useLocation();
  const { user, logout } = useAuth();

  const handleNavClick = () => {
    if (onClose) onClose();
  };

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-50 h-screen w-64 border-r border-border bg-sidebar transition-transform duration-300 md:translate-x-0 md:z-40',
        isOpen ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      <div className="flex h-full flex-col">
        {/* Logo - Hidden on mobile (shown in header instead) */}
        <div className="hidden md:flex h-16 items-center gap-3 border-b border-border px-6">
          <img src="/logo.png" alt="DeployHub" className="h-9 w-9 rounded-lg" />
          <div>
            <h1 className="text-lg font-semibold text-foreground">DeployHub</h1>
            <p className="text-xs text-muted-foreground">DevOps Panel</p>
          </div>
        </div>

        {/* Mobile spacer */}
        <div className="h-14 md:hidden" />

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={handleNavClick}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-all duration-200 active:scale-95',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                <item.icon className={cn('h-5 w-5 flex-shrink-0', isActive && 'text-primary')} />
                {item.name}
                {isActive && (
                  <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary animate-pulse-glow" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Server Info */}
        <div className="border-t border-border p-4">
          <div className="rounded-lg bg-secondary/50 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
              <span>Server Online</span>
            </div>
          </div>
        </div>

        {/* User */}
        <div className="border-t border-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-cyan-400">
              <span className="text-sm font-semibold text-primary-foreground">
                {user?.name?.charAt(0)?.toUpperCase() || 'A'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{user?.name || 'Admin'}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email || 'admin@deploy.hub'}</p>
            </div>
            <NotificationHistoryPanel compact />
            <NotificationSettings compact className="hidden md:flex" />
            <Button variant="ghost" size="icon-sm" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
