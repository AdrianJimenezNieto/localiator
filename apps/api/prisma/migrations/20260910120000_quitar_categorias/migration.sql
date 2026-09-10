-- Elimina la categorización del catálogo (decisión de negocio: los artículos de
-- subasta no se clasifican). Se van las FK, las columnas y la tabla entera.
-- DESTRUCTIVA: no se recupera sin restaurar backup.

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "Lot" DROP CONSTRAINT "Lot_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "Category" DROP CONSTRAINT "Category_parentId_fkey";

-- DropIndex
DROP INDEX "Product_categoryId_idx";

-- DropIndex
DROP INDEX "Lot_categoryId_idx";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "categoryId";

-- AlterTable
ALTER TABLE "Lot" DROP COLUMN "categoryId";

-- DropTable
DROP TABLE "Category";
