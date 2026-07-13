import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { apiSend, ApiError } from '../lib/api'

// Área de cuenta del comprador. Por ahora contiene la "zona peligrosa": el borrado
// de la propia cuenta (derecho al olvido RGPD, tarea 02). Al eliminar, el backend
// anonimiza la cuenta y revoca las sesiones; aquí cerramos sesión localmente y
// volvemos al inicio.
export function AccountPage() {
  const { user, token, ready, logout } = useAuth()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (ready && !user) {
    return <Navigate to="/login?redirect=/cuenta" replace />
  }

  async function handleDelete() {
    setBusy(true)
    setError(null)
    try {
      await apiSend('DELETE', '/users/me', undefined, token ?? undefined)
      // La cuenta ya está anonimizada y las sesiones revocadas en el servidor;
      // limpiamos el estado local (y la cookie) y salimos.
      await logout()
      navigate('/', { replace: true })
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo eliminar la cuenta. Inténtalo de nuevo.',
      )
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Mi cuenta</h1>
      <p className="mb-8 text-neutral-700">
        Sesión iniciada como <strong>{user?.email}</strong>.
      </p>

      <section className="rounded-lg border border-red-200 bg-red-50 p-5">
        <h2 className="mb-2 text-lg font-semibold text-red-800">
          Eliminar mi cuenta
        </h2>
        <p className="mb-4 text-sm text-red-700">
          Al eliminar tu cuenta, tus datos personales se anonimizan de forma
          irreversible y se cierran todas tus sesiones. Por obligación legal,
          conservaremos las facturas ya emitidas, sin datos que te identifiquen.
          Consulta la{' '}
          <Link to="/privacidad" className="underline hover:text-red-900">
            política de privacidad
          </Link>
          .
        </p>

        {error && (
          <p className="mb-3 rounded bg-white p-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        {confirming ? (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={busy}
              className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
            >
              {busy ? 'Eliminando…' : 'Sí, eliminar definitivamente'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
          >
            Eliminar mi cuenta
          </button>
        )}
      </section>
    </div>
  )
}
