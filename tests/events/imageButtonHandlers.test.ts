import { execute } from '../../src/events/interactionCreate';
import * as fs from 'fs/promises';

jest.mock('@/utils/logger', () => ({ logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock('@/utils/permissions', () => ({ requireAdminPrivileges: jest.fn() }));
jest.mock('@/services/DatabaseService', () => ({ 
  databaseService: { 
    prisma: { 
      image: { 
        findUnique: jest.fn(),
        delete: jest.fn()
      },
      question: {
        updateMany: jest.fn()
      },
      $transaction: jest.fn()
    } 
  } 
}));
jest.mock('@/services/QuizService', () => ({ quizService: {} }));
jest.mock('@/services/LeaderboardService', () => ({ leaderboardService: {} }));
jest.mock('@/services/ButtonCleanupService', () => ({ buttonCleanupService: {} }));
jest.mock('@/commands/quiz/start', () => ({ autocomplete: jest.fn() }));
jest.mock('fs/promises', () => ({
  access: jest.fn(),
  unlink: jest.fn()
}));

describe('Image Button Interactions', () => {
  let interaction: any;
  let requireAdminPrivileges: jest.MockedFunction<any>;
  let mockPrisma: any;
  let mockFs: any;

  beforeEach(() => {
    requireAdminPrivileges = require('@/utils/permissions').requireAdminPrivileges;
    mockPrisma = require('@/services/DatabaseService').databaseService.prisma;
    mockFs = fs as any;
    
    requireAdminPrivileges.mockClear();
    requireAdminPrivileges.mockResolvedValue(true);
    jest.clearAllMocks();
    
    interaction = {
      isButton: jest.fn().mockReturnValue(true),
      isAutocomplete: jest.fn().mockReturnValue(false),
      isModalSubmit: jest.fn().mockReturnValue(false),
      customId: '',
      user: { 
        id: 'user1', 
        tag: 'testuser#1234' 
      },
      update: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
      followUp: jest.fn().mockResolvedValue(undefined)
    };
  });

  describe('image_delete_confirm button', () => {
    beforeEach(() => {
      interaction.customId = 'image_delete_confirm_img_123';
    });

    it('should require admin privileges', async () => {
      requireAdminPrivileges.mockResolvedValue(false);
      
      await execute(interaction as any);
      
      expect(requireAdminPrivileges).toHaveBeenCalledWith(interaction);
    });

    it('should handle non-existent image', async () => {
      mockPrisma.image.findUnique.mockResolvedValue(null);
      
      await execute(interaction as any);
      
      expect(interaction.reply).toHaveBeenCalledWith({ 
        content: '❌ Image not found.', 
        ephemeral: true 
      });
    });

    it('should successfully delete image and update questions', async () => {
      const mockImage = {
        id: 'img_123',
        userId: 'user1',
        path: 'public/images/user1/img_123.png',
        title: 'Test Image',
        user: { username: 'testuser' },
        questions: [
          { quiz: { title: 'Quiz 1' } },
          { quiz: { title: 'Quiz 2' } }
        ]
      };

      mockPrisma.image.findUnique.mockResolvedValue(mockImage);
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return await callback({
          question: {
            updateMany: jest.fn().mockResolvedValue({ count: 2 })
          },
          image: {
            delete: jest.fn().mockResolvedValue(mockImage)
          }
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
              title: '✅ Image Deleted Successfully'
            })
          })
        ]),
        components: [] 
      });
    });

    it('should handle file deletion errors gracefully', async () => {
      const mockImage = {
        id: 'img_123',
        userId: 'user1',
        path: 'public/images/user1/img_123.png',
        title: null,
        user: { username: 'testuser' },
        questions: []
      };

      mockPrisma.image.findUnique.mockResolvedValue(mockImage);
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return await callback({
          question: { updateMany: jest.fn() },
          image: { delete: jest.fn().mockResolvedValue(mockImage) }
        });
      });

      // Mock file doesn't exist
      mockFs.access.mockRejectedValue(new Error('File not found'));

      await execute(interaction as any);

      expect(interaction.update).toHaveBeenCalledWith({ 
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: '✅ Image Deleted Successfully'
            })
          })
        ]),
        components: [] 
      });
      // Should not attempt to delete file that doesn't exist
      expect(mockFs.unlink).not.toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      mockPrisma.image.findUnique.mockRejectedValue(new Error('Database error'));
      
      await execute(interaction as any);
      
      expect(interaction.followUp).toHaveBeenCalledWith({ 
        content: '❌ Error deleting image. Please try again.', 
        ephemeral: true 
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
              title: '❌ Image Deletion Cancelled'
            })
          })
        ]),
        components: [] 
      });
    });

    it('should handle cancellation errors gracefully', async () => {
      interaction.update.mockRejectedValue(new Error('Discord API error'));
      
      await execute(interaction as any);
      
      expect(interaction.followUp).toHaveBeenCalledWith({ 
        content: '❌ Error cancelling image deletion.', 
        ephemeral: true 
      });
    });
  });

  describe('unknown image button', () => {
    it('should handle unknown image actions', async () => {
      interaction.customId = 'image_unknown_action';
      
      await execute(interaction as any);
      
      expect(interaction.reply).toHaveBeenCalledWith({ 
        content: '❌ Unknown image action.', 
        ephemeral: true 
      });
    });
  });

  describe('error handling', () => {
    it.skip('should handle general button interaction errors', async () => {
      interaction.customId = 'image_delete_confirm_img_123';
      requireAdminPrivileges.mockRejectedValue(new Error('Permission error'));
      
      await execute(interaction as any);
      
      // The error handling happens at the top level, so the interaction should be handled normally
      expect(interaction.reply).toHaveBeenCalledWith({ 
        content: 'There was an error while processing your request.', 
        ephemeral: true 
      });
    });
  });
});