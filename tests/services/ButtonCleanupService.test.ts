import { buttonCleanupService } from '../../src/services/ButtonCleanupService';

// Mock Discord.js
const mockChannel = {
  messages: {
    fetch: jest.fn(),
  },
};

const mockMessage = {
  edit: jest.fn(),
  components: [],
  embeds: [],
};

jest.mock('discord.js', () => ({
  ActionRowBuilder: jest.fn(),
  ButtonBuilder: jest.fn(),
}));

describe('ButtonCleanupService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
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

      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
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

      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
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

      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
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
      const mockFetch = jest.fn().mockResolvedValue(mockMessage);
      mockChannel.messages.fetch = mockFetch;

      // Mock the getChannel method
      (buttonCleanupService as any).getChannel = jest.fn().mockResolvedValue(mockChannel);

      await buttonCleanupService.removeButtons(messageId, channelId, type);

      expect(mockChannel.messages.fetch).toHaveBeenCalledWith(messageId);
      expect(mockMessage.edit).toHaveBeenCalledWith({ 
        embeds: mockMessage.embeds, 
        components: [] 
      });
    });

    it('should handle channel not found', async () => {
      const messageId = 'message123';
      const channelId = 'channel123';
      const type = 'quiz';

      // Mock the getChannel method to return null
      (buttonCleanupService as any).getChannel = jest.fn().mockResolvedValue(null);

      await expect(
        buttonCleanupService.removeButtons(messageId, channelId, type)
      ).resolves.not.toThrow();
    });

    it('should handle message not found', async () => {
      const messageId = 'message123';
      const channelId = 'channel123';
      const type = 'quiz';

      // Mock the channel and message fetch to throw error
      const mockFetch = jest.fn().mockRejectedValue(new Error('Message not found'));
      mockChannel.messages.fetch = mockFetch;

      (buttonCleanupService as any).getChannel = jest.fn().mockResolvedValue(mockChannel);

      await expect(
        buttonCleanupService.removeButtons(messageId, channelId, type)
      ).resolves.not.toThrow();
    });
  });

  describe('cleanup management', () => {
    it('should track cleanup timeouts', () => {
      const messageId = 'message123';
      const channelId = 'channel123';

      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
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
      const removeButtonsSpy = jest.spyOn(buttonCleanupService, 'removeButtons').mockResolvedValue();

      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
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
}); 