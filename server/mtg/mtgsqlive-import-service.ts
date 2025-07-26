/**
 * MTGSQLive Import Service
 * Downloads and imports MTGJSON's pre-built PostgreSQL database
 * This is the recommended approach from MTGJSON.com
 */

import { db } from '../db';
import { dbMetadata } from '@shared/schema';
import { sql, eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class MTGSQLiveService {
  private readonly dataDir: string;
  private readonly sqlFileUrl = 'https://mtgjson.com/api/v5/AllPrintings.psql';
  private readonly compressedFile: string;
  private readonly sqlFile: string;

  constructor() {
    this.dataDir = path.join(process.cwd(), 'data');
    this.compressedFile = path.join(this.dataDir, 'AllPrintings.psql.xz');
    this.sqlFile = path.join(this.dataDir, 'AllPrintings.psql');
    
    // Ensure data directory exists
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * Check if we need to update the database
   */
  public async shouldUpdate(): Promise<boolean> {
    try {
      // Check if we have any cards
      const cardCount = await db.select({ count: sql`count(*)` }).from(sql`cards`);
      const count = Number(cardCount[0]?.count || 0);
      
      if (count === 0) {
        console.log('📋 No cards found - triggering MTGSQLive import');
        return true;
      }

      // Check metadata for last update
      const metadata = await db
        .select()
        .from(dbMetadata)
        .where(eq(dbMetadata.id, "mtgsqlive_database"));

      if (!metadata.length) {
        console.log('📋 No MTGSQLive metadata found - triggering import');
        return true;
      }

      const lastUpdated = new Date(metadata[0].last_updated!);
      const daysSinceUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceUpdate > 7) {
        console.log(`📋 Database is ${Math.floor(daysSinceUpdate)} days old - triggering update`);
        return true;
      }

      console.log(`📋 Database is current (last updated ${Math.floor(daysSinceUpdate)} days ago)`);
      return false;
    } catch (error) {
      console.log('📋 Error checking database status - triggering import');
      return true;
    }
  }

  /**
   * Download the compressed PostgreSQL file
   */
  public async downloadMTGSQLive(): Promise<void> {
    console.log('📥 Starting MTGSQLive PostgreSQL download...');
    
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(this.compressedFile);
      
      https.get(this.sqlFileUrl, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }

        const totalSize = parseInt(response.headers['content-length'] || '0', 10);
        let downloadedSize = 0;

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          const progress = totalSize > 0 ? (downloadedSize / totalSize * 100).toFixed(1) : '?';
          if (downloadedSize % (1024 * 1024 * 5) === 0) { // Log every 5MB
            console.log(`📥 Downloaded ${(downloadedSize / 1024 / 1024).toFixed(1)}MB (${progress}%)`);
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          console.log(`✅ MTGSQLive download completed: ${(downloadedSize / 1024 / 1024).toFixed(1)}MB`);
          resolve();
        });

        file.on('error', (error) => {
          fs.unlink(this.compressedFile, () => {}); // Delete partial file
          reject(error);
        });
      }).on('error', reject);
    });
  }

  /**
   * Extract the compressed file using xz
   */
  public async extractMTGSQLive(): Promise<void> {
    console.log('📦 Extracting MTGSQLive PostgreSQL file...');
    
    return new Promise((resolve, reject) => {
      const xz = spawn('xz', ['-d', '-k', this.compressedFile]); // -k keeps original file
      
      xz.stdout.on('data', (data) => {
        console.log(`📦 ${data.toString().trim()}`);
      });

      xz.stderr.on('data', (data) => {
        console.log(`📦 ${data.toString().trim()}`);
      });

      xz.on('close', (code) => {
        if (code === 0) {
          console.log('✅ MTGSQLive extraction completed');
          resolve();
        } else {
          reject(new Error(`xz extraction failed with code ${code}`));
        }
      });

      xz.on('error', (error) => {
        reject(new Error(`Failed to start xz: ${error.message}`));
      });
    });
  }

  /**
   * Import fresh MTGJSON data using direct PostgreSQL import
   */
  public async importFromMTGJSON(): Promise<{ success: boolean; message: string }> {
    try {
      console.log('🗄️ Starting MTGSQLive PostgreSQL import...');
      
      // Check if we should update
      const shouldUpdate = await this.shouldUpdate();
      if (!shouldUpdate) {
        return { success: true, message: 'Database is already up to date' };
      }

      // Download and import the latest PostgreSQL schema directly
      console.log('📥 Downloading MTGJSON PostgreSQL schema...');
      
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) {
        throw new Error('DATABASE_URL not found');
      }

      // Stream the SQL file directly to psql for import
      return new Promise((resolve, reject) => {
        const psql = spawn('psql', [dbUrl], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        // Start downloading and piping to psql
        https.get(this.sqlFileUrl, (response) => {
          if (response.statusCode !== 200) {
            reject(new Error(`Download failed: ${response.statusCode}`));
            return;
          }

          const totalSize = parseInt(response.headers['content-length'] || '0', 10);
          let downloadedSize = 0;
          let importedLines = 0;

          response.on('data', (chunk) => {
            downloadedSize += chunk.length;
            const progress = totalSize > 0 ? (downloadedSize / totalSize * 100).toFixed(1) : '?';
            
            // Log progress every 10MB
            if (downloadedSize % (1024 * 1024 * 10) === 0) {
              console.log(`📥 Importing ${(downloadedSize / 1024 / 1024).toFixed(1)}MB (${progress}%)`);
            }
          });

          // Pipe the download directly to psql
          response.pipe(psql.stdin);

          response.on('end', () => {
            console.log(`✅ Download completed: ${(downloadedSize / 1024 / 1024).toFixed(1)}MB`);
            psql.stdin.end();
          });
        }).on('error', (error) => {
          psql.kill();
          reject(error);
        });

        let output = '';
        let errorOutput = '';

        psql.stdout.on('data', (data) => {
          output += data.toString();
          importedLines++;
          if (importedLines % 1000 === 0) {
            console.log(`🗄️ Processed ${importedLines} database operations...`);
          }
        });

        psql.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        psql.on('close', async (code) => {
          if (code === 0) {
            console.log('✅ MTGSQLive import completed successfully');
            
            // Update metadata
            try {
              await db
                .insert(dbMetadata)
                .values({
                  id: "mtgsqlive_database",
                  last_updated: new Date(),
                  description: "MTGSQLive PostgreSQL import from MTGJSON",
                  total_cards: await this.getCardCount()
                })
                .onConflictDoUpdate({
                  target: dbMetadata.id,
                  set: {
                    last_updated: new Date(),
                    description: "MTGSQLive PostgreSQL import from MTGJSON",
                    total_cards: await this.getCardCount()
                  }
                });
            } catch (metaError) {
              console.log('Warning: Failed to update metadata:', metaError);
            }
            
            resolve({ success: true, message: 'MTGSQLive import completed successfully' });
          } else {
            console.error('❌ psql import failed:', errorOutput);
            reject(new Error(`psql import failed with code ${code}: ${errorOutput}`));
          }
        });

        psql.on('error', (error) => {
          reject(new Error(`Failed to start psql: ${error.message}`));
        });
      });
      
    } catch (error: any) {
      console.error('❌ MTGSQLive import failed:', error);
      return { success: false, message: `Import failed: ${error.message}` };
    }
  }

  /**
   * Get the current card count from the database
   */
  private async getCardCount(): Promise<number> {
    try {
      const result = await db.execute(sql`SELECT COUNT(*) as count FROM cards`);
      return result.rows ? Number(result.rows[0]?.count || 0) : 0;
    } catch (error) {
      return 0;
    }
      const psql = spawn('psql', [dbUrl, '-f', this.sqlFile], {
        stdio: ['inherit', 'pipe', 'pipe']
      });

      let output = '';
      let errorOutput = '';

      psql.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        // Log major operations
        if (text.includes('CREATE TABLE') || text.includes('INSERT') || text.includes('COPY')) {
          console.log(`🗄️ ${text.trim().split('\n')[0]}`);
        }
      });

      psql.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        // Only log actual errors, not notices
        if (text.includes('ERROR:') && !text.includes('does not exist')) {
          console.log(`🗄️ ${text.trim()}`);
        }
      });

      psql.on('close', (code) => {
        if (code === 0 || errorOutput.includes('cards') && !errorOutput.includes('FATAL')) {
          console.log('✅ MTGSQLive import completed successfully');
          resolve();
        } else {
          console.error('❌ Import failed:', errorOutput);
          reject(new Error(`psql import failed with code ${code}: ${errorOutput}`));
        }
      });

      psql.on('error', (error) => {
        reject(new Error(`Failed to start psql: ${error.message}`));
      });
    });
  }
}

    } catch (error: any) {
      console.error('❌ MTGSQLive setup failed:', error);
      throw error;
    }
  }

  /**
   * Clean import that completely replaces our schema with MTGSQLive's official schema
   */
  public async importMTGSQLiveClean(): Promise<void> {
    console.log('🗄️ CLEAN IMPORT: Replacing entire schema with official MTGSQLive structure...');

    // Get database connection details from DATABASE_URL  
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('DATABASE_URL not found');
    }

    return new Promise((resolve, reject) => {
      // Create a clean database import - let MTGSQLive define everything
      const psql = spawn('psql', [dbUrl], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Send commands to completely clear and rebuild with MTGSQLive schema
      const commands = [
        '-- Drop all existing tables that conflict with MTGSQLive',
        'DROP SCHEMA IF EXISTS public CASCADE;',
        'CREATE SCHEMA public;',
        'GRANT ALL ON SCHEMA public TO postgres;',
        'GRANT ALL ON SCHEMA public TO public;',
        '-- Import MTGSQLive schema and data',
        `\\i ${this.sqlFile}`,
        '\\q'
      ].join('\n');

      psql.stdin.write(commands);
      psql.stdin.end();

      let output = '';
      let errorOutput = '';

      psql.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        // Log major operations
        if (text.includes('CREATE TABLE') || text.includes('INSERT') || text.includes('COPY')) {
          console.log(`🗄️ ${text.trim().split('\n')[0]}`);
        }
      });

      psql.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        // Only log actual errors, not notices
        if (text.includes('ERROR:') && !text.includes('does not exist')) {
          console.log(`🗄️ ERROR: ${text.trim()}`);
        }
      });

      psql.on('close', (code) => {
        if (code === 0) {
          console.log('✅ MTGSQLive clean import completed successfully');
          console.log('📊 Database now uses official MTGJSON schema structure');
          resolve();
        } else {
          console.error('❌ Clean import failed:', errorOutput);
          reject(new Error(`psql clean import failed with code ${code}: ${errorOutput}`));
        }
      });

      psql.on('error', (error) => {
        reject(new Error(`Failed to start psql for clean import: ${error.message}`));
      });
    });
  }

  /**
   * Update database metadata after successful import
   */
  private async updateDatabaseMetadata(): Promise<void> {
    try {
      // Count cards in the imported database using raw SQL since we don't know the exact schema
      const cardCountResult = await db.execute(sql`SELECT COUNT(*) as count FROM cards`);
      const totalCards = Number(cardCountResult.rows[0]?.count || 0);

      // Count sets
      const setCountResult = await db.execute(sql`SELECT COUNT(DISTINCT code) as count FROM sets`);
      const totalSets = Number(setCountResult.rows[0]?.count || 0);

      await db
        .insert(dbMetadata)
        .values({
          id: "mtgsqlive_database",
          last_updated: new Date(),
          total_cards: totalCards,
          description: `MTGSQLive PostgreSQL import - ${totalCards} cards from ${totalSets} sets (official MTGJSON database)`,
        })
        .onConflictDoUpdate({
          target: dbMetadata.id,
          set: {
            last_updated: new Date(),
            total_cards: totalCards,
            description: `MTGSQLive PostgreSQL import - ${totalCards} cards from ${totalSets} sets (official MTGJSON database)`,
          },
        });

      console.log(`📊 Updated database metadata: ${totalCards} total cards from ${totalSets} sets`);
    } catch (error: any) {
      console.error('❌ Error updating database metadata:', error);
      console.log('📋 Attempting metadata update without card counting...');
      
      // Fallback metadata update
      try {
        await db
          .insert(dbMetadata)
          .values({
            id: "mtgsqlive_database",
            last_updated: new Date(),
            total_cards: 0,
            description: "MTGSQLive PostgreSQL import completed (card count pending)",
          })
          .onConflictDoUpdate({
            target: dbMetadata.id,
            set: {
              last_updated: new Date(),
              description: "MTGSQLive PostgreSQL import completed (card count pending)",
            },
          });
        console.log('📊 Basic metadata updated successfully');
      } catch (fallbackError: any) {
        console.error('❌ Fallback metadata update also failed:', fallbackError);
      }
    }
  }

  /**
   * Get import statistics using raw SQL for compatibility
   */
  public async getImportStats(): Promise<any> {
    try {
      // Use raw SQL to get card count
      const cardCountResult = await db.execute(sql`SELECT COUNT(*) as count FROM cards`);
      const totalCards = Number(cardCountResult.rows[0]?.count || 0);
      
      // Use raw SQL to get set count
      const setCountResult = await db.execute(sql`SELECT COUNT(DISTINCT code) as count FROM sets`);
      const totalSets = Number(setCountResult.rows[0]?.count || 0);
      
      // Get metadata
      const metadata = await db
        .select()
        .from(dbMetadata)
        .where(eq(dbMetadata.id, "mtgsqlive_database"));
      
      return {
        totalCards: totalCards,
        totalSets: totalSets,
        lastUpdated: metadata[0]?.last_updated || null,
        description: metadata[0]?.description || null,
        importMethod: 'MTGSQLive PostgreSQL',
        databaseSchema: 'Official MTGJSON Schema',
      };
    } catch (error: any) {
      console.error('❌ Error getting import stats:', error);
      
      // Try to get metadata even if card counting fails
      try {
        const metadata = await db
          .select()
          .from(dbMetadata)
          .where(eq(dbMetadata.id, "mtgsqlive_database"));
          
        return {
          totalCards: 'Unknown',
          totalSets: 'Unknown',
          lastUpdated: metadata[0]?.last_updated || null,
          description: metadata[0]?.description || 'MTGSQLive import attempted',
          importMethod: 'MTGSQLive PostgreSQL',
          databaseSchema: 'Official MTGJSON Schema',
          error: 'Statistics retrieval failed - schema mismatch possible',
        };
      } catch (metadataError: any) {
        return {
          totalCards: 'Unknown',
          totalSets: 'Unknown',
          lastUpdated: null,
          description: 'Error retrieving statistics',
          importMethod: 'MTGSQLive PostgreSQL',
          databaseSchema: 'Official MTGJSON Schema',
          error: error.message,
        };
      }
    }
  }

  /**
   * Clean up downloaded files
   */
  public async cleanup(): Promise<void> {
    try {
      if (fs.existsSync(this.compressedFile)) {
        fs.unlinkSync(this.compressedFile);
        console.log('🧹 Cleaned up compressed file');
      }
      
      if (fs.existsSync(this.sqlFile)) {
        fs.unlinkSync(this.sqlFile);
        console.log('🧹 Cleaned up SQL file');
      }
    } catch (error: any) {
      console.log('🧹 Cleanup warning:', error.message);
    }
  }
}

export const mtgSQLiveService = new MTGSQLiveService();