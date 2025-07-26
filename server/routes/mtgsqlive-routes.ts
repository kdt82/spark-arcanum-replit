/**
 * Routes that use the MTGSQLive official schema
 * These endpoints work directly with MTGJSON's native database structure
 */

import type { Express } from "express";
import { mtgSQLiveStorage } from "../storage-mtgsqlive";

export function registerMTGSQLiveRoutes(app: Express) {
  // Test MTGSQLive connection
  app.get("/api/mtgsqlive/test", async (req, res) => {
    try {
      const isConnected = await mtgSQLiveStorage.testMTGSQLiveConnection();
      
      if (isConnected) {
        res.json({
          success: true,
          message: "MTGSQLive connection successful",
          schema: "Official MTGJSON Schema"
        });
      } else {
        res.status(500).json({
          success: false,
          message: "MTGSQLive connection failed"
        });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "MTGSQLive test failed",
        error: error.message
      });
    }
  });

  // Enhanced search cards using MTGSQLive schema with better ranking
  app.get("/api/mtgsqlive/cards/search", async (req, res) => {
    try {
      const query = typeof req.query.q === 'string' ? req.query.q : '';
      const limit = parseInt(req.query.limit as string) || 100;
      const filters = {
        set: req.query.set as string,
        rarity: req.query.rarity as string,
        colors: req.query.colors ? (req.query.colors as string).split(',') : undefined
      };

      console.log(`MTGSQLive search: "${query}", limit: ${limit}`);

      const cards = await mtgSQLiveStorage.findCards(query, filters, limit);
      
      console.log(`MTGSQLive search returned ${cards.length} cards`);
      
      res.json({
        success: true,
        cards: cards,
        count: cards.length,
        schema: "MTGSQLive Official",
        query: query
      });
    } catch (error: any) {
      console.error('MTGSQLive search error:', error);
      res.status(500).json({
        success: false,
        message: "Card search failed",
        error: error.message
      });
    }
  });

  // Get card by UUID
  app.get("/api/mtgsqlive/cards/:id", async (req, res) => {
    try {
      const card = await mtgSQLiveStorage.getCard(req.params.id);
      
      if (card) {
        res.json({
          success: true,
          card: card,
          schema: "MTGSQLive Official"
        });
      } else {
        res.status(404).json({
          success: false,
          message: "Card not found"
        });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Error retrieving card",
        error: error.message
      });
    }
  });

  // Get sets using MTGSQLive schema
  app.get("/api/mtgsqlive/sets", async (req, res) => {
    try {
      const sets = await mtgSQLiveStorage.getSets();
      
      res.json({
        success: true,
        sets: sets,
        count: sets.length,
        schema: "MTGSQLive Official"
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Error retrieving sets",
        error: error.message
      });
    }
  });

  // Get cards from specific set
  app.get("/api/mtgsqlive/sets/:setCode/cards", async (req, res) => {
    try {
      const cards = await mtgSQLiveStorage.getCardsFromSet(req.params.setCode);
      
      res.json({
        success: true,
        cards: cards,
        count: cards.length,
        setCode: req.params.setCode,
        schema: "MTGSQLive Official"
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Error retrieving cards from set",
        error: error.message
      });
    }
  });
}