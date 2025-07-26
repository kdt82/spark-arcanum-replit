# EMERGENCY: Force Remove Large Files from Git

## The Problem
The large files are still in git's index/staging area despite `git rm --cached` commands. GitHub keeps rejecting because the files are still being tracked.

## Nuclear Option: Create Clean Branch

```bash
# Method 1: Create a completely clean commit
git checkout --orphan clean-main
git add .
git add .gitignore
git commit -m "Clean codebase without database files - v1.1.21

✅ Fresh commit with no large file history
✅ Updated .gitignore prevents future database commits  
✅ Codebase-only deployment (76MB) ready for Railway
✅ Railway will download fresh MTGJSON data on startup"

# Force push the clean branch
git push --force-with-lease origin clean-main:main
```

## Method 2: Manual File Removal (if Method 1 doesn't work)

```bash
# Check what files git thinks are tracked
git ls-files | grep data/

# Manually remove each large file from tracking
git update-index --force-remove data/AllPrintings.psql
git update-index --force-remove data/AllPrintings.psql.xz
git update-index --force-remove data/AllPrintings.json
git update-index --force-remove data/AtomicCards.json

# Verify files are no longer tracked
git ls-files | grep data/

# Commit the removal
git add .gitignore
git commit -m "Force remove large database files from tracking"
git push origin main
```

## Method 3: BFG Repo Cleaner (Most Thorough)

```bash
# If the above methods fail, download BFG Repo Cleaner
wget https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar

# Remove large files from entire git history
java -jar bfg-1.14.0.jar --delete-files "*.psql" .
java -jar bfg-1.14.0.jar --delete-files "*.psql.xz" .
java -jar bfg-1.14.0.jar --delete-files "AllPrintings.json" .

# Clean up and force push
git reflog expire --expire=now --all && git gc --prune=now --aggressive
git push --force-with-lease origin main
```

## Why This Is Happening
1. Git has complex staging/index behavior
2. Large files may be in multiple commits in history
3. `git rm --cached` only removes from next commit, not history
4. GitHub scans entire push for large files

## Recommendation
Try **Method 1** first (clean branch) - it's the safest and most reliable approach.