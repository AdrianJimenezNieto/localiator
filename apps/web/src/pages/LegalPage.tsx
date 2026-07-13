import { COMPANY } from '../lib/legal'
import { LegalLayout, LegalSection } from '../components/LegalLayout'

// Aviso legal: identidad del titular y datos de contacto exigidos por la LSSI-CE.
// Es texto estático (no cambia casi nunca y se revisa con abogado), por eso no
// pasa por backend. Los datos reales viven en lib/legal.ts con marcadores
// [PENDIENTE] hasta que Adrián los complete.
export function LegalPage() {
  return (
    <LegalLayout title="Aviso legal">
      <p>
        En cumplimiento del artículo 10 de la Ley 34/2002, de Servicios de la
        Sociedad de la Información y de Comercio Electrónico (LSSI-CE), se ponen a
        disposición de los usuarios los siguientes datos identificativos del
        titular de este sitio web.
      </p>

      <LegalSection title="Titular del sitio web">
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Titular:</strong> {COMPANY.legalName}
          </li>
          <li>
            <strong>NIF/CIF:</strong> {COMPANY.taxId}
          </li>
          <li>
            <strong>Domicilio:</strong> {COMPANY.address}
          </li>
          <li>
            <strong>Correo electrónico:</strong> {COMPANY.email}
          </li>
          <li>
            <strong>Datos registrales:</strong> {COMPANY.registryInfo}
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Objeto">
        <p>
          {COMPANY.brand} es una tienda en línea de venta de lotes y productos
          individuales adquiridos en plataformas de subastas y almacenados en un
          almacén propio. La recogida de los productos se realiza en el almacén de
          origen; por el momento no se realizan envíos.
        </p>
      </LegalSection>

      <LegalSection title="Condiciones de uso">
        <p>
          El acceso a este sitio web es responsabilidad exclusiva de los usuarios.
          El uso del sitio implica la aceptación de las presentes condiciones. El
          usuario se compromete a hacer un uso adecuado de los contenidos y a no
          emplearlos para actividades ilícitas o contrarias a la buena fe.
        </p>
      </LegalSection>

      <LegalSection title="Propiedad intelectual e industrial">
        <p>
          Todos los contenidos del sitio (textos, fotografías, logotipos y demás
          elementos) son titularidad de {COMPANY.legalName} o de terceros que han
          autorizado su uso, y están protegidos por la normativa de propiedad
          intelectual e industrial. Queda prohibida su reproducción sin
          autorización.
        </p>
      </LegalSection>

      <LegalSection title="Legislación y jurisdicción aplicable">
        <p>
          Las presentes condiciones se rigen por la legislación española. Para la
          resolución de cualquier controversia, las partes se someten a los
          juzgados y tribunales que legalmente correspondan.
        </p>
      </LegalSection>
    </LegalLayout>
  )
}
