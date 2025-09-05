import { vi } from 'vitest';
import { execute } from '../../app/commands/question';
import { databaseService } from '../../app/services/DatabaseService';

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
      quiz: { findUnique: vi.fn() },
      question: { findUnique: vi.fn() },
      hint: {
        count: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        findUnique: vi.fn(),
        delete: vi.fn(),
      },
    },
  },
}));

vi.mock('../../app/utils/permissions', () => ({
  canManageQuiz: vi.fn(),
  hasAdminPrivileges: vi.fn(),
}));

vi.mock('discord.js', async () => {
  const actual = await vi.importActual('discord.js');
  return {
    ...actual,
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

describe('Edit Question Add Hint Command', () => {
  let interaction: any;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = databaseService.prisma;
    vi.clearAllMocks();

    interaction = {
      isChatInputCommand: vi.fn().mockReturnValue(true),
      deferReply: vi.fn(),
      editReply: vi.fn(),
      reply: vi.fn(),
      options: {
        getSubcommand: vi.fn().mockReturnValue('add'),
        getSubcommandGroup: vi.fn().mockReturnValue('hint'),
        getString: vi.fn(),
        getInteger: vi.fn(),
      },
      guild: { id: 'test-guild', name: 'Test Guild' },
      channel: {
        id: 'test-channel',
        isDMBased: vi.fn().mockReturnValue(false),
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

describe('Hint Edit Command', () => {
  let interaction: any;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = databaseService.prisma;
    vi.clearAllMocks();

    interaction = {
      isChatInputCommand: vi.fn().mockReturnValue(true),
      reply: vi.fn(),
      showModal: vi.fn(),
      options: {
        getSubcommandGroup: vi.fn().mockReturnValue('hint'),
        getSubcommand: vi.fn().mockReturnValue('edit'),
        getString: vi.fn(),
      },
      guild: { id: 'test-guild', name: 'Test Guild' },
      channel: {
        id: 'test-channel',
        isDMBased: vi.fn().mockReturnValue(false),
      },
      user: {
        id: 'user123',
        tag: 'testuser#1234',
      },
    };
  });

  it('should show modal for editing hint when user has permission', async () => {
    const { canManageQuiz, hasAdminPrivileges } = await import('../../app/utils/permissions');

    interaction.options.getString.mockReturnValue('hint123');

    const mockHint = {
      id: 'hint123',
      title: 'Grammar Tip',
      text: 'Remember to use correct conjugation',
      question: {
        id: 'question123',
        quiz: {
          id: 'quiz123',
          title: 'Test Quiz',
          quizOwnerId: 'user123',
        },
      },
    };

    mockPrisma.hint.findUnique.mockResolvedValue(mockHint);
    (canManageQuiz as any).mockReturnValue(true);
    (hasAdminPrivileges as any).mockReturnValue(false);

    await execute(interaction);

    expect(mockPrisma.hint.findUnique).toHaveBeenCalledWith({
      where: { id: 'hint123' },
      include: {
        question: {
          include: {
            quiz: true,
          },
        },
      },
    });
    expect(interaction.showModal).toHaveBeenCalled();
  });

  it('should reject if hint not found', async () => {
    interaction.options.getString.mockReturnValue('nonexistent');
    mockPrisma.hint.findUnique.mockResolvedValue(null);

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '❌ Hint not found.',
      ephemeral: true,
    });
  });

  it('should reject if user cannot manage quiz', async () => {
    interaction.options.getString.mockReturnValue('hint123');

    const mockHint = {
      id: 'hint123',
      title: 'Grammar Tip',
      text: 'Remember to use correct conjugation',
      question: {
        id: 'question123',
        quiz: {
          id: 'quiz123',
          title: 'Test Quiz',
          quizOwnerId: 'different_user',
        },
      },
    };

    mockPrisma.hint.findUnique.mockResolvedValue(mockHint);
    const { canManageQuiz, hasAdminPrivileges } = await import('../../app/utils/permissions');
    (canManageQuiz as any).mockReturnValue(false);
    (hasAdminPrivileges as any).mockReturnValue(false);

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '❌ You can only edit hints in quizzes you own or have admin privileges for.',
      ephemeral: true,
    });
  });
});

describe('Hint Delete Command', () => {
  let interaction: any;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = databaseService.prisma;
    vi.clearAllMocks();

    interaction = {
      isChatInputCommand: vi.fn().mockReturnValue(true),
      deferReply: vi.fn(),
      editReply: vi.fn(),
      options: {
        getSubcommandGroup: vi.fn().mockReturnValue('hint'),
        getSubcommand: vi.fn().mockReturnValue('delete'),
        getString: vi.fn(),
      },
      guild: { id: 'test-guild', name: 'Test Guild' },
      channel: {
        id: 'test-channel',
        isDMBased: vi.fn().mockReturnValue(false),
      },
      user: {
        id: 'user123',
        tag: 'testuser#1234',
      },
    };
  });

  it('should delete hint when user has permission', async () => {
    const { canManageQuiz, hasAdminPrivileges } = await import('../../app/utils/permissions');

    interaction.options.getString.mockReturnValue('hint123');

    const mockHint = {
      id: 'hint123',
      title: 'Grammar Tip',
      text: 'Remember to use correct conjugation',
      question: {
        id: 'question123',
        questionText: 'What is the past tense of go?',
        quiz: {
          id: 'quiz123',
          title: 'Test Quiz',
          quizOwnerId: 'user123',
        },
      },
    };

    mockPrisma.hint.findUnique.mockResolvedValue(mockHint);
    mockPrisma.hint.delete.mockResolvedValue(mockHint);
    (canManageQuiz as any).mockReturnValue(true);
    (hasAdminPrivileges as any).mockReturnValue(false);

    await execute(interaction);

    expect(mockPrisma.hint.findUnique).toHaveBeenCalledWith({
      where: { id: 'hint123' },
      include: {
        question: {
          include: {
            quiz: true,
          },
        },
      },
    });
    expect(mockPrisma.hint.delete).toHaveBeenCalledWith({
      where: { id: 'hint123' },
    });
    expect(interaction.editReply).toHaveBeenCalledWith({
      embeds: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            title: '✅ Hint Deleted Successfully',
          }),
        }),
      ]),
    });
  });

  it('should reject if hint not found', async () => {
    interaction.options.getString.mockReturnValue('nonexistent');
    mockPrisma.hint.findUnique.mockResolvedValue(null);

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith('❌ Hint not found.');
  });

  it('should reject if user cannot manage quiz', async () => {
    interaction.options.getString.mockReturnValue('hint123');

    const mockHint = {
      id: 'hint123',
      title: 'Grammar Tip',
      text: 'Remember to use correct conjugation',
      question: {
        id: 'question123',
        quiz: {
          id: 'quiz123',
          title: 'Test Quiz',
          quizOwnerId: 'different_user',
        },
      },
    };

    mockPrisma.hint.findUnique.mockResolvedValue(mockHint);
    const { canManageQuiz, hasAdminPrivileges } = await import('../../app/utils/permissions');
    (canManageQuiz as any).mockReturnValue(false);
    (hasAdminPrivileges as any).mockReturnValue(false);

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      '❌ You can only delete hints from quizzes you own or have admin privileges for.'
    );
  });
});

describe('Hint List Command', () => {
  let interaction: any;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = databaseService.prisma;
    vi.clearAllMocks();

    interaction = {
      isChatInputCommand: vi.fn().mockReturnValue(true),
      deferReply: vi.fn(),
      editReply: vi.fn(),
      options: {
        getSubcommandGroup: vi.fn().mockReturnValue('hint'),
        getSubcommand: vi.fn().mockReturnValue('list'),
        getString: vi.fn(),
      },
      guild: { id: 'test-guild', name: 'Test Guild' },
      channel: {
        id: 'test-channel',
        isDMBased: vi.fn().mockReturnValue(false),
      },
      user: {
        id: 'user123',
        tag: 'testuser#1234',
      },
    };
  });

  it('should list all hints for a question', async () => {
    interaction.options.getString.mockReturnValue('question123');

    const mockQuestion = {
      id: 'question123',
      questionText: 'What is the past tense of go?',
      quiz: {
        id: 'quiz123',
        title: 'Test Quiz',
      },
      hints: [
        {
          id: 'hint1',
          title: 'Grammar Tip',
          text: 'Past tense follows regular pattern',
          createdAt: new Date(),
        },
        {
          id: 'hint2',
          title: 'Example',
          text: 'I went to the store',
          createdAt: new Date(),
        },
      ],
    };

    mockPrisma.question.findUnique.mockResolvedValue(mockQuestion);

    await execute(interaction);

    expect(mockPrisma.question.findUnique).toHaveBeenCalledWith({
      where: { id: 'question123' },
      include: {
        quiz: true,
        hints: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    expect(interaction.editReply).toHaveBeenCalledWith({
      embeds: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            title: '💡 Hints for Question',
          }),
        }),
      ]),
    });
  });

  it('should handle question not found', async () => {
    interaction.options.getString.mockReturnValue('nonexistent');
    mockPrisma.question.findUnique.mockResolvedValue(null);

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith('❌ Question not found.');
  });

  it('should handle question with no hints', async () => {
    interaction.options.getString.mockReturnValue('question123');

    const mockQuestion = {
      id: 'question123',
      questionText: 'What is the past tense of go?',
      quiz: {
        id: 'quiz123',
        title: 'Test Quiz',
      },
      hints: [],
    };

    mockPrisma.question.findUnique.mockResolvedValue(mockQuestion);

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({
      embeds: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            title: '📋 No Hints Found',
          }),
        }),
      ]),
    });
  });
});
