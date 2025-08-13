import { vi, type MockedFunction } from 'vitest';
import { execute } from '../../app/commands/quiz/upload-csv';

vi.mock('../../app/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('../../app/services/DatabaseService', () => ({
  databaseService: {
    prisma: {
      user: { upsert: vi.fn() },
      quiz: { create: vi.fn(), findFirst: vi.fn() },
      question: { createMany: vi.fn() },
      image: { findMany: vi.fn() },
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

describe('CSV Upload with Image Support', () => {
  let interaction: any;
  let mockPrisma: any;
  let mockPapa: any;

  beforeEach(async () => {
    const { databaseService } = await import('../../app/services/DatabaseService');
    const mockPapaImport = await import('papaparse');
    mockPrisma = databaseService.prisma;
    mockPapa = mockPapaImport.default || mockPapaImport;
    vi.clearAllMocks();

    // Mock the duplicate check to return null (no existing quiz)
    mockPrisma.quiz.findFirst.mockResolvedValue(null);

    interaction = {
      isChatInputCommand: vi.fn().mockReturnValue(true),
      options: {
        getString: vi.fn(),
        getAttachment: vi.fn(),
      },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
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

  it('should handle empty imageId values', async () => {
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

    // Mock Papa Parse to return data with empty imageIds
    mockPapa.parse.mockReturnValue({
      data: [
        {
          questionText: 'Question 1',
          options: '["A","B","C"]',
          correctAnswer: '0',
          points: '10',
          timeLimit: '30',
          imageId: '',
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
          imageId: '',
        },
      ],
      errors: [],
    });

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
          createMany: vi.fn().mockResolvedValue({ count: 3 }),
        },
      });
    });

    await execute(interaction as any);

    // Should not validate empty image IDs
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

  it('should handle image validation database errors', async () => {
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

    // Mock Papa Parse to return data with imageId
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
      ],
      errors: [],
    });

    mockPrisma.image.findMany.mockRejectedValue(new Error('Database error'));

    await execute(interaction as any);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('❌ Image validation failed')
    );
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
