// server.js (Fixed)
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { createServer } from 'http';
import driverRoutes from "./routes/driverRoutes.js";
import riderRoutes from "./routes/riderRoutes.js";
import destinationSearchRoutes from "./routes/destinationSearchRoutes.js";
import driverNotificationRoutes from "./routes/driverNotificationRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import socketRoutes from "./routes/socketRoutes.js";
import { setupSocketServer } from "./socketServer.js";

dotenv.config();

const app = express();
const server = createServer(app);
const prisma = new PrismaClient();

// ✅ CORS setup
const corsOptions = {
  origin: [
    process.env.CORS_ORIGIN,
    process.env.CORS_ORIGIN_ADMIN,
    "http://localhost:8081",
    "http://10.0.2.2:8081",
    "http://localhost:10000",
    "exp://your-app-url"
  ],
  methods: "GET,POST,PUT,DELETE",
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// ✅ Setup Socket.io server
setupSocketServer(server);

// ✅ Health check route
app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ 
      ok: true, 
      db: "connected",
      server: "running",
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ 
      ok: false, 
      error: String(e) 
    });
  }
});

// ✅ Socket.io health check
app.get("/socket-health", (req, res) => {
  res.json({
    ok: true,
    socket: "running",
    timestamp: new Date().toISOString()
  });
});

// ✅ Register routes
app.use("/api/driver", driverRoutes);
app.use("/api/rider", riderRoutes);
app.use("/api/destination-search", destinationSearchRoutes);
app.use("/api/driver-notifications", driverNotificationRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/socket", socketRoutes);

// ✅ Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// ✅ FIXED: 404 handler - Remove the wildcard issue
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// ✅ Start server
const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ HTTP Server running on http://10.184.209.195:${PORT}`);
  console.log(`✅ Socket Server running on ws://10.184.209.195:${PORT}`);
  console.log(`📍 Local access: http://localhost:${PORT}`);
  console.log(`🔌 Socket endpoint: ws://localhost:${PORT}`);
});