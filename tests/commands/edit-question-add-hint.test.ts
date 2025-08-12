import { vi } from 'vitest';
import { execute } from '../../app/commands/quiz/edit-question-add-hint';

vi.mock('@/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@/services/DatabaseService', () => ({
  databaseService: {
    prisma: {
      quiz: { findUnique: vi.fn() },
      hint: { count: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    },
  },
}));

describe('Edit Question Add Hint Command', () => {
  let interaction: any;
  let mockPrisma: any;

  beforeEach(async () => {
    const { databaseService } = await import('../../app/services/DatabaseService');
    mockPrisma = databaseService.prisma;
    vi.clearAllMocks();

    interaction = {
      deferReply: vi.fn(),
      editReply: vi.fn(),
      options: {
        getString: vi.fn(),
        getInteger: vi.fn(),
      },
      user: {
        id: 'user123',
        tag: 'testuser#1234',
      },
    };
  });

  it('should successfully add a hint to a question', async () => {
    // Mock interaction options
    interaction.options.getString.mockImplementation((option: string) => {
      switch (option) {
        case 'quiz-id':
          return 'quiz123';
        case 'hint-title':
          return 'Grammar Tip';
        case 'hint-text':
          return 'Remember to use the correct conjugation';
        default:
          return null;
      }
    });
    interaction.options.getInteger.mockReturnValue(1);

    // Mock database responses
    const mockQuiz = {
      id: 'quiz123',
      title: 'Test Quiz',
      quizOwnerId: 'user123',
      questions: [
        {
          id: 'question123',
          questionText: 'What is the past tense of "go"?',
        },
      ],
    };

    mockPrisma.quiz.findUnique.mockResolvedValue(mockQuiz);
    mockPrisma.hint.count.mockResolvedValue(0);
    mockPrisma.hint.findFirst.mockResolvedValue(null);
    mockPrisma.hint.create.mockResolvedValue({
      id: 'hint123',
      title: 'Grammar Tip',
      text: 'Remember to use the correct conjugation',
      questionId: 'question123',
    });

    await execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(mockPrisma.quiz.findUnique).toHaveBeenCalled();
    expect(mockPrisma.hint.create).toHaveBeenCalledWith({
      data: {
        questionId: 'question123',
        title: 'Grammar Tip',
        text: 'Remember to use the correct conjugation',
      },
    });
    expect(interaction.editReply).toHaveBeenCalledWith({
      embeds: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            title: '✅ Hint Added Successfully',
          }),
        }),
      ]),
    });
  });

  it('should reject if quiz not found', async () => {
    interaction.options.getString.mockImplementation((option: string) => {
      switch (option) {
        case 'quiz-id':
          return 'nonexistent';
        case 'hint-title':
          return 'Grammar Tip';
        case 'hint-text':
          return 'Remember to use the correct conjugation';
        default:
          return null;
      }
    });
    interaction.options.getInteger.mockReturnValue(1);

    mockPrisma.quiz.findUnique.mockResolvedValue(null);

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      '❌ Quiz not found. Please check the quiz ID.'
    );
  });

  it('should reject if user does not own the quiz', async () => {
    interaction.options.getString.mockImplementation((option: string) => {
      switch (option) {
        case 'quiz-id':
          return 'quiz123';
        case 'hint-title':
          return 'Grammar Tip';
        case 'hint-text':
          return 'Remember to use the correct conjugation';
        default:
          return null;
      }
    });
    interaction.options.getInteger.mockReturnValue(1);

    const mockQuiz = {
      id: 'quiz123',
      title: 'Test Quiz',
      quizOwnerId: 'different_user',
      questions: [
        {
          id: 'question123',
          questionText: 'What is the past tense of "go"?',
        },
      ],
    };

    mockPrisma.quiz.findUnique.mockResolvedValue(mockQuiz);

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      '❌ You can only add hints to quizzes you created.'
    );
  });

  it('should reject if question number is invalid', async () => {
    interaction.options.getString.mockImplementation((option: string) => {
      switch (option) {
        case 'quiz-id':
          return 'quiz123';
        case 'hint-title':
          return 'Grammar Tip';
        case 'hint-text':
          return 'Remember to use the correct conjugation';
        default:
          return null;
      }
    });
    interaction.options.getInteger.mockReturnValue(5); // Question 5 but quiz only has 1 question

    const mockQuiz = {
      id: 'quiz123',
      title: 'Test Quiz',
      quizOwnerId: 'user123',
      questions: [
        {
          id: 'question123',
          questionText: 'What is the past tense of "go"?',
        },
      ],
    };

    mockPrisma.quiz.findUnique.mockResolvedValue(mockQuiz);

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      '❌ Invalid question number. This quiz has 1 questions.'
    );
  });

  it('should reject if maximum hints limit is reached', async () => {
    interaction.options.getString.mockImplementation((option: string) => {
      switch (option) {
        case 'quiz-id':
          return 'quiz123';
        case 'hint-title':
          return 'Grammar Tip';
        case 'hint-text':
          return 'Remember to use the correct conjugation';
        default:
          return null;
      }
    });
    interaction.options.getInteger.mockReturnValue(1);

    const mockQuiz = {
      id: 'quiz123',
      title: 'Test Quiz',
      quizOwnerId: 'user123',
      questions: [
        {
          id: 'question123',
          questionText: 'What is the past tense of "go"?',
        },
      ],
    };

    mockPrisma.quiz.findUnique.mockResolvedValue(mockQuiz);
    mockPrisma.hint.count.mockResolvedValue(5); // Already at max

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      '❌ Maximum of 5 hints per question allowed. Please remove some hints before adding new ones.'
    );
  });
});
