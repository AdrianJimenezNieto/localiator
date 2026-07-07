import { UserRole } from '@localiator/shared'

function App() {
  console.log('hola mundo')
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-2 bg-neutral-50 text-neutral-900">
      <h1 className="text-3xl font-bold">Localiator</h1>
      <p className="text-neutral-500">
        Esqueleto listo. Roles disponibles: {Object.values(UserRole).join(', ')}
      </p>
    </main>
  )
}

export default App
