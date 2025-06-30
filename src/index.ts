import { Client, Collection, GatewayIntentBits, Events } from 'discord.js';
import { config } from '@/utils/config';
import { logger } from '@/utils/logger';
import { databaseService } from '@/services/DatabaseService';
import { buttonCleanupService } from '@/services/ButtonCleanupService';
import { quizService } from '@/services/QuizService';
import { BotClient } from '@/types';
import path from 'path';
import fs from 'fs';

// Extend the Discord.js Client with our custom properties
const client: BotClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
}) as BotClient;

// Initialize collections
client.commands = new Collection();
client.cooldowns = new Collection();

// Load commands
async function loadCommands(): Promise<void> {
  const commandsPath = path.join(__dirname, 'commands');
  const commandFolders = fs.readdirSync(commandsPath);

  for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    const commandFiles = fs
      .readdirSync(folderPath)
      .filter((file) => file.endsWith('.js') || file.endsWith('.ts'));

    for (const file of commandFiles) {
      const filePath = path.join(folderPath, file);
      const command = require(filePath);
      
      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        logger.info(`Loaded command: ${command.data.name}`);
      } else {
        logger.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
      }
    }
  }
}

// Load events
async function loadEvents(): Promise<void> {
  const eventsPath = path.join(__dirname, 'events');
  const eventFiles = fs
    .readdirSync(eventsPath)
    .filter((file) => file.endsWith('.js') || file.endsWith('.ts'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }
    
    logger.info(`Loaded event: ${event.name}`);
  }
}

// Handle interaction creation
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);

    if (!command) {
      logger.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    // Handle cooldowns
    const { cooldowns } = client;
    if (!cooldowns.has(command.data.name)) {
      cooldowns.set(command.data.name, new Collection());
    }

    const now = Date.now();
    const timestamps = cooldowns.get(command.data.name)!;
    const defaultCooldownDuration = command.cooldown || 3;
    const cooldownAmount = (defaultCooldownDuration) * 1000;

    if (timestamps.has(interaction.user.id)) {
      const expirationTime = timestamps.get(interaction.user.id)! + cooldownAmount;

      if (now < expirationTime) {
        const expiredTimestamp = Math.round(expirationTime / 1000);
        await interaction.reply({
          content: `Please wait <t:${expiredTimestamp}:R> more second(s) before reusing the \`${command.data.name}\` command.`,
          ephemeral: true,
        });
        return;
      }
    }

    timestamps.set(interaction.user.id, now);
    setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

    // Execute command
    try {
      await command.execute(interaction);
    } catch (error) {
      logger.error(`Error executing command ${command.data.name}:`, error);
      
      // Only try to reply if the interaction hasn't been handled yet
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        try {
          await interaction.reply({
            content: 'There was an error while executing this command!',
            ephemeral: true,
          });
        } catch (replyError) {
          logger.error('Error sending error response:', replyError);
        }
      }
    }
  }
  // Button interactions are handled in the interactionCreate event
});

// Initialize bot
async function initializeBot(): Promise<void> {
  try {
    // Connect to database
    await databaseService.connect();
    
    // Set client in services
    buttonCleanupService.setClient(client);
    quizService.setClient(client);
    
    // Load commands and events
    await loadCommands();
    await loadEvents();
    
    // Login to Discord
    await client.login(config.token);
    
    logger.info('Bot initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize bot:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  buttonCleanupService.cleanupAll();
  await databaseService.disconnect();
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  buttonCleanupService.cleanupAll();
  await databaseService.disconnect();
  client.destroy();
  process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled promise rejection:', error);
});

// Start the bot
initializeBot(); 