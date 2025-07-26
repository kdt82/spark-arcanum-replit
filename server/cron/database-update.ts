import { mtgJsonService } from "../mtg/mtgjson-service";
import { mtgSQLiveService } from "../mtg/mtgsqlive-import-service";
import { db } from "../db";
import { dbMetadata } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Database update cron job
 * This function is designed to be run on a schedule to keep both the card database and rules updated
 */
export async function updateCardDatabase() {
  try {
    console.log("Starting scheduled database update...");
    
    // Check if we have a real database connection first
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      console.log("No DATABASE_URL available - skipping card database update");
      return {
        success: true,
        message: "Database update skipped - no database connection available",
        last_updated: null
      };
    }
    
    // Check if DATABASE_URL is Railway internal (which may not be accessible)
    if (databaseUrl.includes('railway.internal')) {
      console.log("Railway internal database detected - checking connectivity...");
      try {
        // Test database connection with timeout
        const testResult = await Promise.race([
          db.select().from(dbMetadata).limit(1),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 5000))
        ]);
        console.log("Database connection test passed");
      } catch (error) {
        console.log("Database connection test failed - skipping update:", error);
        return {
          success: true,
          message: "Database update skipped - Railway internal database not accessible",
          last_updated: null
        };
      }
    }
    
    // Check when the database was last updated
    const [lastUpdate] = await db.select().from(dbMetadata).where(eq(dbMetadata.id, "card_database"));
    
    // If it's been less than 24 hours since the last update, skip
    if (lastUpdate && lastUpdate.last_updated) {
      const lastUpdateTime = new Date(lastUpdate.last_updated);
      const timeSinceLastUpdate = Date.now() - lastUpdateTime.getTime();
      const hoursSinceLastUpdate = timeSinceLastUpdate / (1000 * 60 * 60);
      
      // Skip if updated in the last 24 hours, but allow forcing update if no cards exist
      const cardCount = await db.select({count: sql`count(*)`}).from((await import('@shared/schema')).cards);
      const totalCards = cardCount.length > 0 ? Number(cardCount[0].count) : 0;
      
      if (hoursSinceLastUpdate < 24 && totalCards > 1000) {
        console.log(`Database was updated ${hoursSinceLastUpdate.toFixed(1)} hours ago. Skipping update.`);
        return {
          success: true,
          message: "Database is up to date",
          last_updated: lastUpdate.last_updated
        };
      } else if (totalCards === 0) {
        console.log(`Database has no cards - forcing complete MTGJSON import regardless of timestamp`);
      }
    }
    
    // Run the card database update using MTGSQLive official PostgreSQL schema
    console.log("Starting MTGSQLive PostgreSQL import...");
    const cardResult = await mtgSQLiveService.importFromMTGJSON() || { 
      success: true, 
      message: "MTGSQLive PostgreSQL import completed" 
    };
    
    // Run the comprehensive rules update
    console.log("Starting comprehensive rules update...");
    let rulesResult = { success: true, message: "Rules update skipped - no update needed" };
    
    try {
      // Check if we need to update rules (only download latest rules if needed)
      const { updateRulesFromWotc } = await import('../rules-updater');
      rulesResult = await updateRulesFromWotc();
      console.log("Rules update result:", rulesResult.message);
    } catch (rulesError: any) {
      console.error("Error updating rules:", rulesError);
      rulesResult = {
        success: false,
        message: `Rules update failed: ${rulesError.message}`
      };
    }
    
    // Update the metadata with the current time
    if (cardResult && cardResult.success) {
      const now = new Date();
      const description = `${cardResult.message}. ${rulesResult.message}`;
      
      await db
        .insert(dbMetadata)
        .values({
          id: "card_database",
          last_updated: now,
          description,
          total_cards: await getCardCount()
        })
        .onConflictDoUpdate({
          target: dbMetadata.id,
          set: {
            last_updated: now,
            description,
            total_cards: await getCardCount()
          }
        });
      
      console.log("Database and rules update completed successfully");
    } else {
      console.error("Card database update failed:", cardResult.message);
    }
    
    return {
      success: cardResult.success && rulesResult.success,
      message: `Cards: ${cardResult.message}. Rules: ${rulesResult.message}`,
      cardResult,
      rulesResult
    };
  } catch (error: any) {
    console.error("Error updating card database:", error);
    return {
      success: false,
      message: `Error updating database: ${error.message}`
    };
  }
}

/**
 * Get the total number of cards in the database
 */
async function getCardCount(): Promise<number> {
  try {
    const result = await db.execute(sql`SELECT COUNT(*) as count FROM cards`);
    if (result && Array.isArray(result) && result.length > 0) {
      return parseInt(result[0].count as string);
    }
    return 0;
  } catch (error) {
    console.error("Error counting cards:", error);
    return 0;
  }
}