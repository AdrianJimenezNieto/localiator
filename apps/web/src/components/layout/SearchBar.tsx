import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'

export function SearchBar() {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    navigate(`/buscar?q=${encodeURIComponent(query)}`)
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full items-center gap-2">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar productos y lotes..."
        className="w-full rounded-full border border-neutral-300 px-4 py-2 text-sm focus:border-amber-500 focus:outline-none"
      />
    </form>
  )
}
