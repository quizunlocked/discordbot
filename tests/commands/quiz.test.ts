import { vi, type MockedFunction } from 'vitest';
import { execute } from '../../app/commands/quiz';

vi.mock('../../app/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('../../app/utils/permissions', () => ({
  requireAdminPrivileges: vi.fn(),
  canManageQuiz: vi.fn(),
  hasAdminPrivileges: vi.fn(),
}));
vi.mock('../../app/services/QuizService', () => ({
  quizService: { getActiveSessionByChannel: vi.fn(), startQuiz: vi.fn(), stopQuiz: vi.fn() },
}));
vi.mock('../../app/services/DatabaseService', () => ({
  databaseService: {
    prisma: {
      user: { upsert: vi.fn() },
      quiz: { create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
      question: { createMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
      questionAttempt: { deleteMany: vi.fn() },
      hint: { deleteMany: vi.fn() },
      image: { findMany: vi.fn() },
      corpus: { findUnique: vi.fn() },
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

const mockShowModal = vi.fn();
vi.mock('discord.js', async () => {
  const actual = await vi.importActual('discord.js');
  return {
    ...actual,
    SlashCommandBuilder: vi.fn().mockImplementation(() => ({
      setName: vi.fn().mockReturnThis(),
      setDescription: vi.fn().mockReturnThis(),
      addSubcommand: vi.fn().mockReturnThis(),
      addSubcommandGroup: vi.fn().mockReturnThis(),
      setDefaultMemberPermissions: vi.fn().mockReturnThis(),
    })),
    ModalBuilder: vi.fn().mockImplementation(() => ({
      setCustomId: vi.fn().mockReturnThis(),
      setTitle: vi.fn().mockReturnThis(),
      addComponents: vi.fn().mockReturnThis(),
    })),
    TextInputBuilder: vi.fn().mockImplementation(() => ({
      setCustomId: vi.fn().mockReturnThis(),
      setLabel: vi.fn().mockReturnThis(),
      setStyle: vi.fn().mockReturnThis(),
      setPlaceholder: vi.fn().mockReturnThis(),
      setRequired: vi.fn().mockReturnThis(),
      setMaxLength: vi.fn().mockReturnThis(),
      setValue: vi.fn().mockReturnThis(),
    })),
    ActionRowBuilder: vi.fn().mockImplementation(() => ({
      addComponents: vi.fn().mockReturnThis(),
    })),
    EmbedBuilder: vi.fn().mockImplementation(() => {
      const embed = {
        data: {
          title: '',
          description: '',
          fields: [] as any,
          color: null,
          timestamp: null,
        },
        setTitle: vi.fn().mockImplementation(title => {
          embed.data.title = title;
          return embed;
        }),
        setDescription: vi.fn().mockImplementation(description => {
          embed.data.description = description;
          return embed;
        }),
        addFields: vi.fn().mockImplementation((...fields) => {
          embed.data.fields.push(...fields);
          return embed;
        }),
        setColor: vi.fn().mockImplementation(color => {
          embed.data.color = color;
          return embed;
        }),
        setTimestamp: vi.fn().mockImplementation(timestamp => {
          embed.data.timestamp = timestamp;
          return embed;
        }),
      };
      return embed;
    }),
  };
});

// Mock fetch globally
global.fetch = vi.fn();

describe('quiz command', () => {
  let interaction: any;
  let requireAdminPrivileges: MockedFunction<any>;
  let mockPrisma: any;
  let mockPapa: any;

  beforeEach(async () => {
    const { requireAdminPrivileges: mockRequireAdminPrivileges } = await import(
      '../../app/utils/permissions'
    );
    const { databaseService } = await import('../../app/services/DatabaseService');
    const mockPapaImport = await import('papaparse');

    requireAdminPrivileges = mockRequireAdminPrivileges as MockedFunction<any>;
    mockPrisma = databaseService.prisma;
    mockPapa = mockPapaImport.default || mockPapaImport;

    requireAdminPrivileges.mockResolvedValue(true);
    vi.clearAllMocks();

    // Mock the duplicate check to return null (no existing quiz)
    mockPrisma.quiz.findFirst.mockResolvedValue(null);

    interaction = {
      isChatInputCommand: vi.fn().mockReturnValue(true),
      options: {
        getSubcommand: vi.fn(),
        getSubcommandGroup: vi.fn().mockReturnValue(null),
        getString: vi.fn(),
        getInteger: vi.fn(),
        getBoolean: vi.fn(),
        getAttachment: vi.fn(),
      },
      reply: vi.fn().mockResolvedValue(undefined),
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      showModal: mockShowModal,
      channel: {
        isDMBased: vi.fn().mockReturnValue(false),
      },
      channelId: 'test-channel',
      guild: { id: 'test-guild', name: 'TestGuild' },
      user: { id: 'user1', tag: 'user#1', username: 'testuser' },
      id: 'interaction_123',
    };
    mockShowModal.mockReset();
  });

  describe('general quiz functionality', () => {
    it('should handle unknown subcommand', async () => {
      interaction.options.getSubcommand.mockReturnValue('unknown');
      await execute(interaction as any);
      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      expect(interaction.editReply).toHaveBeenCalledWith('Unknown subcommand.');
    });

    it('should handle errors gracefully', async () => {
      interaction.options.getSubcommand.mockReturnValue('create');
      mockShowModal.mockImplementation(() => {
        throw new Error('fail');
      });
      await execute(interaction as any);
      expect(interaction.deferReply).not.toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalled();
    });

    it('should reject quiz commands in DM channels', async () => {
      // Mock DM channel
      interaction.channel.isDMBased.mockReturnValue(true);
      interaction.guild = null; // DM channels don't have guilds
      interaction.options.getSubcommand.mockReturnValue('create');

      await execute(interaction as any);

      expect(interaction.deferReply).not.toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalledWith({
        content: '❌ Quiz commands can only be used in server channels, not in direct messages.',
        ephemeral: true,
      });
      // Should not proceed to handle the subcommand
      expect(mockShowModal).not.toHaveBeenCalled();
    });

    it('should reject quiz commands when guild is null', async () => {
      // Mock no guild context
      interaction.guild = null;
      interaction.options.getSubcommand.mockReturnValue('create');

      await execute(interaction as any);

      expect(interaction.deferReply).not.toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalledWith({
        content: '❌ Quiz commands can only be used in server channels, not in direct messages.',
        ephemeral: true,
      });
      // Should not proceed to handle the subcommand
      expect(mockShowModal).not.toHaveBeenCalled();
    });
  });

  describe('admin-protected subcommands', () => {
    it('should check admin privileges for delete subcommand', async () => {
      interaction.options.getSubcommand.mockReturnValue('delete');
      interaction.options.getString.mockReturnValue('quiz-123');
      await execute(interaction as any);
      expect(requireAdminPrivileges).toHaveBeenCalledWith(interaction);
    });

    it('should not execute destructive commands when user lacks admin privileges', async () => {
      requireAdminPrivileges.mockResolvedValue(false);
      interaction.options.getSubcommand.mockReturnValue('delete');
      interaction.options.getString.mockReturnValue('quiz-123');
      await execute(interaction as any);
      // The function should return early without calling any other functions
      expect(requireAdminPrivileges).toHaveBeenCalledWith(interaction);
    });
  });

  describe('start subcommand', () => {
    beforeEach(() => {
      interaction.options.getSubcommand.mockReturnValue('start');
    });

    it('should handle start errors gracefully', async () => {
      const { quizService } = await import('../../app/services/QuizService');
      (quizService.getActiveSessionByChannel as MockedFunction<any>).mockImplementation(() => {
        throw new Error('fail');
      });
      await execute(interaction as any);
      expect(interaction.deferReply).toHaveBeenCalledWith();
      expect(interaction.editReply).toHaveBeenCalled();
    });
  });

  describe('upload subcommand - CSV with image support', () => {
    beforeEach(async () => {
      // Reset mocks specifically for upload tests
      vi.clearAllMocks();

      // Set up fresh mocks for upload
      const { databaseService } = await import('../../app/services/DatabaseService');
      const mockPapaImport = await import('papaparse');
      mockPrisma = databaseService.prisma;
      mockPapa = mockPapaImport.default || mockPapaImport;

      // Mock the duplicate check to return null (no existing quiz)
      mockPrisma.quiz.findFirst.mockResolvedValue(null);

      // Set up interaction specifically for upload command
      interaction = {
        isChatInputCommand: vi.fn().mockReturnValue(true),
        options: {
          getSubcommand: vi.fn().mockReturnValue('upload'),
          getSubcommandGroup: vi.fn().mockReturnValue(null),
          getString: vi.fn(),
          getAttachment: vi.fn(),
        },
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
        reply: vi.fn().mockResolvedValue(undefined),
        guild: { id: 'test-guild', name: 'Test Guild' },
        channel: {
          id: 'test-channel',
          isDMBased: vi.fn().mockReturnValue(false),
        },
        user: {
          id: 'user1',
          username: 'testuser',
          tag: 'testuser#1234',
        },
        id: 'interaction_123', // Add interaction ID for the duplicate check
      };
    });

    it('should validate image IDs in CSV', async () => {
      interaction.options.getAttachment.mockReturnValue({
        name: 'test.csv',
        size: 1000,
        url: 'https://example.com/test.csv',
        contentType: 'text/csv',
      });

      (global.fetch as MockedFunction<any>).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('csv content'),
      });

      // Mock Papa Parse to return parsed data
      mockPapa.parse.mockReturnValue({
        data: [
          {
            questionText: 'Question 1',
            options: '["A","B","C"]',
            correctAnswer: '0',
            points: '10',
            timeLimit: '30',
            imageId: 'img_123',
          },
          {
            questionText: 'Question 2',
            options: '["A","B","C"]',
            correctAnswer: '1',
            points: '10',
            timeLimit: '30',
            imageId: 'img_456',
          },
          {
            questionText: 'Question 3',
            options: '["A","B","C"]',
            correctAnswer: '2',
            points: '10',
            timeLimit: '30',
            imageId: '',
          },
        ],
        errors: [],
      });

      // Mock that only img_123 exists
      mockPrisma.image.findMany.mockResolvedValue([{ id: 'img_123' }]);

      await execute(interaction as any);

      expect(mockPrisma.image.findMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: ['img_123', 'img_456'],
          },
        },
        select: { id: true },
      });

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('❌ Image validation failed')
      );
    });

    it('should successfully create quiz with valid image IDs', async () => {
      interaction.options.getAttachment.mockReturnValue({
        name: 'test.csv',
        size: 1000,
        url: 'https://example.com/test.csv',
        contentType: 'text/csv',
      });
      interaction.options.getString.mockReturnValue('Test Quiz');

      (global.fetch as MockedFunction<any>).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('csv content'),
      });

      // Mock Papa Parse to return parsed data
      mockPapa.parse.mockReturnValue({
        data: [
          {
            questionText: 'Question 1',
            options: '["A","B","C"]',
            correctAnswer: '0',
            points: '10',
            timeLimit: '30',
            imageId: 'img_123',
          },
          {
            questionText: 'Question 2',
            options: '["A","B","C"]',
            correctAnswer: '1',
            points: '10',
            timeLimit: '30',
            imageId: '',
          },
          {
            questionText: 'Question 3',
            options: '["A","B","C"]',
            correctAnswer: '2',
            points: '10',
            timeLimit: '30',
            imageId: 'img_456',
          },
        ],
        errors: [],
      });

      // Mock that both images exist
      mockPrisma.image.findMany.mockResolvedValue([{ id: 'img_123' }, { id: 'img_456' }]);

      // Mock successful database transaction
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const mockQuiz = { id: 'quiz_123', title: 'Test Quiz' };
        return await callback({
          user: {
            upsert: vi.fn().mockResolvedValue({ id: 'user1', username: 'testuser' }),
          },
          quiz: {
            create: vi.fn().mockResolvedValue(mockQuiz),
          },
          question: {
            createMany: vi.fn().mockResolvedValue({ count: 3 }),
          },
        });
      });

      await execute(interaction as any);

      expect(mockPrisma.$transaction).toHaveBeenCalled();

      // Check that questions were created with correct imageId values
      const transactionCallback = mockPrisma.$transaction.mock.calls[0][0];
      const mockTx = {
        user: { upsert: vi.fn().mockResolvedValue({ id: 'user1', username: 'testuser' }) },
        quiz: { create: vi.fn().mockResolvedValue({ id: 'quiz_123', title: 'Test Quiz' }) },
        question: { createMany: vi.fn().mockResolvedValue({ count: 3 }) },
      };

      await transactionCallback(mockTx);

      expect(mockTx.question.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            questionText: 'Question 1',
            imageId: 'img_123',
          }),
          expect.objectContaining({
            questionText: 'Question 2',
            imageId: null,
          }),
          expect.objectContaining({
            questionText: 'Question 3',
            imageId: 'img_456',
          }),
        ]),
      });

      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: '✅ Quiz Created Successfully',
            }),
          }),
        ]),
      });
    });

    it('should handle CSV without imageId column', async () => {
      interaction.options.getAttachment.mockReturnValue({
        name: 'test.csv',
        size: 1000,
        url: 'https://example.com/test.csv',
        contentType: 'text/csv',
      });

      (global.fetch as MockedFunction<any>).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('csv content'),
      });

      // Mock Papa Parse to return data without imageId
      mockPapa.parse.mockReturnValue({
        data: [
          {
            questionText: 'Question 1',
            options: '["A","B","C"]',
            correctAnswer: '0',
            points: '10',
            timeLimit: '30',
          },
          {
            questionText: 'Question 2',
            options: '["A","B","C"]',
            correctAnswer: '1',
            points: '10',
            timeLimit: '30',
          },
        ],
        errors: [],
      });

      // Should not call image validation since no imageIds present
      mockPrisma.image.findMany.mockResolvedValue([]);

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const mockQuiz = { id: 'quiz_123', title: 'Custom Quiz - testuser' };
        return await callback({
          user: {
            upsert: vi.fn().mockResolvedValue({ id: 'user1', username: 'testuser' }),
          },
          quiz: {
            create: vi.fn().mockResolvedValue(mockQuiz),
          },
          question: {
            createMany: vi.fn().mockResolvedValue({ count: 2 }),
          },
        });
      });

      await execute(interaction as any);

      // Image validation should not be called for CSV without imageId column
      expect(mockPrisma.image.findMany).not.toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: '✅ Quiz Created Successfully',
            }),
          }),
        ]),
      });
    });

    it('should prevent duplicate quiz creation', async () => {
      interaction.options.getAttachment.mockReturnValue({
        name: 'test.csv',
        size: 1000,
        url: 'https://example.com/test.csv',
        contentType: 'text/csv',
      });

      (global.fetch as MockedFunction<any>).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('csv content'),
      });

      mockPapa.parse.mockReturnValue({
        data: [
          {
            questionText: 'Question 1',
            options: '["A","B","C"]',
            correctAnswer: '0',
            points: '10',
            timeLimit: '30',
          },
        ],
        errors: [],
      });

      // Mock that a quiz already exists for this interaction (override the beforeEach setting)
      mockPrisma.quiz.findFirst.mockResolvedValueOnce({
        id: 'quiz_interaction_123_existing',
        title: 'Existing Quiz',
      });

      await execute(interaction as any);

      // Should check for existing quiz
      expect(mockPrisma.quiz.findFirst).toHaveBeenCalledWith({
        where: {
          id: {
            startsWith: 'quiz_interaction_123_',
          },
        },
      });

      // Should not create new quiz
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();

      // Should return existing quiz message
      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: '✅ Quiz Already Created',
            }),
          }),
        ]),
      });
    });
  });

  describe('generate subcommand with tags', () => {
    beforeEach(() => {
      interaction.options.getSubcommand.mockReturnValue('generate');
      interaction.options.getString.mockImplementation((name: string) => {
        switch (name) {
          case 'from-corpus':
            return 'test-corpus';
          case 'quiz-title':
            return 'Generated Quiz';
          default:
            return null;
        }
      });
      interaction.options.getInteger.mockImplementation((name: string) => {
        switch (name) {
          case 'num-questions':
            return 2;
          case 'num-choices':
            return 4;
          default:
            return null;
        }
      });
      interaction.options.getBoolean.mockReturnValue(false);
    });

    it('should use entire corpus for untagged entries', async () => {
      // Mock corpus with mixed tagged and untagged entries
      const mockCorpus = {
        id: 'corpus_123',
        title: 'test-corpus',
        entries: [
          {
            id: 'entry_1',
            tags: [], // No tags
            questionVariants: ['What is 2+2?'],
            answerVariants: ['4'],
            hintTitles: [],
            hintVariants: {},
          },
          {
            id: 'entry_2',
            tags: ['europe', 'geography'],
            questionVariants: ['Capital of France?'],
            answerVariants: ['Paris'],
            hintTitles: [],
            hintVariants: {},
          },
          {
            id: 'entry_3',
            tags: ['europe', 'geography'],
            questionVariants: ['Capital of Italy?'],
            answerVariants: ['Rome'],
            hintTitles: [],
            hintVariants: {},
          },
          {
            id: 'entry_4',
            tags: ['math', 'arithmetic'],
            questionVariants: ['What is 5+5?'],
            answerVariants: ['10'],
            hintTitles: [],
            hintVariants: {},
          },
        ],
      };

      mockPrisma.corpus.findUnique.mockResolvedValue(mockCorpus);
      mockPrisma.quiz.findFirst.mockResolvedValue(null);

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return await callback({
          user: { upsert: vi.fn().mockResolvedValue({ id: 'user1', username: 'testuser' }) },
          quiz: { create: vi.fn().mockResolvedValue({ id: 'quiz_123' }) },
          question: { create: vi.fn().mockResolvedValue({ id: 'question_123' }) },
          hint: { createMany: vi.fn() },
        });
      });

      await execute(interaction as any);

      expect(mockPrisma.corpus.findUnique).toHaveBeenCalledWith({
        where: { title: 'test-corpus' },
        include: { entries: true },
      });

      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: '✅ Quiz Generated Successfully',
            }),
          }),
        ]),
      });
    });

    it('should filter distractors by tag intersection for tagged entries', async () => {
      const mockCorpus = {
        id: 'corpus_123',
        title: 'test-corpus',
        entries: [
          {
            id: 'entry_1',
            tags: ['europe', 'geography'],
            questionVariants: ['Capital of France?'],
            answerVariants: ['Paris'],
            hintTitles: [],
            hintVariants: {},
          },
          {
            id: 'entry_2',
            tags: ['europe', 'geography'],
            questionVariants: ['Capital of Italy?'],
            answerVariants: ['Rome'],
            hintTitles: [],
            hintVariants: {},
          },
          {
            id: 'entry_3',
            tags: ['asia', 'geography'],
            questionVariants: ['Capital of Japan?'],
            answerVariants: ['Tokyo'],
            hintTitles: [],
            hintVariants: {},
          },
          {
            id: 'entry_4',
            tags: ['math', 'arithmetic'],
            questionVariants: ['What is 2+2?'],
            answerVariants: ['4'],
            hintTitles: [],
            hintVariants: {},
          },
        ],
      };

      mockPrisma.corpus.findUnique.mockResolvedValue(mockCorpus);
      mockPrisma.quiz.findFirst.mockResolvedValue(null);

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return await callback({
          user: { upsert: vi.fn().mockResolvedValue({ id: 'user1', username: 'testuser' }) },
          quiz: { create: vi.fn().mockResolvedValue({ id: 'quiz_123' }) },
          question: { create: vi.fn().mockResolvedValue({ id: 'question_123' }) },
          hint: { createMany: vi.fn() },
        });
      });

      await execute(interaction as any);

      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: '✅ Quiz Generated Successfully',
            }),
          }),
        ]),
      });
    });

    it('should fallback to entire corpus when insufficient tagged matches', async () => {
      const mockCorpus = {
        id: 'corpus_123',
        title: 'test-corpus',
        entries: [
          {
            id: 'entry_1',
            tags: ['rare-tag'],
            questionVariants: ['Unique question?'],
            answerVariants: ['Unique answer'],
            hintTitles: [],
            hintVariants: {},
          },
          {
            id: 'entry_2',
            tags: ['common', 'tag'],
            questionVariants: ['Common question 1?'],
            answerVariants: ['Answer 1'],
            hintTitles: [],
            hintVariants: {},
          },
          {
            id: 'entry_3',
            tags: ['common', 'tag'],
            questionVariants: ['Common question 2?'],
            answerVariants: ['Answer 2'],
            hintTitles: [],
            hintVariants: {},
          },
          {
            id: 'entry_4',
            tags: ['common', 'tag'],
            questionVariants: ['Common question 3?'],
            answerVariants: ['Answer 3'],
            hintTitles: [],
            hintVariants: {},
          },
        ],
      };

      // Request 4 choices but rare-tag entry only has itself
      interaction.options.getInteger.mockImplementation((name: string) => {
        switch (name) {
          case 'num-questions':
            return 1;
          case 'num-choices':
            return 4; // Need 3 distractors
          default:
            return null;
        }
      });

      mockPrisma.corpus.findUnique.mockResolvedValue(mockCorpus);
      mockPrisma.quiz.findFirst.mockResolvedValue(null);

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return await callback({
          user: { upsert: vi.fn().mockResolvedValue({ id: 'user1', username: 'testuser' }) },
          quiz: { create: vi.fn().mockResolvedValue({ id: 'quiz_123' }) },
          question: { create: vi.fn().mockResolvedValue({ id: 'question_123' }) },
          hint: { createMany: vi.fn() },
        });
      });

      await execute(interaction as any);

      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: '✅ Quiz Generated Successfully',
            }),
          }),
        ]),
      });
    });

    it('should handle corpus not found', async () => {
      mockPrisma.corpus.findUnique.mockResolvedValue(null);

      await execute(interaction as any);

      expect(interaction.editReply).toHaveBeenCalledWith(
        '❌ Corpus "test-corpus" not found. Please check the corpus title.'
      );
    });

    it('should handle corpus with no entries', async () => {
      const mockCorpus = {
        id: 'corpus_123',
        title: 'test-corpus',
        entries: [],
      };

      mockPrisma.corpus.findUnique.mockResolvedValue(mockCorpus);

      await execute(interaction as any);

      expect(interaction.editReply).toHaveBeenCalledWith(
        '❌ Corpus "test-corpus" has no entries. Please upload corpus data first.'
      );
    });

    it('should handle insufficient entries for questions', async () => {
      const mockCorpus = {
        id: 'corpus_123',
        title: 'test-corpus',
        entries: [
          {
            id: 'entry_1',
            tags: ['tag'],
            questionVariants: ['Question?'],
            answerVariants: ['Answer'],
            hintTitles: [],
            hintVariants: {},
          },
        ],
      };

      // Request 2 questions but only have 1 entry
      interaction.options.getInteger.mockImplementation((name: string) => {
        switch (name) {
          case 'num-questions':
            return 2;
          case 'num-choices':
            return 4;
          default:
            return null;
        }
      });

      mockPrisma.corpus.findUnique.mockResolvedValue(mockCorpus);

      await execute(interaction as any);

      expect(interaction.editReply).toHaveBeenCalledWith(
        '❌ Not enough entries in corpus. Requested 2 questions but corpus only has 1 entries.'
      );
    });

    it('should handle insufficient entries for answer choices', async () => {
      const mockCorpus = {
        id: 'corpus_123',
        title: 'test-corpus',
        entries: [
          {
            id: 'entry_1',
            tags: ['tag'],
            questionVariants: ['Question?'],
            answerVariants: ['Answer'],
            hintTitles: [],
            hintVariants: {},
          },
        ],
      };

      // Request 4 choices but only have 1 entry
      interaction.options.getInteger.mockImplementation((name: string) => {
        switch (name) {
          case 'num-questions':
            return 1;
          case 'num-choices':
            return 4; // Need 4 total entries for 4 choices
          default:
            return null;
        }
      });

      mockPrisma.corpus.findUnique.mockResolvedValue(mockCorpus);

      await execute(interaction as any);

      expect(interaction.editReply).toHaveBeenCalledWith(
        '❌ Not enough entries for 4 answer choices. Corpus has only 1 entries. Need at least 4 entries.'
      );
    });
  });

  describe('question edit subcommand', () => {
    beforeEach(() => {
      interaction.options.getSubcommandGroup.mockReturnValue('question');
      interaction.options.getSubcommand.mockReturnValue('edit');
    });

    it('should show modal for editing question when user has permission', async () => {
      const { canManageQuiz, hasAdminPrivileges } = await import('../../app/utils/permissions');

      interaction.options.getString.mockReturnValue('question123');

      const mockQuestion = {
        id: 'question123',
        questionText: 'What is the capital of France?',
        options: JSON.stringify(['London', 'Berlin', 'Paris', 'Madrid']),
        correctAnswer: 2,
        points: 10,
        timeLimit: 30,
        quiz: {
          id: 'quiz123',
          title: 'Geography Quiz',
          quizOwnerId: 'user1',
        },
      };

      mockPrisma.question.findUnique.mockResolvedValue(mockQuestion);
      (canManageQuiz as any).mockReturnValue(true);
      (hasAdminPrivileges as any).mockReturnValue(false);

      await execute(interaction as any);

      expect(mockPrisma.question.findUnique).toHaveBeenCalledWith({
        where: { id: 'question123' },
        include: { quiz: true },
      });
      expect(mockShowModal).toHaveBeenCalled();
    });

    it('should reject if question not found', async () => {
      interaction.options.getString.mockReturnValue('nonexistent');
      mockPrisma.question.findUnique.mockResolvedValue(null);

      await execute(interaction as any);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: '❌ Question not found.',
        ephemeral: true,
      });
    });

    it('should reject if user cannot manage quiz', async () => {
      const { canManageQuiz, hasAdminPrivileges } = await import('../../app/utils/permissions');

      interaction.options.getString.mockReturnValue('question123');

      const mockQuestion = {
        id: 'question123',
        questionText: 'What is the capital of France?',
        options: JSON.stringify(['London', 'Berlin', 'Paris', 'Madrid']),
        correctAnswer: 2,
        points: 10,
        timeLimit: 30,
        quiz: {
          id: 'quiz123',
          title: 'Geography Quiz',
          quizOwnerId: 'different_user',
        },
      };

      mockPrisma.question.findUnique.mockResolvedValue(mockQuestion);
      (canManageQuiz as any).mockReturnValue(false);
      (hasAdminPrivileges as any).mockReturnValue(false);

      await execute(interaction as any);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: '❌ You can only edit questions in quizzes you own or have admin privileges for.',
        ephemeral: true,
      });
    });
  });

  describe('question delete subcommand', () => {
    beforeEach(() => {
      interaction.options.getSubcommandGroup.mockReturnValue('question');
      interaction.options.getSubcommand.mockReturnValue('delete');
    });

    it('should delete question and related data when user has permission', async () => {
      const { canManageQuiz, hasAdminPrivileges } = await import('../../app/utils/permissions');

      interaction.options.getString.mockReturnValue('question123');

      const mockQuestion = {
        id: 'question123',
        questionText: 'What is the capital of France?',
        options: JSON.stringify(['London', 'Berlin', 'Paris', 'Madrid']),
        correctAnswer: 2,
        points: 10,
        timeLimit: 30,
        quiz: {
          id: 'quiz123',
          title: 'Geography Quiz',
          quizOwnerId: 'user1',
        },
        hints: [{ id: 'hint1' }, { id: 'hint2' }],
        attempts: [{ id: 'attempt1' }],
      };

      mockPrisma.question.findUnique.mockResolvedValue(mockQuestion);
      (canManageQuiz as any).mockReturnValue(true);
      (hasAdminPrivileges as any).mockReturnValue(false);

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return await callback({
          questionAttempt: { deleteMany: vi.fn() },
          hint: { deleteMany: vi.fn() },
          question: { delete: vi.fn() },
        });
      });

      await execute(interaction as any);

      expect(mockPrisma.question.findUnique).toHaveBeenCalledWith({
        where: { id: 'question123' },
        include: {
          quiz: true,
          hints: true,
          attempts: true,
        },
      });
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: '✅ Question Deleted Successfully',
            }),
          }),
        ]),
      });
    });

    it('should reject if question not found', async () => {
      interaction.options.getString.mockReturnValue('nonexistent');
      mockPrisma.question.findUnique.mockResolvedValue(null);

      await execute(interaction as any);

      expect(interaction.editReply).toHaveBeenCalledWith('❌ Question not found.');
    });

    it('should reject if user cannot manage quiz', async () => {
      const { canManageQuiz, hasAdminPrivileges } = await import('../../app/utils/permissions');

      interaction.options.getString.mockReturnValue('question123');

      const mockQuestion = {
        id: 'question123',
        questionText: 'What is the capital of France?',
        quiz: {
          id: 'quiz123',
          title: 'Geography Quiz',
          quizOwnerId: 'different_user',
        },
        hints: [],
        attempts: [],
      };

      mockPrisma.question.findUnique.mockResolvedValue(mockQuestion);
      (canManageQuiz as any).mockReturnValue(false);
      (hasAdminPrivileges as any).mockReturnValue(false);

      await execute(interaction as any);

      expect(interaction.editReply).toHaveBeenCalledWith(
        '❌ You can only delete questions from quizzes you own or have admin privileges for.'
      );
    });
  });

  describe('question list subcommand', () => {
    beforeEach(() => {
      interaction.options.getSubcommandGroup.mockReturnValue('question');
      interaction.options.getSubcommand.mockReturnValue('list');
    });

    it('should list all questions in a quiz', async () => {
      interaction.options.getString.mockReturnValue('quiz123');

      const mockQuiz = {
        id: 'quiz123',
        title: 'Geography Quiz',
        questions: [
          {
            id: 'question1',
            questionText: 'What is the capital of France?',
            options: JSON.stringify(['London', 'Berlin', 'Paris', 'Madrid']),
            correctAnswer: 2,
            points: 10,
            hints: [{ id: 'hint1' }, { id: 'hint2' }],
          },
          {
            id: 'question2',
            questionText: 'What is the capital of Italy?',
            options: JSON.stringify(['Rome', 'Milan', 'Naples', 'Turin']),
            correctAnswer: 0,
            points: 15,
            hints: [],
          },
        ],
      };

      mockPrisma.quiz.findUnique.mockResolvedValue(mockQuiz);

      await execute(interaction as any);

      expect(mockPrisma.quiz.findUnique).toHaveBeenCalledWith({
        where: { id: 'quiz123' },
        include: {
          questions: {
            include: {
              hints: true,
            },
            orderBy: { id: 'asc' },
          },
        },
      });
      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: '📝 Questions in "Geography Quiz"',
            }),
          }),
        ]),
      });
    });

    it('should handle quiz not found', async () => {
      interaction.options.getString.mockReturnValue('nonexistent');
      mockPrisma.quiz.findUnique.mockResolvedValue(null);

      await execute(interaction as any);

      expect(interaction.editReply).toHaveBeenCalledWith('❌ Quiz not found.');
    });

    it('should handle quiz with no questions', async () => {
      interaction.options.getString.mockReturnValue('quiz123');

      const mockQuiz = {
        id: 'quiz123',
        title: 'Empty Quiz',
        questions: [],
      };

      mockPrisma.quiz.findUnique.mockResolvedValue(mockQuiz);

      await execute(interaction as any);

      expect(interaction.editReply).toHaveBeenCalledWith('❌ This quiz has no questions.');
    });
  });

  describe('reply pattern verification', () => {
    it('should use deferReply for non-modal subcommands like stop', async () => {
      const { quizService } = await import('../../app/services/QuizService');
      (quizService.getActiveSessionByChannel as any).mockReturnValue(null);

      interaction.options.getSubcommand.mockReturnValue('stop');

      await execute(interaction as any);

      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      expect(interaction.editReply).toHaveBeenCalledWith(
        'There is no active quiz in this channel.'
      );
    });

    it('should use deferReply for template subcommand', async () => {
      interaction.options.getSubcommand.mockReturnValue('template');

      await execute(interaction as any);

      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      expect(interaction.editReply).toHaveBeenCalled();
    });

    it('should NOT use deferReply for modal commands like create', async () => {
      interaction.options.getSubcommand.mockReturnValue('create');
      mockShowModal.mockRejectedValue(new Error('Modal error'));

      await execute(interaction as any);

      expect(interaction.deferReply).not.toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalledWith({
        content: '❌ Error creating quiz form.',
        ephemeral: true,
      });
    });

    it('should NOT use deferReply for question edit modal command', async () => {
      interaction.options.getSubcommandGroup.mockReturnValue('question');
      interaction.options.getSubcommand.mockReturnValue('edit');
      interaction.options.getString.mockReturnValue('question123');
      mockPrisma.question.findUnique.mockResolvedValue(null);

      await execute(interaction as any);

      expect(interaction.deferReply).not.toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalledWith({
        content: '❌ Question not found.',
        ephemeral: true,
      });
    });
  });
});
