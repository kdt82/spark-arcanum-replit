import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { drizzle as neonDrizzle } from 'drizzle-orm/neon-serverless';
import { Pool as PgPool } from 'pg';
import { drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// Check if DATABASE_URL is available and create a mock db if not
const databaseUrl = process.env.DATABASE_URL;
const hasDatabase = !!databaseUrl;

console.log("🔍 Database Environment Check:");
console.log(`   DATABASE_URL exists: ${!!databaseUrl}`);
console.log(`   DATABASE_URL length: ${databaseUrl ? databaseUrl.length : 0}`);
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);

if (!hasDatabase) {
  console.warn("⚠️ DATABASE_URL not set - using mock database for Railway deployment");
  console.warn("📋 To enable full database features:");
  console.warn("   1. Add PostgreSQL service in Railway");
  console.warn("   2. Set DATABASE_URL environment variable");
  console.warn("   3. Redeploy the application");
} else {
  console.log("✅ DATABASE_URL found - attempting real database connection");
  
  // Check if DATABASE_URL looks like a Railway internal URL that might not be accessible
  if (databaseUrl.includes('railway.internal')) {
    console.warn("⚠️ DATABASE_URL appears to be Railway internal service - this may not be accessible");
    console.warn("📋 If database connection fails:");
    console.warn("   1. Ensure PostgreSQL service is running in Railway");
    console.warn("   2. Check if DATABASE_URL is correctly set to external connection string");
    console.warn("   3. Consider using external PostgreSQL provider for Railway deployment");
  }
}

// Create mock database functions to prevent null errors
const createMockDb = () => ({
  select: () => ({
    from: () => ({
      where: () => ({ limit: () => Promise.resolve([]) }),
      limit: () => Promise.resolve([])
    })
  }),
  insert: () => ({
    values: () => ({
      returning: () => Promise.resolve([]),
      onConflictDoUpdate: () => ({ returning: () => Promise.resolve([]) })
    })
  }),
  update: () => ({
    set: () => ({ where: () => Promise.resolve([]) })
  }),
  delete: () => ({
    where: () => Promise.resolve([])
  }),
  execute: () => Promise.resolve([])
});

// Create database connections with error handling
let pool: any = null;
let db: any = null;

if (hasDatabase) {
  try {
    console.log("🔌 Creating PostgreSQL connection pool...");
    
    // Detect if this is a Railway PostgreSQL URL vs Neon Database URL
    const isRailwayDB = databaseUrl!.includes('railway.internal') || databaseUrl!.includes('postgres://');
    const isNeonDB = databaseUrl!.includes('neon.tech') || databaseUrl!.includes('@ep-');
    
    if (isRailwayDB && !isNeonDB) {
      console.log("🚂 Detected Railway PostgreSQL - using standard PostgreSQL connection");
      
      // Use standard PostgreSQL pool for Railway
      pool = new PgPool({
        connectionString: databaseUrl!,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        max: 10,
        ssl: false // Railway internal connections don't need SSL
      }) as any;
      
      console.log("🔌 Creating Drizzle database instance with PostgreSQL driver...");
      db = pgDrizzle(pool, { schema });
      
    } else {
      console.log("🌊 Detected Neon Database - using WebSocket connection");
      
      // Use Neon serverless pool for external Neon databases
      pool = new NeonPool({ 
        connectionString: databaseUrl!,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        max: 10
      }) as any;
      
      console.log("🔌 Creating Drizzle database instance with Neon driver...");
      db = neonDrizzle(pool, { schema });
    }
    
    console.log("✅ Database connection objects created successfully (connection will be tested on first use)");
  } catch (error: any) {
    console.error("❌ Error creating database connection:", error.message);
    console.log("🔄 Falling back to mock database");
    pool = null;
    db = createMockDb();
  }
} else {
  console.log("🔄 Using mock database");
  db = createMockDb();
}

// Export the instances
export { pool, db };

// Export a flag to check if we have a real database connection
export const hasRealDatabase = hasDatabase;

