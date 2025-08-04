import { execute } from '../../src/commands/image/image';
import * as fs from 'fs/promises';

jest.mock('@/utils/logger', () => ({ logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock('@/utils/permissions', () => ({ requireAdminPrivileges: jest.fn() }));
jest.mock('@/services/ButtonCleanupService', () => ({ 
  buttonCleanupService: { 
    scheduleAdminCleanup: jest.fn() 
  } 
}));
jest.mock('@/services/DatabaseService', () => ({ 
  databaseService: { 
    prisma: { 
      user: { 
        upsert: jest.fn() 
      },
      image: { 
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn()
      },
      question: {
        updateMany: jest.fn()
      },
      $transaction: jest.fn()
    } 
  } 
}));
jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  access: jest.fn(),
  unlink: jest.fn()
}));

// Mock fetch globally
global.fetch = jest.fn();

describe('image command', () => {
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
    
    // Reset all mocks
    jest.clearAllMocks();
    
    interaction = {
      isChatInputCommand: jest.fn().mockReturnValue(true),
      options: { 
        getSubcommand: jest.fn(),
        getString: jest.fn(),
        getAttachment: jest.fn()
      },
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue({ id: 'reply-123' }),
      reply: jest.fn().mockResolvedValue(undefined),
      channelId: 'test-channel',
      channel: {
        isDMBased: jest.fn().mockReturnValue(false),
      },
      user: { 
        id: 'user1', 
        username: 'testuser',
        tag: 'testuser#1234' 
      },
      guild: { name: 'TestGuild' },
    };
  });

  describe('upload subcommand', () => {
    beforeEach(() => {
      interaction.options.getSubcommand.mockReturnValue('upload');
    });

    it('should handle missing file attachment', async () => {
      interaction.options.getAttachment.mockReturnValue(null);
      
      await execute(interaction as any);
      
      expect(interaction.editReply).toHaveBeenCalledWith(
        '❌ No file was provided. Please attach an image file.'
      );
    });

    it('should reject invalid file extensions', async () => {
      interaction.options.getAttachment.mockReturnValue({
        name: 'test.txt',
        size: 1000,
        url: 'https://example.com/test.txt',
        contentType: 'text/plain'
      });
      
      await execute(interaction as any);
      
      expect(interaction.editReply).toHaveBeenCalledWith(
        '❌ Invalid file type. Please upload one of: .png, .jpg, .jpeg, .gif, .webp'
      );
    });

    it('should reject files that are too large', async () => {
      interaction.options.getAttachment.mockReturnValue({
        name: 'test.png',
        size: 15 * 1024 * 1024, // 15MB
        url: 'https://example.com/test.png',
        contentType: 'image/png'
      });
      
      await execute(interaction as any);
      
      expect(interaction.editReply).toHaveBeenCalledWith(
        '❌ File too large. Please upload an image smaller than 10MB.'
      );
    });

    it('should reject non-image content types', async () => {
      interaction.options.getAttachment.mockReturnValue({
        name: 'test.png',
        size: 1000,
        url: 'https://example.com/test.png',
        contentType: 'text/plain'
      });
      
      await execute(interaction as any);
      
      expect(interaction.editReply).toHaveBeenCalledWith(
        '❌ Invalid file type. Please upload a valid image file.'
      );
    });

    it('should successfully upload valid image', async () => {
      const mockAttachment = {
        name: 'test.png',
        size: 5000,
        url: 'https://example.com/test.png',
        contentType: 'image/png'
      };
      
      const mockImageBuffer = Buffer.from('fake-image-data');
      const mockImageRecord = {
        id: 'img_123',
        userId: 'user1',
        path: '',
        title: 'Test Image',
        altText: 'Test alt text'
      };

      interaction.options.getAttachment.mockReturnValue(mockAttachment);
      interaction.options.getString.mockImplementation((key: string) => {
        if (key === 'title') return 'Test Image';
        if (key === 'alt_text') return 'Test alt text';
        return null;
      });

      // Mock fetch response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockImageBuffer.buffer)
      });

      // Mock database operations
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return await callback({
          user: {
            upsert: jest.fn().mockResolvedValue({ id: 'user1', username: 'testuser' })
          },
          image: {
            create: jest.fn().mockResolvedValue(mockImageRecord)
          }
        });
      });

      mockPrisma.image.update.mockResolvedValue({
        ...mockImageRecord,
        path: 'public/images/user1/img_123.png'
      });

      await execute(interaction as any);

      expect(mockFs.mkdir).toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalled();
      expect(mockPrisma.image.update).toHaveBeenCalledWith({
        where: { id: 'img_123' },
        data: { path: 'public/images/user1/img_123.png' }
      });
      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: '✅ Image Uploaded Successfully'
            })
          })
        ])
      });
    });

    it('should handle fetch errors gracefully', async () => {
      interaction.options.getAttachment.mockReturnValue({
        name: 'test.png',
        size: 5000,
        url: 'https://example.com/test.png',
        contentType: 'image/png'
      });

      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      await execute(interaction as any);

      expect(interaction.editReply).toHaveBeenCalledWith(
        '❌ An error occurred while uploading your image. Please try again.'
      );
    });
  });

  describe('delete subcommand', () => {
    beforeEach(() => {
      interaction.options.getSubcommand.mockReturnValue('delete');
      interaction.options.getString.mockReturnValue('img_123');
    });

    it('should require admin privileges', async () => {
      requireAdminPrivileges.mockResolvedValue(false);
      
      await execute(interaction as any);
      
      expect(requireAdminPrivileges).toHaveBeenCalledWith(interaction);
    });

    it('should handle non-existent image', async () => {
      mockPrisma.image.findUnique.mockResolvedValue(null);
      
      await execute(interaction as any);
      
      expect(interaction.editReply).toHaveBeenCalledWith('❌ Image not found.');
    });

    it('should show confirmation for image with questions', async () => {
      const mockImage = {
        id: 'img_123',
        userId: 'user1',
        path: 'public/images/user1/img_123.png',
        title: 'Test Image',
        uploadedAt: new Date(),
        user: { username: 'testuser' },
        questions: [
          { quiz: { title: 'Quiz 1' } },
          { quiz: { title: 'Quiz 2' } }
        ]
      };

      mockPrisma.image.findUnique.mockResolvedValue(mockImage);
      
      await execute(interaction as any);
      
      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: '⚠️ Confirm Image Deletion'
            })
          })
        ]),
        components: expect.any(Array)
      });
    });

    it('should show confirmation for image without questions', async () => {
      const mockImage = {
        id: 'img_123',
        userId: 'user1',
        path: 'public/images/user1/img_123.png',
        title: null,
        uploadedAt: new Date(),
        user: { username: 'testuser' },
        questions: []
      };

      mockPrisma.image.findUnique.mockResolvedValue(mockImage);
      
      await execute(interaction as any);
      
      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: '⚠️ Confirm Image Deletion'
            })
          })
        ]),
        components: expect.any(Array)
      });
    });
  });

  describe('validation and error handling', () => {
    it('should reject commands in DM channels', async () => {
      interaction.channel.isDMBased.mockReturnValue(true);
      interaction.guild = null;
      interaction.options.getSubcommand.mockReturnValue('upload');
      
      await execute(interaction as any);
      
      expect(interaction.editReply).toHaveBeenCalledWith({
        content: '❌ Image commands can only be used in server channels, not in direct messages.',
      });
    });

    it('should handle unknown subcommands', async () => {
      interaction.options.getSubcommand.mockReturnValue('unknown');
      
      await execute(interaction as any);
      
      expect(interaction.editReply).toHaveBeenCalledWith('Unknown subcommand.');
    });

    it('should handle general errors gracefully', async () => {
      interaction.options.getSubcommand.mockReturnValue('upload');
      interaction.deferReply.mockRejectedValue(new Error('Discord API error'));
      
      await execute(interaction as any);
      
      expect(interaction.editReply).toHaveBeenCalledWith({
        content: 'There was an error executing the image command. Please check the logs.',
      });
    });
  });
});