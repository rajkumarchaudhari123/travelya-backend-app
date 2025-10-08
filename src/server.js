import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import driverRoutes from "./routes/driverRoutes.js";
import riderRoutes from "./routes/riderRoutes.js";

// Load environment variables from .env
dotenv.config();

const app = express();
const prisma = new PrismaClient();

// CORS setup
const corsOptions = {
  origin: [process.env.CORS_ORIGIN, process.env.CORS_ORIGIN_ADMIN, "http://localhost:8081", "http://10.0.2.2:8081"],
  methods: "GET,POST",
  credentials: true,
};

app.use(cors(corsOptions));  // Enable CORS for specified origins
app.use(express.json()); // Parse incoming JSON requests

// Health check endpoint to test DB connection
app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`; // Test DB connection
    res.json({ ok: true, db: "connected" });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Register driver route - FIXED: Mount at /api/driver
app.use('/api/driver', driverRoutes);
app.use('/api/rider', riderRoutes);

// Register rider route - FIXED: Mount at /api/rider

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
  console.log(`📍 Local access: http://localhost:${PORT}`);
  console.log(`📍 Network access: http://10.91.185.195:${PORT}`);
});