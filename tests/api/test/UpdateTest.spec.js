/**
 * UpdateTest.spec.js
 * 
 * Test suite for Test API - UPDATE operations
 * Tests updating existing test records
 * 
 * @author API Automation Team
 * @version 1.0.0
 */

const { test, expect } = require('@playwright/test');
const TestService = require('../../../src/services/TestService');
const TestPayloads = require('../../../src/api/test/TestPayloads');
const TestData = require('../../../src/api/test/TestData');
const Logger = require('../../../src/utils/Logger');

const logger = new Logger('UpdateTest.spec');

test.describe('Test API - UPDATE Operations', () => {
  let testService;
  let createdTestId;
  let createdTestData;

  test.beforeEach(async ({ request }) => {
    testService = new TestService(request);
    
    // Create a test record for UPDATE operations
    logger.info('Creating test data for UPDATE operations');
    const payload = TestPayloads.buildCreatePayload();
    const response = await testService.createTest(payload);
    createdTestId = response.data.id;
    createdTestData = response.data;
    
    logger.info(`Created test record with ID: ${createdTestId}`);
  });

  test.afterEach(async () => {
    // Cleanup: Delete created test
    if (createdTestId) {
      logger.info(`Cleaning up test with ID: ${createdTestId}`);
      try {
        await testService.deleteTest(createdTestId);
      } catch (error) {
        logger.warn(`Failed to cleanup test ${createdTestId}: ${error.message}`);
      }
    }
  });

  test('TC301: Update test with valid payload', async () => {
    logger.info('TC301: Starting test - Update test with valid payload');
    
    // Arrange
    const updatePayload = TestPayloads.buildUpdatePayload();
    logger.debug(`Update payload: ${JSON.stringify(updatePayload)}`);
    
    // Act
    const startTime = Date.now();
    const response = await testService.updateTest(createdTestId, updatePayload);
    const responseTime = Date.now() - startTime;
    
    // Assert
    expect(response.status).toBe(200);
    expect(response.data).toBeDefined();
    expect(response.data.id).toBe(createdTestId);
    expect(response.data.description).toBe(updatePayload.description);
    expect(response.data.status).toBe(updatePayload.status);
    expect(response.data.priority).toBe(updatePayload.priority);
    
    // Validate response time
    expect(responseTime).toBeLessThan(3000);
    logger.info(`Response time: ${responseTime}ms`);
    
    logger.info('TC301: Test passed - Test updated successfully');
  });

  test('TC302: Update test with partial payload', async () => {
    logger.info('TC302: Starting test - Update test with partial payload');
    
    // Arrange
    const partialPayload = TestPayloads.buildPartialUpdatePayload();
    logger.debug(`Partial update payload: ${JSON.stringify(partialPayload)}`);
    
    // Act
    const response = await testService.updateTest(createdTestId, partialPayload);
    
    // Assert
    expect(response.status).toBe(200);
    expect(response.data).toBeDefined();
    expect(response.data.id).toBe(createdTestId);
    expect(response.data.status).toBe(partialPayload.status);
    expect(response.data.priority).toBe(partialPayload.priority);
    
    // Verify unchanged fields remain the same
    expect(response.data.name).toBe(createdTestData.name);
    expect(response.data.type).toBe(createdTestData.type);
    
    logger.info('TC302: Test passed - Test partially updated successfully');
  });

  test('TC303: Update non-existent test', async () => {
    logger.info('TC303: Starting test - Update non-existent test');
    
    // Arrange
    const nonExistentId = '999999999';
    const updatePayload = TestPayloads.buildUpdatePayload();
    
    // Act
    const response = await testService.client.update(nonExistentId, updatePayload);
    
    // Assert
    expect(response.status).toBe(404);
    await testService.validator.validateNotFoundResponse(response);
    
    logger.info('TC303: Test passed - Non-existent test returns 404');
  });

  test('TC304: Update test with empty payload', async () => {
    logger.info('TC304: Starting test - Update test with empty payload');
    
    // Arrange
    const emptyPayload = TestPayloads.buildEmptyPayload();
    
    // Act & Assert
    try {
      await testService.updateTest(createdTestId, emptyPayload);
      throw new Error('Expected test to fail but it passed');
    } catch (error) {
      expect(error.message).toContain('empty');
      logger.info('TC304: Test passed - Empty payload rejected');
    }
  });

  test('TC305: Update test with null values', async () => {
    logger.info('TC305: Starting test - Update test with null values');
    
    // Arrange
    const nullPayload = TestPayloads.buildCreatePayloadWithNullValues();
    
    // Act
    const response = await testService.client.update(createdTestId, nullPayload);
    
    // Assert - Should return 400
    expect(response.status).toBe(400);
    await testService.validator.validateBadRequestResponse(response);
    
    logger.info('TC305: Test passed - Null values rejected');
  });

  test('TC306: Update test with invalid field value', async () => {
    logger.info('TC306: Starting test - Update test with invalid field value');
    
    // Arrange
    const invalidPayload = TestPayloads.buildUpdatePayloadWithInvalidField('status', 'invalid_status');
    
    // Act
    const response = await testService.client.update(createdTestId, invalidPayload);
    
    // Assert - Should return 400
    expect(response.status).toBe(400);
    await testService.validator.validateBadRequestResponse(response);
    
    logger.info('TC306: Test passed - Invalid field value rejected');
  });

  test('TC307: Update test with null ID', async () => {
    logger.info('TC307: Starting test - Update test with null ID');
    
    // Arrange
    const updatePayload = TestPayloads.buildUpdatePayload();
    
    // Act & Assert
    try {
      await testService.updateTest(null, updatePayload);
      throw new Error('Expected test to fail but it passed');
    } catch (error) {
      expect(error.message).toContain('Test ID');
      logger.info('TC307: Test passed - Null ID rejected');
    }
  });

  test('TC308: Update test with invalid ID format', async () => {
    logger.info('TC308: Starting test - Update test with invalid ID format');
    
    // Arrange
    const invalidId = 'invalid-id-format';
    const updatePayload = TestPayloads.buildUpdatePayload();
    
    // Act
    const response = await testService.client.update(invalidId, updatePayload);
    
    // Assert - Should return 400 or 404
    expect([400, 404]).toContain(response.status);
    
    logger.info('TC308: Test passed - Invalid ID format handled correctly');
  });

  test('TC309: Update test and verify changes persisted', async () => {
    logger.info('TC309: Starting test - Update test and verify changes persisted');
    
    // Arrange
    const updatePayload = TestPayloads.buildUpdatePayload();
    
    // Act - Update test
    const updateResponse = await testService.updateTest(createdTestId, updatePayload);
    
    // Act - Retrieve updated test
    const getResponse = await testService.getTestById(createdTestId);
    
    // Assert
    expect(getResponse.status).toBe(200);
    expect(getResponse.data.id).toBe(createdTestId);
    expect(getResponse.data.description).toBe(updatePayload.description);
    expect(getResponse.data.status).toBe(updatePayload.status);
    expect(getResponse.data.priority).toBe(updatePayload.priority);
    
    logger.info('TC309: Test passed - Changes persisted successfully');
  });

  test('TC310: Update test multiple times', async () => {
    logger.info('TC310: Starting test - Update test multiple times');
    
    // Act & Assert - First update
    const firstUpdate = TestPayloads.buildUpdatePayload({ status: 'inactive' });
    const firstResponse = await testService.updateTest(createdTestId, firstUpdate);
    expect(firstResponse.data.status).toBe('inactive');
    
    // Act & Assert - Second update
    const secondUpdate = TestPayloads.buildUpdatePayload({ status: 'active' });
    const secondResponse = await testService.updateTest(createdTestId, secondUpdate);
    expect(secondResponse.data.status).toBe('active');
    
    // Act & Assert - Third update
    const thirdUpdate = TestPayloads.buildUpdatePayload({ status: 'archived' });
    const thirdResponse = await testService.updateTest(createdTestId, thirdUpdate);
    expect(thirdResponse.data.status).toBe('archived');
    
    logger.info('TC310: Test passed - Multiple updates successful');
  });

  test('TC311: Update test with special characters', async () => {
    logger.info('TC311: Starting test - Update test with special characters');
    
    // Arrange
    const updatePayload = TestPayloads.buildUpdatePayload({
      description: "Updated with special chars: !@#$%^&*()_+-=[]{}|;':,.<>?/~`"
    });
    
    // Act
    const response = await testService.updateTest(createdTestId, updatePayload);
    
    // Assert
    expect(response.status).toBe(200);
    expect(response.data.description).toBe(updatePayload.description);
    
    logger.info('TC311: Test passed - Special characters handled correctly');
  });

  test('TC312: Update test with maximum field lengths', async () => {
    logger.info('TC312: Starting test - Update test with maximum field lengths');
    
    // Arrange
    const updatePayload = TestPayloads.buildUpdatePayload({
      description: 'B'.repeat(1000)
    });
    
    // Act
    const response = await testService.updateTest(createdTestId, updatePayload);
    
    // Assert
    expect(response.status).toBe(200);
    expect(response.data.description.length).toBe(1000);
    
    logger.info('TC312: Test passed - Maximum field lengths accepted');
  });

  test('TC313: Update test exceeding maximum field lengths', async () => {
    logger.info('TC313: Starting test - Update test exceeding maximum field lengths');
    
    // Arrange
    const updatePayload = TestPayloads.buildUpdatePayload({
      description: 'B'.repeat(1001)
    });
    
    // Act
    const response = await testService.client.update(createdTestId, updatePayload);
    
    // Assert - Should return 400
    expect(response.status).toBe(400);
    await testService.validator.validateBadRequestResponse(response);
    
    logger.info('TC313: Test passed - Exceeding max lengths rejected');
  });
});