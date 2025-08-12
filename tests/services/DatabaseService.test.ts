import { databaseService } from '../../src/services/DatabaseService';

// Mock Prisma
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    quiz: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    quizAttempt: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    questionAttempt: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    $queryRaw: vi.fn(),
  })),
}));

describe('DatabaseService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Replace the prisma instance with our mock
    (databaseService as any).prisma = {
      quiz: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      quizAttempt: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      questionAttempt: {
        findMany: vi.fn(),
        create: vi.fn(),
      },
      user: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      $transaction: vi.fn(),
      $connect: vi.fn(),
      $disconnect: vi.fn(),
      $queryRaw: vi.fn(),
    };
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = databaseService;
      const instance2 = databaseService;
      expect(instance1).toBe(instance2);
    });
  });

  describe('connect', () => {
    it('should connect to the database', async () => {
      (databaseService as any).prisma.$connect.mockResolvedValueOnce(true);

      await databaseService.connect();

      expect((databaseService as any).prisma.$connect).toHaveBeenCalledTimes(1);
    });

    it('should handle connection errors', async () => {
      const error = new Error('Connection failed');
      (databaseService as any).prisma.$connect.mockRejectedValueOnce(error);

      await expect(databaseService.connect()).rejects.toThrow('Connection failed');
    });
  });

  describe('disconnect', () => {
    it('should disconnect from the database', async () => {
      (databaseService as any).prisma.$disconnect.mockResolvedValueOnce(true);

      await databaseService.disconnect();

      expect((databaseService as any).prisma.$disconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('healthCheck', () => {
    it('should return true when database is connected', async () => {
      (databaseService as any).prisma.$queryRaw.mockResolvedValueOnce([{ test: 1 }]);

      const result = await databaseService.healthCheck();

      expect(result).toBe(true);
      expect((databaseService as any).prisma.$queryRaw).toHaveBeenCalled();
    });

    it('should return false when database connection fails', async () => {
      (databaseService as any).prisma.$queryRaw.mockRejectedValueOnce(
        new Error('Connection failed')
      );

      const result = await databaseService.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('user operations', () => {
    it('should create a user', async () => {
      const userData = { id: '123', username: 'testuser' };
      (databaseService as any).prisma.user.create.mockResolvedValueOnce(userData as any);

      const result = await databaseService.prisma.user.create({
        data: userData,
      });

      expect(result).toEqual(userData);
      expect((databaseService as any).prisma.user.create).toHaveBeenCalledWith({
        data: userData,
      });
    });

    it('should find a user by ID', async () => {
      const userData = { id: '123', username: 'testuser' };
      (databaseService as any).prisma.user.findUnique.mockResolvedValueOnce(userData as any);

      const result = await databaseService.prisma.user.findUnique({
        where: { id: '123' },
      });

      expect(result).toEqual(userData);
      expect((databaseService as any).prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: '123' },
      });
    });
  });

  describe('quiz operations', () => {
    it('should create a quiz', async () => {
      const quizData = {
        id: 'quiz123',
        title: 'Test Quiz',
        description: 'A test quiz',
        isActive: true,
        timeLimit: 300,
      };
      (databaseService as any).prisma.quiz.create.mockResolvedValueOnce(quizData as any);

      const result = await databaseService.prisma.quiz.create({
        data: quizData,
      });

      expect(result).toEqual(quizData);
      expect((databaseService as any).prisma.quiz.create).toHaveBeenCalledWith({
        data: quizData,
      });
    });

    it('should find quizzes with filters', async () => {
      const quizzes = [
        { id: 'quiz1', title: 'Quiz 1', isActive: true },
        { id: 'quiz2', title: 'Quiz 2', isActive: false },
      ];
      (databaseService as any).prisma.quiz.findMany.mockResolvedValueOnce(quizzes as any);

      const result = await databaseService.prisma.quiz.findMany({
        where: { isActive: true },
      });

      expect(result).toEqual(quizzes);
      expect((databaseService as any).prisma.quiz.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
      });
    });
  });

  describe('transaction operations', () => {
    it('should execute a transaction', async () => {
      const transactionResult = { success: true };
      (databaseService as any).prisma.$transaction.mockResolvedValueOnce(transactionResult);

      const result = await databaseService.prisma.$transaction(async () => {
        return { success: true };
      });

      expect(result).toEqual(transactionResult);
      expect((databaseService as any).prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should handle transaction errors', async () => {
      const error = new Error('Transaction failed');
      (databaseService as any).prisma.$transaction.mockRejectedValueOnce(error);

      await expect(
        databaseService.prisma.$transaction(async () => {
          throw error;
        })
      ).rejects.toThrow('Transaction failed');
    });
  });
});
