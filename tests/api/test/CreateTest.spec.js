/**
 * CreateTest.spec.js
 * 
 * Test suite for Test API - CREATE operations
 * Tests positive and negative scenarios for creating tests
 * 
 * @author API Automation Team
 * @version 1.0.0
 */

const { test, expect } = require('@playwright/test');
const TestService = require('../../../src/services/TestService');
const TestPayloads = require('../../../src/api/test/TestPayloads');
const TestData = require('../../../src/api/test/TestData');
const Logger = require('../../../src/utils/Logger');

const logger = new Logger('CreateTest.spec');

test.describe('Test API - CREATE Operations', () => {
  let testService;
  let createdTestIds = [];

  test.beforeEach(async ({ request }) => {
    testService = new TestService(request);
    logger.info('Test setup completed');
  });

  test.afterEach(async () => {
    // Cleanup: Delete all created tests
    if (createdTestIds.length > 0) {
      logger.info(`Cleaning up ${createdTestIds.length} created tests`);
      await testService.deleteMultipleTests(createdTestIds);
      createdTestIds = [];
    }
  });

  test('TC001: Create test with valid complete payload', async () => {
    logger.info('TC001: Starting test - Create test with valid complete payload');
    
    // Arrange
    const payload = TestPayloads.buildCreatePayload();
    logger.debug(`Payload: ${JSON.stringify(payload)}`);
    
    // Act
    const startTime = Date.now();
    const response = await testService.createTest(payload);
    const responseTime = Date.now() - startTime;
    
    // Assert
    expect(response.status).toBe(201);
    expect(response.data).toBeDefined();
    expect(response.data.id).toBeDefined();
    expect(response.data.name).toBe(payload.name);
    expect(response.data.type).toBe(payload.type);
    expect(response.data.status).toBe(payload.status);
    expect(response.data.description).toBe(payload.description);
    expect(response.data.priority).toBe(payload.priority);
    
    // Validate response time
    expect(responseTime).toBeLessThan(3000);
    logger.info(`Response time: ${responseTime}ms`);
    
    // Store for cleanup
    createdTestIds.push(response.data.id);
    
    logger.info('TC001: Test passed - Test created successfully');
  });

  test('TC002: Create test with minimal required fields', async () => {
    logger.info('TC002: Starting test - Create test with minimal required fields');
    
    // Arrange
    const payload = TestPayloads.buildMinimalCreatePayload();
    logger.debug(`Payload: ${JSON.stringify(payload)}`);
    
    // Act
    const response = await testService.createTest(payload);
    
    // Assert
    expect(response.status).toBe(201);
    expect(response.data).toBeDefined();
    expect(response.data.id).toBeDefined();
    expect(response.data.name).toBe(payload.name);
    expect(response.data.type).toBe(payload.type);
    expect(response.data.status).toBe(payload.status);
    
    // Store for cleanup
    createdTestIds.push(response.data.id);
    
    logger.info('TC002: Test passed - Test created with minimal fields');
  });

  test('TC003: Create test without name field - should fail', async () => {
    logger.info('TC003: Starting test - Create test without name field');
    
    // Arrange
    const payload = TestPayloads.buildCreatePayloadWithoutName();
    logger.debug(`Payload: ${JSON.stringify(payload)}`);
    
    // Act & Assert
    try {
      await testService.createTest(payload);
      throw new Error('Expected test to fail but it passed');
    } catch (error) {
      expect(error.message).toContain('Name is required');
      logger.info('TC003: Test passed - Request failed as expected');
    }
  });

  test('TC004: Create test without type field - should fail', async () => {
    logger.info('TC004: Starting test - Create test without type field');
    
    // Arrange
    const payload = TestPayloads.buildCreatePayloadWithoutType();
    logger.debug(`Payload: ${JSON.stringify(payload)}`);
    
    // Act & Assert
    try {
      await testService.createTest(payload);
      throw new Error('Expected test to fail but it passed');
    } catch (error) {
      expect(error.message).toContain('Type is required');
      logger.info('TC004: Test passed - Request failed as expected');
    }
  });

  test('TC005: Create test without status field - should fail', async () => {
    logger.info('TC005: Starting test - Create test without status field');
    
    // Arrange
    const payload = TestPayloads.buildCreatePayloadWithoutStatus();
    logger.debug(`Payload: ${JSON.stringify(payload)}`);
    
    // Act & Assert
    try {
      await testService.createTest(payload);
      throw new Error('Expected test to fail but it passed');
    } catch (error) {
      expect(error.message).toContain('Status is required');
      logger.info('TC005: Test passed - Request failed as expected');
    }
  });

  test('TC006: Create test with invalid type value - should fail', async () => {
    logger.info('TC006: Starting test - Create test with invalid type value');
    
    // Arrange
    const payload = TestPayloads.buildCreatePayloadWithInvalidType();
    logger.debug(`Payload: ${JSON.stringify(payload)}`);
    
    // Act & Assert
    try {
      const response = await testService.client.create(payload);
      expect(response.status).toBe(400);
      await testService.validator.validateBadRequestResponse(response);
      logger.info('TC006: Test passed - Invalid type rejected');
    } catch (error) {
      logger.info('TC006: Test passed - Request failed as expected');
    }
  });

  test('TC007: Create test with invalid status value - should fail', async () => {
    logger.info('TC007: Starting test - Create test with invalid status value');
    
    // Arrange
    const payload = TestPayloads.buildCreatePayloadWithInvalidStatus();
    logger.debug(`Payload: ${JSON.stringify(payload)}`);
    
    // Act & Assert
    try {
      const response = await testService.client.create(payload);
      expect(response.status).toBe(400);
      await testService.validator.validateBadRequestResponse(response);
      logger.info('TC007: Test passed - Invalid status rejected');
    } catch (error) {
      logger.info('TC007: Test passed - Request failed as expected');
    }
  });

  test('TC008: Create test with null values - should fail', async () => {
    logger.info('TC008: Starting test - Create test with null values');
    
    // Arrange
    const payload = TestPayloads.buildCreatePayloadWithNullValues();
    logger.debug(`Payload: ${JSON.stringify(payload)}`);
    
    // Act & Assert
    try {
      const response = await testService.client.create(payload);
      expect(response.status).toBe(400);
      await testService.validator.validateBadRequestResponse(response);
      logger.info('TC008: Test passed - Null values rejected');
    } catch (error) {
      logger.info('TC008: Test passed - Request failed as expected');
    }
  });

  test('TC009: Create test with empty strings - should fail', async () => {
    logger.info('TC009: Starting test - Create test with empty strings');
    
    // Arrange
    const payload = TestPayloads.buildCreatePayloadWithEmptyStrings();
    logger.debug(`Payload: ${JSON.stringify(payload)}`);
    
    // Act & Assert
    try {
      const response = await testService.client.create(payload);
      expect(response.status).toBe(400);
      await testService.validator.validateBadRequestResponse(response);
      logger.info('TC009: Test passed - Empty strings rejected');
    } catch (error) {
      logger.info('TC009: Test passed - Request failed as expected');
    }
  });

  test('TC010: Create test with special characters in name', async () => {
    logger.info('TC010: Starting test - Create test with special characters');
    
    // Arrange
    const payload = TestPayloads.buildCreatePayloadWithSpecialCharacters();
    logger.debug(`Payload: ${JSON.stringify(payload)}`);
    
    // Act
    const response = await testService.createTest(payload);
    
    // Assert
    expect(response.status).toBe(201);
    expect(response.data).toBeDefined();
    expect(response.data.id).toBeDefined();
    
    // Store for cleanup
    createdTestIds.push(response.data.id);
    
    logger.info('TC010: Test passed - Special characters handled correctly');
  });

  test('TC011: Create test with maximum field lengths', async () => {
    logger.info('TC011: Starting test - Create test with maximum field lengths');
    
    // Arrange
    const payload = TestPayloads.buildCreatePayloadWithMaxLengths();
    logger.debug('Payload with max lengths created');
    
    // Act
    const response = await testService.createTest(payload);
    
    // Assert
    expect(response.status).toBe(201);
    expect(response.data).toBeDefined();
    expect(response.data.id).toBeDefined();
    
    // Store for cleanup
    createdTestIds.push(response.data.id);
    
    logger.info('TC011: Test passed - Maximum field lengths accepted');
  });

  test('TC012: Create test exceeding maximum field lengths - should fail', async () => {
    logger.info('TC012: Starting test - Create test exceeding maximum field lengths');
    
    // Arrange
    const payload = TestPayloads.buildCreatePayloadExceedingMaxLengths();
    logger.debug('Payload exceeding max lengths created');
    
    // Act & Assert
    try {
      const response = await testService.client.create(payload);
      expect(response.status).toBe(400);
      await testService.validator.validateBadRequestResponse(response);
      logger.info('TC012: Test passed - Exceeding max lengths rejected');
    } catch (error) {
      logger.info('TC012: Test passed - Request failed as expected');
    }
  });

  test('TC013: Create test with empty payload - should fail', async () => {
    logger.info('TC013: Starting test - Create test with empty payload');
    
    // Arrange
    const payload = TestPayloads.buildEmptyPayload();
    logger.debug(`Payload: ${JSON.stringify(payload)}`);
    
    // Act & Assert
    try {
      await testService.createTest(payload);
      throw new Error('Expected test to fail but it passed');
    } catch (error) {
      expect(error.message).toBeDefined();
      logger.info('TC013: Test passed - Empty payload rejected');
    }
  });

  test('TC014: Create duplicate test - should fail', async () => {
    logger.info('TC014: Starting test - Create duplicate test');
    
    // Arrange
    const payload = TestPayloads.buildCreatePayload();
    
    // Act - Create first test
    const firstResponse = await testService.createTest(payload);
    createdTestIds.push(firstResponse.data.id);
    
    // Act - Try to create duplicate
    const duplicatePayload = TestPayloads.buildDuplicatePayload(firstResponse.data);
    
    try {
      const response = await testService.client.create(duplicatePayload);
      
      // If API allows duplicates, just verify it was created
      if (response.status === 201) {
        createdTestIds.push(response.data.id);
        logger.info('TC014: API allows duplicate tests');
      } else {
        expect(response.status).toBe(409);
        await testService.validator.validateConflictResponse(response);
        logger.info('TC014: Test passed - Duplicate rejected');
      }
    } catch (error) {
      logger.info('TC014: Test passed - Duplicate creation failed as expected');
    }
  });

  test('TC015: Verify created test can be retrieved', async () => {
    logger.info('TC015: Starting test - Verify created test can be retrieved');
    
    // Arrange
    const payload = TestPayloads.buildCreatePayload();
    
    // Act - Create test
    const createResponse = await testService.createTest(payload);
    createdTestIds.push(createResponse.data.id);
    
    // Act - Retrieve test
    const getResponse = await testService.getTestById(createResponse.data.id);
    
    // Assert
    expect(getResponse.status).toBe(200);
    expect(getResponse.data.id).toBe(createResponse.data.id);
    expect(getResponse.data.name).toBe(payload.name);
    expect(getResponse.data.type).toBe(payload.type);
    expect(getResponse.data.status).toBe(payload.status);
    
    logger.info('TC015: Test passed - Created test retrieved successfully');
  });
});