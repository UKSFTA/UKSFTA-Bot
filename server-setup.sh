#!/bin/bash

# UKSF Bot Production Deployment & Automation Script
# Sets up environment and schedules 3 AM updates.

set -e

REPO_DIR="/home/matt/Development/UKSFTA-Bot"
LOG_FILE="/var/log/uksf-bot-update.log"

echo "[$(date)] --- STARTING SERVER SETUP ---"

# 1. Install System Dependencies (if missing)
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    sudo npm install -g pm2
fi

# 2. Setup Update Script
cat << 'EOF' > "$REPO_DIR/update-bot.sh"
#!/bin/bash
# UKSF Zero-Downtime Update Script
REPO_DIR="/home/matt/Development/UKSFTA-Bot"
LOG_FILE="/var/log/uksf-bot-update.log"

{
    echo "[$(date)] Starting Automated Update..."
    cd "$REPO_DIR"
    git pull origin main
    npm install --production
    pm2 restart ecosystem.config.js --update-env
    echo "[$(date)] Update Complete."
} >> "$LOG_FILE" 2>&1
EOF

chmod +x "$REPO_DIR/update-bot.sh"

# 3. Schedule 3 AM Cronjob
CRON_JOB="0 3 * * * $REPO_DIR/update-bot.sh"
(crontab -l 2>/dev/null | grep -v "update-bot.sh"; echo "$CRON_JOB") | crontab -

echo "[$(date)] Setup complete. 3 AM Update Cronjob active."
echo "Check logs at: $LOG_FILE"
