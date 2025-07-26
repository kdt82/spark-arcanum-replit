# Deploy Spark Arcanum to Railway

## Quick Steps

### 1. Build & Test Locally
```bash
npm run build
./deploy-railway-clean.sh
```

### 2. Push to GitHub
```bash
git add .
git commit -m "Ready for Railway deployment"
git push origin main
```

### 3. Deploy via Railway Web
1. Go to: https://railway.app
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repository
5. Railway auto-deploys

### 4. Configure Environment Variables
In Railway dashboard → Variables:
```
NODE_ENV=production
SESSION_SECRET=your-secure-session-key
OPENAI_API_KEY=your-openai-key (optional)
```

### 5. Add Database (Optional)
- Click "New Service" → "PostgreSQL"
- Railway auto-configures DATABASE_URL
- Enables 115,000+ cards and deck saving

## Your App Features

**Without Database:**
- Card search via API
- AI Rules Expert (with OpenAI key)
- Deck builder (browser storage)
- Basic functionality

**With PostgreSQL:**
- Full 115,000+ card database
- User authentication
- Deck saving and sharing
- Complete functionality

## Expected Deployment
- Build time: ~2-3 minutes
- App URL: `https://your-app.railway.app`
- Health check: `/api/health`
- Cost: ~$1-3/month

Your Magic: The Gathering deck builder will be live!