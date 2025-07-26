# URGENT: Fix GitHub Push - Remove Large Files

## Problem
GitHub rejected the push because large database files (563MB) are still tracked in git history:
```
remote: error: File data/AllPrintings.psql is 563.93 MB; this exceeds GitHub's file size limit of 100.00 MB
```

## Solution: Remove Large Files from Git Tracking

Run these commands in the Replit Shell:

```bash
# Step 1: Force remove large files from git tracking (aggressive approach)
git rm --cached data/AllPrintings.psql
git rm --cached data/AllPrintings.psql.xz  
git rm --cached data/AllPrintings.json
git rm --cached data/AtomicCards.json
git rm --cached data/rarity-cache.json

# Alternative: Remove entire data directory tracking
# git rm -r --cached data/

# Step 2: Verify files are untracked but still exist locally
ls -la data/  # Should show files still exist
git status    # Should show data/ files as untracked

# Step 3: Add only the codebase changes
git add .
git add .gitignore  # Make sure updated .gitignore is included

# Step 4: Commit the removal of large files
git commit -m "Remove large database files from git tracking

✅ Removed 563MB data/AllPrintings.psql from git tracking
✅ Removed 64MB data/AllPrintings.psql.xz from git tracking  
✅ Updated .gitignore to prevent future database file commits
✅ Codebase-only deployment ready for Railway (76MB)

Files still exist locally but won't be pushed to GitHub.
Railway will download fresh MTGJSON data on deployment."

# Step 5: Push to GitHub (should now work)
git push origin main
```

## Verification
After successful push:
- GitHub repository: ~76MB (codebase only)
- Local development: All files intact
- Railway deployment: Downloads fresh database on startup

## Why This Happened
1. Large files were committed before .gitignore was properly configured
2. .gitignore only prevents NEW files from being tracked
3. Files already in git history need to be explicitly removed with `git rm --cached`

This is a one-time fix. Future commits will only include codebase changes.