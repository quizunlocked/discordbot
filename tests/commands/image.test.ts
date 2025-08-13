import { vi, type MockedFunction } from 'vitest';
import { execute } from '../../app/commands/image/image';
import * as fs from 'fs/promises';

vi.mock('../../app/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('../../app/utils/permissions', () => ({ requireAdminPrivileges: vi.fn() }));
vi.mock('../../app/services/ButtonCleanupService', () => ({
  buttonCleanupService: {
    scheduleAdminCleanup: vi.fn(),
  },
}));
vi.mock('../../app/services/DatabaseService', () => ({
  databaseService: {
    prisma: {
      user: {
        upsert: vi.fn(),
      },
      image: {
        create: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        delete: vi.fn(),
      },
      question: {
        updateMany: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  },
}));
vi.mock('fs/promises', () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn(),
  unlink: vi.fn(),
}));

// Mock fetch globally
global.fetch = vi.fn();

describe('image command', () => {
  let interaction: any;
  let requireAdminPrivileges: MockedFunction<any>;
  let mockPrisma: any;
  let mockFs: any;

  beforeEach(async () => {
    const { requireAdminPrivileges: mockRequireAdminPrivileges } = await import(
      '../../app/utils/permissions'
    );
    const { databaseService } = await import('../../app/services/DatabaseService');
    requireAdminPrivileges = mockRequireAdminPrivileges as MockedFunction<any>;
    mockPrisma = databaseService.prisma;
    mockFs = fs as any;

    requireAdminPrivileges.mockClear();
    requireAdminPrivileges.mockResolvedValue(true);

    // Reset all mocks
    vi.clearAllMocks();

    interaction = {
      isChatInputCommand: vi.fn().mockReturnValue(true),
      options: {
        getSubcommand: vi.fn(),
        getString: vi.fn(),
        getAttachment: vi.fn(),
      },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue({ id: 'reply-123' }),
      reply: vi.fn().mockResolvedValue(undefined),
      channelId: 'test-channel',
      channel: {
        isDMBased: vi.fn().mockReturnValue(false),
      },
      user: {
        id: 'user1',
        username: 'testuser',
        tag: 'testuser#1234',
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
        contentType: 'text/plain',
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
        contentType: 'image/png',
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
        contentType: 'text/plain',
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
        contentType: 'image/png',
      };

      const mockImageBuffer = Buffer.from('fake-image-data');
      const mockImageRecord = {
        id: 'img_123',
        userId: 'user1',
        path: '',
        title: 'Test Image',
        altText: 'Test alt text',
      };

      interaction.options.getAttachment.mockReturnValue(mockAttachment);
      interaction.options.getString.mockImplementation((key: string) => {
        if (key === 'title') return 'Test Image';
        if (key === 'alt_text') return 'Test alt text';
        return null;
      });

      // Mock fetch response
      (global.fetch as MockedFunction<any>).mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockImageBuffer.buffer),
      });

      // Mock database operations
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return await callback({
          user: {
            upsert: vi.fn().mockResolvedValue({ id: 'user1', username: 'testuser' }),
          },
          image: {
            create: vi.fn().mockResolvedValue(mockImageRecord),
          },
        });
      });

      mockPrisma.image.update.mockResolvedValue({
        ...mockImageRecord,
        path: 'public/images/user1/img_123.png',
      });

      await execute(interaction as any);

      expect(mockFs.mkdir).toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalled();
      expect(mockPrisma.image.update).toHaveBeenCalledWith({
        where: { id: 'img_123' },
        data: { path: 'public/images/user1/img_123.png' },
      });
      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: '✅ Image Uploaded Successfully',
            }),
          }),
        ]),
      });
    });

    it('should handle fetch errors gracefully', async () => {
      interaction.options.getAttachment.mockReturnValue({
        name: 'test.png',
        size: 5000,
        url: 'https://example.com/test.png',
        contentType: 'image/png',
      });

      (global.fetch as MockedFunction<any>).mockRejectedValue(new Error('Network error'));

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
        questions: [{ quiz: { title: 'Quiz 1' } }, { quiz: { title: 'Quiz 2' } }],
      };

      mockPrisma.image.findUnique.mockResolvedValue(mockImage);

      await execute(interaction as any);

      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: '⚠️ Confirm Image Deletion',
            }),
          }),
        ]),
        components: expect.any(Array),
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
        questions: [],
      };

      mockPrisma.image.findUnique.mockResolvedValue(mockImage);

      await execute(interaction as any);

      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: '⚠️ Confirm Image Deletion',
            }),
          }),
        ]),
        components: expect.any(Array),
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
