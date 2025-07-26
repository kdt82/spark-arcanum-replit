
# Quick Railway Deployment - v1.1.12

## 🚀 4-Step Railway Deployment

### 1. Push to GitHub (Run in Replit Shell)
```bash
git add .
git commit -m "v1.1.12 - Railway deployment ready with complete MTGJSON schema"
git push origin main
```

### 2. Deploy on Railway
1. Go to: **https://railway.app**
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your repository → **"Deploy Now"**

### 3. Add Environment Variables
In Railway Dashboard → **Variables**:
```
NODE_ENV=production
SESSION_SECRET=your-secure-64-character-key
OPENAI_API_KEY=your-openai-key-optional
```

### 4. Add Database (Optional but Recommended)
- Click **"New Service"** → **"PostgreSQL"**
- Railway auto-connects everything

## ✅ Your App is Live!
**URL**: `https://your-app-name.railway.app`

## 🎯 Features Enabled
- ✅ **115,000+ MTG Cards** (complete MTGJSON database)
- ✅ **AI Rules Expert** (with OpenAI key)
- ✅ **Deck Builder & Sharing**
- ✅ **User Authentication**
- ✅ **Advanced Card Search**
- ✅ **Production Performance**

## 🔧 Troubleshooting
- **Environment variables not working?** Delete and re-add them in Railway
- **Database connection issues?** Verify PostgreSQL service is added
- **Health check failing?** Check `/api/health` endpoint

**Deployment Time**: ~3-5 minutes from push to live app! 🎉
