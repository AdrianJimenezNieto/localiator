import { Link } from 'react-router-dom'
import { COMPANY } from '../lib/legal'
import { LegalLayout, LegalSection } from '../components/LegalLayout'

// Condiciones de venta: el contrato entre la tienda y el comprador. Cubre proceso
// de compra, precios/IVA, pago con Stripe, recogida en almacén (sin envíos) y
// política de reembolsos mínima. Las garantías legales y el desistimiento se
// amplían en la tarea 04.
export function TermsPage() {
  return (
    <LegalLayout title="Condiciones de venta">
      <p>
        Las presentes condiciones regulan la compraventa de productos a través de
        la web de {COMPANY.brand}, titularidad de {COMPANY.legalName}. Al realizar
        un pedido, el usuario declara ser mayor de edad y aceptar estas
        condiciones. Puede consultar los datos del vendedor en el{' '}
        <Link to="/aviso-legal" className="underline hover:text-neutral-900">
          aviso legal
        </Link>
        .
      </p>

      <LegalSection title="Proceso de compra">
        <p>
          El usuario selecciona los artículos disponibles, los añade al carrito y
          confirma el pedido en el proceso de pago. Cada artículo es una unidad
          concreta y limitada procedente de subasta, por lo que su disponibilidad
          es la que figura en el catálogo en el momento de la compra. Durante el
          pago se reserva temporalmente el artículo; si el pago no se completa, la
          reserva se libera y el artículo vuelve a estar disponible.
        </p>
      </LegalSection>

      <LegalSection title="Precios e IVA">
        <p>
          Todos los precios se muestran en <strong>euros (€)</strong> e{' '}
          <strong>incluyen el IVA</strong> aplicable. El desglose del impuesto se
          refleja en la factura que se emite automáticamente tras el pago. Los
          precios vigentes son los publicados en la web en el momento de formalizar
          el pedido.
        </p>
      </LegalSection>

      <LegalSection title="Formas de pago">
        <p>
          El pago se realiza en línea a través de la pasarela segura{' '}
          <strong>Stripe</strong>, único método de pago admitido. {COMPANY.brand}{' '}
          no almacena ni tiene acceso a los datos de la tarjeta: son tratados
          directamente por Stripe conforme al estándar PCI DSS. El pedido se
          confirma una vez Stripe comunica que el cobro se ha realizado con éxito.
        </p>
      </LegalSection>

      <LegalSection title="Entrega: recogida en almacén">
        <p>
          Por el momento <strong>no se realizan envíos</strong>. Los artículos se
          recogen en el almacén de origen una vez el pedido esté pagado y marcado
          como «listo para recoger». Se informará al comprador por correo
          electrónico del momento y las instrucciones de recogida.
        </p>
      </LegalSection>

      <LegalSection title="Garantía legal y estado de los artículos">
        <p>
          Los artículos que se venden en {COMPANY.brand} proceden de subasta y son,
          en su mayoría, bienes de segunda mano que pueden presentar signos de uso o
          desperfectos. El <strong>estado real de cada artículo</strong> se describe
          y fotografía en su ficha; esa descripción forma parte de lo acordado en la
          compra, por lo que los defectos ya informados no dan lugar a reclamación
          por falta de conformidad.
        </p>
        <p>
          Como consumidor, dispone de la garantía legal por falta de conformidad que
          la normativa española de defensa del consumidor reconoce a los bienes de
          segunda mano{' '}
          <em>[PENDIENTE revisión legal: plazo concreto de garantía aplicable]</em>.
          Para ejercerla, comuníquenos cualquier falta de conformidad no descrita en
          la ficha a través de {COMPANY.email}, indicando su pedido.
        </p>
      </LegalSection>

      <LegalSection title="Derecho de desistimiento">
        <p>
          El derecho de desistimiento presenta límites y excepciones para
          determinados bienes, en particular los adquiridos en subastas públicas y
          los artículos únicos o claramente identificados por su estado{' '}
          <em>[PENDIENTE revisión legal: alcance exacto del desistimiento en este
          caso]</em>. Cuando proceda, el plazo y la forma de ejercerlo se
          comunicarán conforme a la normativa vigente.
        </p>
      </LegalSection>

      <LegalSection title="Cancelaciones y reembolsos">
        <p>
          Al tratarse de artículos únicos procedentes de subasta, a menudo usados o
          con desperfectos descritos en cada ficha, la política de reembolsos es
          mínima y se limita a lo exigido por la normativa vigente. Cualquier
          incidencia con un pedido debe comunicarse a {COMPANY.email}. Los defectos
          y el estado real de cada artículo se describen y fotografían en su ficha,
          y forman parte de lo acordado en la compra.
        </p>
      </LegalSection>
    </LegalLayout>
  )
}
