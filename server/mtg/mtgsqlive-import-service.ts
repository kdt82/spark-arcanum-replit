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
  }
}

export const mtgSQLiveService = new MTGSQLiveService();