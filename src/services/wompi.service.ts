import { createHash } from "node:crypto";
import { PaymentProvider, PaymentTransactionStatus } from "../models/enums.js";

export interface WompiCustomerData {
  email: string;
  fullName?: string;
  phoneNumberPrefix?: string;
  phoneNumber?: string;
}

export interface WompiCheckoutRequest {
  reference: string;
  amountInCents: number;
  currency: string;
  expirationTime?: string;
  redirectUrl: string;
  customerData: WompiCustomerData;
}

export interface WompiEventPayload {
  event?: string;
  data?: {
    transaction?: {
      id?: string;
      reference?: string;
      status?: string;
      amount_in_cents?: number;
      payment_method_type?: string;
      customer_email?: string;
    };
  };
  signature?: {
    properties?: string[];
    checksum?: string;
  };
  timestamp?: number;
}

const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY?.trim();
const WOMPI_INTEGRITY_SECRET = process.env.WOMPI_INTEGRITY_SECRET?.trim();
const WOMPI_EVENTS_SECRET = process.env.WOMPI_EVENTS_SECRET?.trim();
const WOMPI_CHECKOUT_URL = "https://checkout.wompi.co/p/";
const WOMPI_WIDGET_URL = "https://checkout.wompi.co/widget.js";

export function requireWompiConfig() {
  if (!WOMPI_PUBLIC_KEY || !WOMPI_INTEGRITY_SECRET) {
    throw new Error("Wompi no está configurado. Revisa WOMPI_PUBLIC_KEY y WOMPI_INTEGRITY_SECRET.");
  }

  return {
    publicKey: WOMPI_PUBLIC_KEY,
    integritySecret: WOMPI_INTEGRITY_SECRET,
  };
}

export function getWompiRedirectUrl() {
  const explicit = process.env.WOMPI_REDIRECT_URL?.trim();
  if (explicit) return explicit;

  const frontend = process.env.FRONTEND_URL?.trim() ?? process.env.ALLOWED_ORIGINS?.split(",")[0]?.trim();
  if (!frontend) {
    throw new Error("No se encontró WOMPI_REDIRECT_URL ni FRONTEND_URL para redirección de pagos.");
  }

  return new URL("/payments/wompi", frontend).toString();
}

export function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function buildIntegritySignature(reference: string, amountInCents: number, currency: string, expirationTime?: string) {
  const { integritySecret } = requireWompiConfig();
  return sha256Hex(`${reference}${amountInCents}${currency}${expirationTime ?? ""}${integritySecret}`);
}

function getValueFromPath(data: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current && typeof current === "object" && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }

    return "";
  }, data);
}

export function createWompiCheckoutConfig(input: WompiCheckoutRequest) {
  const { publicKey } = requireWompiConfig();

  return {
    paymentProvider: PaymentProvider.WOMPI,
    reference: input.reference,
    amountInCents: input.amountInCents,
    currency: input.currency,
    redirectUrl: input.redirectUrl,
    checkoutUrl: WOMPI_CHECKOUT_URL,
    widgetUrl: WOMPI_WIDGET_URL,
    publicKey,
    ...(input.expirationTime ? { expirationTime: input.expirationTime } : {}),
    signature: {
      integrity: buildIntegritySignature(
        input.reference,
        input.amountInCents,
        input.currency,
        input.expirationTime,
      ),
    },
    customerData: input.customerData,
  };
}

export function normalizeWompiTransactionStatus(status?: string) {
  switch (status) {
    case PaymentTransactionStatus.APPROVED:
      return PaymentTransactionStatus.APPROVED;
    case PaymentTransactionStatus.DECLINED:
      return PaymentTransactionStatus.DECLINED;
    case PaymentTransactionStatus.VOIDED:
      return PaymentTransactionStatus.VOIDED;
    case PaymentTransactionStatus.ERROR:
      return PaymentTransactionStatus.ERROR;
    default:
      return PaymentTransactionStatus.PENDING;
  }
}
export function verifyWompiEvent(payload: WompiEventPayload, headerChecksum?: string | string[]) {
  if (!WOMPI_EVENTS_SECRET) {
    throw new Error("WOMPI_EVENTS_SECRET no está configurado.");
  }

  const properties = payload.signature?.properties ?? [];
  const checksum = (Array.isArray(headerChecksum) ? headerChecksum[0] : headerChecksum) ?? payload.signature?.checksum;
  if (!checksum) {
    throw new Error("El evento de Wompi no trae checksum.");
  }

  const baseData = (payload.data ?? {}) as Record<string, unknown>;
  const values = properties.map((property) => String(getValueFromPath(baseData, property))).join("");
  const calculated = sha256Hex(`${values}${payload.timestamp ?? ""}${WOMPI_EVENTS_SECRET}`).toUpperCase();

  return calculated === checksum.toUpperCase();
}
