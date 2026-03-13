import type { Request, Response } from "express";
import {
  findAllTransmissions,
  findTransmissionById,
  createTransmissionService,
  updateTransmissionService,
  deleteTransmissionService,
} from "../services/transmission.service.ts";

// Obtener todas las solicitudes de transmisión
export async function getTransmissions(req: Request, res: Response) {
  try {
    const requests = await findAllTransmissions();
    res.json({ ok: true, requests });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error.message || "Error al obtener solicitudes de transmisión" });
  }
}

// Obtener una solicitud de transmisión por ID
export async function getTransmission(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id || Array.isArray(id)) {
      return res.status(400).json({ ok: false, message: "ID de solicitud inválido" });
    }
    const request = await findTransmissionById(id);
    if (!request) return res.status(404).json({ ok: false, message: "Solicitud de transmisión no encontrada" });
    res.json({ ok: true, request });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error.message || "Error al obtener solicitud de transmisión" });
  }
}

// Crear una nueva solicitud de transmisión
export async function createTransmission(req: Request, res: Response) {
  try {
    const data = req.body;
    const request = await createTransmissionService(data);
    res.status(201).json({ ok: true, request });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error.message || "Error al crear solicitud de transmisión" });
  }
}

// Actualizar una solicitud de transmisión
export async function updateTransmission(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id || Array.isArray(id)) {
      return res.status(400).json({ ok: false, message: "ID de solicitud inválido" });
    }
    const data = req.body;
    const request = await updateTransmissionService(id, data);
    if (!request) return res.status(404).json({ ok: false, message: "Solicitud de transmisión no encontrada" });
    res.json({ ok: true, request });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error.message || "Error al actualizar solicitud de transmisión" });
  }
}

// Eliminar una solicitud de transmisión
export async function deleteTransmission(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id || Array.isArray(id)) {
      return res.status(400).json({ ok: false, message: "ID de solicitud inválido" });
    }
    const request = await deleteTransmissionService(id);
    if (!request) return res.status(404).json({ ok: false, message: "Solicitud de transmisión no encontrada" });
    res.json({ ok: true, message: "Solicitud de transmisión eliminada" });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error.message || "Error al eliminar solicitud de transmisión" });
  }
}
