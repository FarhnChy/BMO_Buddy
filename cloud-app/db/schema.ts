import { sqliteTable, integer, text, real, uniqueIndex } from "drizzle-orm/sqlite-core";
export const inventory = sqliteTable("inventory", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  barcode: text("barcode").notNull(), name: text("name").notNull(),
  quantity: integer("quantity").notNull(), expires_on: text("expires_on").notNull().default(""),
}, (t) => [uniqueIndex("inventory_batch").on(t.barcode, t.expires_on)]);
export const readings = sqliteTable("readings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  timestamp: text("timestamp").notNull(), temperature_c: real("temperature_c"),
});
