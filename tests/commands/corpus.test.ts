import { describe, it, expect, beforeEach, vi } from 'vitest';
import { execute } from '../../app/commands/corpus';
import { databaseService } from '../../app/services/DatabaseService';
import Papa from 'papaparse';

vi.mock('../../app/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../app/services/DatabaseService', () => ({
  databaseService: {
    prisma: {
      corpus: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      corpusEntry: {
        createMany: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  },
}));

vi.mock('papaparse', () => {
  const mockPapaparse = {
    parse: vi.fn(),
  };
  return {
    default: mockPapaparse,
    ...mockPapaparse,
  };
});

// Mock fetch globally
global.fetch = vi.fn();

describe('corpus command', () => {
  let interaction: any;
  let mockPrisma: any;
  let mockPapa: any;

  beforeEach(async () => {
    mockPrisma = databaseService.prisma;
    mockPapa = Papa;

    vi.clearAllMocks();

    interaction = {
      isChatInputCommand: vi.fn().mockReturnValue(true),
      options: {
        getSubcommand: vi.fn(),
        getString: vi.fn(),
        getAttachment: vi.fn(),
      },
      reply: vi.fn().mockResolvedValue(undefined),
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      channel: {
        isDMBased: vi.fn().mockReturnValue(false),
      },
      channelId: 'test-channel',
      guild: { id: 'test-guild', name: 'TestGuild' },
      user: { id: 'user1', tag: 'user#1', username: 'testuser' },
      id: 'interaction_123',
    };
  });

  describe('general corpus functionality', () => {
    it('should handle unknown subcommand', async () => {
      interaction.options.getSubcommand.mockReturnValue('unknown');

      await execute(interaction as any);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'Unknown subcommand.',
        ephemeral: true,
      });
    });

    it('should reject corpus commands in DM channels', async () => {
      interaction.channel.isDMBased.mockReturnValue(true);
      interaction.options.getSubcommand.mockReturnValue('upload');

      await execute(interaction as any);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: '❌ Corpus commands can only be used in server channels, not in direct messages.',
        ephemeral: true,
      });
    });

    it('should reject corpus commands when guild is null', async () => {
      interaction.guild = null;
      interaction.options.getSubcommand.mockReturnValue('upload');

      await execute(interaction as any);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: '❌ Corpus commands can only be used in server channels, not in direct messages.',
        ephemeral: true,
      });
    });
  });

  describe('template subcommand', () => {
    it('should handle template command', async () => {
      interaction.options.getSubcommand.mockReturnValue('template');

      await execute(interaction as any);

      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    });
  });

  describe('upload subcommand with tags', () => {
    beforeEach(() => {
      interaction.options.getSubcommand.mockReturnValue('upload');
      interaction.options.getString.mockReturnValue('Test Corpus');
      interaction.options.getAttachment.mockReturnValue({
        name: 'test.csv',
        size: 1000,
        url: 'https://example.com/test.csv',
        contentType: 'text/csv',
      });
    });

    it('should successfully parse CSV with tag column and flexible headers', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            'questions,answers,tag,hint1\n"Test question","Test answer","test-tag","Test hint"'
          ),
      });

      mockPapa.parse.mockReturnValue({
        data: [
          {
            questions: 'Test question',
            answers: 'Test answer',
            tag: 'test-tag',
            hint1: 'Test hint',
          },
        ],
        errors: [],
      });

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return await callback({
          corpus: {
            create: vi.fn().mockResolvedValue({ id: 'corpus_123', title: 'Test Corpus' }),
          },
          corpusEntry: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        });
      });

      await execute(interaction as any);

      expect(mockPapa.parse).toHaveBeenCalled();
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        })
      );

      // Verify the embeds contain success title (Discord.js EmbedBuilder stores data in .data property)
      const editReplyCall = interaction.editReply.mock.calls[0][0];
      const embed = editReplyCall.embeds[0];
      expect(embed.data.title).toBe('✅ Corpus Created Successfully');
    });

    it('should handle CSV with singular "tag" column header', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            'answer,question,Example,tag\n"Paris","Capital of France","French capital","geography"'
          ),
      });

      mockPapa.parse.mockReturnValue({
        data: [
          {
            answer: 'Paris',
            question: 'Capital of France',
            Example: 'French capital',
            tag: 'geography',
          },
        ],
        errors: [],
      });

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return await callback({
          corpus: {
            create: vi.fn().mockResolvedValue({ id: 'corpus_123', title: 'Test Corpus' }),
          },
          corpusEntry: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        });
      });

      await execute(interaction as any);

      expect(mockPrisma.$transaction).toHaveBeenCalled();

      // Verify the transaction was called with correct data structure
      const transactionCallback = mockPrisma.$transaction.mock.calls[0][0];
      const mockTx = {
        corpus: { create: vi.fn().mockResolvedValue({ id: 'corpus_123', title: 'Test Corpus' }) },
        corpusEntry: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      };

      await transactionCallback(mockTx);

      // Should create corpus entry with tags field populated
      expect(mockTx.corpusEntry.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            tags: expect.arrayContaining(['geography']),
            questionVariants: expect.arrayContaining(['Capital of France']),
            answerVariants: expect.arrayContaining(['Paris']),
            hintTitles: expect.arrayContaining(['Example']),
          }),
        ]),
      });
    });

    it('should handle CSV with multiple tags separated by newlines', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            'questions,answers,tags,hint\n"Test question","Test answer","tag1\\ntag2\\ntag3","Test hint"'
          ),
      });

      mockPapa.parse.mockReturnValue({
        data: [
          {
            questions: 'Test question',
            answers: 'Test answer',
            tags: 'tag1\ntag2\ntag3',
            hint: 'Test hint',
          },
        ],
        errors: [],
      });

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return await callback({
          corpus: {
            create: vi.fn().mockResolvedValue({ id: 'corpus_123', title: 'Test Corpus' }),
          },
          corpusEntry: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        });
      });

      await execute(interaction as any);

      const transactionCallback = mockPrisma.$transaction.mock.calls[0][0];
      const mockTx = {
        corpus: { create: vi.fn().mockResolvedValue({ id: 'corpus_123', title: 'Test Corpus' }) },
        corpusEntry: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      };

      await transactionCallback(mockTx);

      // Should normalize tags to lowercase and parse newline-separated values
      expect(mockTx.corpusEntry.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            tags: ['tag1', 'tag2', 'tag3'],
          }),
        ]),
      });
    });

    it('should handle CSV without tag column', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve('questions,answers,hint1\n"Test question","Test answer","Test hint"'),
      });

      mockPapa.parse.mockReturnValue({
        data: [
          {
            questions: 'Test question',
            answers: 'Test answer',
            hint1: 'Test hint',
          },
        ],
        errors: [],
      });

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return await callback({
          corpus: {
            create: vi.fn().mockResolvedValue({ id: 'corpus_123', title: 'Test Corpus' }),
          },
          corpusEntry: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        });
      });

      await execute(interaction as any);

      const transactionCallback = mockPrisma.$transaction.mock.calls[0][0];
      const mockTx = {
        corpus: { create: vi.fn().mockResolvedValue({ id: 'corpus_123', title: 'Test Corpus' }) },
        corpusEntry: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      };

      await transactionCallback(mockTx);

      // Should create entry with empty tags array when no tag column
      expect(mockTx.corpusEntry.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            tags: [],
            hintTitles: expect.arrayContaining(['hint1']),
          }),
        ]),
      });
    });

    it('should validate CSV has required question and answer columns', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('column1,column2,column3\n"value1","value2","value3"'),
      });

      mockPapa.parse.mockReturnValue({
        data: [
          {
            column1: 'value1',
            column2: 'value2',
            column3: 'value3',
          },
        ],
        errors: [],
      });

      await execute(interaction as any);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('❌ Corpus CSV validation failed')
      );
    });

    it('should handle fetch errors gracefully', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 404,
      });

      await execute(interaction as any);

      expect(interaction.editReply).toHaveBeenCalledWith(
        '❌ Failed to download the CSV file. Please try again.'
      );
    });

    it('should handle Papa Parse errors', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('invalid,csv,content'),
      });

      mockPapa.parse.mockReturnValue({
        data: [],
        errors: [{ message: 'Invalid CSV format', row: 1 }],
      });

      await execute(interaction as any);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('❌ Corpus CSV validation failed')
      );
    });
  });
});
