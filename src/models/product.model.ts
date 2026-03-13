import mongoose, { Document, Schema } from "mongoose";
import { ProductCategory } from "./enums.ts";

// ─────────────────────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Una variante es una versión diferente del mismo producto base.
 *
 * Ejemplo: el taco "Predator REVO" existe en varias versiones:
 *   - Variante 1: { name: "12.4mm Shaft", sku: "PRE-REVO-124", price: 850000, stock: 3 }
 *   - Variante 2: { name: "12.9mm Shaft", sku: "PRE-REVO-129", price: 850000, stock: 1 }
 *
 * SKU (Stock Keeping Unit) = código único para identificar cada variante
 * en el inventario. Útil para controlar existencias de forma precisa.
 */
export interface IProductVariant {
  name: string;       // Nombre descriptivo de la variante (ej: "Talla M", "Color Azul")
  sku: string;        // Código único de inventario para esta variante
  price: number;      // Precio de esta variante (puede diferir del precio base)
  stock: number;      // Cuántas unidades hay disponibles en inventario
  imageUrl?: string;  // Foto específica de esta variante (opcional)
}

/**
 * Producto del catálogo de la tienda.
 *
 * Un producto puede no tener variantes (precio y stock únicos)
 * o puede tener múltiples variantes (cada una con su precio y stock).
 */
export interface IProduct {
  name: string;
  description?: string;
  category: ProductCategory;
  basePrice: number;           // Precio base del producto (sin variantes) o precio de referencia
  images: string[];            // Array de URLs de imágenes (la primera es la principal)
  variants: IProductVariant[]; // Variantes disponibles. Vacío si el producto no tiene variantes.
  isActive: boolean;           // false = oculto en la tienda pero NO borrado (soft hide)
  tags: string[];              // Etiquetas para filtros (ej: ["oferta", "nuevo", "importado"])
  createdAt: Date;
  updatedAt: Date;
}

// IProductDocument extiende IProduct con los métodos de mongoose (save, etc.)
export interface IProductDocument extends IProduct, Document {}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-ESQUEMA DE VARIANTE
// ─────────────────────────────────────────────────────────────────────────────

const productVariantSchema = new Schema<IProductVariant>(
  {
    name: { type: String, required: true },
    sku: {
      type: String,
      required: true,
      // No ponemos unique aquí porque el índice de unicidad
      // lo manejamos a nivel de variante dentro del producto
    },
    price: {
      type: Number,
      required: true,
      min: 0, // El precio no puede ser negativo
    },
    stock: {
      type: Number,
      default: 0,
      min: 0, // El stock no puede ser negativo
    },
    imageUrl: String,
  },
  { _id: false }, // Sin _id propio para cada variante
);

// ─────────────────────────────────────────────────────────────────────────────
// ESQUEMA PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

const productSchema = new Schema<IProductDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true, // Elimina espacios al inicio y al final
    },
    description: String,
    category: {
      type: String,
      enum: Object.values(ProductCategory),
      required: true,
    },
    basePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    images: {
      type: [String],
      default: [], // Empieza sin imágenes
    },
    variants: {
      type: [productVariantSchema],
      default: [], // Empieza sin variantes
    },
    isActive: {
      type: Boolean,
      default: true, // Los productos se crean activos por defecto
    },
    tags: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }, // Agrega createdAt y updatedAt automáticamente
);

// ─────────────────────────────────────────────────────────────────────────────
// ÍNDICES
// ─────────────────────────────────────────────────────────────────────────────

// Para listar productos activos por categoría (la query más común en una tienda)
productSchema.index({ category: 1, isActive: 1 });

// Para filtros por etiqueta (ej: "mostrar todos los productos en oferta")
productSchema.index({ tags: 1 });

// Índice de texto para búsqueda tipo "buscar en la tienda".
// Permite queries como: Product.find({ $text: { $search: "predator" } })
// MongoDB buscará en los campos name y description simultáneamente.
productSchema.index({ name: "text", description: "text" });

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTACIÓN
// ─────────────────────────────────────────────────────────────────────────────

const Product = mongoose.model<IProductDocument>("Product", productSchema);

export default Product;
