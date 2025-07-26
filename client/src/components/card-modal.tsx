import { useState, useEffect } from "react";
import { X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";
import { ManaCost } from "@/components/ui/mana-symbol";

interface CardModalProps {
  cardName: string;
  isOpen: boolean;
  onClose: () => void;
}

interface CardVersion {
  id: string;
  name: string;
  set: string;
  setName: string;
  rarity: string;
  imageUrl?: string;
  releaseDate?: string;
  // Version-specific data
  flavorText?: string;
  artist?: string;
  manaCost?: string;
  text?: string;
  power?: string;
  toughness?: string;
}

interface CardDetails {
  name: string;
  type: string;
  manaCost: string;
  cmc: number;
  text: string;
  power?: string;
  toughness?: string;
  rarity: string;
  artist?: string;
  flavorText?: string;
  legality: Record<string, string>;
  versions: CardVersion[];
  mainVersion: CardVersion;
}

export function CardModal({ cardName, isOpen, onClose }: CardModalProps) {
  const [selectedVersion, setSelectedVersion] = useState<CardVersion | null>(null);

  // Reset state when modal opens with different card
  useEffect(() => {
    if (isOpen) {
      setSelectedVersion(null);
    }
  }, [isOpen, cardName]);

  // Fetch all versions of the card
  const { data: cardDetails, isLoading, error } = useQuery<CardDetails>({
    queryKey: ['/api/cards/details', cardName],
    queryFn: async () => {
      if (!cardName) return null;
      const response = await fetch(`/api/cards/details/${encodeURIComponent(cardName)}`);
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: isOpen && !!cardName,
    retry: false
  });

  // Debug logging
  useEffect(() => {
    if (isOpen && cardName) {
      console.log('🔍 Modal opened for:', cardName);
      console.log('📦 Card details:', cardDetails);
      console.log('⏳ Loading:', isLoading);
      console.log('❌ Error:', error);
    }
  }, [isOpen, cardName, cardDetails, isLoading, error]);

  useEffect(() => {
    if (cardDetails && !selectedVersion) {
      setSelectedVersion(cardDetails.mainVersion);
    }
  }, [cardDetails, selectedVersion]);

  if (!isOpen) return null;

  const formatLegality = (legality: Record<string, string>) => {
    const formatOrder = ['Standard', 'Pioneer', 'Modern', 'Legacy', 'Vintage', 'Commander', 'Historic', 'Brawl', 'Timeless', 'Pauper', 'Penny', 'Alchemy'];
    return formatOrder
      .filter(format => legality[format.toLowerCase()])
      .map(format => ({
        format,
        status: legality[format.toLowerCase()]
      }));
  };



  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative w-full max-w-6xl h-[80vh] bg-white dark:bg-gray-900 rounded-lg shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {cardDetails?.name || cardName}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex h-[calc(100%-4rem)] overflow-hidden">
          {/* Left Column - Card Image (1/3) */}
          <div className="w-1/3 p-6 bg-gray-50 dark:bg-gray-800 flex flex-col items-center justify-start">
            {selectedVersion?.imageUrl ? (
              <img
                src={selectedVersion.imageUrl}
                alt={cardDetails?.name || cardName}
                className="w-full max-w-sm rounded-lg shadow-lg"
              />
            ) : (
              <div className="w-full max-w-sm h-80 bg-gray-300 dark:bg-gray-600 rounded-lg flex items-center justify-center">
                <span className="text-gray-500 dark:text-gray-400">No Image</span>
              </div>
            )}
            
            {selectedVersion && (
              <div className="mt-4 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedVersion.setName} ({selectedVersion.set})
                </p>
                <Badge variant="secondary" className="mt-1">
                  {selectedVersion.rarity}
                </Badge>
              </div>
            )}
          </div>

          {/* Middle Column - Card Details (1/3) */}
          <div className="w-1/3 p-6">
            {isLoading ? (
              <div className="animate-pulse space-y-4">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
              </div>
            ) : error ? (
              <div className="text-red-500 text-center">
                <p>Failed to load card details</p>
                <p className="text-sm mt-2">{error.message}</p>
              </div>
            ) : cardDetails ? (
              <div className="space-y-4">
                {/* Type Line */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                    Type
                  </h3>
                  <p className="text-lg font-medium text-gray-900 dark:text-white">
                    {cardDetails.type}
                  </p>
                </div>

                {/* Mana Cost & CMC */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                      Mana Cost
                    </h3>
                    <div className="mt-1">
                      <ManaCost cost={cardDetails.manaCost} size="md" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                      CMC
                    </h3>
                    <p className="text-lg font-medium text-gray-900 dark:text-white">
                      {cardDetails.cmc}
                    </p>
                  </div>
                </div>

                {/* Power/Toughness - Only show for creatures */}
                {cardDetails.power && cardDetails.toughness && cardDetails.type?.toLowerCase().includes('creature') && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                      Power / Toughness
                    </h3>
                    <p className="text-lg font-medium text-gray-900 dark:text-white">
                      {cardDetails.power} / {cardDetails.toughness}
                    </p>
                  </div>
                )}

                {/* Oracle Text */}
                {cardDetails.text && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                      Oracle Text
                    </h3>
                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">
                      {cardDetails.text}
                    </p>
                  </div>
                )}

                {/* Flavor Text - version-specific */}
                {selectedVersion?.flavorText && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                      Flavor Text
                    </h3>
                    <p className="mt-1 text-sm italic text-gray-600 dark:text-gray-400 leading-relaxed">
                      "{selectedVersion.flavorText}"
                    </p>
                  </div>
                )}

                {/* Artist - version-specific */}
                {selectedVersion?.artist && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                      Artist
                    </h3>
                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                      Illustration by {selectedVersion.artist}
                    </p>
                  </div>
                )}




              </div>
            ) : null}
          </div>

          {/* Right Column - Printings (1/3) */}
          <div className="w-1/3 p-6 border-l border-gray-200 dark:border-gray-700">
            <div className="h-full">
              <h3 className="text-lg font-semibold mb-4">Printings</h3>
              
              <div className="space-y-1 mb-4 max-h-64 overflow-y-auto">
                {cardDetails?.versions.map((version) => (
                  <div
                    key={version.id}
                    className={`p-2 rounded border cursor-pointer transition-colors ${
                      selectedVersion?.id === version.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                    onClick={() => setSelectedVersion(version)}
                  >
                    <div>
                      <p className="font-bold text-sm text-gray-900 dark:text-white">
                        {version.setName} ({version.set})
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 capitalize">
                        {version.rarity}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Format Legality */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3">
                  Format Legality
                </h3>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  {formatLegality(cardDetails?.legality || {}).map(({ format, status }) => (
                    <div key={format} className="flex items-center justify-between py-1">
                      <span className="text-gray-700 dark:text-gray-300 text-xs font-medium">{format}</span>
                      <span className={`text-xs font-bold ${
                        status === 'legal' 
                          ? 'text-green-600 dark:text-green-400' 
                          : 'text-gray-500 dark:text-gray-400'
                      }`}>
                        {status === 'legal' ? 'LEGAL' : 'NOT LEGAL'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={() => window.open(`https://shop.tcgplayer.com/magic/product/show?productLineName=magic&productName=${encodeURIComponent(cardName)}`, '_blank')}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View on TCGPlayer
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}