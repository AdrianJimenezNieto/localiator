# 01 · Esquema Prisma: Usuario + roles

**Checkbox del roadmap:** «Esquema Prisma: Usuario + roles (invitado / comprador / administrador)».

## Objetivo
Modelar el usuario en la base de datos con su rol, dejando el terreno listo para
autenticación (registro, login, verificación de email, refresh tokens). El rol
`invitado` NO es una fila: es la ausencia de usuario autenticado. En BD solo existen
`comprador` y `administrador`.

## Qué se toca
- `apps/api/prisma/schema.prisma` — nuevos modelos y enum.
- `packages/shared/src/index.ts` — ya existe `UserRole` (`guest`/`buyer`/`admin`);
  se mantiene como fuente de verdad de los valores de rol para el frontend.

## Cómo implementarlo
1. **Enum de rol en Prisma.** Definir `enum Role { BUYER ADMIN }`. Nota: el enum de
   Prisma solo contiene los roles que se persisten; `guest` vive únicamente en
   `packages/shared` para el frontend. Documentar esta asimetría con un comentario.
2. **Modelo `User`.** Campos mínimos:
   - `id` (`String @id @default(cuid())` — cuid evita exponer conteos como haría un
     autoincremental).
   - `email` (`String @unique`) y `emailVerifiedAt` (`DateTime?`, null = no verificado).
   - `passwordHash` (`String?`, nullable porque un usuario de Google puede no tener
     contraseña local).
   - `role` (`Role @default(BUYER)`).
   - `createdAt` / `updatedAt` (`@default(now())` / `@updatedAt`).
3. **Índice.** El `@unique` de email ya crea índice; no hace falta nada más de momento.
4. No generar migración todavía: las migraciones y el seed se agrupan en el archivo
   `05-migraciones-seed.md` una vez estén todos los modelos base.

## Decisiones / alternativas
- **cuid vs uuid vs autoincrement:** cuid (colisión despreciable, no revela volumen de
  usuarios, ordenable). uuid v4 sería equivalente; autoincrement se descarta por filtrar
  información y facilitar enumeración.
- **`passwordHash` nullable** en vez de tabla aparte de credenciales: más simple para el
  MVP. Si en el futuro un usuario tuviera varias credenciales locales se replantea.
- **Rol como enum** en vez de tabla `roles` con relación: solo hay dos roles fijos y
  conocidos; una tabla sería sobreingeniería ahora.

## Conceptos a repasar (para tus notas)
- Enums en Prisma y cómo se traducen a Postgres (`CREATE TYPE`).
- Por qué un campo puede ser nullable a nivel de dominio (`passwordHash`) y qué implica
  en el flujo de login social.

## Hecho cuando
- El `schema.prisma` valida (`prisma validate`) con el modelo `User` y el enum `Role`.
- Los valores de rol de `packages/shared` y del enum de Prisma están alineados y
  comentada la diferencia del rol `guest`.
