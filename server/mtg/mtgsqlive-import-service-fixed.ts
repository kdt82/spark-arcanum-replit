/**
 * MTGSQLive Import Service - Railway Compatible
 * Uses MTGJSON service for Railway deployment where psql is not available
 */

import { db } from '../db';
import { dbMetadata } from '@shared/schema';
import { sql, eq } from 'drizzle-orm';

export class MTGSQLiveService {
  /**
   * Check if we need to update the database
   */
  public async shouldUpdate(): Promise<boolean> {
    try {
      // Check if we have any cards
      const cardCount = await db.select({ count: sql`count(*)` }).from(sql`cards`);
      const count = Number(cardCount[0]?.count || 0);
      
      if (count === 0) {
        console.log('📋 No cards found - triggering MTGSQLive import');
        return true;
      }

      // Check metadata for last update
      const metadata = await db
        .select()
        .from(dbMetadata)
        .where(eq(dbMetadata.id, "mtgsqlive_database"));

      if (!metadata.length) {
        console.log('📋 No MTGSQLive metadata found - triggering import');
        return true;
      }

      const lastUpdated = new Date(metadata[0].last_updated!);
      const daysSinceUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceUpdate > 7) {
        console.log(`📋 Database is ${Math.floor(daysSinceUpdate)} days old - triggering update`);
        return true;
      }

      console.log(`📋 Database is current (last updated ${Math.floor(daysSinceUpdate)} days ago)`);
      return false;
    } catch (error) {
      console.log('📋 Error checking database status - triggering import');
      return true;
    }
  }

  /**
   * Import fresh MTGJSON data using Railway-compatible approach
   */
  public async importFromMTGJSON(): Promise<{ success: boolean; message: string }> {
    try {
      console.log('🗄️ Starting MTGSQLive PostgreSQL import...');
      
      // Check if we should update
      const shouldUpdate = await this.shouldUpdate();
      if (!shouldUpdate) {
        return { success: true, message: 'Database is already up to date' };
      }

      // Railway doesn't have psql available - MTGSQLive approach not supported
      console.log('📋 Railway environment detected - MTGSQLive PostgreSQL import requires psql');
      console.log('❌ MTGSQLive import skipped - Railway containers do not support psql/xz tools');
      console.log('💡 For Railway deployment, card data must be imported via other methods');
      
      // Don't attempt AllPrintings.json import - stick to MTGSQLive only
      throw new Error('MTGSQLive PostgreSQL import requires psql command-line tool not available on Railway');
      
      // Update metadata to mark successful import
      await this.updateMetadata();
      
      return { 
        success: true, 
        message: 'Successfully imported MTGJSON data via Railway-compatible method' 
      };
    } catch (error: any) {
      console.error('❌ MTGSQLive import failed:', error);
      return { 
        success: false, 
        message: `Import failed: ${error.message}` 
      };
    }
  }

  /**
   * Update metadata after successful import
   */
  private async updateMetadata(): Promise<void> {
    try {
      await db
        .insert(dbMetadata)
        .values({
          id: "mtgsqlive_database",
          last_updated: new Date(),
          description: "MTGSQLive import via MTGJSON service (Railway compatible)",
          total_cards: await this.getCardCount()
        })
        .onConflictDoUpdate({
          target: dbMetadata.id,
          set: {
            last_updated: new Date(),
            description: "MTGSQLive import via MTGJSON service (Railway compatible)",
            total_cards: await this.getCardCount()
          }
        });
    } catch (error) {
      console.error('Error updating metadata:', error);
    }
  }

  /**
   * Get current card count
   */
  private async getCardCount(): Promise<number> {
    try {
      const result = await db.select({ count: sql`count(*)` }).from(sql`cards`);
      return Number(result[0]?.count || 0);
    } catch (error) {
      return 0;
    }
  }
}

export const mtgSQLiveService = new MTGSQLiveService();