/*
  Warnings:

  - You are about to drop the `ProductionSection` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `sectionId` on the `MenuItem` table. All the data in the column will be lost.
  - You are about to drop the column `sectionSnapshot` on the `OrderItem` table. All the data in the column will be lost.
  - You are about to drop the column `sectionName` on the `ProductionToken` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "ProductionSection_name_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ProductionSection";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MenuItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "imagePath" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "categoryId" TEXT NOT NULL,
    CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_MenuItem" ("active", "available", "categoryId", "createdAt", "id", "imagePath", "name", "price", "updatedAt") SELECT "active", "available", "categoryId", "createdAt", "id", "imagePath", "name", "price", "updatedAt" FROM "MenuItem";
DROP TABLE "MenuItem";
ALTER TABLE "new_MenuItem" RENAME TO "MenuItem";
CREATE INDEX "MenuItem_categoryId_idx" ON "MenuItem"("categoryId");
CREATE TABLE "new_OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "menuItemId" TEXT,
    "nameSnapshot" TEXT NOT NULL,
    "priceSnapshot" REAL NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lineTotal" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_OrderItem" ("createdAt", "id", "lineTotal", "menuItemId", "nameSnapshot", "orderId", "priceSnapshot", "quantity", "status", "updatedAt") SELECT "createdAt", "id", "lineTotal", "menuItemId", "nameSnapshot", "orderId", "priceSnapshot", "quantity", "status", "updatedAt" FROM "OrderItem";
DROP TABLE "OrderItem";
ALTER TABLE "new_OrderItem" RENAME TO "OrderItem";
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE TABLE "new_ProductionToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenNumber" INTEGER NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "printedAt" DATETIME,
    "printCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductionToken_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductionToken_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ProductionToken" ("createdAt", "id", "itemName", "orderId", "orderItemId", "printCount", "printedAt", "quantity", "status", "tokenNumber", "updatedAt") SELECT "createdAt", "id", "itemName", "orderId", "orderItemId", "printCount", "printedAt", "quantity", "status", "tokenNumber", "updatedAt" FROM "ProductionToken";
DROP TABLE "ProductionToken";
ALTER TABLE "new_ProductionToken" RENAME TO "ProductionToken";
CREATE UNIQUE INDEX "ProductionToken_tokenNumber_key" ON "ProductionToken"("tokenNumber");
CREATE UNIQUE INDEX "ProductionToken_orderItemId_key" ON "ProductionToken"("orderItemId");
CREATE INDEX "ProductionToken_orderId_idx" ON "ProductionToken"("orderId");
CREATE INDEX "ProductionToken_status_idx" ON "ProductionToken"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
