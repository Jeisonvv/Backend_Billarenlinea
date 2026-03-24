/**
 * app.ts — Punto de entrada del servidor Express
 *
 * Responsabilidades:
 *   1. Carga variables de entorno (.env)
 *   2. Configura middlewares de seguridad (Helmet, CORS, Rate Limit, Mongo Sanitize)
 *   3. Configura middlewares globales (JSON, Morgan)
 *   4. Conecta a MongoDB
 *   5. Registra todas las rutas bajo /api
 *   6. Manejo global de errores
 *   7. Levanta el servidor HTTP en el puerto configurado
 */
import dotenv from 'dotenv';
// Cargar variables de entorno PRIMERO antes de importar cualquier otra cosa
dotenv.config();

import express, { type Application, type Request, type Response } from 'express';
import morgan from 'morgan';
import cors from 'cors';
import helmet from 'helmet';
import { sanitize as mongoSanitize } from 'express-mongo-sanitize';
import { connectDB } from './db/connection.ts';
import tournamentRoutes from './routes/tournament.routes.ts';
import matchRoutes from './routes/match.routes.ts';
import userRoutes from './routes/user.routes.ts';
import leadSessionRoutes from './routes/lead-session.routes.ts';
import authRoutes from './routes/auth.routes.ts';
import transmissionRoutes from './routes/transmission.routes.ts';
import raffleRoutes from './routes/raffle.routes.ts';
import paymentRoutes from './routes/payment.routes.ts';
import { generalLimiter } from './middlewares/rateLimiter.middleware.ts';
import { errorHandler } from './middlewares/errorHandler.middleware.ts';

const app: Application = express();

// ── Seguridad: cabeceras HTTP ───────────────────────────────────────────────
// Helmet agrega ~14 cabeceras de seguridad (X-Frame-Options, CSP, HSTS, etc.)
app.use(helmet());

// ── Seguridad: CORS ────────────────────────────────────────────────────────
// Solo permite peticiones desde orígenes autorizados
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Permitir peticiones sin origen (Postman, curl, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`Origen no permitido por CORS: ${origin}`));
  },
  credentials: true,
}));

// ── Seguridad: Rate Limiting general ───────────────────────────────────────
// 100 peticiones por IP cada 15 minutos (las rutas de auth tienen su propio límite)
app.use('/api', generalLimiter);

// ── Parseo de body ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' })); // Limita tamaño del body para prevenir ataques DoS
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ── Seguridad: sanitización MongoDB ────────────────────────────────────────
// Express 5 convierte req.query en getter de solo lectura, por lo que el
// middleware estándar de express-mongo-sanitize falla al intentar reasignarlo.
// Solución: llamar sanitize() manualmente solo en body y params.
app.use((req, _res, next) => {
  if (req.body)   req.body   = mongoSanitize(req.body);
  if (req.params) req.params = mongoSanitize(req.params) as Record<string, string>;
  next();
});

// ── Logs de peticiones ──────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ── Conexión a MongoDB ──────────────────────────────────────────────────────
connectDB();

// ── Rutas ───────────────────────────────────────────────────────────────────
// Ruta raíz: health check para verificar que el servidor está vivo
app.get('/', (_req: Request, res: Response) => {
  res.json({ ok: true, message: 'API Billar en Línea funcionando 🎱' });
});

app.use('/api/auth',        authRoutes);       // Login y registro
app.use('/api/users',       userRoutes);       // CRUD de usuarios
app.use('/api/lead-sessions', leadSessionRoutes); // Sesiones temporales del bot
app.use('/api/tournaments', tournamentRoutes); // Torneos, grupos y brackets
app.use('/api/matches',     matchRoutes);      // Partidos y resultados
app.use('/api/transmissions', transmissionRoutes); // Transmisiones en vivo/eventos
app.use('/api/raffles',     raffleRoutes);     // Rifas, números y sorteos
app.use('/api/payments',    paymentRoutes);    // Integraciones de pago

// ── Manejo global de errores ────────────────────────────────────────────────
// DEBE ir ÚLTIMO, después de todas las rutas
app.use(errorHandler);

// ── Servidor ─────────────────────────────────────────────────────────────── 
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
