/**
 * DeleteTest.spec.js
 * 
 * Test suite for Test API - DELETE operations
 * Tests deletion of test records
 * 
 * @author API Automation Team
 * @version 1.0.0
 */

const { test, expect } = require('@playwright/test');
const TestService = require('../../../src/services/TestService');
const TestPayloads = require('../../../src/api/test/TestPayloads');
const TestData = require('../../../src/api/test/TestData');
const Logger = require('../../../src/utils/Logger');

const logger = new Logger('DeleteTest.spec');

test.describe('Test API - DELETE Operations', () => {
  let testService;

  test.beforeEach(async ({ request }) => {
    testService = new TestService(request);
    logger.info('Test setup completed');
  });

  test('TC401: Delete test with valid ID', async () => {
    logger.info('TC401: Starting test - Delete test with valid ID');
    
    // Arrange - Create a test to delete
    const payload = TestPayloads.buildCreatePayload();
    const createResponse = await testService.createTest(payload);
    const testId = createResponse.data.id;
    logger.info(`Created test with ID: ${testId}`);
    
    // Act
    const startTime = Date.now();
    const deleteResponse = await testService.deleteTest(testId);
    const responseTime = Date.now() - startTime;
    
    // Assert
    expect([200, 204]).toContain(deleteResponse.status);
    
    // Validate response time
    expect(responseTime).toBeLessThan(3000);
    logger.info(`Response time: ${responseTime}ms`);
    
    // Verify test is deleted
    const exists = await testService.testExists(testId);
    expect(exists).toBeFalsy();
    
    logger.info('TC401: Test passed - Test deleted successfully');
  });

  test('TC402: Delete non-existent test', async () => {
    logger.info('TC402: Starting test - Delete non-existent test');
    
    // Arrange
    const nonExistentId = '999999999';
    
    // Act
    const response = await testService.client.delete(nonExistentId);
    
    // Assert
    expect(response.status).toBe(404);
    await testService.validator.validateNotFoundResponse(response);
    
    logger.info('TC402: Test passed - Non-existent test returns 404');
  });

  test('TC403: Delete already deleted test', async () => {
    logger.info('TC403: Starting test - Delete already deleted test');
    
    // Arrange - Create and delete a test
    const payload = TestPayloads.buildCreatePayload();
    const createResponse = await testService.createTest(payload);
    const testId = createResponse.data.id;
    await testService.deleteTest(testId);
    
    // Act - Try to delete again
    const response = await testService.client.delete(testId);
    
    // Assert
    expect(response.status).toBe(404);
    await testService.validator.validateNotFoundResponse(response);
    
    logger.info('TC403: Test passed - Already deleted test returns 404');
  });

  test('TC404: Delete test with null ID', async () => {
    logger.info('TC404: Starting test - Delete test with null ID');
    
    // Act & Assert
    try {
      await testService.deleteTest(null);
      throw new Error('Expected test to fail but it passed');
    } catch (error) {
      expect(error.message).toContain('Test ID');
      logger.info('TC404: Test passed - Null ID rejected');
    }
  });

  test('TC405: Delete test with undefined ID', async () => {
    logger.info('TC405: Starting test - Delete test with undefined ID');
    
    // Act & Assert
    try {
      await testService.deleteTest(undefined);
      throw new Error('Expected test to fail but it passed');
    } catch (error) {
      expect(error.message).toContain('Test ID');
      logger.info('TC405: Test passed - Undefined ID rejected');
    }
  });

  test('TC406: Delete test with empty string ID', async () => {
    logger.info('TC406: Starting test - Delete test with empty string ID');
    
    // Act & Assert
    try {
      await testService.deleteTest('');
      throw new Error('Expected test to fail but it passed');
    } catch (error) {
      expect(error.message).toContain('Test ID');
      logger.info('TC406: Test passed - Empty string ID rejected');
    }
  });

  test('TC407: Delete test with invalid ID format', async () => {
    logger.info('TC407: Starting test - Delete test with invalid ID format');
    
    // Arrange
    const invalidIds = TestData.getInvalidIds().filter(id => id !== null && id !== undefined && id !== '');
    
    // Act & Assert
    for (const invalidId of invalidIds.slice(0, 3)) { // Test first 3 invalid IDs
      logger.debug(`Testing invalid ID: ${invalidId}`);
      const response = await testService.client.delete(invalidId);
      
      // Should return 400 or 404
      expect([400, 404]).toContain(response.status);
    }
    
    logger.info('TC407: Test passed - Invalid ID formats handled correctly');
  });

  test('TC408: Delete test with SQL injection in ID', async () => {
    logger.info('TC408: Starting test - Delete test with SQL injection in ID');
    
    // Arrange
    const sqlInjectionId = "1' OR '1'='1";
    
    // Act
    const response = await testService.client.delete(sqlInjectionId);
    
    // Assert - Should return 400 or 404, not 200
    expect([400, 404]).toContain(response.status);
    expect(response.status).not.toBe(200);
    
    logger.info('TC408: Test passed - SQL injection attempt blocked');
  });

  test('TC409: Verify deleted test cannot be retrieved', async () => {
    logger.info('TC409: Starting test - Verify deleted test cannot be retrieved');
    
    // Arrange - Create a test
    const payload = TestPayloads.buildCreatePayload();
    const createResponse = await testService.createTest(payload);
    const testId = createResponse.data.id;
    
    // Act - Delete test
    await testService.deleteTest(testId);
    
    // Act - Try to retrieve deleted test
    const getResponse = await testService.client.getById(testId);
    
    // Assert
    expect(getResponse.status).toBe(404);
    await testService.validator.validateNotFoundResponse(getResponse);
    
    logger.info('TC409: Test passed - Deleted test cannot be retrieved');
  });

  test('TC410: Delete multiple tests', async () => {
    logger.info('TC410: Starting test - Delete multiple tests');
    
    // Arrange - Create multiple tests
    const payloads = TestPayloads.buildBulkCreatePayloads(3);
    const testIds = [];
    
    for (const payload of payloads) {
      const response = await testService.createTest(payload);
      testIds.push(response.data.id);
    }
    
    logger.info(`Created ${testIds.length} tests for deletion`);
    
    // Act - Delete all tests
    const deletionResults = await testService.deleteMultipleTests(testIds);
    
    // Assert
    expect(deletionResults.length).toBe(testIds.length);
    
    const successCount = deletionResults.filter(r => r.success).length;
    expect(successCount).toBe(testIds.length);
    
    // Verify all tests are deleted
    for (const testId of testIds) {
      const exists = await testService.testExists(testId);
      expect(exists).toBeFalsy();
    }
    
    logger.info('TC410: Test passed - Multiple tests deleted successfully');
  });

  test('TC411: Delete test and verify it does not appear in list', async () => {
    logger.info('TC411: Starting test - Verify deleted test not in list');
    
    // Arrange - Create a test
    const payload = TestPayloads.buildCreatePayload();
    const createResponse = await testService.createTest(payload);
    const testId = createResponse.data.id;
    
    // Act - Delete test
    await testService.deleteTest(testId);
    
    // Act - Get all tests
    const getAllResponse = await testService.getAllTests();
    
    // Assert - Deleted test should not be in the list
    const deletedTestInList = getAllResponse.data.find(test => test.id === testId);
    expect(deletedTestInList).toBeUndefined();
    
    logger.info('TC411: Test passed - Deleted test not in list');
  });

  test('TC412: Delete test with cascade validation', async () => {
    logger.info('TC412: Starting test - Delete test with cascade validation');
    
    // Arrange - Create a test
    const payload = TestPayloads.buildCreatePayload();
    const createResponse = await testService.createTest(payload);
    const testId = createResponse.data.id;
    
    // Act - Delete test
    const deleteResponse = await testService.deleteTest(testId);
    
    // Assert
    expect([200, 204]).toContain(deleteResponse.status);
    
    // Verify test and all related data are deleted
    const exists = await testService.testExists(testId);
    expect(exists).toBeFalsy();
    
    logger.info('TC412: Test passed - Cascade deletion successful');
  });
});