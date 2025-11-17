# Deploy to Railway

## Step 1: Create Railway Account
- Go to https://railway.app
- Sign up with GitHub account

## Step 2: Create New Project
- Click "New Project"
- Select "Deploy from GitHub repo"
- Connect your GitHub account
- Select `discord-bot-tai` repository
- Click "Deploy"

## Step 3: Configure Environment Variables
In Railway dashboard:
1. Go to project settings
2. Add variables:
   - `DISCORD_TOKEN`: Your Discord bot token
   - `FOOTBALL_API_KEY`: Your football-data.org API key

## Step 4: Deploy
Railway will auto-deploy when you push to GitHub!

## Auto-Update
Every time you push to GitHub, Railway automatically:
1. Pulls the latest code
2. Installs dependencies (npm install)
3. Runs the bot (node index.js from Procfile)

## Monitor Bot
- View logs in Railway dashboard
- Check if bot is online in Discord

## Stop Bot
- In Railway dashboard, click "Redeploy" to restart
- Or "Remove service" to stop

---

That's it! Your bot will run 24/7 on Railway's free tier! 🚀
