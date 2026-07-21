/**
 * GetAllTest.spec.js
 * 
 * Test suite for Test API - GET ALL operations
 * Tests retrieval of all test records with various filters and pagination
 * 
 * @author API Automation Team
 * @version 1.0.0
 */

const { test, expect } = require('@playwright/test');
const TestService = require('../../../src/services/TestService');
const TestPayloads = require('../../../src/api/test/TestPayloads');
const TestData = require('../../../src/api/test/TestData');
const Logger = require('../../../src/utils/Logger');

const logger = new Logger('GetAllTest.spec');

test.describe('Test API - GET ALL Operations', () => {
  let testService;
  let createdTestIds = [];

  test.beforeAll(async ({ request }) => {
    testService = new TestService(request);
    
    // Create test data for GET operations
    logger.info('Creating test data for GET ALL operations');
    const testPayloads = TestPayloads.buildBulkCreatePayloads(5);
    
    for (const payload of testPayloads) {
      const response = await testService.createTest(payload);
      createdTestIds.push(response.data.id);
    }
    
    logger.info(`Created ${createdTestIds.length} test records for testing`);
  });

  test.afterAll(async () => {
    // Cleanup: Delete all created tests
    if (createdTestIds.length > 0) {
      logger.info(`Cleaning up ${createdTestIds.length} created tests`);
      await testService.deleteMultipleTests(createdTestIds);
      createdTestIds = [];
    }
  });

  test('TC101: Get all tests without filters', async () => {
    logger.info('TC101: Starting test - Get all tests without filters');
    
    // Act
    const startTime = Date.now();
    const response = await testService.getAllTests();
    const responseTime = Date.now() - startTime;
    
    // Assert
    expect(response.status).toBe(200);
    expect(response.data).toBeDefined();
    expect(Array.isArray(response.data)).toBeTruthy();
    expect(response.data.length).toBeGreaterThan(0);
    
    // Validate response time
    expect(responseTime).toBeLessThan(3000);
    logger.info(`Response time: ${responseTime}ms`);
    
    // Validate each test object
    response.data.forEach(test => {
      expect(test.id).toBeDefined();
      expect(test.name).toBeDefined();
      expect(test.type).toBeDefined();
      expect(test.status).toBeDefined();
    });
    
    logger.info(`TC101: Test passed - Retrieved ${response.data.length} tests`);
  });

  test('TC102: Get all tests with pagination', async () => {
    logger.info('TC102: Starting test - Get all tests with pagination');
    
    // Arrange
    const paginationParams = {
      page: 1,
      limit: 10
    };
    
    // Act
    const response = await testService.getAllTests(paginationParams);
    
    // Assert
    expect(response.status).toBe(200);
    expect(response.data).toBeDefined();
    expect(Array.isArray(response.data)).toBeTruthy();
    expect(response.data.length).toBeLessThanOrEqual(10);
    
    // Validate pagination metadata if present
    if (response.pagination) {
      expect(response.pagination.page).toBe(1);
      expect(response.pagination.limit).toBe(10);
      expect(response.pagination.total).toBeGreaterThanOrEqual(0);
    }
    
    logger.info('TC102: Test passed - Pagination working correctly');
  });

  test('TC103: Get all tests with sorting', async () => {
    logger.info('TC103: Starting test - Get all tests with sorting');
    
    // Arrange
    const sortParams = {
      sortBy: 'name',
      sortOrder: 'asc'
    };
    
    // Act
    const response = await testService.getAllTests(sortParams);
    
    // Assert
    expect(response.status).toBe(200);
    expect(response.data).toBeDefined();
    expect(Array.isArray(response.data)).toBeTruthy();
    
    // Validate sorting if multiple records exist
    if (response.data.length > 1) {
      for (let i = 0; i < response.data.length - 1; i++) {
        const current = response.data[i].name.toLowerCase();
        const next = response.data[i + 1].name.toLowerCase();
        expect(current <= next).toBeTruthy();
      }
    }
    
    logger.info('TC103: Test passed - Sorting working correctly');
  });

  test('TC104: Get all tests with type filter', async () => {
    logger.info('TC104: Starting test - Get all tests with type filter');
    
    // Arrange
    const filterParams = {
      type: 'unit'
    };
    
    // Act
    const response = await testService.getAllTests(filterParams);
    
    // Assert
    expect(response.status).toBe(200);
    expect(response.data).toBeDefined();
    expect(Array.isArray(response.data)).toBeTruthy();
    
    // Validate all returned tests have the filtered type
    response.data.forEach(test => {
      expect(test.type).toBe('unit');
    });
    
    logger.info('TC104: Test passed - Type filter working correctly');
  });

  test('TC105: Get all tests with status filter', async () => {
    logger.info('TC105: Starting test - Get all tests with status filter');
    
    // Arrange
    const filterParams = {
      status: 'active'
    };
    
    // Act
    const response = await testService.getAllTests(filterParams);
    
    // Assert
    expect(response.status).toBe(200);
    expect(response.data).toBeDefined();
    expect(Array.isArray(response.data)).toBeTruthy();
    
    // Validate all returned tests have the filtered status
    response.data.forEach(test => {
      expect(test.status).toBe('active');
    });
    
    logger.info('TC105: Test passed - Status filter working correctly');
  });

  test('TC106: Get all tests with multiple filters', async () => {
    logger.info('TC106: Starting test - Get all tests with multiple filters');
    
    // Arrange
    const filterParams = {
      type: 'unit',
      status: 'active',
      priority: 'high'
    };
    
    // Act
    const response = await testService.getAllTests(filterParams);
    
    // Assert
    expect(response.status).toBe(200);
    expect(response.data).toBeDefined();
    expect(Array.isArray(response.data)).toBeTruthy();
    
    // Validate all returned tests match all filters
    response.data.forEach(test => {
      expect(test.type).toBe('unit');
      expect(test.status).toBe('active');
      if (test.priority) {
        expect(test.priority).toBe('high');
      }
    });
    
    logger.info('TC106: Test passed - Multiple filters working correctly');
  });

  test('TC107: Get all tests with invalid page number', async () => {
    logger.info('TC107: Starting test - Get all tests with invalid page number');
    
    // Arrange
    const invalidParams = {
      page: -1,
      limit: 10
    };
    
    // Act
    const response = await testService.client.getAll(invalidParams);
    
    // Assert - Should either return 400 or default to page 1
    if (response.status === 400) {
      await testService.validator.validateBadRequestResponse(response);
      logger.info('TC107: Test passed - Invalid page number rejected');
    } else {
      expect(response.status).toBe(200);
      logger.info('TC107: Test passed - Invalid page number defaulted to valid value');
    }
  });

  test('TC108: Get all tests with invalid limit', async () => {
    logger.info('TC108: Starting test - Get all tests with invalid limit');
    
    // Arrange
    const invalidParams = {
      page: 1,
      limit: -10
    };
    
    // Act
    const response = await testService.client.getAll(invalidParams);
    
    // Assert - Should either return 400 or default to valid limit
    if (response.status === 400) {
      await testService.validator.validateBadRequestResponse(response);
      logger.info('TC108: Test passed - Invalid limit rejected');
    } else {
      expect(response.status).toBe(200);
      logger.info('TC108: Test passed - Invalid limit defaulted to valid value');
    }
  });

  test('TC109: Get all tests with non-existent filter value', async () => {
    logger.info('TC109: Starting test - Get all tests with non-existent filter value');
    
    // Arrange
    const filterParams = {
      type: 'non_existent_type'
    };
    
    // Act
    const response = await testService.getAllTests(filterParams);
    
    // Assert
    expect(response.status).toBe(200);
    expect(response.data).toBeDefined();
    expect(Array.isArray(response.data)).toBeTruthy();
    expect(response.data.length).toBe(0);
    
    logger.info('TC109: Test passed - Non-existent filter returns empty array');
  });

  test('TC110: Verify response schema for get all tests', async () => {
    logger.info('TC110: Starting test - Verify response schema');
    
    // Act
    const response = await testService.getAllTests();
    
    // Assert
    expect(response.status).toBe(200);
    expect(response.data).toBeDefined();
    expect(Array.isArray(response.data)).toBeTruthy();
    
    // Validate schema of first test object if exists
    if (response.data.length > 0) {
      const testObject = response.data[0];
      
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
    }
    
    logger.info('TC110: Test passed - Response schema validated');
  });
});