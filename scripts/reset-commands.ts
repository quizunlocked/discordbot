import { REST, Routes } from 'discord.js';
import { config } from '../app/utils/config';
import { logger } from '../app/utils/logger';

const rest = new REST().setToken(config.token);

function getGuildIdFromArgs(args: string[]): string | undefined {
  return args.find(arg => arg.startsWith('--guildId='))?.split('=')[1];
}

(async () => {
  try {
    logger.info('Starting command reset process...');

    const argGuildId = getGuildIdFromArgs(process.argv);

    // Always clear global commands
    logger.info('[RESET] Clearing global commands...');
    await rest.put(Routes.applicationCommands(config.clientId), { body: [] });
    logger.info('✅ Global commands cleared');

    // Clear guild commands if guildId provided
    if (argGuildId) {
      logger.info(`[RESET] Clearing guild commands for guild ${argGuildId}...`);
      await rest.put(Routes.applicationGuildCommands(config.clientId, argGuildId), { body: [] });
      logger.info(`✅ Guild commands cleared for guild ${argGuildId}`);
    }

    // Clear dev guild commands if configured
    if (config.devGuildId && config.devGuildId !== argGuildId) {
      logger.info(`[RESET] Clearing dev guild commands for guild ${config.devGuildId}...`);
      await rest.put(Routes.applicationGuildCommands(config.clientId, config.devGuildId), {
        body: [],
      });
      logger.info(`✅ Dev guild commands cleared for guild ${config.devGuildId}`);
    }

    logger.info('🎉 All commands reset successfully!');
    logger.info('Note: Global command changes may take up to 1 hour to propagate');
  } catch (error) {
    logger.error('❌ Error resetting commands:', error);
    process.exit(1);
  }
})();
