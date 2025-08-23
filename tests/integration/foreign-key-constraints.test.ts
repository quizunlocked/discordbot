import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { databaseService } from '../../app/services/DatabaseService';

// Integration tests for foreign key constraints
// These tests use the actual database to verify FK relationships work correctly
describe('DatabaseService Foreign Key Constraints Integration', () => {
  let testQuizId: string;
  let testQuestionId: string;
  let testUserId: string;

  // Skip these tests if not in test environment or no database connection
  const shouldSkipTests = process.env['NODE_ENV'] !== 'test' || !process.env['DATABASE_URL'];

  beforeEach(async () => {
    if (shouldSkipTests) return;

    // Clean up any existing test data
    await cleanupTestData();

    // Create test data to establish foreign key relationships
    testUserId = 'test-user-fk-' + Date.now();

    // Create a test user
    await databaseService.prisma.user.create({
      data: {
        id: testUserId,
        username: 'test-user-fk',
        // Note: adjust these fields based on your actual User schema
      },
    });

    // Create a test quiz
    const quiz = await databaseService.prisma.quiz.create({
      data: {
        id: 'test-quiz-fk-' + Date.now(),
        title: 'Test Quiz FK',
        description: 'Test quiz for FK testing',
        quizOwnerId: testUserId,
        isActive: true,
      },
    });
    testQuizId = quiz.id;

    // Create a test question
    const question = await databaseService.prisma.question.create({
      data: {
        quizId: testQuizId,
        questionText: 'Test question for FK',
        options: JSON.stringify(['A', 'B', 'C', 'D']),
        correctAnswer: 0,
        points: 10,
      },
    });
    testQuestionId = question.id;
  });

  afterEach(async () => {
    if (shouldSkipTests) return;
    await cleanupTestData();
  });

  async function cleanupTestData() {
    // Clean up in reverse order of foreign key dependencies
    try {
      // Only clean up if we have test IDs (safety check)
      if (testQuestionId) {
        // Delete question attempts first (they reference questions through quizAttempt)
        await databaseService.prisma.questionAttempt.deleteMany({
          where: {
            questionId: testQuestionId,
          },
        });

        // Delete hints (they reference questions)
        await databaseService.prisma.hint.deleteMany({
          where: { questionId: testQuestionId },
        });
      }

      if (testQuizId) {
        // Delete quiz attempts (they reference users and quizzes)
        await databaseService.prisma.quizAttempt.deleteMany({
          where: {
            quizId: testQuizId,
          },
        });

        // Delete questions (they reference quizzes)
        await databaseService.prisma.question.deleteMany({
          where: { quizId: testQuizId },
        });
      }

      if (testUserId) {
        // Delete quizzes (they reference users)
        await databaseService.prisma.quiz.deleteMany({
          where: { quizOwnerId: testUserId },
        });
      }

      // Delete users last - use startsWith for safety
      await databaseService.prisma.user.deleteMany({
        where: { id: { startsWith: 'test-user-fk-' } },
      });
    } catch (error) {
      // Ignore cleanup errors in tests
      console.warn('Cleanup error:', error);
    }
  }

  describe('Foreign Key Violations', () => {
    it('should fail to delete quiz while questions exist', async () => {
      if (shouldSkipTests) {
        console.log('Skipping FK test - no test database configured');
        return;
      }

      await expect(
        databaseService.prisma.quiz.delete({
          where: { id: testQuizId },
        })
      ).rejects.toThrow();
    });

    it('should fail to delete question while hints exist', async () => {
      if (shouldSkipTests) {
        console.log('Skipping FK test - no test database configured');
        return;
      }

      // Create a hint that references the question
      await databaseService.prisma.hint.create({
        data: {
          questionId: testQuestionId,
          title: 'Test Hint',
          text: 'This is a test hint text',
        },
      });

      // Attempt to delete question should fail due to hint FK constraint
      await expect(
        databaseService.prisma.question.delete({
          where: { id: testQuestionId },
        })
      ).rejects.toThrow();
    });

    it('should fail to delete question while question attempts exist', async () => {
      if (shouldSkipTests) {
        console.log('Skipping FK test - no test database configured');
        return;
      }

      // Create a quiz attempt first
      const quizAttempt = await databaseService.prisma.quizAttempt.create({
        data: {
          userId: testUserId,
          quizId: testQuizId,
          startedAt: new Date(),
        },
      });

      // Create a question attempt that references the question
      await databaseService.prisma.questionAttempt.create({
        data: {
          questionId: testQuestionId,
          quizAttemptId: quizAttempt.id,
          selectedAnswer: 0,
          isCorrect: true,
          timeSpent: 5000,
          pointsEarned: 10,
        },
      });

      // Attempt to delete question should fail due to questionAttempt FK constraint
      await expect(
        databaseService.prisma.question.delete({
          where: { id: testQuestionId },
        })
      ).rejects.toThrow();
    });
  });

  describe('Safe Deletion Order - Admin Delete Everything', () => {
    it('should successfully delete all quiz data using correct deletion order', async () => {
      if (shouldSkipTests) {
        console.log('Skipping FK test - no test database configured');
        return;
      }

      // Create full quiz data with all relationships to test comprehensive deletion
      const quizAttempt = await databaseService.prisma.quizAttempt.create({
        data: {
          userId: testUserId,
          quizId: testQuizId,
          startedAt: new Date(),
          completedAt: new Date(),
          totalScore: 10,
          totalTime: 5000,
        },
      });

      await databaseService.prisma.questionAttempt.create({
        data: {
          questionId: testQuestionId,
          quizAttemptId: quizAttempt.id,
          selectedAnswer: 0,
          isCorrect: true,
          timeSpent: 5000,
          pointsEarned: 10,
        },
      });

      await databaseService.prisma.hint.create({
        data: {
          questionId: testQuestionId,
          title: 'Test Hint',
          text: 'This is a test hint text',
        },
      });

      // Test the EXACT deletion order from admin delete everything command
      // BUT ONLY DELETE TEST DATA, NOT ALL DATA!
      await expect(
        databaseService.prisma.$transaction(async tx => {
          // 1. Delete question attempts first (due to foreign key constraints)
          await tx.questionAttempt.deleteMany({
            where: { questionId: testQuestionId },
          });

          // 2. Delete quiz attempts
          await tx.quizAttempt.deleteMany({
            where: { quizId: testQuizId },
          });

          // 3. Delete hints (they reference questions)
          await tx.hint.deleteMany({
            where: { questionId: testQuestionId },
          });

          // 4. Delete questions
          await tx.question.deleteMany({
            where: { quizId: testQuizId },
          });

          // 5. Delete test quizzes only
          await tx.quiz.deleteMany({
            where: { quizOwnerId: testUserId },
          });
        })
      ).resolves.not.toThrow();

      // Verify test data was deleted (but other data should remain)
      const testQuizCount = await databaseService.prisma.quiz.count({
        where: { quizOwnerId: testUserId },
      });
      const testQuestionCount = await databaseService.prisma.question.count({
        where: { quizId: testQuizId },
      });
      const testHintCount = await databaseService.prisma.hint.count({
        where: { questionId: testQuestionId },
      });
      const testQuestionAttemptCount = await databaseService.prisma.questionAttempt.count({
        where: { questionId: testQuestionId },
      });
      const testQuizAttemptCount = await databaseService.prisma.quizAttempt.count({
        where: { quizId: testQuizId },
      });

      expect(testQuizCount).toBe(0);
      expect(testQuestionCount).toBe(0);
      expect(testHintCount).toBe(0);
      expect(testQuestionAttemptCount).toBe(0);
      expect(testQuizAttemptCount).toBe(0);

      // Users should still exist
      const userCount = await databaseService.prisma.user.count({
        where: { id: testUserId },
      });
      expect(userCount).toBe(1);
    });

    it('should fail when using wrong deletion order', async () => {
      if (shouldSkipTests) {
        console.log('Skipping FK test - no test database configured');
        return;
      }

      // Create a hint to establish FK relationship
      await databaseService.prisma.hint.create({
        data: {
          questionId: testQuestionId,
          title: 'Test Hint',
          text: 'This is a test hint text',
        },
      });

      // Test that deleting questions before hints fails
      await expect(
        databaseService.prisma.$transaction(async tx => {
          // This should fail because hints still reference questions
          await tx.question.deleteMany(); // ❌ This should fail
          await tx.hint.deleteMany(); // ❌ Never reached
        })
      ).rejects.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle deletion when no data exists', async () => {
      if (shouldSkipTests) {
        console.log('Skipping FK test - no test database configured');
        return;
      }

      // Delete all data first
      await cleanupTestData();

      // Deletion order should work even with empty tables (but only delete test data!)
      await expect(
        databaseService.prisma.$transaction(async tx => {
          await tx.questionAttempt.deleteMany({
            where: { questionId: testQuestionId },
          });
          await tx.quizAttempt.deleteMany({
            where: { quizId: testQuizId },
          });
          await tx.hint.deleteMany({
            where: { questionId: testQuestionId },
          });
          await tx.question.deleteMany({
            where: { quizId: testQuizId },
          });
          await tx.quiz.deleteMany({
            where: { quizOwnerId: testUserId },
          });
        })
      ).resolves.not.toThrow();
    });
  });
});
