// Buscar usuario por canal y providerId
export async function getUserByProviderService(provider: string, providerId: string) {
  return User.findOne({
    "identities.provider": provider,
    "identities.providerId": providerId,
    deletedAt: { $exists: false },
  }).select(SAFE_SELECT).lean();
}

// Actualizar o crear estado conversacional
export async function updateConversationStateService(userId: string, { channel, currentState, stateData }: { channel: string, currentState: string, stateData?: any }) {
  const user = await User.findById(userId);
  if (!user) throw new Error("Usuario no encontrado.");

    // Convertir string a enum Channel
    const channelEnum = Channel[channel as keyof typeof Channel];
    let state = user.conversationStates.find((s: any) => s.channel === channelEnum);
    if (state) {
      state.currentState = currentState;
      state.stateData = stateData || {};
      state.lastActivityAt = new Date();
    } else {
      user.conversationStates.push({
        channel: channelEnum,
        currentState,
        stateData: stateData || {},
        lastActivityAt: new Date(),
      });
  }
  await user.save();
  return user.toObject();
}
import User from "../models/user.model.ts";
import { Channel } from "../models/enums.ts";

// ─────────────────────────────────────────────────────────────────────────────
// INTERFACES DE PARÁMETROS
// ─────────────────────────────────────────────────────────────────────────────

export interface ListUsersParams {
  status?: string;
  role?: string;
  playerCategory?: string;
  search?: string;   // busca por nombre o teléfono (parcial, case-insensitive)
  page: number;
  limit: number;
}

export interface UpdateUserParams {
  id: string;
  data: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// CAMPOS SENSIBLES EXCLUIDOS EN TODAS LAS RESPUESTAS
// ─────────────────────────────────────────────────────────────────────────────
const SAFE_SELECT = "-webAuth.passwordHash -webAuth.resetToken -webAuth.emailVerificationToken";

// ─────────────────────────────────────────────────────────────────────────────
// SERVICIOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea un nuevo usuario.
 * Si ya existe un usuario con el mismo teléfono o identidad de WhatsApp,
 * lanza un error descriptivo e incluye el usuario existente.
 */
export async function createUserService(data: Record<string, unknown>) {
  // Verificar duplicado por phone
  const phone = data.phone as string | undefined;
  const identities = data.identities as Array<{ provider: string; providerId: string }> | undefined;

  const orConditions: object[] = [];
  if (phone) orConditions.push({ phone });
  if (identities?.length) {
    for (const id of identities) {
      orConditions.push({ "identities.provider": id.provider, "identities.providerId": id.providerId });
    }
  }

  if (orConditions.length > 0) {
    const existing = await User.findOne({ $or: orConditions, deletedAt: { $exists: false } })
      .select("-webAuth.passwordHash -webAuth.resetToken -webAuth.emailVerificationToken")
      .lean();

    if (existing) {
      const err = new Error("Este usuario ya existe.") as Error & { existingUser: unknown };
      err.existingUser = existing;
      throw err;
    }
  }

  return User.create(data);
}

/**
 * Lista usuarios activos (sin deletedAt) con filtros opcionales y paginación.
 */
export async function listUsersService(params: ListUsersParams) {
  const { status, role, playerCategory, search, page, limit } = params;

  const filter: Record<string, unknown> = { deletedAt: { $exists: false } };
  if (status)         filter.status = status;
  if (role)           filter.role = role;
  if (playerCategory) filter.playerCategory = playerCategory;
  if (search) {
    const regex = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    filter.$or = [
      { name:  regex },
      { phone: regex },
      { "identities.providerId": regex },
    ];
  }

  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    User.find(filter)
      .select(SAFE_SELECT)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  return { users, total };
}

/**
 * Busca un usuario por número de teléfono o providerId de WhatsApp.
 * Lanza error si no existe.
 */
export async function getUserByPhoneService(phone: string) {
  const clean = phone.trim();
  const user = await User.findOne({
    $or: [
      { phone: clean },
      { "identities.providerId": clean },
    ],
    deletedAt: { $exists: false },
  })
    .select(SAFE_SELECT)
    .lean();

  if (!user) throw new Error("Usuario no encontrado con ese número.");
  return user;
}

/**
 * Busca un usuario por su _id.
 * Lanza error si no existe.
 */
export async function getUserByIdService(id: string) {
  const user = await User.findById(id)
    .select(SAFE_SELECT)
    .lean();

  if (!user) throw new Error("Usuario no encontrado.");
  return user;
}

/**
 * Actualiza campos permitidos de un usuario.
 * Bloquea cambios en webAuth y deletedAt desde esta ruta.
 */
export async function updateUserService(params: UpdateUserParams) {
  // Eliminar campos sensibles que no se pueden cambiar por esta ruta
  const { webAuth: _webAuth, deletedAt: _deletedAt, ...safeFields } = params.data;

  const user = await User.findByIdAndUpdate(
    params.id,
    { $set: safeFields },
    { new: true, runValidators: true }
  ).select("-webAuth.passwordHash");

  if (!user) throw new Error("Usuario no encontrado.");
  return user;
}

/**
 * Soft delete: marca al usuario con deletedAt en lugar de borrarlo.
 * Así se puede recuperar si fue un error.
 */
export async function deleteUserService(id: string) {
  const user = await User.findByIdAndUpdate(
    id,
    { deletedAt: new Date() },
    { new: true }
  );

  if (!user) throw new Error("Usuario no encontrado.");
  return user;
}
