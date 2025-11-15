#!/bin/bash
# Supabase Configuration Monitor
# This script can be run via cron to automatically detect and fix config issues
# Add to crontab: */15 * * * * /root/cloudAPI/monitor-supabase-config.sh >> /root/cloudAPI/logs/config-monitor.log 2>&1

set -e

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
LOG_FILE="/root/cloudAPI/logs/config-monitor.log"

mkdir -p /root/cloudAPI/logs

echo "[$TIMESTAMP] Checking Supabase configuration..." | tee -a "$LOG_FILE"

# Run the check script silently
if bash /root/cloudAPI/check-supabase-config.sh >> "$LOG_FILE" 2>&1; then
    echo "[$TIMESTAMP] ✅ Configuration is correct" | tee -a "$LOG_FILE"
else
    echo "[$TIMESTAMP] ❌ Configuration issue detected! Auto-fixing..." | tee -a "$LOG_FILE"

    # Auto-fix the configuration
    bash /root/cloudAPI/fix-supabase-config.sh >> "$LOG_FILE" 2>&1

    # Restart the application
    echo "[$TIMESTAMP] Restarting application..." | tee -a "$LOG_FILE"
    pm2 restart whatsapp-app whatsapp-cron >> "$LOG_FILE" 2>&1

    echo "[$TIMESTAMP] ✅ Configuration fixed and application restarted" | tee -a "$LOG_FILE"

    # Send notification (optional - uncomment if you want email alerts)
    # echo "Supabase configuration was auto-fixed at $TIMESTAMP" | mail -s "Config Auto-Fix Alert" admin@example.com
fi

echo "[$TIMESTAMP] Check complete" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"
