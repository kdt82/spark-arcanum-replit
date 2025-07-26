import fs from 'fs';
import { db } from './db';
import { rules } from '@shared/schema';

/**
 * Parse and update the comprehensive rules database
 * This will clear existing rules and load the latest version
 */
export async function updateRulesDatabase(filePath: string): Promise<void> {
  console.log('Starting differential rules database update...');
  
  try {
    // Read the comprehensive rules file
    const rulesText = fs.readFileSync(filePath, 'utf-8');
    
    // Parse the rules text
    const parsedRules = parseComprehensiveRules(rulesText);
    console.log(`Parsed ${parsedRules.length} rules from file`);
    
    // Perform differential update
    await performDifferentialRulesUpdate(parsedRules);
    
    // Generate and add mechanic-specific rules from card database
    await generateMechanicRulesFromCards();
    
    console.log('Rules database update completed successfully');
  } catch (error) {
    console.error('Error updating rules database:', error);
    throw error;
  }
}

/**
 * Perform differential update to avoid duplicates and only update changed rules
 */
async function performDifferentialRulesUpdate(newRules: any[]): Promise<void> {
  const { eq } = await import('drizzle-orm');
  
  // Get existing rules to compare
  const existingRules = await db.select().from(rules);
  const existingRulesMap = new Map(existingRules.map(rule => [rule.rule_number, rule]));
  
  let updated = 0;
  let inserted = 0;
  let unchanged = 0;
  
  // Process rules in batches
  const batchSize = 50;
  for (let i = 0; i < newRules.length; i += batchSize) {
    const batch = newRules.slice(i, i + batchSize);
    
    for (const newRule of batch) {
      if (!newRule.ruleNumber) continue;
      
      const existingRule = existingRulesMap.get(newRule.ruleNumber);
      
      if (!existingRule) {
        // New rule - insert it
        try {
          const ruleData = {
            rule_number: newRule.ruleNumber,
            text: newRule.text,
            examples: newRule.examples,
            keywords: newRule.keywords,
            chapter: newRule.chapter,
            section: newRule.section,
            subsection: newRule.subsection,
            related_rules: newRule.relatedRules
          };
          await db.insert(rules).values(ruleData);
          inserted++;
        } catch (error) {
          console.warn(`Failed to insert rule ${newRule.ruleNumber}:`, error);
        }
      } else if (existingRule.text !== newRule.text || 
                 JSON.stringify(existingRule.examples) !== JSON.stringify(newRule.examples) ||
                 JSON.stringify(existingRule.keywords) !== JSON.stringify(newRule.keywords)) {
        // Rule content changed - update it
        try {
          await db.update(rules)
            .set({
              text: newRule.text,
              examples: newRule.examples,
              keywords: newRule.keywords,
              chapter: newRule.chapter,
              section: newRule.section,
              subsection: newRule.subsection,
              related_rules: newRule.relatedRules,
              updatedAt: new Date()
            })
            .where(eq(rules.rule_number, newRule.ruleNumber));
          updated++;
        } catch (error) {
          console.warn(`Failed to update rule ${newRule.ruleNumber}:`, error);
        }
      } else {
        unchanged++;
      }
    }
  }
  
  console.log(`Differential update: ${inserted} new, ${updated} updated, ${unchanged} unchanged`);
}

/**
 * Generate mechanic-specific rules from card database for newer mechanics not in comprehensive rules
 */
async function generateMechanicRulesFromCards(): Promise<void> {
  console.log('Generating mechanic rules from card database...');
  
  const { cards } = await import('@shared/schema');
  
  // Define newer mechanics to generate rules for
  const newerMechanics = ['void', 'station', 'warp'];
  
  for (const mechanic of newerMechanics) {
    // Get cards with this mechanic
    const { ilike, and, eq } = await import('drizzle-orm');
    const mechanicCards = await db.select().from(cards)
      .where(and(
        ilike(cards.text, `%${mechanic}%`),
        eq(cards.set, 'EOE')
      ))
      .limit(10);
    
    if (mechanicCards.length > 0) {
      // Create a synthetic rule entry for this mechanic
      const mechanicRuleData = {
        rule_number: `900.${mechanic.charAt(0).toUpperCase()}`,
        text: generateMechanicRuleText(mechanic, mechanicCards),
        examples: mechanicCards.slice(0, 3).map(card => `${card.name}: ${card.text?.split('\n')[0] || ''}`),
        keywords: [mechanic.charAt(0).toUpperCase() + mechanic.slice(1)],
        chapter: 'Newer Mechanics',
        section: 'Set-Specific Mechanics',
        subsection: mechanic,
        related_rules: []
      };
      
      // Insert or update the mechanic rule
      try {
        const { eq } = await import('drizzle-orm');
        const existing = await db.select().from(rules)
          .where(eq(rules.rule_number, mechanicRuleData.rule_number))
          .limit(1);
        
        if (existing.length === 0) {
          await db.insert(rules).values(mechanicRuleData);
          console.log(`Generated rule for ${mechanic} mechanic`);
        } else {
          await db.update(rules)
            .set(mechanicRuleData)
            .where(eq(rules.rule_number, mechanicRuleData.rule_number));
          console.log(`Updated rule for ${mechanic} mechanic`);
        }
      } catch (error) {
        console.warn(`Failed to create rule for ${mechanic}:`, error);
      }
    }
  }
}

/**
 * Generate rule text for a mechanic based on card examples
 */
function generateMechanicRuleText(mechanic: string, mechanicCards: any[]): string {
  switch (mechanic) {
    case 'void':
      return `Void is an ability word that appears on cards with triggered abilities. Void abilities typically trigger at the beginning of your end step if a nonland permanent left the battlefield this turn or a spell was warped this turn. The specific effect varies by card.`;
    
    case 'station':
      return `Station is an ability that appears on Spacecraft artifacts. Station allows you to tap another creature you control to put charge counters equal to its power on the Spacecraft. Station can only be activated as a sorcery. When a Spacecraft has enough charge counters to meet its STATION threshold, it becomes an artifact creature with the abilities listed for that threshold.`;
    
    case 'warp':
      return `Warp is a mechanic that appears in Edge of Eternities. When a spell is warped, it triggers various void abilities and other effects that check for warped spells during the turn.`;
    
    default:
      return `${mechanic.charAt(0).toUpperCase() + mechanic.slice(1)} is a mechanic that appears in newer Magic: The Gathering sets. Refer to the specific card text for how this mechanic functions.`;
  }
}

/**
 * Parse the comprehensive rules text into structured data
 */
function parseComprehensiveRules(rulesText: string): any[] {
  const rules: any[] = [];
  
  // Find where the actual rules content starts (after "1. Game Concepts")
  const startIndex = rulesText.indexOf('1. Game Concepts');
  if (startIndex === -1) {
    console.log('Could not find "1. Game Concepts" in the rules text');
    return rules;
  }
  
  let cleanText = rulesText.substring(startIndex);
  
  // The text is all concatenated, so we need to find rule patterns in the continuous text
  // Match patterns like "100.1. " or "100.1a. " followed by rule text
  const rulePattern = /(\d{3}\.\d+[a-z]*)\.\s+([^0-9]*?)(?=\d{3}\.\d+[a-z]*\.|$)/g;
  
  let currentChapter = 'Game Concepts';
  let currentSection = '';
  
  // Extract chapters and sections
  const chapterPattern = /(\d+)\.\s+([A-Z][^0-9]*?)(?=\d{3}\.)/g;
  let chapterMatch;
  const chapters: {[key: number]: string} = {};
  
  while ((chapterMatch = chapterPattern.exec(cleanText)) !== null) {
    const chapterNum = parseInt(chapterMatch[1]);
    chapters[chapterNum] = chapterMatch[2].trim();
  }
  
  // Extract sections like "100. General"
  const sectionPattern = /(\d{3})\.\s+([A-Z][^0-9]*?)(?=\d{3}\.\d+)/g;
  let sectionMatch;
  const sections: {[key: number]: string} = {};
  
  while ((sectionMatch = sectionPattern.exec(cleanText)) !== null) {
    const sectionNum = parseInt(sectionMatch[1]);
    sections[sectionNum] = sectionMatch[2].trim();
  }
  
  // Now extract individual rules
  let ruleMatch;
  while ((ruleMatch = rulePattern.exec(cleanText)) !== null) {
    const ruleNumber = ruleMatch[1];
    const ruleText = ruleMatch[2].trim();
    
    if (ruleText.length > 10) { // Filter out very short matches
      // Determine chapter and section from rule number
      const rulePrefix = parseInt(ruleNumber.split('.')[0]);
      const chapterNum = Math.floor(rulePrefix / 100);
      
      currentChapter = chapters[chapterNum] || currentChapter;
      currentSection = sections[rulePrefix] || currentSection;
      
      rules.push(createRuleEntry(ruleNumber, ruleText, currentChapter, currentSection));
    }
  }
  
  return rules;
}

/**
 * Create a rule entry for database insertion
 */
function createRuleEntry(ruleNumber: string, text: string, chapter: string, section: string): any {
  // Extract examples from the text
  const examples: string[] = [];
  const exampleRegex = /Example:\s*([^.]*\.)/g;
  let match;
  while ((match = exampleRegex.exec(text)) !== null) {
    examples.push(match[1].trim());
  }
  
  // Extract keywords from the text
  const keywords: string[] = [];
  const keywordMatches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
  if (keywordMatches) {
    keywords.push(...keywordMatches.slice(0, 10)); // Limit to 10 keywords
  }
  
  // Determine subsection
  const subsection = ruleNumber.includes('.') ? ruleNumber.split('.')[1] : '';
  
  return {
    ruleNumber: ruleNumber || null, // Ensure ruleNumber is never undefined
    text: text.replace(/Example:\s*[^.]*\./g, '').trim(), // Remove examples from main text
    examples,
    keywords,
    chapter,
    section,
    subsection,
    relatedRules: [] // Could be enhanced to find related rules
  };
}

/**
 * Update rules from the attached comprehensive rules file
 */
export async function updateRulesFromFile(): Promise<void> {
  const filePath = './attached_assets/MagicCompRules.txt';
  
  if (!fs.existsSync(filePath)) {
    throw new Error('Comprehensive rules file not found');
  }
  
  await updateRulesDatabase(filePath);
}

/**
 * Update rules by downloading the latest version from Wizards of the Coast
 */
export async function updateRulesFromWotc(): Promise<{success: boolean, message: string}> {
  try {
    const https = await import('https');
    const path = await import('path');
    
    // Check if rules were updated recently (within last 7 days)
    const { rules } = await import('@shared/schema');
    const existingRules = await db.select().from(rules).limit(1);
    
    if (existingRules.length > 0) {
      const lastUpdate = existingRules[0].createdAt;
      const daysSinceUpdate = lastUpdate ? (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24) : 30;
      
      if (daysSinceUpdate < 7) {
        return {
          success: true,
          message: `Rules were updated ${Math.round(daysSinceUpdate)} days ago. Skipping update.`
        };
      }
    }
    
    console.log('Downloading latest comprehensive rules from Wizards of the Coast...');
    
    // Download the latest comprehensive rules
    const rulesUrl = 'https://media.wizards.com/2025/downloads/MagicCompRules%2020250404.txt';
    const tempDir = './temp';
    const tempFilePath = path.join(tempDir, 'MagicCompRules_latest.txt');
    
    // Create temp directory if it doesn't exist
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(tempFilePath);
      
      https.get(rulesUrl, (response) => {
        if (response.statusCode === 200) {
          response.pipe(file);
          
          file.on('finish', async () => {
            file.close();
            
            try {
              // Update the rules database with the downloaded file
              await updateRulesDatabase(tempFilePath);
              
              // Clean up temp file
              fs.unlinkSync(tempFilePath);
              
              resolve({
                success: true,
                message: 'Comprehensive rules updated successfully from official source'
              });
            } catch (updateError: any) {
              reject(new Error(`Failed to process downloaded rules: ${updateError.message}`));
            }
          });
          
          file.on('error', (err) => {
            fs.unlinkSync(tempFilePath);
            reject(new Error(`Failed to save rules file: ${err.message}`));
          });
        } else {
          reject(new Error(`Failed to download rules. HTTP status: ${response.statusCode}`));
        }
      }).on('error', (err) => {
        reject(new Error(`Network error downloading rules: ${err.message}`));
      });
    });
    
  } catch (error: any) {
    console.error('Error updating rules from WotC:', error);
    
    // Fallback to local file if available
    try {
      await updateRulesFromFile();
      return {
        success: true,
        message: 'Used local comprehensive rules file as fallback'
      };
    } catch (fallbackError: any) {
      return {
        success: false,
        message: `Failed to update rules: ${error.message}. Fallback also failed: ${fallbackError.message}`
      };
    }
  }
}