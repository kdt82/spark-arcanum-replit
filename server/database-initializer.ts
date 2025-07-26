import { db } from './db';
import { sql } from 'drizzle-orm';
import * as schema from '@shared/schema';

/**
 * Initialize the database schema if it doesn't exist
 * This is essential for Railway deployment where the database starts empty
 */
export async function initializeDatabaseSchema(): Promise<boolean> {
  try {
    console.log("🔧 Checking database schema...");
    
    // Check if any of our core tables exist
    const tableCheckQuery = sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'sessions', 'cards', 'decks', 'rules', 'db_metadata')
    `;
    
    const existingTables = await db.execute(tableCheckQuery);
    console.log("🔍 Raw table query result:", existingTables);
    
    // Handle different result formats from different database drivers
    let tableNames: string[] = [];
    if (Array.isArray(existingTables)) {
      tableNames = existingTables.map((row: any) => row.table_name).filter(Boolean);
    } else if (existingTables && typeof existingTables === 'object' && 'rows' in existingTables) {
      tableNames = (existingTables as any).rows.map((row: any) => row.table_name).filter(Boolean);
    }
    
    console.log("📋 Existing tables:", tableNames);
    
    // If we have no core tables, we need to create the schema
    if (tableNames.length === 0) {
      console.log("🏗️ Database is empty - creating schema...");
      
      // Create all tables using the schema definitions
      await createDatabaseTables();
      
      console.log("✅ Database schema created successfully");
      return true;
    } else if (tableNames.length < 6) {
      console.log("⚠️ Some tables missing - checking and creating missing tables...");
      
      // Check for specific missing tables and create them
      const requiredTables = ['users', 'sessions', 'cards', 'decks', 'rules', 'db_metadata'];
      const missingTables = requiredTables.filter(table => !tableNames.includes(table));
      
      if (missingTables.length > 0) {
        console.log("📝 Missing tables:", missingTables);
        await createDatabaseTables();
        console.log("✅ Missing tables created");
      }
      
      return true;
    } else {
      console.log("✅ Database schema already exists");
      return true;
    }
    
  } catch (error: any) {
    console.error("❌ Error initializing database schema:", error);
    return false;
  }
}

/**
 * Create all database tables using SQL commands
 * This ensures compatibility with both Railway PostgreSQL and Neon databases
 */
async function createDatabaseTables(): Promise<void> {
  console.log("🏗️ Creating database tables...");
  
  try {
  // Create sessions table for authentication
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "sessions" (
      "sid" varchar PRIMARY KEY NOT NULL,
      "sess" jsonb NOT NULL,
      "expire" timestamp NOT NULL
    )
  `);
  
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" ("expire")
  `);
  
  // Create users table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "users" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "email" varchar UNIQUE,
      "first_name" varchar,
      "last_name" varchar,
      "profile_image_url" varchar,
      "created_at" timestamp DEFAULT now(),
      "updated_at" timestamp DEFAULT now()
    )
  `);
  
  // Create comprehensive cards table matching MTGJSON schema
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "cards" (
      -- Primary identifiers
      "uuid" varchar PRIMARY KEY NOT NULL,
      "id" varchar,
      "scryfall_id" varchar,
      "scryfall_oracle_id" varchar,
      "scryfall_illustration_id" varchar,
      "multiverse_id" integer,
      "mtgo_id" integer,
      "mtgo_foil_id" integer,
      "mtg_arena_id" integer,
      "tcgplayer_id" integer,
      "card_kingdom_id" integer,
      "cardmarket_id" integer,
      
      -- Basic card info
      "name" varchar NOT NULL,
      "face_name" varchar,
      "flavor_name" varchar,
      "face_flavor_name" varchar,
      "set_code" varchar NOT NULL,
      "number" varchar NOT NULL,
      "artist" varchar,
      "layout" varchar NOT NULL,
      
      -- Mana and casting
      "mana_cost" varchar,
      "mana_value" integer,
      "cmc" integer,
      "face_mana_cost" varchar,
      "face_mana_value" integer,
      "colors" varchar[],
      "color_identity" varchar[],
      "color_indicator" varchar[],
      
      -- Types and subtypes
      "type" varchar NOT NULL,
      "face_type" varchar,
      "types" varchar[],
      "supertypes" varchar[],
      "subtypes" varchar[],
      
      -- Stats
      "power" varchar,
      "toughness" varchar,
      "loyalty" varchar,
      "defense" varchar,
      
      -- Text content
      "text" text,
      "face_text" text,
      "flavor_text" text,
      "original_text" text,
      "original_type" varchar,
      
      -- Set and printing info
      "set_name" varchar,
      "rarity" varchar NOT NULL,
      "frame_version" varchar,
      "frame_effects" varchar[],
      "border_color" varchar,
      "security_stamp" varchar,
      "finishes" varchar[],
      "duel_deck" varchar,
      
      -- Boolean flags
      "is_alternative" boolean DEFAULT false,
      "is_full_art" boolean DEFAULT false,
      "is_funny" boolean DEFAULT false,
      "is_online_only" boolean DEFAULT false,
      "is_oversized" boolean DEFAULT false,
      "is_promo" boolean DEFAULT false,
      "is_rebalanced" boolean DEFAULT false,
      "is_reprint" boolean DEFAULT false,
      "is_reserved" boolean DEFAULT false,
      "is_story_spotlight" boolean DEFAULT false,
      "is_textless" boolean DEFAULT false,
      "has_content_warning" boolean DEFAULT false,
      "has_alternative_deck_limit" boolean DEFAULT false,
      
      -- Rankings and metrics
      "edhrec_rank" integer,
      "edhrec_saltiness" decimal,
      
      -- JSON data for complex structures
      "identifiers" jsonb,
      "legalities" jsonb,
      "keywords" varchar[],
      "foreign_data" jsonb,
      "related_cards" jsonb,
      "other_face_ids" varchar[],
      "variations" varchar[],
      "original_printings" varchar[],
      
      -- Legacy fields (deprecated but maintained)
      "printings" varchar[],
      "rulings" jsonb,
      "foreign_names" jsonb,
      "image_url" varchar,
      "multiverseid" varchar,
      
      -- Timestamps
      "created_at" timestamp DEFAULT now(),
      "updated_at" timestamp DEFAULT now()
    )
  `);
  
  // Create index on card names for fast searching
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "idx_cards_name" ON "cards" ("name")
  `);
  
  // Create decks table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "decks" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "name" varchar NOT NULL,
      "description" text,
      "format" varchar NOT NULL,
      "colors" jsonb,
      "commander_id" varchar,
      "cards" jsonb NOT NULL,
      "is_public" boolean DEFAULT false,
      "created_at" timestamp DEFAULT now(),
      "updated_at" timestamp DEFAULT now()
    )
  `);
  
  // Create rules table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "rules" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "rule_number" varchar NOT NULL UNIQUE,
      "rule_text" text NOT NULL,
      "created_at" timestamp DEFAULT now(),
      "updated_at" timestamp DEFAULT now()
    )
  `);
  
  // Create index on rule numbers
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "idx_rules_number" ON "rules" ("rule_number")
  `);
  
  // Create database metadata table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "db_metadata" (
      "id" varchar PRIMARY KEY NOT NULL,
      "last_updated" timestamp,
      "total_cards" integer,
      "description" text,
      "created_at" timestamp DEFAULT now(),
      "updated_at" timestamp DEFAULT now()
    )
  `);
  
    console.log("🎯 All database tables created successfully");
  } catch (error: any) {
    console.error("❌ Error creating database tables:", error);
    throw error;
  }
}

/**
 * Check if database connection is working and schema is ready
 */
export async function checkDatabaseHealth(): Promise<{ connected: boolean; tablesExist: boolean; error?: string }> {
  try {
    // Test basic connection
    await db.execute(sql`SELECT 1`);
    
    // Check if our tables exist
    const tableCheckQuery = sql`
      SELECT COUNT(*) as count
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'sessions', 'cards', 'decks', 'rules', 'db_metadata')
    `;
    
    const result = await db.execute(tableCheckQuery);
    console.log("🔍 Health check raw result:", result);
    
    // Handle different result formats
    let tableCount = 0;
    if (Array.isArray(result) && result.length > 0) {
      tableCount = parseInt(result[0]?.count as string || '0', 10);
    } else if (result && typeof result === 'object' && 'rows' in result) {
      const rows = (result as any).rows;
      if (Array.isArray(rows) && rows.length > 0) {
        tableCount = parseInt(rows[0]?.count as string || '0', 10);
      }
    }
    
    return {
      connected: true,
      tablesExist: tableCount >= 6
    };
    
  } catch (error: any) {
    return {
      connected: false,
      tablesExist: false,
      error: error.message
    };
  }
}