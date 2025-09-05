import { vi, type MockedFunction } from 'vitest';
import { execute } from '../../app/events/interactionCreate';
import { requireAdminPrivileges } from '../../app/utils/permissions';
import { databaseService } from '../../app/services/DatabaseService';
import * as fs from 'fs/promises';

vi.mock('../../app/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('../../app/utils/permissions', () => ({ requireAdminPrivileges: vi.fn() }));
vi.mock('../../app/services/DatabaseService', () => ({
  databaseService: {
    prisma: {
      image: {
        findUnique: vi.fn(),
        delete: vi.fn(),
      },
      question: {
        updateMany: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  },
}));
vi.mock('../../app/services/QuizService', () => ({ quizService: {} }));
vi.mock('../../app/services/LeaderboardService', () => ({ leaderboardService: {} }));
vi.mock('../../app/services/ButtonCleanupService', () => ({ buttonCleanupService: {} }));
vi.mock('../../app/commands/quiz/start', () => ({ autocomplete: vi.fn() }));
vi.mock('fs/promises', () => ({
  access: vi.fn(),
  unlink: vi.fn(),
}));

describe('Image Button Interactions', () => {
  let interaction: any;
  let mockRequireAdminPrivileges: MockedFunction<any>;
  let mockPrisma: any;
  let mockFs: any;

  beforeEach(async () => {
    mockRequireAdminPrivileges = requireAdminPrivileges as MockedFunction<any>;
    mockPrisma = databaseService.prisma;
    mockFs = fs as any;

    mockRequireAdminPrivileges.mockClear();
    mockRequireAdminPrivileges.mockResolvedValue(true);
    vi.clearAllMocks();

    interaction = {
      isButton: vi.fn().mockReturnValue(true),
      isAutocomplete: vi.fn().mockReturnValue(false),
      isModalSubmit: vi.fn().mockReturnValue(false),
      customId: '',
      user: {
        id: 'user1',
        tag: 'testuser#1234',
      },
      update: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined),
    };
  });

  describe('image_delete_confirm button', () => {
    beforeEach(() => {
      interaction.customId = 'image_delete_confirm_img_123';
    });

    it('should require admin privileges', async () => {
      mockRequireAdminPrivileges.mockResolvedValue(false);

      await execute(interaction as any);

      expect(requireAdminPrivileges).toHaveBeenCalledWith(interaction);
    });

    it('should handle non-existent image', async () => {
      mockPrisma.image.findUnique.mockResolvedValue(null);

      await execute(interaction as any);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: '❌ Image not found.',
        ephemeral: true,
      });
    });

    it('should successfully delete image and update questions', async () => {
      const mockImage = {
        id: 'img_123',
        userId: 'user1',
        path: 'public/images/user1/img_123.png',
        title: 'Test Image',
        user: { username: 'testuser' },
        questions: [{ quiz: { title: 'Quiz 1' } }, { quiz: { title: 'Quiz 2' } }],
      };

      mockPrisma.image.findUnique.mockResolvedValue(mockImage);
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return await callback({
          question: {
            updateMany: vi.fn().mockResolvedValue({ count: 2 }),
          },
          image: {
            delete: vi.fn().mockResolvedValue(mockImage),
          },
        });
      });

      // Mock file exists and deletion
      mockFs.access.mockResolvedValue(undefined);
      mockFs.unlink.mockResolvedValue(undefined);

      await execute(interaction as any);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockFs.unlink).toHaveBeenCalledWith('public/images/user1/img_123.png');
      expect(interaction.update).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: '✅ Image Deleted Successfully',
            }),
          }),
        ]),
        components: [],
      });
    });

    it('should handle file deletion errors gracefully', async () => {
      const mockImage = {
        id: 'img_123',
        userId: 'user1',
        path: 'public/images/user1/img_123.png',
        title: null,
        user: { username: 'testuser' },
        questions: [],
      };

      mockPrisma.image.findUnique.mockResolvedValue(mockImage);
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return await callback({
          question: { updateMany: vi.fn() },
          image: { delete: vi.fn().mockResolvedValue(mockImage) },
        });
      });

      // Mock file doesn't exist
      mockFs.access.mockRejectedValue(new Error('File not found'));

      await execute(interaction as any);

      expect(interaction.update).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: '✅ Image Deleted Successfully',
            }),
          }),
        ]),
        components: [],
      });
      // Should not attempt to delete file that doesn't exist
      expect(mockFs.unlink).not.toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      mockPrisma.image.findUnique.mockRejectedValue(new Error('Database error'));

      await execute(interaction as any);

      expect(interaction.followUp).toHaveBeenCalledWith({
        content: '❌ Error deleting image. Please try again.',
        ephemeral: true,
      });
    });
  });

  describe('image_delete_cancel button', () => {
    beforeEach(() => {
      interaction.customId = 'image_delete_cancel_img_123';
    });

    it('should cancel image deletion', async () => {
      await execute(interaction as any);

      expect(interaction.update).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: '❌ Image Deletion Cancelled',
            }),
          }),
        ]),
        components: [],
      });
    });

    it('should handle cancellation errors gracefully', async () => {
      interaction.update.mockRejectedValue(new Error('Discord API error'));

      await execute(interaction as any);

      expect(interaction.followUp).toHaveBeenCalledWith({
        content: '❌ Error cancelling image deletion.',
        ephemeral: true,
      });
    });
  });

  describe('unknown image button', () => {
    it('should handle unknown image actions', async () => {
      interaction.customId = 'image_unknown_action';

      await execute(interaction as any);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: '❌ Unknown image action.',
        ephemeral: true,
      });
    });
  });

  describe('error handling', () => {
    it('should handle image deletion transaction errors', async () => {
      interaction.customId = 'image_delete_confirm_img_123';

      const mockImage = {
        id: 'img_123',
        userId: 'user1',
        path: 'public/images/user1/img_123.png',
        title: 'Test Image',
        user: { username: 'testuser' },
        questions: [],
      };

      mockPrisma.image.findUnique.mockResolvedValue(mockImage);
      mockPrisma.$transaction.mockRejectedValue(new Error('Database transaction failed'));

      await execute(interaction as any);

      // Should call followUp with error message due to transaction failure
      expect(interaction.followUp).toHaveBeenCalledWith({
        content: '❌ Error deleting image. Please try again.',
        ephemeral: true,
      });
    });
  });
});
