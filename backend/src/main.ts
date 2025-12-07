import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.enableCors({
    origin: ['http://localhost:10000', 'https://panel.auraai.chat', 'https://93d211da-d945-45b7-9042-69f0e628987a.lovableproject.com'],
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
