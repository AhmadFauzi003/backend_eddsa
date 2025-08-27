const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");

// Import routes
const documentRoutes = require("./routes/documentRoutes");
const signatureRoutes = require("./routes/signatureRoutes");
const verificationRoutes = require("./routes/verificationRoutes");
const keyRoutes = require("./routes/keyRoutes");

// Import middleware
const errorHandler = require("./middleware/errorHandler");
const rateLimiter = require("./middleware/rateLimiter");

// Import config
const config = require("./config/config");

const app = express();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: config.ALLOWED_ORIGINS || ["http://localhost:3000"],
    credentials: true,
  })
);

// Logging middleware
app.use(morgan("combined"));

// Rate limiting - Apply general rate limiter globally
app.use(rateLimiter.general);

// Body parser middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Static files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/public", express.static(path.join(__dirname, "public")));

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "EdDSA Multi-Signature Document System is running",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// API routes
app.use("/api/documents", documentRoutes);
app.use("/api/signatures", signatureRoutes);
app.use("/api/verification", verificationRoutes);
app.use("/api/keys", keyRoutes);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "EdDSA Multi-Signature Document Verification System",
    description:
      "Sistem Tanda Tangan Digital berbasis EdDSA dengan Multi-Signature untuk Verifikasi Dokumen Akademik",
    author: "Ahmad Fauzi Saifuddin - 105841102021",
    university: "Universitas Muhammadiyah Makassar",
    endpoints: {
      health: "/health",
      documents: "/api/documents",
      signatures: "/api/signatures",
      verification: "/api/verification",
      keys: "/api/keys",
    },
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    message: `${req.method} ${req.originalUrl} tidak ditemukan`,
  });
});

// Error handling middleware
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || config.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`
    ================================================
    🚀 EdDSA Multi-Signature System Server Started
    ================================================
    📍 Server running on port: ${PORT}
    🌐 Environment: ${process.env.NODE_ENV || "development"}
    📅 Started at: ${new Date().toLocaleString("id-ID")}
    🔗 Health check: http://localhost:${PORT}/health
    📚 API Documentation: http://localhost:${PORT}/
    ================================================
    `);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  server.close(() => {
    console.log("Process terminated");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("\nSIGINT received. Shutting down gracefully...");
  server.close(() => {
    console.log("Process terminated");
    process.exit(0);
  });
});

module.exports = app;
