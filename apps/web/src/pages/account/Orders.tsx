import { EmptyState } from '../../components/ui/EmptyState'

export function Orders() {
  return (
    <EmptyState
      title="Aún no tienes pedidos"
      description="Cuando completes una compra, aparecerá aquí con su estado de recogida."
    />
  )
}
