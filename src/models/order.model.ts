import mongoose, { Document, Model, Schema } from "mongoose";
import { Channel, OrderStatus, PaymentMethod } from "./enums.ts";

// ─────────────────────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un ítem (línea) dentro del pedido.
 *
 * IMPORTANTE: Guardamos un "snapshot" (copia) del nombre y precio del producto
 * en el MOMENTO de la compra. Esto es crítico porque:
 *   - Si mañana cambias el precio del producto, el pedido histórico
 *     debe conservar el precio que el cliente realmente pagó.
 *   - Si borras el producto del catálogo, el pedido sigue siendo legible.
 *
 * La referencia a product (ObjectId) queda para consultas, pero el nombre
 * y precio son independientes del producto actual.
 */
export interface IOrderItem {
  product: mongoose.Types.ObjectId; // Referencia al producto en el catálogo
  productName: string;              // Copia del nombre al momento de comprar
  variantName?: string;             // Copia del nombre de la variante (si aplica)
  quantity: number;                 // Cuántas unidades compró
  unitPrice: number;                // Precio por unidad al momento de comprar
  subtotal: number;                 // quantity × unitPrice (calculado al crear el ítem)
}

/**
 * Pedido realizado por un usuario.
 *
 * Un pedido agrupa uno o más ítems y registra todo el ciclo:
 * creación → pago → preparación → envío → entrega.
 */
export interface IOrder {
  user: mongoose.Types.ObjectId; // Quién hizo el pedido (referencia al usuario)
  items: IOrderItem[];           // Lista de productos pedidos
  total: number;                 // Suma total del pedido
  status: OrderStatus;           // En qué estado está el pedido

  paymentMethod?: PaymentMethod;  // Cómo pagó (se llena cuando confirma el pago)
  paymentReference?: string;      // Número de transacción, foto del comprobante, etc.

  channel: Channel;               // Por qué canal hizo el pedido (WhatsApp, web, etc.)
  notes?: string;                 // Notas del cliente o del staff

  shippingAddress?: string;       // Dirección de envío si aplica

  // Fechas de eventos importantes del pedido
  paidAt?: Date;       // Cuándo se confirmó el pago
  deliveredAt?: Date;  // Cuándo el cliente recibió el pedido
  cancelledAt?: Date;  // Cuándo fue cancelado (si aplica)

  createdAt: Date;
  updatedAt: Date;
}

/**
 * IOrderDocument: IOrder + métodos de mongoose + virtuals
 */
export interface IOrderDocument extends IOrder, Document {
  // Virtual: suma los subtotales de todos los ítems
  // Útil para verificar que total === subtotalItems
  readonly subtotalItems: number;
}

/**
 * IOrderModel: tipo del modelo con métodos estáticos
 */
export interface IOrderModel extends Model<IOrderDocument> {
  findByUser(userId: mongoose.Types.ObjectId): Promise<IOrderDocument[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-ESQUEMA DE ÍTEM
// ─────────────────────────────────────────────────────────────────────────────

const orderItemSchema = new Schema<IOrderItem>(
  {
    // ref: "Product" le dice a mongoose que este ObjectId hace referencia
    // a la colección "products". Permite hacer .populate("items.product")
    // para traer el producto completo en una sola query.
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    productName: {
      type: String,
      required: true, // Obligatorio: snapshot del nombre
    },
    variantName: String,
    quantity: {
      type: Number,
      required: true,
      min: 1, // Mínimo 1 unidad por ítem
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }, // Sin _id propio para cada ítem
);

// ─────────────────────────────────────────────────────────────────────────────
// ESQUEMA PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

const orderSchema = new Schema<IOrderDocument, IOrderModel>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User", // Referencia a la colección de usuarios
      required: true,
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (v: IOrderItem[]) => v.length > 0,
        message: "El pedido debe tener al menos un ítem.",
      },
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: Object.values(OrderStatus),
      default: OrderStatus.PENDING, // Empieza en "pendiente" hasta confirmar el pago
    },
    paymentMethod: {
      type: String,
      enum: Object.values(PaymentMethod),
    },
    paymentReference: String,
    channel: {
      type: String,
      enum: Object.values(Channel),
      required: true, // Siempre necesitamos saber por dónde llegó el pedido
    },
    notes: String,
    shippingAddress: String,
    paidAt: Date,
    deliveredAt: Date,
    cancelledAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// ÍNDICES
// ─────────────────────────────────────────────────────────────────────────────

// Para listar pedidos de un usuario ordenados por estado (historial de compras)
orderSchema.index({ user: 1, status: 1 });

// Para el panel admin: ver todos los pedidos pendientes ordenados por fecha
// -1 = orden descendente (más reciente primero)
orderSchema.index({ status: 1, createdAt: -1 });

// ─────────────────────────────────────────────────────────────────────────────
// VIRTUALS
// ─────────────────────────────────────────────────────────────────────────────

// Calcula la suma de todos los subtotales de los ítems
// Útil para verificar que total === subtotalItems y detectar descuentos aplicados
orderSchema.virtual("subtotalItems").get(function (this: IOrderDocument) {
  // reduce() recorre el array acumulando la suma
  // acc = acumulador (empieza en 0), item = ítem actual
  return this.items.reduce((acc, item) => acc + item.subtotal, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// MÉTODOS ESTÁTICOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve todos los pedidos de un usuario, más recientes primero.
 * Hace populate del producto para incluir la info actualizada del catálogo.
 *
 * Ejemplo:
 *   const orders = await Order.findByUser(user._id);
 *   orders[0].items[0].product // objeto Product completo (por el populate)
 *   orders[0].items[0].productName // nombre al momento de comprar (snapshot)
 */
orderSchema.statics.findByUser = function (
  userId: mongoose.Types.ObjectId,
): Promise<IOrderDocument[]> {
  return this.find({ user: userId })
    .populate("items.product") // Trae el producto completo de la colección products
    .sort({ createdAt: -1 });  // Más reciente primero
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTACIÓN
// ─────────────────────────────────────────────────────────────────────────────

const Order = mongoose.model<IOrderDocument, IOrderModel>("Order", orderSchema);

export default Order;
