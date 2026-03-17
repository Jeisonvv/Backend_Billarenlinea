// GET /users/:id/conversation-state
export async function getConversationStateByUserId(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const channel = typeof req.query.channel === "string" ? req.query.channel : "WHATSAPP";
    if (typeof id !== "string") {
      return res.status(400).json({ ok: false, message: "Parámetro inválido." });
    }
    const user = await getUserByIdService(id);
    if (!user) return res.status(404).json({ ok: false, message: "Usuario no encontrado." });
    // Buscar el estado del canal solicitado
    const state = (user.conversationStates || []).find((s: any) => s.channel === channel);
    if (!state) {
      return res.status(404).json({ ok: false, message: `No hay estado para el canal ${channel}` });
    }
    return res.json({ ok: true, data: state });
  } catch (error: any) {
    return res.status(500).json({ ok: false, message: error.message });
  }
}
/**
 * controllers/user.controller.ts — HTTP handlers de usuarios
 *
 * Responsabilidad única: recibir la petición HTTP, extraer parámetros
 * y delegar toda la lógica al user.service. No contiene consultas
 * a la base de datos directamente.
 *
 * Endpoints:
 *   POST   /api/users          → createUser
 *   GET    /api/users          → getUsers
 *   GET    /api/users/:id      → getUserById
 *   PATCH  /api/users/:id      → updateUser
 *   DELETE /api/users/:id      → deleteUser
 */
import type { Request, Response } from "express";
import {
  createAdminUserService,
  listUsersService,
  getUserByIdService,
  getUserByPhoneService,
  updateUserService,
  deleteUserService,
  getUserByProviderService,
  updateConversationStateService,
} from "../services/user.service.ts";

function getDuplicateUserMessage(field?: string) {
  switch (field) {
    case "identityDocument":
      return "Este documento de identidad ya está registrado.";
    case "phone":
      return "Este teléfono ya está registrado.";
    case "email":
      return "Este email ya está registrado.";
    default:
      return "Este usuario ya existe. Usa el _id del jugador existente para no duplicarlo.";
  }
}

function getDuplicateUserMessageFromMongo(error: any) {
  if (error?.keyPattern?.identityDocument) {
    return "Este documento de identidad ya está registrado.";
  }

  if (error?.keyPattern?.phone) {
    return "Este teléfono ya está registrado.";
  }

  if (error?.keyPattern?.["webAuth.email"]) {
    return "Este email ya está registrado.";
  }

  return "Este usuario ya existe. Usa el _id del jugador existente para no duplicarlo.";
}
// ─────────────────────────────────────────────────────────────────────────────
// GET /users/by-provider/:provider/:providerId
// ─────────────────────────────────────────────────────────────────────────────
export async function getUserByProvider(req: Request, res: Response) {
  try {
    const { provider, providerId } = req.params;
    if (typeof provider !== "string" || typeof providerId !== "string") {
      return res.status(400).json({ ok: false, message: "Parámetros inválidos." });
    }
    const user = await getUserByProviderService(provider, providerId);
    if (!user) return res.status(404).json({ ok: false, message: "Usuario no encontrado." });
    res.json({ ok: true, data: user });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /users/:id/conversation-state
// ─────────────────────────────────────────────────────────────────────────────
export async function updateConversationState(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (typeof id !== "string") {
      return res.status(400).json({ ok: false, message: "Parámetro inválido." });
    }
    const user = await updateConversationStateService(id, req.body);
    res.json({ ok: true, data: user });
  } catch (error: any) {
    res.status(400).json({ ok: false, message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /users
// ─────────────────────────────────────────────────────────────────────────────
export async function createUser(req: Request, res: Response) {
  try {
    const result = await createAdminUserService(req.body);
    res.status(201).json({
      ok: true,
      data: result.user,
      ...(result.requiresPasswordSetup !== undefined && { requiresPasswordSetup: result.requiresPasswordSetup }),
      ...(result.onboarding && { onboarding: result.onboarding }),
    });
  } catch (error: any) {
    if (error.message === "No se permite enviar passwordHash manualmente desde este endpoint. Usa activación temporal.") {
      res.status(400).json({ ok: false, message: error.message });
      return;
    }

    if (error.message === "Este usuario ya existe.") {
      res.status(409).json({
        ok: false,
        message: getDuplicateUserMessage(error.duplicateField),
        existingUser: error.existingUser,
      });
      return;
    }

    if (error.code === 11000) {
      res.status(409).json({
        ok: false,
        message: getDuplicateUserMessageFromMongo(error),
      });
      return;
    }

    res.status(400).json({ ok: false, message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /users
// ─────────────────────────────────────────────────────────────────────────────
export async function getUsers(req: Request, res: Response) {
  try {
    const { status, role, playerCategory, search, page = "1", limit = "20" } = req.query;
    const { users, total } = await listUsersService({
      ...(status         !== undefined && { status:         status as string }),
      ...(role           !== undefined && { role:           role as string }),
      ...(playerCategory !== undefined && { playerCategory: playerCategory as string }),
      ...(search         !== undefined && { search:         search as string }),
      page:  Number(page),
      limit: Number(limit),
    });
    res.json({ ok: true, data: users, pagination: { total, page: Number(page), limit: Number(limit) } });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /users/by-phone/:phone
// ─────────────────────────────────────────────────────────────────────────────
export async function getUserByPhone(req: Request, res: Response) {
  try {
    const { phone } = req.params;
    if (typeof phone !== "string") {
      return res.status(400).json({ ok: false, message: "Parámetro inválido." });
    }
    const user = await getUserByPhoneService(phone);
    res.json({ ok: true, data: user });
  } catch (error: any) {
    res.status(404).json({ ok: false, message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /users/:id
// ─────────────────────────────────────────────────────────────────────────────
export async function getUserById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (typeof id !== "string") {
      return res.status(400).json({ ok: false, message: "Parámetro inválido." });
    }
    const user = await getUserByIdService(id);
    res.json({ ok: true, data: user });
  } catch (error: any) {
    const status = error.message === "Usuario no encontrado." ? 404 : 500;
    res.status(status).json({ ok: false, message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /users/:id
// ─────────────────────────────────────────────────────────────────────────────
export async function updateUser(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (typeof id !== "string") {
      return res.status(400).json({ ok: false, message: "Parámetro inválido." });
    }
    const user = await updateUserService({ id, data: req.body });
    res.json({ ok: true, data: user });
  } catch (error: any) {
    if (error.message === "Este usuario ya existe.") {
      res.status(409).json({
        ok: false,
        message: getDuplicateUserMessage(error.duplicateField),
        existingUser: error.existingUser,
      });
      return;
    }

    if (error.code === 11000) {
      res.status(409).json({ ok: false, message: getDuplicateUserMessageFromMongo(error) });
      return;
    }

    const status = error.message === "Usuario no encontrado." ? 404 : 400;
    res.status(status).json({ ok: false, message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /users/:id  (soft delete)
// ─────────────────────────────────────────────────────────────────────────────
export async function deleteUser(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (typeof id !== "string") {
      return res.status(400).json({ ok: false, message: "Parámetro inválido." });
    }
    await deleteUserService(id);
    res.json({ ok: true, message: "Usuario eliminado (soft delete)." });
  } catch (error: any) {
    const status = error.message === "Usuario no encontrado." ? 404 : 500;
    res.status(status).json({ ok: false, message: error.message });
  }
}
