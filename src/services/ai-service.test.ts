// Simple test to verify AI service initialization
import { AIService } from './src/services/ai-service';

// Mock the config service
jest.mock('./src/core/app-config', () => {
  return {
    ConfigService: {
      getInstance: () => {
        return {
          getWeb3Config: () => {
            return {
              ai: {
                enabled: true,
                geminiApiKey: 'test-key',
              },
            };
          },
        };
      },
    },
  };
});

// Mock the event bus
jest.mock('./src/core/event-bus', () => {
  return {
    EventBus: {
      getInstance: () => {
        return {
          emit: jest.fn(),
          on: jest.fn(),
          off: jest.fn(),
        };
      },
    },
  };
});

describe('AIService', () => {
  let aiService: AIService;

  beforeEach(() => {
    // Reset the singleton instance
    (AIService as any).instance = null;
    aiService = AIService.getInstance();
  });

  it('should initialize properly', async () => {
    // Mock the dynamic import
    jest.mock('@google/generative-ai', () => {
      return {
        GoogleGenerativeAI: jest.fn().mockImplementation(() => {
          return {
            getGenerativeModel: jest.fn().mockReturnValue({
              generateContent: jest.fn().mockResolvedValue({
                response: {
                  text: jest.fn().mockReturnValue('{"test": "response"}'),
                },
              }),
            }),
          };
        }),
      };
    });

    await aiService.initializeService();
    expect(aiService.getIsInitialized()).toBe(true);
    expect(aiService.isAIEnabled()).toBe(true);
  });
});
