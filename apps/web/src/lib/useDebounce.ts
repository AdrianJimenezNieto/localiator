import { useEffect, useState } from 'react';

// Devuelve una versión "retardada" de un valor: solo cambia cuando el valor de
// entrada se ha mantenido estable durante `delay` ms. Se usa en la búsqueda por
// texto para no llamar a la API en cada tecla.
export function useDebounce<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
