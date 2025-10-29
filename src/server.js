import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import driverRoutes from "./routes/driverRoutes.js";
import riderRoutes from "./routes/riderRoutes.js";
import destinationSearchRoutes from "./routes/destinationSearchRoutes.js"; // ✅ New import
import driverNotificationRoutes from "./routes/driverNotificationRoutes.js"; // ✅ New import
import bookingRoutes from "./routes/bookingRoutes.js";

dotenv.config();

const app = express();
const prisma = new PrismaClient();

// ✅ CORS setup
const corsOptions = {
  origin: [
    process.env.CORS_ORIGIN,
    process.env.CORS_ORIGIN_ADMIN,
    "http://localhost:8081",
    "http://10.0.2.2:8081",
  ],
  methods: "GET,POST",
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// ✅ Health check route
app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: "connected" });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ✅ Register routes
app.use("/api/driver", driverRoutes);
app.use("/api/rider", riderRoutes);
app.use("/api/destination-search", destinationSearchRoutes); // ✅ New route added
app.use("/api/driver-notifications", driverNotificationRoutes); 
app.use("/api/bookings", bookingRoutes);
// ✅ Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on http://10.184.209.195:${PORT}`);
  console.log(`📍 Local access: http://localhost:${PORT}`);
});
