/**
 * Storage adapter for MTGSQLive official schema
 * This provides our application interface while using the official MTGJSON database structure
 */

import { db } from './db';
import { sql } from 'drizzle-orm';
import { MTGSQLiveCard, MTGSQLiveSet, adaptMTGSQLiveCard, adaptMTGSQLiveSet } from '@shared/mtgsqlive-schema';
import { Card } from '@/types/card';

export interface IStorage {
  // Card operations using MTGSQLive schema
  getCard(id: string): Promise<Card | undefined>;
  findCards(query: string, filters?: any): Promise<Card[]>;
  searchCardsByName(name: string): Promise<Card[]>;
  
  // User operations (unchanged)
  getUser(id: number): Promise<any | undefined>;
  getUserByUsername(username: string): Promise<any | undefined>;
  createUser(insertUser: any): Promise<any>;
}

export class MTGSQLiveStorage implements IStorage {
  /**
   * Get a single card by UUID or ID
   */
  async getCard(id: string): Promise<Card | undefined> {
    try {
      // Query MTGSQLive cards table directly
      const result = await db.execute(
        sql`SELECT * FROM cards WHERE uuid = ${id} OR id::text = ${id} LIMIT 1`
      );
      
      if (result.rows.length === 0) {
        return undefined;
      }
      
      const mtgCard = result.rows[0] as MTGSQLiveCard;
      return adaptMTGSQLiveCard(mtgCard) as Card;
    } catch (error) {
      console.error('Error getting card:', error);
      return undefined;
    }
  }

  /**
   * Enhanced search cards using MTGSQLive schema with client-side advanced ranking
   */
  async findCards(query: string, filters?: any, limit: number = 100): Promise<Card[]> {
    try {
      if (!query || query.trim().length === 0) {
        return [];
      }

      // Import search logic dynamically to avoid circular imports
      const searchLogic = await import('../shared/search-logic.js');
      const { mtgCardSearch } = searchLogic;

      const searchTerm = query.trim().toLowerCase();
      
      // Get a broader set of cards from database (no complex ordering in SQL)
      let whereClause = sql`(
        LOWER(name) LIKE ${`%${searchTerm}%`} OR 
        LOWER(type) LIKE ${`%${searchTerm}%`} OR
        (LOWER(COALESCE(text, '')) LIKE ${`%${searchTerm}%`} AND LENGTH(${searchTerm}) > 5) OR
        LOWER(COALESCE(keywords, '')) LIKE ${`%${searchTerm}%`}
      )`;

      // Apply filters
      if (filters?.set) {
        whereClause = sql`${whereClause} AND "setCode" = ${filters.set}`;
      }
      
      if (filters?.rarity) {
        whereClause = sql`${whereClause} AND rarity = ${filters.rarity}`;
      }

      if (filters?.colors && filters.colors.length > 0) {
        const colorFilter = filters.colors.join(',');
        whereClause = sql`${whereClause} AND LOWER(COALESCE(colors, '')) LIKE ${`%${colorFilter.toLowerCase()}%`}`;
      }

      // Simple query - let client-side logic handle ranking
      const result = await db.execute(
        sql`SELECT * FROM cards WHERE ${whereClause} ORDER BY name ASC LIMIT ${limit * 3}`
      );

      console.log(`MTGSQLive found ${result.rows.length} cards for query: "${query}"`);
      
      // Convert to our Card interface
      const cards = result.rows.map((row: any) => adaptMTGSQLiveCard(row as MTGSQLiveCard)) as Card[];
      
      // Apply advanced client-side search ranking with user's word-matching preference
      const { simpleSearchWithPriority, consolidateDuplicateCards } = searchLogic;
      const rankedCards = simpleSearchWithPriority(cards, query);
      
      // Consolidate duplicate cards by name (show only one version of each card)
      const consolidatedCards = consolidateDuplicateCards(rankedCards);
      
      // Return limited results
      const finalResults = consolidatedCards.slice(0, limit);
      console.log(`MTGSQLive search returned ${finalResults.length} cards after ranking`);
      
      return finalResults;
      
    } catch (error) {
      console.error('Error finding cards:', error);
      return [];
    }
  }

  /**
   * Search cards by name specifically using advanced client-side ranking
   */
  async searchCardsByName(name: string): Promise<Card[]> {
    try {
      // Import search logic dynamically
      const { mtgCardSearch } = await import('../shared/search-logic.js');
      
      const result = await db.execute(
        sql`SELECT * FROM cards WHERE name ILIKE ${`%${name}%`} ORDER BY name LIMIT 150`
      );
      
      const cards = result.rows.map((row: any) => adaptMTGSQLiveCard(row as MTGSQLiveCard)) as Card[];
      
      // Apply advanced search ranking
      return mtgCardSearch(cards, name, {
        includeText: false,
        includeType: false,
        minSearchLength: 1
      }).slice(0, 50);
      
    } catch (error) {
      console.error('Error searching cards by name:', error);
      return [];
    }
  }

  /**
   * Get sets using MTGSQLive schema
   */
  async getSets(): Promise<any[]> {
    try {
      const result = await db.execute(
        sql`SELECT * FROM sets ORDER BY "releaseDate" DESC`
      );
      
      return result.rows.map((row: any) => adaptMTGSQLiveSet(row as MTGSQLiveSet));
    } catch (error) {
      console.error('Error getting sets:', error);
      return [];
    }
  }

  /**
   * Get cards from a specific set
   */
  async getCardsFromSet(setCode: string): Promise<Card[]> {
    try {
      const result = await db.execute(
        sql`SELECT * FROM cards WHERE "setCode" = ${setCode} ORDER BY CAST(number AS INTEGER)`
      );
      
      return result.rows.map((row: any) => adaptMTGSQLiveCard(row as MTGSQLiveCard)) as Card[];
    } catch (error) {
      console.error('Error getting cards from set:', error);
      return [];
    }
  }

  // User operations remain unchanged (using our custom schema)
  async getUser(id: number): Promise<any | undefined> {
    // Implementation remains the same - users table is separate from MTGSQLive
    return undefined; // Placeholder
  }

  async getUserByUsername(username: string): Promise<any | undefined> {
    // Implementation remains the same
    return undefined; // Placeholder
  }

  async createUser(insertUser: any): Promise<any> {
    // Implementation remains the same
    return insertUser; // Placeholder
  }

  /**
   * Test MTGSQLive database connectivity and schema
   */
  async testMTGSQLiveConnection(): Promise<boolean> {
    try {
      const cardCount = await db.execute(sql`SELECT COUNT(*) as count FROM cards`);
      const setCount = await db.execute(sql`SELECT COUNT(*) as count FROM sets`);
      
      console.log(`✅ MTGSQLive Test: ${cardCount.rows[0]?.count} cards, ${setCount.rows[0]?.count} sets`);
      return true;
    } catch (error) {
      console.error('❌ MTGSQLive connection test failed:', error);
      return false;
    }
  }


}

export const mtgSQLiveStorage = new MTGSQLiveStorage();