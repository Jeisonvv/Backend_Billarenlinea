import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 587);
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const MAIL_FROM = process.env.MAIL_FROM;

export function isMailConfigured() {
  return Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && MAIL_FROM);
}

function getTransporter() {
  if (!isMailConfigured()) {
    throw new Error("El servicio de correo no está configurado.");
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

interface SendPasswordResetEmailParams {
  to: string;
  name?: string | undefined;
  resetUrl: string;
  expiresAt: Date;
}

export async function sendPasswordResetEmail(params: SendPasswordResetEmailParams) {
  const transporter = getTransporter();
  const expirationText = new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(params.expiresAt);

  const recipientName = params.name?.trim() || "Hola";

  await transporter.sendMail({
    from: MAIL_FROM,
    to: params.to,
    subject: "Recupera tu contraseña",
    text:
      `${recipientName},\n\n` +
      "Recibimos una solicitud para restablecer tu contraseña.\n" +
      `Abre este enlace para continuar: ${params.resetUrl}\n\n` +
      `Este enlace vence el ${expirationText}.\n\n` +
      "Si no solicitaste este cambio, puedes ignorar este correo.",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 560px; margin: 0 auto;">
        <h2 style="margin-bottom: 16px; color: #111827;">Recupera tu contraseña</h2>
        <p>${recipientName},</p>
        <p>Recibimos una solicitud para restablecer tu contraseña en Billar en Línea.</p>
        <p style="margin: 24px 0;">
          <a
            href="${params.resetUrl}"
            style="display: inline-block; padding: 12px 20px; background: #111827; color: #ffffff; text-decoration: none; border-radius: 8px;"
          >Restablecer contraseña</a>
        </p>
        <p>Si el botón no abre, copia y pega este enlace en tu navegador:</p>
        <p><a href="${params.resetUrl}">${params.resetUrl}</a></p>
        <p>Este enlace vence el ${expirationText}.</p>
        <p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
      </div>
    `,
  });
}