// Datos legales del titular de la web, centralizados en un único sitio para que el
// aviso legal, las condiciones de venta, la privacidad y las facturas usen SIEMPRE
// la misma fuente. Los valores marcados `[PENDIENTE]` los debe rellenar Adrián con
// los datos reales (razón social, NIF/CIF, domicilio…): nunca se inventan datos
// legales. Ver tasks/manual.md.
export const COMPANY = {
  // Nombre comercial de la web.
  brand: 'Localiator',
  // Titular real del negocio (persona física o razón social).
  legalName: '[PENDIENTE: razón social / nombre y apellidos del titular]',
  taxId: '[PENDIENTE: NIF/CIF]',
  address: '[PENDIENTE: domicilio fiscal completo]',
  email: '[PENDIENTE: email de contacto]',
  // Datos registrales solo si el titular es una sociedad (no aplica a autónomo).
  registryInfo: '[PENDIENTE si aplica: datos registrales de la sociedad]',
} as const

// Fecha de última actualización de los textos legales. Se muestra al pie de cada
// documento para dar constancia de la versión vigente.
export const LEGAL_LAST_UPDATED = '13 de julio de 2026'
