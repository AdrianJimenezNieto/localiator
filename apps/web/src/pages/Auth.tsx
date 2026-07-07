import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../components/ui/Button'
import { useAuth } from '../stores/useAuth'

type Tab = 'login' | 'register'

export function Auth() {
  const [tab, setTab] = useState<Tab>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()
  const { login, continueAsGuest } = useAuth()

  function handleSubmit() {
    login({ id: crypto.randomUUID(), name: email.split('@')[0] ?? 'Usuario', email })
    navigate('/cuenta')
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4">
      <div className="flex rounded-lg border border-neutral-200">
        <button
          type="button"
          onClick={() => setTab('login')}
          className={`flex-1 py-2 text-sm font-medium ${tab === 'login' ? 'bg-amber-500 text-neutral-900' : 'text-neutral-600'}`}
        >
          Entrar
        </button>
        <button
          type="button"
          onClick={() => setTab('register')}
          className={`flex-1 py-2 text-sm font-medium ${tab === 'register' ? 'bg-amber-500 text-neutral-900' : 'text-neutral-600'}`}
        >
          Registrarme
        </button>
      </div>

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
      <input
        type="password"
        placeholder="Contraseña"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
      <Button onClick={handleSubmit}>{tab === 'login' ? 'Entrar' : 'Crear cuenta'}</Button>

      <div className="flex items-center gap-2 text-xs text-neutral-400">
        <div className="h-px flex-1 bg-neutral-200" />
        o
        <div className="h-px flex-1 bg-neutral-200" />
      </div>

      <Button variant="secondary" onClick={handleSubmit}>
        Continuar con Google
      </Button>
      <button
        type="button"
        onClick={() => {
          continueAsGuest()
          navigate('/')
        }}
        className="text-sm text-neutral-500 underline"
      >
        Continuar como invitado
      </button>
      <button type="button" className="text-sm text-neutral-400 underline">
        ¿Olvidaste la contraseña?
      </button>
    </div>
  )
}
