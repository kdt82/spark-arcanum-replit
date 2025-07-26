import { pgTable, text, serial, integer, decimal, boolean, jsonb, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Comprehensive card table matching MTGJSON schema
export const cards = pgTable("cards", {
  // Primary identifiers
  uuid: text("uuid").primaryKey(), // MTGJSON UUID (primary key)
  id: text("id"), // Legacy ID for backward compatibility
  scryfallId: text("scryfall_id"),
  scryfallOracleId: text("scryfall_oracle_id"),
  scryfallIllustrationId: text("scryfall_illustration_id"),
  multiverseId: integer("multiverse_id"),
  mtgoId: integer("mtgo_id"),
  mtgoFoilId: integer("mtgo_foil_id"),
  mtgArenaId: integer("mtg_arena_id"),
  tcgplayerId: integer("tcgplayer_id"),
  cardKingdomId: integer("card_kingdom_id"),
  cardmarketId: integer("cardmarket_id"),
  
  // Basic card info
  name: text("name").notNull(),
  faceName: text("face_name"),
  flavorName: text("flavor_name"),
  faceFlavorName: text("face_flavor_name"),
  setCode: text("set_code").notNull(),
  number: text("number").notNull(),
  artist: text("artist"),
  layout: text("layout").notNull(),
  
  // Mana and casting
  manaCost: text("mana_cost"),
  manaValue: integer("mana_value"), // Replaces deprecated cmc
  cmc: integer("cmc"), // Keep for legacy compatibility
  faceManaCost: text("face_mana_cost"),
  faceManaValue: integer("face_mana_value"),
  colors: text("colors").array(),
  colorIdentity: text("color_identity").array(),
  colorIndicator: text("color_indicator").array(),
  
  // Types and subtypes
  type: text("type").notNull(),
  faceType: text("face_type"),
  types: text("types").array(),
  supertypes: text("supertypes").array(),
  subtypes: text("subtypes").array(),
  
  // Stats
  power: text("power"),
  toughness: text("toughness"),
  loyalty: text("loyalty"),
  defense: text("defense"), // Battle cards
  
  // Text content
  text: text("text"),
  faceText: text("face_text"),
  flavorText: text("flavor_text"),
  originalText: text("original_text"),
  originalType: text("original_type"),
  
  // Set and printing info
  setName: text("set_name"),
  rarity: text("rarity").notNull(),
  frameVersion: text("frame_version"),
  frameEffects: text("frame_effects").array(),
  borderColor: text("border_color"),
  securityStamp: text("security_stamp"),
  finishes: text("finishes").array(), // Replaces hasFoil/hasNonFoil
  duelDeck: text("duel_deck"),
  
  // Boolean flags
  isAlternative: boolean("is_alternative").default(false),
  isFullArt: boolean("is_full_art").default(false),
  isFunny: boolean("is_funny").default(false),
  isOnlineOnly: boolean("is_online_only").default(false),
  isOversized: boolean("is_oversized").default(false),
  isPromo: boolean("is_promo").default(false),
  isRebalanced: boolean("is_rebalanced").default(false),
  isReprint: boolean("is_reprint").default(false),
  isReserved: boolean("is_reserved").default(false),
  isStorySpotlight: boolean("is_story_spotlight").default(false),
  isTextless: boolean("is_textless").default(false),
  hasContentWarning: boolean("has_content_warning").default(false),
  hasAlternativeDeckLimit: boolean("has_alternative_deck_limit").default(false),
  
  // Rankings and metrics
  edhrecRank: integer("edhrec_rank"),
  edhrecSaltiness: decimal("edhrec_saltiness"),
  
  // JSON data for complex structures
  identifiers: jsonb("identifiers"), // All ID mappings
  legalities: jsonb("legalities"),
  keywords: text("keywords").array(),
  foreignData: jsonb("foreign_data"),
  relatedCards: jsonb("related_cards"),
  otherFaceIds: text("other_face_ids").array(), // UUIDs of other faces
  variations: text("variations").array(), // UUIDs of variations
  originalPrintings: text("original_printings").array(), // For rebalanced cards
  
  // Legacy fields (deprecated but maintained for compatibility)
  printings: text("printings").array(),
  rulings: jsonb("rulings"),
  foreignNames: jsonb("foreign_names"), // Use foreignData instead
  imageUrl: text("image_url"), // Prefer identifiers.scryfallId for images
  multiverseid: text("multiverseid"), // Use multiverseId integer instead
  
  // Timestamps (Sydney timezone)
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Ruling storage - for AI generated rulings
export const rulings = pgTable("rulings", {
  id: serial("id").primaryKey(),
  cardId: text("card_id").notNull().references(() => cards.id),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Conversation storage
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  messages: jsonb("messages").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// MTG Rules storage
export const rules = pgTable("rules", {
  id: serial("id").primaryKey(),
  chapter: text("chapter"),
  section: text("section"),
  subsection: text("subsection"),
  rule_number: text("rule_number").notNull(),
  text: text("text").notNull(),
  examples: text("examples").array(),
  keywords: text("keywords").array(),
  related_rules: text("related_rules").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Define relations
export const cardsRelations = relations(cards, ({ many }) => ({
  rulings: many(rulings),
}));

export const rulingsRelations = relations(rulings, ({ one }) => ({
  card: one(cards, {
    fields: [rulings.cardId],
    references: [cards.id],
  }),
}));

// Zod schemas
export const insertCardSchema = createInsertSchema(cards);
export const insertRulingSchema = createInsertSchema(rulings);
export const insertConversationSchema = createInsertSchema(conversations);
export const insertRuleSchema = createInsertSchema(rules);

// Types
export type Card = typeof cards.$inferSelect;
export type InsertCard = z.infer<typeof insertCardSchema>;

export type Ruling = typeof rulings.$inferSelect;
export type InsertRuling = z.infer<typeof insertRulingSchema>;

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;

export type Rule = typeof rules.$inferSelect;
export type InsertRule = z.infer<typeof insertRuleSchema>;

// Database metadata table to track database updates
export const dbMetadata = pgTable("db_metadata", {
  id: text("id").primaryKey(),
  last_updated: timestamp("last_updated").defaultNow(),
  total_cards: integer("total_cards").default(0),
  description: text("description"),
});

// User accounts table
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  emailVerified: boolean("email_verified").default(false),
  resetToken: text("reset_token"),
  resetTokenExpiry: timestamp("reset_token_expiry"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Saved decks table
export const savedDecks = pgTable("saved_decks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  format: text("format").notNull(),
  commander: text("commander"), // Commander card name for Commander format
  deckData: jsonb("deck_data").notNull(), // Stores card IDs and quantities
  sideboardData: jsonb("sideboard_data"), // Stores sideboard card IDs and quantities
  thumbnailCardId: text("thumbnail_card_id"), // Card ID to use as deck thumbnail
  thumbnailCardName: text("thumbnail_card_name"), // Card name for thumbnail
  thumbnailImageUrl: text("thumbnail_image_url"), // Card image URL for thumbnail
  isPublic: boolean("is_public").default(false),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User sessions table for secure session management
export const userSessions = pgTable("user_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionToken: text("session_token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Password reset tokens table
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  usedAt: timestamp("used_at"),
});

// Define relations
export const usersRelations = relations(users, ({ many }) => ({
  savedDecks: many(savedDecks),
  sessions: many(userSessions),
  passwordResetTokens: many(passwordResetTokens),
}));

export const savedDecksRelations = relations(savedDecks, ({ one }) => ({
  user: one(users, {
    fields: [savedDecks.userId],
    references: [users.id],
  }),
}));

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
  user: one(users, {
    fields: [userSessions.userId],
    references: [users.id],
  }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}));

// Zod schemas
export const insertUserSchema = createInsertSchema(users);
export const insertSavedDeckSchema = createInsertSchema(savedDecks);
export const insertUserSessionSchema = createInsertSchema(userSessions);
export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens);

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type SavedDeck = typeof savedDecks.$inferSelect & {
  deckData?: any[];
  sideboardData?: any[];
};
export type InsertSavedDeck = z.infer<typeof insertSavedDeckSchema>;

export type UserSession = typeof userSessions.$inferSelect;
export type InsertUserSession = z.infer<typeof insertUserSessionSchema>;

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;

export const insertDbMetadataSchema = createInsertSchema(dbMetadata);
export type DbMetadata = typeof dbMetadata.$inferSelect;
export type InsertDbMetadata = z.infer<typeof insertDbMetadataSchema>;
