import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { loadRailwayEnvironment } from "./railway-env";
import { forceRailwayEnvironment } from "./railway-env-fix";
import { setupTimezone } from "./timezone";

// Set timezone to Sydney, Australia (UTC+10)
setupTimezone();

// Debug Railway environment variables immediately
console.log("🔍 IMMEDIATE Environment Check (Raw Process):");
console.log("   DATABASE_URL:", process.env.DATABASE_URL ? `EXISTS (${process.env.DATABASE_URL.length} chars)` : "NOT FOUND");
console.log("   SESSION_SECRET:", process.env.SESSION_SECRET ? `EXISTS (${process.env.SESSION_SECRET.length} chars)` : "NOT FOUND");
console.log("   OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? `EXISTS (${process.env.OPENAI_API_KEY.length} chars)` : "NOT FOUND");
console.log("   NODE_ENV:", process.env.NODE_ENV || "NOT FOUND");
console.log("   PORT:", process.env.PORT || "NOT FOUND");
console.log("   Railway vars:", Object.keys(process.env).filter(k => k.includes('RAILWAY')));
console.log("   All env keys count:", Object.keys(process.env).length);

// Test if environment variables exist but are being overridden
console.log("🔍 DEEP Environment Debug:");
const envKeys = Object.keys(process.env);
console.log("   Environment keys containing 'DATABASE':", envKeys.filter(k => k.toLowerCase().includes('database')));
console.log("   Environment keys containing 'SESSION':", envKeys.filter(k => k.toLowerCase().includes('session')));
console.log("   Environment keys containing 'OPENAI':", envKeys.filter(k => k.toLowerCase().includes('openai')));
console.log("   Raw DATABASE_URL value:", JSON.stringify(process.env.DATABASE_URL));
console.log("   Raw SESSION_SECRET value:", JSON.stringify(process.env.SESSION_SECRET));

// Force Railway environment variables to be available
forceRailwayEnvironment();

// Load and configure Railway environment variables
const railwayConfig = loadRailwayEnvironment();

const app = express();

// Configure Express to handle large JSON files
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    console.log("🚀 Starting Spark Arcanum server...");
    
    // Start the server first
    const httpServer = await registerRoutes(app);
    const port = Number(process.env.PORT || 5000);
    
    // Error handling middleware
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      console.error("Express error:", err);
      res.status(status).json({ message });
    });

    // Setup static files and frontend
    if (process.env.NODE_ENV === "development") {
      setupVite(app, httpServer);
    } else {
      serveStatic(app);
    }

    // Start listening
    httpServer.listen(port, "0.0.0.0", () => {
      log(`🎯 Spark Arcanum serving on port ${port}`);
      log(`🌐 Health check: http://localhost:${port}/api/health`);
      
      // Only setup database features if we have a database
      if (railwayConfig.hasDatabase) {
        console.log("🗄️ Database detected - will initialize card data");
        // Defer database operations to avoid blocking startup
        setTimeout(async () => {
          try {
            // Test database connection first before attempting initialization
            const databaseUrl = process.env.DATABASE_URL;
            if (databaseUrl && databaseUrl.includes('railway.internal')) {
              console.log("🚨 Railway internal database detected - testing connection...");
              
              // Import database connection to test it
              const { db } = await import("./db");
              
              try {
                // Initialize database schema first (creates tables if they don't exist)
                const { initializeDatabaseSchema } = await import("./database-initializer");
                const schemaInitialized = await initializeDatabaseSchema();
                
                if (!schemaInitialized) {
                  throw new Error('Failed to initialize database schema');
                }
                
                // Quick connection test with 5 second timeout
                await Promise.race([
                  db.select().from((await import("@shared/schema")).dbMetadata).limit(1),
                  new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Database connection timeout')), 5000)
                  )
                ]);
                
                console.log("✅ Railway database connection and schema ready - starting sequential initialization");
                
                // Sequential initialization: Cards first, then rules
                console.log("📚 Phase 1: Card database initialization...");
                const { updateCardDatabase } = await import("./cron/database-update");
                await updateCardDatabase();
                
                console.log("📖 Phase 2: Rules service initialization...");
                const { RulesService } = await import("./mtg/rules-service");
                const rulesService = RulesService.getInstance();
                await rulesService.initialize();
              } catch (dbError: any) {
                console.log("⚠️ Railway database connection failed:", dbError.message);
                console.log("📋 Database initialization skipped - Railway PostgreSQL service not accessible");
                console.log("   This is normal if:");
                console.log("   1. PostgreSQL service is not running in Railway");
                console.log("   2. DATABASE_URL points to internal service that's not accessible");
                console.log("   3. App is running in development mode with Railway variables");
              }
            } else {
              // Standard database initialization for other environments
              try {
                // Always initialize schema first
                const { initializeDatabaseSchema } = await import("./database-initializer");
                await initializeDatabaseSchema();
                
                // Sequential initialization: Cards first, then rules
                console.log("📚 Phase 1: Card database initialization...");
                const { updateCardDatabase } = await import("./cron/database-update");
                await updateCardDatabase();
                
                console.log("📖 Phase 2: Rules service initialization...");
                const { RulesService } = await import("./mtg/rules-service");
                const rulesService = RulesService.getInstance();
                await rulesService.initialize();
              } catch (schemaError: any) {
                console.log("⚠️ Database schema initialization failed:", schemaError.message);
              }
            }
          } catch (error: any) {
            console.warn("⚠️ Card database initialization failed:", error);
          }
        }, 30000); // 30 second delay
      } else {
        console.log("🎮 Running in basic mode - add DATABASE_URL for full features");
      }
    });

  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
})();
