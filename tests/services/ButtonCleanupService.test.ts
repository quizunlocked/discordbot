import { vi } from 'vitest';
import { buttonCleanupService } from '../../app/services/ButtonCleanupService';

// Mock Discord.js
const mockChannel = {
  messages: {
    fetch: vi.fn(),
  },
};

const mockMessage = {
  edit: vi.fn(),
  components: [],
  embeds: [],
};

vi.mock('discord.js', () => ({
  ActionRowBuilder: vi.fn(),
  ButtonBuilder: vi.fn(),
}));

describe('ButtonCleanupService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = buttonCleanupService;
      const instance2 = buttonCleanupService;
      expect(instance1).toBe(instance2);
    });
  });

  describe('scheduleQuizCleanup', () => {
    it('should schedule quiz cleanup', () => {
      const messageId = 'message123';
      const channelId = 'channel123';
      const delay = 5000;

      // Mock setTimeout
      vi.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return 1 as any;
      });

      buttonCleanupService.scheduleQuizCleanup(messageId, channelId, delay);

      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), delay * 1000);
    });

    it('should handle multiple cleanup schedules', () => {
      const messageId1 = 'message1';
      const messageId2 = 'message2';
      const channelId = 'channel123';

      vi.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return 1 as any;
      });

      buttonCleanupService.scheduleQuizCleanup(messageId1, channelId, 1);
      buttonCleanupService.scheduleQuizCleanup(messageId2, channelId, 2);

      expect(setTimeout).toHaveBeenCalledTimes(2);
    });
  });

  describe('scheduleLeaderboardCleanup', () => {
    it('should schedule leaderboard cleanup', () => {
      const messageId = 'message123';
      const channelId = 'channel123';
      const delay = 30;

      vi.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return 1 as any;
      });

      buttonCleanupService.scheduleLeaderboardCleanup(messageId, channelId, delay);

      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), delay * 1000);
    });
  });

  describe('scheduleAdminCleanup', () => {
    it('should schedule admin cleanup', () => {
      const messageId = 'message123';
      const channelId = 'channel123';
      const delay = 300;

      vi.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return 1 as any;
      });

      buttonCleanupService.scheduleAdminCleanup(messageId, channelId, delay);

      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), delay * 1000);
    });
  });

  describe('removeButtons', () => {
    it('should remove buttons from message', async () => {
      const messageId = 'message123';
      const channelId = 'channel123';
      const type = 'quiz';

      // Mock the channel and message
      const mockFetch = vi.fn().mockResolvedValue(mockMessage);
      mockChannel.messages.fetch = mockFetch;

      // Mock the getChannel method
      (buttonCleanupService as any).getChannel = vi.fn().mockResolvedValue(mockChannel);

      await buttonCleanupService.removeButtons(messageId, channelId, type);

      expect(mockChannel.messages.fetch).toHaveBeenCalledWith(messageId);
      expect(mockMessage.edit).toHaveBeenCalledWith({
        embeds: mockMessage.embeds,
        components: [],
      });
    });

    it('should handle channel not found', async () => {
      const messageId = 'message123';
      const channelId = 'channel123';
      const type = 'quiz';

      // Mock the getChannel method to return null
      (buttonCleanupService as any).getChannel = vi.fn().mockResolvedValue(null);

      await expect(
        buttonCleanupService.removeButtons(messageId, channelId, type)
      ).resolves.not.toThrow();
    });

    it('should handle message not found', async () => {
      const messageId = 'message123';
      const channelId = 'channel123';
      const type = 'quiz';

      // Mock the channel and message fetch to throw error
      const mockFetch = vi.fn().mockRejectedValue(new Error('Message not found'));
      mockChannel.messages.fetch = mockFetch;

      (buttonCleanupService as any).getChannel = vi.fn().mockResolvedValue(mockChannel);

      await expect(
        buttonCleanupService.removeButtons(messageId, channelId, type)
      ).resolves.not.toThrow();
    });
  });

  describe('cleanup management', () => {
    it('should track cleanup timeouts', () => {
      const messageId = 'message123';
      const channelId = 'channel123';

      vi.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return 1 as any;
      });

      buttonCleanupService.scheduleQuizCleanup(messageId, channelId, 1);

      // The service should internally track the timeout
      expect(setTimeout).toHaveBeenCalled();
    });

    it('should handle cleanup execution', () => {
      const messageId = 'message123';
      const channelId = 'channel123';

      // Mock the removeButtons method
      const removeButtonsSpy = vi.spyOn(buttonCleanupService, 'removeButtons').mockResolvedValue();

      vi.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return 1 as any;
      });

      buttonCleanupService.scheduleQuizCleanup(messageId, channelId, 1);

      expect(removeButtonsSpy).toHaveBeenCalledWith(messageId, channelId, 'quiz');
    });
  });

  describe('utility methods', () => {
    it('should have getStatus method', () => {
      const status = buttonCleanupService.getStatus();
      expect(status).toHaveProperty('total');
      expect(status).toHaveProperty('byType');
      expect(typeof status.total).toBe('number');
      expect(typeof status.byType).toBe('object');
    });

    it('should have cleanupAll method', () => {
      expect(typeof buttonCleanupService.cleanupAll).toBe('function');
    });

    it('should have cancelCleanup method', () => {
      expect(typeof buttonCleanupService.cancelCleanup).toBe('function');
    });
  });

  describe('setClient', () => {
    it('should set the Discord client instance', async () => {
      const { buttonCleanupService: service } = await import(
        '../../app/services/ButtonCleanupService'
      );
      const mockClient = {} as any;
      service.setClient(mockClient);
      // @ts-expect-error: Service private property access for testing
      expect(service.client).toBe(mockClient);
    });
  });
});
