import { Link } from 'react-router'
import { SearchBar } from '../components/layout/SearchBar'
import { FilterChip } from '../components/catalog/FilterChip'
import { ProductCard } from '../components/product/ProductCard'
import { categories } from '../mocks/categories'
import { items } from '../mocks/items'

export function Home() {
  const newest = items.slice(0, 4)

  return (
    <div className="flex flex-col gap-6">
      <div className="md:hidden">
        <SearchBar />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {categories.map((category) => (
          <FilterChip key={category.slug} label={category.name} active={false} onClick={() => {}} />
        ))}
      </div>

      <Link
        to="/buscar"
        className="flex h-28 items-center justify-center rounded-lg bg-amber-100 font-medium text-amber-900"
      >
        Descubre nuestras últimas ofertas de subasta
      </Link>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-neutral-900">Novedades</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {newest.map((item) => (
            <ProductCard key={item.id} item={item} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-neutral-900">Categorías</h2>
        <div className="grid grid-cols-4 gap-3">
          {categories.map((category) => (
            <Link
              key={category.slug}
              to={`/categoria/${category.slug}`}
              className="flex flex-col items-center gap-1 rounded-lg border border-neutral-200 p-3 text-center text-xs text-neutral-700"
            >
              <span className="h-10 w-10 rounded-full bg-neutral-100" />
              {category.name}
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
