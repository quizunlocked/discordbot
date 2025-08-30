# Development Guide

This guide provides everything you need to know to contribute to Quiz Unlocked, from setting up your development environment to submitting pull requests.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js 18.0.0 or higher** - [Download from nodejs.org](https://nodejs.org/)
- **npm or yarn** - Package manager (comes with Node.js)
- **Git** - Version control
- **PostgreSQL** - Database (local installation or cloud instance)
- **Code Editor** - VS Code recommended with TypeScript extensions

## Development Environment Setup

### 1. Fork and Clone

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/learn-polish-bot.git
cd learn-polish-bot

# Add the original repository as upstream
git remote add upstream https://github.com/anthonyronda/learn-polish-bot.git
```

### 2. Install Dependencies

```bash
npm install
```

This installs all required dependencies including development tools.

### 3. Environment Configuration

```bash
# Copy the environment template
cp env.example .env
```

Configure your `.env` file:

```env
# Discord Configuration (required)
DISCORD_TOKEN=your_development_bot_token
DISCORD_CLIENT_ID=your_development_client_id
DISCORD_DEV_GUILD_ID=your_test_server_id

# Database Configuration
DATABASE_URL="postgresql://username:password@localhost:5432/quiz_bot_dev"

# Development Settings
NODE_ENV=development
LOG_LEVEL=debug
```

::: tip Development Bot
Create a separate Discord application for development to avoid conflicts with production. This allows you to test changes without affecting live users.
:::

### 4. Database Setup

#### Option A: Local PostgreSQL

```bash
# Create development database
createdb quiz_bot_dev

# Generate Prisma client and deploy schema
npm run db:deploy
```

#### Option B: Cloud Database

Use a cloud provider like Supabase, Railway, or Neon for easier setup:

```bash
# Update your DATABASE_URL with the cloud connection string
# Then deploy the schema
npm run db:deploy
```

### 5. Start Development Server

```bash
# Start with hot reload
npm run dev
```

The bot will start with:

- ✅ Hot reload enabled (restarts on file changes)
- ✅ Debug logging enabled
- ✅ Development Discord commands deployed to your test server

## Project Structure Deep Dive

Understanding the codebase organization helps you find and modify the right files.

### Command Structure

Commands are organized by feature area:

```
app/commands/
├── admin/              # Server administrator commands
│   ├── index.ts        # Command registration and routing
│   ├── delete-everything.ts
│   └── list-quizzes.ts
├── quiz/               # Core quiz functionality
│   ├── index.ts        # Quiz command group
│   ├── start.ts        # Start quiz sessions
│   ├── create.ts       # Create new quizzes
│   └── upload.ts       # CSV upload handling
└── stats/              # Performance tracking
    └── index.ts        # User statistics display
```

Each command follows this pattern:

```typescript
// Command structure template
import { SlashCommandBuilder, CommandInteraction } from 'discord.js';
import { Command } from '../../types/index.js';

export const data = new SlashCommandBuilder()
  .setName('command-name')
  .setDescription('What this command does')
  .addStringOption(option => 
    option
      .setName('parameter')
      .setDescription('Parameter description')
      .setRequired(true)
  );

export const execute: Command['execute'] = async (interaction: CommandInteraction) => {
  // Command implementation
};
```

### Service Layer

Services contain the business logic:

```typescript
// Service pattern example
class QuizService {
  private static instance: QuizService;
  
  public static getInstance(): QuizService {
    if (!QuizService.instance) {
      QuizService.instance = new QuizService();
    }
    return QuizService.instance;
  }
  
  // Public API methods
  public async startQuiz(channelId: string, quizId: string): Promise<void> {
    // Implementation
  }
}

// Usage in commands
import { quizService } from '../../services/QuizService.js';
await quizService.startQuiz(channelId, quizId);
```

### Event Handling

Discord events are handled in the `events/` directory:

```typescript
// Event handler pattern
import { Events } from 'discord.js';
import type { BotClient } from '../types/index.js';

export const name = Events.InteractionCreate;

export async function execute(interaction: any, client: BotClient) {
  // Handle the interaction
}
```

## Database Development

Quiz Unlocked uses Prisma for database management, providing type-safe database operations.

### Schema Modifications

When modifying the database schema:

1. **Edit the schema file:**

   ```bash
   # Edit prisma/schema.prisma
   nano prisma/schema.prisma
   ```

2. **Create a migration:**

   ```bash
   # Creates migration files and applies changes
   npm run db:migrate -- --name describe_your_change
   ```

3. **Generate updated client:**

   ```bash
   # Updates TypeScript types
   npm run db:generate
   ```

### Working with Prisma

#### Common Operations

```typescript
// Create a new quiz
const quiz = await databaseService.prisma.quiz.create({
  data: {
    title: "My Quiz",
    description: "A test quiz",
    quizOwnerId: userId,
    questions: {
      create: [
        {
          questionText: "What is 2+2?",
          options: JSON.stringify(["3", "4", "5"]),
          correctAnswer: 1,
          points: 10,
        }
      ]
    }
  },
  include: {
    questions: true
  }
});

// Query with relations
const userStats = await databaseService.prisma.user.findUnique({
  where: { id: userId },
  include: {
    quizAttempts: {
      include: {
        questionAttempts: true
      }
    },
    scores: true
  }
});

// Complex aggregations
const leaderboard = await databaseService.prisma.quizAttempt.groupBy({
  by: ['userId'],
  _sum: {
    totalScore: true
  },
  orderBy: {
    _sum: {
      totalScore: 'desc'
    }
  }
});
```

#### Database Browser

Use Prisma Studio to explore your database:

```bash
npm run db:studio
```

This opens a web interface at `http://localhost:5555` where you can:

- Browse all tables and data
- Edit records directly
- Test queries
- Analyze relationships

### Seeding Development Data

Create test data for development:

```typescript
// scripts/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create test users
  const testUser = await prisma.user.create({
    data: {
      id: 'test-user-123',
      username: 'TestUser'
    }
  });

  // Create test quiz
  const testQuiz = await prisma.quiz.create({
    data: {
      title: 'Development Test Quiz',
      quizOwnerId: testUser.id,
      questions: {
        create: [
          {
            questionText: 'What is the capital of Poland?',
            options: JSON.stringify(['Warsaw', 'Krakow', 'Gdansk', 'Wroclaw']),
            correctAnswer: 0,
            points: 10,
            timeLimit: 30
          }
        ]
      }
    }
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

Run the seed script:

```bash
npx tsx scripts/seed.ts
```

## Testing

Quiz Unlocked has comprehensive test coverage using Vitest.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (reruns on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run specific test files
npm test -- quiz.test.ts

# Run tests matching a pattern
npm test -- --grep "QuizService"
```

### Writing Tests

#### Unit Tests

Test individual functions and methods:

```typescript
// tests/services/QuizService.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuizService } from '../../app/services/QuizService';

describe('QuizService', () => {
  let quizService: QuizService;

  beforeEach(() => {
    quizService = QuizService.getInstance();
  });

  it('should start a quiz session', async () => {
    // Arrange
    const channelId = 'test-channel';
    const quizId = 'test-quiz';
    
    // Act
    await quizService.startQuiz(channelId, quizId);
    
    // Assert
    const activeQuiz = quizService.getActiveQuiz(channelId);
    expect(activeQuiz).toBeDefined();
    expect(activeQuiz?.quizId).toBe(quizId);
  });

  it('should handle quiz completion', async () => {
    // Test quiz completion logic
  });
});
```

#### Integration Tests

Test multiple components working together:

```typescript
// tests/integration/quiz-lifecycle.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseService } from '../../app/services/DatabaseService';
import { QuizService } from '../../app/services/QuizService';

describe('Quiz Lifecycle Integration', () => {
  beforeAll(async () => {
    await DatabaseService.getInstance().connect();
  });

  afterAll(async () => {
    await DatabaseService.getInstance().disconnect();
  });

  it('should complete a full quiz session', async () => {
    // Create quiz, start session, answer questions, verify results
  });
});
```

#### Command Tests

Test Discord interactions:

```typescript
// tests/commands/quiz.test.ts
import { describe, it, expect, vi } from 'vitest';
import { execute } from '../../app/commands/quiz/start';

describe('/quiz start command', () => {
  it('should start a quiz when valid parameters provided', async () => {
    // Mock Discord interaction
    const mockInteraction = {
      isChatInputCommand: () => true,
      options: {
        getString: vi.fn().mockReturnValue('Test Quiz')
      },
      deferReply: vi.fn(),
      editReply: vi.fn()
    };

    await execute(mockInteraction as any);

    expect(mockInteraction.editReply).toHaveBeenCalled();
  });
});
```

### Test Database

Use a separate database for testing:

```env
# .env.test
DATABASE_URL="postgresql://username:password@localhost:5432/quiz_bot_test"
```

Tests automatically use the test database when `NODE_ENV=test`.

## Code Quality Standards

Quiz Unlocked maintains high code quality through automated tools and manual review.

### TypeScript Configuration

The project uses strict TypeScript configuration:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

Always use proper types instead of `any`:

```typescript
// ❌ Avoid
function handleUser(user: any) {
  return user.name;
}

// ✅ Preferred
interface User {
  id: string;
  name: string;
  email?: string;
}

function handleUser(user: User): string {
  return user.name;
}
```

### Linting and Formatting

The project uses ESLint and Prettier:

```bash
# Check for linting issues
npm run lint

# Fix auto-fixable issues
npm run lint:fix

# Format code with Prettier
npm run format
```

### Git Hooks

Husky runs quality checks before commits:

- **Pre-commit:** Runs linting and formatting
- **Pre-push:** Runs tests to ensure code quality

### Documentation Standards

All public functions should have JSDoc comments:

```typescript
/**
 * Starts a new quiz session in the specified channel
 * @param channelId - Discord channel ID where the quiz will run
 * @param quizId - Unique identifier of the quiz to start
 * @param options - Optional configuration for the quiz session
 * @returns Promise that resolves when the quiz is successfully started
 * @throws {QuizNotFoundError} When the specified quiz doesn't exist
 * @throws {QuizAlreadyActiveError} When a quiz is already running in the channel
 */
public async startQuiz(
  channelId: string, 
  quizId: string, 
  options?: QuizOptions
): Promise<void> {
  // Implementation
}
```

## Adding New Features

Here's how to add new functionality to Quiz Unlocked.

### 1. Creating a New Command

```bash
# Create command file
mkdir -p app/commands/my-feature
touch app/commands/my-feature/index.ts
```

```typescript
// app/commands/my-feature/index.ts
import { SlashCommandBuilder, CommandInteraction } from 'discord.js';
import { Command } from '../../types/index.js';

export const data = new SlashCommandBuilder()
  .setName('my-command')
  .setDescription('Description of what this command does');

export const execute: Command['execute'] = async (interaction: CommandInteraction) => {
  await interaction.deferReply();
  
  try {
    // Your command logic here
    await interaction.editReply('Command executed successfully!');
  } catch (error) {
    console.error('Command error:', error);
    await interaction.editReply('❌ An error occurred while executing this command.');
  }
};
```

### 2. Adding Command Groups

For related commands, create a command group:

```typescript
// app/commands/my-feature/index.ts
import { SlashCommandBuilder, CommandInteraction } from 'discord.js';
import { Command } from '../../types/index.js';

export const data = new SlashCommandBuilder()
  .setName('my-feature')
  .setDescription('Manage my feature')
  .addSubcommand(subcommand =>
    subcommand
      .setName('create')
      .setDescription('Create a new item')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('delete')
      .setDescription('Delete an item')
  );

export const execute: Command['execute'] = async (interaction: CommandInteraction) => {
  if (!interaction.isChatInputCommand()) return;

  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'create':
      await handleCreate(interaction);
      break;
    case 'delete':
      await handleDelete(interaction);
      break;
    default:
      await interaction.reply('❌ Unknown subcommand');
  }
};

async function handleCreate(interaction: CommandInteraction) {
  // Implementation
}

async function handleDelete(interaction: CommandInteraction) {
  // Implementation
}
```

### 3. Adding Database Models

When adding new database tables:

```prisma
// prisma/schema.prisma
model MyNewModel {
  id        String   @id @default(cuid())
  title     String
  content   String?
  userId    String
  createdAt DateTime @default(now())
  
  // Relations
  user User @relation(fields: [userId], references: [id])
}

// Update existing models if needed
model User {
  // ... existing fields
  myNewItems MyNewModel[]
}
```

Then create and apply the migration:

```bash
npm run db:migrate -- --name add_my_new_model
```

### 4. Adding Service Methods

Create or extend services for business logic:

```typescript
// app/services/MyFeatureService.ts
class MyFeatureService {
  private static instance: MyFeatureService;

  public static getInstance(): MyFeatureService {
    if (!MyFeatureService.instance) {
      MyFeatureService.instance = new MyFeatureService();
    }
    return MyFeatureService.instance;
  }

  public async createItem(userId: string, title: string): Promise<MyNewModel> {
    return await databaseService.prisma.myNewModel.create({
      data: {
        title,
        userId
      }
    });
  }

  public async getUserItems(userId: string): Promise<MyNewModel[]> {
    return await databaseService.prisma.myNewModel.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
  }
}

export const myFeatureService = MyFeatureService.getInstance();
```

### 5. Writing Tests

Always add tests for new functionality:

```typescript
// tests/commands/my-feature.test.ts
import { describe, it, expect, vi } from 'vitest';
import { execute } from '../../app/commands/my-feature';

describe('My Feature Command', () => {
  it('should handle create subcommand', async () => {
    // Test implementation
  });

  it('should handle delete subcommand', async () => {
    // Test implementation
  });

  it('should validate user permissions', async () => {
    // Test implementation
  });
});

// tests/services/MyFeatureService.test.ts
import { describe, it, expect } from 'vitest';
import { myFeatureService } from '../../app/services/MyFeatureService';

describe('MyFeatureService', () => {
  it('should create items successfully', async () => {
    // Test implementation
  });
});
```

## Debugging

### Development Debugging

#### Console Logging

Use the built-in logger for consistent output:

```typescript
import { logger } from '../utils/logger.js';

logger.debug('Debug information', { userId, quizId });
logger.info('Quiz started successfully');
logger.warn('User has no permissions', { userId });
logger.error('Database connection failed', error);
```

#### VS Code Debugging

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Bot",
      "program": "${workspaceFolder}/app/index.ts",
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "runtimeArgs": ["-r", "tsx/cjs"],
      "env": {
        "NODE_ENV": "development"
      },
      "console": "integratedTerminal"
    }
  ]
}
```

#### Database Debugging

Enable Prisma query logging:

```typescript
// Add to DatabaseService constructor
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});
```

### Production Debugging

For production issues:

1. **Check logs:**

   ```bash
   # View recent logs
   tail -f logs/bot.log
   
   # Search for errors
   grep -i error logs/bot.log
   ```

2. **Monitor database:**

   ```bash
   # Check database connections
   npm run db:studio
   ```

3. **Discord API issues:**
   - Check Discord Developer Portal for API status
   - Verify bot permissions in affected servers
   - Review rate limiting headers in logs

## Contributing Guidelines

### Pull Request Process

1. **Create feature branch:**

   ```bash
   git checkout -b feature/my-new-feature
   ```

2. **Make your changes** following the coding standards

3. **Write tests** for new functionality

4. **Ensure all tests pass:**

   ```bash
   npm test
   npm run lint
   npm run build
   ```

5. **Commit with descriptive messages:**

   ```bash
   git commit -m "feat: add user preference settings
   
   - Add user settings database model
   - Implement /settings command group
   - Add tests for settings functionality
   - Update documentation"
   ```

6. **Push and create PR:**

   ```bash
   git push origin feature/my-new-feature
   ```

### Code Review Process

All contributions go through code review:

- **Automated checks:** Tests, linting, build verification
- **Manual review:** Code quality, architecture fit, security
- **Documentation:** Ensure changes are documented
- **Breaking changes:** Require special approval and migration guides

### Issue Reporting

When reporting bugs:

1. **Use the issue template** on GitHub
2. **Include reproduction steps** with minimal example
3. **Provide environment details** (Node version, OS, database)
4. **Include relevant logs** with sensitive data removed

### Feature Requests

For new features:

1. **Search existing issues** to avoid duplicates
2. **Describe the use case** and problem being solved
3. **Propose implementation approach** if possible
4. **Consider breaking changes** and migration needs

## Performance Guidelines

### Database Performance

- Use indexes for frequently queried columns
- Batch operations when possible
- Avoid N+1 query patterns
- Use database transactions for consistency

### Memory Management

- Clean up event listeners and timers
- Use WeakMap for temporary associations
- Monitor memory usage in long-running processes
- Implement proper error boundaries

### Discord API Best Practices

- Respect rate limits (handled automatically by discord.js)
- Use bulk operations for multiple updates
- Cache static data to reduce API calls
- Handle API errors gracefully

## Getting Help

### Documentation Resources

- **[Architecture Guide](/architecture)** - System design and patterns
- **[Command Reference](/commands)** - Complete command documentation
- **[Deployment Guide](/deployment)** - Production setup instructions

### Community Support

- **[GitHub Discussions](https://github.com/anthonyronda/learn-polish-bot/discussions)** - General questions and ideas
- **[GitHub Issues](https://github.com/anthonyronda/learn-polish-bot/issues)** - Bug reports and feature requests
- **[Discord Server](#)** - Real-time community chat *(coming soon)*

### Code Review Support

If you're unsure about implementation approaches:

1. **Open a draft PR** with your work-in-progress
2. **Ask for feedback** in the PR description
3. **Tag maintainers** for specific technical questions
4. **Join community discussions** for architectural guidance

Happy coding! 🚀
