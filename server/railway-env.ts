// Railway Environment Variable Handler
// This module ensures Railway environment variables are properly loaded

export function loadRailwayEnvironment() {
  console.log("🚂 Railway Environment Variable Loader");
  console.log("📋 Checking Railway environment detection...");
  
  // Check if we're running on Railway
  const isRailway = !!(
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_SERVICE_ID ||
    process.env.RAILWAY_DEPLOYMENT_ID
  );
  
  console.log("   Railway Platform Detected:", isRailway);
  
  if (isRailway) {
    console.log("   Railway Environment:", process.env.RAILWAY_ENVIRONMENT || "unknown");
    console.log("   Railway Project ID:", process.env.RAILWAY_PROJECT_ID || "unknown");
    console.log("   Railway Service ID:", process.env.RAILWAY_SERVICE_ID || "unknown");
  }
  
  // Log all environment variables that Railway might provide
  const railwayVars = Object.keys(process.env).filter(key => 
    key.startsWith('RAILWAY_') || 
    key === 'DATABASE_URL' || 
    key === 'SESSION_SECRET' || 
    key === 'OPENAI_API_KEY' || 
    key === 'NODE_ENV' ||
    key === 'PORT'
  );
  
  console.log("📋 Available Environment Variables:", railwayVars);
  
  // Check required variables
  const requiredVars = {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    SESSION_SECRET: process.env.SESSION_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY
  };
  
  console.log("📋 Required Variables Status:");
  for (const [key, value] of Object.entries(requiredVars)) {
    const status = value ? `✅ Set (${value.length} chars)` : '❌ Not set';
    console.log(`   ${key}: ${status}`);
  }
  
  // Set defaults for Railway if not provided
  if (isRailway) {
    if (!process.env.NODE_ENV) {
      process.env.NODE_ENV = 'production';
      console.log("🔧 Set NODE_ENV to production for Railway");
    }
    
    // Railway automatically sets PORT, don't override it
    if (!process.env.PORT) {
      console.log("🔧 PORT will be set by Railway automatically");
    }
    
    // Generate a session secret if not provided (for Railway deployment testing)
    if (!process.env.SESSION_SECRET) {
      process.env.SESSION_SECRET = `railway-auto-${Math.random().toString(36).substring(2)}`;
      console.log("🔧 Generated temporary SESSION_SECRET for Railway (add permanent one in Variables)");
    }
  }
  
  return {
    isRailway,
    hasDatabase: !!process.env.DATABASE_URL,
    hasSessionSecret: !!process.env.SESSION_SECRET,
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    environment: process.env.NODE_ENV,
    port: process.env.PORT
  };
}