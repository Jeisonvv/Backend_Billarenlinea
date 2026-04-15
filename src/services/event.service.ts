import mongoose from "mongoose";
import Event from "../models/event.model.js";
import {
  EventRegistrationMode,
  EventStatus,
  EventTicketingMode,
} from "../models/enums.js";

export interface ListEventsParams {
  status?: string;
  type?: string;
  tier?: string;
  featured?: boolean;
  page: number;
  limit: number;
}

function buildListFilter(params: ListEventsParams) {
  const filter: Record<string, unknown> = {
    status: { $in: [EventStatus.SCHEDULED, EventStatus.LIVE, EventStatus.FINISHED] },
  };

  if (params.status) {
    filter.status = params.status;
  }

  if (params.type) {
    filter.type = params.type;
  }

  if (params.tier) {
    filter.tier = params.tier;
  }

  if (params.featured !== undefined) {
    filter.featured = params.featured;
  }

  return filter;
}

function validateEventDates(data: Record<string, unknown>) {
  const startDate = data.startDate ? new Date(data.startDate as string) : undefined;
  const endDate = data.endDate ? new Date(data.endDate as string) : undefined;

  if (!startDate || Number.isNaN(startDate.getTime())) {
    throw new Error("La fecha de inicio es obligatoria y debe ser válida.");
  }

  if (endDate && Number.isNaN(endDate.getTime())) {
    throw new Error("La fecha de finalización debe ser válida.");
  }

  if (endDate && endDate < startDate) {
    throw new Error("La fecha de finalización no puede ser menor que la fecha de inicio.");
  }
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function validateEventBusinessRules(data: Record<string, unknown>) {
  const entryFee = data.entryFee !== undefined ? Number(data.entryFee) : undefined;
  const ticketPrice = data.ticketPrice !== undefined ? Number(data.ticketPrice) : undefined;
  const registrationMode = data.registrationMode as EventRegistrationMode | undefined;
  const ticketingMode = data.ticketingMode as EventTicketingMode | undefined;
  const registrationUrl = normalizeOptionalString(data.registrationUrl);
  const ticketUrl = normalizeOptionalString(data.ticketUrl);
  const hasGrandstand = data.hasGrandstand === true;

  if (entryFee !== undefined && (Number.isNaN(entryFee) || entryFee < 0)) {
    throw new Error("El valor de inscripción debe ser un número mayor o igual a 0.");
  }

  if (ticketPrice !== undefined && (Number.isNaN(ticketPrice) || ticketPrice < 0)) {
    throw new Error("El valor de la boletería debe ser un número mayor o igual a 0.");
  }

  if (registrationMode === EventRegistrationMode.EXTERNAL_LINK && !registrationUrl) {
    throw new Error("Si la inscripción es por enlace externo, debes enviar registrationUrl.");
  }

  if (ticketingMode === EventTicketingMode.EXTERNAL_LINK && !ticketUrl) {
    throw new Error("Si la boletería es por enlace externo, debes enviar ticketUrl.");
  }

  if (ticketingMode === EventTicketingMode.INTERNAL && !hasGrandstand) {
    throw new Error("No puedes vender boletería si el evento no tiene palco o zona para espectadores.");
  }

  if (ticketPrice !== undefined && !hasGrandstand) {
    throw new Error("No puedes definir valor de boletería si el evento no tiene palco o zona para espectadores.");
  }
}

export async function createEventService(data: Record<string, unknown>, createdBy: string) {
  validateEventDates(data);
  validateEventBusinessRules(data);

  return Event.create({
    ...data,
    createdBy: new mongoose.Types.ObjectId(createdBy),
  });
}

export async function listEventsService(params: ListEventsParams) {
  const { page, limit } = params;
  const filter = buildListFilter(params);
  const skip = (page - 1) * limit;

  const [events, total] = await Promise.all([
    Event.find(filter)
      .populate("createdBy", "name role")
      .sort({ featured: -1, startDate: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Event.countDocuments(filter),
  ]);

  return { events, total };
}

export async function getEventByIdService(id: string) {
  const event = await Event.findById(id)
    .populate("createdBy", "name role")
    .lean();

  if (!event) {
    throw new Error("Evento no encontrado.");
  }

  return event;
}

export async function updateEventService(id: string, data: Record<string, unknown>) {
  const existing = await Event.findById(id);
  if (!existing) {
    throw new Error("Evento no encontrado.");
  }

  const mergedData = {
    startDate: data.startDate ?? existing.startDate,
    endDate: data.endDate ?? existing.endDate,
    entryFee: data.entryFee ?? existing.entryFee,
    registrationMode: data.registrationMode ?? existing.registrationMode,
    registrationUrl: data.registrationUrl ?? existing.registrationUrl,
    hasGrandstand: data.hasGrandstand ?? existing.hasGrandstand,
    ticketingMode: data.ticketingMode ?? existing.ticketingMode,
    ticketPrice: data.ticketPrice ?? existing.ticketPrice,
    ticketUrl: data.ticketUrl ?? existing.ticketUrl,
  };

  validateEventDates(mergedData);
  validateEventBusinessRules(mergedData);

  return Event.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true })
    .populate("createdBy", "name role");
}

export async function deleteEventService(id: string) {
  const event = await Event.findByIdAndDelete(id);
  if (!event) {
    throw new Error("Evento no encontrado.");
  }

  return event;
}