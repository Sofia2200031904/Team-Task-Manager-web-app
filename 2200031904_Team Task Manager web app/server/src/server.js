const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const env = require("./config/env");
const { connectDatabase, disconnectDatabase } = require("./config/db");
const { notifyOverdueTasks } = require("./services/overdueNotifier");
const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const projectRoutes = require("./routes/project.routes");
const taskRoutes = require("./routes/task.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const errorHandler = require("./middlewares/errorHandler");

const app = express();
const allowedOrigins = (env.clientUrl || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const isAllowedDevOrigin = (origin) =>
  /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (env.nodeEnv !== "production" && isAllowedDevOrigin(origin)) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.get("/api/health", (req, res) => {
  return res.json({
    status: "ok",
    message: "Team Task Manager API is running",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api", taskRoutes);
app.use("/api/dashboard", dashboardRoutes);

if (env.nodeEnv === "production") {
  const clientDistPath = path.join(__dirname, "..", "..", "client", "dist");
  app.use(express.static(clientDistPath));

  app.get("/{*splat}", (req, res, next) => {
    if (req.originalUrl.startsWith("/api")) {
      return next();
    }

    return res.sendFile(path.join(clientDistPath, "index.html"));
  });
}

app.use(errorHandler);

let server;
let notifierIntervalId;

const shutdown = async () => {
  if (notifierIntervalId) {
    clearInterval(notifierIntervalId);
    notifierIntervalId = null;
  }

  await disconnectDatabase();

  if (server) {
    server.close(() => process.exit(0));
    return;
  }

  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const startServer = async () => {
  await connectDatabase();

  if (env.overdueNotifierIntervalMinutes > 0) {
    const intervalMs = env.overdueNotifierIntervalMinutes * 60 * 1000;
    notifierIntervalId = setInterval(async () => {
      try {
        await notifyOverdueTasks();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Overdue notifier failed:", error.message || error);
      }
    }, intervalMs);
  }

  server = app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server is running on port ${env.port}`);
  });
};

startServer().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server:", error.message || error);
  process.exit(1);
});
