/**
 * Delete Agents API Test Suite
 * Tests for deleting agents via DELETE /agents/{id} endpoint
 * @module DeleteAgentsTests
 */

const { test, expect } = require('@playwright/test');
const AgentsService = require('../../../src/services/AgentsService');
const AgentsData = require('../../../src/api/agents/AgentsData');
const AuthManager = require('../../../src/auth/AuthManager');
const Logger = require('../../../src/utils/Logger');

const logger = new Logger('DeleteAgentsTests');

test.describe('Delete Agents API Tests', () => {
  let agentsService;
  let authManager;
  let testAgentId;

  test.beforeAll(async () => {
    logger.info('Setting up Delete Agents test suite');
  });

  test.beforeEach(async ({ request }) => {
    authManager = new AuthManager(request);
    await authManager.authenticate();
    agentsService = new AgentsService(request, authManager);
    
    // Create a test agent for delete tests
    const createResponse = await agentsService.createValidAgent();
    const createBody = await createResponse.json();
    testAgentId = createBody.id || createBody._id || createBody.agentId;
    logger.info(`Created test agent with ID: ${testAgentId}`);
  });

  test.afterEach(async () => {
    // Cleanup any remaining agents
    await agentsService.cleanupCreatedAgents();
  });

  test.describe('Positive Scenarios', () => {
    test('TC061: Should delete agent successfully', async () => {
      logger.info('TC061: Deleting agent successfully');
      
      const startTime = Date.now();
      const response = await agentsService.deleteAgent(testAgentId);
      const responseTime = Date.now() - startTime;
      
      expect([200, 204]).toContain(response.status);
      
      // Validate response time
      agentsService.validator.validateResponseTime(responseTime, AgentsData.PERFORMANCE_THRESHOLDS.delete);
      
      // Verify agent is deleted
      const verifyDeleted = await agentsService.verifyAgentNotExists(testAgentId);
      expect(verifyDeleted).toBe(true);
      
      logger.info('TC061: Test passed');
    });

    test('TC062: Should return appropriate response after deletion', async () => {
      logger.info('TC062: Validating delete response');
      
      const response = await agentsService.deleteAgent(testAgentId);
      
      expect([200, 204]).toContain(response.status);
      
      if (response.status === 200) {
        const responseBody = await response.json();
        expect(responseBody.message || responseBody.status).toBeDefined();
      }
      
      logger.info('TC062: Test passed');
    });

    test('TC063: Should not retrieve deleted agent', async () => {
      logger.info('TC063: Verifying deleted agent cannot be retrieved');
      
      // Delete agent
      await agentsService.deleteAgent(testAgentId);
      
      // Try to retrieve
      const getResponse = await agentsService.client.getById(testAgentId);
      
      expect(getResponse.status).toBe(404);
      
      logger.info('TC063: Test passed');
    });

    test('TC064: Should remove agent from list after deletion', async () => {
      logger.info('TC064: Verifying agent removed from list');
      
      // Get all agents before deletion
      const beforeResponse = await agentsService.getAllAgents();
      const beforeBody = await beforeResponse.json();
      const beforeAgents = Array.isArray(beforeBody) ? beforeBody : beforeBody.data;
      const beforeCount = beforeAgents ? beforeAgents.length : 0;
      
      // Delete agent
      await agentsService.deleteAgent(testAgentId);
      
      // Get all agents after deletion
      const afterResponse = await agentsService.getAllAgents();
      const afterBody = await afterResponse.json();
      const afterAgents = Array.isArray(afterBody) ? afterBody : afterBody.data;
      const afterCount = afterAgents ? afterAgents.length : 0;
      
      // Verify count decreased
      expect(afterCount).toBeLessThanOrEqual(beforeCount);
      
      // Verify deleted agent not in list
      if (afterAgents) {
        const deletedAgentExists = afterAgents.some(agent => {
          const agentId = agent.id || agent._id || agent.agentId;
          return agentId === testAgentId;
        });
        expect(deletedAgentExists).toBe(false);
      }
      
      logger.info('TC064: Test passed');
    });

    test('TC065: Should delete multiple agents sequentially', async () => {
      logger.info('TC065: Deleting multiple agents');
      
      // Create additional agents
      const agent2Response = await agentsService.createValidAgent();
      const agent2Body = await agent2Response.json();
      const agent2Id = agent2Body.id || agent2Body._id || agent2Body.agentId;
      
      const agent3Response = await agentsService.createValidAgent();
      const agent3Body = await agent3Response.json();
      const agent3Id = agent3Body.id || agent3Body._id || agent3Body.agentId;
      
      // Delete all agents
      const delete1 = await agentsService.deleteAgent(testAgentId);
      const delete2 = await agentsService.deleteAgent(agent2Id);
      const delete3 = await agentsService.deleteAgent(agent3Id);
      
      expect([200, 204]).toContain(delete1.status);
      expect([200, 204]).toContain(delete2.status);
      expect([200, 204]).toContain(delete3.status);
      
      logger.info('TC065: Test passed');
    });
  });

  test.describe('Negative Scenarios - Invalid ID', () => {
    test('TC066: Should return 404 for non-existent agent', async () => {
      logger.info('TC066: Attempting to delete non-existent agent');
      
      const invalidId = 'non-existent-agent-id-12345';
      const response = await agentsService.client.delete(invalidId);
      
      expect(response.status).toBe(404);
      
      const responseBody = await response.json();
      const errorMessage = responseBody.message || responseBody.error;
      expect(errorMessage.toLowerCase()).toMatch(/not found|does not exist/);
      
      logger.info('TC066: Test passed');
    });

    test('TC067: Should return 404 for already deleted agent', async () => {
      logger.info('TC067: Attempting to delete already deleted agent');
      
      // Delete agent first time
      await agentsService.deleteAgent(testAgentId);
      
      // Try to delete again
      const response = await agentsService.client.delete(testAgentId);
      
      expect(response.status).toBe(404);
      
      logger.info('TC067: Test passed');
    });

    test('TC068: Should return 400 for invalid ID format', async () => {
      logger.info('TC068: Attempting to delete with invalid ID format');
      
      const invalidId = 'invalid@#$%^&*()id';
      const response = await agentsService.client.delete(invalidId);
      
      expect([400, 404]).toContain(response.status);
      
      logger.info('TC068: Test passed');
    });

    test('TC069: Should return 400 for empty ID', async () => {
      logger.info('TC069: Attempting to delete with empty ID');
      
      const response = await agentsService.client.delete('');
      
      expect([400, 404]).toContain(response.status);
      
      logger.info('TC069: Test passed');
    });

    test('TC070: Should return 400 for null ID', async () => {
      logger.info('TC070: Attempting to delete with null ID');
      
      const response = await agentsService.client.delete(null);
      
      expect([400, 404]).toContain(response.status);
      
      logger.info('TC070: Test passed');
    });
  });

  test.describe('Data Integrity Scenarios', () => {
    test('TC071: Should permanently delete agent data', async () => {
      logger.info('TC071: Verifying permanent deletion');
      
      // Delete agent
      await agentsService.deleteAgent(testAgentId);
      
      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Verify still deleted
      const verifyResponse = await agentsService.client.getById(testAgentId);
      expect(verifyResponse.status).toBe(404);
      
      logger.info('TC071: Test passed');
    });

    test('TC072: Should not affect other agents after deletion', async () => {
      logger.info('TC072: Verifying other agents unaffected');
      
      // Create another agent
      const otherAgentResponse = await agentsService.createValidAgent();
      const otherAgentBody = await otherAgentResponse.json();
      const otherAgentId = otherAgentBody.id || otherAgentBody._id || otherAgentBody.agentId;
      
      // Delete first agent
      await agentsService.deleteAgent(testAgentId);
      
      // Verify other agent still exists
      const verifyResponse = await agentsService.getAgentById(otherAgentId);
      expect(verifyResponse.status).toBe(200);
      
      logger.info('TC072: Test passed');
    });
  });

  test.describe('Performance Scenarios', () => {
    test('TC073: Should meet performance threshold for delete', async () => {
      logger.info('TC073: Testing delete performance');
      
      const startTime = Date.now();
      const response = await agentsService.deleteAgent(testAgentId);
      const responseTime = Date.now() - startTime;
      
      expect([200, 204]).toContain(response.status);
      
      agentsService.validator.validateResponseTime(
        responseTime,
        AgentsData.PERFORMANCE_THRESHOLDS.delete
      );
      
      logger.info(`TC073: Response time: ${responseTime}ms`);
      logger.info('TC073: Test passed');
    });
  });
});