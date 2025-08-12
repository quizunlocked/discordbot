import { vi } from 'vitest';
import { hasAdminPrivileges, requireAdminPrivileges } from '../../app/utils/permissions';

vi.mock('../../app/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

describe('permissions utility', () => {
  let mockInteraction: any;

  beforeEach(() => {
    mockInteraction = {
      guild: { id: 'guild1' },
      member: {
        permissions: {
          has: vi.fn(),
        },
      },
      memberPermissions: {
        has: vi.fn(),
      },
      user: { tag: 'test#1234' },
      isCommand: vi.fn().mockReturnValue(true),
      isButton: vi.fn().mockReturnValue(false),
      commandName: 'test-command',
      reply: vi.fn().mockResolvedValue(undefined),
    };
  });

  describe('hasAdminPrivileges', () => {
    it('should return true when user has administrator permissions', () => {
      mockInteraction.memberPermissions.has.mockReturnValue(true);
      expect(hasAdminPrivileges(mockInteraction)).toBe(true);
    });

    it('should return false when user lacks administrator permissions', () => {
      mockInteraction.memberPermissions.has.mockReturnValue(false);
      expect(hasAdminPrivileges(mockInteraction)).toBe(false);
    });

    it('should return false when interaction is not from a guild', () => {
      mockInteraction.guild = null;
      expect(hasAdminPrivileges(mockInteraction)).toBe(false);
    });

    it('should return false when member is null', () => {
      mockInteraction.member = null;
      expect(hasAdminPrivileges(mockInteraction)).toBe(false);
    });

    it('should return false when permissions check throws an error', () => {
      mockInteraction.memberPermissions.has.mockImplementation(() => {
        throw new Error('Permission check failed');
      });
      expect(hasAdminPrivileges(mockInteraction)).toBe(false);
    });
  });

  describe('requireAdminPrivileges', () => {
    it('should return true when user has administrator permissions', async () => {
      mockInteraction.memberPermissions.has.mockReturnValue(true);
      const result = await requireAdminPrivileges(mockInteraction);
      expect(result).toBe(true);
      expect(mockInteraction.reply).not.toHaveBeenCalled();
    });

    it('should return false and send error message when user lacks administrator permissions', async () => {
      mockInteraction.memberPermissions.has.mockReturnValue(false);
      const result = await requireAdminPrivileges(mockInteraction);
      expect(result).toBe(false);
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Access Denied'),
        ephemeral: true,
      });
    });

    it('should handle button interactions correctly', async () => {
      mockInteraction.isCommand.mockReturnValue(false);
      mockInteraction.isButton.mockReturnValue(true);
      mockInteraction.customId = 'test-button';
      mockInteraction.memberPermissions.has.mockReturnValue(false);

      await requireAdminPrivileges(mockInteraction);
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Access Denied'),
        ephemeral: true,
      });
    });
  });
});
