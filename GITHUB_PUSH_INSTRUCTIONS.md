
# GitHub Push & Railway Deployment Guide - v1.1.21

## Latest Updates (v1.1.21)
- ✅ **MTGSQLive PostgreSQL Import**: Official MTGJSON schema streaming from mtgjson.com/api/v5/AllPrintings.psql
- ✅ **Critical Rule Enforcement**: NO AllPrintings.json files - pure PostgreSQL schema only
- ✅ **Missing Cards Resolution**: Fixes Tifa Lockhart, Cori-Steel Cutter, Final Fantasy sets
- ✅ **Version-Specific Data**: Each card printing shows unique flavor text and artist
- ✅ **Real-Time Import**: Streams 563MB PostgreSQL schema directly to database
- ✅ **MTGJSON v5.2.2**: Latest official data from July 25, 2025

## Step 1: Push to GitHub

### Current Situation
You are on the `clean-main` branch which contains the clean codebase (76MB) without database files. The `main` branch on GitHub still contains large files that prevent normal pushing.

### SOLUTION: Force Push Clean Branch

Since git authentication requires your credentials, run these commands in the Replit Shell:

```bash
# Check current branch (should show: * clean-main)
git branch

# Check status (should show: clean working tree)
git status

# FORCE PUSH: Replace problematic main branch with clean branch
git push --force-with-lease origin clean-main:main

# If the above fails, use stronger force push:
git push --force origin clean-main:main
```

### Why Force Push is Necessary
- Your `clean-main` branch has completely different history than remote `main`
- Remote `main` contains 563MB+ database files that prevent deployment
- Force push replaces the entire remote history with your clean branch
- Results in deployable 76MB repository without large files

### Alternative: Standard Git Workflow (if force push fails)
```bash
# Only use if force push doesn't work
git rm --cached -r data/ 2>/dev/null || echo "Data directory removed from tracking"
git rm --cached data/AllPrintings.psql 2>/dev/null || echo "PostgreSQL file removed from tracking"
git rm --cached data/AllPrintings.psql.xz 2>/dev/null || echo "Compressed file removed from tracking"
git rm --cached data/AllPrintings.json 2>/dev/null || echo "JSON file removed from tracking"

git add .
git commit -m "Remove large database files from tracking - prepare for Railway deployment"
git push origin main
```

## Step 2: Deploy to Railway

### Quick Deploy (Recommended)
1. **Go to**: https://railway.app
2. **Click**: "New Project" 
3. **Select**: "Deploy from GitHub repo"
4. **Choose**: Your repository (`spark-arcanum` or similar)
5. **Click**: "Deploy Now"

Railway will automatically:
- ✅ Detect Node.js project and use `nixpacks.toml` configuration
- ✅ Install dependencies with `npm ci`
- ✅ Build with `npm run build`
- ✅ Start with `node dist/index.js`
- ✅ Set up health checks at `/api/health`
- ✅ Create fresh PostgreSQL database (no local data transferred)
- ✅ Download and import MTGJSON v5.2.2 on first startup

## ✅ .gitignore Fixes Applied

**Before Fix:** ~538MB (including database files)
**After Fix:** ~76MB (codebase only)

**Now Excluded from GitHub Push:**
- `data/` directory (538MB of MTGJSON files)
- `uploads/` directory (user content)
- `temp/` and `cache/` directories
- All `*.psql`, `*.json`, and `*.xz` database files
- Large attached assets and temporary files

**Railway Benefits:**
- Faster GitHub push (76MB vs 538MB)
- Fresh database created on each deployment
- No data contamination between environments
- Official MTGJSON import on Railway startup

### Step 3: Add Environment Variables

In Railway Dashboard → Variables tab, add:

```bash
NODE_ENV=production
SESSION_SECRET=your-secure-64-character-session-key-here
OPENAI_API_KEY=your-openai-api-key-here
```

**Generate a secure SESSION_SECRET:**
```bash
# Run this in any terminal to generate a secure key
openssl rand -base64 64
```

### Step 4: Add PostgreSQL Database (Recommended)

1. **In Railway project**: Click "New Service"
2. **Select**: "PostgreSQL"
3. **Railway automatically**:
   - Creates `DATABASE_URL` environment variable
   - Connects it to your application
   - The app will auto-create all required tables

### Step 5: Monitor Deployment

Watch Railway logs for successful startup:

```
🚂 Railway Environment Variable Loader
📋 Railway Platform Detected: true
✅ NODE_ENV: Set (10 chars)
✅ SESSION_SECRET: Set (64 chars)
✅ DATABASE_URL: Set (railway postgresql)
🚀 Starting Spark Arcanum server...
🎯 Spark Arcanum serving on port 8080
📚 Database schema verified - initializing rules service
✅ All 6 core tables created successfully
🎉 Magic: The Gathering database ready (115,000+ cards)
```

## Step 6: Access Your Application

Railway provides a URL like:
**https://your-app-name.railway.app**

## Features Available After Deployment

### With Database (PostgreSQL service added):
- ✅ **Complete MTG Database**: 115,000+ cards with full MTGJSON data
- ✅ **User Authentication**: Sign up, login, password reset
- ✅ **Deck Builder**: Create, save, and share decks
- ✅ **AI Rules Expert**: OpenAI-powered Magic rules assistance
- ✅ **Advanced Search**: Filter by sets, types, colors, mechanics
- ✅ **Public Deck Gallery**: Browse community decks

### Basic Mode (No database):
- ✅ **Card Search**: Basic card lookup functionality
- ✅ **Rules Reference**: Static MTG rules access
- ⚠️ **Limited Features**: No deck saving or user accounts

## Troubleshooting Railway Deployment

### Environment Variable Issues
If variables show "NOT SET" in logs:

1. **Delete and re-add variables** in Railway dashboard
2. **Force redeploy**: Railway → Deployments → "Redeploy"
3. **Check logs**: Look for "Railway Environment Variable Loader" output

### Database Connection Issues
If database fails to connect:

1. **Verify PostgreSQL service** is added to your Railway project
2. **Check DATABASE_URL**: Should start with `postgresql://`
3. **Manual initialization**: Visit `/api/admin/init-database` in browser

### Health Check Failures
If Railway shows service as unhealthy:

1. **Check health endpoint**: Visit `https://your-app.railway.app/api/health`
2. **Review startup logs**: Look for server startup confirmation
3. **Verify port binding**: App should bind to Railway's PORT variable

## Advanced Railway Configuration

The app includes production-ready configuration:

- **`railway.toml`**: Railway deployment settings with health checks
- **`nixpacks.toml`**: Build configuration optimized for Node.js
- **`Dockerfile`**: Container configuration (backup deployment method)
- **`Procfile`**: Process definitions (backup for Railway)

## Next Steps After Deployment

1. **Test all features**: Browse to your Railway URL and test functionality
2. **Add custom domain** (optional): Railway → Settings → Domains
3. **Monitor performance**: Railway → Metrics tab
4. **Enable auto-deploys**: Automatically deploy when you push to GitHub

## Support

If you encounter issues:
1. **Check Railway logs**: Most deployment issues show up in build/runtime logs
2. **Verify environment variables**: All required variables must be set
3. **Test health endpoint**: `/api/health` should return database connection status

Your Magic: The Gathering deck builder is now live with complete MTGJSON database support and all production features enabled! 🎉

---

**Repository**: https://github.com/kdt82/spark-arcanum-replit  
**Version**: v1.1.21 - Railway Build Errors Fixed + Clean Git History  

## Recent Fixes (v1.1.21)
- ✅ **TypeScript Compilation Errors Fixed**: Railway deployment build now succeeds
- ✅ **Runtime Errors Resolved**: Fixed variable scoping issues in MTGSQLive service
- ✅ **Clean Git Branch Created**: `clean-main` branch ready for force push to replace problematic history
- ✅ **Repository Size Reduced**: From 538MB to 76MB (deployable size)
