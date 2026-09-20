import * as React from 'react';
import { CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Aviso persistente em linha.
 *
 * Substitui o toast para toda condição que **continua verdadeira depois que o toast
 * some**: disco acima de 70%, SSH_HOST não configurada, alteração que só vale no
 * próximo deploy, build que falhou. O painel tinha 81 `toast.error` contra 2 erros
 * inline — o toast desaparecia e o problema ficava.
 *
 * No máximo uma superfície tingida por tela: se já existe um callout, a segunda
 * condição vira linha de texto com ícone. Para erro de campo, use o hint de 12px do
 * próprio campo, não um callout.
 */
const TONE = {
  amber: { box: 'border-amber/28 bg-amber/12', icon: 'text-amber', Icon: TriangleAlert, role: 'status' },
  red: { box: 'border-red/30 bg-red/12', icon: 'text-red', Icon: CircleAlert, role: 'alert' },
  blue: { box: 'border-blue/28 bg-blue/12', icon: 'text-blue', Icon: Info, role: 'status' },
} as const;

export function Callout({
  tone = 'amber',
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof TONE;
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <div role={t.role} className={cn('flex items-start gap-2.5 rounded-[8px] border px-3 py-2.5', t.box, className)}>
      <t.Icon className={cn('mt-0.5 h-4 w-4 shrink-0', t.icon)} aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13px] font-medium leading-5 text-text-1 max-md:text-[15px]">{title}</span>
        {children && <span className="text-xs leading-4 text-text-2 max-md:text-[13px]">{children}</span>}
      </span>
      {action && <span className="flex shrink-0 items-center">{action}</span>}
    </div>
  );
}
