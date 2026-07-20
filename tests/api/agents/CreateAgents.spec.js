/**
 * Create Agents API Test Suite
 * Tests for creating new agents via POST /agents endpoint
 * @module CreateAgentsTests
 */

const { test, expect } = require('@playwright/test');
const AgentsService = require('../../../src/services/AgentsService');
const AgentsPayloads = require('../../../src/api/agents/AgentsPayloads');
const AgentsData = require('../../../src/api/agents/AgentsData');
const AuthManager = require('../../../src/auth/AuthManager');
const Logger = require('../../../src/utils/Logger');

const logger = new Logger('CreateAgentsTests');

test.describe('Create Agents API Tests', () => {
  let agentsService;
  let authManager;

  test.beforeAll(async () => {
    logger.info('Setting up Create Agents test suite');
  });

  test.beforeEach(async ({ request }) => {
    authManager = new AuthManager(request);
    await authManager.authenticate();
    agentsService = new AgentsService(request, authManager);
  });

  test.afterEach(async () => {
    // Cleanup created agents
    await agentsService.cleanupCreatedAgents();
  });

  test.describe('Positive Scenarios', () => {
    test('TC001: Should create agent with all valid fields', async () => {
      logger.info('TC001: Creating agent with all valid fields');
      
      const payload = AgentsPayloads.buildValidCreatePayload();
      const startTime = Date.now();
      const response = await agentsService.createAgent(payload);
      const responseTime = Date.now() - startTime;
      
      // Validate response
      expect(response.status).toBe(201);
      
      const responseBody = await response.json();
      expect(responseBody.name).toBe(payload.name);
      expect(responseBody.type).toBe(payload.type);
      expect(responseBody.status).toBe(payload.status);
      
      // Validate response time
      agentsService.validator.validateResponseTime(responseTime, AgentsData.PERFORMANCE_THRESHOLDS.create);
      
      logger.info('TC001: Test passed');
    });

    test('TC002: Should create agent with only required fields', async () => {
      logger.info('TC002: Creating agent with only required fields');
      
      const payload = AgentsPayloads.buildMinimalValidPayload();
      const response = await agentsService.createAgent(payload);
      
      expect(response.status).toBe(201);
      
      const responseBody = await response.json();
      expect(responseBody.name).toBe(payload.name);
      expect(responseBody.type).toBe(payload.type);
      expect(responseBody.status).toBe(payload.status);
      
      logger.info('TC002: Test passed');
    });

    test('TC003: Should create agent with special characters in name', async () => {
      logger.info('TC003: Creating agent with special characters');
      
      const payload = AgentsPayloads.buildPayloadWithSpecialCharacters();
      const response = await agentsService.createAgent(payload);
      
      expect(response.status).toBe(201);
      
      const responseBody = await response.json();
      expect(responseBody.name).toBeDefined();
      
      logger.info('TC003: Test passed');
    });

    test('TC004: Should create agent with Unicode characters', async () => {
      logger.info('TC004: Creating agent with Unicode characters');
      
      const payload = AgentsPayloads.buildPayloadWithUnicode();
      const response = await agentsService.createAgent(payload);
      
      expect(response.status).toBe(201);
      
      const responseBody = await response.json();
      expect(responseBody.name).toContain('测试');
      
      logger.info('TC004: Test passed');
    });

    test('TC005: Should create agent with boundary values', async () => {
      logger.info('TC005: Creating agent with boundary values');
      
      const payload = AgentsPayloads.buildPayloadWithBoundaryValues();
      const response = await agentsService.createAgent(payload);
      
      expect(response.status).toBe(201);
      
      logger.info('TC005: Test passed');
    });

    test('TC006: Should create agent with all capabilities', async () => {
      logger.info('TC006: Creating agent with all capabilities');
      
      const payload = AgentsPayloads.buildValidCreatePayload({
        capabilities: [
          'natural_language_processing',
          'sentiment_analysis',
          'entity_recognition',
          'intent_classification',
          'context_management',
          'multi_language_support'
        ]
      });
      const response = await agentsService.createAgent(payload);
      
      expect(response.status).toBe(201);
      
      const responseBody = await response.json();
      expect(responseBody.capabilities.length).toBeGreaterThan(0);
      
      logger.info('TC006: Test passed');
    });

    test('TC007: Should create agent with custom configuration', async () => {
      logger.info('TC007: Creating agent with custom configuration');
      
      const payload = AgentsPayloads.buildValidCreatePayload({
        configuration: {
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 2000,
          topP: 0.9
        }
      });
      const response = await agentsService.createAgent(payload);
      
      expect(response.status).toBe(201);
      
      const responseBody = await response.json();
      expect(responseBody.configuration).toBeDefined();
      
      logger.info('TC007: Test passed');
    });

    test('TC008: Should create agent with metadata', async () => {
      logger.info('TC008: Creating agent with metadata');
      
      const payload = AgentsPayloads.buildValidCreatePayload({
        metadata: {
          version: '1.0.0',
          department: 'Engineering',
          tags: ['production', 'critical']
        }
      });
      const response = await agentsService.createAgent(payload);
      
      expect(response.status).toBe(201);
      
      const responseBody = await response.json();
      expect(responseBody.metadata).toBeDefined();
      
      logger.info('TC008: Test passed');
    });
  });

  test.describe('Negative Scenarios - Missing Required Fields', () => {
    test('TC009: Should fail to create agent without name', async () => {
      logger.info('TC009: Attempting to create agent without name');
      
      const payload = AgentsPayloads.buildPayloadMissingName();
      const response = await agentsService.client.create(payload);
      
      expect(response.status).toBe(400);
      
      const responseBody = await response.json();
      const errorMessage = responseBody.message || responseBody.error;
      expect(errorMessage.toLowerCase()).toContain('name');
      
      logger.info('TC009: Test passed');
    });

    test('TC010: Should fail to create agent without type', async () => {
      logger.info('TC010: Attempting to create agent without type');
      
      const payload = AgentsPayloads.buildPayloadMissingType();
      const response = await agentsService.client.create(payload);
      
      expect(response.status).toBe(400);
      
      const responseBody = await response.json();
      const errorMessage = responseBody.message || responseBody.error;
      expect(errorMessage.toLowerCase()).toContain('type');
      
      logger.info('TC010: Test passed');
    });

    test('TC011: Should fail to create agent without status', async () => {
      logger.info('TC011: Attempting to create agent without status');
      
      const payload = AgentsPayloads.buildPayloadMissingStatus();
      const response = await agentsService.client.create(payload);
      
      expect(response.status).toBe(400);
      
      logger.info('TC011: Test passed');
    });
  });

  test.describe('Negative Scenarios - Invalid Data', () => {
    test('TC012: Should fail to create agent with invalid data types', async () => {
      logger.info('TC012: Attempting to create agent with invalid data types');
      
      const payload = AgentsPayloads.buildPayloadWithInvalidDataTypes();
      const response = await agentsService.client.create(payload);
      
      expect(response.status).toBe(400);
      
      logger.info('TC012: Test passed');
    });

    test('TC013: Should fail to create agent with empty required fields', async () => {
      logger.info('TC013: Attempting to create agent with empty fields');
      
      const payload = AgentsPayloads.buildPayloadWithEmptyFields();
      const response = await agentsService.client.create(payload);
      
      expect(response.status).toBe(400);
      
      logger.info('TC013: Test passed');
    });

    test('TC014: Should fail to create agent with null values', async () => {
      logger.info('TC014: Attempting to create agent with null values');
      
      const payload = AgentsPayloads.buildPayloadWithNullValues();
      const response = await agentsService.client.create(payload);
      
      expect(response.status).toBe(400);
      
      logger.info('TC014: Test passed');
    });

    test('TC015: Should fail to create agent with invalid enum values', async () => {
      logger.info('TC015: Attempting to create agent with invalid enum values');
      
      const payload = AgentsPayloads.buildPayloadWithInvalidEnumValues();
      const response = await agentsService.client.create(payload);
      
      expect(response.status).toBe(400);
      
      logger.info('TC015: Test passed');
    });

    test('TC016: Should fail to create agent exceeding length limits', async () => {
      logger.info('TC016: Attempting to create agent exceeding length limits');
      
      const payload = AgentsPayloads.buildPayloadExceedingLengthLimits();
      const response = await agentsService.client.create(payload);
      
      expect(response.status).toBe(400);
      
      logger.info('TC016: Test passed');
    });
  });

  test.describe('Negative Scenarios - Duplicate Data', () => {
    test('TC017: Should fail to create duplicate agent', async () => {
      logger.info('TC017: Attempting to create duplicate agent');
      
      // Create first agent
      const payload = AgentsPayloads.buildValidCreatePayload();
      const firstResponse = await agentsService.createAgent(payload);
      expect(firstResponse.status).toBe(201);
      
      // Attempt to create duplicate
      const duplicatePayload = AgentsPayloads.buildDuplicatePayload(payload.name);
      const duplicateResponse = await agentsService.client.create(duplicatePayload);
      
      expect(duplicateResponse.status).toBe(409);
      
      const responseBody = await duplicateResponse.json();
      const errorMessage = responseBody.message || responseBody.error;
      expect(errorMessage.toLowerCase()).toMatch(/duplicate|already exists|conflict/);
      
      logger.info('TC017: Test passed');
    });
  });

  test.describe('Security Scenarios', () => {
    test('TC018: Should sanitize SQL injection attempts', async () => {
      logger.info('TC018: Testing SQL injection prevention');
      
      const payload = AgentsPayloads.buildPayloadWithSQLInjection();
      const response = await agentsService.client.create(payload);
      
      // Should either reject or sanitize
      expect([400, 201]).toContain(response.status);
      
      if (response.status === 201) {
        const responseBody = await response.json();
        expect(responseBody.name).not.toContain('DROP TABLE');
      }
      
      logger.info('TC018: Test passed');
    });

    test('TC019: Should handle extra fields appropriately', async () => {
      logger.info('TC019: Testing handling of extra fields');
      
      const payload = AgentsPayloads.buildPayloadWithExtraFields();
      const response = await agentsService.createAgent(payload);
      
      expect(response.status).toBe(201);
      
      logger.info('TC019: Test passed');
    });
  });
});