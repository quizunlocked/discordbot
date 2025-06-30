import { quizService } from '../../src/services/QuizService';
import { buttonCleanupService } from '../../src/services/ButtonCleanupService';

jest.mock('../../src/services/DatabaseService', () => ({
  databaseService: {
    prisma: {
      quiz: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      quizAttempt: {
        create: jest.fn(),
      },
      question: {
        create: jest.fn(),
      },
    },
  },
}));
jest.mock('../../src/services/ButtonCleanupService', () => ({
  buttonCleanupService: {
    scheduleQuizCleanup: jest.fn(),
    removeButtons: jest.fn(),
  },
}));
jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-uuid') }));

const mockSend = jest.fn().mockResolvedValue({
  id: 'test-message-id',
  edit: jest.fn(),
  channel: { id: 'test-channel-id' },
});
const mockChannel = {
  id: 'channel1',
  send: mockSend,
  messages: {
    fetch: jest.fn(),
  },
};
const mockInteraction = {
  user: { id: 'user1', username: 'User1', tag: 'User1#0001' },
  channel: mockChannel,
  channelId: 'channel1',
  reply: jest.fn(),
  deferUpdate: jest.fn(),
};

describe('QuizService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset active sessions
    (quizService as any).activeSessions = new Map();
  });

  describe('startQuiz', () => {
    it('should create a session and send a welcome message', async () => {
      const quizConfig = {
        title: 'Test Quiz',
        description: 'A test quiz',
        questions: [
          { questionText: 'Q1', options: ['A', 'B'], correctAnswer: 0, points: 10 },
        ],
      };
      const quizId = 'quiz1';
      await quizService.startQuiz(mockChannel as any, quizConfig as any, quizId, 10, true);
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ embeds: [expect.any(Object)], components: [expect.any(Object)] }));
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
        reply: jest.fn(),
        channel: mockChannel,
      };
      await quizService.handleJoin(interaction as any);
      const session = (quizService as any).activeSessions.get(sessionId);
      expect(session.participants.size).toBe(1);
      expect(interaction.reply).toHaveBeenCalledWith({ content: '✅ You have joined the quiz!', ephemeral: true });
    });
    it('should not allow double join', async () => {
      const sessionId = 'mock-uuid';
      const participants = new Map();
      participants.set('user1', { userId: 'user1', username: 'User1', score: 0, streak: 0, answers: new Map(), startTime: new Date() });
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
        reply: jest.fn(),
        channel: mockChannel,
      };
      await quizService.handleJoin(interaction as any);
      expect(interaction.reply).toHaveBeenCalledWith({ content: 'You have already joined this quiz!', ephemeral: true });
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
        deferUpdate: jest.fn(),
        channel: mockChannel,
      };
      // Mock startQuizQuestions
      (quizService as any).startQuizQuestions = jest.fn().mockResolvedValue(undefined);
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
      jest.spyOn<any, any>(quizService as any, 'getChannel').mockResolvedValue(mockChannel);
      await quizService.stopQuiz(sessionId);
      expect(buttonCleanupService.removeButtons).toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledWith('🛑 Quiz has been stopped by an administrator.');
      const session = (quizService as any).activeSessions.get(sessionId);
      expect(session).toBeUndefined();
    });
    it('should throw if session not found', async () => {
      await expect(quizService.stopQuiz('notfound')).rejects.toThrow('Quiz session notfound not found');
    });
  });

  describe('handleButtonInteraction', () => {
    it('should route to handleJoin', async () => {
      const joinSpy = jest.spyOn(quizService, 'handleJoin').mockResolvedValue();
      await quizService.handleButtonInteraction({ customId: 'quiz_join_123' } as any);
      expect(joinSpy).toHaveBeenCalled();
    });
    it('should route to handleManualStart', async () => {
      const startSpy = jest.spyOn(quizService, 'handleManualStart').mockResolvedValue();
      await quizService.handleButtonInteraction({ customId: 'quiz_start_123' } as any);
      expect(startSpy).toHaveBeenCalled();
    });
    it('should route to handleAnswer', async () => {
      const answerSpy = jest.spyOn(quizService, 'handleAnswer').mockResolvedValue();
      await quizService.handleButtonInteraction({ customId: 'quiz_answer_123' } as any);
      expect(answerSpy).toHaveBeenCalled();
    });
    it('should warn on unknown button', async () => {
      // Since console is mocked globally, we'll test the behavior differently
      const replySpy = jest.fn();
      await quizService.handleButtonInteraction({ 
        customId: 'quiz_unknown_123', 
        reply: replySpy 
      } as any);
      
      // The method should not throw and should handle the unknown button gracefully
      expect(replySpy).not.toHaveBeenCalled();
    });
  });

  describe('setClient', () => {
    it('should set the Discord client instance', () => {
      const service = require('../../src/services/QuizService').quizService;
      const mockClient = {};
      service.setClient(mockClient);
      // @ts-ignore
      expect(service.client).toBe(mockClient);
    });
  });

  describe('getActiveSessionByChannel', () => {
    it('should return the active session for a given channel ID', () => {
      const service = require('../../src/services/QuizService').quizService;
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
      // @ts-ignore
      service.activeSessions.set(session.id, session);
      const found = service.getActiveSessionByChannel('channel123');
      expect(found).toBe(session);
    });

    it('should return undefined if no active session for the channel', () => {
      const service = require('../../src/services/QuizService').quizService;
      const result = service.getActiveSessionByChannel('nonexistent');
      expect(result).toBeUndefined();
    });
  });
}); 