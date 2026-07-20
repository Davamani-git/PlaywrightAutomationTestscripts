/**
 * Get All Agents API Test Suite
 * Tests for retrieving all agents via GET /agents endpoint
 * @module GetAllAgentsTests
 */

const { test, expect } = require('@playwright/test');
const AgentsService = require('../../../src/services/AgentsService');
const AgentsData = require('../../../src/api/agents/AgentsData');
const AuthManager = require('../../../src/auth/AuthManager');
const Logger = require('../../../src/utils/Logger');

const logger = new Logger('GetAllAgentsTests');

test.describe('Get All Agents API Tests', () => {
  let agentsService;
  let authManager;

  test.beforeAll(async () => {
    logger.info('Setting up Get All Agents test suite');
  });

  test.beforeEach(async ({ request }) => {
    authManager = new AuthManager(request);
    await authManager.authenticate();
    agentsService = new AgentsService(request, authManager);
  });

  test.afterEach(async () => {
    await agentsService.cleanupCreatedAgents();
  });

  test.describe('Positive Scenarios', () => {
    test('TC020: Should retrieve all agents successfully', async () => {
      logger.info('TC020: Retrieving all agents');
      
      const startTime = Date.now();
      const response = await agentsService.getAllAgents();
      const responseTime = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      
      const responseBody = await response.json();
      
      // Validate response structure
      if (Array.isArray(responseBody)) {
        logger.info(`Retrieved ${responseBody.length} agents`);
      } else if (responseBody.data && Array.isArray(responseBody.data)) {
        logger.info(`Retrieved ${responseBody.data.length} agents`);
      }
      
      // Validate response time
      agentsService.validator.validateResponseTime(responseTime, AgentsData.PERFORMANCE_THRESHOLDS.getAll);
      
      logger.info('TC020: Test passed');
    });

    test('TC021: Should retrieve agents with query parameters', async () => {
      logger.info('TC021: Retrieving agents with query parameters');
      
      const queryParams = {
        status: 'active',
        limit: 10
      };
      
      const response = await agentsService.getAllAgents(queryParams);
      
      expect(response.status).toBe(200);
      
      const responseBody = await response.json();
      
      // Validate filtered results
      const agents = Array.isArray(responseBody) ? responseBody : responseBody.data;
      if (agents && agents.length > 0) {
        agents.forEach(agent => {
          if (agent.status) {
            expect(agent.status).toBe('active');
          }
        });
      }
      
      logger.info('TC021: Test passed');
    });

    test('TC022: Should retrieve agents with pagination', async () => {
      logger.info('TC022: Retrieving agents with pagination');
      
      const queryParams = {
        limit: 5,
        offset: 0
      };
      
      const response = await agentsService.getAllAgents(queryParams);
      
      expect(response.status).toBe(200);
      
      const responseBody = await response.json();
      
      // Validate pagination
      if (responseBody.pagination) {
        expect(responseBody.pagination.limit).toBe(5);
      }
      
      logger.info('TC022: Test passed');
    });

    test('TC023: Should retrieve agents with sorting', async () => {
      logger.info('TC023: Retrieving agents with sorting');
      
      const queryParams = {
        sortBy: 'createdAt',
        sortOrder: 'desc'
      };
      
      const response = await agentsService.getAllAgents(queryParams);
      
      expect(response.status).toBe(200);
      
      logger.info('TC023: Test passed');
    });

    test('TC024: Should return empty array when no agents exist', async () => {
      logger.info('TC024: Testing empty result set');
      
      const queryParams = {
        status: 'non-existent-status'
      };
      
      const response = await agentsService.getAllAgents(queryParams);
      
      expect(response.status).toBe(200);
      
      const responseBody = await response.json();
      const agents = Array.isArray(responseBody) ? responseBody : responseBody.data;
      
      if (agents) {
        expect(agents.length).toBe(0);
      }
      
      logger.info('TC024: Test passed');
    });

    test('TC025: Should retrieve agents after creating new ones', async () => {
      logger.info('TC025: Retrieving agents after creation');
      
      // Create test agents
      await agentsService.createValidAgent();
      await agentsService.createValidAgent();
      
      const response = await agentsService.getAllAgents();
      
      expect(response.status).toBe(200);
      
      const responseBody = await response.json();
      const agents = Array.isArray(responseBody) ? responseBody : responseBody.data;
      
      expect(agents.length).toBeGreaterThanOrEqual(2);
      
      logger.info('TC025: Test passed');
    });
  });

  test.describe('Negative Scenarios', () => {
    test('TC026: Should handle invalid query parameters gracefully', async () => {
      logger.info('TC026: Testing invalid query parameters');
      
      const queryParams = {
        limit: 'invalid',
        offset: 'invalid'
      };
      
      const response = await agentsService.client.getAll(queryParams);
      
      // Should either return 400 or ignore invalid params
      expect([200, 400]).toContain(response.status);
      
      logger.info('TC026: Test passed');
    });

    test('TC027: Should handle negative pagination values', async () => {
      logger.info('TC027: Testing negative pagination values');
      
      const queryParams = {
        limit: -10,
        offset: -5
      };
      
      const response = await agentsService.client.getAll(queryParams);
      
      // Should either return 400 or use default values
      expect([200, 400]).toContain(response.status);
      
      logger.info('TC027: Test passed');
    });

    test('TC028: Should handle extremely large limit values', async () => {
      logger.info('TC028: Testing large limit values');
      
      const queryParams = {
        limit: 999999
      };
      
      const response = await agentsService.client.getAll(queryParams);
      
      // Should either cap the limit or return error
      expect([200, 400]).toContain(response.status);
      
      logger.info('TC028: Test passed');
    });
  });

  test.describe('Performance Scenarios', () => {
    test('TC029: Should meet performance threshold for get all agents', async () => {
      logger.info('TC029: Testing performance threshold');
      
      const startTime = Date.now();
      const response = await agentsService.getAllAgents();
      const responseTime = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      
      agentsService.validator.validateResponseTime(
        responseTime,
        AgentsData.PERFORMANCE_THRESHOLDS.getAll
      );
      
      logger.info(`TC029: Response time: ${responseTime}ms`);
      logger.info('TC029: Test passed');
    });
  });

  test.describe('Data Integrity Scenarios', () => {
    test('TC030: Should return consistent data structure', async () => {
      logger.info('TC030: Validating data structure consistency');
      
      const response = await agentsService.getAllAgents();
      
      expect(response.status).toBe(200);
      
      const responseBody = await response.json();
      const agents = Array.isArray(responseBody) ? responseBody : responseBody.data;
      
      if (agents && agents.length > 0) {
        // Validate all agents have consistent structure
        agents.forEach((agent, index) => {
          agentsService.validator.validateAgentObject(agent, `Agent ${index}`);
        });
      }
      
      logger.info('TC030: Test passed');
    });
  });
});