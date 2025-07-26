import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  Search, 
  Plus, 
  Minus, 
  Download, 
  Upload, 
  Save, 
  Eye,
  Filter,
  BarChart3,
  PieChart,
  Shuffle,
  FileX
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { queryClient } from '@/lib/queryClient';
import { AuthModal } from '@/components/auth-modal';
import { Card as MTGCard } from '@/types/card';
import { calculateManaCostInfo, formatManaCostDisplay } from '@/utils/mana-cost';

interface DeckCard extends MTGCard {
  quantity: number;
  section: 'maindeck' | 'sideboard' | 'commander';
}

interface DeckStats {
  totalCards: number;
  avgCmc: number;
  colorDistribution: Record<string, number>;
  typeDistribution: Record<string, number>;
  cmcDistribution: Record<number, number>;
}

interface DeckClassification {
  type: 'Bo1' | 'Bo3' | 'Commander';
  format: string;
  description: string;
}

interface Format {
  name: string;
  minSize: number;
  maxSize: number;
  maxCopies: number;
  requiresCommander: boolean;
  allowsSideboard: boolean;
}

// Format definitions
const FORMATS: Record<string, Format> = {
  'Standard': { name: 'Standard', minSize: 60, maxSize: 999, maxCopies: 4, requiresCommander: false, allowsSideboard: true },
  'Pioneer': { name: 'Pioneer', minSize: 60, maxSize: 999, maxCopies: 4, requiresCommander: false, allowsSideboard: true },
  'Modern': { name: 'Modern', minSize: 60, maxSize: 999, maxCopies: 4, requiresCommander: false, allowsSideboard: true },
  'Legacy': { name: 'Legacy', minSize: 60, maxSize: 999, maxCopies: 4, requiresCommander: false, allowsSideboard: true },
  'Vintage': { name: 'Vintage', minSize: 60, maxSize: 999, maxCopies: 4, requiresCommander: false, allowsSideboard: true },
  'Commander': { name: 'Commander', minSize: 100, maxSize: 100, maxCopies: 1, requiresCommander: true, allowsSideboard: false },
  'Pauper': { name: 'Pauper', minSize: 60, maxSize: 999, maxCopies: 4, requiresCommander: false, allowsSideboard: true },
  'Limited': { name: 'Limited', minSize: 40, maxSize: 999, maxCopies: 999, requiresCommander: false, allowsSideboard: true },
};

export default function DeckBuilder() {
  const { user, isAuthenticated } = useAuth();
  const [deckName, setDeckName] = useState('');
  const [deckDescription, setDeckDescription] = useState('');
  const [format, setFormat] = useState('Standard');
  const [isPublic, setIsPublic] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deckCards, setDeckCards] = useState<DeckCard[]>([]);
  const [searchResults, setSearchResults] = useState<MTGCard[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCard, setSelectedCard] = useState<MTGCard | null>(null);
  const [viewMode, setViewMode] = useState<'visual' | 'text'>('visual');
  const [sortBy, setSortBy] = useState<'name' | 'cmc' | 'type' | 'color'>('name');
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [editingDeckId, setEditingDeckId] = useState<string | null>(null);
  const [thumbnailCard, setThumbnailCard] = useState<DeckCard | null>(null);
  const [thumbnailDialogOpen, setThumbnailDialogOpen] = useState(false);
  
  const { toast } = useToast();
  const currentFormat = FORMATS[format];

  // Classify deck based on contents
  const classifyDeck = (cards: DeckCard[], selectedFormat: string): DeckClassification => {
    const maindeckCards = cards.filter(card => card.section === 'maindeck');
    const sideboardCards = cards.filter(card => card.section === 'sideboard');
    const commanderCards = cards.filter(card => card.section === 'commander');
    
    // Check for commander - either in commander section or legendary creature that could be a commander
    const hasCommander = commanderCards.length > 0 || 
                        maindeckCards.some(card => 
                          card.type?.toLowerCase().includes('legendary') && 
                          (card.type?.toLowerCase().includes('creature') || 
                           card.type?.toLowerCase().includes('planeswalker'))
                        );
    
    // Commander format logic - prioritize if format is set to Commander or if there's a commander card
    if (selectedFormat === 'Commander' || selectedFormat === 'Brawl' || hasCommander) {
      return {
        type: 'Commander',
        format: selectedFormat === 'Brawl' ? 'Brawl' : 'Commander',
        description: hasCommander 
          ? `${selectedFormat === 'Brawl' ? 'Brawl' : 'Commander'} format with legendary commander`
          : `${selectedFormat === 'Brawl' ? 'Brawl' : 'Commander'} format (add a commander)`
      };
    }
    
    // Bo3 vs Bo1 logic based on sideboard for other formats
    if (sideboardCards.length > 0) {
      return {
        type: 'Bo3',
        format: selectedFormat,
        description: `${selectedFormat} Best of 3 (has ${sideboardCards.reduce((sum, card) => sum + card.quantity, 0)} sideboard cards)`
      };
    } else {
      return {
        type: 'Bo1',
        format: selectedFormat,
        description: `${selectedFormat} Best of 1 (no sideboard)`
      };
    }
  };

  const deckClassification = classifyDeck(deckCards, format);

  // Clear deck data when user logs out
  useEffect(() => {
    if (!isAuthenticated) {
      setDeckName('');
      setDeckDescription('');
      setFormat('Standard');
      setIsPublic(false);
      setDeckCards([]);
      setEditingDeckId(null);
      setSelectedCard(null);
      sessionStorage.removeItem('deckBuilderData');
    }
  }, [isAuthenticated]);

  // Load deck data from sessionStorage if available (for editing from My Decks)
  useEffect(() => {
    const loadDeckData = async () => {
      const savedData = sessionStorage.getItem('deckBuilderData');
      if (savedData) {
        try {
          const deckData = JSON.parse(savedData);
          setDeckName(deckData.name || '');
          setDeckDescription(deckData.description || '');
          setFormat(deckData.format || 'Standard');
          setIsPublic(deckData.isPublic || false);
          setEditingDeckId(deckData.editingDeckId || null);
          
          // Collect all card IDs for name resolution
          const allCardIds: string[] = [];
          if (deckData.deckCards && Array.isArray(deckData.deckCards)) {
            allCardIds.push(...deckData.deckCards.map((card: any) => card.cardId));
          }
          if (deckData.sideboardCards && Array.isArray(deckData.sideboardCards)) {
            allCardIds.push(...deckData.sideboardCards.map((card: any) => card.cardId));
          }
          
          // Fetch full card data for proper statistics
          let cardDataMap: Record<string, any> = {};
          if (allCardIds.length > 0) {
            try {
              // Fetch full card data for each card
              const cardPromises = allCardIds.map(async (cardId) => {
                try {
                  const response = await fetch(`/api/cards/${encodeURIComponent(cardId)}`);
                  if (response.ok) {
                    const cardData = await response.json();
                    return { id: cardId, data: cardData };
                  }
                } catch (error) {
                  console.error(`Error fetching card ${cardId}:`, error);
                }
                return { id: cardId, data: null };
              });
              
              const cardResults = await Promise.all(cardPromises);
              cardDataMap = cardResults.reduce((acc: Record<string, any>, result) => {
                if (result.data) {
                  acc[result.id] = result.data;
                }
                return acc;
              }, {});
            } catch (error) {
              console.error('Error fetching card data:', error);
            }
          }
          
          // Convert deck cards to the format expected by the deck builder
          const convertedCards: DeckCard[] = [];
          
          // Load maindeck cards
          if (deckData.deckCards && Array.isArray(deckData.deckCards)) {
            for (const cardData of deckData.deckCards) {
              const fullCardData = cardDataMap[cardData.cardId];
              convertedCards.push({
                id: cardData.cardId,
                name: fullCardData?.name || cardData.cardId.replace(/-/g, ' '),
                type: fullCardData?.type || 'Unknown',
                manaCost: fullCardData?.manaCost || '',
                quantity: cardData.quantity,
                section: 'maindeck' as const,
                colors: fullCardData?.colors || [],
                colorIdentity: fullCardData?.colorIdentity || [],
                cmc: fullCardData?.cmc || 0,
                rarity: fullCardData?.rarity || '',
                set: fullCardData?.set || '',
                setName: fullCardData?.setName || '',
                imageUrl: fullCardData?.imageUrl || '',
              });
            }
          }
          
          // Load sideboard cards
          if (deckData.sideboardCards && Array.isArray(deckData.sideboardCards)) {
            for (const cardData of deckData.sideboardCards) {
              const fullCardData = cardDataMap[cardData.cardId];
              convertedCards.push({
                id: cardData.cardId,
                name: fullCardData?.name || cardData.cardId.replace(/-/g, ' '),
                type: fullCardData?.type || 'Unknown',
                manaCost: fullCardData?.manaCost || '',
                quantity: cardData.quantity,
                section: 'sideboard' as const,
                colors: fullCardData?.colors || [],
                colorIdentity: fullCardData?.colorIdentity || [],
                cmc: fullCardData?.cmc || 0,
                rarity: fullCardData?.rarity || '',
                set: fullCardData?.set || '',
                setName: fullCardData?.setName || '',
                imageUrl: fullCardData?.imageUrl || '',
              });
            }
          }
          
          setDeckCards(convertedCards);
          sessionStorage.removeItem('deckBuilderData');
          
          toast({
            title: "Deck Loaded",
            description: `Loaded "${deckData.name}" for editing.`,
          });
        } catch (error) {
          console.error('Error loading deck data:', error);
        }
      }
    };

    loadDeckData();
  }, [toast]);

  // No authentication required for using deck builder, only for saving

  // Search cards using MTGSQLive official MTGJSON schema
  const searchCards = async (query: string): Promise<MTGCard[]> => {
    if (!query.trim()) return [];
    const response = await fetch(`/api/mtgsqlive/cards/search?q=${encodeURIComponent(query)}&t=${Date.now()}`);
    if (!response.ok) throw new Error('Search failed');
    const result = await response.json();
    return result.success ? (result.cards || []) : [];
  };

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchCards(searchQuery);
        
        // Deduplicate results by card name and prioritize exact matches
        const uniqueResults = Array.from(
          new Map(results.map(card => [card.name.toLowerCase(), card])).values()
        ).sort((a, b) => {
          const aExact = a.name.toLowerCase() === searchQuery.toLowerCase();
          const bExact = b.name.toLowerCase() === searchQuery.toLowerCase();
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;
          return a.name.localeCompare(b.name);
        });
        
        setSearchResults(uniqueResults);
      } catch (error) {
        toast({
          title: "Search Error",
          description: "Failed to search for cards",
          variant: "destructive",
        });
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, format, toast]);

  // Add card to deck
  const addCardToDeck = (card: MTGCard, section: 'maindeck' | 'sideboard' | 'commander' = 'maindeck') => {
    const existingCardIndex = deckCards.findIndex(
      dc => dc.id === card.id && dc.section === section
    );

    if (existingCardIndex >= 0) {
      const maxCopies = section === 'commander' ? 1 : currentFormat.maxCopies;
      if (deckCards[existingCardIndex].quantity >= maxCopies) {
        toast({
          title: "Copy Limit Reached",
          description: `Maximum ${maxCopies} copies allowed in ${format}`,
          variant: "destructive",
        });
        return;
      }

      const updatedCards = [...deckCards];
      updatedCards[existingCardIndex].quantity += 1;
      setDeckCards(updatedCards);
    } else {
      const newDeckCard: DeckCard = {
        ...card,
        quantity: 1,
        section,
      };
      setDeckCards([...deckCards, newDeckCard]);
    }
  };

  // Remove card from deck
  const removeCardFromDeck = (cardId: string, section: 'maindeck' | 'sideboard' | 'commander') => {
    const existingCardIndex = deckCards.findIndex(
      dc => dc.id === cardId && dc.section === section
    );

    if (existingCardIndex >= 0) {
      const updatedCards = [...deckCards];
      if (updatedCards[existingCardIndex].quantity > 1) {
        updatedCards[existingCardIndex].quantity -= 1;
      } else {
        updatedCards.splice(existingCardIndex, 1);
      }
      setDeckCards(updatedCards);
    }
  };

  // Calculate deck statistics
  const calculateStats = (): DeckStats => {
    const maindeckCards = deckCards.filter(c => c.section === 'maindeck');
    const totalCards = maindeckCards.reduce((sum, card) => sum + card.quantity, 0);
    
    const colorDistribution: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    const typeDistribution: Record<string, number> = {};
    const cmcDistribution: Record<number, number> = {};
    let totalCmc = 0;
    let cardsWithCmc = 0;

    maindeckCards.forEach(card => {
      const quantity = card.quantity;
      
      // Color distribution
      if (card.colors) {
        card.colors.forEach(color => {
          colorDistribution[color] = (colorDistribution[color] || 0) + quantity;
        });
      } else {
        colorDistribution.C += quantity;
      }

      // Type distribution - combine Basic and Land since basics are always lands
      const cardType = card.type || 'Unknown';
      let primaryType = cardType.split(' ')[0];
      
      // If it's a Basic Land, categorize it as "Land" since basics are always lands
      if (cardType.toLowerCase().includes('basic') && cardType.toLowerCase().includes('land')) {
        primaryType = 'Land';
      } else if (cardType.toLowerCase().includes('land')) {
        primaryType = 'Land';
      }
      
      typeDistribution[primaryType] = (typeDistribution[primaryType] || 0) + quantity;

      // CMC distribution - only include cards that actually have mana costs
      // Skip lands and other cards without mana costs unless they have an actual CMC (like Black Lotus)
      const hasManaCost = card.manaCost && card.manaCost.trim() !== '';
      const hasActualCmc = card.cmc !== undefined && card.cmc !== null && card.cmc > 0;
      
      if (hasManaCost || hasActualCmc) {
        const cmcInfo = calculateManaCostInfo(card.manaCost, card.cmc);
        const effectiveCmc = cmcInfo.hasVariableCost ? cmcInfo.minCmc : (card.cmc || 0);
        cmcDistribution[effectiveCmc] = (cmcDistribution[effectiveCmc] || 0) + quantity;
        totalCmc += effectiveCmc * quantity;
        cardsWithCmc += quantity;
      }
    });

    return {
      totalCards,
      avgCmc: cardsWithCmc > 0 ? totalCmc / cardsWithCmc : 0,
      colorDistribution,
      typeDistribution,
      cmcDistribution,
    };
  };

  // Sort deck cards
  const sortedDeckCards = (section: 'maindeck' | 'sideboard' | 'commander') => {
    return deckCards
      .filter(card => card.section === section)
      .sort((a, b) => {
        switch (sortBy) {
          case 'cmc':
            return (a.cmc || 0) - (b.cmc || 0);
          case 'type':
            return (a.type || '').localeCompare(b.type || '');
          case 'color':
            return (a.colors?.[0] || 'C').localeCompare(b.colors?.[0] || 'C');
          default:
            return a.name.localeCompare(b.name);
        }
      });
  };

  // Export deck as text
  const exportDeckAsText = () => {
    const maindeckCards = sortedDeckCards('maindeck');
    const sideboardCards = sortedDeckCards('sideboard');
    const commanderCards = sortedDeckCards('commander');

    let deckText = `// ${deckName || 'Untitled Deck'}\n// Format: ${format}\n\n`;

    if (commanderCards.length > 0) {
      deckText += 'Commander:\n';
      commanderCards.forEach(card => {
        deckText += `1 ${card.name}\n`;
      });
      deckText += '\n';
    }

    if (maindeckCards.length > 0) {
      deckText += 'Maindeck:\n';
      maindeckCards.forEach(card => {
        deckText += `${card.quantity} ${card.name}\n`;
      });
      deckText += '\n';
    }

    if (sideboardCards.length > 0) {
      deckText += 'Sideboard:\n';
      sideboardCards.forEach(card => {
        deckText += `${card.quantity} ${card.name}\n`;
      });
    }

    // Create and download file
    const blob = new Blob([deckText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deckName || 'deck'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Deck Exported",
      description: "Deck has been exported as a text file",
    });
  };

  // Clear all deck data for new deck
  const clearDeck = () => {
    setDeckName('');
    setDeckDescription('');
    setFormat('Standard');
    setIsPublic(false);
    setDeckCards([]);
    setEditingDeckId(null);
    setSelectedCard(null);
    sessionStorage.removeItem('deckBuilderData');
    
    toast({
      title: "Deck Cleared",
      description: "Started a new deck. All previous data has been cleared.",
    });
  };

  // Save deck to database
  const saveDeck = async () => {
    if (!isAuthenticated) {
      setAuthModalOpen(true);
      return;
    }

    if (!deckName.trim()) {
      toast({
        title: "Deck Name Required",
        description: "Please enter a deck name before saving.",
        variant: "destructive",
      });
      return;
    }

    try {
      const deckData = {
        name: deckName,
        description: deckDescription,
        format,
        deckCards: deckCards.filter(c => c.section === 'maindeck').map(c => ({ cardId: c.id, quantity: c.quantity })),
        sideboardCards: deckCards.filter(c => c.section === 'sideboard').map(c => ({ cardId: c.id, quantity: c.quantity })),
        commander: deckCards.find(c => c.section === 'commander')?.name,
        thumbnailCardId: thumbnailCard?.id,
        thumbnailCardName: thumbnailCard?.name,
        thumbnailImageUrl: thumbnailCard?.imageUrl || (thumbnailCard ? `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(thumbnailCard.name)}&format=image&version=normal` : undefined),
        isPublic: isPublic,
        tags: []
      };

      let response;
      if (editingDeckId) {
        // Update existing deck
        response = await fetch(`/api/decks/${editingDeckId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(deckData)
        });
      } else {
        // Create new deck
        response = await fetch('/api/decks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(deckData)
        });
      }

      const result = await response.json();

      if (result.success) {
        // Invalidate relevant queries to refresh the lists
        queryClient.invalidateQueries({ queryKey: ['/api/decks/my-decks'] });
        queryClient.invalidateQueries({ queryKey: ['/api/decks/public'] });
        
        // Clear editing state and sessionStorage after successful save
        if (editingDeckId) {
          setEditingDeckId(null);
          sessionStorage.removeItem('deckBuilderData');
        }
        
        toast({
          title: editingDeckId ? "Deck Updated" : "Deck Saved",
          description: `Your deck "${deckName}" has been ${editingDeckId ? 'updated' : 'saved'} successfully.`,
        });
      } else {
        throw new Error(result.error || 'Failed to save deck');
      }
    } catch (error) {
      toast({
        title: "Save Error",
        description: "Failed to save deck. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Calculate string similarity using Levenshtein distance
  const calculateStringSimilarity = (str1: string, str2: string): number => {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + substitutionCost // substitution
        );
      }
    }
    
    const maxLength = Math.max(str1.length, str2.length);
    return maxLength === 0 ? 1 : (maxLength - matrix[str2.length][str1.length]) / maxLength;
  };

  // Import deck from text with optimized batch processing
  const importDeckFromText = async () => {
    try {
      const lines = importText.split('\n').filter(line => line.trim() && !line.startsWith('//'));
      const cardRequests: Array<{ cardName: string; quantity: number; section: 'maindeck' | 'sideboard' | 'commander'; originalLine: string; setCode?: string | null; collectorNumber?: string | null }> = [];
      let currentSection: 'maindeck' | 'sideboard' | 'commander' = 'maindeck';

      // Parse all lines first to collect card requests
      for (const line of lines) {
        const trimmedLine = line.trim().toLowerCase();
        
        // Check for section headers (more comprehensive patterns)
        if (trimmedLine === 'commander:' || trimmedLine === 'commander' || trimmedLine.includes('commander')) {
          currentSection = 'commander';
          continue;
        } else if (trimmedLine === 'maindeck:' || trimmedLine === 'maindeck' || trimmedLine === 'main deck:' || 
                   trimmedLine === 'main:' || trimmedLine === 'deck:') {
          currentSection = 'maindeck';
          continue;
        } else if (trimmedLine === 'sideboard:' || trimmedLine === 'sideboard' || trimmedLine === 'side board:' || 
                   trimmedLine === 'side:' || trimmedLine === 'sb:') {
          currentSection = 'sideboard';
          continue;
        }

        // Handle empty lines that might indicate section breaks
        if (!trimmedLine) {
          continue;
        }

        // Check for section header without colon (common in many deck formats)
        if (trimmedLine === 'deck' || trimmedLine === 'main' || trimmedLine === 'maindeck') {
          currentSection = 'maindeck';
          continue;
        }
        if (trimmedLine === 'sideboard' || trimmedLine === 'side' || trimmedLine === 'sb') {
          currentSection = 'sideboard';
          continue;
        }

        // Match card entries (quantity + name)
        const match = line.match(/^(\d+)\s+(.+)$/);
        if (match) {
          const quantity = parseInt(match[1]);
          const rawCardName = match[2].trim();
          
          // Extract set code and collector number if present
          const setMatch = rawCardName.match(/^(.+?)\s*\(([A-Z0-9]{2,4})\)\s*(\d+)\s*$/);
          let cardName = rawCardName;
          let setCode = null;
          let collectorNumber = null;
          
          if (setMatch) {
            cardName = setMatch[1].trim();
            setCode = setMatch[2];
            collectorNumber = setMatch[3];
          } else {
            // Fallback: remove other patterns if no set code found
            cardName = cardName.replace(/\s*#\d+.*$/, ''); // Remove #number
            cardName = cardName.replace(/\s*\d+\/\d+\s*$/, ''); // Remove power/toughness
            cardName = cardName.trim();
          }
          
          // Store card request for batch processing
          cardRequests.push({
            cardName,
            quantity,
            section: currentSection,
            originalLine: line,
            setCode: setCode,
            collectorNumber: collectorNumber
          });
        }
      }

      // Process card requests in batches
      const newDeckCards: DeckCard[] = [];
      const uniqueCardNames = Array.from(new Set(cardRequests.map(req => req.cardName)));
      const cardMap = new Map<string, MTGCard>();
      
      // Show progress indicator
      toast({
        title: "Processing Import",
        description: `Searching for ${uniqueCardNames.length} unique cards...`,
      });

      // Process card requests with set code priority
      const batchSize = 5;
      
      // Group requests by whether they have set codes
      const requestsWithSetCodes = cardRequests.filter(req => req.setCode && req.collectorNumber);
      const requestsWithoutSetCodes = cardRequests.filter(req => !req.setCode || !req.collectorNumber);
      
      // First, try to resolve cards with set codes using specific search
      for (const request of requestsWithSetCodes) {
        try {
          // Create a more specific search query that includes set information
          const setQuery = `${request.cardName} set:${request.setCode}`;
          const response = await fetch(`/api/cards/enhanced-search?q=${encodeURIComponent(setQuery)}`);
          
          if (response.ok) {
            const results: MTGCard[] = await response.json();
            
            // Look for exact name match from the specified set
            let foundCard = results.find(card => 
              card.name.toLowerCase() === request.cardName.toLowerCase() &&
              (card.set?.toLowerCase() === request.setCode?.toLowerCase() || 
               card.setCode?.toLowerCase() === request.setCode?.toLowerCase())
            );
            
            // If no set-specific match, try just name matching from results
            if (!foundCard && results.length > 0) {
              foundCard = results.find(card => 
                card.name.toLowerCase() === request.cardName.toLowerCase()
              );
            }
            
            // Fallback to name search if set search fails
            if (!foundCard) {
              const nameResponse = await fetch(`/api/cards/enhanced-search?q=${encodeURIComponent(request.cardName)}`);
              if (nameResponse.ok) {
                const nameResults: MTGCard[] = await nameResponse.json();
                foundCard = nameResults.find(card => 
                  card.name.toLowerCase() === request.cardName.toLowerCase()
                );
                
                // If still no exact match, try fuzzy matching
                if (!foundCard && nameResults.length > 0) {
                  let bestMatch = nameResults[0];
                  let bestSimilarity = calculateStringSimilarity(request.cardName.toLowerCase(), bestMatch.name.toLowerCase());
                  
                  for (const card of nameResults.slice(1, 3)) {
                    const similarity = calculateStringSimilarity(request.cardName.toLowerCase(), card.name.toLowerCase());
                    if (similarity > bestSimilarity) {
                      bestSimilarity = similarity;
                      bestMatch = card;
                    }
                  }
                  
                  if (bestSimilarity > 0.8) {
                    foundCard = bestMatch;
                    console.log(`Using fuzzy match for "${request.cardName}" -> "${bestMatch.name}" (${Math.round(bestSimilarity * 100)}% similarity)`);
                  }
                }
              }
            }
            
            if (foundCard) {
              cardMap.set(request.cardName + '|' + (request.setCode || ''), foundCard);
            } else {
              console.warn(`Card not found: ${request.cardName} (${request.setCode}) ${request.collectorNumber} (will be skipped)`);
            }
          }
        } catch (error) {
          console.error(`Error searching for card "${request.cardName}" with set ${request.setCode}:`, error);
        }
      }

      // Then process cards without set codes in batches
      const uniqueCardNamesWithoutSet = Array.from(new Set(requestsWithoutSetCodes.map(req => req.cardName)));
      
      for (let i = 0; i < uniqueCardNamesWithoutSet.length; i += batchSize) {
        const batch = uniqueCardNamesWithoutSet.slice(i, i + batchSize);
        
        const searchPromises = batch.map(async (cardName) => {
          try {
            const response = await fetch(`/api/cards/enhanced-search?q=${encodeURIComponent(cardName)}`);
            if (!response.ok) return null;
            
            const results: MTGCard[] = await response.json();
            
            // Try exact match first
            let foundCard = results.find(card => 
              card.name.toLowerCase() === cardName.toLowerCase()
            );
            
            // If no exact match, try fuzzy matching
            if (!foundCard && results.length > 0) {
              let bestMatch = results[0];
              let bestSimilarity = calculateStringSimilarity(cardName.toLowerCase(), bestMatch.name.toLowerCase());
              
              for (const card of results.slice(1, 3)) {
                const similarity = calculateStringSimilarity(cardName.toLowerCase(), card.name.toLowerCase());
                if (similarity > bestSimilarity) {
                  bestSimilarity = similarity;
                  bestMatch = card;
                }
              }
              
              if (bestSimilarity > 0.8) {
                foundCard = bestMatch;
                console.log(`Using fuzzy match for "${cardName}" -> "${bestMatch.name}" (${Math.round(bestSimilarity * 100)}% similarity)`);
              }
            }
            
            if (foundCard) {
              cardMap.set(cardName, foundCard);
            } else {
              console.warn(`Card not found: ${cardName} (will be skipped)`);
            }
          } catch (error) {
            console.error(`Error searching for card "${cardName}":`, error);
          }
        });
        
        await Promise.all(searchPromises);
      }

      // Build deck cards from found cards
      for (const request of cardRequests) {
        // Try to get card using set code key first, then fallback to name only
        const setKey = request.cardName + '|' + (request.setCode || '');
        let foundCard = cardMap.get(setKey) || cardMap.get(request.cardName);
        
        if (foundCard) {
          newDeckCards.push({
            ...foundCard,
            quantity: request.quantity,
            section: request.section,
          });
        }
      }

      setDeckCards(newDeckCards);
      setImportDialogOpen(false);
      setImportText('');
      
      const maindeckCount = newDeckCards.filter((c: DeckCard) => c.section === 'maindeck').length;
      const sideboardCount = newDeckCards.filter((c: DeckCard) => c.section === 'sideboard').length;
      const commanderCount = newDeckCards.filter((c: DeckCard) => c.section === 'commander').length;
      const totalImported = newDeckCards.reduce((sum: number, card: DeckCard) => sum + card.quantity, 0);
      
      toast({
        title: "Deck Imported Successfully",
        description: `Imported ${totalImported} cards: ${maindeckCount} maindeck, ${sideboardCount} sideboard, ${commanderCount} commander`,
      });
    } catch (error) {
      toast({
        title: "Import Error",
        description: "Failed to import deck. Please check the format.",
        variant: "destructive",
      });
    }
  };

  const stats = calculateStats();

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Top Row: Deck Builder Info (50%) and Statistics (50%) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Deck Builder Card - 50% width */}
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shuffle className="h-6 w-6" />
              Deck Builder
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Deck Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="deckName">Deck Name</Label>
                <Input
                  id="deckName"
                  value={deckName}
                  onChange={(e) => setDeckName(e.target.value)}
                  placeholder="Enter deck name"
                />
              </div>
              <div>
                <Label htmlFor="format">Format</Label>
                <Select value={format} onValueChange={setFormat}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(FORMATS).map(formatName => (
                      <SelectItem key={formatName} value={formatName}>
                        {formatName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Deck Classification and Thumbnail */}
            <div className="p-3 bg-muted/50 rounded-lg border space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Deck Type</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge 
                      variant={deckClassification.type === 'Commander' ? 'default' : 
                               deckClassification.type === 'Bo3' ? 'secondary' : 'outline'}
                      className="text-xs"
                    >
                      {deckClassification.type}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {deckClassification.format}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">
                    {deckClassification.description}
                  </div>
                </div>
              </div>
              
              {/* Deck Thumbnail Selection */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Deck Thumbnail</Label>
                  <div className="flex items-center gap-2 mt-1">
                    {thumbnailCard ? (
                      <div className="flex items-center gap-2">
                        <img
                          src={thumbnailCard.imageUrl || `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(thumbnailCard.name)}&format=image&version=small`}
                          alt={thumbnailCard.name}
                          className="w-8 h-8 rounded border object-cover"
                        />
                        <span className="text-xs text-muted-foreground truncate max-w-20">
                          {thumbnailCard.name}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">None selected</span>
                    )}
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setThumbnailDialogOpen(true)}
                  disabled={deckCards.length === 0}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  Choose
                </Button>
              </div>
            </div>

            {/* Deck Description */}
            <div>
              <Label htmlFor="deckDescription">Description</Label>
              <Textarea
                id="deckDescription"
                value={deckDescription}
                onChange={(e) => setDeckDescription(e.target.value)}
                placeholder="Describe your deck strategy..."
                rows={3}
              />
            </div>

            {/* Deck Visibility - only show if authenticated */}
            {isAuthenticated && (
              <div>
                <Label htmlFor="visibility">Deck Visibility</Label>
                <Select value={isPublic ? "public" : "private"} onValueChange={(value) => setIsPublic(value === "public")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private - Only visible to you</SelectItem>
                    <SelectItem value="public">Public - Visible to everyone</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {isPublic 
                    ? "Your deck will appear on the Public Decks page with your username" 
                    : "Your deck will only be visible in your My Decks page"
                  }
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={clearDeck}>
                <FileX className="h-4 w-4 mr-2" />
                New Deck
              </Button>
              <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Upload className="h-4 w-4 mr-2" />
                    Import
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Import Deck</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Textarea
                      placeholder="Paste deck list here..."
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      rows={10}
                    />
                    <div className="flex gap-2">
                      <Button onClick={importDeckFromText} className="flex-1">
                        Import
                      </Button>
                      <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <Button onClick={exportDeckAsText} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              {isAuthenticated && (
                <Button onClick={saveDeck} size="sm" className="bg-gradient-to-r from-[#4777e6] to-[#9c4dff]">
                  <Save className="h-4 w-4 mr-2" />
                  Save Deck
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Statistics Card - 50% width, same height */}
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Statistics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm font-medium">Total Cards: {stats.totalCards}</div>
              <div className="text-sm text-muted-foreground">
                Average CMC: {stats.avgCmc.toFixed(1)}
              </div>
            </div>

            <Separator />

            <div>
              <div className="text-sm font-medium mb-2">Color Distribution</div>
              {Object.entries(stats.colorDistribution).map(([color, count]) => (
                count > 0 && (
                  <div key={color} className="flex justify-between text-sm">
                    <span>{color === 'C' ? 'Colorless' : color}</span>
                    <span>{count}</span>
                  </div>
                )
              ))}
            </div>

            <Separator />

            <div>
              <div className="text-sm font-medium mb-2">Type Distribution</div>
              {Object.entries(stats.typeDistribution)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
                .map(([type, count]) => (
                  <div key={type} className="flex justify-between text-sm">
                    <span>{type}</span>
                    <span>{count}</span>
                  </div>
                ))}
            </div>

            <Separator />

            <div>
              <div className="text-sm font-medium mb-2">Mana Curve</div>
              {Object.entries(stats.cmcDistribution)
                .sort(([a], [b]) => parseInt(a) - parseInt(b))
                .map(([cmc, count]) => (
                  count > 0 && (
                    <div key={cmc} className="flex justify-between text-sm">
                      <span>{cmc === '0' ? '0' : cmc}+</span>
                      <span>{count}</span>
                    </div>
                  )
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row: Card Search (1/3) and Visual Deck Builder (2/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card Search - 1/3 width */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Card Search
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Input
                placeholder="Search for cards..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              
              <ScrollArea className="h-96">
                {isSearching ? (
                  <div className="text-center py-4">Searching...</div>
                ) : searchResults.length > 0 ? (
                  <div className="space-y-2">
                    {searchResults.map(card => (
                      <div
                        key={card.id}
                        className="p-3 border rounded cursor-pointer hover:bg-muted transition-colors"
                        onClick={() => setSelectedCard(card)}
                      >
                        <div className="flex gap-3">
                          <div className="flex-shrink-0">
                            <img
                              src={`https://gatherer.wizards.com/Handlers/Image.ashx?name=${encodeURIComponent(card.name)}&type=card&.jpg`}
                              alt={card.name}
                              className="w-12 h-16 rounded border object-cover"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                if (!target.src.includes('api.scryfall.com')) {
                                  target.src = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}&format=image&version=small`;
                                } else {
                                  // Final fallback to a simple placeholder
                                  target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjMiIGhlaWdodD0iODgiIHZpZXdCb3g9IjAgMCA2MyA4OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjYzIiBoZWlnaHQ9Ijg4IiByeD0iNCIgZmlsbD0iIzMzNCI+PC9yZWN0Pjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjZmZmIiBmb250LXNpemU9IjhweCI+Q2FyZDwvdGV4dD48L3N2Zz4K';
                                }
                              }}
                            />
                          </div>
                          <div className="flex-1">
                            <div className="font-medium text-sm">{card.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {card.manaCost && formatManaCostDisplay(card.manaCost)} | {card.type}
                            </div>
                            {card.set && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {card.set.toUpperCase()} | {card.rarity}
                              </div>
                            )}
                            <div className="flex gap-1 mt-2">
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addCardToDeck(card, 'maindeck');
                                }}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                              {currentFormat.allowsSideboard && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    addCardToDeck(card, 'sideboard');
                                  }}
                                >
                                  SB
                                </Button>
                              )}
                              {currentFormat.requiresCommander && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    addCardToDeck(card, 'commander');
                                  }}
                                >
                                  CMD
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : searchQuery ? (
                  <div className="text-center py-4 text-muted-foreground">
                    <div className="text-sm">No cards found matching "{searchQuery}"</div>
                    <div className="text-xs mt-1">in {format} format</div>
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    Start typing to search for cards
                  </div>
                )}
              </ScrollArea>
            </div>
          </CardContent>
        </Card>

        {/* Visual Deck Builder - 2/3 width */}
        <Card className="lg:col-span-2 min-h-0 flex flex-col">
          <CardHeader className="flex-shrink-0">
            <CardTitle className="flex items-center justify-between">
              <span>Deck List ({stats.totalCards} cards)</span>
              <div className="flex gap-2">
                <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="cmc">CMC</SelectItem>
                    <SelectItem value="type">Type</SelectItem>
                    <SelectItem value="color">Color</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 flex flex-col">
            <Tabs defaultValue="maindeck" className="w-full flex-1 flex flex-col">
              <TabsList className="grid w-full grid-cols-3 flex-shrink-0">
                <TabsTrigger value="maindeck">
                  Maindeck ({sortedDeckCards('maindeck').reduce((sum, card) => sum + card.quantity, 0)})
                </TabsTrigger>
                {currentFormat.allowsSideboard && (
                  <TabsTrigger value="sideboard">
                    Sideboard ({sortedDeckCards('sideboard').reduce((sum, card) => sum + card.quantity, 0)})
                  </TabsTrigger>
                )}
                {currentFormat.requiresCommander && (
                  <TabsTrigger value="commander">
                    Commander ({sortedDeckCards('commander').length})
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="maindeck" className="flex-1 overflow-auto">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4">
                  {sortedDeckCards('maindeck').map(card => (
                    <div key={card.id} className="relative group">
                      <div className="relative">
                        <img
                          src={card.imageUrl || `https://gatherer.wizards.com/Handlers/Image.ashx?name=${encodeURIComponent(card.name)}&type=card`}
                          alt={card.name}
                          className="w-full h-auto rounded-lg border-2 border-gray-300 hover:border-blue-500 transition-colors cursor-pointer shadow-lg"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}&format=image&version=normal`;
                          }}
                          onClick={() => setSelectedCard(card)}
                        />
                        {card.quantity > 1 && (
                          <div className="absolute top-2 left-2 bg-black bg-opacity-90 text-white text-sm rounded-full px-2 py-1 font-bold">
                            {card.quantity}
                          </div>
                        )}
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0 bg-white"
                            onClick={() => removeCardFromDeck(card.id, 'maindeck')}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => addCardToDeck(card, 'maindeck')}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2 text-sm text-center truncate font-medium">
                        {card.name}
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              {currentFormat.allowsSideboard && (
                <TabsContent value="sideboard" className="flex-1 overflow-auto">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4">
                    {sortedDeckCards('sideboard').map(card => (
                      <div key={card.id} className="relative group">
                        <div className="relative">
                          <img
                            src={card.imageUrl || `https://gatherer.wizards.com/Handlers/Image.ashx?name=${encodeURIComponent(card.name)}&type=card`}
                            alt={card.name}
                            className="w-full h-auto rounded-lg border-2 border-gray-300 hover:border-blue-500 transition-colors cursor-pointer shadow-lg"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}&format=image&version=normal`;
                            }}
                            onClick={() => setSelectedCard(card)}
                          />
                          {card.quantity > 1 && (
                            <div className="absolute top-2 left-2 bg-black bg-opacity-90 text-white text-sm rounded-full px-2 py-1 font-bold">
                              {card.quantity}
                            </div>
                          )}
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-8 p-0 bg-white"
                              onClick={() => removeCardFromDeck(card.id, 'sideboard')}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => addCardToDeck(card, 'sideboard')}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="mt-2 text-sm text-center truncate font-medium">
                          {card.name}
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              )}

              {currentFormat.requiresCommander && (
                <TabsContent value="commander" className="flex-1 overflow-auto">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4">
                    {sortedDeckCards('commander').map(card => (
                      <div key={card.id} className="relative group">
                        <div className="relative">
                          <img
                            src={card.imageUrl || `https://gatherer.wizards.com/Handlers/Image.ashx?name=${encodeURIComponent(card.name)}&type=card`}
                            alt={card.name}
                            className="w-full h-auto rounded-lg border-2 border-yellow-500 hover:border-yellow-400 transition-colors cursor-pointer shadow-lg"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}&format=image&version=normal`;
                            }}
                            onClick={() => setSelectedCard(card)}
                          />
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-8 p-0 bg-white"
                              onClick={() => removeCardFromDeck(card.id, 'commander')}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="mt-2 text-sm text-center truncate font-medium">
                          {card.name}
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Thumbnail Selection Dialog */}
      <Dialog open={thumbnailDialogOpen} onOpenChange={setThumbnailDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Choose Deck Thumbnail</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            <p className="text-sm text-muted-foreground mb-4">
              Select a card from your deck to use as the thumbnail image
            </p>
            <ScrollArea className="h-96">
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
                {deckCards.filter(card => card.section === 'maindeck' || card.section === 'commander').map(card => (
                  <div 
                    key={card.id} 
                    className={`cursor-pointer rounded-lg border-2 transition-all hover:scale-105 ${
                      thumbnailCard?.id === card.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-300 hover:border-blue-300'
                    }`}
                    onClick={() => {
                      setThumbnailCard(card);
                      setThumbnailDialogOpen(false);
                      toast({
                        title: "Thumbnail Updated",
                        description: `Set "${card.name}" as deck thumbnail`,
                      });
                    }}
                  >
                    <img
                      src={card.imageUrl || `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}&format=image&version=normal`}
                      alt={card.name}
                      className="w-full h-auto rounded-lg"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = `https://gatherer.wizards.com/Handlers/Image.ashx?name=${encodeURIComponent(card.name)}&type=card`;
                      }}
                    />
                    <div className="text-xs text-center p-1 truncate">
                      {card.name}
                    </div>
                  </div>
                ))}
              </div>
              {deckCards.filter(card => card.section === 'maindeck' || card.section === 'commander').length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  Add cards to your deck to choose a thumbnail
                </div>
              )}
            </ScrollArea>
            <div className="flex justify-end gap-2 mt-4">
              {thumbnailCard && (
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setThumbnailCard(null);
                    toast({
                      title: "Thumbnail Removed",
                      description: "Deck thumbnail has been cleared",
                    });
                  }}
                >
                  Clear Thumbnail
                </Button>
              )}
              <Button variant="outline" onClick={() => setThumbnailDialogOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AuthModal 
        isOpen={authModalOpen} 
        onClose={() => setAuthModalOpen(false)} 
      />
    </div>
  );
}