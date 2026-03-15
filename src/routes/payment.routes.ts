import { Router } from "express";
import { handleWompiWebhookHandler } from "../controllers/payment.controller.ts";

const router = Router();

router.post("/wompi/webhook", handleWompiWebhookHandler);

export default router;