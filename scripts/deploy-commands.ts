import { REST, Routes } from 'discord.js';
import { config } from '../app/utils/config';
import { logger } from '../app/utils/logger';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadCommands(): Promise<any[]> {
  const commands: any[] = [];
  const commandsPath = path.join(__dirname, '../dist/commands');
  const commandFolders = fs.readdirSync(commandsPath);

  for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    const commandFiles = fs
      .readdirSync(folderPath)
      .filter(file => file.endsWith('.js') && !file.endsWith('.d.ts'));

    for (const file of commandFiles) {
      const filePath = path.join(folderPath, file);
      const command = await import(filePath);

      if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        logger.info(`Loaded command: ${command.data.name}`);
      } else {
        logger.warn(
          `The command at ${filePath} is missing a required "data" or "execute" property.`
        );
      }
    }
  }

  return commands;
}

const rest = new REST().setToken(config.token);

// Extracted for testing
export function getGuildIdFromArgs(args: string[]): string | undefined {
  return args.find(arg => arg.startsWith('--guildId='))?.split('=')[1];
}

export function getDeploymentTarget(
  argGuildId: string | undefined,
  config: { devGuildId?: string | undefined }
): 'arg' | 'dev' | 'global' {
  if (argGuildId) return 'arg';
  if (config.devGuildId) return 'dev';
  return 'global';
}

(async () => {
  try {
    const commands = await loadCommands();
    logger.info(`Started refreshing ${commands.length} application (/) commands.`);

    const argGuildId = getGuildIdFromArgs(process.argv);
    const target = getDeploymentTarget(argGuildId, config);

    if (target === 'arg') {
      logger.info(`[DEPLOY] Using: command-line guildId (${argGuildId})`);
      // Deploy to the guild specified by command-line argument
      await rest.put(Routes.applicationGuildCommands(config.clientId, argGuildId!), {
        body: commands,
      });
      logger.info(`Successfully reloaded ${commands.length} commands for guild ${argGuildId}.`);
    } else if (target === 'dev') {
      logger.info(`[DEPLOY] Using: devGuildId from config (${config.devGuildId})`);
      // Deploy to specific dev guild (faster for development)
      await rest.put(Routes.applicationGuildCommands(config.clientId, config.devGuildId!), {
        body: commands,
      });
      logger.info(`Successfully reloaded ${commands.length} guild (/) commands.`);
    } else {
      logger.info('[DEPLOY] Using: global deployment (no guildId)');
      // Deploy globally (takes up to an hour to propagate)
      await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
      logger.info(`Successfully reloaded ${commands.length} global (/) commands.`);
    }

    logger.info('Commands deployed successfully!');
  } catch (error) {
    logger.error('Error deploying commands:', error);
  }
})();
