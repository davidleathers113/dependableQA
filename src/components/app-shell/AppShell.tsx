import * as React from 'react';

interface SessionPayload {
  user: { id: string; email: string };
  organization: { id: string; name: string; role: string };
}

interface Props {
  title: string;
  session: SessionPayload;
  children: React.ReactNode;
}

const primaryNav = [
  { label: 'Overview', href: '/app/overview', icon: '📊' },
  { label: 'Calls', href: '/app/calls', icon: '📞' },
  { label: 'Imports', href: '/app/imports', icon: '📤' },
  { label: 'Integrations', href: '/app/integrations', icon: '🔗' },
  { label: 'Reports', href: '/app/reports', icon: '📈' },
];

const secondaryNav = [
  { label: 'Billing', href: '/app/billing', icon: '💳' },
  { label: 'Settings', href: '/app/settings/profile', icon: '⚙️' },
  { label: 'Ask AI', href: '/app/ai', icon: '✨' },
  { label: 'Updates', href: '/app/updates', icon: '🔔' },
];

export default function AppShell({ title, session, children }: Props) {
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-100 antialiased">
      {/* Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r border-slate-800 bg-slate-900/50">
        <div class="flex flex-col flex-1 min-h-0">
          <div class="flex items-center h-16 px-6 border-b border-slate-800">
            <span class="text-lg font-bold tracking-tight text-white">DependableQA</span>
          </div>
          <div class="flex-1 overflow-y-auto">
            <nav class="flex-1 px-4 py-6 space-y-8">
              <div class="space-y-1">
                {primaryNav.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`flex items-center px-3 py-2 text-sm font-medium rounded-xl transition-colors ${
                      currentPath.startsWith(item.href)
                        ? "bg-violet-600/20 text-violet-400"
                        : "text-slate-400 hover:text-white hover:bg-slate-800"
                    }`}
                  >
                    <span className="mr-3">{item.icon}</span>
                    <span>{item.label}</span>
                  </a>
                ))}
              </div>

              <div class="space-y-1">
                <h3 class="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Support
                </h3>
                {secondaryNav.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`flex items-center px-3 py-2 text-sm font-medium rounded-xl transition-colors ${
                      currentPath.startsWith(item.href)
                        ? "bg-violet-600/20 text-violet-400"
                        : "text-slate-400 hover:text-white hover:bg-slate-800"
                    }`}
                  >
                    <span className="mr-3">{item.icon}</span>
                    <span>{item.label}</span>
                  </a>
                ))}
              </div>
            </nav>
          </div>
          <div class="p-4 border-t border-slate-800">
            <div class="flex items-center px-3 py-2">
              <div class="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center font-bold text-xs">
                {session.user.email[0].toUpperCase()}
              </div>
              <div class="ml-3 min-w-0 flex-1">
                <p class="text-sm font-medium text-white truncate">{session.user.email}</p>
                <p class="text-xs text-slate-500 truncate">{session.organization.name}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header className="h-16 flex items-center justify-between px-8 border-b border-slate-800 bg-slate-900/50">
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          <div className="flex items-center space-x-4">
            <div className="h-8 w-px bg-slate-800 mx-2"></div>
            <div className="text-sm font-medium text-slate-400">
              {session.organization.name} ({session.organization.role})
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
