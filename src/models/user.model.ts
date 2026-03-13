// Importamos mongoose y los tipos necesarios de su librería
// - Document : tipo base que mongoose le agrega a cada registro guardado en la BD
//              incluye campos como _id y métodos como save(), deleteOne(), etc.
// - Model    : tipo base del modelo, es lo que usas para hacer User.find(),
//              User.create(), User.findById(), etc.
// - Schema   : constructor del esquema, define la "forma" y reglas de los datos
// - CallbackWithoutResultAndOptionalError : tipo del parámetro "next" en los hooks
import mongoose, {
  Document,
  Model,
  Schema,
} from "mongoose";

// Importamos los enums desde el archivo compartido
// Así todos los modelos usan los mismos valores y no hay duplicados
import {
  Channel,
  UserSource,
  UserStatus,
  PlayerCategory,
  InterestType,
  UserRole,
} from "./enums.ts";

// ─────────────────────────────────────────────────────────────────────────────
// INTERFACES DE SUB-DOCUMENTOS
//
// Una interfaz en TypeScript describe la "forma" de un objeto.
// NO genera código JavaScript, solo existe en tiempo de compilación
// para que el editor te ayude con autocompletado y detecte errores.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Identidad del usuario en un canal específico.
 *
 * Un usuario puede tener VARIAS identidades vinculadas.
 * Ejemplo real:
 *   - El cliente Juan te escribe por WhatsApp → se guarda { provider: "WHATSAPP", providerId: "573001234567" }
 *   - Luego Juan se registra en la web → se agrega  { provider: "WEB", providerId: "juan@email.com" }
 *   - Ambas identidades quedan en el MISMO documento de usuario
 *   - Así toda su historia (compras, torneos, rifas) queda unificada
 */
export interface IIdentity {
  provider: Channel;            // En qué canal está registrada esta identidad
  providerId: string;           // ID único en ese canal (número WA, email, userId de red social)
  meta?: Map<string, unknown>;  // Datos extra del canal (nombre de perfil WA, foto de IG, etc.)
  verifiedAt?: Date;            // Cuándo se verificó que este canal le pertenece al usuario
}

/**
 * Credenciales para el login por la página web.
 *
 * Solo se llena si el usuario creó cuenta en la web.
 * Se guarda como sub-documento separado del perfil por seguridad:
 * así es fácil excluirlo en queries donde no necesitas la contraseña.
 */
export interface IWebAuth {
  email?: string;
  passwordHash?: string;           // NUNCA guardar la contraseña en texto plano, siempre hash (bcrypt)
  resetToken?: string;             // Token temporal generado al pedir recuperación de contraseña
  resetTokenExpiresAt?: Date;      // Cuándo expira ese token (generalmente 1 hora)
  emailVerified: boolean;          // Si el usuario hizo clic en el link de verificación de email
  emailVerificationToken?: string; // Token del link que se envía al correo al registrarse
}

/**
 * Registro de un área del negocio con la que el usuario ha interactuado.
 *
 * Nos permite saber qué le interesa a cada usuario sin tener que
 * leer todo el historial de mensajes.
 * Ejemplo: Juan preguntó 5 veces por torneos →
 *   { type: "TOURNAMENTS", count: 5, lastInteraction: Date, channel: "WHATSAPP" }
 */
export interface IInterest {
  type: InterestType;    // Qué área del negocio le interesa
  lastInteraction: Date; // Cuándo fue la última vez que interactuó con esa área
  count: number;         // Cuántas veces ha interactuado con esa área en total
  channel?: Channel;     // Por qué canal fue la última interacción
}

/**
 * Estado actual del chatbot para un canal específico.
 *
 * Guardamos UN estado POR CANAL porque el mismo usuario puede estar
 * en pasos distintos del flujo al mismo tiempo.
 * Ejemplo:
 *   - En WhatsApp está en el paso "CONFIRM_ORDER" (confirmando un pedido)
 *   - En la web está en "IDLE" (no hay nada activo)
 * Sin este diseño, si el bot avanza en WhatsApp rompería el estado de la web.
 */
export interface IConversationState {
  channel: Channel;                  // A qué canal pertenece este estado
  currentState: string;              // Nombre del paso actual en el flujo del bot (ej: "IDLE", "CONFIRM_ORDER")
  stateData?: Map<string, unknown>;  // Datos temporales del flujo (carrito parcial, respuestas del formulario, etc.)
  lastActivityAt: Date;              // Cuándo fue el último mensaje del usuario en este canal
}

/**
 * Consentimientos de comunicación del usuario.
 *
 * En Colombia la Ley 1581 de Habeas Data obliga a tener consentimiento
 * explícito antes de enviar mensajes de marketing. Guardamos cada tipo
 * por separado para ser precisos (puede aceptar WhatsApp pero no email).
 */
export interface IConsent {
  marketing: boolean; // Acepta recibir publicidad y promociones en general
  whatsapp: boolean;  // Acepta recibir mensajes de marketing por WhatsApp
  email: boolean;     // Acepta recibir emails de marketing
  updatedAt: Date;    // Cuándo actualizó sus preferencias de consentimiento
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERFAZ PRINCIPAL: IUser
//
// Describe todos los campos del documento de usuario tal como se guardan
// en MongoDB. Esta interfaz NO incluye métodos ni virtuals, solo datos puros.
// ─────────────────────────────────────────────────────────────────────────────
export interface IUser {
  // Array de identidades. Mínimo una requerida (WhatsApp o Web).
  // Permite vincular múltiples canales al mismo usuario.
  identities: IIdentity[];

  // Credenciales web. undefined si el usuario solo llegó por WhatsApp.
  webAuth?: IWebAuth;

  // Datos básicos del perfil
  name?: string;
  phone?: string;     // Número de teléfono (String para incluir código de país: +57...)
  avatarUrl?: string; // URL de la foto de perfil

  // CRM: datos para seguimiento comercial
  source: UserSource;           // De dónde vino por primera vez
  status: UserStatus;           // En qué etapa del embudo de ventas está
  playerCategory?: PlayerCategory; // Categoría de billar. undefined si no es jugador.
  role: UserRole;               // Qué puede hacer en el sistema
  tags: string[];               // Etiquetas libres (ej: ["vip", "bogota", "torneo-2025"])

  consent: IConsent;
  conversationStates: IConversationState[]; // Un estado por cada canal
  interests: IInterest[];                    // Áreas del negocio que le interesan

  // Última vez que el usuario interactuó con nosotros (cualquier canal)
  lastInteractionAt?: Date;
  lastInteractionChannel?: Channel;

  // Soft delete: en lugar de borrar el documento, guardamos cuándo fue "eliminado".
  // undefined = usuario activo.
  // Date = usuario eliminado en esa fecha (se puede recuperar si fue un error).
  deletedAt?: Date;

  // Estos campos los agrega mongoose automáticamente con { timestamps: true }
  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERFAZ DEL DOCUMENTO: IUserDocument
//
// Extiende IUser con:
// - Document de mongoose: agrega _id, save(), deleteOne(), etc.
// - Virtuals: campos calculados que no se guardan en MongoDB
// - Métodos de instancia: funciones que puedes llamar sobre un usuario concreto
//
// Esta es la interfaz que usas cuando tienes un usuario obtenido de la BD:
//   const user = await User.findById(id);  ← user es de tipo IUserDocument
// ─────────────────────────────────────────────────────────────────────────────
export interface IUserDocument extends IUser, Document {
  // Virtuals (readonly porque son calculados, no se pueden asignar directamente)
  readonly whatsappId: string | null;  // Shortcut: número de WhatsApp del usuario
  readonly email: string | null;       // Shortcut: email web del usuario
  readonly hasWebAccount: boolean;     // true si tiene email registrado en la web
  readonly isDeleted: boolean;         // true si deletedAt tiene alguna fecha

  // Métodos de instancia
  getConversationState(channel: Channel): IConversationState;
  registerInterest(type: InterestType, channel: Channel): void;
  softDelete(): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERFAZ DEL MODELO: IUserModel
//
// Extiende Model<IUserDocument> y agrega los métodos estáticos (statics).
// La diferencia con los métodos de instancia:
//   - Instancia: se llama sobre UN documento → user.softDelete()
//   - Static:    se llama sobre el MODELO    → User.findByEmail("juan@email.com")
// ─────────────────────────────────────────────────────────────────────────────
export interface IUserModel extends Model<IUserDocument> {
  findByIdentity(
    provider: Channel,
    providerId: string,
  ): Promise<IUserDocument | null>;
  findByEmail(email: string): Promise<IUserDocument | null>;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-ESQUEMAS
//
// Un sub-esquema define la estructura de un objeto anidado dentro del
// esquema principal. Se instancian con new Schema() igual que el principal.
//
// { _id: false } le dice a mongoose que NO genere un _id automático
// para cada sub-documento. Los sub-documentos no necesitan ID propio
// porque ya están dentro del documento principal que tiene su propio _id.
// Esto ahorra espacio en MongoDB.
// ─────────────────────────────────────────────────────────────────────────────

const identitySchema = new Schema<IIdentity>(
  {
    provider: {
      type: String,
      // Object.values(Channel) genera ["WHATSAPP", "WEB", "INSTAGRAM", "FACEBOOK"]
      // así mongoose valida que solo se guarden esos valores
      enum: Object.values(Channel),
      required: true,
    },
    providerId: {
      type: String,
      required: true,
    },
    meta: {
      type: Map,
      of: Schema.Types.Mixed, // Mixed = acepta cualquier tipo de valor (string, number, object, etc.)
      default: {},
    },
    verifiedAt: Date,
  },
  { _id: false },
);

const webAuthSchema = new Schema<IWebAuth>(
  {
    email: {
      type: String,
      lowercase: true, // Mongoose convierte automáticamente a minúsculas al guardar
      trim: true,      // Elimina espacios en blanco al inicio y al final
    },
    passwordHash: String,
    resetToken: String,
    resetTokenExpiresAt: Date,
    emailVerified: {
      type: Boolean,
      default: false, // Por defecto el email NO está verificado al registrarse
    },
    emailVerificationToken: String,
  },
  { _id: false },
);

const interestSchema = new Schema<IInterest>(
  {
    type: {
      type: String,
      enum: Object.values(InterestType),
      required: true,
    },
    lastInteraction: {
      type: Date,
      default: Date.now, // Se registra la fecha actual al crear el interés
    },
    count: {
      type: Number,
      default: 1, // Empieza en 1 porque se crea cuando ocurre la primera interacción
    },
    channel: {
      type: String,
      enum: Object.values(Channel),
    },
  },
  { _id: false },
);

const conversationStateSchema = new Schema<IConversationState>(
  {
    channel: {
      type: String,
      enum: Object.values(Channel),
    },
    currentState: {
      type: String,
      default: "IDLE", // Estado inicial: el bot no tiene ningún flujo activo
    },
    stateData: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {},
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const consentSchema = new Schema<IConsent>(
  {
    marketing: { type: Boolean, default: false },
    whatsapp: { type: Boolean, default: false },
    email: { type: Boolean, default: false },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

// ─────────────────────────────────────────────────────────────────────────────
// ESQUEMA PRINCIPAL
//
// Schema<IUserDocument, IUserModel> le dice a TypeScript:
// - IUserDocument : los documentos de este schema tienen esa forma
// - IUserModel    : el modelo tiene esos métodos estáticos
// ─────────────────────────────────────────────────────────────────────────────
const userSchema = new Schema<IUserDocument, IUserModel>(
  {
    identities: {
      type: [identitySchema],
      // validate permite crear validaciones personalizadas.
      // Si el array está vacío, mongoose lanza un error ANTES de guardar.
      validate: {
        validator: (v: IIdentity[]) => v.length > 0,
        message: "El usuario debe tener al menos una identidad.",
      },
    },

    webAuth: webAuthSchema,

    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    avatarUrl: String,

    source: {
      type: String,
      enum: Object.values(UserSource),
      default: UserSource.WHATSAPP, // La mayoría de clientes llegan por WhatsApp
    },

    status: {
      type: String,
      enum: Object.values(UserStatus),
      default: UserStatus.NEW, // Todo usuario empieza como "nuevo"
    },

    playerCategory: {
      type: String,
      enum: Object.values(PlayerCategory),
      // Sin default porque no todos los usuarios son jugadores de billar
    },

    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.CUSTOMER, // Por defecto es un cliente normal
    },

    consent: {
      type: consentSchema,
      // () => ({}) es una función flecha que retorna un objeto vacío.
      // Se usa función en lugar de objeto literal para que mongoose
      // cree un objeto NUEVO para cada usuario (no el mismo objeto en memoria).
      default: () => ({}),
    },

    conversationStates: {
      type: [conversationStateSchema],
      default: [], // Vacío hasta que el usuario envíe su primer mensaje
    },

    interests: {
      type: [interestSchema],
      default: [],
    },

    tags: { type: [String], default: [] },

    lastInteractionAt: Date,
    lastInteractionChannel: {
      type: String,
      enum: Object.values(Channel),
    },

    // Soft delete: si tiene fecha → está eliminado. Si no tiene → está activo.
    deletedAt: Date,
  },
  {
    timestamps: true,             // Agrega createdAt y updatedAt automáticamente
    toJSON: { virtuals: true },   // Incluye los virtuals al hacer JSON.stringify(user)
    toObject: { virtuals: true }, // Incluye los virtuals al hacer user.toObject()
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// ÍNDICES
//
// Un índice le dice a MongoDB que mantenga una estructura especial (B-tree)
// para acelerar las búsquedas por esos campos.
//
// Sin índice: MongoDB lee TODOS los documentos de la colección (O(n) - lento)
// Con índice: MongoDB va directo al resultado                  (O(log n) - rápido)
//
// El costo: un poco más de espacio en disco y escrituras levemente más lentas.
// Para lecturas frecuentes siempre vale la pena.
// ─────────────────────────────────────────────────────────────────────────────

// Índice compuesto para buscar usuarios por canal + ID del canal.
// unique: true → no puede haber dos usuarios con el mismo WhatsApp o el mismo email.
// sparse: true → ignora documentos que no tengan estos campos (permite que
//                algunos usuarios no tengan identidades de cierto tipo).
userSchema.index(
  { "identities.provider": 1, "identities.providerId": 1 },
  { unique: true, sparse: true },
);

// Índice para buscar por email web. unique + sparse = único pero opcional.
userSchema.index({ "webAuth.email": 1 }, { unique: true, sparse: true });

// Índice para filtros de CRM (ej: "dame todos los usuarios nuevos de WhatsApp")
userSchema.index({ status: 1, source: 1 });

// Índice para búsquedas por etiqueta (ej: "dame todos los usuarios con tag 'vip'")
userSchema.index({ tags: 1 });

// Índice para filtrar por categoría de jugador en inscripciones a torneos
userSchema.index({ playerCategory: 1 });

// Índice para excluir usuarios eliminados. La mayoría de queries filtran por esto.
userSchema.index({ deletedAt: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// VIRTUALS
//
// Campos calculados que NO se guardan en MongoDB.
// Se recalculan cada vez que accedes a ellos.
// "this" dentro del virtual se refiere al documento actual.
// ─────────────────────────────────────────────────────────────────────────────

// Shortcut para obtener el número de WhatsApp sin buscar en el array de identidades
userSchema.virtual("whatsappId").get(function (this: IUserDocument) {
  return (
    this.identities?.find((i) => i.provider === Channel.WHATSAPP)?.providerId ??
    null
    // ?. (optional chaining): si find() devuelve undefined, no lanza error
    // ?? (nullish coalescing): si el resultado es undefined, devuelve null
  );
});

// Shortcut para obtener el email web
userSchema.virtual("email").get(function (this: IUserDocument) {
  return this.webAuth?.email ?? null;
});

// true si el usuario tiene cuenta web creada
userSchema.virtual("hasWebAccount").get(function (this: IUserDocument) {
  return !!this.webAuth?.email;
  // !! convierte cualquier valor a booleano:
  // undefined → false (no tiene email → no tiene cuenta web)
  // "juan@..." → true  (tiene email → tiene cuenta web)
});

// true si el usuario fue marcado como eliminado (soft delete)
userSchema.virtual("isDeleted").get(function (this: IUserDocument) {
  return !!this.deletedAt;
});

// ─────────────────────────────────────────────────────────────────────────────
// MÉTODOS DE INSTANCIA
//
// Funciones disponibles en cada documento de usuario individual.
// Se llaman sobre un usuario obtenido de la BD:
//   const user = await User.findById(id);
//   user.registerInterest(InterestType.TOURNAMENTS, Channel.WHATSAPP);
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve el estado conversacional de un canal específico.
 * Si el usuario nunca interactuó por ese canal, crea el estado inicial.
 *
 * Uso típico en el bot: antes de procesar un mensaje, obtienes el estado
 * actual para saber en qué paso del flujo estaba el usuario.
 *   const state = user.getConversationState(Channel.WHATSAPP);
 *   if (state.currentState === "CONFIRM_ORDER") { ... }
 */
userSchema.methods.getConversationState = function (
  this: IUserDocument,
  channel: Channel,
): IConversationState {
  const existing = this.conversationStates.find((s) => s.channel === channel);

  if (existing) {
    return existing; // TypeScript ya sabe que no es undefined aquí
  }

  // No existe → creamos el estado inicial y lo retornamos directamente
  const newState: IConversationState = {
    channel,
    currentState: "IDLE",
    stateData: new Map(),
    lastActivityAt: new Date(),
  };

  this.conversationStates.push(newState);
  return newState; // Retornamos la variable local, no el array[index]
};

/**
 * Registra o incrementa un interés del usuario en un área del negocio.
 *
 * Si ya tiene ese interés registrado: suma 1 al contador y actualiza la fecha.
 * Si es la primera vez: lo agrega al array.
 *
 * Ejemplo de uso:
 *   user.registerInterest(InterestType.TOURNAMENTS, Channel.WHATSAPP);
 *   await user.save(); // importante: guardar después de modificar
 */
userSchema.methods.registerInterest = function (
  this: IUserDocument,
  type: InterestType,
  channel: Channel,
): void {
  // Buscamos si ya tiene registrado este tipo de interés
  const existing = this.interests.find((i) => i.type === type);

  if (existing) {
    // Ya tenía este interés → actualizamos los datos
    existing.count += 1;
    existing.lastInteraction = new Date();
    existing.channel = channel;
  } else {
    // Primera vez → lo agregamos al array
    this.interests.push({
      type,
      channel,
      lastInteraction: new Date(),
      count: 1,
    });
  }
};

/**
 * Soft delete: marca el usuario como eliminado sin borrarlo de MongoDB.
 *
 * Ventajas sobre el borrado real:
 * - Se puede recuperar si fue un error humano
 * - Se mantiene el historial de compras, torneos e inscripciones
 * - Las queries normales lo excluyen con { deletedAt: { $exists: false } }
 *
 * Ejemplo de uso:
 *   await user.softDelete();
 */
userSchema.methods.softDelete = async function (
  this: IUserDocument,
): Promise<void> {
  this.deletedAt = new Date(); // Marcamos la fecha de eliminación
  await this.save();           // Guardamos el cambio en MongoDB
};

// ─────────────────────────────────────────────────────────────────────────────
// MÉTODOS ESTÁTICOS
//
// Se llaman sobre el MODELO, no sobre un documento individual.
// Son útiles para queries frecuentes que quieres reutilizar en todo el proyecto.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Busca un usuario por canal e ID dentro de ese canal.
 * Solo devuelve usuarios activos (sin deletedAt).
 *
 * Ejemplos de uso:
 *   await User.findByIdentity(Channel.WHATSAPP, "573001234567")
 *   await User.findByIdentity(Channel.WEB, "juan@email.com")
 */
userSchema.statics.findByIdentity = function (
  provider: Channel,
  providerId: string,
): Promise<IUserDocument | null> {
  return this.findOne({
    "identities.provider": provider,
    "identities.providerId": providerId,
    deletedAt: { $exists: false }, // $exists: false → el campo no existe en el documento
  });
};

/**
 * Busca un usuario por su email web.
 * Normaliza el email antes de buscar para que coincida con cómo se guarda.
 *
 * Ejemplo de uso:
 *   await User.findByEmail("Juan@Email.COM") // busca "juan@email.com"
 */
userSchema.statics.findByEmail = function (
  email: string,
): Promise<IUserDocument | null> {
  return this.findOne({
    "webAuth.email": email.toLowerCase().trim(),
    deletedAt: { $exists: false },
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// MIDDLEWARE (hooks)
//
// Funciones que mongoose ejecuta AUTOMÁTICAMENTE antes o después
// de ciertas operaciones. "pre" = antes, "post" = después.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hook PRE-SAVE: se ejecuta antes de cada user.save()
 *
 * Normaliza el email a minúsculas para garantizar consistencia.
 * Sin esto, "Juan@Email.com" y "juan@email.com" serían tratados
 * como emails distintos y podrían duplicarse en la BD.
 *
 * next() le indica a mongoose que puede continuar con el guardado.
 * Si pasas un error a next(error), mongoose cancela el guardado.
 */
userSchema.pre<IUserDocument>("save", async function () {
  if (this.webAuth?.email) {
    this.webAuth.email = this.webAuth.email.toLowerCase().trim();
  }
});
// ─────────────────────────────────────────────────────────────────────────────
// CREACIÓN Y EXPORTACIÓN DEL MODELO
//
// mongoose.model() recibe:
// - "User"         : nombre de la colección en MongoDB (será "users" en plural)
// - userSchema     : el esquema que define la estructura
// - Los generics   : los tipos TypeScript para documentos y modelo
// ─────────────────────────────────────────────────────────────────────────────
const User = mongoose.model<IUserDocument, IUserModel>("User", userSchema);

export default User;
