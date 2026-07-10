// Cuánto vive una reserva de stock antes de expirar. Es la ventana que tiene el
// cliente para completar el pago; pasado este tiempo, el barrido de la tarea 07
// libera la reserva y cancela el pedido. Constante (no env) por simplicidad; si
// hiciera falta afinarlo por entorno se moverá a configuración.
export const RESERVATION_TTL_MINUTES = 15;
