import { useAuth } from '../../stores/useAuth'

export function Profile() {
  const user = useAuth((state) => state.user)

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Nombre
        <input
          defaultValue={user?.name ?? ''}
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          defaultValue={user?.email ?? ''}
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
      </label>
    </div>
  )
}
