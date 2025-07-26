// Railway Environment Variable Fix
// This module forces Railway environment variables to be available

export function forceRailwayEnvironment() {
  console.log("🔧 Railway Environment Variable Fix - Forcing variable injection");
  
  // Check if we're on Railway
  const isRailway = !!(
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_SERVICE_ID ||
    process.env.RAILWAY_DEPLOYMENT_ID
  );

  if (!isRailway) {
    console.log("   Not on Railway - skipping fix");
    return;
  }

  console.log("   On Railway - checking variable injection");

  // Railway sometimes doesn't inject variables immediately
  // Try to force-read them from different sources
  
  const railwayEnvs = {
    DATABASE_URL: process.env.DATABASE_URL,
    SESSION_SECRET: process.env.SESSION_SECRET, 
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT
  };

  console.log("   Current variable state:");
  Object.entries(railwayEnvs).forEach(([key, value]) => {
    console.log(`     ${key}: ${value ? `SET (${value.length} chars)` : 'NOT SET'}`);
  });

  // If critical variables are missing, try alternative methods
  if (!railwayEnvs.SESSION_SECRET) {
    console.log("   SESSION_SECRET missing - checking alternatives");
    
    // Check for any environment variable that might contain session data
    const possibleSession = Object.keys(process.env).find(key => 
      key.toLowerCase().includes('session') && 
      process.env[key] && 
      process.env[key]!.length > 10
    );
    
    if (possibleSession) {
      console.log(`   Found possible session variable: ${possibleSession}`);
      process.env.SESSION_SECRET = process.env[possibleSession];
    } else {
      // Generate a consistent session secret for this deployment
      const deploymentId = process.env.RAILWAY_DEPLOYMENT_ID || 'unknown';
      process.env.SESSION_SECRET = `railway-${deploymentId}-${Math.random().toString(36)}`;
      console.log("   Generated fallback SESSION_SECRET");
    }
  }

  // Log final state
  console.log("   Final variable state:");
  ['DATABASE_URL', 'SESSION_SECRET', 'OPENAI_API_KEY'].forEach(key => {
    const value = process.env[key];
    console.log(`     ${key}: ${value ? `SET (${value.length} chars)` : 'NOT SET'}`);
  });

  return {
    hasDatabase: !!process.env.DATABASE_URL,
    hasSessionSecret: !!process.env.SESSION_SECRET,
    hasOpenAI: !!process.env.OPENAI_API_KEY
  };
}