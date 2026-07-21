/**
 * GetTestById.spec.js
 * 
 * Test suite for Test API - GET BY ID operations
 * Tests retrieval of specific test records by ID
 * 
 * @author API Automation Team
 * @version 1.0.0
 */

const { test, expect } = require('@playwright/test');
const TestService = require('../../../src/services/TestService');
const TestPayloads = require('../../../src/api/test/TestPayloads');
const TestData = require('../../../src/api/test/TestData');
const Logger = require('../../../src/utils/Logger');

const logger = new Logger('GetTestById.spec');

test.describe('Test API - GET BY ID Operations', () => {
  let testService;
  let createdTestId;
  let createdTestData;

  test.beforeAll(async ({ request }) => {
    testService = new TestService(request);
    
    // Create a test record for GET BY ID operations
    logger.info('Creating test data for GET BY ID operations');
    const payload = TestPayloads.buildCreatePayload();
    const response = await testService.createTest(payload);
    createdTestId = response.data.id;
    createdTestData = response.data;
    
    logger.info(`Created test record with ID: ${createdTestId}`);
  });

  test.afterAll(async () => {
    // Cleanup: Delete created test
    if (createdTestId) {
      logger.info(`Cleaning up test with ID: ${createdTestId}`);
      await testService.deleteTest(createdTestId);
    }
  });

  test('TC201: Get test by valid ID', async () => {
    logger.info('TC201: Starting test - Get test by valid ID');
    
    // Act
    const startTime = Date.now();
    const response = await testService.getTestById(createdTestId);
    const responseTime = Date.now() - startTime;
    
    // Assert
    expect(response.status).toBe(200);
    expect(response.data).toBeDefined();
    expect(response.data.id).toBe(createdTestId);
    expect(response.data.name).toBe(createdTestData.name);
    expect(response.data.type).toBe(createdTestData.type);
    expect(response.data.status).toBe(createdTestData.status);
    
    // Validate response time
    expect(responseTime).toBeLessThan(3000);
    logger.info(`Response time: ${responseTime}ms`);
    
    logger.info('TC201: Test passed - Test retrieved successfully');
  });

  test('TC202: Get test by non-existent ID', async () => {
    logger.info('TC202: Starting test - Get test by non-existent ID');
    
    // Arrange
    const nonExistentId = '999999999';
    
    // Act
    const response = await testService.client.getById(nonExistentId);
    
    // Assert
    expect(response.status).toBe(404);
    await testService.validator.validateNotFoundResponse(response);
    
    logger.info('TC202: Test passed - Non-existent ID returns 404');
  });

  test('TC203: Get test by null ID', async () => {
    logger.info('TC203: Starting test - Get test by null ID');
    
    // Act & Assert
    try {
      await testService.getTestById(null);
      throw new Error('Expected test to fail but it passed');
    } catch (error) {
      expect(error.message).toContain('Test ID');
      logger.info('TC203: Test passed - Null ID rejected');
    }
  });

  test('TC204: Get test by undefined ID', async () => {
    logger.info('TC204: Starting test - Get test by undefined ID');
    
    // Act & Assert
    try {
      await testService.getTestById(undefined);
      throw new Error('Expected test to fail but it passed');
    } catch (error) {
      expect(error.message).toContain('Test ID');
      logger.info('TC204: Test passed - Undefined ID rejected');
    }
  });

  test('TC205: Get test by empty string ID', async () => {
    logger.info('TC205: Starting test - Get test by empty string ID');
    
    // Act & Assert
    try {
      await testService.getTestById('');
      throw new Error('Expected test to fail but it passed');
    } catch (error) {
      expect(error.message).toContain('Test ID');
      logger.info('TC205: Test passed - Empty string ID rejected');
    }
  });

  test('TC206: Get test by invalid ID format', async () => {
    logger.info('TC206: Starting test - Get test by invalid ID format');
    
    // Arrange
    const invalidIds = TestData.getInvalidIds().filter(id => id !== null && id !== undefined && id !== '');
    
    // Act & Assert
    for (const invalidId of invalidIds.slice(0, 3)) { // Test first 3 invalid IDs
      logger.debug(`Testing invalid ID: ${invalidId}`);
      const response = await testService.client.getById(invalidId);
      
      // Should return 400 or 404
      expect([400, 404]).toContain(response.status);
    }
    
    logger.info('TC206: Test passed - Invalid ID formats handled correctly');
  });

  test('TC207: Get test with SQL injection in ID', async () => {
    logger.info('TC207: Starting test - Get test with SQL injection in ID');
    
    // Arrange
    const sqlInjectionId = "1' OR '1'='1";
    
    // Act
    const response = await testService.client.getById(sqlInjectionId);
    
    // Assert - Should return 400 or 404, not 200
    expect([400, 404]).toContain(response.status);
    expect(response.status).not.toBe(200);
    
    logger.info('TC207: Test passed - SQL injection attempt blocked');
  });

  test('TC208: Get test with XSS in ID', async () => {
    logger.info('TC208: Starting test - Get test with XSS in ID');
    
    // Arrange
    const xssId = "<script>alert('XSS')</script>";
    
    // Act
    const response = await testService.client.getById(xssId);
    
    // Assert - Should return 400 or 404, not 200
    expect([400, 404]).toContain(response.status);
    expect(response.status).not.toBe(200);
    
    logger.info('TC208: Test passed - XSS attempt blocked');
  });

  test('TC209: Verify response schema for get by ID', async () => {
    logger.info('TC209: Starting test - Verify response schema');
    
    // Act
    const response = await testService.getTestById(createdTestId);
    
    // Assert
    expect(response.status).toBe(200);
    expect(response.data).toBeDefined();
    
    const testObject = response.data;
    
    // Required fields
    expect(testObject.id).toBeDefined();
    expect(testObject.name).toBeDefined();
    expect(testObject.type).toBeDefined();
    expect(testObject.status).toBeDefined();
    
    // Field types
    expect(typeof testObject.id).toMatch(/string|number/);
    expect(typeof testObject.name).toBe('string');
    expect(typeof testObject.type).toBe('string');
    expect(typeof testObject.status).toBe('string');
    
    // Optional fields types if present
    if (testObject.description !== undefined) {
      expect(typeof testObject.description).toBe('string');
    }
    if (testObject.priority !== undefined) {
      expect(typeof testObject.priority).toBe('string');
    }
    if (testObject.tags !== undefined) {
      expect(Array.isArray(testObject.tags)).toBeTruthy();
    }
    if (testObject.metadata !== undefined) {
      expect(typeof testObject.metadata).toBe('object');
    }
    if (testObject.configuration !== undefined) {
      expect(typeof testObject.configuration).toBe('object');
    }
    
    logger.info('TC209: Test passed - Response schema validated');
  });

  test('TC210: Verify test exists method', async () => {
    logger.info('TC210: Starting test - Verify test exists method');
    
    // Act - Check existing test
    const existsResult = await testService.testExists(createdTestId);
    
    // Assert
    expect(existsResult).toBeTruthy();
    
    // Act - Check non-existent test
    const notExistsResult = await testService.testExists('999999999');
    
    // Assert
    expect(notExistsResult).toBeFalsy();
    
    logger.info('TC210: Test passed - Test exists method working correctly');
  });
});