/**
 * Comprehensive MTGJSON Import Service
 * Handles complete data mapping from MTGJSON AllPrintings.json to database
 */

import { db } from '../db';
import { cards as cardsTable, dbMetadata } from '@shared/schema';
import { sql, eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

/**
 * MTGJSON Card interface matching the official schema
 */
interface MTGJSONCard {
  // Primary identifiers
  uuid: string;
  identifiers?: {
    scryfallId?: string;
    scryfallOracleId?: string;
    scryfallIllustrationId?: string;
    multiverseId?: number;
    mtgoId?: number;
    mtgoFoilId?: number;
    mtgArenaId?: number;
    tcgplayerId?: number;
    cardKingdomId?: number;
    cardmarketId?: number;
  };
  
  // Basic card info
  name: string;
  faceName?: string;
  flavorName?: string;
  faceFlavorName?: string;
  setCode: string;
  number: string;
  artist?: string;
  layout: string;
  
  // Mana and casting
  manaCost?: string;
  manaValue?: number;
  cmc?: number; // Deprecated, use manaValue
  faceManaCost?: string;
  faceManaValue?: number;
  colors?: string[];
  colorIdentity?: string[];
  colorIndicator?: string[];
  
  // Types and subtypes
  type: string;
  faceType?: string;
  types?: string[];
  supertypes?: string[];
  subtypes?: string[];
  
  // Stats
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  
  // Text content
  text?: string;
  faceText?: string;
  flavorText?: string;
  originalText?: string;
  originalType?: string;
  
  // Set and printing info
  setName?: string;
  rarity: string;
  frameVersion?: string;
  frameEffects?: string[];
  borderColor?: string;
  securityStamp?: string;
  finishes?: string[];
  duelDeck?: string;
  
  // Boolean flags
  isAlternative?: boolean;
  isFullArt?: boolean;
  isFunny?: boolean;
  isOnlineOnly?: boolean;
  isOversized?: boolean;
  isPromo?: boolean;
  isRebalanced?: boolean;
  isReprint?: boolean;
  isReserved?: boolean;
  isStorySpotlight?: boolean;
  isTextless?: boolean;
  hasContentWarning?: boolean;
  hasAlternativeDeckLimit?: boolean;
  
  // Rankings and metrics
  edhrecRank?: number;
  edhrecSaltiness?: number;
  
  // Complex data structures
  legalities?: Record<string, string>;
  keywords?: string[];
  foreignData?: any[];
  relatedCards?: Record<string, string[]>;
  otherFaceIds?: string[];
  variations?: string[];
  originalPrintings?: string[];
  
  // Legacy fields (for backward compatibility)
  printings?: string[];
  rulings?: any[];
  foreignNames?: any[];
  imageUrl?: string;
  multiverseid?: string;
}

/**
 * MTGJSON Set interface
 */
interface MTGJSONSet {
  name: string;
  code: string;
  cards: MTGJSONCard[];
}

/**
 * MTGJSON AllPrintings.json structure
 */
interface MTGJSONAllPrintings {
  data: Record<string, MTGJSONSet>;
}

export class MTGJSONImportService {
  private static instance: MTGJSONImportService;
  
  private constructor() {}
  
  public static getInstance(): MTGJSONImportService {
    if (!MTGJSONImportService.instance) {
      MTGJSONImportService.instance = new MTGJSONImportService();
    }
    return MTGJSONImportService.instance;
  }
  
  /**
   * Import complete MTGJSON AllPrintings.json data
   */
  public async importAllPrintings(filePath: string): Promise<void> {
    console.log("🔄 Starting comprehensive MTGJSON import...");
    
    try {
      // Read and parse the AllPrintings.json file
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const allPrintings: MTGJSONAllPrintings = JSON.parse(fileContent);
      
      console.log(`📦 Found ${Object.keys(allPrintings.data).length} sets in AllPrintings.json`);
      
      let totalCardsProcessed = 0;
      const BATCH_SIZE = 100;
      
      // Process each set
      for (const [setCode, setData] of Object.entries(allPrintings.data)) {
        console.log(`📝 Processing set ${setCode} (${setData.name}) - ${setData.cards.length} cards`);
        
        // Process cards in batches
        for (let i = 0; i < setData.cards.length; i += BATCH_SIZE) {
          const batch = setData.cards.slice(i, Math.min(i + BATCH_SIZE, setData.cards.length));
          const mappedCards = batch.map(card => this.mapMTGJSONCardToSchema(card, setData));
          
          await this.storeBatchOfCards(mappedCards);
          totalCardsProcessed += batch.length;
          
          if (i % (BATCH_SIZE * 10) === 0) { // Log every 1000 cards
            console.log(`   Processed ${i + batch.length}/${setData.cards.length} cards from ${setCode}`);
          }
        }
      }
      
      // Update database metadata
      await this.updateDatabaseMetadata(totalCardsProcessed);
      
      console.log(`✅ MTGJSON import completed! Processed ${totalCardsProcessed} total cards`);
      
    } catch (error: any) {
      console.error("❌ Error importing MTGJSON data:", error);
      throw error;
    }
  }
  
  /**
   * Map MTGJSON card to our database schema
   */
  private mapMTGJSONCardToSchema(card: MTGJSONCard, setData: MTGJSONSet): any {
    // USE EXISTING MTGJSON UUID - Every card already has a unique UUID
    const mtgjsonUuid = card.uuid;
    if (!mtgjsonUuid) {
      throw new Error(`Card ${card.name} missing UUID - this should not happen in MTGJSON data`);
    }
    
    const mappedCard = {
      // Primary identifiers - Use the authentic MTGJSON UUID
      uuid: mtgjsonUuid,
      id: mtgjsonUuid, // Use UUID as fallback for legacy ID
      scryfallId: card.identifiers?.scryfallId || null,
      scryfallOracleId: card.identifiers?.scryfallOracleId || null,
      scryfallIllustrationId: card.identifiers?.scryfallIllustrationId || null,
      multiverseId: card.identifiers?.multiverseId || null,
      mtgoId: card.identifiers?.mtgoId || null,
      mtgoFoilId: card.identifiers?.mtgoFoilId || null,
      mtgArenaId: card.identifiers?.mtgArenaId || null,
      tcgplayerId: card.identifiers?.tcgplayerId || null,
      cardKingdomId: card.identifiers?.cardKingdomId || null,
      cardmarketId: card.identifiers?.cardmarketId || null,
      
      // Basic card info
      name: card.name,
      faceName: card.faceName || null,
      flavorName: card.flavorName || null,
      faceFlavorName: card.faceFlavorName || null,
      setCode: card.setCode || setData.code,
      number: card.number,
      artist: card.artist || null,
      layout: card.layout,
      
      // Mana and casting
      manaCost: card.manaCost || null,
      manaValue: card.manaValue || card.cmc || null, // Use new field, fallback to deprecated
      cmc: card.cmc || card.manaValue || null, // Keep for legacy compatibility
      faceManaCost: card.faceManaCost || null,
      faceManaValue: card.faceManaValue || null,
      colors: card.colors || [],
      colorIdentity: card.colorIdentity || [],
      colorIndicator: card.colorIndicator || [],
      
      // Types and subtypes
      type: card.type,
      faceType: card.faceType || null,
      types: card.types || [],
      supertypes: card.supertypes || [],
      subtypes: card.subtypes || [],
      
      // Stats
      power: card.power || null,
      toughness: card.toughness || null,
      loyalty: card.loyalty || null,
      defense: card.defense || null,
      
      // Text content
      text: card.text || null,
      faceText: card.faceText || null,
      flavorText: card.flavorText || null,
      originalText: card.originalText || null,
      originalType: card.originalType || null,
      
      // Set and printing info
      setName: card.setName || setData.name,
      rarity: card.rarity,
      frameVersion: card.frameVersion || null,
      frameEffects: card.frameEffects || [],
      borderColor: card.borderColor || null,
      securityStamp: card.securityStamp || null,
      finishes: card.finishes || [],
      duelDeck: card.duelDeck || null,
      
      // Boolean flags
      isAlternative: card.isAlternative || false,
      isFullArt: card.isFullArt || false,
      isFunny: card.isFunny || false,
      isOnlineOnly: card.isOnlineOnly || false,
      isOversized: card.isOversized || false,
      isPromo: card.isPromo || false,
      isRebalanced: card.isRebalanced || false,
      isReprint: card.isReprint || false,
      isReserved: card.isReserved || false,
      isStorySpotlight: card.isStorySpotlight || false,
      isTextless: card.isTextless || false,
      hasContentWarning: card.hasContentWarning || false,
      hasAlternativeDeckLimit: card.hasAlternativeDeckLimit || false,
      
      // Rankings and metrics
      edhrecRank: card.edhrecRank || null,
      edhrecSaltiness: card.edhrecSaltiness ? String(card.edhrecSaltiness) : null,
      
      // JSON data for complex structures
      identifiers: card.identifiers ? JSON.stringify(card.identifiers) : null,
      legalities: card.legalities ? JSON.stringify(card.legalities) : null,
      keywords: card.keywords || [],
      foreignData: card.foreignData ? JSON.stringify(card.foreignData) : null,
      relatedCards: card.relatedCards ? JSON.stringify(card.relatedCards) : null,
      otherFaceIds: card.otherFaceIds || [],
      variations: card.variations || [],
      originalPrintings: card.originalPrintings || [],
      
      // Legacy fields (for backward compatibility)
      printings: card.printings || [],
      rulings: card.rulings ? JSON.stringify(card.rulings) : null,
      foreignNames: card.foreignNames ? JSON.stringify(card.foreignNames) : null,
      imageUrl: card.imageUrl || null,
      multiverseid: card.multiverseid || (card.identifiers?.multiverseId ? String(card.identifiers.multiverseId) : null),
    };
    
    // Final verification - should never be needed since MTGJSON provides UUIDs
    if (!mappedCard.uuid) {
      throw new Error(`CRITICAL ERROR: Card ${card.name} has no UUID after mapping!`);
    }
    
    return mappedCard;
  }
  
  /**
   * Store a batch of cards using upsert logic
   */
  private async storeBatchOfCards(cards: any[]): Promise<void> {
    await db.transaction(async (tx: any) => {
      for (const card of cards) {
        try {
          // Ensure UUID exists - should never be needed since MTGJSON provides them
          if (!card.uuid) {
            throw new Error(`CRITICAL: Card ${card.name} has no UUID - MTGJSON data corruption`);
          }
          
          await tx
            .insert(cardsTable)
            .values(card)
            .onConflictDoUpdate({
              target: cardsTable.uuid,
              set: {
                ...card,
                updatedAt: new Date(),
              },
            });
        } catch (error: any) {
          console.error(`❌ Error inserting card ${card.name} (UUID: ${card.uuid}):`, error.message);
          // Continue with other cards even if one fails
        }
      }
    });
  }
  
  /**
   * Update database metadata after import
   */
  private async updateDatabaseMetadata(totalCards: number): Promise<void> {
    try {
      await db
        .insert(dbMetadata)
        .values({
          id: "card_database",
          last_updated: new Date(),
          total_cards: totalCards,
          description: `Complete MTGJSON import - ${totalCards} cards from AllPrintings.json`,
        })
        .onConflictDoUpdate({
          target: dbMetadata.id,
          set: {
            last_updated: new Date(),
            total_cards: totalCards,
            description: `Complete MTGJSON import - ${totalCards} cards from AllPrintings.json`,
          },
        });
      
      console.log(`📊 Updated database metadata: ${totalCards} total cards`);
    } catch (error: any) {
      console.error("❌ Error updating database metadata:", error);
    }
  }
  
  /**
   * Get import statistics
   */
  public async getImportStats(): Promise<any> {
    try {
      const cardCount = await db
        .select({ count: sql`count(*)` })
        .from(cardsTable);
      
      const setCount = await db
        .select({ 
          setCode: cardsTable.setCode,
          count: sql`count(*)`.as('count')
        })
        .from(cardsTable)
        .groupBy(cardsTable.setCode);
      
      const metadata = await db
        .select()
        .from(dbMetadata)
        .where(eq(dbMetadata.id, "card_database"));
      
      return {
        totalCards: cardCount[0]?.count || 0,
        totalSets: setCount.length,
        lastUpdated: metadata[0]?.last_updated || null,
        description: metadata[0]?.description || null,
        setBreakdown: setCount.slice(0, 20), // Top 20 sets
      };
    } catch (error: any) {
      console.error("❌ Error getting import stats:", error);
      return null;
    }
  }
}