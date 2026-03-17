import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
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
import User, { normalizeIdentityDocument } from "../models/user.model.ts";
import { Channel, UserRole, UserStatus } from "../models/enums.ts";
import { isMailConfigured, sendAccountSetupEmail } from "./mail.service.ts";

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

export interface CreateWebUserParams {
  name?: string;
  email?: string;
  password?: string;
  phone?: string;
  identityDocument?: string;
}

export interface CreateAdminUserResult {
  user: any;
  requiresPasswordSetup?: boolean;
  onboarding?: {
    email: string;
    resetUrl: string;
    expiresAt: Date;
    emailSent: boolean;
    resetToken?: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CAMPOS SENSIBLES EXCLUIDOS EN TODAS LAS RESPUESTAS
// ─────────────────────────────────────────────────────────────────────────────
const SAFE_SELECT = "-webAuth.passwordHash -webAuth.resetToken -webAuth.emailVerificationToken";

function normalizeEmail(email: string) {
  return email.toLowerCase().trim();
}

function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createResetToken() {
  const token = randomBytes(32).toString("hex");

  return {
    token,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60),
  };
}

function buildPasswordResetUrl(token: string) {
  const configuredBaseUrl = process.env.PASSWORD_RESET_URL_BASE?.trim();

  if (configuredBaseUrl) {
    const url = new URL(configuredBaseUrl);
    url.searchParams.set("token", token);
    return url.toString();
  }

  const frontendUrl = process.env.FRONTEND_URL?.trim() ?? process.env.ALLOWED_ORIGINS?.split(",")[0]?.trim();

  if (!frontendUrl) {
    throw new Error("No se encontró FRONTEND_URL o PASSWORD_RESET_URL_BASE para construir el link de activación.");
  }

  const url = new URL("/reset-password", frontendUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

function createDuplicateUserError(existingUser: unknown, duplicateField?: string) {
  const error = new Error("Este usuario ya existe.") as Error & {
    existingUser?: unknown;
    duplicateField?: string;
  };

  error.existingUser = existingUser;
  if (duplicateField) {
    error.duplicateField = duplicateField;
  }

  return error;
}

function getDuplicateField(
  existingUser: any,
  data: Record<string, unknown>,
) {
  const identityDocument = data.identityDocument as string | undefined;
  const phone = data.phone as string | undefined;
  const webEmail = (data.webAuth as { email?: string } | undefined)?.email;
  const identities = data.identities as Array<{ provider: string; providerId: string }> | undefined;

  if (identityDocument && existingUser.identityDocument === identityDocument) {
    return "identityDocument";
  }

  if (webEmail && existingUser.webAuth?.email === webEmail) {
    return "email";
  }

  if (phone && existingUser.phone === phone) {
    return "phone";
  }

  if (identities?.some((identity) => existingUser.identities?.some(
    (existingIdentity: { provider?: string; providerId?: string }) => (
      existingIdentity.provider === identity.provider
      && existingIdentity.providerId === identity.providerId
    ),
  ))) {
    return "identity";
  }

  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICIOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea un nuevo usuario.
 * Si ya existe un usuario con el mismo teléfono o identidad de WhatsApp,
 * lanza un error descriptivo e incluye el usuario existente.
 */
export async function createUserService(data: Record<string, unknown>) {
  const normalizedData = { ...data };

  if (typeof normalizedData.phone === "string") {
    normalizedData.phone = normalizedData.phone.trim();
  }

  if ("identityDocument" in normalizedData) {
    const normalizedIdentityDocument = normalizeIdentityDocument(normalizedData.identityDocument as string | undefined);
    if ((normalizedData.identityDocument as string | undefined) && !normalizedIdentityDocument) {
      throw new Error("El documento de identidad es inválido.");
    }

    normalizedData.identityDocument = normalizedIdentityDocument;
  }

  // Verificar duplicado por phone
  const phone = normalizedData.phone as string | undefined;
  const identities = normalizedData.identities as Array<{ provider: string; providerId: string }> | undefined;
  const identityDocument = normalizedData.identityDocument as string | undefined;
  const webEmail = typeof (normalizedData.webAuth as { email?: string } | undefined)?.email === "string"
    ? normalizeEmail((normalizedData.webAuth as { email?: string }).email as string)
    : undefined;

  if (webEmail) {
    normalizedData.webAuth = {
      ...((normalizedData.webAuth as Record<string, unknown> | undefined) ?? {}),
      email: webEmail,
    };
  }

  const orConditions: object[] = [];
  if (phone) orConditions.push({ phone });
  if (identityDocument) orConditions.push({ identityDocument });
  if (webEmail) orConditions.push({ "webAuth.email": webEmail });
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
      throw createDuplicateUserError(existing, getDuplicateField(existing, normalizedData));
    }
  }

  return User.create(normalizedData);
}

export async function createWebUserService(params: CreateWebUserParams) {
  const { name, email, password, phone, identityDocument } = params;

  if (!name || !email || !password) {
    throw new Error("name, email y password son obligatorios.");
  }

  if (password.length < 8) {
    throw new Error("La contraseña debe tener al menos 8 caracteres.");
  }

  const normalizedEmail = normalizeEmail(email);
  const passwordHash = await bcrypt.hash(password, 12);

  return createUserService({
    name: name.trim(),
    phone,
    identityDocument,
    status: UserStatus.NEW,
    role: UserRole.CUSTOMER,
    identities: [{ provider: Channel.WEB, providerId: normalizedEmail }],
    webAuth: {
      email: normalizedEmail,
      passwordHash,
      emailVerified: false,
    },
  });
}

export async function createAdminUserService(data: Record<string, unknown>): Promise<CreateAdminUserResult> {
  const normalizedData = { ...data };
  const webAuth = (normalizedData.webAuth as Record<string, unknown> | undefined) ?? undefined;
  const rawEmail = typeof webAuth?.email === "string" ? webAuth.email : undefined;
  const normalizedEmail = rawEmail ? normalizeEmail(rawEmail) : undefined;
  const passwordHash = typeof webAuth?.passwordHash === "string" ? webAuth.passwordHash : undefined;

  let onboarding:
    | {
        email: string;
        resetUrl: string;
        expiresAt: Date;
        emailSent: boolean;
        resetToken?: string;
      }
    | undefined;

  if (passwordHash) {
    throw new Error("No se permite enviar passwordHash manualmente desde este endpoint. Usa activación temporal.");
  }

  if (normalizedEmail) {
    const identities = Array.isArray(normalizedData.identities)
      ? [...(normalizedData.identities as Array<Record<string, unknown>>)]
      : [];

    const hasWebIdentity = identities.some((identity) => (
      identity.provider === Channel.WEB && identity.providerId === normalizedEmail
    ));

    if (!hasWebIdentity) {
      identities.push({ provider: Channel.WEB, providerId: normalizedEmail });
    }

    normalizedData.identities = identities;

    if (!passwordHash) {
      const { token, tokenHash, expiresAt } = createResetToken();
      const resetUrl = buildPasswordResetUrl(token);

      normalizedData.webAuth = {
        ...webAuth,
        email: normalizedEmail,
        emailVerified: false,
        resetToken: tokenHash,
        resetTokenExpiresAt: expiresAt,
      };

      onboarding = {
        email: normalizedEmail,
        resetUrl,
        expiresAt,
        emailSent: false,
      };

      if (isMailConfigured()) {
        await sendAccountSetupEmail({
          to: normalizedEmail,
          name: typeof normalizedData.name === "string" ? normalizedData.name : undefined,
          setupUrl: resetUrl,
          expiresAt,
        });
        onboarding.emailSent = true;
      } else if (process.env.NODE_ENV !== "production") {
        onboarding.resetToken = token;
      }
    }
  }

  const user = await createUserService(normalizedData);

  if (onboarding) {
    return { user, requiresPasswordSetup: true, onboarding };
  }

  return { user };
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
      { identityDocument: regex },
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

  if (typeof safeFields.phone === "string") {
    safeFields.phone = safeFields.phone.trim();

    if (safeFields.phone) {
      const existingUser = await User.findOne({
        _id: { $ne: params.id },
        phone: safeFields.phone,
        deletedAt: { $exists: false },
      })
        .select(SAFE_SELECT)
        .lean();

      if (existingUser) {
        throw createDuplicateUserError(existingUser, "phone");
      }
    }
  }

  if ("identityDocument" in safeFields) {
    const normalizedIdentityDocument = normalizeIdentityDocument(safeFields.identityDocument as string | undefined);
    if ((safeFields.identityDocument as string | undefined) && !normalizedIdentityDocument) {
      throw new Error("El documento de identidad es inválido.");
    }

    safeFields.identityDocument = normalizedIdentityDocument;

    if (normalizedIdentityDocument) {
      const existingUser = await User.findOne({
        _id: { $ne: params.id },
        identityDocument: normalizedIdentityDocument,
        deletedAt: { $exists: false },
      })
        .select(SAFE_SELECT)
        .lean();

      if (existingUser) {
        throw createDuplicateUserError(existingUser, "identityDocument");
      }
    }
  }

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
