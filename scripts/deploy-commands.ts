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

(async () => {
  try {
    logger.info(`Started refreshing ${commands.length} application (/) commands.`);

    let data: any;

    if (config.guildId) {
      // Deploy to specific guild (faster for development)
      data = await rest.put(
        Routes.applicationGuildCommands(config.clientId, config.guildId),
        { body: commands },
      );
      logger.info(`Successfully reloaded ${commands.length} guild (/) commands.`);
    } else {
      // Deploy globally (takes up to an hour to propagate)
      data = await rest.put(
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