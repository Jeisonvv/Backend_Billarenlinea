
import TransmissionRequest from "../models/transmission-request.model.ts";

export async function findAllTransmissions() {
  return TransmissionRequest.find().sort({ createdAt: -1 });
}

export async function findTransmissionById(id: string) {
  return TransmissionRequest.findById(id);
}

export async function createTransmissionService(data: any) {
  return TransmissionRequest.create(data);
}

export async function updateTransmissionService(id: string, data: any) {
  return TransmissionRequest.findByIdAndUpdate(id, data, { new: true });
}

export async function deleteTransmissionService(id: string) {
  return TransmissionRequest.findByIdAndDelete(id);
}
