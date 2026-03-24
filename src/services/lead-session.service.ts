import LeadSession, {
  type ILeadSessionData,
  type ILeadSessionDocument,
} from "../models/lead-session.model.ts";
import User from "../models/user.model.ts";
import {
  Channel,
  LeadSessionStatus,
  type InterestType,
  UserRole,
  UserSource,
  UserStatus,
} from "../models/enums.ts";
import { createUserService } from "./user.service.ts";

interface EnsureLeadSessionParams {
  channel: string;
  providerId: string;
  currentState?: string;
  stateData?: Record<string, unknown>;
  leadData?: Partial<Record<keyof ILeadSessionData, unknown>>;
  qualified?: boolean;
}

interface UpdateLeadSessionStateParams {
  currentState: string;
  stateData?: Record<string, unknown>;
}

interface UpdateLeadSessionDataParams {
  leadData?: Partial<Record<keyof ILeadSessionData, unknown>>;
  qualified?: boolean;
  status?: string;
}

const DEFAULT_TTL_HOURS = Number(process.env.LEAD_SESSION_TTL_HOURS ?? 48);

function normalizeChannel(channel: string): Channel {
  if (!Object.values(Channel).includes(channel as Channel)) {
    throw new Error("Canal inválido.");
  }

  return channel as Channel;
}

function normalizeProviderId(providerId: string): string {
  const normalized = providerId?.trim();

  if (!normalized) {
    throw new Error("providerId es obligatorio.");
  }

  return normalized;
}

function normalizeStatus(status?: string): LeadSessionStatus | undefined {
  if (status === undefined) return undefined;
  if (!Object.values(LeadSessionStatus).includes(status as LeadSessionStatus)) {
    throw new Error("Estado de sesión temporal inválido.");
  }

  return status as LeadSessionStatus;
}

function buildExpirationDate(from = new Date()) {
  return new Date(from.getTime() + DEFAULT_TTL_HOURS * 60 * 60 * 1000);
}

function sanitizeOptionalString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const sanitized = value.trim();
  return sanitized || undefined;
}

function normalizeInterestType(value: unknown): InterestType | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error("interestType inválido.");
  }

  return value as InterestType;
}

function normalizeLeadData(
  leadData?: Partial<Record<keyof ILeadSessionData, unknown>>,
): Partial<ILeadSessionData> {
  if (!leadData) return {};

  const normalized: Partial<ILeadSessionData> = {};

  const name = sanitizeOptionalString(leadData.name);
  if (name !== undefined) normalized.name = name;

  const phone = sanitizeOptionalString(leadData.phone);
  if (phone !== undefined) normalized.phone = phone;

  const city = sanitizeOptionalString(leadData.city);
  if (city !== undefined) normalized.city = city;

  const businessName = sanitizeOptionalString(leadData.businessName);
  if (businessName !== undefined) normalized.businessName = businessName;

  const interestType = normalizeInterestType(leadData.interestType);
  if (interestType !== undefined) normalized.interestType = interestType;

  if (leadData.extraData !== undefined) {
    if (typeof leadData.extraData !== "object" || leadData.extraData === null || Array.isArray(leadData.extraData)) {
      throw new Error("extraData debe ser un objeto.");
    }

    normalized.extraData = new Map(Object.entries(leadData.extraData as Record<string, unknown>));
  }

  return normalized;
}

function getLeadDataSnapshot(session: ILeadSessionDocument): ILeadSessionData {
  return {
    ...(session.leadData ?? {}),
  };
}

function channelToUserSource(channel: Channel): UserSource {
  switch (channel) {
    case Channel.WEB:
      return UserSource.WEB;
    case Channel.INSTAGRAM:
      return UserSource.INSTAGRAM;
    case Channel.FACEBOOK:
      return UserSource.FACEBOOK;
    case Channel.WHATSAPP:
    default:
      return UserSource.WHATSAPP;
  }
}

function touchSession(session: ILeadSessionDocument) {
  session.lastSeenAt = new Date();
  session.expiresAt = buildExpirationDate(session.lastSeenAt);

  if (session.status === LeadSessionStatus.EXPIRED || session.status === LeadSessionStatus.ABANDONED) {
    session.status = LeadSessionStatus.ACTIVE;
  }
}

async function getOrCreateLeadSessionDocument(
  channel: Channel,
  providerId: string,
): Promise<{ session: ILeadSessionDocument; created: boolean }> {
  let session = await LeadSession.findOne({ channel, providerId });

  if (session) {
    return { session, created: false };
  }

  session = await LeadSession.create({
    channel,
    providerId,
    currentState: "IDLE",
    stateData: {},
    leadData: {},
    status: LeadSessionStatus.ACTIVE,
    qualified: false,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    expiresAt: buildExpirationDate(),
  });

  return { session, created: true };
}

export async function ensureLeadSessionService(params: EnsureLeadSessionParams) {
  const channel = normalizeChannel(params.channel);
  const providerId = normalizeProviderId(params.providerId);
  const { session, created } = await getOrCreateLeadSessionDocument(channel, providerId);

  if (params.currentState) {
    session.currentState = params.currentState.trim() || "IDLE";
  }

  if (params.stateData !== undefined) {
    session.stateData = new Map(Object.entries(params.stateData));
  }

  if (params.leadData) {
    const normalizedLeadData = normalizeLeadData(params.leadData);
    session.leadData = {
      ...getLeadDataSnapshot(session),
      ...normalizedLeadData,
    } as ILeadSessionData;
  }

  if (typeof params.qualified === "boolean") {
    session.qualified = params.qualified;
    session.status = params.qualified ? LeadSessionStatus.QUALIFIED : session.status;
  }

  touchSession(session);
  await session.save();

  return { session: session.toObject(), created };
}

export async function getLeadSessionService(channelParam: string, providerIdParam: string) {
  const channel = normalizeChannel(channelParam);
  const providerId = normalizeProviderId(providerIdParam);

  return LeadSession.findOne({ channel, providerId }).lean();
}

export async function upsertLeadSessionStateService(
  channelParam: string,
  providerIdParam: string,
  params: UpdateLeadSessionStateParams,
) {
  const channel = normalizeChannel(channelParam);
  const providerId = normalizeProviderId(providerIdParam);

  if (typeof params.currentState !== "string" || !params.currentState.trim()) {
    throw new Error("currentState es obligatorio.");
  }

  const { session } = await getOrCreateLeadSessionDocument(channel, providerId);
  session.currentState = params.currentState.trim();
  session.stateData = new Map(Object.entries(params.stateData ?? {}));
  touchSession(session);
  await session.save();

  return session.toObject();
}

export async function updateLeadSessionDataService(
  channelParam: string,
  providerIdParam: string,
  params: UpdateLeadSessionDataParams,
) {
  const channel = normalizeChannel(channelParam);
  const providerId = normalizeProviderId(providerIdParam);
  const { session } = await getOrCreateLeadSessionDocument(channel, providerId);
  const normalizedLeadData = normalizeLeadData(params.leadData);

  session.leadData = {
    ...getLeadDataSnapshot(session),
    ...normalizedLeadData,
  } as ILeadSessionData;

  if (typeof params.qualified === "boolean") {
    session.qualified = params.qualified;
  }

  const nextStatus = normalizeStatus(params.status);
  if (nextStatus) {
    session.status = nextStatus;
  } else if (session.qualified) {
    session.status = LeadSessionStatus.QUALIFIED;
  }

  touchSession(session);
  await session.save();

  return session.toObject();
}

function buildCreateUserPayload(session: ILeadSessionDocument) {
  const leadData = getLeadDataSnapshot(session);
  const interestType = leadData.interestType;
  const now = new Date();

  return {
    identities: [{ provider: session.channel, providerId: session.providerId }],
    source: channelToUserSource(session.channel),
    status: session.qualified || interestType ? UserStatus.INTERESTED : UserStatus.NEW,
    role: UserRole.CUSTOMER,
    ...(leadData.name && { name: leadData.name }),
    ...(leadData.phone && { phone: leadData.phone }),
    lastInteractionAt: now,
    lastInteractionChannel: session.channel,
    ...(interestType && {
      interests: [{
        type: interestType,
        count: 1,
        lastInteraction: now,
        channel: session.channel,
      }],
    }),
  };
}

async function applySessionDataToUser(user: any, session: ILeadSessionDocument) {
  const leadData = getLeadDataSnapshot(session);

  if (leadData.name) {
    user.name = leadData.name;
  }

  if (leadData.phone) {
    user.phone = leadData.phone;
  }

  user.lastInteractionAt = new Date();
  user.lastInteractionChannel = session.channel;

  const hasIdentity = user.identities?.some(
    (identity: { provider?: string; providerId?: string }) => (
      identity.provider === session.channel && identity.providerId === session.providerId
    ),
  );

  if (!hasIdentity) {
    user.identities.push({ provider: session.channel, providerId: session.providerId });
  }

  if (leadData.interestType) {
    user.registerInterest(leadData.interestType, session.channel);
  }

  if (session.qualified && user.status === UserStatus.NEW) {
    user.status = UserStatus.INTERESTED;
  }

  await user.save();
}

export async function promoteLeadSessionService(channelParam: string, providerIdParam: string) {
  const channel = normalizeChannel(channelParam);
  const providerId = normalizeProviderId(providerIdParam);
  const session = await LeadSession.findOne({ channel, providerId });

  if (!session) {
    throw new Error("Sesión temporal no encontrada.");
  }

  const existingUser = session.persistedUserId
    ? await User.findById(session.persistedUserId)
    : await User.findByIdentity(channel, providerId);

  let user;

  if (existingUser) {
    await applySessionDataToUser(existingUser, session);
    user = existingUser;
  } else {
    user = await createUserService(buildCreateUserPayload(session));
  }

  session.persistedUserId = user._id;
  session.qualified = true;
  session.status = LeadSessionStatus.PROMOTED;
  touchSession(session);
  await session.save();

  return {
    session: session.toObject(),
    user: user.toObject ? user.toObject() : user,
  };
}