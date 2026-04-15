import { Router } from "express";
import { handleWompiWebhookHandler } from "../controllers/payment.controller.js";

const router = Router();

router.post("/wompi/webhook", handleWompiWebhookHandler);

export default router;