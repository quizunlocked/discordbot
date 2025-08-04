import { quizService } from '../../src/services/QuizService';
import * as fs from 'fs/promises';

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
jest.mock('fs/promises', () => ({
  access: jest.fn(),
  readFile: jest.fn()
}));

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
const mockClient = {
  users: {
    fetch: jest.fn().mockResolvedValue({
      id: 'user1',
      username: 'TestUser',
      send: jest.fn().mockResolvedValue({ id: 'dm-message-id' })
    })
  }
};

describe('QuizService Image Integration', () => {
  let mockPrisma: any;
  let mockFs: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = require('../../src/services/DatabaseService').databaseService.prisma;
    mockFs = fs as any;
    
    // Set up the client
    quizService.setClient(mockClient as any);
  });

  describe('displayQuestion with images', () => {
    it.skip('should display question with image attachment for public quiz', async () => {
      const mockQuiz = {
        id: 'quiz_123',
        questions: [
          {
            id: 'q1',
            questionText: 'What is this?',
            options: '["A", "B", "C", "D"]',
            correctAnswer: 0,
            points: 10,
            timeLimit: 30,
            image: {
              id: 'img_123',
              path: 'public/images/user1/img_123.png',
              altText: 'Test image description'
            }
          }
        ]
      };

      const mockImageBuffer = Buffer.from('fake-image-data');

      mockPrisma.quiz.findUnique.mockResolvedValue(mockQuiz);
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(mockImageBuffer);

      // Start a quiz session with 0 wait time to skip join phase
      await quizService.startQuiz(
        mockChannel as any,
        {
          title: 'Test Quiz',
          description: 'Test Description',
          questions: [
            {
              questionText: 'What is this?',
              options: ['A', 'B', 'C', 'D'],
              correctAnswer: 0,
              points: 10,
              timeLimit: 30
            }
          ]
        },
        'quiz_123',
        0, // 0 wait time to skip join phase
        false, // don't save to database
        false, // public quiz
        'user1'
      );

      // Wait for the quiz to start
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check that at least one call includes image data
      const calls = mockChannel.send.mock.calls;
      const hasImageCall = calls.some(call => 
        call[0].files && 
        call[0].files.some((file: any) => file.name === 'question-image.png')
      );
      
      expect(hasImageCall).toBe(true);
    });

    it.skip('should display question with image for private quiz', async () => {
      const mockQuiz = {
        id: 'quiz_456',
        questions: [
          {
            id: 'q1',
            questionText: 'Private question with image',
            options: '["X", "Y", "Z"]',
            correctAnswer: 1,
            points: 15,
            timeLimit: 45,
            image: {
              id: 'img_456',
              path: 'public/images/user1/img_456.jpg',
              altText: null
            }
          }
        ]
      };

      const mockImageBuffer = Buffer.from('private-image-data');

      mockPrisma.quiz.findUnique.mockResolvedValue(mockQuiz);
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(mockImageBuffer);

      const mockUser = {
        id: 'user1',
        username: 'TestUser',
        send: jest.fn().mockResolvedValue({ id: 'dm-message-id' })
      };
      mockClient.users.fetch.mockResolvedValue(mockUser);

      // Start a private quiz session
      await quizService.startQuiz(
        mockChannel as any,
        {
          title: 'Private Quiz',
          questions: [
            {
              questionText: 'Private question with image',
              options: ['X', 'Y', 'Z'],
              correctAnswer: 1,
              points: 15,
              timeLimit: 45
            }
          ]
        },
        'quiz_456',
        0, // No wait time
        false, // don't save to database
        true, // private quiz
        'user1'
      );

      expect(mockUser.send).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                image: expect.objectContaining({
                  url: 'attachment://question-image.jpg'
                })
              })
            })
          ]),
          files: expect.arrayContaining([
            expect.objectContaining({
              name: 'question-image.jpg'
            })
          ])
        })
      );
    });

    it.skip('should handle missing image files gracefully', async () => {
      const mockQuiz = {
        id: 'quiz_789',
        questions: [
          {
            id: 'q1',
            questionText: 'Question with missing image',
            options: '["A", "B"]',
            correctAnswer: 0,
            points: 5,
            timeLimit: 20,
            image: {
              id: 'img_missing',
              path: 'public/images/user1/missing.png',
              altText: 'Missing image'
            }
          }
        ]
      };

      mockPrisma.quiz.findUnique.mockResolvedValue(mockQuiz);
      mockFs.access.mockRejectedValue(new Error('File not found'));

      // Start a quiz session
      await quizService.startQuiz(
        mockChannel as any,
        {
          title: 'Quiz with Missing Image',
          questions: [
            {
              questionText: 'Question with missing image',
              options: ['A', 'B'],
              correctAnswer: 0,
              points: 5,
              timeLimit: 20
            }
          ]
        },
        'quiz_789',
        1,
        false,
        false,
        'user1'
      );

      // Wait for the quiz to start
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(mockChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: expect.stringContaining('Question 1 of 1')
              })
            })
          ]),
          // Should not include files array when image is missing
          files: undefined
        })
      );
    });

    it.skip('should display question without image when no image is attached', async () => {
      const mockQuiz = {
        id: 'quiz_no_image',
        questions: [
          {
            id: 'q1',
            questionText: 'Question without image',
            options: '["Yes", "No"]',
            correctAnswer: 0,
            points: 10,
            timeLimit: 30,
            image: null
          }
        ]
      };

      mockPrisma.quiz.findUnique.mockResolvedValue(mockQuiz);

      // Start a quiz session
      await quizService.startQuiz(
        mockChannel as any,
        {
          title: 'Quiz without Images',
          questions: [
            {
              questionText: 'Question without image',
              options: ['Yes', 'No'],
              correctAnswer: 0,
              points: 10,
              timeLimit: 30
            }
          ]
        },
        'quiz_no_image',
        1,
        false,
        false,
        'user1'
      );

      // Wait for the quiz to start
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(mockChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.not.objectContaining({
                image: expect.anything()
              })
            })
          ]),
          // Should not include files when no image
          files: undefined
        })
      );
    });

    it.skip('should handle image read errors gracefully', async () => {
      const mockQuiz = {
        id: 'quiz_read_error',
        questions: [
          {
            id: 'q1',
            questionText: 'Question with read error',
            options: '["A", "B", "C"]',
            correctAnswer: 1,
            points: 10,
            timeLimit: 30,
            image: {
              id: 'img_error',
              path: 'public/images/user1/error.png',
              altText: 'Error image'
            }
          }
        ]
      };

      mockPrisma.quiz.findUnique.mockResolvedValue(mockQuiz);
      mockFs.access.mockResolvedValue(undefined); // File exists
      mockFs.readFile.mockRejectedValue(new Error('Read permission denied'));

      // Start a quiz session
      await quizService.startQuiz(
        mockChannel as any,
        {
          title: 'Quiz with Read Error',
          questions: [
            {
              questionText: 'Question with read error',
              options: ['A', 'B', 'C'],
              correctAnswer: 1,
              points: 10,
              timeLimit: 30
            }
          ]
        },
        'quiz_read_error',
        1,
        false,
        false,
        'user1'
      );

      // Wait for the quiz to start
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(mockChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: expect.stringContaining('Question 1 of 1')
              })
            })
          ]),
          // Should not include files when read fails
          files: undefined
        })
      );
    });
  });

  describe('quiz database queries with image relations', () => {
    it.skip('should include image relations in all quiz queries', async () => {
      const mockQuizWithImages = {
        id: 'quiz_123',
        questions: [
          {
            id: 'q1',
            image: { id: 'img_1', path: 'path1.png' }
          },
          {
            id: 'q2', 
            image: null
          }
        ]
      };

      mockPrisma.quiz.findUnique.mockResolvedValue(mockQuizWithImages);

      // Test the various internal methods that query for quizzes
      // These are called during quiz execution, so we need to trigger them indirectly

      // Start a quiz to trigger database queries
      await quizService.startQuiz(
        mockChannel as any,
        {
          title: 'Test Quiz',
          questions: [
            { questionText: 'Q1', options: ['A', 'B'], correctAnswer: 0, points: 10, timeLimit: 30 }
          ]
        },
        'quiz_123',
        1,
        false,
        false,
        'user1'
      );

      // Wait for quiz to start
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Verify that quiz queries include image relations
      expect(mockPrisma.quiz.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'quiz_123' },
          include: expect.objectContaining({
            questions: expect.objectContaining({
              include: expect.objectContaining({
                image: true
              })
            })
          })
        })
      );
    });
  });
});