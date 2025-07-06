import { CommandInteraction } from 'discord.js';
import { logger } from './logger';

export const withErrorHandling = <T extends [CommandInteraction, ...any[]]>(
  fn: (...args: T) => Promise<void>
) => async (...args: T): Promise<void> => {
  const [interaction] = args;
  try {
    await fn(...args);
  } catch (error) {
    logger.error(`Error in ${fn.name}:`, error);
    
    const errorMessage = '❌ An error occurred. Please try again later.';
    
    if (interaction.isRepliable()) {
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      } catch (replyError) {
        logger.error('Error sending error response:', replyError);
      }
    }
  }
};

export const asyncTryCatch = async <T>(
  fn: () => Promise<T>,
  errorMessage?: string
): Promise<T | null> => {
  try {
    return await fn();
  } catch (error) {
    logger.error(errorMessage || 'Async operation failed:', error);
    return null;
  }
};

export const safeParseJSON = <T>(jsonString: string, fallback: T): T => {
  try {
    return JSON.parse(jsonString);
  } catch {
    return fallback;
  }
};

export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> => {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (i === maxRetries - 1) {
        throw lastError;
      }
      
      const delay = baseDelay * Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
};