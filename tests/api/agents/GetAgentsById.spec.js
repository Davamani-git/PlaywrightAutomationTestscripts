/**
 * Get Agent By ID API Test Suite
 * Tests for retrieving specific agent via GET /agents/{id} endpoint
 * @module GetAgentsByIdTests
 */

const { test, expect } = require('@playwright/test');
const AgentsService = require('../../../src/services/AgentsService');
const AgentsData = require('../../../src/api/agents/AgentsData');
const AuthManager = require('../../../src/auth/AuthManager');
const Logger = require('../../../src/utils/Logger');

const logger = new Logger('GetAgentsByIdTests');

test.describe('Get Agent By ID API Tests', () => {
  let agentsService;
  let authManager;
  let testAgentId;

  test.beforeAll(async () => {
    logger.info('Setting up Get Agent By ID test suite');
  });

  test.beforeEach(async ({ request }) => {
    authManager = new AuthManager(request);
    await authManager.authenticate();
    agentsService = new AgentsService(request, authManager);
    
    // Create a test agent for retrieval tests
    const createResponse = await agentsService.createValidAgent();
    const createBody = await createResponse.json();
    testAgentId = createBody.id || createBody._id || createBody.agentId;
    logger.info(`Created test agent with ID: ${testAgentId}`);
  });

  test.afterEach(async () => {
    await agentsService.cleanupCreatedAgents();
  });

  test.describe('Positive Scenarios', () => {
    test('TC031: Should retrieve agent by valid ID', async () => {
      logger.info('TC031: Retrieving agent by valid ID');
      
      const startTime = Date.now();
      const response = await agentsService.getAgentById(testAgentId);
      const responseTime = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      
      const responseBody = await response.json();
      const agentId = responseBody.id || responseBody._id || responseBody.agentId;
      expect(agentId).toBe(testAgentId);
      
      // Validate response time
      agentsService.validator.validateResponseTime(responseTime, AgentsData.PERFORMANCE_THRESHOLDS.getById);
      
      logger.info('TC031: Test passed');
    });

    test('TC032: Should retrieve agent with all fields populated', async () => {
      logger.info('TC032: Validating all agent fields');
      
      const response = await agentsService.getAgentById(testAgentId);
      
      expect(response.status).toBe(200);
      
      const responseBody = await response.json();
      
      // Validate all expected fields
      expect(responseBody.name).toBeDefined();
      expect(responseBody.type).toBeDefined();
      expect(responseBody.status).toBeDefined();
      
      logger.info('TC032: Test passed');
    });

    test('TC033: Should retrieve agent multiple times consistently', async () => {
      logger.info('TC033: Testing consistency of multiple retrievals');
      
      const response1 = await agentsService.getAgentById(testAgentId);
      const body1 = await response1.json();
      
      const response2 = await agentsService.getAgentById(testAgentId);
      const body2 = await response2.json();
      
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      
      // Validate data consistency
      expect(body1.name).toBe(body2.name);
      expect(body1.type).toBe(body2.type);
      expect(body1.status).toBe(body2.status);
      
      logger.info('TC033: Test passed');
    });

    test('TC034: Should retrieve recently created agent', async () => {
      logger.info('TC034: Retrieving recently created agent');
      
      // Create new agent
      const createResponse = await agentsService.createValidAgent();
      const createBody = await createResponse.json();
      const newAgentId = createBody.id || createBody._id || createBody.agentId;
      
      // Retrieve immediately
      const getResponse = await agentsService.getAgentById(newAgentId);
      
      expect(getResponse.status).toBe(200);
      
      const getBody = await getResponse.json();
      expect(getBody.name).toBe(createBody.name);
      
      logger.info('TC034: Test passed');
    });
  });

  test.describe('Negative Scenarios - Invalid ID', () => {
    test('TC035: Should return 404 for non-existent agent ID', async () => {
      logger.info('TC035: Testing non-existent agent ID');
      
      const invalidId = 'non-existent-agent-id-12345';
      const response = await agentsService.client.getById(invalidId);
      
      expect(response.status).toBe(404);
      
      const responseBody = await response.json();
      const errorMessage = responseBody.message || responseBody.error;
      expect(errorMessage.toLowerCase()).toMatch(/not found|does not exist/);
      
      logger.info('TC035: Test passed');
    });

    test('TC036: Should return 400 for invalid ID format', async () => {
      logger.info('TC036: Testing invalid ID format');
      
      const invalidId = 'invalid@#$%^&*()id';
      const response = await agentsService.client.getById(invalidId);
      
      expect([400, 404]).toContain(response.status);
      
      logger.info('TC036: Test passed');
    });

    test('TC037: Should return 400 for empty ID', async () => {
      logger.info('TC037: Testing empty ID');
      
      const response = await agentsService.client.getById('');
      
      expect([400, 404]).toContain(response.status);
      
      logger.info('TC037: Test passed');
    });

    test('TC038: Should return 400 for null ID', async () => {
      logger.info('TC038: Testing null ID');
      
      const response = await agentsService.client.getById(null);
      
      expect([400, 404]).toContain(response.status);
      
      logger.info('TC038: Test passed');
    });

    test('TC039: Should return 400 for undefined ID', async () => {
      logger.info('TC039: Testing undefined ID');
      
      const response = await agentsService.client.getById(undefined);
      
      expect([400, 404]).toContain(response.status);
      
      logger.info('TC039: Test passed');
    });

    test('TC040: Should return 404 for deleted agent ID', async () => {
      logger.info('TC040: Testing deleted agent ID');
      
      // Delete the test agent
      await agentsService.deleteAgent(testAgentId);
      
      // Try to retrieve deleted agent
      const response = await agentsService.client.getById(testAgentId);
      
      expect(response.status).toBe(404);
      
      logger.info('TC040: Test passed');
    });
  });

  test.describe('Performance Scenarios', () => {
    test('TC041: Should meet performance threshold for get by ID', async () => {
      logger.info('TC041: Testing performance threshold');
      
      const startTime = Date.now();
      const response = await agentsService.getAgentById(testAgentId);
      const responseTime = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      
      agentsService.validator.validateResponseTime(
        responseTime,
        AgentsData.PERFORMANCE_THRESHOLDS.getById
      );
      
      logger.info(`TC041: Response time: ${responseTime}ms`);
      logger.info('TC041: Test passed');
    });
  });

  test.describe('Data Integrity Scenarios', () => {
    test('TC042: Should return complete agent object structure', async () => {
      logger.info('TC042: Validating complete agent object structure');
      
      const response = await agentsService.getAgentById(testAgentId);
      
      expect(response.status).toBe(200);
      
      const responseBody = await response.json();
      
      // Validate complete object structure
      agentsService.validator.validateAgentObject(responseBody);
      
      logger.info('TC042: Test passed');
    });

    test('TC043: Should maintain data integrity after retrieval', async () => {
      logger.info('TC043: Testing data integrity');
      
      // Get original data
      const response1 = await agentsService.getAgentById(testAgentId);
      const body1 = await response1.json();
      
      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Get data again
      const response2 = await agentsService.getAgentById(testAgentId);
      const body2 = await response2.json();
      
      // Verify data hasn't changed
      expect(body1.name).toBe(body2.name);
      expect(body1.type).toBe(body2.type);
      expect(body1.status).toBe(body2.status);
      
      logger.info('TC043: Test passed');
    });
  });
});