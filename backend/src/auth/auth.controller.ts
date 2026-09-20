import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { getRegistrationSecret } from '../config/env';
import { safeCompareSecret } from './auth-tokens';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password: string;
}

class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  @MaxLength(256)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsString()
  @MaxLength(512)
  secret: string;
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // 10 tentativas por minuto e por IP. `/auth/me` fica de fora do throttle de propósito:
  // o frontend chama esse endpoint em todo carregamento de página.
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const registrationSecret = getRegistrationSecret();

    // Sem fallback: o valor literal que ficava aqui está publicado no repositório, ou
    // seja, qualquer pessoa podia criar uma conta numa instalação sem .env — e toda
    // conta neste produto é administradora total do servidor.
    if (!registrationSecret) {
      throw new ForbiddenException(
        'Registro desabilitado: REGISTRATION_SECRET não está configurado no servidor',
      );
    }

    // Comparação em tempo constante: `!==` vaza o prefixo correto do segredo.
    if (!safeCompareSecret(dto.secret, registrationSecret)) {
      throw new UnauthorizedException('Secret inválido');
    }

    return this.authService.register(dto.email, dto.password, dto.name);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Request() req) {
    return this.authService.getUser(req.user.userId);
  }
}
