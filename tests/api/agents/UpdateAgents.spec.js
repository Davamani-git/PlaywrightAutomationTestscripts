/**
 * Update Agents API Test Suite
 * Tests for updating agents via PUT/PATCH /agents/{id} endpoint
 * @module UpdateAgentsTests
 */

const { test, expect } = require('@playwright/test');
const AgentsService = require('../../../src/services/AgentsService');
const AgentsPayloads = require('../../../src/api/agents/AgentsPayloads');
const AgentsData = require('../../../src/api/agents/AgentsData');
const AuthManager = require('../../../src/auth/AuthManager');
const Logger = require('../../../src/utils/Logger');

const logger = new Logger('UpdateAgentsTests');

test.describe('Update Agents API Tests', () => {
  let agentsService;
  let authManager;
  let testAgentId;

  test.beforeAll(async () => {
    logger.info('Setting up Update Agents test suite');
  });

  test.beforeEach(async ({ request }) => {
    authManager = new AuthManager(request);
    await authManager.authenticate();
    agentsService = new AgentsService(request, authManager);
    
    // Create a test agent for update tests
    const createResponse = await agentsService.createValidAgent();
    const createBody = await createResponse.json();
    testAgentId = createBody.id || createBody._id || createBody.agentId;
    logger.info(`Created test agent with ID: ${testAgentId}`);
  });

  test.afterEach(async () => {
    await agentsService.cleanupCreatedAgents();
  });

  test.describe('Positive Scenarios - Full Update', () => {
    test('TC044: Should update agent with valid payload', async () => {
      logger.info('TC044: Updating agent with valid payload');
      
      const updatePayload = AgentsPayloads.buildValidUpdatePayload();
      const startTime = Date.now();
      const response = await agentsService.updateAgent(testAgentId, updatePayload);
      const responseTime = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      
      const responseBody = await response.json();
      expect(responseBody.description).toBe(updatePayload.description);
      expect(responseBody.status).toBe(updatePayload.status);
      
      // Validate response time
      agentsService.validator.validateResponseTime(responseTime, AgentsData.PERFORMANCE_THRESHOLDS.update);
      
      logger.info('TC044: Test passed');
    });

    test('TC045: Should update agent description', async () => {
      logger.info('TC045: Updating agent description');
      
      const updatePayload = {
        description: `Updated description at ${Date.now()}`
      };
      
      const response = await agentsService.updateAgent(testAgentId, updatePayload);
      
      expect(response.status).toBe(200);
      
      const responseBody = await response.json();
      expect(responseBody.description).toBe(updatePayload.description);
      
      logger.info('TC045: Test passed');
    });

    test('TC046: Should update agent status', async () => {
      logger.info('TC046: Updating agent status');
      
      const updatePayload = {
        status: 'inactive'
      };
      
      const response = await agentsService.updateAgent(testAgentId, updatePayload);
      
      expect(response.status).toBe(200);
      
      const responseBody = await response.json();
      expect(responseBody.status).toBe('inactive');
      
      logger.info('TC046: Test passed');
    });

    test('TC047: Should update agent capabilities', async () => {
      logger.info('TC047: Updating agent capabilities');
      
      const updatePayload = {
        capabilities: ['natural_language_processing', 'sentiment_analysis']
      };
      
      const response = await agentsService.updateAgent(testAgentId, updatePayload);
      
      expect(response.status).toBe(200);
      
      const responseBody = await response.json();
      expect(responseBody.capabilities).toEqual(updatePayload.capabilities);
      
      logger.info('TC047: Test passed');
    });

    test('TC048: Should update agent configuration', async () => {
      logger.info('TC048: Updating agent configuration');
      
      const updatePayload = {
        configuration: {
          model: 'gpt-4',
          temperature: 0.8,
          maxTokens: 3000
        }
      };
      
      const response = await agentsService.updateAgent(testAgentId, updatePayload);
      
      expect(response.status).toBe(200);
      
      const responseBody = await response.json();
      expect(responseBody.configuration.model).toBe('gpt-4');
      
      logger.info('TC048: Test passed');
    });

    test('TC049: Should update agent metadata', async () => {
      logger.info('TC049: Updating agent metadata');
      
      const updatePayload = {
        metadata: {
          version: '2.0.0',
          tags: ['updated', 'testing']
        }
      };
      
      const response = await agentsService.updateAgent(testAgentId, updatePayload);
      
      expect(response.status).toBe(200);
      
      logger.info('TC049: Test passed');
    });
  });

  test.describe('Positive Scenarios - Partial Update', () => {
    test('TC050: Should partially update agent with PATCH', async () => {
      logger.info('TC050: Partially updating agent');
      
      const patchPayload = AgentsPayloads.buildPartialUpdatePayload();
      const response = await agentsService.patchAgent(testAgentId, patchPayload);
      
      expect(response.status).toBe(200);
      
      const responseBody = await response.json();
      expect(responseBody.description).toBe(patchPayload.description);
      expect(responseBody.status).toBe(patchPayload.status);
      
      logger.info('TC050: Test passed');
    });

    test('TC051: Should update single field only', async () => {
      logger.info('TC051: Updating single field');
      
      const updatePayload = {
        isActive: false
      };
      
      const response = await agentsService.patchAgent(testAgentId, updatePayload);
      
      expect(response.status).toBe(200);
      
      const responseBody = await response.json();
      expect(responseBody.isActive).toBe(false);
      
      logger.info('TC051: Test passed');
    });
  });

  test.describe('Negative Scenarios - Invalid ID', () => {
    test('TC052: Should fail to update non-existent agent', async () => {
      logger.info('TC052: Attempting to update non-existent agent');
      
      const invalidId = 'non-existent-agent-id';
      const updatePayload = AgentsPayloads.buildValidUpdatePayload();
      const response = await agentsService.client.update(invalidId, updatePayload);
      
      expect(response.status).toBe(404);
      
      const responseBody = await response.json();
      const errorMessage = responseBody.message || responseBody.error;
      expect(errorMessage.toLowerCase()).toMatch(/not found|does not exist/);
      
      logger.info('TC052: Test passed');
    });

    test('TC053: Should fail to update with invalid ID format', async () => {
      logger.info('TC053: Attempting to update with invalid ID format');
      
      const invalidId = 'invalid@#$%id';
      const updatePayload = AgentsPayloads.buildValidUpdatePayload();
      const response = await agentsService.client.update(invalidId, updatePayload);
      
      expect([400, 404]).toContain(response.status);
      
      logger.info('TC053: Test passed');
    });

    test('TC054: Should fail to update deleted agent', async () => {
      logger.info('TC054: Attempting to update deleted agent');
      
      // Delete the agent
      await agentsService.deleteAgent(testAgentId);
      
      // Try to update
      const updatePayload = AgentsPayloads.buildValidUpdatePayload();
      const response = await agentsService.client.update(testAgentId, updatePayload);
      
      expect(response.status).toBe(404);
      
      logger.info('TC054: Test passed');
    });
  });

  test.describe('Negative Scenarios - Invalid Data', () => {
    test('TC055: Should fail to update with invalid data types', async () => {
      logger.info('TC055: Attempting to update with invalid data types');
      
      const invalidPayload = {
        status: 12345, // Should be string
        isActive: 'yes' // Should be boolean
      };
      
      const response = await agentsService.client.update(testAgentId, invalidPayload);
      
      expect(response.status).toBe(400);
      
      logger.info('TC055: Test passed');
    });

    test('TC056: Should fail to update with empty payload', async () => {
      logger.info('TC056: Attempting to update with empty payload');
      
      const emptyPayload = {};
      const response = await agentsService.client.update(testAgentId, emptyPayload);
      
      // Should either accept (no changes) or reject
      expect([200, 400]).toContain(response.status);
      
      logger.info('TC056: Test passed');
    });

    test('TC057: Should fail to update with invalid enum values', async () => {
      logger.info('TC057: Attempting to update with invalid enum values');
      
      const invalidPayload = {
        status: 'invalid-status',
        type: 'invalid-type'
      };
      
      const response = await agentsService.client.update(testAgentId, invalidPayload);
      
      expect(response.status).toBe(400);
      
      logger.info('TC057: Test passed');
    });

    test('TC058: Should fail to update with null values', async () => {
      logger.info('TC058: Attempting to update with null values');
      
      const nullPayload = {
        description: null,
        status: null
      };
      
      const response = await agentsService.client.update(testAgentId, nullPayload);
      
      expect(response.status).toBe(400);
      
      logger.info('TC058: Test passed');
    });
  });

  test.describe('Data Integrity Scenarios', () => {
    test('TC059: Should preserve unchanged fields after update', async () => {
      logger.info('TC059: Verifying unchanged fields preservation');
      
      // Get original data
      const getResponse = await agentsService.getAgentById(testAgentId);
      const originalData = await getResponse.json();
      
      // Update only description
      const updatePayload = {
        description: 'Updated description'
      };
      await agentsService.updateAgent(testAgentId, updatePayload);
      
      // Get updated data
      const updatedResponse = await agentsService.getAgentById(testAgentId);
      const updatedData = await updatedResponse.json();
      
      // Verify other fields unchanged
      expect(updatedData.name).toBe(originalData.name);
      expect(updatedData.type).toBe(originalData.type);
      expect(updatedData.description).toBe('Updated description');
      
      logger.info('TC059: Test passed');
    });

    test('TC060: Should update timestamp after modification', async () => {
      logger.info('TC060: Verifying timestamp update');
      
      // Get original timestamp
      const getResponse = await agentsService.getAgentById(testAgentId);
      const originalData = await getResponse.json();
      const originalTimestamp = originalData.updatedAt || originalData.updated_at;
      
      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update agent
      const updatePayload = AgentsPayloads.buildValidUpdatePayload();
      await agentsService.updateAgent(testAgentId, updatePayload);
      
      // Get updated timestamp
      const updatedResponse = await agentsService.getAgentById(testAgentId);
      const updatedData = await updatedResponse.json();
      const updatedTimestamp = updatedData.updatedAt || updatedData.updated_at;
      
      // Verify timestamp changed
      if (originalTimestamp && updatedTimestamp) {
        expect(new Date(updatedTimestamp).getTime()).toBeGreaterThan(
          new Date(originalTimestamp).getTime()
        );
      }
      
      logger.info('TC060: Test passed');
    });
  });
});