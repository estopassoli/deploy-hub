import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.enableCors({
    origin: ['http://localhost:10000', 'http://62.72.9.22:10000', 'https://deployhub.example.com'],
    credentials: true,
  });
  
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));
  
  app.setGlobalPrefix('api');
  
  const port = process.env.PORT || 10001;
  await app.listen(port);
  console.log(`🚀 DeployHub Backend running on port ${port}`);
}

bootstrap();
