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

   ```env
   DISCORD_TOKEN=your_discord_bot_token_here
   DISCORD_CLIENT_ID=your_discord_client_id_here
   DISCORD_GUILD_ID=your_guild_id_here
   DATABASE_URL="file:./dev.db"
   ```

4. **Set up the database**

   ```bash
   npm run db:generate
   npm run db:push
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

```bash
npm run build && npm start
```

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

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

If you encounter any issues or have questions, please open an issue on GitHub.
