import { TextChannel, Client } from 'discord.js';
import { logger } from '@/utils/logger';

interface ButtonTimeout {
  messageId: string;
  channelId: string;
  timeoutId: NodeJS.Timeout;
  type: 'leaderboard' | 'quiz' | 'question' | 'admin';
}

class ButtonCleanupService {
  private static instance: ButtonCleanupService;
  private buttonTimeouts: Map<string, ButtonTimeout> = new Map();
  private client: Client | null = null;

  public static getInstance(): ButtonCleanupService {
    if (!ButtonCleanupService.instance) {
      ButtonCleanupService.instance = new ButtonCleanupService();
    }
    return ButtonCleanupService.instance;
  }

  /**
   * Set the Discord client instance
   */
  public setClient(client: Client): void {
    this.client = client;
  }

  /**
   * Schedule button cleanup for leaderboard messages
   */
  public scheduleLeaderboardCleanup(
    messageId: string,
    channelId: string,
    timeoutSeconds: number = 30
  ): void {
    this.scheduleCleanup(messageId, channelId, 'leaderboard', timeoutSeconds);
  }

  /**
   * Schedule button cleanup for quiz messages
   */
  public scheduleQuizCleanup(
    messageId: string,
    channelId: string,
    timeoutSeconds: number = 300
  ): void {
    this.scheduleCleanup(messageId, channelId, 'quiz', timeoutSeconds);
  }

  /**
   * Schedule button cleanup for question messages
   */
  public scheduleQuestionCleanup(
    messageId: string,
    channelId: string,
    timeoutSeconds: number = 60
  ): void {
    this.scheduleCleanup(messageId, channelId, 'question', timeoutSeconds);
  }

  /**
   * Schedule button cleanup for admin messages
   */
  public scheduleAdminCleanup(
    messageId: string,
    channelId: string,
    timeoutSeconds: number = 60
  ): void {
    this.scheduleCleanup(messageId, channelId, 'admin', timeoutSeconds);
  }

  /**
   * Schedule button cleanup
   */
  private scheduleCleanup(
    messageId: string,
    channelId: string,
    type: ButtonTimeout['type'],
    timeoutSeconds: number
  ): void {
    const key = `${messageId}_${channelId}`;

    // Clear existing timeout if any
    this.clearTimeout(key);

    const timeoutId = setTimeout(async () => {
      await this.removeButtons(messageId, channelId, type);
      this.buttonTimeouts.delete(key);
    }, timeoutSeconds * 1000);

    this.buttonTimeouts.set(key, {
      messageId,
      channelId,
      timeoutId,
      type,
    });

    logger.debug(`Scheduled ${type} button cleanup for message ${messageId} in ${timeoutSeconds}s`);
  }

  /**
   * Immediately remove buttons from a message
   */
  public async removeButtons(
    messageId: string,
    channelId: string,
    type: ButtonTimeout['type']
  ): Promise<void> {
    try {
      const channel = await this.getChannel(channelId);
      if (!channel) {
        logger.warn(`Channel ${channelId} not found for button cleanup`);
        return;
      }

      const message = await channel.messages.fetch(messageId).catch(() => null);
      if (!message) {
        logger.debug(`Message ${messageId} not found for button cleanup`);
        return;
      }

      // Remove all components (buttons) from the message
      await message.edit({
        embeds: message.embeds,
        components: [], // Remove all buttons
      });

      logger.info(`Removed buttons from ${type} message ${messageId}`);
    } catch (error) {
      logger.error(`Error removing buttons from message ${messageId}:`, error);
    }
  }

  /**
   * Cancel scheduled cleanup for a message
   */
  public cancelCleanup(messageId: string, channelId: string): void {
    const key = `${messageId}_${channelId}`;
    this.clearTimeout(key);
  }

  /**
   * Clear timeout and remove from map
   */
  private clearTimeout(key: string): void {
    const timeout = this.buttonTimeouts.get(key);
    if (timeout) {
      clearTimeout(timeout.timeoutId);
      this.buttonTimeouts.delete(key);
      logger.debug(`Cancelled button cleanup for ${key}`);
    }
  }

  /**
   * Get channel by ID
   */
  private async getChannel(channelId: string): Promise<TextChannel | null> {
    if (!this.client) {
      logger.error('Discord client not set in ButtonCleanupService');
      return null;
    }

    try {
      const channel = await this.client.channels.fetch(channelId);
      return channel?.isTextBased() ? (channel as TextChannel) : null;
    } catch (error) {
      logger.error(`Error fetching channel ${channelId}:`, error);
      return null;
    }
  }

  /**
   * Clean up all timeouts (for shutdown)
   */
  public cleanupAll(): void {
    for (const [key, timeout] of this.buttonTimeouts.entries()) {
      clearTimeout(timeout.timeoutId);
      logger.debug(`Cleaned up button timeout for ${key}`);
    }
    this.buttonTimeouts.clear();
  }

  /**
   * Get cleanup status for debugging
   */
  public getStatus(): { total: number; byType: Record<string, number> } {
    const byType: Record<string, number> = {};
    for (const timeout of this.buttonTimeouts.values()) {
      byType[timeout.type] = (byType[timeout.type] || 0) + 1;
    }
    return {
      total: this.buttonTimeouts.size,
      byType,
    };
  }
}

export const buttonCleanupService = ButtonCleanupService.getInstance();
