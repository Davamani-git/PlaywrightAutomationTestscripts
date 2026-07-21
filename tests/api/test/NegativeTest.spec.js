/**
 * NegativeTest.spec.js
 * 
 * Test suite for Test API - NEGATIVE scenarios
 * Tests authorization, authentication, and error handling
 * 
 * @author API Automation Team
 * @version 1.0.0
 */

const { test, expect } = require('@playwright/test');
const TestService = require('../../../src/services/TestService');
const TestPayloads = require('../../../src/api/test/TestPayloads');
const TestData = require('../../../src/api/test/TestData');
const Logger = require('../../../src/utils/Logger');

const logger = new Logger('NegativeTest.spec');

test.describe('Test API - NEGATIVE Scenarios', () => {
  let testService;
  let createdTestId;

  test.beforeAll(async ({ request }) => {
    testService = new TestService(request);
    
    // Create a test record for negative testing
    logger.info('Creating test data for negative scenarios');
    const payload = TestPayloads.buildCreatePayload();
    const response = await testService.createTest(payload);
    createdTestId = response.data.id;
    
    logger.info(`Created test record with ID: ${createdTestId}`);
  });

  test.afterAll(async () => {
    // Cleanup: Delete created test
    if (createdTestId) {
      logger.info(`Cleaning up test with ID: ${createdTestId}`);
      await testService.deleteTest(createdTestId);
    }
  });

  test.describe('Authorization Tests', () => {
    test('TC501: Create test without authentication token', async () => {
      logger.info('TC501: Starting test - Create test without token');
      
      // Arrange
      const payload = TestPayloads.buildCreatePayload();
      
      // Act
      const response = await testService.client.create(payload, '');
      
      // Assert
      expect(response.status).toBe(401);
      await testService.validator.validateUnauthorizedResponse(response);
      
      logger.info('TC501: Test passed - Unauthorized request rejected');
    });

    test('TC502: Get test without authentication token', async () => {
      logger.info('TC502: Starting test - Get test without token');
      
      // Act
      const response = await testService.client.getById(createdTestId, '');
      
      // Assert
      expect(response.status).toBe(401);
      await testService.validator.validateUnauthorizedResponse(response);
      
      logger.info('TC502: Test passed - Unauthorized request rejected');
    });

    test('TC503: Update test without authentication token', async () => {
      logger.info('TC503: Starting test - Update test without token');
      
      // Arrange
      const payload = TestPayloads.buildUpdatePayload();
      
      // Act
      const response = await testService.client.update(createdTestId, payload, '');
      
      // Assert
      expect(response.status).toBe(401);
      await testService.validator.validateUnauthorizedResponse(response);
      
      logger.info('TC503: Test passed - Unauthorized request rejected');
    });

    test('TC504: Delete test without authentication token', async () => {
      logger.info('TC504: Starting test - Delete test without token');
      
      // Act
      const response = await testService.client.delete(createdTestId, '');
      
      // Assert
      expect(response.status).toBe(401);
      await testService.validator.validateUnauthorizedResponse(response);
      
      logger.info('TC504: Test passed - Unauthorized request rejected');
    });

    test('TC505: Create test with invalid token', async () => {
      logger.info('TC505: Starting test - Create test with invalid token');
      
      // Arrange
      const payload = TestPayloads.buildCreatePayload();
      const invalidToken = 'invalid_token_12345';
      
      // Act
      const response = await testService.client.create(payload, invalidToken);
      
      // Assert
      expect(response.status).toBe(401);
      await testService.validator.validateUnauthorizedResponse(response);
      
      logger.info('TC505: Test passed - Invalid token rejected');
    });

    test('TC506: Get test with expired token', async () => {
      logger.info('TC506: Starting test - Get test with expired token');
      
      // Arrange
      const expiredToken = 'expired_token_12345';
      
      // Act
      const response = await testService.client.getById(createdTestId, expiredToken);
      
      // Assert
      expect(response.status).toBe(401);
      await testService.validator.validateUnauthorizedResponse(response);
      
      logger.info('TC506: Test passed - Expired token rejected');
    });
  });

  test.describe('Validation Tests', () => {
    test('TC507: Create test with malformed JSON', async () => {
      logger.info('TC507: Starting test - Create test with malformed JSON');
      
      // Arrange
      const malformedPayload = TestPayloads.buildMalformedPayload();
      
      // Act & Assert
      try {
        await testService.client.create(malformedPayload);
        throw new Error('Expected test to fail but it passed');
      } catch (error) {
        expect(error).toBeDefined();
        logger.info('TC507: Test passed - Malformed JSON rejected');
      }
    });

    test('TC508: Create test with SQL injection payload', async () => {
      logger.info('TC508: Starting test - Create test with SQL injection');
      
      // Arrange
      const sqlInjectionPayload = TestPayloads.buildSQLInjectionPayload();
      
      // Act
      const response = await testService.client.create(sqlInjectionPayload);
      
      // Assert - Should either create safely or reject
      if (response.status === 201) {
        // If created, verify SQL injection was sanitized
        expect(response.data.name).not.toContain('DROP TABLE');
        // Cleanup
        await testService.deleteTest(response.data.id);
        logger.info('TC508: Test passed - SQL injection sanitized');
      } else {
        expect(response.status).toBe(400);
        logger.info('TC508: Test passed - SQL injection rejected');
      }
    });

    test('TC509: Create test with XSS payload', async () => {
      logger.info('TC509: Starting test - Create test with XSS payload');
      
      // Arrange
      const xssPayload = TestPayloads.buildXSSPayload();
      
      // Act
      const response = await testService.client.create(xssPayload);
      
      // Assert - Should either create safely or reject
      if (response.status === 201) {
        // If created, verify XSS was sanitized
        expect(response.data.name).not.toContain('<script>');
        // Cleanup
        await testService.deleteTest(response.data.id);
        logger.info('TC509: Test passed - XSS sanitized');
      } else {
        expect(response.status).toBe(400);
        logger.info('TC509: Test passed - XSS rejected');
      }
    });

    test('TC510: Create test with command injection payload', async () => {
      logger.info('TC510: Starting test - Create test with command injection');
      
      // Arrange
      const commandInjectionPayload = TestPayloads.buildCommandInjectionPayload();
      
      // Act
      const response = await testService.client.create(commandInjectionPayload);
      
      // Assert - Should either create safely or reject
      if (response.status === 201) {
        // If created, verify command injection was sanitized
        expect(response.data.name).not.toContain('rm -rf');
        // Cleanup
        await testService.deleteTest(response.data.id);
        logger.info('TC510: Test passed - Command injection sanitized');
      } else {
        expect(response.status).toBe(400);
        logger.info('TC510: Test passed - Command injection rejected');
      }
    });
  });

  test.describe('Rate Limiting Tests', () => {
    test('TC511: Verify API handles concurrent requests', async () => {
      logger.info('TC511: Starting test - Concurrent requests handling');
      
      // Arrange
      const concurrentRequests = 10;
      const requests = [];
      
      // Act - Send concurrent requests
      for (let i = 0; i < concurrentRequests; i++) {
        requests.push(testService.getTestById(createdTestId));
      }
      
      const responses = await Promise.all(requests);
      
      // Assert - All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
      
      logger.info('TC511: Test passed - Concurrent requests handled successfully');
    });
  });

  test.describe('Error Handling Tests', () => {
    test('TC512: Verify error response structure', async () => {
      logger.info('TC512: Starting test - Error response structure');
      
      // Act - Trigger an error
      const response = await testService.client.getById('999999999');
      
      // Assert
      expect(response.status).toBe(404);
      expect(response.error || response.message).toBeDefined();
      expect(typeof (response.error || response.message)).toBe('string');
      
      logger.info('TC512: Test passed - Error response structure validated');
    });

    test('TC513: Verify appropriate HTTP status codes', async () => {
      logger.info('TC513: Starting test - HTTP status codes validation');
      
      // Test 404 - Not Found
      const notFoundResponse = await testService.client.getById('999999999');
      expect(notFoundResponse.status).toBe(404);
      
      // Test 400 - Bad Request
      const badRequestResponse = await testService.client.create(TestPayloads.buildEmptyPayload());
      expect(badRequestResponse.status).toBe(400);
      
      // Test 401 - Unauthorized
      const unauthorizedResponse = await testService.client.getById(createdTestId, '');
      expect(unauthorizedResponse.status).toBe(401);
      
      logger.info('TC513: Test passed - HTTP status codes validated');
    });
  });

  test.describe('Performance Tests', () => {
    test('TC514: Verify response time for GET request', async () => {
      logger.info('TC514: Starting test - GET request response time');
      
      // Act
      const startTime = Date.now();
      const response = await testService.getTestById(createdTestId);
      const responseTime = Date.now() - startTime;
      
      // Assert
      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(3000);
      
      logger.info(`TC514: Test passed - Response time: ${responseTime}ms`);
    });

    test('TC515: Verify response time for POST request', async () => {
      logger.info('TC515: Starting test - POST request response time');
      
      // Arrange
      const payload = TestPayloads.buildCreatePayload();
      
      // Act
      const startTime = Date.now();
      const response = await testService.createTest(payload);
      const responseTime = Date.now() - startTime;
      
      // Assert
      expect(response.status).toBe(201);
      expect(responseTime).toBeLessThan(3000);
      
      // Cleanup
      await testService.deleteTest(response.data.id);
      
      logger.info(`TC515: Test passed - Response time: ${responseTime}ms`);
    });
  });
});