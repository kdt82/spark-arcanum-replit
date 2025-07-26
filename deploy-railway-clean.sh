#!/bin/bash

# Spark Arcanum - Clean Railway Deployment Script
echo "🚀 Deploying Spark Arcanum to Railway..."

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Not in a git repository. Initialize git first:"
    echo "   git init"
    echo "   git add ."
    echo "   git commit -m 'Initial commit'"
    echo "   git branch -M main"
    exit 1
fi

# Build the application to verify it works
echo "🔨 Building application..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please fix build errors first."
    exit 1
fi

echo "✅ Build successful!"
echo ""
echo "📋 Ready for Railway deployment!"
echo ""
echo "Next steps:"
echo "1. Push your code to GitHub:"
echo "   git add ."
echo "   git commit -m 'Ready for Railway deployment'"
echo "   git push origin main"
echo ""
echo "2. Deploy to Railway:"
echo "   - Go to: https://railway.app"
echo "   - Click 'New Project'"
echo "   - Select 'Deploy from GitHub repo'"
echo "   - Choose your repository"
echo "   - Railway will auto-deploy"
echo ""
echo "3. Add environment variables in Railway dashboard:"
echo "   NODE_ENV=production"
echo "   SESSION_SECRET=your-secure-key-here"
echo "   OPENAI_API_KEY=your-api-key-here (optional)"
echo ""
echo "4. Add PostgreSQL service (optional):"
echo "   - Click 'New Service' → 'PostgreSQL'"
echo "   - Railway auto-configures DATABASE_URL"
echo ""
echo "🎉 Your Magic: The Gathering app will be live at:"
echo "   https://your-app-name.railway.app"