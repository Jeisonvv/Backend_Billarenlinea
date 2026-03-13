/**
 * types/express.d.ts — Extensión del tipo Request de Express
 *
 * Agrega la propiedad `user` al objeto Request para que TypeScript
 * no se queje cuando el middleware de auth la inyecta.
 */
import { UserRole } from "../models/enums.ts";

declare global {
  namespace Express {
    interface Request {
      /** Usuario autenticado, disponible después del middleware requireAuth */
      user?: {
        id: string;
        role: UserRole;
      };
    }
  }
}
