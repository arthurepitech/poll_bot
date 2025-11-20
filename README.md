# Poll Everywhere Bot Deployment Guide

## 1. Transfer the Code
You can transfer the code to your server or another machine using Git or by copying the files.

### Option A: Git (Recommended)
1. Initialize a git repo locally:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```
2. Push to a private repository (GitHub, GitLab, etc.) and clone it on your server.

### Option B: Copy Files
Zip the folder and transfer it to your server:
```bash
zip -r poll-bot.zip . -x "node_modules/*" ".git/*"
scp poll-bot.zip user@your-server:/path/to/destination
```

## 2. Install Dependencies
On the target machine, make sure you have Node.js installed (v18+), then run:

```bash
npm install
# Or if you use pnpm:
# pnpm install
```

## 3. Configuration
Create or copy your `.env` file. **Do not commit your .env file to Git!**

```bash
cp .env.example .env
nano .env
# Fill in your credentials
```

## 4. Run with PM2
We use PM2 to keep the bot running in the background and restart it automatically if it crashes.

1. Install PM2 globally:
   ```bash
   npm install -g pm2
   ```

2. Start the bot using the provided configuration:
   ```bash
   pm2 start ecosystem.config.js
   ```

3. View logs:
   ```bash
   pm2 logs poll-bot
   ```

4. Save the process list (so it restarts on reboot):
   ```bash
   pm2 save
   pm2 startup
   ```

## Useful Commands

### Managing the Process
- **Stop the bot**:
  ```bash
  pm2 stop poll-bot
  ```
- **Restart the bot** (useful after updates):
  ```bash
  pm2 restart poll-bot
  ```
- **Delete the bot** from PM2:
  ```bash
  pm2 delete poll-bot
  ```

### Monitoring & Logs
- **View real-time logs**:
  ```bash
  pm2 logs poll-bot
  # Add --lines 100 to see more history
  pm2 logs poll-bot --lines 100
  ```
- **Monitor CPU/Memory usage**:
  ```bash
  pm2 monit
  ```
- **List all processes**:
  ```bash
  pm2 list
  ```
