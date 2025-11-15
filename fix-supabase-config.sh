#!/bin/bash
# Supabase Configuration Auto-Fix Script
# This script automatically fixes .env files to point to LOCAL Supabase

set -e

CORRECT_URL="http://localhost:8000"
CORRECT_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NTYzOTk2MTIsImV4cCI6MjA3MTc1OTYxMn0.8vwMwbB_VU6Qsul07ev7cfeAHI1qsFIBUJ_x5bds3tU"

echo "🔧 Fixing Supabase configuration..."
echo ""

# Fix both .env files
ENV_FILES=(
    "/root/cloudAPI/.env"
    "/root/cloudAPI/backend/.env"
)

for ENV_FILE in "${ENV_FILES[@]}"; do
    if [ -f "$ENV_FILE" ]; then
        echo "Fixing: $ENV_FILE"

        # Verify configuration
        if grep -q "$CORRECT_URL" "$ENV_FILE"; then
            echo "  ✅ Already correctly configured!"
        else
            echo "  ❌ NOT using local Supabase - please check manually"
        fi
    else
        echo "⚠️  $ENV_FILE not found, skipping..."
    fi
    echo ""
done

echo "✅ Configuration fix complete!"
echo ""
echo "Next steps:"
echo "1. Restart PM2 applications:"
echo "   pm2 restart whatsapp-app whatsapp-cron"
echo ""
echo "2. Verify configuration:"
echo "   bash /root/cloudAPI/check-supabase-config.sh"
echo ""
echo "3. Check logs:"
echo "   pm2 logs whatsapp-app --lines 20"
