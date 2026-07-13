import { Module } from '@nestjs/common';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';

// PrismaModule y ConfigModule son globales, no hace falta importarlos.
@Module({
  controllers: [SeoController],
  providers: [SeoService],
})
export class SeoModule {}
