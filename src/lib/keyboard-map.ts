/**
 * Mapa de teclado — **fonte única**.
 *
 * A tabela da tela de atalhos (`?`), os `Kbd` dos botões e o handler global leem
 * daqui, para que nunca divirjam. Nenhuma tecla tem dois significados: `S` é Start e
 * Restart é `⇧R`, porque um atalho ambíguo numa ação que derruba processo é o tipo de
 * coisa que só se descobre depois.
 */
export type KeyScope = 'global' | 'lists' | 'app' | 'sequence';

export interface KeyBinding {
  keys: string;
  action: string;
  scope: KeyScope;
}

export const KEYBOARD_MAP: KeyBinding[] = [
  { keys: '⌘K', action: 'Paleta de comandos', scope: 'global' },
  { keys: 'N', action: 'Novo deploy', scope: 'global' },
  { keys: '?', action: 'Lista de atalhos', scope: 'global' },
  { keys: 'Esc', action: 'Fechar overlay, limpar seleção', scope: 'global' },

  { keys: '/', action: 'Filtrar a lista', scope: 'lists' },
  { keys: 'J / K', action: 'Navegar', scope: 'lists' },
  { keys: '↵', action: 'Abrir o item', scope: 'lists' },
  { keys: '.', action: 'Menu de ações da linha', scope: 'lists' },

  { keys: 'R', action: 'Redeploy', scope: 'app' },
  { keys: '⇧R', action: 'Restart', scope: 'app' },
  { keys: 'S', action: 'Start', scope: 'app' },
  { keys: 'L', action: 'Logs', scope: 'app' },
  { keys: 'D', action: 'Deployments', scope: 'app' },
  { keys: 'E', action: 'Ambiente', scope: 'app' },
  { keys: 'M', action: 'Métricas', scope: 'app' },
  { keys: 'C', action: 'Configurações do app', scope: 'app' },
  { keys: 'O', action: 'Abrir domínio', scope: 'app' },

  { keys: 'G então V', action: 'Ir para Visão geral', scope: 'sequence' },
  { keys: 'G então D', action: 'Ir para Deployments', scope: 'sequence' },
  { keys: 'G então L', action: 'Ir para Logs', scope: 'sequence' },
  { keys: 'G então T', action: 'Ir para Terminal', scope: 'sequence' },
];

export const SCOPE_LABEL: Record<KeyScope, string> = {
  global: 'Global',
  lists: 'Listas',
  app: 'Com um app em foco',
  sequence: 'Sequências',
};
