/**
 * MTGSQLive Schema Definition
 * This matches the official MTGJSON PostgreSQL schema exactly
 * Future-proof by using their native structure
 */

// Official MTGSQLive Cards table schema (extracted from AllPrintings.psql)
export interface MTGSQLiveCard {
  id: number;
  artist?: string;
  artistIds?: string;
  asciiName?: string;
  attractionLights?: string;
  availability?: string;
  boosterTypes?: string;
  borderColor?: string;
  cardParts?: string;
  colorIdentity?: string;
  colorIndicator?: string;
  colors?: string;
  convertedManaCost?: number;
  defense?: string;
  duelDeck?: string;
  edhrecRank?: number;
  edhrecSaltiness?: number;
  faceConvertedManaCost?: number;
  faceManaValue?: number;
  faceName?: string;
  finishes?: string;
  flavorName?: string;
  flavorText?: string;
  frameEffects?: string;
  frameVersion?: string;
  hand?: string;
  hasAlternativeDeckLimit?: boolean;
  hasContentWarning?: boolean;
  hasFoil?: boolean;
  hasNonFoil?: boolean;
  isAlternative?: boolean;
  isFullArt?: boolean;
  isFunny?: boolean;
  isOnlineOnly?: boolean;
  isOversized?: boolean;
  isPromo?: boolean;
  isRebalanced?: boolean;
  isReprint?: boolean;
  isReserved?: boolean;
  isStarter?: boolean;
  isStorySpotlight?: boolean;
  isTextless?: boolean;
  isTimeshifted?: boolean;
  keywords?: string;
  language?: string;
  layout?: string;
  leadershipSkills?: string;
  life?: string;
  loyalty?: string;
  manaCost?: string;
  manaValue?: number;
  name?: string;
  number?: string;
  originalPrintings?: string;
  originalReleaseDate?: string;
  originalText?: string;
  originalType?: string;
  otherFaceIds?: string;
  power?: string;
  printings?: string;
  promoTypes?: string;
  purchaseUrls?: string;
  rarity?: string;
  rebalancedPrintings?: string;
  relatedCards?: string;
  securityStamp?: string;
  setCode?: string;
  side?: string;
  signature?: string;
  subsets?: string;
  subtypes?: string;
  supertypes?: string;
  text?: string;
  toughness?: string;
  type?: string;
  types?: string;
  uuid?: string;
  variations?: string;
  watermark?: string;
}

// Official MTGSQLive Sets table schema
export interface MTGSQLiveSet {
  id: number;
  baseSetSize?: number;
  block?: string;
  cardsphereSetId?: number;
  code: string;
  isFoilOnly?: boolean;
  isForeignOnly?: boolean;
  isNonFoilOnly?: boolean;
  isOnlineOnly?: boolean;
  isPartialPreview?: boolean;
  keyruneCode?: string;
  mcmId?: number;
  mcmIdExtras?: number;
  mcmName?: string;
  mtgoCode?: string;
  name?: string;
  parentCode?: string;
  releaseDate?: string;
  sealedProduct?: string;
  tcgplayerGroupId?: number;
  totalSetSize?: number;
  type?: string;
}

// Adapter functions to convert MTGSQLive data to our expected format
export function adaptMTGSQLiveCard(mtgCard: MTGSQLiveCard): any {
  return {
    // Map MTGSQLive fields to our expected interface
    id: mtgCard.uuid || mtgCard.id?.toString(),
    uuid: mtgCard.uuid,
    name: mtgCard.name,
    manaCost: mtgCard.manacost || mtgCard.manaCost,
    manacost: mtgCard.manacost,
    manaValue: mtgCard.manavalue || mtgCard.convertedManaCost,
    manavalue: mtgCard.manavalue,
    cmc: mtgCard.manavalue || mtgCard.convertedManaCost,
    type: mtgCard.type,
    text: mtgCard.text,
    power: mtgCard.power,
    toughness: mtgCard.toughness,
    loyalty: mtgCard.loyalty,
    defense: mtgCard.defense,
    rarity: mtgCard.rarity,
    setCode: mtgCard.setcode || mtgCard.setCode,
    setcode: mtgCard.setcode,
    number: mtgCard.number,
    artist: mtgCard.artist,
    flavorText: mtgCard.flavorText,
    colors: mtgCard.colors?.split(',') || [],
    colorIdentity: mtgCard.colorIdentity?.split(',') || [],
    keywords: mtgCard.keywords?.split(',') || [],
    supertypes: mtgCard.supertypes?.split(',') || [],
    types: mtgCard.types?.split(',') || [],
    subtypes: mtgCard.subtypes?.split(',') || [],
    
    // Boolean flags
    isPromo: mtgCard.isPromo || false,
    isReserved: mtgCard.isReserved || false,
    isRebalanced: mtgCard.isRebalanced || false,
    isFullArt: mtgCard.isFullArt || false,
    
    // Additional fields
    frameVersion: mtgCard.frameVersion,
    borderColor: mtgCard.borderColor,
    layout: mtgCard.layout,
    edhrecRank: mtgCard.edhrecRank,
    printings: mtgCard.printings?.split(',') || []
  };
}

export function adaptMTGSQLiveSet(mtgSet: MTGSQLiveSet): any {
  return {
    id: mtgSet.code,
    code: mtgSet.code,
    name: mtgSet.name,
    releaseDate: mtgSet.releaseDate,
    type: mtgSet.type,
    baseSetSize: mtgSet.baseSetSize,
    totalSetSize: mtgSet.totalSetSize,
    block: mtgSet.block,
    keyruneCode: mtgSet.keyruneCode,
    parentCode: mtgSet.parentCode,
    isFoilOnly: mtgSet.isFoilOnly || false,
    isOnlineOnly: mtgSet.isOnlineOnly || false
  };
}