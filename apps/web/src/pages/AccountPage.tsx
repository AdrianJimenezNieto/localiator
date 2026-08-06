import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { apiSend, ApiError } from '../lib/api'

// Área de cuenta del comprador. Por ahora contiene la "zona peligrosa": el borrado
// de la propia cuenta (derecho al olvido RGPD, tarea 02). Al eliminar, el backend
// anonimiza la cuenta y revoca las sesiones; aquí cerramos sesión localmente y
// volvemos al inicio.
export function AccountPage() {
  const { user, token, ready, logout, changePassword } = useAuth()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Estado propio del formulario de cambio de contraseña, independiente del de la
  // zona peligrosa.
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwSubmitting, setPwSubmitting] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwDone, setPwDone] = useState(false)

  if (ready && !user) {
    return <Navigate to="/login?redirect=/cuenta" replace />
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    setPwError(null)
    setPwDone(false)
    // Coincidencia de las dos nuevas: solo en cliente (evita erratas); la política
    // de fortaleza la valida el backend y su mensaje se muestra aquí.
    if (newPassword !== confirmPassword) {
      setPwError('Las contraseñas nuevas no coinciden')
      return
    }
    setPwSubmitting(true)
    try {
      await changePassword(currentPassword, newPassword)
      // La sesión se mantiene (el contexto guardó el token nuevo): mensaje inline
      // sin sacar al usuario de la página. Limpiamos los campos.
      setPwDone(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPwError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo cambiar la contraseña. Inténtalo de nuevo.',
      )
    } finally {
      setPwSubmitting(false)
    }
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
      <p className="mb-8 text-ink-700">
        Sesión iniciada como <strong>{user?.email}</strong>.
      </p>

      <section className="mb-8 rounded-lg border border-ink-200 p-5">
        <h2 className="mb-2 text-lg font-semibold">Cambiar contraseña</h2>
        <p className="mb-4 text-sm text-ink-600">
          Introduce tu contraseña actual y elige una nueva. Por seguridad, se
          cerrarán tus sesiones en otros dispositivos.
        </p>

        {pwError && (
          <p
            className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-700"
            role="alert"
          >
            {pwError}
          </p>
        )}
        {pwDone && (
          <p
            className="mb-3 rounded-md bg-green-50 p-2 text-sm text-green-700"
            role="status"
          >
            Tu contraseña se ha actualizado correctamente.
          </p>
        )}

        <form
          onSubmit={handleChangePassword}
          className="flex max-w-sm flex-col gap-4"
        >
          <div>
            <label
              htmlFor="currentPassword"
              className="mb-1 block text-sm font-medium"
            >
              Contraseña actual
            </label>
            <input
              id="currentPassword"
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-md border border-ink-300 px-3 py-2 focus:border-ink-900 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="newPassword"
              className="mb-1 block text-sm font-medium"
            >
              Nueva contraseña
            </label>
            <input
              id="newPassword"
              type="password"
              required
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-md border border-ink-300 px-3 py-2 focus:border-ink-900 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="confirmNewPassword"
              className="mb-1 block text-sm font-medium"
            >
              Repetir nueva contraseña
            </label>
            <input
              id="confirmNewPassword"
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-md border border-ink-300 px-3 py-2 focus:border-ink-900 focus:outline-none"
            />
          </div>
          <p className="-mt-2 text-xs text-ink-500">
            Mínimo 10 caracteres, con al menos una letra, un número y un carácter
            especial.
          </p>

          <button
            type="submit"
            disabled={pwSubmitting}
            className="min-h-11 rounded-md bg-ink-900 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {pwSubmitting ? 'Guardando…' : 'Cambiar contraseña'}
          </button>
        </form>
      </section>

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
              className="rounded-md border border-ink-300 bg-white px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100"
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
