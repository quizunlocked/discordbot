import { REST, Routes } from 'discord.js';
import { config } from '../src/utils/config';
import { logger } from '../src/utils/logger';
import fs from 'fs';
import path from 'path';

const commands: any[] = [];
const commandsPath = path.join(__dirname, '../src/commands');
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
      commands.push(command.data.toJSON());
      logger.info(`Loaded command: ${command.data.name}`);
    } else {
      logger.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
  }
}

const rest = new REST().setToken(config.token);

// Extracted for testing
export function getGuildIdFromArgs(args: string[]): string | undefined {
  return args.find(arg => arg.startsWith('--guildId='))?.split('=')[1];
}

export function getDeploymentTarget(argGuildId: string | undefined, config: { devGuildId?: string | undefined }): 'arg' | 'dev' | 'global' {
  if (argGuildId) return 'arg';
  if (config.devGuildId) return 'dev';
  return 'global';
}

(async () => {
  try {
    logger.info(`Started refreshing ${commands.length} application (/) commands.`);

    const argGuildId = getGuildIdFromArgs(process.argv);
    const target = getDeploymentTarget(argGuildId, config);

    if (target === 'arg') {
      logger.info(`[DEPLOY] Using: command-line guildId (${argGuildId})`);
      // Deploy to the guild specified by command-line argument
      await rest.put(
        Routes.applicationGuildCommands(config.clientId, argGuildId!),
        { body: commands },
      );
      logger.info(`Successfully reloaded ${commands.length} commands for guild ${argGuildId}.`);
    } else if (target === 'dev') {
      logger.info(`[DEPLOY] Using: devGuildId from config (${config.devGuildId})`);
      // Deploy to specific dev guild (faster for development)
      await rest.put(
        Routes.applicationGuildCommands(config.clientId, config.devGuildId!),
        { body: commands },
      );
      logger.info(`Successfully reloaded ${commands.length} guild (/) commands.`);
    } else {
      logger.info('[DEPLOY] Using: global deployment (no guildId)');
      // Deploy globally (takes up to an hour to propagate)
      await rest.put(
        Routes.applicationCommands(config.clientId),
        { body: commands },
      );
      logger.info(`Successfully reloaded ${commands.length} global (/) commands.`);
    }

    logger.info('Commands deployed successfully!');
  } catch (error) {
    logger.error('Error deploying commands:', error);
  }
})(); 