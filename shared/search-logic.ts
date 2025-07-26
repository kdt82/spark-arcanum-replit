/**
 * Advanced search logic that prioritizes word matches while maintaining alphabetical order
 * Based on user-provided search algorithm with MTG card optimization
 */

export interface SearchableItem {
  name: string;
  id: string;
  [key: string]: any;
}

export interface SearchResult<T> {
  item: T;
  score: number;
  matchDetails: {
    exactMatches: number;
    partialMatches: number;
    startsWithBonus: boolean;
  };
}

/**
 * Advanced search with granular priority scoring optimized for MTG cards
 */
export function searchWithPriority<T extends SearchableItem>(
  items: T[], 
  searchTerm: string
): T[] {
  if (!searchTerm || searchTerm.trim() === '') {
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }

  const searchWords = searchTerm.toLowerCase().trim().split(/\s+/);
  const results: SearchResult<T>[] = [];

  items.forEach(item => {
    const itemLower = item.name.toLowerCase();
    let score = 0;
    let hasAllWords = true;
    let exactMatches = 0;
    let partialMatches = 0;
    let startsWithBonus = false;

    for (const word of searchWords) {
      if (!itemLower.includes(word)) {
        hasAllWords = false;
        break;
      }

      // Higher score for exact word matches vs partial matches
      const exactWordRegex = new RegExp(`\\b${word}\\b`, 'g');
      const partialMatchCount = (itemLower.match(new RegExp(word, 'g')) || []).length;
      const exactMatchCount = (itemLower.match(exactWordRegex) || []).length;
      
      exactMatches += exactMatchCount;
      partialMatches += partialMatchCount;
      
      // Scoring system (User preference: cards with term in middle rank higher than cards starting with term):
      // - Exact word match anywhere in middle: 50 points (HIGHEST PRIORITY)
      // - Exact word match at beginning: 30 points  
      // - Partial match (substring) in middle: 25 points
      // - Partial match at beginning: 15 points
      score += exactMatchCount * 20 + (partialMatchCount - exactMatchCount) * 5;
      
      // USER PREFERENCE: Cards containing word anywhere in middle get HIGHEST priority
      if (itemLower.includes(word) && !itemLower.startsWith(word)) {
        score += 50; // HIGH boost for contained terms (user preference)
        // Extra bonus for exact word matches in middle
        if (exactMatchCount > 0) {
          score += 20; // Even higher for exact matches in middle
        }
      }
      
      // Cards starting with term get lower priority (per user preference)
      if (itemLower.startsWith(word)) {
        score += 30; // Lower than middle matches
        startsWithBonus = true;
      }
    }

    // Only include items that contain all search words
    if (hasAllWords) {
      results.push({
        item,
        score,
        matchDetails: {
          exactMatches,
          partialMatches,
          startsWithBonus
        }
      });
    }
  });

  // Sort by score (descending), then alphabetically
  results.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score; // Higher score first
    }
    return a.item.name.localeCompare(b.item.name); // Then alphabetical
  });

  return results.map(result => result.item);
}

/**
 * Simple version for basic word matching (fallback)
 */
export function simpleSearchWithPriority<T extends SearchableItem>(
  items: T[], 
  searchTerm: string
): T[] {
  if (!searchTerm || searchTerm.trim() === '') {
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }

  const searchWords = searchTerm.toLowerCase().trim().split(/\s+/);
  const results: { item: T; priority: number }[] = [];

  // Calculate priority score for each item
  items.forEach(item => {
    const itemLower = item.name.toLowerCase();
    let totalMatches = 0;
    let hasAllWords = true;

    // Check if item contains all search words
    for (const word of searchWords) {
      const wordCount = (itemLower.match(new RegExp(word, 'g')) || []).length;
      if (wordCount === 0) {
        hasAllWords = false;
        break;
      }
      totalMatches += wordCount;
    }

    // Only include items that contain all search words
    if (hasAllWords) {
      results.push({
        item,
        priority: totalMatches
      });
    }
  });

  // Sort by priority (descending), then alphabetically (ascending)
  results.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority; // Higher priority first
    }
    return a.item.name.localeCompare(b.item.name); // Then alphabetical
  });

  return results.map(result => result.item);
}

/**
 * MTG-specific search enhancement that handles card names with special characters
 */
export function mtgCardSearch<T extends SearchableItem>(
  cards: T[], 
  searchTerm: string,
  options: {
    includeText?: boolean;
    includeType?: boolean;
    minSearchLength?: number;
  } = {}
): T[] {
  const { includeText = false, includeType = true, minSearchLength = 1 } = options;
  
  if (!searchTerm || searchTerm.trim().length < minSearchLength) {
    return cards.sort((a, b) => a.name.localeCompare(b.name));
  }

  // First, search by name using our advanced algorithm
  const nameResults = searchWithPriority(cards, searchTerm);
  
  // If we have good name results, return them
  if (nameResults.length > 0) {
    return nameResults;
  }
  
  // Fallback to broader search if no name matches and options allow
  if (includeText || includeType) {
    return cards.filter(card => {
      const searchLower = searchTerm.toLowerCase();
      const nameMatch = card.name.toLowerCase().includes(searchLower);
      
      if (nameMatch) return true;
      
      if (includeType && (card as any).type) {
        const typeMatch = (card as any).type.toLowerCase().includes(searchLower);
        if (typeMatch) return true;
      }
      
      if (includeText && (card as any).text) {
        const textMatch = (card as any).text.toLowerCase().includes(searchLower);
        if (textMatch) return true;
      }
      
      return false;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }
  
  return [];
}

// Consolidate duplicate cards by name, keeping only the oldest/best version  
export function consolidateDuplicateCards<T extends SearchableItem & { set?: string; imageUrl?: string }>(cards: T[]): T[] {
  const consolidatedMap = new Map<string, T>();
  
  cards.forEach(card => {
    const cardName = card.name.toLowerCase();
    const existing = consolidatedMap.get(cardName);
    
    if (!existing) {
      consolidatedMap.set(cardName, card);
    } else {
      // Prefer the oldest version (earlier release date or specific set priority)
      if (isOlderOrBetterVersion(card, existing)) {
        consolidatedMap.set(cardName, card);
      }
    }
  });
  
  return Array.from(consolidatedMap.values());
}

// Helper function to determine if a card is older or better than existing
function isOlderOrBetterVersion<T extends SearchableItem & { set?: string; imageUrl?: string }>(card: T, existing: T): boolean {
  // Priority order for sets (oldest/most iconic first)
  const setPriority: Record<string, number> = {
    // Alpha/Beta/Unlimited
    'LEA': 1, 'LEB': 2, '2ED': 3, 'ARN': 4, 'ATQ': 5, 'LEG': 6,
    // Classic sets
    'DRK': 10, 'FEM': 11, 'ICE': 12, 'CHR': 13, 'HML': 14, 'ALL': 15,
    // Core sets (prefer earlier)
    '3ED': 20, '4ED': 21, '5ED': 22, '6ED': 23, '7ED': 24, '8ED': 25, '9ED': 26, '10E': 27,
    // Modern core sets
    'M10': 30, 'M11': 31, 'M12': 32, 'M13': 33, 'M14': 34, 'M15': 35, 'ORI': 36,
    // Recent core sets
    'M19': 40, 'M20': 41, 'M21': 42,
  };
  
  const cardPriority = setPriority[card.set || ''] || 1000;
  const existingPriority = setPriority[existing.set || ''] || 1000;
  
  // Lower number = higher priority (older/better)
  if (cardPriority !== existingPriority) {
    return cardPriority < existingPriority;
  }
  
  // If same priority, prefer card with image
  if (card.imageUrl && !existing.imageUrl) return true;
  if (!card.imageUrl && existing.imageUrl) return false;
  
  // Default: keep existing
  return false;
}