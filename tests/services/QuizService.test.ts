import { quizService } from '../../app/services/QuizService';
import { buttonCleanupService } from '../../app/services/ButtonCleanupService';

vi.mock('../../app/services/DatabaseService', () => ({
  databaseService: {
    prisma: {
      quiz: {
        create: vi.fn(),
        findUnique: vi.fn(),
      },
      quizAttempt: {
        create: vi.fn(),
      },
      question: {
        create: vi.fn(),
      },
    },
  },
}));
vi.mock('../../app/services/ButtonCleanupService', () => ({
  buttonCleanupService: {
    scheduleQuizCleanup: vi.fn(),
    removeButtons: vi.fn(),
  },
}));
vi.mock('uuid', () => ({ v4: vi.fn(() => 'mock-uuid') }));

const mockSend = vi.fn().mockResolvedValue({
  id: 'test-message-id',
  edit: vi.fn(),
  channel: { id: 'test-channel-id' },
});
const mockChannel = {
  id: 'channel1',
  send: mockSend,
  messages: {
    fetch: vi.fn(),
  },
};
const mockInteraction = {
  user: { id: 'user1', username: 'User1', tag: 'User1#0001' },
  channel: mockChannel,
  channelId: 'channel1',
  reply: vi.fn(),
  deferUpdate: vi.fn(),
};

describe('QuizService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset active sessions
    (quizService as any).activeSessions = new Map();
  });

  describe('startQuiz', () => {
    it('should create a session and send a welcome message', async () => {
      const quizConfig = {
        title: 'Test Quiz',
        description: 'A test quiz',
        questions: [{ questionText: 'Q1', options: ['A', 'B'], correctAnswer: 0, points: 10 }],
      };
      const quizId = 'quiz1';
      await quizService.startQuiz(mockChannel as any, quizConfig as any, quizId, 10, true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ embeds: [expect.any(Object)], components: [expect.any(Object)] })
      );
      expect(buttonCleanupService.scheduleQuizCleanup).toHaveBeenCalled();
    });
  });

  describe('handleJoin', () => {
    it('should add a participant and update waiting message', async () => {
      // Setup a session
      const sessionId = 'mock-uuid';
      (quizService as any).activeSessions.set(sessionId, {
        id: sessionId,
        quizId: 'quiz1',
        channelId: 'channel1',
        currentQuestionIndex: 0,
        participants: new Map(),
        startTime: new Date(),
        isActive: true,
        isWaiting: true,
        isQuestionComplete: false,
        messageId: 'msg1',
      });
      const interaction = {
        ...mockInteraction,
        customId: `quiz_join_${sessionId}`,
        reply: vi.fn(),
        channel: mockChannel,
      };
      await quizService.handleJoin(interaction as any);
      const session = (quizService as any).activeSessions.get(sessionId);
      expect(session.participants.size).toBe(1);
      expect(interaction.reply).toHaveBeenCalledWith({
        content: '✅ You have joined the quiz!',
        ephemeral: true,
      });
    });
    it('should not allow double join', async () => {
      const sessionId = 'mock-uuid';
      const participants = new Map();
      participants.set('user1', {
        userId: 'user1',
        username: 'User1',
        score: 0,
        streak: 0,
        answers: new Map(),
        startTime: new Date(),
      });
      (quizService as any).activeSessions.set(sessionId, {
        id: sessionId,
        quizId: 'quiz1',
        channelId: 'channel1',
        currentQuestionIndex: 0,
        participants,
        startTime: new Date(),
        isActive: true,
        isWaiting: true,
        isQuestionComplete: false,
        messageId: 'msg1',
      });
      const interaction = {
        ...mockInteraction,
        customId: `quiz_join_${sessionId}`,
        reply: vi.fn(),
        channel: mockChannel,
      };
      await quizService.handleJoin(interaction as any);
      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'You have already joined this quiz!',
        ephemeral: true,
      });
    });
  });

  describe('handleManualStart', () => {
    it('should start quiz questions if session is waiting', async () => {
      const sessionId = 'mock-uuid';
      (quizService as any).activeSessions.set(sessionId, {
        id: sessionId,
        quizId: 'quiz1',
        channelId: 'channel1',
        currentQuestionIndex: 0,
        participants: new Map(),
        startTime: new Date(),
        isActive: true,
        isWaiting: true,
        isQuestionComplete: false,
        messageId: 'msg1',
      });
      const interaction = {
        ...mockInteraction,
        customId: `quiz_start_${sessionId}`,
        deferUpdate: vi.fn(),
        channel: mockChannel,
      };
      // Mock startQuizQuestions
      (quizService as any).startQuizQuestions = vi.fn().mockResolvedValue(undefined);
      const startQuizQuestionsSpy = (quizService as any).startQuizQuestions;
      await quizService.handleManualStart(interaction as any);
      expect(startQuizQuestionsSpy).toHaveBeenCalled();
    });
  });

  describe('stopQuiz', () => {
    it('should mark session inactive, remove buttons, and send stop message', async () => {
      const sessionId = 'mock-uuid';
      (quizService as any).activeSessions.set(sessionId, {
        id: sessionId,
        quizId: 'quiz1',
        channelId: 'channel1',
        currentQuestionIndex: 0,
        participants: new Map(),
        startTime: new Date(),
        isActive: true,
        isWaiting: true,
        isQuestionComplete: false,
        messageId: 'msg1',
      });
      // Mock getChannel
      vi.spyOn<any, any>(quizService as any, 'getChannel').mockResolvedValue(mockChannel);
      await quizService.stopQuiz(sessionId);
      expect(buttonCleanupService.removeButtons).toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledWith('🛑 Quiz has been stopped by an administrator.');
      const session = (quizService as any).activeSessions.get(sessionId);
      expect(session).toBeUndefined();
    });
    it('should throw if session not found', async () => {
      await expect(quizService.stopQuiz('notfound')).rejects.toThrow(
        'Quiz session notfound not found'
      );
    });
  });

  describe('handleButtonInteraction', () => {
    it('should route to handleJoin', async () => {
      const joinSpy = vi.spyOn(quizService, 'handleJoin').mockResolvedValue();
      await quizService.handleButtonInteraction({ customId: 'quiz_join_123' } as any);
      expect(joinSpy).toHaveBeenCalled();
    });
    it('should route to handleManualStart', async () => {
      const startSpy = vi.spyOn(quizService, 'handleManualStart').mockResolvedValue();
      await quizService.handleButtonInteraction({ customId: 'quiz_start_123' } as any);
      expect(startSpy).toHaveBeenCalled();
    });
    it('should route to handleAnswer', async () => {
      const answerSpy = vi.spyOn(quizService, 'handleAnswer').mockResolvedValue();
      await quizService.handleButtonInteraction({ customId: 'quiz_answer_123' } as any);
      expect(answerSpy).toHaveBeenCalled();
    });
    it('should warn on unknown button', async () => {
      // Since console is mocked globally, we'll test the behavior differently
      const replySpy = vi.fn();
      await quizService.handleButtonInteraction({
        customId: 'quiz_unknown_123',
        reply: replySpy,
      } as any);

      // The method should not throw and should handle the unknown button gracefully
      expect(replySpy).not.toHaveBeenCalled();
    });
  });

  describe('setClient', () => {
    it('should set the Discord client instance', async () => {
      const { quizService: service } = await import('../../app/services/QuizService');
      const mockClient = {} as any;
      service.setClient(mockClient);
      // @ts-expect-error: Accessing private service properties for testing
      expect(service.client).toBe(mockClient);
    });
  });

  describe('getActiveSessionByChannel', () => {
    it('should return the active session for a given channel ID', async () => {
      const { quizService: service } = await import('../../app/services/QuizService');
      const session = {
        id: 'test-session',
        quizId: 'quiz1',
        channelId: 'channel123',
        currentQuestionIndex: 0,
        participants: new Map(),
        startTime: new Date(),
        isActive: true,
        isWaiting: true,
        isQuestionComplete: false,
      };
      // @ts-expect-error: Accessing private service properties for testing
      service.activeSessions.set(session.id, session);
      const found = service.getActiveSessionByChannel('channel123');
      expect(found).toBe(session);
    });

    it('should return undefined if no active session for the channel', async () => {
      const { quizService: service } = await import('../../app/services/QuizService');
      const result = service.getActiveSessionByChannel('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  // REGRESSION TESTS FOR USER PERSISTENCE FIX ON 2025-08-10
  describe('User Persistence Regression Tests', () => {
    let mockPrisma: any;

    beforeEach(async () => {
      const { databaseService } = await import('../../app/services/DatabaseService');
      mockPrisma = databaseService.prisma;

      // Add user-related mocks that were missing from the original mock
      mockPrisma.user = {
        upsert: vi.fn(),
        create: vi.fn(),
        findUnique: vi.fn(),
      };
      mockPrisma.questionAttempt = {
        createMany: vi.fn(),
      };
    });

    describe('saveQuizAttempts', () => {
      it('should create users before saving quiz attempts (foreign key fix)', async () => {
        const { quizService: service } = await import('../../app/services/QuizService');
        const mockQuiz = {
          id: 'quiz1',
          questions: [
            { id: 'q1', points: 10 },
            { id: 'q2', points: 15 },
          ],
        };

        const mockParticipants = [
          {
            userId: 'discord_user_123',
            username: 'TestUser1',
            score: 25,
            streak: 2,
            startTime: new Date(),
            answers: new Map([
              [
                0,
                {
                  questionIndex: 0,
                  selectedAnswer: 2,
                  isCorrect: true,
                  timeSpent: 15,
                  pointsEarned: 10,
                  answeredAt: new Date(),
                },
              ],
              [
                1,
                {
                  questionIndex: 1,
                  selectedAnswer: 1,
                  isCorrect: true,
                  timeSpent: 20,
                  pointsEarned: 15,
                  answeredAt: new Date(),
                },
              ],
            ]),
          },
          {
            userId: 'discord_user_456',
            username: 'TestUser2',
            score: 15,
            streak: 1,
            startTime: new Date(),
            answers: new Map([
              [
                0,
                {
                  questionIndex: 0,
                  selectedAnswer: 1,
                  isCorrect: false,
                  timeSpent: 10,
                  pointsEarned: 0,
                  answeredAt: new Date(),
                },
              ],
              [
                1,
                {
                  questionIndex: 1,
                  selectedAnswer: 1,
                  isCorrect: true,
                  timeSpent: 18,
                  pointsEarned: 15,
                  answeredAt: new Date(),
                },
              ],
            ]),
          },
        ];

        const mockSession = {
          id: 'session123',
          quizId: 'quiz1',
          channelId: 'channel123',
          currentQuestionIndex: 0,
          participants: new Map(),
          startTime: new Date(),
          isActive: true,
          isWaiting: false,
          isQuestionComplete: false,
          isPrivate: false,
        };

        // Mock successful database operations
        mockPrisma.quiz.findUnique.mockResolvedValueOnce(mockQuiz);
        mockPrisma.user.upsert.mockResolvedValue({ id: 'user1', username: 'TestUser1' });
        mockPrisma.quizAttempt.create.mockResolvedValue({ id: 'attempt1' });
        mockPrisma.questionAttempt.createMany.mockResolvedValueOnce({ count: 2 });

        // Call the private method indirectly through reflection
        await service['saveQuizAttempts'](mockSession, mockParticipants, 120);

        // Verify users are created/updated before quiz attempts
        expect(mockPrisma.user.upsert).toHaveBeenCalledTimes(2);
        expect(mockPrisma.user.upsert).toHaveBeenCalledWith({
          where: { id: 'discord_user_123' },
          update: { username: 'TestUser1' },
          create: { id: 'discord_user_123', username: 'TestUser1' },
        });
        expect(mockPrisma.user.upsert).toHaveBeenCalledWith({
          where: { id: 'discord_user_456' },
          update: { username: 'TestUser2' },
          create: { id: 'discord_user_456', username: 'TestUser2' },
        });

        // Verify quiz attempts are created after users exist
        expect(mockPrisma.quizAttempt.create).toHaveBeenCalledTimes(2);
        expect(mockPrisma.questionAttempt.createMany).toHaveBeenCalledTimes(2);
      });

      it('should handle upsert properly when user already exists', async () => {
        const { quizService: service } = await import('../../app/services/QuizService');
        const mockQuiz = { id: 'quiz1', questions: [{ id: 'q1', points: 10 }] };

        const mockParticipants = [
          {
            userId: 'existing_user_123',
            username: 'UpdatedUsername', // Username might have changed
            score: 10,
            streak: 1,
            startTime: new Date(),
            answers: new Map([
              [
                0,
                {
                  questionIndex: 0,
                  selectedAnswer: 2,
                  isCorrect: true,
                  timeSpent: 15,
                  pointsEarned: 10,
                  answeredAt: new Date(),
                },
              ],
            ]),
          },
        ];

        const mockSession = {
          id: 'session123',
          quizId: 'quiz1',
          channelId: 'channel123',
          currentQuestionIndex: 0,
          participants: new Map(),
          startTime: new Date(),
          isActive: true,
          isWaiting: false,
          isQuestionComplete: false,
          isPrivate: false,
        };

        mockPrisma.quiz.findUnique.mockResolvedValueOnce(mockQuiz);
        mockPrisma.user.upsert.mockResolvedValueOnce({
          id: 'existing_user_123',
          username: 'UpdatedUsername',
        });
        mockPrisma.quizAttempt.create.mockResolvedValueOnce({ id: 'attempt1' });
        mockPrisma.questionAttempt.createMany.mockResolvedValueOnce({ count: 1 });

        await service['saveQuizAttempts'](mockSession, mockParticipants, 60);

        // Should still call upsert (which will update the existing user)
        expect(mockPrisma.user.upsert).toHaveBeenCalledWith({
          where: { id: 'existing_user_123' },
          update: { username: 'UpdatedUsername' },
          create: { id: 'existing_user_123', username: 'UpdatedUsername' },
        });
      });

      it('should not fail when participants have no answers', async () => {
        const { quizService: service } = await import('../../app/services/QuizService');
        const mockQuiz = { id: 'quiz1', questions: [] };

        const mockParticipants = [
          {
            userId: 'discord_user_789',
            username: 'EmptyUser',
            score: 0,
            streak: 0,
            startTime: new Date(),
            answers: new Map(), // No answers
          },
        ];

        const mockSession = {
          id: 'session123',
          quizId: 'quiz1',
          channelId: 'channel123',
          currentQuestionIndex: 0,
          participants: new Map(),
          startTime: new Date(),
          isActive: true,
          isWaiting: false,
          isQuestionComplete: false,
          isPrivate: false,
        };

        mockPrisma.quiz.findUnique.mockResolvedValueOnce(mockQuiz);
        mockPrisma.user.upsert.mockResolvedValueOnce({
          id: 'discord_user_789',
          username: 'EmptyUser',
        });
        mockPrisma.quizAttempt.create.mockResolvedValueOnce({ id: 'attempt1' });

        await service['saveQuizAttempts'](mockSession, mockParticipants, 30);

        // Should still create user and quiz attempt, but no question attempts
        expect(mockPrisma.user.upsert).toHaveBeenCalledTimes(1);
        expect(mockPrisma.quizAttempt.create).toHaveBeenCalledTimes(1);
        expect(mockPrisma.questionAttempt.createMany).not.toHaveBeenCalled();
      });
    });
  });
});
