/**
 * Rótulos em português das ações de auditoria.
 *
 * Espelha `backend/src/audit/audit-describe.ts`. Uma ação não mapeada aparece com o
 * identificador cru — melhor que sumir da tela.
 */
export const ACTION_LABELS: Record<string, string> = {
  'deploy.create': 'Novo deploy',
  'deploy.redeploy': 'Redeploy',
  'deploy.cancel': 'Deploy cancelado',
  'app.create': 'App criado',
  'app.update': 'App configurado',
  'app.delete': 'App excluído',
  'app.start': 'App iniciado',
  'app.stop': 'App parado',
  'app.restart': 'App reiniciado',
  'app.rollback': 'Rollback',
  'app.regenerateSecret': 'Webhook secret regenerado',
  'env.apply': 'Variáveis aplicadas',
  'project.create': 'Projeto criado',
  'project.update': 'Projeto configurado',
  'project.delete': 'Projeto excluído',
  'project.redeploy': 'Redeploy do projeto',
  'project.rollback': 'Rollback do projeto',
  'project.ssl': 'SSL gerado',
  'service.add': 'Service adicionado',
  'service.remove': 'Service removido',
  'service.deploy': 'Deploy de service',
  'settings.email': 'Configuração de email',
  'settings.general': 'Configuração de retenção',
  'settings.notifications': 'Configuração de notificações',
  'system.clearLogs': 'Logs apagados',
  'auth.login': 'Login',
  'auth.register': 'Conta criada',
  'terminal.open': 'Terminal aberto',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/** Ações destrutivas ganham destaque visual na lista. */
const DESTRUTIVAS = new Set([
  'app.delete',
  'project.delete',
  'service.remove',
  'system.clearLogs',
  'terminal.open',
]);

export function isDestructiveAction(action: string): boolean {
  return DESTRUTIVAS.has(action);
}
