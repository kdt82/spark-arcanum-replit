# Railway Deployment Guide

## Files to Push to GitHub

Push these essential files to your GitHub repository for Railway deployment:

### Core Application Files
- `package.json` - Dependencies and scripts
- `package-lock.json` - Locked dependency versions
- `tsconfig.json` - TypeScript configuration
- `vite.config.ts` - Build configuration
- `tailwind.config.ts` - Styling configuration
- `postcss.config.js` - CSS processing
- `components.json` - UI component configuration

### Railway Configuration Files
- `railway.toml` - Railway deployment settings
- `nixpacks.toml` - Build configuration for Railway
- `Procfile` - Process definition (backup)

### Source Code Directories
- `server/` - Backend API code
- `client/` - Frontend React code
- `shared/` - Shared types and schemas
- `public/` - Static assets

### Database Configuration
- `drizzle.config.ts` - Database ORM configuration
- `shared/schema.ts` - Database schema definitions

## Git Commands to Deploy

```bash
# Add all changes
git add .

# Commit with descriptive message
git commit -m "Fix Railway database connection handling and WebSocket errors"

# Push to main branch (Railway watches this)
git push origin main
```

## Railway Environment Variables

Make sure these are set in your Railway dashboard:

### Required Variables
- `DATABASE_URL=postgresql://postgres:kJubEwLbCCSHsuqxCdxHwIsvFMahOxux@postgres.railway.internal:5432/railway`
- `SESSION_SECRET` - Session encryption key (generate a secure 64+ character string)
- `OPENAI_API_KEY` - AI features (optional but recommended)
- `NODE_ENV=production` - Production environment

### Railway Will Auto-Set
- `PORT` - Automatically assigned by Railway
- `RAILWAY_ENVIRONMENT` - Set to "production"

### Database Connection Fix
✓ **Fixed WebSocket Connection Issue** - App now detects Railway PostgreSQL vs Neon Database
✓ **Auto-Detection** - Uses standard PostgreSQL driver for Railway, WebSocket for Neon
✓ **No SSL Required** - Railway internal connections work without SSL certificates

## Key Features Fixed

✓ **Railway PostgreSQL Connection** - Auto-detects Railway vs Neon databases, uses correct drivers
✓ **Automatic Schema Creation** - Creates all required tables on first connection to empty database  
✓ **WebSocket Error Prevention** - Fixed ECONNREFUSED errors from Railway internal services
✓ **Graceful Database Detection** - Handles different database result formats across providers
✓ **Manual Recovery Endpoints** - `/api/admin/init-database` and `/api/admin/create-tables` for troubleshooting
✓ **Clean Railway Deployment** - No more "relation does not exist" errors on fresh databases

## Deploy Process

1. **Push to GitHub**: `git push origin main`
2. **Railway Auto-Deploy**: Detects changes and rebuilds
3. **Database Auto-Initialize**: Creates all tables on first connection
4. **Schema Ready**: All 6 core tables (users, sessions, cards, decks, rules, db_metadata)
5. **Service Startup**: Rules service, card database, AI features initialize
6. **Health Check**: `/api/health` confirms successful deployment

## Troubleshooting Railway Database Issues

If you encounter database errors on Railway:

1. **Check database status**: `GET /api/health/detailed`
2. **Force create tables**: `POST /api/admin/create-tables`
3. **Initialize schema**: `POST /api/admin/init-database`

The app now handles Railway's PostgreSQL service properly and automatically creates all required database tables.