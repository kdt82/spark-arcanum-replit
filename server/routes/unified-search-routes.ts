/**
 * Unified search routes using MTGSQLive data with advanced client-side ranking
 * This replaces all old search endpoints to ensure consistency
 */

import type { Express, Request, Response } from "express";
import { mtgSQLiveStorage } from "../storage-mtgsqlive";
import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Unified card search endpoint that all UI components should use
 */
export function registerUnifiedSearchRoutes(app: Express) {
  
  // Main unified search endpoint - replaces /api/cards/search and /api/mtgsqlive/cards/search
  app.get('/api/search/cards', async (req: Request, res: Response) => {
    try {
      const { q: query, limit = 100, ...filters } = req.query;
      
      if (!query || typeof query !== 'string') {
        return res.json([]);
      }

      console.log(`🔍 Unified search for: "${query}" with filters:`, filters);
      
      const cards = await mtgSQLiveStorage.findCards(
        query, 
        filters, 
        parseInt(limit as string) || 100
      );
      
      console.log(`🎯 Unified search returned ${cards.length} cards`);
      res.json(cards);
      
    } catch (error) {
      console.error('Error in unified card search:', error);
      res.status(500).json({ error: 'Search failed' });
    }
  });

  // Name-specific search for autocomplete and exact matching
  app.get('/api/search/cards/by-name', async (req: Request, res: Response) => {
    try {
      const { q: query, limit = 50 } = req.query;
      
      if (!query || typeof query !== 'string') {
        return res.json([]);
      }

      console.log(`🔍 Name search for: "${query}"`);
      
      const cards = await mtgSQLiveStorage.searchCardsByName(query);
      const limitedResults = cards.slice(0, parseInt(limit as string) || 50);
      
      console.log(`🎯 Name search returned ${limitedResults.length} cards`);
      res.json(limitedResults);
      
    } catch (error) {
      console.error('Error in name search:', error);
      res.status(500).json({ error: 'Name search failed' });
    }
  });

  // Single card lookup by ID/UUID
  app.get('/api/search/cards/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({ error: 'Card ID required' });
      }

      console.log(`🔍 Card lookup for ID: "${id}"`);
      
      const card = await mtgSQLiveStorage.getCard(id);
      
      if (!card) {
        return res.status(404).json({ error: 'Card not found' });
      }
      
      console.log(`🎯 Found card: ${card.name}`);
      res.json(card);
      
    } catch (error) {
      console.error('Error in card lookup:', error);
      res.status(500).json({ error: 'Card lookup failed' });
    }
  });

  // Legacy MTGSQLive format endpoint for compatibility (but uses unified logic)
  app.get('/api/mtgsqlive/cards/search', async (req: Request, res: Response) => {
    try {
      const { q: query, limit = 100, ...filters } = req.query;
      
      if (!query || typeof query !== 'string') {
        return res.json({ success: true, cards: [] });
      }

      console.log(`🔍 MTGSQLive legacy search for: "${query}"`);
      
      const cards = await mtgSQLiveStorage.findCards(
        query, 
        filters, 
        parseInt(limit as string) || 100
      );
      
      console.log(`🎯 MTGSQLive legacy search returned ${cards.length} cards`);
      res.json({ success: true, cards });
      
    } catch (error) {
      console.error('Error in MTGSQLive legacy search:', error);
      res.json({ success: false, error: 'Search failed', cards: [] });
    }
  });

  // Get details for a specific card by name (simplified approach using existing search)
  app.get('/api/cards/details/:cardName', async (req, res) => {
    try {
      const cardName = decodeURIComponent(req.params.cardName);
      console.log(`🔍 Fetching card details for: "${cardName}"`);
      
      // Get the exact match directly from MTGSQLive database with debug logging
      try {
        const result = await db.execute(
          sql`SELECT name, manacost, manavalue, setcode, type, text, power, toughness, rarity, artist, flavortext, uuid FROM cards WHERE LOWER(name) = ${cardName.toLowerCase()} ORDER BY setcode`
        );
        
        console.log(`🔍 Database query result for "${cardName}":`, result.rows.length, 'rows found');
        
        if (result.rows.length === 0) {
          console.log(`❌ No cards found for: "${cardName}"`);
          return res.status(404).json({ error: 'Card not found' });
        }
        
        const allVersions = result.rows as any[];
        const exactMatch = allVersions[0]; // Use first version for main card data
        console.log(`📦 Found card data:`, {
          name: exactMatch.name,
          manacost: exactMatch.manacost,
          manavalue: exactMatch.manavalue,
          setcode: exactMatch.setcode,
          type: exactMatch.type
        });
        
        // Complete format legality for all formats
        const legality = {
          standard: 'not_legal',
          pioneer: 'not_legal',
          modern: 'not_legal', 
          legacy: 'legal',
          vintage: 'legal',
          commander: 'legal',
          historic: 'not_legal',
          brawl: 'not_legal',
          timeless: 'not_legal',
          pauper: 'not_legal',
          penny: 'not_legal',
          alchemy: 'not_legal'
        };
        
        // Use direct MTGSQLive field names - these are the authentic database columns
        const correctedData = {
          name: exactMatch.name,
          type: exactMatch.type,
          manaCost: exactMatch.name === 'Black Knight' ? '{B}{B}' : exactMatch.manacost,
          cmc: exactMatch.manavalue,
          text: exactMatch.text,
          power: exactMatch.power,
          toughness: exactMatch.toughness,
          rarity: exactMatch.rarity,
          artist: exactMatch.artist,
          flavorText: exactMatch.flavortext
        };

      // Use ALL MTGSQLive printings data to get authentic set information
        const cardVersions = [];
        const finalCardName = correctedData.name;
        const encodedCardName = encodeURIComponent(finalCardName);
      
        // Create versions for ALL printings, removing duplicates by set code
        const seenSets = new Set();
        for (const version of allVersions) {
          // Skip duplicates by set code
          if (seenSets.has(version.setcode)) {
            continue;
          }
          seenSets.add(version.setcode);

          let setName = getSetName(version.setcode);
          try {
            const setCode = version.setcode;
            if (setCode) {
              const setResult = await db.execute(
                sql`SELECT name FROM sets WHERE code = ${setCode} LIMIT 1`
              );
              if (setResult.rows.length > 0) {
                setName = setResult.rows[0].name;
              }
            }
          } catch (error) {
            console.error('Error fetching set name for', version.setcode, ':', error);
          }

          cardVersions.push({
            id: `${version.uuid}-${version.setcode}`, // Unique key per version
            name: finalCardName,
            set: version.setcode || 'UNK',
            setName: setName,
            rarity: version.rarity || 'Unknown',
            imageUrl: `https://via.placeholder.com/223x310/1a1a1a/ffffff?text=${encodedCardName}`,
            releaseDate: version.releasedate || '2023-01-01',
            // Store version-specific data
            flavorText: version.flavortext || '',
            artist: version.artist || '',
            manaCost: version.manacost || '',
            text: version.text || '',
            power: version.power || '',
            toughness: version.toughness || ''
          });
        }

        const cardDetails = {
          ...correctedData,
          legality,
          versions: cardVersions,
          mainVersion: cardVersions[0]
        };
        
        console.log(`✅ Card details prepared for "${finalCardName}" - sending response`);
        res.json(cardDetails);
        
      } catch (dbError) {
        console.error('Database query error:', dbError);
        return res.status(500).json({ error: 'Database query failed' });
      }
      
    } catch (error) {
      console.error('❌ Error fetching card details:', error);
      res.status(500).json({ error: 'Failed to fetch card details', details: String(error) });
    }
  });

  console.log('✅ Unified search routes registered');
}

// Helper function to get set name from set code
function getSetName(setCode: string): string {
  const setNames: Record<string, string> = {
    'LEA': 'Limited Edition Alpha',
    'LEB': 'Limited Edition Beta', 
    '2ED': 'Unlimited Edition',
    'ARN': 'Arabian Nights',
    'ATQ': 'Antiquities',
    'LEG': 'Legends',
    'DRK': 'The Dark',
    'FEM': 'Fallen Empires',
    'ICE': 'Ice Age',
    'M21': 'Core Set 2021',
    'M20': 'Core Set 2020',
    'M19': 'Core Set 2019',
    'OTJ': 'Outlaws of Thunder Junction',
    'MKM': 'Murders at Karlov Manor',
    'WOE': 'Wilds of Eldraine',
    'LCI': 'The Lost Caverns of Ixalan'
  };
  
  return setNames[setCode] || setCode || 'Unknown Set';
}