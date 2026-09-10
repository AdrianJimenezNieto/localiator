import { construirFichas } from './import-catalog';

// Fila mínima del CSV; cada test sobreescribe lo que le interesa.
function fila(over: Partial<Parameters<typeof construirFichas>[0][0]> = {}) {
  return {
    nombre: 'Artículo de prueba',
    descripcion: 'Descripción.',
    precioEur: 100,
    pvpEur: null,
    unidades: 1,
    carpeta: 'productos/lote-0001_articulo-de-prueba',
    ...over,
  };
}

describe('construirFichas', () => {
  it('publica un artículo de una sola unidad como producto con stock 1', () => {
    const fichas = construirFichas([fila()]);

    expect(fichas).toHaveLength(1);
    expect(fichas[0]).toMatchObject({
      id: 'jp-lote-0001-articulo-de-prueba',
      tipo: 'product',
      priceCents: 10000,
      stock: 1,
    });
  });

  it('deriva el id de la carpeta, que es lo único único del CSV', () => {
    // Mismo nombre y precio, carpetas distintas: son dos lotes físicos distintos
    // y no se pueden pisar entre ellos.
    const fichas = construirFichas([
      fila({ carpeta: 'productos/lote-0001_x' }),
      fila({ carpeta: 'productos/lote-0002_x' }),
    ]);

    expect(fichas.map((f) => f.id)).toEqual([
      'jp-lote-0001-x',
      'jp-lote-0002-x',
    ]);
  });

  it('publica un lote de varias unidades como lote entero Y como suelto', () => {
    const fichas = construirFichas([
      fila({ nombre: '3 X Cámara Inteligente', precioEur: 70, unidades: 3 }),
    ]);

    expect(fichas).toHaveLength(2);
    // El lote entero: nombre tal cual, stock 1, precio del CSV sin tocar.
    expect(fichas[0]).toMatchObject({
      tipo: 'lot',
      name: '3 X Cámara Inteligente',
      priceCents: 7000,
      stock: 1,
    });
    // El suelto: sin el "3 X" del nombre, stock = unidades, precio unitario con
    // el margen aplicado (70/3 * 1,4 = 32,67 €).
    expect(fichas[1]).toMatchObject({
      tipo: 'product',
      name: 'Cámara Inteligente',
      priceCents: 3267,
      stock: 3,
    });
  });

  it('agrupa en una sola ficha los sueltos del mismo artículo', () => {
    // Cuatro lotes de 3 cámaras = 4 fichas de lote + UNA de suelto con stock 12.
    const filas = [0, 1, 2, 3].map((n) =>
      fila({
        nombre: '3 X Cámara Inteligente',
        precioEur: 70,
        unidades: 3,
        carpeta: `productos/lote-000${n}_camara`,
      }),
    );

    const fichas = construirFichas(filas);
    const sueltos = fichas.filter((f) => f.id.startsWith('jp-u-'));

    expect(fichas.filter((f) => f.tipo === 'lot')).toHaveLength(4);
    expect(sueltos).toHaveLength(1);
    expect(sueltos[0].stock).toBe(12);
  });

  it('no desdobla si la unidad no llega al mínimo de 10 €', () => {
    // 30 pastas de dientes a 80 € son 2,67 €/ud: nadie va al almacén a por una.
    const fichas = construirFichas([
      fila({ nombre: '30X Pasta de Dientes', precioEur: 80, unidades: 30 }),
    ]);

    expect(fichas).toHaveLength(1);
    expect(fichas[0].tipo).toBe('lot');
  });

  it('no desdobla los lotes heterogéneos', () => {
    // "que Incluye" delata un revoltijo: sus unidades no son intercambiables.
    const fichas = construirFichas([
      fila({
        nombre: '2X Artículos Electrónicos que Incluye Cafetera',
        precioEur: 100,
        unidades: 2,
      }),
    ]);

    expect(fichas).toHaveLength(1);
    expect(fichas[0].tipo).toBe('lot');
  });

  it('añade las unidades y el PVP a la descripción, sin tocar el precio', () => {
    const [lote] = construirFichas([
      fila({
        nombre: '18 X Pack Ropa',
        precioEur: 300,
        pvpEur: 539.82,
        unidades: 18,
      }),
    ]);

    expect(lote.description).toContain('Lote de 18 unidades.');
    expect(lote.description).toContain(
      'PVP recomendado del fabricante del lote completo: 539,82 €.',
    );
    // El precio de venta es el del CSV: el PVP es informativo y NO se aplica.
    expect(lote.priceCents).toBe(30000);
  });

  it('nunca aplica descuento: el PVP no se usa como precio tachado', () => {
    const fichas = construirFichas([fila({ pvpEur: 500, precioEur: 100 })]);

    // La ficha no lleva discountCents: el importador lo fija a 0 al escribir.
    expect(fichas[0].priceCents).toBe(10000);
  });
});
