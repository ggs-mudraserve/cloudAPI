#!/bin/bash
# Supabase Configuration Checker
# This script ensures both .env files point to LOCAL Supabase

set -e

CORRECT_URL="http://localhost:8000"
CORRECT_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NTYzOTk2MTIsImV4cCI6MjA3MTc1OTYxMn0.8vwMwbB_VU6Qsul07ev7cfeAHI1qsFIBUJ_x5bds3tU"

echo "🔍 Checking Supabase configuration..."

# Check both .env files
ENV_FILES=(
    "/root/cloudAPI/.env"
    "/root/cloudAPI/backend/.env"
)

ISSUES_FOUND=0

for ENV_FILE in "${ENV_FILES[@]}"; do
    if [ -f "$ENV_FILE" ]; then
        echo "Checking: $ENV_FILE"

        # Check if it contains the correct local URL
        if grep -q "$CORRECT_URL" "$ENV_FILE"; then
            echo "✅ $ENV_FILE is correctly configured (LOCAL Supabase)"
        else
            echo "❌ ERROR: $ENV_FILE is NOT pointing to local Supabase!"
            echo "   Expected: $CORRECT_URL"
            ISSUES_FOUND=$((ISSUES_FOUND + 1))
        fi
    else
        echo "⚠️  WARNING: $ENV_FILE not found"
    fi
    echo ""
done

if [ $ISSUES_FOUND -gt 0 ]; then
    echo "❌ Configuration issues found! Please fix before starting the application."
    echo ""
    echo "To fix automatically, run:"
    echo "  bash /root/cloudAPI/fix-supabase-config.sh"
    exit 1
else
    echo "✅ All Supabase configurations are correct!"
    echo "📍 Using LOCAL Supabase at: $CORRECT_URL"
    exit 0
fi
