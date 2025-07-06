# Learn Polish Bot

A feature-rich Discord bot for hosting interactive quizzes with leaderboards, built with Discord.js and TypeScript.

## Features

- **Interactive Quizzes**: Host multiple-choice quizzes with customizable questions
- **Real-time Scoring**: Score participants based on correctness and speed
- **Leaderboards**: Track weekly, monthly, and yearly statistics
- **Admin Controls**: Manage quizzes and bot settings
- **Database Persistence**: Store quiz data and user statistics using SQLite
- **Modern Architecture**: Built with TypeScript, Discord.js v14, and Prisma ORM

## Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn
- A Discord bot token (from [Discord Developer Portal](https://discord.com/developers/applications))

## OAuth2 Scopes and Permissions

When setting up your Discord bot, you'll need to configure the following OAuth2 scopes and permissions:

### OAuth2 Scopes

- `bot` - Required for bot functionality
- `applications.commands` - Required for slash commands

### Gateway Intents

The bot requires the following Gateway Intents to be enabled in your Discord application:

**Required Intents:**

- `Server Members Intent` - Required to access member information for leaderboards and user management
- `Message Content Intent` - **Privileged Intent** - Required to read message content for quiz interactions

**Important:** The `Message Content Intent` is a privileged intent that must be manually enabled in the Discord Developer Portal under your application's "Bot" section. This intent is required for the bot to read message content and respond to quiz interactions.

### Bot Permissions

The bot requires the following permissions:

**General Permissions:**

- `Send Messages` - To send quiz questions and responses
- `Use Slash Commands` - To respond to slash command interactions
- `Read Message History` - To read previous messages in channels
- `Add Reactions` - To add reactions to quiz messages
- `Embed Links` - To send rich embeds for leaderboards and quiz information
- `Attach Files` - To potentially send quiz results or images

**Server Management (for Admin Commands):**

- `Manage Server` - Required for admin commands that manage server settings
- `Administrator` - Required for admin commands (set via `setDefaultMemberPermissions`)

### Invite URL

When creating your bot invite URL, include these scopes and permissions:

```console
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands
```

**Note:** The permission value `8` represents Administrator permissions. For production, you may want to use more specific permissions instead of Administrator.

## Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd discord-quiz-bot
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   ```bash
   cp env.example .env
   ```

   Edit `.env` and add your Discord bot token and other configuration:

   **For Development (SQLite):**
   ```env
   DISCORD_TOKEN=your_discord_bot_token_here
   DISCORD_CLIENT_ID=your_discord_client_id_here
   DISCORD_DEV_GUILD_ID=your_guild_id_here
   DATABASE_URL="file:./dev.db"
   ```

   **For Production (PostgreSQL):**
   ```env
   DISCORD_TOKEN=your_discord_bot_token_here
   DISCORD_CLIENT_ID=your_discord_client_id_here
   NODE_ENV=production
   DATABASE_URL="postgresql://username:password@host:5432/database_name"
   ```

4. **Set up the database**

   **Development (SQLite with migrations):**
   ```bash
   npm run db:deploy:dev
   ```
   
   **Alternative for quick prototyping:**
   ```bash
   npm run db:push:dev
   ```

5. **Build the project**

   ```bash
   npm run build
   ```

## Usage

### In Development

```bash
npm run dev
```

### In Production

**For PostgreSQL (Production):**
```bash
npm run db:deploy:prod
npm run build
npm start
```

**For SQLite (Development/Testing):**
```bash
npm run db:deploy:dev
npm run build
npm start
```

**Notes:**
- The `start` command automatically deploys Discord slash commands and then starts the bot
- Use `start:dev` if you want to skip command deployment during development
- `db:deploy:prod` uses PostgreSQL with proper migrations (`schema.prod.prisma`)
- `db:deploy:dev` uses SQLite with migrations for development (`schema.dev.prisma`)
- Ensure your `DATABASE_URL` matches your chosen database type

## Commands

### Quiz Commands

- `/quiz start <quiz_name>` - Start a new quiz session
- `/quiz stop` - Stop the current quiz
- `/quiz status` - Check current quiz status

### Leaderboard Commands

- `/leaderboard weekly` - View weekly leaderboard
- `/leaderboard monthly` - View monthly leaderboard
- `/leaderboard yearly` - View yearly leaderboard
- `/leaderboard overall` - View overall leaderboard

### Admin Commands

- `/admin create-quiz <title> [description]` - Create a new quiz
- `/admin add-question` - Add questions to a quiz
- `/admin status` - Check bot and database status

### Quiz Manager Commands

- `/quiz-manager create` - Create a new quiz with interactive form
- `/quiz-manager edit <quiz_id>` - Edit an existing quiz
- `/quiz-manager delete <quiz_id>` - Delete a specific quiz (⚠️ DESTRUCTIVE)
- `/quiz-manager delete-all` - Delete all quizzes (⚠️ DESTRUCTIVE)

**Note:** All quiz-manager commands require administrator privileges and include confirmation prompts for destructive actions.

## Project Structure

```bash
src/
├── commands/          # Slash command handlers
│   ├── quiz/         # Quiz-related commands
│   ├── leaderboard/  # Leaderboard commands
│   └── admin/        # Admin commands
├── events/           # Discord event handlers
├── services/         # Business logic services
├── types/           # TypeScript type definitions
├── utils/           # Utility functions
└── index.ts         # Main entry point
```

## Development

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build the project
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors
- `npm run format` - Format code with Prettier
- `npm test` - Run tests
- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Push schema to database
- `npm run db:studio` - Open Prisma Studio
- `npm run deploy-commands` - (Re)deploy bot commands to your configured dev server
- `npm run deploy-commands -- --guildId=1234567890` - (Re)deploy bot commands to the given server

### Code Quality

This project uses:

- **TypeScript** with strict mode enabled
- **ESLint** for code linting
- **Prettier** for code formatting
- **Jest** for testing
- **Husky** for git hooks

### Database

The project uses **Prisma** as the ORM with **SQLite** as the database. The schema is defined in `prisma/schema.prisma`.

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DISCORD_TOKEN` | Discord bot token | Yes |
| `DISCORD_CLIENT_ID` | Discord application client ID | Yes |
| `DISCORD_GUILD_ID` | Discord guild ID (for development) | No |
| `DATABASE_URL` | Database connection string | Yes |
| `NODE_ENV` | Environment (development/production) | No |
| `LOG_LEVEL` | Logging level | No |

### Quiz Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `DEFAULT_QUESTION_TIMEOUT` | Default question time limit (seconds) | 30 |
| `DEFAULT_QUIZ_TIMEOUT` | Default quiz time limit (seconds) | 300 |
| `POINTS_PER_CORRECT_ANSWER` | Base points for correct answer | 10 |
| `SPEED_BONUS_MULTIPLIER` | Speed bonus multiplier | 0.1 |
| `STREAK_BONUS_MULTIPLIER` | Streak bonus multiplier | 0.05 |

### Database Configuration

This application supports both SQLite (development) and PostgreSQL (production) databases using separate schema files and follows Prisma best practices for migrations.

#### Schema Files

| File | Database | Purpose |
|------|----------|---------|
| `prisma/schema.dev.prisma` | SQLite | Development and testing |
| `prisma/schema.prod.prisma` | PostgreSQL | Production deployment |

#### Environment Variables

| Variable | Description | SQLite Example | PostgreSQL Example |
|----------|-------------|----------------|-------------------|
| `DATABASE_URL` | Connection string | `"file:./dev.db"` | `"postgresql://user:pass@host:5432/db"` |

#### Database Scripts (Following Prisma Best Practices)

| Script | Purpose | Schema Used | Use Case |
|--------|---------|-------------|----------|
| **Development Scripts** | | | |
| `npm run db:migrate:dev` | Create and apply migrations | `schema.dev.prisma` | **Recommended for development** |
| `npm run db:push:dev` | Push schema directly | `schema.dev.prisma` | Quick prototyping only |
| `npm run db:deploy:dev` | Generate client + migrate | `schema.dev.prisma` | Development setup |
| `npm run db:studio:dev` | Open Prisma Studio | `schema.dev.prisma` | Database browsing (dev) |
| `npm run db:reset:dev` | Reset database | `schema.dev.prisma` | Fresh development start |
| **Production Scripts** | | | |
| `npm run db:migrate:deploy` | Apply migrations | `schema.prod.prisma` | **Recommended for production** |
| `npm run db:push:prod` | Push schema directly | `schema.prod.prisma` | Emergency use only |
| `npm run db:deploy:prod` | Generate client + deploy | `schema.prod.prisma` | Production setup |
| `npm run db:studio:prod` | Open Prisma Studio | `schema.prod.prisma` | Database browsing (prod) |

#### Recommended Workflows

**Development Workflow (Prisma Best Practice):**
1. Make changes to `prisma/schema.dev.prisma`
2. Run `npm run db:migrate:dev --name describe_your_change`
3. Test your changes
4. Commit both schema and migration files

**Production Workflow (Prisma Best Practice):**
1. Deploy migrations: `npm run db:migrate:deploy`
2. This should be part of your CI/CD pipeline
3. Never run `migrate dev` in production

#### Switching Between Databases

1. **Development (SQLite):** 
   - Set `DATABASE_URL="file:./dev.db"`
   - Run `npm run db:deploy:dev`

2. **Production (PostgreSQL):** 
   - Set `DATABASE_URL` to your PostgreSQL connection string
   - Run `npm run db:deploy:prod`

## Deployment Troubleshooting

### Common Production Issues

#### "The table `main.Quiz` does not exist in the current database"

This error occurs when the database schema hasn't been initialized. **Solution:**

```bash
# Run database setup before starting the bot
npm run db:deploy
npm run build
npm start
```

#### "Cannot find module '@/utils/config'"

This error occurs when TypeScript path aliases aren't resolved at runtime. **Solution:**

Ensure `module-alias` is installed and `_moduleAliases` is configured in `package.json`:

```json
{
  "_moduleAliases": {
    "@": "dist"
  }
}
```

#### PostgreSQL Connection Issues

**Error:** "connection to server failed" or database connection errors

**Solutions:**
1. Verify your `DATABASE_URL` format: `postgresql://username:password@host:port/database`
2. Ensure the PostgreSQL database exists and is accessible
3. Check firewall settings and network connectivity
4. Verify database credentials and permissions

#### Production Deployment Checklist

**Environment Setup:**
1. ✅ **Environment variables set** (`.env` file or environment)
   - `DATABASE_URL` with valid PostgreSQL connection string
   - `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` set
   - `NODE_ENV=production` (recommended)
2. ✅ **Dependencies installed** (`npm install`)
3. ✅ **Database initialized** (`npm run db:deploy:prod`)
4. ✅ **Project built** (`npm run build`)
5. ✅ **Bot started** (`npm start`) - automatically deploys commands

**Database Support:**
- ✅ **Development:** SQLite with migrations - `schema.dev.prisma`
- ✅ **Production:** PostgreSQL with migrations - `schema.prod.prisma`

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

If you encounter any issues or have questions, please open an issue on GitHub.
