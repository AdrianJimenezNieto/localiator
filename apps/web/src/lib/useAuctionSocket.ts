import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { API_URL } from './api'
import { useAuth } from './auth'

// Una puja tal como llega por el canal en vivo: identidad SIEMPRE enmascarada
// (el backend nunca emite email ni nombre, RGPD).
export interface LiveBid {
  amountCents: number
  userMasked: string
  // true si la puso automáticamente el proxy en nombre del pujador (no fue una
  // acción humana). Sirve para explicar en la ficha por qué el precio sube solo.
  isAutomatic?: boolean
  createdAt?: string
}

// Estado inicial que el servidor manda al unirse a la subasta (evento
// `auction:state`). Los precios son céntimos, como en todo el proyecto.
export interface AuctionState {
  id: string
  status: string
  startingPriceCents: number
  minIncrementCents: number
  startsAt: string
  endsAt: string
  // Precio EFECTIVO actual: lo que pagaría ahora mismo quien va ganando. No es el
  // máximo de nadie (los máximos son privados y no salen del servidor).
  highestBidCents: number | null
  // Si el usuario que mira va ganando ahora mismo. El servidor no dice QUIÉN
  // lidera, solo si eres tú: así se puede pintar "vas ganando" sin filtrar nada.
  isLeading: boolean
  // MI propio máximo autorizado (null si aún no he pujado o soy invitado). El
  // servidor solo devuelve el del que pregunta, nunca el de otro.
  myMaxCents: number | null
  bids: LiveBid[]
  // Resultado del cierre si la subasta YA estaba cerrada al entrar (null si sigue
  // viva). Misma forma que el evento `auction:closed`.
  closed: AuctionClosed | null
}

// Motivo de rechazo de una puja (evento `bid:rejected`), con código estable.
export interface BidRejection {
  code: string
  message: string
}

// Resultado del cierre de la subasta (evento `auction:closed`). winnerMasked null
// = subasta desierta (nadie pujó).
export interface AuctionClosed {
  winnerMasked: string | null
  amountCents: number | null
}

// Aviso PERSONAL dirigido a este usuario (tarea 08): superado o ganado. Llega por
// su room de usuario (`user:<id>`), no por la room de la subasta, así que solo lo
// recibe él. `kind` distingue el mensaje a pintar.
export interface AuctionNotice {
  kind: 'outbid' | 'won'
  amountCents: number
  secondChance?: boolean
}

// Suscribe la ficha de una subasta al canal en vivo. Se une a la room, mantiene el
// precio máximo, la lista de pujas y el `endsAt` reaccionando a los eventos, y
// expone `placeBid`. La reconexión automática la trae Socket.IO de fábrica; al
// reconectar se re-emite `join`, así que el estado se resincroniza solo.
export function useAuctionSocket(auctionId: string) {
  const { token } = useAuth()
  const socketRef = useRef<Socket | null>(null)

  const [state, setState] = useState<AuctionState | null>(null)
  const [bids, setBids] = useState<LiveBid[]>([])
  const [highestBidCents, setHighestBidCents] = useState<number | null>(null)
  const [endsAt, setEndsAt] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [lastRejection, setLastRejection] = useState<BidRejection | null>(null)
  const [closed, setClosed] = useState<AuctionClosed | null>(null)
  const [endingSoon, setEndingSoon] = useState(false)
  const [notice, setNotice] = useState<AuctionNotice | null>(null)
  // Máximo propio y si voy ganando: los dos se siembran del estado inicial y se
  // mantienen a mano según van llegando eventos, porque el servidor no reenvía el
  // estado completo en cada puja (solo el precio nuevo).
  const [myMaxCents, setMyMaxCents] = useState<number | null>(null)
  const [isLeading, setIsLeading] = useState(false)

  useEffect(() => {
    // El token viaja en el handshake (auth). Si el usuario es invitado (sin
    // token) el socket se conecta igual: puede mirar, pero no pujar.
    const socket = io(`${API_URL}/auctions`, {
      auth: token ? { token } : {},
      withCredentials: true,
    })
    socketRef.current = socket

    const join = () => socket.emit('join', { auctionId })

    socket.on('connect', () => {
      setConnected(true)
      join() // también cubre la reconexión: se vuelve a unir y resincroniza.
    })
    socket.on('disconnect', () => setConnected(false))

    socket.on('auction:state', (s: AuctionState) => {
      setState(s)
      setBids(s.bids)
      setHighestBidCents(s.highestBidCents)
      setEndsAt(s.endsAt)
      setMyMaxCents(s.myMaxCents)
      setIsLeading(s.isLeading)
      // Si la subasta ya estaba cerrada al entrar no llegará `auction:closed`
      // (ese evento se emitió en su momento a quien estuviera mirando), así que
      // el cierre se siembra desde el estado inicial.
      setClosed(s.closed)
    })

    socket.on('bid:accepted', (bid: LiveBid & { endsAt: string }) => {
      setBids((prev) => [{ ...bid }, ...prev].slice(0, 20))
      setHighestBidCents(bid.amountCents)
      setEndsAt(bid.endsAt) // se actualizará con el antisniping (tarea 05).
    })

    // Confirmación privada de que MI puja entró. El servidor devuelve el máximo
    // que ha quedado registrado para mí: puede no ser el que envié si ya tenía uno
    // mayor. Se guarda aquí porque el máximo no viaja en el evento público.
    socket.on(
      'bid:accepted:self',
      (payload?: { myMaxCents?: number; isLeading?: boolean }) => {
        if (payload?.myMaxCents != null) setMyMaxCents(payload.myMaxCents)
        if (payload?.isLeading != null) setIsLeading(payload.isLeading)
      },
    )

    socket.on('bid:rejected', (rejection: BidRejection) => {
      setLastRejection(rejection)
    })

    // Apertura (tarea 10): una subasta programada acaba de pasar a LIVE. Movemos
    // el `status` del estado local para que la ficha habilite el formulario sin
    // recargar. El `endsAt` definitivo lo fija el servidor al abrir.
    socket.on('auction:opened', ({ endsAt: newEndsAt }: { endsAt: string }) => {
      setState((prev) => (prev ? { ...prev, status: 'LIVE' } : prev))
      setEndsAt(newEndsAt)
    })

    // Antisniping (tarea 05): el servidor movió el cierre; actualizamos la cuenta
    // atrás. La verdad del `endsAt` está en el servidor, no en el reloj local.
    socket.on('auction:extended', ({ endsAt: newEndsAt }: { endsAt: string }) => {
      setEndsAt(newEndsAt)
    })

    // Cierre automático (tarea 06): la subasta terminó. Guardamos el resultado
    // (ganador enmascarado o desierta) para pintarlo.
    socket.on('auction:closed', (payload: AuctionClosed) => {
      setClosed(payload)
    })

    // A punto de cerrar (tarea 08): aviso a toda la room (no personal), para que
    // quien mira sepa que queda poco. La cuenta atrás sigue mandando el reloj.
    socket.on('auction:ending-soon', () => {
      setEndingSoon(true)
    })

    // Avisos PERSONALES (tarea 08): llegan por la room de usuario. Solo se reciben
    // si el usuario tiene sesión (el token entra en el handshake).
    // Con puja proxy esto ya NO llega en cada puja que te pasa por encima: solo
    // cuando han superado tu MÁXIMO y de verdad te has quedado fuera. Mientras tu
    // techo aguante, el sistema sube por ti en silencio.
    socket.on(
      'notification:outbid',
      ({ amountCents }: { amountCents: number }) => {
        setNotice({ kind: 'outbid', amountCents })
        setIsLeading(false)
      },
    )
    socket.on(
      'notification:won',
      ({
        amountCents,
        secondChance,
      }: {
        amountCents: number
        secondChance: boolean
      }) => {
        setNotice({ kind: 'won', amountCents, secondChance })
      },
    )

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [auctionId, token])

  // `maxAmountCents` es el TECHO que autoriza el usuario, no lo que se pujará: el
  // servidor puja por él lo mínimo necesario (ver auctions.proxy.ts en la API).
  const placeBid = useCallback((maxAmountCents: number) => {
    setLastRejection(null)
    socketRef.current?.emit('bid', { auctionId, maxAmountCents })
  }, [auctionId])

  return {
    state,
    bids,
    highestBidCents,
    endsAt,
    connected,
    lastRejection,
    closed,
    endingSoon,
    notice,
    myMaxCents,
    isLeading,
    placeBid,
  }
}
