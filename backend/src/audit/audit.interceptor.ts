import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';
import { describeRequest, isAuditableMethod, redactBody } from './audit-describe';

/**
 * Registra automaticamente toda requisição que altera estado.
 *
 * ## Por que interceptor e não chamadas espalhadas pelos services
 *
 * Auditoria que depende de alguém lembrar de chamar `audit.record()` fica incompleta na
 * primeira feature nova — e uma trilha com buracos é pior que não ter trilha, porque dá
 * uma falsa sensação de cobertura. O interceptor cobre tudo o que passa pelo HTTP,
 * inclusive endpoints que ainda não existem.
 *
 * GET fica de fora: o Dashboard faz polling de quatro endpoints a cada cinco segundos,
 * e auditar leitura afogaria a tabela em ruído.
 *
 * O corpo passa por `redactBody` antes de ser guardado — ver `audit-describe.ts` para a
 * regra de redação.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest();
    const method: string = request.method;

    if (!isAuditableMethod(method)) return next.handle();

    // `request.route.path` é o padrão do Nest (`/api/apps/:id`), não a URL concreta:
    // é o que permite agrupar por ação em vez de ter uma linha por id.
    const routePath: string = request.route?.path ?? request.url?.split('?')[0] ?? '';
    const { action, targetType, targetIdFrom } = describeRequest(method, routePath);

    const usuario = request.user;
    const metadata = redactBody(request.body);
    const targetId = targetIdFrom ? (request.params?.[targetIdFrom] ?? null) : null;
    const targetName = typeof request.body?.name === 'string' ? request.body.name : null;

    // O `trust proxy` de main.ts faz `request.ip` trazer o IP real do X-Forwarded-For
    // em vez do IP do nginx.
    const ip: string | null = request.ip ?? null;

    const registrar = (success: boolean) =>
      this.audit.record({
        userId: usuario?.userId ?? null,
        userEmail: usuario?.email ?? null,
        action,
        targetType,
        targetId,
        targetName,
        metadata,
        ip,
        success,
      });

    return next.handle().pipe(
      tap({
        // Uma resposta HTTP emite um valor só, então `next` grava exatamente uma vez.
        next: () => void registrar(true),
        // Tentativa falha também é auditoria — um login recusado ou um delete negado
        // é justamente o que interessa numa investigação.
        error: () => void registrar(false),
      }),
    );
  }
}
