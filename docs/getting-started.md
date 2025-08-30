# Getting Started

This guide will help you set up Quiz Unlocked in your Discord server, whether you're using a hosted version or setting up your own self-hosted instance.

## Quick Start (Using Hosted Bot)

The fastest way to get started is by adding the hosted version of Quiz Unlocked to your Discord server.

### Step 1: Invite the Bot

::: tip Ready to use?
[Add Quiz Unlocked to your Discord server](https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands) *(link coming soon)*
:::

### Step 2: Verify Bot Permissions

Once added, make sure Quiz Unlocked has these essential permissions:

- ✅ **Send Messages** - To post quiz questions and responses
- ✅ **Use Slash Commands** - To respond to your commands  
- ✅ **Embed Links** - To create rich quiz displays
- ✅ **Attach Files** - To send templates and results
- ✅ **Read Message History** - To track quiz interactions

### Step 3: Test the Bot

Try your first command to confirm everything is working:

```
/ping
```

You should see a response confirming the bot is online and responsive.

## Self-Hosting Setup

If you prefer to host Quiz Unlocked on your own infrastructure, follow these detailed setup instructions.

### Prerequisites

Before you begin, ensure you have:

- **Node.js 18.0.0 or higher** - [Download from nodejs.org](https://nodejs.org/)
- **npm or yarn** - Usually included with Node.js
- **PostgreSQL database** - Local or cloud-hosted (e.g., Supabase, Railway, Neon)
- **Discord application** - Created at [Discord Developer Portal](https://discord.com/developers/applications)

### Step 1: Create Discord Application

1. Visit the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name (e.g., "My Quiz Bot")
3. Go to the "Bot" section and click "Add Bot"
4. **Copy your bot token** - you'll need this later
5. **Copy your Client ID** from the "General Information" tab

#### Configure Bot Settings

In the Bot section, make sure to enable:

- ✅ **Server Members Intent** - Required for leaderboards and user management

#### Set Up OAuth2 URL

In the OAuth2 → URL Generator section:

**Scopes:**
- ✅ `bot`
- ✅ `applications.commands`

**Bot Permissions:**
- ✅ Send Messages
- ✅ Use Slash Commands  
- ✅ Embed Links
- ✅ Attach Files
- ✅ Read Message History

Copy the generated URL to invite your bot to your test server.

### Step 2: Set Up Your Environment

#### Clone the Repository

```bash
git clone https://github.com/anthonyronda/learn-polish-bot.git
cd learn-polish-bot
```

#### Install Dependencies

```bash
npm install
```

#### Configure Environment Variables

```bash
cp env.example .env
```

Edit the `.env` file with your configuration:

```env
# Discord Configuration
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here
DISCORD_DEV_GUILD_ID=your_test_server_id_here

# Database Configuration
DATABASE_URL="postgresql://username:password@host:5432/database_name"

# Optional Configuration
NODE_ENV=development
LOG_LEVEL=info
```

::: warning Keep Your Token Secret
Never share your Discord bot token or commit it to version control. The `.env` file is already in `.gitignore` to prevent accidents.
:::

### Step 3: Set Up the Database

#### Option A: Local PostgreSQL

If you have PostgreSQL installed locally:

```bash
# Create a database for the bot
createdb quiz_bot_dev

# Update your DATABASE_URL to point to the local database
# DATABASE_URL="postgresql://your_username:your_password@localhost:5432/quiz_bot_dev"
```

#### Option B: Cloud Database

Popular cloud PostgreSQL providers:

- **[Supabase](https://supabase.com)** - Free tier available
- **[Railway](https://railway.app)** - Simple deployment
- **[Neon](https://neon.tech)** - Serverless PostgreSQL
- **[Heroku Postgres](https://www.heroku.com/postgres)** - Managed PostgreSQL

Get your connection string from your chosen provider and use it as your `DATABASE_URL`.

#### Initialize the Database

```bash
# Generate Prisma client and deploy the database schema
npm run db:deploy
```

This command will:
- Generate the Prisma client based on your schema
- Create all necessary tables and relationships
- Set up initial database structure

### Step 4: Start the Bot

#### Development Mode

```bash
npm run dev
```

This starts the bot with hot reload enabled. The bot will automatically restart when you make code changes.

#### Production Mode

```bash
# Build the project
npm run build

# Start the bot (also deploys Discord commands)
npm start
```

### Step 5: Deploy Discord Commands

Your slash commands need to be registered with Discord:

```bash
# Deploy to your development server (fast)
npm run deploy-commands

# Deploy to a specific server
npm run deploy-commands -- --guildId=YOUR_SERVER_ID

# Deploy globally (takes up to 1 hour to propagate)
npm run deploy-commands -- --global
```

::: tip Development vs Production Commands
During development, deploy commands to a specific guild/server for instant updates. For production, deploy globally so the bot works in all servers.
:::

## Your First Quiz

Now that your bot is set up, let's create your first quiz!

### Method 1: Using a CSV Template

1. **Get the template:**
   ```
   /quiz template
   ```
   This downloads a CSV template with example questions.

2. **Edit the template:**
   - Replace example questions with your own
   - Ensure the `options` column contains valid JSON arrays
   - Set appropriate point values and time limits

3. **Upload your quiz:**
   ```
   /quiz upload title:"My First Quiz" file:[attach your CSV]
   ```

### Method 2: Manual Quiz Creation

1. **Start creating:**
   ```
   /quiz create
   ```

2. **Follow the interactive prompts** to add questions one by one

3. **Configure quiz settings** like time limits and point values

### Method 3: Generate from Corpus

1. **Create a question bank (corpus):**
   ```
   /corpus upload title:"My Question Bank" file:[attach corpus CSV]
   ```

2. **Generate a randomized quiz:**
   ```
   /quiz generate from-corpus:"My Question Bank" quiz-title:"Random Quiz" num-questions:10
   ```

### Start Your Quiz

Once your quiz is created:

```
/quiz start quiz-title:"My First Quiz"
```

The bot will begin the quiz session, and users can participate by clicking the answer buttons!

## Next Steps

Now that you have Quiz Unlocked running, you might want to:

- 📚 **Explore all commands** in our [Command Reference](/commands)
- 🏗️ **Learn about the architecture** in our [Architecture Guide](/architecture)  
- 🚀 **Set up production deployment** with our [Deployment Guide](/deployment)
- ❓ **Get help with common issues** in our [FAQ](/faq)

## Getting Help

If you run into issues during setup:

1. **Check the [FAQ](/faq)** for common problems and solutions
2. **Review your environment variables** and database connection
3. **Check the bot logs** for error messages
4. **Open an issue** on [GitHub](https://github.com/anthonyronda/learn-polish-bot/issues) with details about your setup and the problem

Welcome to the Quiz Unlocked community! 🎉