import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { requireJwtSecret } from '../config/env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    // `registerAsync` em vez de `register`: a factory roda na inicialização do módulo,
    // não no import do arquivo. Isso faz a falta de JWT_SECRET virar um erro capturável
    // no bootstrap (mensagem limpa) em vez de um throw em tempo de import.
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: requireJwtSecret(),
        signOptions: { expiresIn: '7d' },
      }),
    }),
    // Rate limit só do AuthController (aplicado por rota, veja auth.controller.ts).
    // Não é global de propósito: o Dashboard faz polling de 4 endpoints a cada 5s e um
    // limite global derrubaria o painel com vários apps ou várias abas abertas.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  // JwtModule é exportado para o AuthenticatedIoAdapter conseguir resolver o JwtService
  // e validar o token no handshake dos WebSockets com o mesmo segredo do REST.
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
