import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { mtgSQLiveStorage } from "./storage-mtgsqlive";
import { processCardData } from "./mtg/card-service";
import { mtgJsonService } from "./mtg/mtgjson-service";
import { rulesService } from "./mtg/rules-service";
import { getCardRuling } from "./openai";
import { Card } from "@/types/card";
import { rules as rulesTable, dbMetadata, cards } from "@shared/schema";
import { db } from "./db";
import fs from "fs";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
import { eq, sql } from "drizzle-orm";
import { rarityRepairService } from "./mtg/rarity-repair";
import { generateDeckSuggestion } from "./deck-generator";
import { registerGraphQLRoutes } from "./routes/graphql-routes";
import { searchCardsWithGraphQL } from "./mtg/mtg-graphql";
import { registerAuthRoutes } from "./routes/auth-routes";
import { registerDeckRoutes } from "./routes/deck-routes";
import { DeckService } from "./decks/deck-service";
import seoRoutes from "./routes/seo-routes";
import { registerUnifiedSearchRoutes } from "./routes/unified-search-routes";
import cookieParser from "cookie-parser";
// Simple health check function with Sydney timezone
const healthCheck = (req: any, res: any) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    sydneyTime: new Date().toLocaleString('en-AU', { 
      timeZone: 'Australia/Sydney',
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }),
    environment: process.env.NODE_ENV || "development",
    uptime: process.uptime()
  });
};

// Type augmentation for Express Request with multer file
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

// For file uploads - configure multer for large files
const upload = multer({ 
  dest: "uploads/",
  limits: {
    fileSize: 1024 * 1024 * 1000, // 1000MB max file size
  }
});
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function registerRoutes(app: Express): Promise<Server> {
  // Add cookie parser for session management - must be before auth routes
  app.use(cookieParser());
  
  // Register SEO routes first (before other routes to prevent conflicts)
  app.use(seoRoutes);
  
  // Register authentication routes
  registerAuthRoutes(app);
  
  // Register deck management routes after auth setup
  registerDeckRoutes(app);
  
  // Register unified search routes (replaces old search endpoints)
  registerUnifiedSearchRoutes(app);
  
  // Session management for conversation history
  let currentConversation: Array<{ role: string; content: string }> = [];

  // Load cards from uploaded file endpoint
  app.post("/api/cards/load", upload.single("file"), async (req: MulterRequest, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      console.log("File uploaded:", req.file.filename);
      
      const filePath = path.join(__dirname, "..", req.file.path);
      console.log("File path:", filePath);
      
      try {
        const fileContent = fs.readFileSync(filePath, "utf8");
        console.log("File read successfully");
        
        let cardsData;
        try {
          cardsData = JSON.parse(fileContent);
          console.log("JSON parsed successfully, cards data:", typeof cardsData);
        } catch (parseError: any) {
          console.error("JSON parse error:", parseError.message);
          return res.status(400).json({ message: "Invalid JSON file" });
        }

        // Process and store card data
        console.log("Processing card data...");
        const processedCards = await processCardData(cardsData);
        console.log(`Processed ${processedCards.length} cards`);
        
        // Clean up uploaded file
        fs.unlinkSync(filePath);
        
        return res.json({ message: "Cards loaded successfully", count: processedCards.length });
      } catch (fileError: any) {
        console.error("File error:", fileError.message);
        return res.status(500).json({ message: "Error reading uploaded file", error: fileError.message });
      }
    } catch (error: any) {
      console.error("Error loading cards:", error);
      return res.status(500).json({ message: "Error loading cards", error: error.message });
    }
  });
  
  // Load sample cards from local JSON file
  app.post("/api/cards/load-sample", async (req, res) => {
    try {
      // Import necessary modules
      const fs = require('fs');
      const path = require('path');
      
      // Construct path to sample data file
      const dataFilePath = path.join(__dirname, '..', 'data', 'mtg-sample.json');
      console.log(`Loading cards from ${dataFilePath}`);
      
      // Check if file exists
      if (!fs.existsSync(dataFilePath)) {
        return res.status(404).json({ message: "Sample data file not found" });
      }
      
      // Read and parse the sample data file
      const rawData = fs.readFileSync(dataFilePath, 'utf8');
      const cardData = JSON.parse(rawData);
      
      // Process the data
      const processedCards = await processCardData(cardData);
      console.log(`Processed ${processedCards.length} sample cards`);
      
      return res.json({ 
        message: "Sample cards loaded successfully", 
        count: processedCards.length 
      });
    } catch (error: any) {
      console.error("Error loading sample cards:", error);
      return res.status(500).json({ 
        message: "Error loading sample cards", 
        error: error.message 
      });
    }
  });

  // Load cards from MTGJSON API
  app.post("/api/cards/load-mtgjson", async (req, res) => {
    try {
      console.log("Starting MTGJSON initialization...");
      // Force refresh if requested
      const forceRefresh = req.body.forceRefresh === true;
      
      // Add a specific update for Lightning Bolt and other cards with missing data
      const addMissingCardData = req.body.fixMissingData === true;
      
      if (addMissingCardData) {
        try {
          console.log("Fixing missing card data for specific cards...");
          
          // First check for Lightning Bolt
          const lightningBolt = await storage.getCard('lightning-bolt');
          
          if (lightningBolt && !lightningBolt.rarity) {
            console.log("Found Lightning Bolt with missing rarity, updating...");
            
            // Update Lightning Bolt with correct rarity and image URL
            const updatedBolt = {
              ...lightningBolt,
              rarity: "Common",
              imageUrl: "https://cards.scryfall.io/large/front/a/8/a83d5558-a9d1-4c20-9113-bdaeefd30b19.jpg"
            };
            
            // Store the updated card
            await storage.storeCards([updatedBolt]);
            console.log("Updated Lightning Bolt with missing data");
          }
          
          // Return special message
          return res.json({
            message: "Fixed missing card data for specific cards",
            fixedCards: ["lightning-bolt"]
          });
        } catch (fixError: any) {
          console.error("Error fixing missing card data:", fixError);
        }
      }
      
      // Start initialization in the background
      mtgJsonService.initialize(forceRefresh)
        .then(() => {
          console.log("MTGJSON initialization completed successfully");
        })
        .catch(err => {
          console.error("MTGJSON initialization failed:", err);
        });
      
      // Return immediately since initialization can take time
      return res.json({ 
        message: "MTGJSON initialization started in the background", 
        forceRefresh
      });
    } catch (error: any) {
      console.error("Error starting MTGJSON initialization:", error);
      return res.status(500).json({ 
        message: "Error starting MTGJSON initialization", 
        error: error.message 
      });
    }
  });
  
  // Download and process AllPrintings.json from MTGJSON.com
  // Complete card database update to get all 31,000+ cards
  app.post("/api/admin/complete-card-database-update", async (req, res) => {
    try {
      console.log("Starting complete card database update from AllPrintings.json...");
      
      // This downloads AllPrintings.json and processes all cards
      const result = await mtgJsonService.completeCardDatabaseUpdate();
      
      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: result.message
        });
      }
      
      // Get updated card count
      const count = await db.select({ count: sql`COUNT(*)` }).from(cards);
      const cardCount = parseInt(count[0].count as string, 10);
      
      return res.status(200).json({
        success: true,
        message: `Complete card database update successful. The database now contains ${cardCount} cards.`,
        cardCount
      });
    } catch (error: any) {
      console.error("Error in complete card database update:", error);
      
      return res.status(500).json({
        success: false,
        message: "Error in complete card database update",
        error: error.message
      });
    }
  });

  // Update rules database endpoint
  app.post("/api/rules/update", async (req: Request, res: Response) => {
    try {
      const { updateRulesFromFile } = await import('./rules-updater');
      await updateRulesFromFile();
      res.json({ message: "Rules database updated successfully" });
    } catch (error) {
      console.error("Error updating rules:", error);
      res.status(500).json({ message: "Failed to update rules database", error: error.message });
    }
  });

  app.post("/api/cards/download-all-printings", async (req, res) => {
    try {
      console.log("Starting download of AllPrintings.json from MTGJSON.com...");
      
      // Force re-download even if file exists
      const forceDownload = req.body.forceDownload === true;
      
      // Check if data directory exists, create if not
      const dataDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        console.log("Created data directory");
      }
      
      // Use the RarityRepairService to download AllPrintings.json
      const downloadSuccess = await rarityRepairService.downloadAllPrintings();
      
      if (!downloadSuccess) {
        return res.status(500).json({
          success: false,
          message: "Failed to download AllPrintings.json from MTGJSON.com"
        });
      }
      
      console.log("AllPrintings.json downloaded successfully. Initializing card database...");
      
      // After downloading, initialize the database with the new data
      // This runs in the background as it can take some time
      rarityRepairService.initialize()
        .then(() => {
          console.log("Card database initialization started");
          
          // Fix all rarities using the downloaded data
          return rarityRepairService.fixAllRaritiesFromAtomicCards();
        })
        .then((results) => {
          console.log(`Rarity repair completed: ${results.fixed} cards fixed, ${results.unchanged} unchanged, ${results.errors} errors`);
        })
        .catch(err => {
          console.error("Error in database initialization or rarity repair:", err);
        });
      
      // Return success immediately since the processing continues in the background
      return res.json({
        success: true,
        message: "AllPrintings.json downloaded successfully. Card database update started in the background."
      });
    } catch (error: any) {
      console.error("Error downloading or processing AllPrintings.json:", error);
      return res.status(500).json({
        success: false,
        message: "Error downloading or processing AllPrintings.json",
        error: error.message
      });
    }
  });
  
  // Get popular cards
  app.get("/api/cards/popular", async (req, res) => {
    try {
      const popularCards = await mtgJsonService.getPopularCards();
      res.json(popularCards);
    } catch (error: any) {
      console.error("Error fetching popular cards:", error);
      res.status(500).json({ message: "Error fetching popular cards", error: error.message });
    }
  });
  
  // Get all available formats
  app.get("/api/formats", async (req, res) => {
    try {
      const formats = await storage.getFormats();
      res.json(formats);
    } catch (error: any) {
      console.error("Error fetching formats:", error);
      res.status(500).json({ message: "Error fetching formats", error: error.message });
    }
  });
  
  // Get all available sets
  app.get("/api/sets", async (req, res) => {
    try {
      const sets = await storage.getSets();
      res.json(sets);
    } catch (error: any) {
      console.error("Error fetching sets:", error);
      res.status(500).json({ message: "Error fetching sets", error: error.message });
    }
  });
  
  // Get cards by format
  app.get("/api/formats/:format/cards", async (req, res) => {
    try {
      const format = req.params.format;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string) : 20;
      const query = typeof req.query.query === 'string' ? req.query.query : "";
      
      // If search query is provided, use the more flexible findCards method with format filter
      if (query) {
        // First check if the card exists at all in our database
        const allCards = await storage.findCards(query);
        const formatCards = await storage.findCards(query, { format });
        
        // If we found the card but not in this format, provide helpful feedback
        if (allCards.length > 0 && formatCards.length === 0) {
          // Check if any of the found cards have the exact name match
          const exactMatch = allCards.find(card => 
            card.name.toLowerCase() === query.toLowerCase()
          );
          
          if (exactMatch) {
            // Return an empty array with a special message property
            return res.json([]);
          }
        }
        
        return res.json(formatCards);
      }
      
      // Otherwise use the specialized format method
      const cards = await storage.getCardsByFormat(format, page, pageSize);
      res.json(cards);
    } catch (error: any) {
      console.error("Error fetching cards by format:", error);
      res.status(500).json({ message: "Error fetching cards by format", error: error.message });
    }
  });

  // DEPRECATED: Card search endpoint for autocomplete - Use /api/search/cards instead
  app.get("/api/cards/search", async (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : "";
      const includeAllSets = req.query.include_all_sets === 'true';
      
      if (!q || q.length < 2) {
        return res.json([]);
      }
      
      // Get additional filters, particularly for set filtering
      const filters: any = {};
      
      // If include_all_sets is true, make sure we don't filter by set
      if (!includeAllSets) {
        if (typeof req.query.set === 'string' && req.query.set) {
          filters.set = req.query.set;
        }
      }
      
      // Only search by name for autocomplete
      const cards = await storage.findCards(q, filters);
      
      // Don't deduplicate if we're explicitly requesting all sets
      let prioritizedCards = [];
      
      if (includeAllSets) {
        // For deck builder with include_all_sets, we want ALL cards including newer sets
        prioritizedCards = [...cards];
        
        // Check for exact matches first, prioritizing basic lands
        // Also check double-faced cards by their front face name
        const exactMatch = cards.find(card => {
          const fullName = card.name.toLowerCase();
          const frontFaceName = fullName.includes('//') ? fullName.split('//')[0].trim() : fullName;
          return fullName === q.toLowerCase() || frontFaceName === q.toLowerCase();
        });
        
        const basicLandExactMatch = cards.find(card => {
          const fullName = card.name.toLowerCase();
          const frontFaceName = fullName.includes('//') ? fullName.split('//')[0].trim() : fullName;
          return (fullName === q.toLowerCase() || frontFaceName === q.toLowerCase()) &&
                 card.type?.toLowerCase().includes('basic land');
        });
        
        if (basicLandExactMatch) {
          // Prioritize basic lands for exact matches
          prioritizedCards = [
            basicLandExactMatch,
            ...cards.filter(card => card.id !== basicLandExactMatch.id)
          ];
        } else if (exactMatch) {
          // Move exact match to the front
          prioritizedCards = [
            exactMatch,
            ...cards.filter(card => card.id !== exactMatch.id)
          ];
        }
      } else {
        // For regular search, deduplicate and prioritize best versions
        const cardNames = new Set(cards.map(card => card.name.toLowerCase()));
        const bestVersionsByName = new Map();
        
        // Process each card to find the best version
        cards.forEach(card => {
          const cardName = card.name.toLowerCase();
          
          // Special prioritization for basic lands - always include them
          if (card.type?.toLowerCase().includes('basic land')) {
            if (!bestVersionsByName.has(cardName)) {
              bestVersionsByName.set(cardName, card);
            }
          } else {
            // Check if this card is better than the current best version
            if (!bestVersionsByName.has(cardName) || 
                isPrioritizedVersion(card, bestVersionsByName.get(cardName))) {
              bestVersionsByName.set(cardName, card);
            }
          }
        });
        
        // Get the best versions
        prioritizedCards = Array.from(bestVersionsByName.values());
        
        // Check for exact or nearly exact matches, including front face of double-faced cards
        const exactMatch = prioritizedCards.find(card => {
          const fullName = card.name.toLowerCase();
          const frontFaceName = fullName.includes('//') ? fullName.split('//')[0].trim() : fullName;
          return fullName === q.toLowerCase() || frontFaceName === q.toLowerCase();
        });
        
        const closeMatches = prioritizedCards.filter(card => 
          card.name.toLowerCase().includes(q.toLowerCase())
        );
        
        // Prioritize basic lands for exact matches
        const basicLands = prioritizedCards.filter(card => 
          card.type?.toLowerCase().includes('basic land') && 
          card.name.toLowerCase() === q.toLowerCase()
        );
        
        // For basic land searches, prioritize them heavily
        if (basicLands.length > 0) {
          prioritizedCards = [
            ...basicLands,
            ...prioritizedCards.filter(card => !basicLands.some(bl => bl.id === card.id))
          ];
        } else if (exactMatch || closeMatches.length > 0) {
          prioritizedCards = [
            ...(exactMatch ? [exactMatch] : []),
            ...closeMatches.filter(card => card.id !== exactMatch?.id)
          ];
        }
      }
      
      // Limit results to 10 cards for autocomplete performance
      const limitedResults = prioritizedCards.slice(0, 10);
      
      // Log search results
      console.log(`Card search for "${q}" found ${cards.length} results, returning ${limitedResults.length}`);
      
      const exactMatch = limitedResults.find(card => 
        card.name.toLowerCase() === q.toLowerCase()
      );
      
      if (exactMatch) {
        console.log(`Found exact match: ${exactMatch.name} (ID: ${exactMatch.id})`);
      }
      
      res.json(limitedResults);
    } catch (error: any) {
      console.error("Error searching cards:", error);
      res.status(500).json({ message: "Error searching cards", error: error.message });
    }
  });
  
  // Helper function to determine if a card version should be prioritized over another
  function isPrioritizedVersion(card: any, existingCard: any): boolean {
    if (!existingCard) return true;
    
    // Prioritize cards with an image
    if (card.imageUrl && !existingCard.imageUrl) return true;
    
    // Prioritize newer sets (generally have more accurate data)
    // These set codes are roughly in reverse chronological order
    const setOrder = [
      // Adding Tarkir Dragonstorm and newer Alchemy sets
      'TDM', 'YTDM', 'LTK', 'YLTK', 'POW', 'YPOW',
      // Standard sets in chronological order (newest first)
      'OTJ', 'MKM', 'WOE', 'LCI', 'MOM', 'ONE', 'BRO', 'DMU',  
      'WHO', 'SNC', 'NEO', 'VOW', 'MID', 'AFR', 'STX', 'KHM',
      // Alchemy sets
      'YOTJ', 'YMKM', 'YWOE', 'YLCI', 'YMOM', 'YONE', 'YBRO', 'YDMU',
      'YDFT', 'YDSK', 'YBLB', 'YSNC', 'YNEO', 'YVOW', 'YMID', 'YAFR'
    ];
    
    const cardSetIndex = setOrder.indexOf(card.set);
    const existingSetIndex = setOrder.indexOf(existingCard.set);
    
    // If both sets are in our priority list, use the newer one
    if (cardSetIndex !== -1 && existingSetIndex !== -1) {
      return cardSetIndex < existingSetIndex; // Lower index = newer set
    }
    
    // If only one card is in the priority list, choose that one
    if (cardSetIndex !== -1) return true;
    if (existingSetIndex !== -1) return false;
    
    // Default behavior: keep existing card
    return false;
  }

  // DEPRECATED: Get all cards endpoint - Use /api/search/cards instead
  app.get("/api/cards", async (req, res) => {
    try {
      // Parse query parameters with proper defaults
      const query = typeof req.query.query === 'string' ? req.query.query : "";
      const color = typeof req.query.color === 'string' ? req.query.color : "";
      const type = typeof req.query.type === 'string' ? req.query.type : "";
      const rarity = typeof req.query.rarity === 'string' ? req.query.rarity : "";
      const cmc = typeof req.query.cmc === 'string' ? req.query.cmc : "";
      const format = typeof req.query.format === 'string' ? req.query.format : "";
      const set = typeof req.query.set === 'string' ? req.query.set : "";
      
      console.log("Search filters:", { query, color, type, rarity, cmc, format, set });
      
      // Pass all filter parameters to the storage method
      const cards = await storage.findCards(query, { color, type, rarity, cmc, format, set });
      
      // Log result count for debugging
      console.log(`Found ${cards.length} cards matching filters`);
      
      // Import the getCardImageUrl function dynamically to avoid circular dependencies
      const { processCardData } = await import('./mtg/card-service');
      
      // Ensure all returned cards have proper image URLs using our dedicated function
      const cardsWithImages = cards.map(card => {
        if (!card.imageUrl || 
            card.imageUrl.includes('gatherer.wizards.com') || 
            card.imageUrl.includes('0000000-0000-0000-0000')) {
          // Use our official card image URL generator
          const knownCards: Record<string, string> = {
            'counterspell': 'https://cards.scryfall.io/large/front/1/b/1b1fc138-efb8-4497-bd93-77ac9b45ce07.jpg',
            'lightning bolt': 'https://cards.scryfall.io/large/front/f/2/f29ba16f-c8fb-42fe-aabf-87089cb214a7.jpg',
            'wrath of god': 'https://cards.scryfall.io/large/front/6/6/664e6656-36a3-4635-9f33-9f8901afd397.jpg',
            'black lotus': 'https://cards.scryfall.io/large/front/b/d/bd8fa327-dd41-4737-8f19-2cf5eb1f7cdd.jpg',
            'day of judgment': 'https://cards.scryfall.io/large/front/e/9/e9ed0c2a-d6f5-4256-9ec3-d9f7b8e6d6a5.jpg',
            'innkeeper\'s talent': 'https://cards.scryfall.io/large/front/4/2/426f57e5-45a7-4444-a3a4-4a1cbd346d2c.jpg',
            'hunter\'s talent': 'https://cards.scryfall.io/large/front/a/0/a0cab2e2-1cd3-4a7b-b922-906f3bf08760.jpg'
          };
          
          if (knownCards[card.name.toLowerCase()]) {
            card.imageUrl = knownCards[card.name.toLowerCase()];
          } else {
            card.imageUrl = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}&format=image&version=large`;
          }
        }
        return card;
      });
      
      res.json(cardsWithImages);
    } catch (error: any) {
      console.error("Error fetching cards:", error);
      res.status(500).json({ message: "Error fetching cards", error: error.message });
    }
  });

  // DEPRECATED: Enhanced card search endpoint - Use /api/search/cards instead
  app.get("/api/cards/enhanced-search", async (req: Request, res: Response) => {
    try {
      const query = req.query.q as string;
      
      if (!query || query.length < 2) {
        return res.status(400).json({ error: "Search query must be at least 2 characters" });
      }
      
      // First try our local database
      let cards = await storage.findCards(query);
      
      // If we don't have enough results, supplement with GraphQL API
      if (cards.length < 5) {
        console.log(`Limited results (${cards.length}) for "${query}" from database, checking GraphQL API...`);
        const graphqlCards = await searchCardsWithGraphQL(query);
        
        // Avoid duplicates by checking both IDs and names (case-insensitive)
        const existingIds = new Set(cards.map(card => card.id));
        const existingNames = new Set(cards.map(card => card.name.toLowerCase()));
        const uniqueGraphqlCards = graphqlCards.filter(card => 
          !existingIds.has(card.id) && !existingNames.has(card.name.toLowerCase())
        );
        
        // Combine results
        cards = [...cards, ...uniqueGraphqlCards];
        console.log(`Added ${uniqueGraphqlCards.length} cards from GraphQL API`);
      }
      
      res.json(cards);
    } catch (error) {
      console.error("Error in enhanced card search:", error);
      res.status(500).json({ error: "Failed to search cards" });
    }
  });

  // Resolve card names from IDs endpoint
  app.post("/api/cards/resolve-names", async (req, res) => {
    try {
      const { cardIds } = req.body;
      if (!Array.isArray(cardIds)) {
        return res.status(400).json({ error: "cardIds must be an array" });
      }

      const resolvedCards = [];
      for (const cardId of cardIds) {
        try {
          const [card] = await db.select({ id: cards.id, name: cards.name })
            .from(cards)
            .where(eq(cards.id, cardId))
            .limit(1);
          
          if (card) {
            resolvedCards.push({ id: cardId, name: card.name });
          } else {
            resolvedCards.push({ id: cardId, name: cardId.replace(/-/g, ' ') });
          }
        } catch (error) {
          resolvedCards.push({ id: cardId, name: cardId.replace(/-/g, ' ') });
        }
      }

      res.json(resolvedCards);
    } catch (error) {
      console.error("Error resolving card names:", error);
      res.status(500).json({ error: "Failed to resolve card names" });
    }
  });

  // Get single card endpoint
  app.get("/api/cards/:id", async (req, res) => {
    try {
      const card = await storage.getCard(req.params.id);
      if (!card) {
        return res.status(404).json({ message: "Card not found" });
      }
      
      // Ensure card has a reliable image URL
      if (!card.imageUrl || 
          card.imageUrl.includes('gatherer.wizards.com') || 
          card.imageUrl.includes('0000000-0000-0000-0000')) {
        
        // Use hardcoded URLs for known problematic cards
        const knownCards: Record<string, string> = {
          'counterspell': 'https://cards.scryfall.io/large/front/1/b/1b1fc138-efb8-4497-bd93-77ac9b45ce07.jpg',
          'lightning bolt': 'https://cards.scryfall.io/large/front/f/2/f29ba16f-c8fb-42fe-aabf-87089cb214a7.jpg',
          'wrath of god': 'https://cards.scryfall.io/large/front/6/6/664e6656-36a3-4635-9f33-9f8901afd397.jpg',
          'black lotus': 'https://cards.scryfall.io/large/front/b/d/bd8fa327-dd41-4737-8f19-2cf5eb1f7cdd.jpg',
          'day of judgment': 'https://cards.scryfall.io/large/front/e/9/e9ed0c2a-d6f5-4256-9ec3-d9f7b8e6d6a5.jpg',
          'innkeeper\'s talent': 'https://cards.scryfall.io/large/front/4/2/426f57e5-45a7-4444-a3a4-4a1cbd346d2c.jpg',
          'hunter\'s talent': 'https://cards.scryfall.io/large/front/a/0/a0cab2e2-1cd3-4a7b-b922-906f3bf08760.jpg'
        };
        
        if (knownCards[card.name.toLowerCase()]) {
          card.imageUrl = knownCards[card.name.toLowerCase()];
        } else {
          // Use Scryfall's API for image fetching which is the most reliable approach
          card.imageUrl = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}&format=image&version=large`;
        }
      }
      
      res.json(card);
    } catch (error: any) {
      console.error("Error fetching card:", error);
      res.status(500).json({ message: "Error fetching card", error: error.message });
    }
  });

  // AI ruling endpoints
  app.post("/api/rulings/ask", async (req, res) => {
    try {
      const { question, cardId, cardIds } = req.body;
      
      if (!question) {
        return res.status(400).json({ message: "Question is required" });
      }

      // Primary card for the ruling (can be null)
      let primaryCard = null;
      if (cardId) {
        primaryCard = await storage.getCard(cardId);
      }
      
      // Additional cards mentioned in the question
      let mentionedCards: Card[] = [];
      if (cardIds && Array.isArray(cardIds) && cardIds.length > 0) {
        const cardPromises = cardIds.map(id => storage.getCard(id));
        const cards = await Promise.all(cardPromises);
        mentionedCards = cards.filter(card => card !== null) as Card[];
        
        // If no primary card is set but we have mentioned cards, use the first one as primary
        if (!primaryCard && mentionedCards.length > 0) {
          primaryCard = mentionedCards[0];
          // Remove primary card from mentioned cards to avoid duplication
          mentionedCards = mentionedCards.slice(1);
        }
      }

      // Add the user's question to the conversation
      currentConversation.push({ role: "user", content: question });
      
      // Get AI response with primary and mentioned cards
      const answer = await getCardRuling(question, primaryCard, currentConversation, mentionedCards);
      
      // Add AI response to conversation
      currentConversation.push({ role: "assistant", content: answer });
      
      // Keep conversation history manageable (limit to last 10 messages)
      if (currentConversation.length > 10) {
        currentConversation = currentConversation.slice(
          currentConversation.length - 10
        );
      }
      
      res.json({ role: "assistant", content: answer });
    } catch (error: any) {
      console.error("Error getting ruling:", error);
      res.status(500).json({ message: "Error getting ruling", error: error.message });
    }
  });

  // Get conversation history
  app.get("/api/rulings/conversation", (req, res) => {
    try {
      const formattedConversation = currentConversation.map(message => ({
        role: message.role === "user" ? "user" : "assistant",
        content: message.content
      }));
      
      res.json(formattedConversation);
    } catch (error: any) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ message: "Error fetching conversation", error: error.message });
    }
  });

  // Start new conversation
  app.post("/api/rulings/new-conversation", (req, res) => {
    try {
      currentConversation = [];
      res.json({ message: "New conversation started" });
    } catch (error: any) {
      console.error("Error starting new conversation:", error);
      res.status(500).json({ message: "Error starting new conversation", error: error.message });
    }
  });

  // Initialize the rules service - but only after database schema is ready
  setTimeout(async () => {
    try {
      // Check if database tables exist first
      const { checkDatabaseHealth } = await import('./database-initializer');
      const health = await checkDatabaseHealth();
      
      if (health.connected && health.tablesExist) {
        console.log("📚 Database schema verified - initializing rules service");
        await rulesService.initialize();
      } else {
        console.log("⚠️ Database schema not ready - skipping rules service initialization");
        console.log("   Database status:", health);
      }
    } catch (err) {
      console.error("Error checking database before rules initialization:", err);
    }
  }, 5000); // Wait 5 seconds for database initialization

  // Rules API endpoints
  app.get("/api/rules", async (req, res) => {
    try {
      const query = typeof req.query.query === 'string' ? req.query.query : "";
      const rules = await rulesService.searchRules(query);
      
      res.json(rules);
    } catch (error: any) {
      console.error("Error searching rules:", error);
      res.status(500).json({ message: "Error searching rules", error: error.message });
    }
  });

  app.get("/api/rules/:ruleNumber", async (req, res) => {
    try {
      const rule = await rulesService.getRuleByNumber(req.params.ruleNumber);
      if (!rule) {
        return res.status(404).json({ message: "Rule not found" });
      }
      
      res.json(rule);
    } catch (error: any) {
      console.error("Error fetching rule:", error);
      res.status(500).json({ message: "Error fetching rule", error: error.message });
    }
  });

  app.post("/api/rules/semantic-search", async (req, res) => {
    try {
      const { query } = req.body;
      
      if (!query) {
        return res.status(400).json({ message: "Query is required" });
      }
      
      const result = await rulesService.semanticRuleSearch(query);
      res.json(result);
    } catch (error: any) {
      console.error("Error performing semantic rule search:", error);
      res.status(500).json({ message: "Error performing semantic rule search", error: error.message });
    }
  });
  
  // Test endpoint for the trained AI on MTG rules
  app.post("/api/rules/ai-interpret", async (req, res) => {
    try {
      const { question, cardId } = req.body;
      
      if (!question) {
        return res.status(400).json({ message: "Question is required" });
      }
      
      // Get card if ID is provided
      let card = null;
      if (cardId) {
        card = await storage.getCard(cardId);
      }
      
      // For mechanic questions, also search for related cards to provide better context
      const lowerQuestion = question.toLowerCase();
      let relatedCards = [];
      
      // Check if this is asking about a specific mechanic
      if (lowerQuestion.includes('mechanic') || lowerQuestion.includes('ability')) {
        // Extract potential mechanic names from the question
        const mechanicKeywords = ['void', 'devoid', 'warp', 'surveil', 'menace', 'lifelink', 'flash', 'vigilance', 'station'];
        const foundMechanics = mechanicKeywords.filter(keyword => lowerQuestion.includes(keyword));
        
        if (foundMechanics.length > 0) {
          // For newer mechanics, prioritize cards from recent sets with actual mechanics
          for (const mechanic of foundMechanics) {
            if (['void', 'station', 'warp'].includes(mechanic)) {
              // For newer mechanics, search specifically in EOE/FIN sets first
              const eoeCards = await storage.findCards('', { set: 'EOE' });
              const mechanicCards = eoeCards.filter(card => 
                card.text && card.text.toLowerCase().includes(mechanic) && 
                card.text.toLowerCase().includes('—') // Look for actual mechanic syntax
              );
              relatedCards.push(...mechanicCards.slice(0, 4) as Card[]); // More examples for newer mechanics
            } else {
              // For established mechanics, regular search is fine
              const mechanicCards = await storage.findCards(mechanic);
              relatedCards.push(...mechanicCards.slice(0, 2) as Card[]); // Fewer examples for known mechanics
            }
          }
        }
      }
      
      // Empty conversation history for this endpoint
      const emptyConversation: Array<{ role: string; content: string }> = [];
      
      // Get AI response with rules focus, including related cards for context
      const answer = await getCardRuling(question, card, emptyConversation, relatedCards);
      
      res.json({ 
        answer,
        cardUsed: card ? card.name : null,
        relatedCardsFound: relatedCards.length
      });
    } catch (error: any) {
      console.error("Error getting AI rule interpretation:", error);
      res.status(500).json({ message: "Error getting AI rule interpretation", error: error.message });
    }
  });
  
  // Admin route to import the comprehensive MTG rules
  // Admin login endpoint
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      // Validate input
      if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password are required' });
      }
      
      // In a real app, these would be stored securely in a database
      // For this demo, we're using hardcoded credentials
      const ADMIN_USERNAME = 'admin';
      // This is a hashed version of "magicrulings123"
      const ADMIN_PASSWORD_HASH = '$2b$10$NSOprSp685roIDuokizw1.oSKF6fCodNRUFntUcUSwX5l9RqrakT6';
      
      // Check username
      if (username !== ADMIN_USERNAME) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }
      
      // Check password using bcrypt
      const passwordMatch = await import('bcrypt').then(bcrypt => 
        bcrypt.compare(password, ADMIN_PASSWORD_HASH)
      );
      
      if (!passwordMatch) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }
      
      // If credentials are valid, send success response
      return res.status(200).json({ 
        success: true, 
        message: 'Login successful'
      });
    } catch (error) {
      console.error('Error during admin login:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  app.post("/api/admin/import-rules", async (req, res) => {
    try {
      // Clear the existing rules first
      await db.delete(rulesTable);
      console.log('Cleared existing rules from database');
      
      // Import the comprehensive rules
      await rulesService.importComprehensiveRules();
      
      res.json({ success: true, message: 'Comprehensive rules imported successfully' });
    } catch (error: any) {
      console.error('Error importing comprehensive rules:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Error importing comprehensive rules',
        details: error.message 
      });
    }
  });
  
  // Generate deck suggestions with AI
  app.post("/api/decks/generate", async (req, res) => {
    try {
      const { format, prompt, commander, deckSize, maxCopies } = req.body;
      
      if (!format || !prompt) {
        return res.status(400).json({ 
          success: false, 
          message: "Format and prompt are required" 
        });
      }
      
      const deckSuggestion = await generateDeckSuggestion({
        format,
        prompt,
        commander,
        deckSize: deckSize || 60,
        maxCopies: maxCopies || 4
      });
      
      res.json(deckSuggestion);
    } catch (err) {
      console.error("Error generating deck suggestions:", err);
      res.status(500).json({ 
        success: false, 
        message: "Failed to generate deck suggestions" 
      });
    }
  });
  
  // Special endpoint for admin to verify specific rules
  // Get database metadata
  app.get("/api/metadata", async (req, res) => {
    try {
      // Get database metadata
      const [metadata] = await db.select().from(dbMetadata).where(eq(dbMetadata.id, "card_database"));
      
      if (!metadata) {
        // If no metadata exists yet, get card count and create default metadata
        const countResult = await db.select({ count: sql`COUNT(*)` }).from(cards);
        const cardCount = parseInt(countResult[0].count as string, 10);
        
        const newMetadata = {
          id: "card_database",
          last_updated: new Date(),
          total_cards: cardCount,
          description: "Initial database metadata"
        };
        
        await db.insert(dbMetadata).values(newMetadata);
        return res.json(newMetadata);
      }
      
      res.json(metadata);
    } catch (error: any) {
      console.error("Error fetching database metadata:", error);
      res.status(500).json({ message: "Error fetching database metadata", error: error.message });
    }
  });

  app.get("/api/admin/rule-test/:ruleNumber", async (req, res) => {
    try {
      const ruleNumber = req.params.ruleNumber;
      const rule = await rulesService.getRuleByNumber(ruleNumber);
      
      if (rule) {
        res.status(200).json({ 
          found: true, 
          rule: rule,
          message: `Found rule ${ruleNumber}` 
        });
      } else {
        res.status(404).json({ 
          found: false, 
          message: `Rule ${ruleNumber} not found in database` 
        });
      }
    } catch (error: any) {
      console.error(`Error testing rule:`, error);
      res.status(500).json({ message: "Error testing rule", error: error.message });
    }
  });
  
  // Repair card rarities endpoint
  app.post("/api/repair-rarities", async (req, res) => {
    try {
      const { cardId, query, batchProcess, downloadData } = req.body;
      
      // Import the rarity repair service
      const { rarityRepairService } = await import('./mtg/rarity-repair');
      await rarityRepairService.initialize();
      
      // Download AllPrintings.json if requested
      if (downloadData) {
        console.log("Starting download of AllPrintings.json...");
        try {
          const downloadResult = await rarityRepairService.downloadAllPrintings();
          return res.json({
            success: downloadResult,
            message: downloadResult ? 
              "Successfully downloaded AllPrintings.json data" : 
              "Failed to download AllPrintings.json"
          });
        } catch (downloadError) {
          console.error("Error downloading AllPrintings.json:", downloadError);
          return res.status(500).json({
            success: false,
            error: "Failed to download AllPrintings.json: " + (downloadError as Error).message
          });
        }
      }
      
      if (batchProcess) {
        // Process all cards using AllPrintings.json or falling back to AtomicCards.json
        console.log("Starting batch rarity repair process using multiple data sources...");
        const batchSize = parseInt(req.body.batchSize) || 500;
        const result = await rarityRepairService.fixAllRaritiesFromAtomicCards(batchSize);
        
        return res.json({
          success: true,
          message: `Batch processed ${result.processed} cards with missing rarity information`,
          result
        });
      } else if (cardId) {
        // Fix a specific card
        const fixed = await rarityRepairService.fixCardById(cardId);
        if (fixed) {
          return res.json({ success: true, message: `Fixed rarity for card ${cardId}` });
        } else {
          return res.json({ success: false, message: `Card ${cardId} rarity already correct or card not found` });
        }
      } else if (query) {
        // Fix cards matching a query
        const fixedCount = await rarityRepairService.fixRarityForQuery(query);
        return res.json({ 
          success: true, 
          message: `Checked and fixed rarities for ${fixedCount} cards matching "${query}"` 
        });
      } else {
        // Check for issues in the database
        const rarityIssues = await rarityRepairService.scanForRarityIssues();
        
        // Also fix Hunter's Talent as a known problem card
        const huntersTalentFixed = await rarityRepairService.fixCardById('hunter-s-talent');
        
        return res.json({
          success: true,
          huntersTalentFixed,
          missingRarityCount: rarityIssues.missingRarity,
          sampleCards: {
            common: rarityIssues.commonCardIds.slice(0, 5),
            uncommon: rarityIssues.uncommonCardIds.slice(0, 5),
            rare: rarityIssues.rareCardIds.slice(0, 5),
            mythic: rarityIssues.mythicCardIds.slice(0, 5)
          }
        });
      }
    } catch (error: any) {
      console.error("Error repairing card rarities:", error);
      return res.status(500).json({ 
        error: "Error repairing card rarities", 
        message: error.message 
      });
    }
  });

  // Batch card endpoint for deck viewing
  app.post('/api/cards/batch', async (req: Request, res: Response) => {
    try {
      const { cardIds } = req.body;
      
      if (!Array.isArray(cardIds)) {
        return res.status(400).json({ error: 'cardIds must be an array' });
      }

      const cards = await Promise.all(
        cardIds.map(async (cardId: string) => {
          try {
            return await storage.getCard(cardId);
          } catch (error) {
            console.error(`Error fetching card ${cardId}:`, error);
            return null;
          }
        })
      );

      // Filter out null results and fix image URLs for double-faced cards
      const validCards = cards.filter(card => card !== null).map(card => {
        if (card && (!card.imageUrl || card.imageUrl.includes('card-backs') || card.imageUrl.includes('0000000-0000-0000-0000'))) {
          // Handle double-faced cards - use only the front face name
          let cardName = card.name;
          if (cardName && cardName.includes('//')) {
            cardName = cardName.split('//')[0].trim();
          }
          card.imageUrl = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}&format=image&version=large`;
        }
        return card;
      });
      
      res.json(validCards);
    } catch (error) {
      console.error('Error in batch card fetch:', error);
      res.status(500).json({ error: 'Failed to fetch cards' });
    }
  });

  // Individual deck endpoint for public viewing - placed after other deck routes
  app.get('/api/deck/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({ error: 'Deck ID is required' });
      }

      const deck = await DeckService.getDeck(id, undefined);
      
      if (!deck) {
        return res.status(404).json({ error: 'Deck not found' });
      }

      // Only return public decks or user's own decks
      if (!deck.isPublic) {
        return res.status(403).json({ error: 'This deck is private' });
      }

      res.json(deck);
    } catch (error) {
      console.error('Error fetching deck:', error);
      res.status(500).json({ error: 'Failed to fetch deck' });
    }
  });

  // Simple health check endpoint for Railway.app (no database dependency)
  app.get("/api/health", (req, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime()
    });
  });

  // Database initialization endpoint for Railway deployment
  app.post("/api/admin/init-database", async (req, res) => {
    try {
      console.log("🔧 Manual database initialization requested...");
      
      const { initializeDatabaseSchema, checkDatabaseHealth } = await import('./database-initializer');
      
      // Check current database status
      const healthBefore = await checkDatabaseHealth();
      console.log("Database status before initialization:", healthBefore);
      
      // Initialize schema
      const initialized = await initializeDatabaseSchema();
      
      if (!initialized) {
        return res.status(500).json({
          success: false,
          message: "Failed to initialize database schema"
        });
      }
      
      // Check status after initialization
      const healthAfter = await checkDatabaseHealth();
      console.log("Database status after initialization:", healthAfter);
      
      res.json({
        success: true,
        message: "Database schema initialized successfully",
        before: healthBefore,
        after: healthAfter
      });
    } catch (error: any) {
      console.error("Error initializing database:", error);
      res.status(500).json({
        success: false,
        message: "Database initialization failed",
        error: error.message
      });
    }
  });

  // Force create tables endpoint for Railway troubleshooting
  app.post("/api/admin/create-tables", async (req, res) => {
    try {
      console.log("🔧 Force creating database tables...");
      
      // Import the database initializer
      const { initializeDatabaseSchema } = await import('./database-initializer');
      
      // Import direct database connection
      const { db } = await import('./db');
      
      // Create each table individually with detailed logging
      console.log("Creating sessions table...");
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "sessions" (
          "sid" varchar PRIMARY KEY NOT NULL,
          "sess" jsonb NOT NULL,
          "expire" timestamp NOT NULL
        )
      `);
      
      console.log("Creating users table...");
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
      
      console.log("Creating comprehensive cards table...");
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
      
      console.log("Creating decks table...");
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
      
      console.log("Creating rules table...");
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "rules" (
          "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
          "rule_number" varchar NOT NULL UNIQUE,
          "rule_text" text NOT NULL,
          "created_at" timestamp DEFAULT now(),
          "updated_at" timestamp DEFAULT now()
        )
      `);
      
      console.log("Creating db_metadata table...");
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
      
      console.log("Creating indices...");
      await db.execute(sql`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" ("expire")`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_cards_name" ON "cards" ("name")`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_rules_number" ON "rules" ("rule_number")`);
      
      console.log("Creating comprehensive cards table with full MTGJSON schema...");
      try {
        // Drop the old cards table and recreate with comprehensive schema
        console.log("⚠️ Dropping existing cards table to apply comprehensive schema...");
        await db.execute(sql`DROP TABLE IF EXISTS "cards" CASCADE`);
        
        // Create the comprehensive cards table with full MTGJSON schema
        console.log("🔧 Creating comprehensive cards table...");
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
        
        console.log("✅ Comprehensive cards table schema created successfully");
      } catch (schemaError: any) {
        console.log("⚠️ Cards table schema migration failed:", schemaError.message);
        
        // If dropping fails, try to alter existing table to add missing columns
        try {
          console.log("🔧 Attempting to add missing columns to existing table...");
          
          // Add key missing columns that are most important
          await db.execute(sql`ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "uuid" varchar`);
          await db.execute(sql`ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "set_code" varchar`);
          await db.execute(sql`ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "mana_value" integer`);
          await db.execute(sql`ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "finishes" varchar[]`);
          await db.execute(sql`ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "is_rebalanced" boolean DEFAULT false`);
          await db.execute(sql`ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "foreign_data" jsonb`);
          
          console.log("✅ Added critical missing columns to existing table");
        } catch (alterError: any) {
          console.log("⚠️ Column addition also failed:", alterError.message);
        }
      }
      
      console.log("✅ All tables created successfully");
      
      res.json({
        success: true,
        message: "All database tables created successfully",
        tables: ["sessions", "users", "cards", "decks", "rules", "db_metadata"]
      });
      
    } catch (error: any) {
      console.error("Error creating tables:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create database tables",
        error: error.message
      });
    }
  });

  // Comprehensive MTGJSON import endpoint for Railway deployment
  app.post("/api/admin/import-mtgjson", async (req, res) => {
    try {
      console.log("🔄 Starting comprehensive MTGJSON import for Railway...");
      
      const { MTGJSONImportService } = await import('./mtg/mtgjson-import-service');
      const importService = MTGJSONImportService.getInstance();
      
      // For Railway, we'll trigger the complete database update
      const { MTGJsonService } = await import('./mtg/mtgjson-service');
      const mtgService = MTGJsonService.getInstance();
      
      await mtgService.completeCardDatabaseUpdate();
      
      // Get statistics
      const stats = await importService.getImportStats();
      
      res.json({
        success: true,
        message: "MTGJSON import completed successfully",
        stats: stats
      });
      
    } catch (error: any) {
      console.error("Error importing MTGJSON:", error);
      res.status(500).json({
        success: false,
        message: "MTGJSON import failed",
        error: error.message
      });
    }
  });

  // Get comprehensive import statistics
  app.get("/api/admin/import-stats", async (req, res) => {
    try {
      const { MTGJSONImportService } = await import('./mtg/mtgjson-import-service');
      const importService = MTGJSONImportService.getInstance();
      
      const stats = await importService.getImportStats();
      
      if (stats) {
        res.json({
          success: true,
          stats: stats
        });
      } else {
        res.status(404).json({
          success: false,
          message: "No import statistics available"
        });
      }
      
    } catch (error: any) {
      console.error("Error getting import stats:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get import statistics",
        error: error.message
      });
    }
  });

  // MTGSQLive PostgreSQL import endpoint (recommended MTGJSON approach)
  app.post("/api/admin/import-mtgsqlive", async (req, res) => {
    try {
      console.log("🚀 Starting MTGSQLive PostgreSQL import...");
      
      const { mtgSQLiveService } = await import('./mtg/mtgsqlive-import-service-fixed');
      
      // Start the Railway-compatible import process
      const result = await mtgSQLiveService.importFromMTGJSON();
      
      res.json({
        success: result.success,
        message: result.message,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("❌ MTGSQLive import failed:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // MTGSQLive statistics endpoint
  app.get("/api/admin/mtgsqlive-stats", async (req, res) => {
    try {
      const { mtgSQLiveService } = await import('./mtg/mtgsqlive-import-service');
      const stats = await mtgSQLiveService.getImportStats();
      
      res.json({
        success: true,
        stats: stats
      });
    } catch (error: any) {
      console.error("Error getting MTGSQLive stats:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get MTGSQLive statistics",
        error: error.message
      });
    }
  });

  // Detailed health check with database status
  app.get("/api/health/detailed", async (req, res) => {
    try {
      const health = await healthCheck();
      res.status(200).json(health);
    } catch (error: any) {
      console.error('Detailed health check error:', error);
      res.status(200).json({
        status: 'initializing',
        database: 'connecting',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Register our GraphQL routes for enhanced card access
  registerGraphQLRoutes(app);

  // Register MTGSQLive routes for official schema access
  const { registerMTGSQLiveRoutes } = await import('./routes/mtgsqlive-routes');
  registerMTGSQLiveRoutes(app);
  
  const httpServer = createServer(app);
  
  // Set a long timeout (10 minutes) for handling large file uploads and processing
  httpServer.timeout = 10 * 60 * 1000;
  
  return httpServer;
}
