import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { API_URL } from './api'
import { useAuth } from './auth'

// Una puja tal como llega por el canal en vivo: identidad SIEMPRE enmascarada
// (el backend nunca emite email ni nombre, RGPD).
export interface LiveBid {
  amountCents: number
  userMasked: string
  createdAt?: string
}

// Estado inicial que el servidor manda al unirse a la subasta (evento
// `auction:state`). Los precios son céntimos, como en todo el proyecto.
export interface AuctionState {
  id: string
  status: string
  startingPriceCents: number
  minIncrementCents: number
  endsAt: string
  highestBidCents: number | null
  bids: LiveBid[]
}

// Motivo de rechazo de una puja (evento `bid:rejected`), con código estable.
export interface BidRejection {
  code: string
  message: string
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
    })

    socket.on('bid:accepted', (bid: LiveBid & { endsAt: string }) => {
      setBids((prev) => [{ ...bid }, ...prev].slice(0, 20))
      setHighestBidCents(bid.amountCents)
      setEndsAt(bid.endsAt) // se actualizará con el antisniping (tarea 05).
    })

    socket.on('bid:rejected', (rejection: BidRejection) => {
      setLastRejection(rejection)
    })

    // Antisniping (tarea 05): el servidor movió el cierre; actualizamos la cuenta
    // atrás. La verdad del `endsAt` está en el servidor, no en el reloj local.
    socket.on('auction:extended', ({ endsAt: newEndsAt }: { endsAt: string }) => {
      setEndsAt(newEndsAt)
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [auctionId, token])

  const placeBid = useCallback((amountCents: number) => {
    setLastRejection(null)
    socketRef.current?.emit('bid', { auctionId, amountCents })
  }, [auctionId])

  return { state, bids, highestBidCents, endsAt, connected, lastRejection, placeBid }
}
