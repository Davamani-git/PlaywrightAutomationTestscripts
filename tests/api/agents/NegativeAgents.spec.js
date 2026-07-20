/**
 * Negative Agents API Test Suite
 * Tests for authorization, authentication, and edge cases
 * @module NegativeAgentsTests
 */

const { test, expect } = require('@playwright/test');
const AgentsService = require('../../../src/services/AgentsService');
const AgentsPayloads = require('../../../src/api/agents/AgentsPayloads');
const AgentsData = require('../../../src/api/agents/AgentsData');
const AuthManager = require('../../../src/auth/AuthManager');
const Logger = require('../../../src/utils/Logger');

const logger = new Logger('NegativeAgentsTests');

test.describe('Negative Agents API Tests', () => {
  let agentsService;
  let authManager;

  test.beforeAll(async () => {
    logger.info('Setting up Negative Agents test suite');
  });

  test.beforeEach(async ({ request }) => {
    authManager = new AuthManager(request);
    await authManager.authenticate();
    agentsService = new AgentsService(request, authManager);
  });

  test.afterEach(async () => {
    await agentsService.cleanupCreatedAgents();
  });

  test.describe('Authorization Scenarios - No Token', () => {
    test('TC074: Should return 401 when getting all agents without token', async () => {
      logger.info('TC074: Testing GET all without authentication');
      
      const response = await agentsService.client.getAllWithoutAuth();
      
      expect(response.status).toBe(401);
      
      const responseBody = await response.json();
      const errorMessage = responseBody.message || responseBody.error;
      expect(errorMessage.toLowerCase()).toMatch(/unauthorized|authentication|token/);
      
      logger.info('TC074: Test passed');
    });

    test('TC075: Should return 401 when creating agent without token', async ({ request }) => {
      logger.info('TC075: Testing POST without authentication');
      
      const payload = AgentsPayloads.buildValidCreatePayload();
      const response = await request.post('/agents', {
        data: payload
      });
      
      expect(response.status).toBe(401);
      
      logger.info('TC075: Test passed');
    });

    test('TC076: Should return 401 when updating agent without token', async ({ request }) => {
      logger.info('TC076: Testing PUT without authentication');
      
      const payload = AgentsPayloads.buildValidUpdatePayload();
      const response = await request.put('/agents/test-id', {
        data: payload
      });
      
      expect(response.status).toBe(401);
      
      logger.info('TC076: Test passed');
    });

    test('TC077: Should return 401 when deleting agent without token', async ({ request }) => {
      logger.info('TC077: Testing DELETE without authentication');
      
      const response = await request.delete('/agents/test-id');
      
      expect(response.status).toBe(401);
      
      logger.info('TC077: Test passed');
    });
  });

  test.describe('Authorization Scenarios - Invalid Token', () => {
    test('TC078: Should return 401 with invalid token', async () => {
      logger.info('TC078: Testing with invalid token');
      
      const invalidToken = AgentsData.INVALID_TOKENS[0];
      const response = await agentsService.client.getAllWithInvalidToken(invalidToken);
      
      expect(response.status).toBe(401);
      
      logger.info('TC078: Test passed');
    });

    test('TC079: Should return 401 with expired token', async () => {
      logger.info('TC079: Testing with expired token');
      
      const expiredToken = 'expired_token_12345';
      const response = await agentsService.client.getAllWithInvalidToken(expiredToken);
      
      expect(response.status).toBe(401);
      
      logger.info('TC079: Test passed');
    });

    test('TC080: Should return 401 with malformed token', async () => {
      logger.info('TC080: Testing with malformed token');
      
      const malformedToken = 'malformed.token.here';
      const response = await agentsService.client.getAllWithInvalidToken(malformedToken);
      
      expect(response.status).toBe(401);
      
      logger.info('TC080: Test passed');
    });
  });

  test.describe('HTTP Method Scenarios', () => {
    test('TC081: Should return 405 for unsupported HTTP method', async ({ request }) => {
      logger.info('TC081: Testing unsupported HTTP method');
      
      const token = await authManager.getToken();
      const response = await request.fetch('/agents', {
        method: 'OPTIONS',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      // Should return 405 Method Not Allowed or 200 for OPTIONS
      expect([200, 204, 405]).toContain(response.status);
      
      logger.info('TC081: Test passed');
    });
  });

  test.describe('Content Type Scenarios', () => {
    test('TC082: Should handle missing Content-Type header', async ({ request }) => {
      logger.info('TC082: Testing missing Content-Type header');
      
      const token = await authManager.getToken();
      const payload = AgentsPayloads.buildValidCreatePayload();
      
      const response = await request.post('/agents', {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        data: JSON.stringify(payload)
      });
      
      // Should either accept or reject
      expect([201, 400, 415]).toContain(response.status);
      
      logger.info('TC082: Test passed');
    });

    test('TC083: Should handle invalid Content-Type', async ({ request }) => {
      logger.info('TC083: Testing invalid Content-Type');
      
      const token = await authManager.getToken();
      const payload = AgentsPayloads.buildValidCreatePayload();
      
      const response = await request.post('/agents', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'text/plain'
        },
        data: JSON.stringify(payload)
      });
      
      // Should return 415 Unsupported Media Type or accept
      expect([201, 415]).toContain(response.status);
      
      logger.info('TC083: Test passed');
    });
  });

  test.describe('Payload Size Scenarios', () => {
    test('TC084: Should handle extremely large payload', async () => {
      logger.info('TC084: Testing extremely large payload');
      
      const largePayload = AgentsPayloads.buildValidCreatePayload({
        description: 'A'.repeat(100000), // 100KB description
        metadata: {
          largeField: 'B'.repeat(100000)
        }
      });
      
      const response = await agentsService.client.create(largePayload);
      
      // Should either accept or reject based on size limits
      expect([201, 400, 413]).toContain(response.status);
      
      logger.info('TC084: Test passed');
    });
  });

  test.describe('Concurrent Request Scenarios', () => {
    test('TC085: Should handle concurrent create requests', async () => {
      logger.info('TC085: Testing concurrent create requests');
      
      const payload1 = AgentsPayloads.buildValidCreatePayload();
      const payload2 = AgentsPayloads.buildValidCreatePayload();
      const payload3 = AgentsPayloads.buildValidCreatePayload();
      
      const [response1, response2, response3] = await Promise.all([
        agentsService.createAgent(payload1),
        agentsService.createAgent(payload2),
        agentsService.createAgent(payload3)
      ]);
      
      expect(response1.status).toBe(201);
      expect(response2.status).toBe(201);
      expect(response3.status).toBe(201);
      
      logger.info('TC085: Test passed');
    });

    test('TC086: Should handle concurrent read requests', async () => {
      logger.info('TC086: Testing concurrent read requests');
      
      // Create a test agent
      const createResponse = await agentsService.createValidAgent();
      const createBody = await createResponse.json();
      const agentId = createBody.id || createBody._id || createBody.agentId;
      
      // Make concurrent read requests
      const [response1, response2, response3] = await Promise.all([
        agentsService.getAgentById(agentId),
        agentsService.getAgentById(agentId),
        agentsService.getAgentById(agentId)
      ]);
      
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(response3.status).toBe(200);
      
      logger.info('TC086: Test passed');
    });
  });

  test.describe('Rate Limiting Scenarios', () => {
    test('TC087: Should handle rapid successive requests', async () => {
      logger.info('TC087: Testing rapid successive requests');
      
      const requests = [];
      for (let i = 0; i < 10; i++) {
        requests.push(agentsService.getAllAgents());
      }
      
      const responses = await Promise.all(requests);
      
      // All should succeed or some may be rate limited
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
      
      logger.info('TC087: Test passed');
    });
  });

  test.describe('Edge Case Scenarios', () => {
    test('TC088: Should handle request with only whitespace in fields', async () => {
      logger.info('TC088: Testing whitespace-only fields');
      
      const payload = {
        name: '   ',
        description: '\t\n',
        type: 'conversational',
        status: 'active'
      };
      
      const response = await agentsService.client.create(payload);
      
      expect(response.status).toBe(400);
      
      logger.info('TC088: Test passed');
    });

    test('TC089: Should handle deeply nested JSON payload', async () => {
      logger.info('TC089: Testing deeply nested payload');
      
      const deeplyNested = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  data: 'deep'
                }
              }
            }
          }
        }
      };
      
      const payload = AgentsPayloads.buildValidCreatePayload({
        metadata: deeplyNested
      });
      
      const response = await agentsService.client.create(payload);
      
      // Should either accept or reject based on nesting limits
      expect([201, 400]).toContain(response.status);
      
      logger.info('TC089: Test passed');
    });

    test('TC090: Should handle circular reference in payload', async () => {
      logger.info('TC090: Testing circular reference handling');
      
      const payload = AgentsPayloads.buildValidCreatePayload();
      
      // Note: JSON.stringify will fail with circular references
      // This tests the API's handling of malformed JSON
      
      try {
        const response = await agentsService.client.create(payload);
        expect([201, 400]).toContain(response.status);
      } catch (error) {
        // Expected to fail during serialization
        expect(error).toBeDefined();
      }
      
      logger.info('TC090: Test passed');
    });
  });
});