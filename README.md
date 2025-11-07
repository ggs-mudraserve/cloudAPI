# WhatsApp Cloud API Automation Platform

A comprehensive platform for managing large-scale WhatsApp template-based messaging campaigns with LLM-driven conversations.

## 🚀 Features

- **Multi-Number Management**: Connect multiple WhatsApp numbers under one Meta Business Account
- **Template Sync**: Auto-sync templates with quarantine detection for MARKETING/AUTHENTICATION
- **Bulk Campaigns**: CSV upload supporting up to 100,000 contacts with adaptive rate control
- **LLM Integration**: Automated replies using OpenAI with configurable system prompts
- **Real-time Analytics**: Live campaign monitoring with delivery and read rates
- **Webhook Processing**: Idempotent message handling with signature validation
- **Adaptive Rate Control**: Dynamic send-rate learning (10-1000 msg/sec)
- **Campaign Scheduling**: Schedule campaigns with pre-flight validation

## 📋 Prerequisites

- Node.js 18+
- Supabase account
- Meta WhatsApp Business Account
- OpenAI API key
- PM2 (for production)
- Nginx (for production deployment)

## 🛠️ Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd cloudAPI
```

### 2. Install backend dependencies

```bash
cd backend
npm install
```

### 3. Install frontend dependencies

```bash
cd ../frontend
npm install
```

### 4. Configure environment variables

```bash
cd ../backend
cp .env.example .env
# Edit .env with your actual credentials
```

Required environment variables:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_KEY` - Supabase service role key
- `META_APP_ID` - Meta App ID
- `META_WEBHOOK_VERIFY_TOKEN` - Webhook verification token
- `OPENAI_API_KEY` - OpenAI API key
- `PORT` - Server port (default: 8080)
- `TZ` - Timezone (Asia/Kolkata for IST)

### 5. Database setup

The database schema is already created via Supabase MCP. Verify by checking:
- All 11 tables are present
- Indexes are created
- Functions and triggers are active

## 🏃 Running the Application

### Development Mode

**Backend:**
```bash
cd backend
npm run dev
```

**Frontend:**
```bash
cd frontend
npm run dev
```

### Production Mode

**Build frontend:**
```bash
cd frontend
npm run build
```

**Start with PM2:**
```bash
# From project root
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

**Monitor logs:**
```bash
pm2 logs whatsapp-app
pm2 logs whatsapp-cron
```

## 📁 Project Structure

```
cloudAPI/
├── backend/
│   ├── src/
│   │   ├── config/        # Supabase client, configs
│   │   ├── middleware/    # Auth, validation middleware
│   │   ├── routes/        # API route handlers
│   │   ├── controllers/   # Business logic
│   │   ├── services/      # External API services
│   │   ├── utils/         # Helper functions
│   │   ├── workers/       # Cron jobs, queue processors
│   │   └── server.js      # Main server file
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Page components
│   │   ├── contexts/      # React contexts
│   │   ├── hooks/         # Custom hooks
│   │   ├── services/      # API clients
│   │   └── utils/         # Helper functions
│   └── package.json
├── migrations/            # Supabase migration files
├── logs/                  # PM2 logs
├── ecosystem.config.js    # PM2 configuration
├── database.md           # Database schema documentation
├── prd.md               # Product requirements
└── CLAUDE.md            # Development guidelines
```

## 🔐 Authentication

- Single admin account via Supabase Auth
- JWT-based session management
- Create admin user via Supabase dashboard

## 📊 API Endpoints (To be implemented)

### Authentication
- `POST /api/auth/login` - Admin login
- `POST /api/auth/logout` - Logout

### WhatsApp Numbers
- `GET /api/whatsapp-numbers` - List all numbers
- `POST /api/whatsapp-numbers` - Add new number
- `POST /api/whatsapp-numbers/test` - Test connection
- `DELETE /api/whatsapp-numbers/:id` - Remove number

### Templates
- `GET /api/templates` - List templates
- `POST /api/templates/sync-all` - Sync all numbers
- `POST /api/templates/sync/:numberId` - Sync specific number
- `PATCH /api/templates/:id/unquarantine` - Un-quarantine template

### Campaigns
- `GET /api/campaigns` - List campaigns
- `POST /api/campaigns` - Create campaign
- `GET /api/campaigns/:id` - Get campaign details
- `PATCH /api/campaigns/:id/stop` - Stop campaign
- `PATCH /api/campaigns/:id/resume` - Resume campaign
- `DELETE /api/campaigns/:id` - Delete scheduled campaign

### Messages
- `GET /api/messages` - List conversations
- `GET /api/messages/:phone` - Get conversation

### Webhooks
- `GET /api/webhooks/whatsapp` - Verification
- `POST /api/webhooks/whatsapp` - Handle events

## 🧪 Testing

```bash
# Backend
cd backend
npm test

# Frontend
cd frontend
npm test
```

## 📦 Deployment

See `ops.md` for detailed deployment instructions.

## 📝 License

ISC

## 🔗 Documentation

- [Database Schema](./database.md)
- [Product Requirements](./prd.md)
- [Development Guidelines](./CLAUDE.md)
- [Deployment Guide](./ops.md)

## 🆘 Support

For issues and questions, please refer to the documentation files or create an issue.

---

**Version:** 1.0.0
