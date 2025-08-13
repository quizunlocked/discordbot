import { Events, Client } from 'discord.js';
import { logger } from '../utils/logger.js';

export const name = Events.ClientReady;
export const once = true;

export function execute(client: Client): void {
  logger.info(`Ready! Logged in as ${client.user?.tag}`);

  // Set bot status
  client.user?.setActivity('quizzes', { type: 2 }); // 2 = Watching

  logger.info(`Bot is now online and ready to serve ${client.guilds.cache.size} guilds`);
}
