import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { SeoService } from './seo.service';

// Endpoints públicos de SEO. En producción, el reverse proxy (tarea 09) debe
// exponer /sitemap.xml y /robots.txt en la raíz del dominio (proxy_pass a la API),
// que es donde los buscadores los esperan.
@Controller()
@Public()
export class SeoController {
  constructor(private readonly seo: SeoService) {}

  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  sitemap(): Promise<string> {
    return this.seo.buildSitemap();
  }

  @Get('robots.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  robots(): string {
    return this.seo.buildRobots();
  }
}
