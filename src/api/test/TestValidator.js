/**
 * TestValidator.js
 * 
 * Validator for Test API responses
 * Extends BaseValidator to inherit common validation methods
 * Implements comprehensive validation for all Test API operations
 * 
 * @module TestValidator
 * @author API Automation Team
 * @version 1.0.0
 */

const BaseValidator = require('../base/BaseValidator');
const Logger = require('../../utils/Logger');
const { expect } = require('@playwright/test');

class TestValidator extends BaseValidator {
  constructor() {
    super();
    this.logger = new Logger('TestValidator');
    this.logger.info('TestValidator initialized');
  }

  /**
   * Validate GET all tests response
   * @param {Object} response - API response
   * @param {number} expectedStatus - Expected HTTP status code (default: 200)
   */
  async validateGetAll(response, expectedStatus = 200) {
    try {
      this.logger.info('Validating GET all tests response');
      
      // Validate status code
      this.validateStatusCode(response, expectedStatus);
      
      // Validate response structure
      expect(response.data, 'Response should have data property').toBeDefined();
      expect(Array.isArray(response.data), 'Data should be an array').toBeTruthy();
      
      // If data exists, validate each test object
      if (response.data && response.data.length > 0) {
        response.data.forEach((test, index) => {
          this.logger.debug(`Validating test object at index ${index}`);
          this.validateTestObject(test);
        });
      }
      
      // Validate pagination metadata if present
      if (response.pagination) {
        this.validatePaginationMetadata(response.pagination);
      }
      
      this.logger.info('GET all tests response validation passed');
    } catch (error) {
      this.logger.error(`GET all tests validation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate GET test by ID response
   * @param {Object} response - API response
   * @param {string|number} expectedId - Expected test ID
   * @param {number} expectedStatus - Expected HTTP status code (default: 200)
   */
  async validateGetById(response, expectedId, expectedStatus = 200) {
    try {
      this.logger.info(`Validating GET test by ID response for ID: ${expectedId}`);
      
      // Validate status code
      this.validateStatusCode(response, expectedStatus);
      
      // Validate response structure
      expect(response.data, 'Response should have data property').toBeDefined();
      
      // Validate test object
      this.validateTestObject(response.data);
      
      // Validate ID matches
      if (expectedId) {
        expect(response.data.id, 'Test ID should match expected ID').toBe(expectedId);
      }
      
      this.logger.info('GET test by ID response validation passed');
    } catch (error) {
      this.logger.error(`GET test by ID validation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate CREATE test response
   * @param {Object} response - API response
   * @param {Object} requestPayload - Original request payload
   * @param {number} expectedStatus - Expected HTTP status code (default: 201)
   */
  async validateCreate(response, requestPayload, expectedStatus = 201) {
    try {
      this.logger.info('Validating CREATE test response');
      
      // Validate status code
      this.validateStatusCode(response, expectedStatus);
      
      // Validate response structure
      expect(response.data, 'Response should have data property').toBeDefined();
      
      // Validate test object
      this.validateTestObject(response.data);
      
      // Validate created test has an ID
      expect(response.data.id, 'Created test should have an ID').toBeDefined();
      expect(response.data.id, 'Created test ID should not be empty').not.toBe('');
      
      // Validate payload fields match response
      if (requestPayload) {
        this.validatePayloadFieldsInResponse(requestPayload, response.data);
      }
      
      // Validate success message
      if (response.message) {
        expect(response.message, 'Success message should be present').toBeDefined();
        this.logger.debug(`Success message: ${response.message}`);
      }
      
      this.logger.info('CREATE test response validation passed');
    } catch (error) {
      this.logger.error(`CREATE test validation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate UPDATE test response
   * @param {Object} response - API response
   * @param {Object} requestPayload - Original request payload
   * @param {string|number} expectedId - Expected test ID
   * @param {number} expectedStatus - Expected HTTP status code (default: 200)
   */
  async validateUpdate(response, requestPayload, expectedId, expectedStatus = 200) {
    try {
      this.logger.info(`Validating UPDATE test response for ID: ${expectedId}`);
      
      // Validate status code
      this.validateStatusCode(response, expectedStatus);
      
      // Validate response structure
      expect(response.data, 'Response should have data property').toBeDefined();
      
      // Validate test object
      this.validateTestObject(response.data);
      
      // Validate ID matches
      if (expectedId) {
        expect(response.data.id, 'Test ID should match expected ID').toBe(expectedId);
      }
      
      // Validate updated fields match request payload
      if (requestPayload) {
        this.validatePayloadFieldsInResponse(requestPayload, response.data);
      }
      
      // Validate updatedAt timestamp is present and recent
      if (response.data.updatedAt) {
        this.validateTimestamp(response.data.updatedAt);
      }
      
      this.logger.info('UPDATE test response validation passed');
    } catch (error) {
      this.logger.error(`UPDATE test validation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate DELETE test response
   * @param {Object} response - API response
   * @param {string|number} expectedId - Expected test ID
   * @param {number} expectedStatus - Expected HTTP status code (default: 200 or 204)
   */
  async validateDelete(response, expectedId, expectedStatus = 200) {
    try {
      this.logger.info(`Validating DELETE test response for ID: ${expectedId}`);
      
      // Validate status code
      this.validateStatusCode(response, expectedStatus);
      
      // For 204 No Content, no body validation needed
      if (expectedStatus === 204) {
        this.logger.info('DELETE test response validation passed (204 No Content)');
        return;
      }
      
      // Validate success message
      if (response.message) {
        expect(response.message, 'Success message should be present').toBeDefined();
        this.logger.debug(`Success message: ${response.message}`);
      }
      
      // Validate deleted ID if present in response
      if (response.data && response.data.id) {
        expect(response.data.id, 'Deleted test ID should match expected ID').toBe(expectedId);
      }
      
      this.logger.info('DELETE test response validation passed');
    } catch (error) {
      this.logger.error(`DELETE test validation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate error response
   * @param {Object} response - API response
   * @param {number} expectedStatus - Expected HTTP status code
   * @param {string} expectedErrorMessage - Expected error message (optional)
   */
  async validateErrorResponse(response, expectedStatus, expectedErrorMessage = null) {
    try {
      this.logger.info(`Validating error response with status ${expectedStatus}`);
      
      // Validate status code
      this.validateStatusCode(response, expectedStatus);
      
      // Validate error structure
      expect(response.error || response.message, 'Error response should have error or message property').toBeDefined();
      
      // Validate error message if provided
      if (expectedErrorMessage) {
        const errorMessage = response.error || response.message;
        expect(errorMessage, 'Error message should match expected message').toContain(expectedErrorMessage);
      }
      
      this.logger.info('Error response validation passed');
    } catch (error) {
      this.logger.error(`Error response validation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate test object structure and required fields
   * @param {Object} testObject - Test object to validate
   * @private
   */
  validateTestObject(testObject) {
    // Validate required fields
    expect(testObject.id, 'Test should have id').toBeDefined();
    expect(testObject.name, 'Test should have name').toBeDefined();
    expect(testObject.type, 'Test should have type').toBeDefined();
    expect(testObject.status, 'Test should have status').toBeDefined();
    
    // Validate field types
    expect(typeof testObject.id, 'ID should be string or number').toMatch(/string|number/);
    expect(typeof testObject.name, 'Name should be string').toBe('string');
    expect(typeof testObject.type, 'Type should be string').toBe('string');
    expect(typeof testObject.status, 'Status should be string').toBe('string');
    
    // Validate field values are not empty
    expect(testObject.name, 'Name should not be empty').not.toBe('');
    expect(testObject.type, 'Type should not be empty').not.toBe('');
    expect(testObject.status, 'Status should not be empty').not.toBe('');
    
    // Validate optional fields if present
    if (testObject.description !== undefined) {
      expect(typeof testObject.description, 'Description should be string').toBe('string');
    }
    
    if (testObject.priority !== undefined) {
      expect(typeof testObject.priority, 'Priority should be string').toBe('string');
    }
    
    if (testObject.tags !== undefined) {
      expect(Array.isArray(testObject.tags), 'Tags should be an array').toBeTruthy();
    }
    
    if (testObject.metadata !== undefined) {
      expect(typeof testObject.metadata, 'Metadata should be object').toBe('object');
    }
    
    if (testObject.configuration !== undefined) {
      expect(typeof testObject.configuration, 'Configuration should be object').toBe('object');
    }
    
    // Validate timestamps if present
    if (testObject.createdAt) {
      this.validateTimestamp(testObject.createdAt);
    }
    
    if (testObject.updatedAt) {
      this.validateTimestamp(testObject.updatedAt);
    }
    
    this.logger.debug('Test object validation passed');
  }

  /**
   * Validate payload fields are present in response
   * @param {Object} payload - Request payload
   * @param {Object} responseData - Response data
   * @private
   */
  validatePayloadFieldsInResponse(payload, responseData) {
    Object.keys(payload).forEach(key => {
      if (key !== 'createdAt' && key !== 'updatedAt') {
        expect(responseData[key], `Response should contain field: ${key}`).toBeDefined();
        
        // For primitive types, validate values match
        if (typeof payload[key] !== 'object' || payload[key] === null) {
          expect(responseData[key], `Field ${key} should match payload value`).toBe(payload[key]);
        }
      }
    });
    
    this.logger.debug('Payload fields validation passed');
  }

  /**
   * Validate pagination metadata
   * @param {Object} pagination - Pagination object
   * @private
   */
  validatePaginationMetadata(pagination) {
    expect(pagination.page, 'Pagination should have page').toBeDefined();
    expect(pagination.limit, 'Pagination should have limit').toBeDefined();
    expect(pagination.total, 'Pagination should have total').toBeDefined();
    
    expect(typeof pagination.page, 'Page should be number').toBe('number');
    expect(typeof pagination.limit, 'Limit should be number').toBe('number');
    expect(typeof pagination.total, 'Total should be number').toBe('number');
    
    expect(pagination.page, 'Page should be positive').toBeGreaterThan(0);
    expect(pagination.limit, 'Limit should be positive').toBeGreaterThan(0);
    expect(pagination.total, 'Total should be non-negative').toBeGreaterThanOrEqual(0);
    
    this.logger.debug('Pagination metadata validation passed');
  }

  /**
   * Validate timestamp format and value
   * @param {string} timestamp - Timestamp to validate
   * @private
   */
  validateTimestamp(timestamp) {
    expect(timestamp, 'Timestamp should be defined').toBeDefined();
    expect(typeof timestamp, 'Timestamp should be string').toBe('string');
    
    // Validate ISO 8601 format
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
    expect(isoDateRegex.test(timestamp), 'Timestamp should be in ISO 8601 format').toBeTruthy();
    
    // Validate timestamp is a valid date
    const date = new Date(timestamp);
    expect(date.toString(), 'Timestamp should be a valid date').not.toBe('Invalid Date');
    
    this.logger.debug(`Timestamp validation passed: ${timestamp}`);
  }

  /**
   * Validate response time
   * @param {number} responseTime - Response time in milliseconds
   * @param {number} maxResponseTime - Maximum acceptable response time (default: 3000ms)
   */
  validateResponseTime(responseTime, maxResponseTime = 3000) {
    expect(responseTime, 'Response time should be defined').toBeDefined();
    expect(typeof responseTime, 'Response time should be number').toBe('number');
    expect(responseTime, `Response time should be less than ${maxResponseTime}ms`).toBeLessThan(maxResponseTime);
    
    this.logger.info(`Response time validation passed: ${responseTime}ms`);
  }

  /**
   * Validate unauthorized response
   * @param {Object} response - API response
   */
  async validateUnauthorizedResponse(response) {
    await this.validateErrorResponse(response, 401, 'Unauthorized');
    this.logger.info('Unauthorized response validation passed');
  }

  /**
   * Validate forbidden response
   * @param {Object} response - API response
   */
  async validateForbiddenResponse(response) {
    await this.validateErrorResponse(response, 403, 'Forbidden');
    this.logger.info('Forbidden response validation passed');
  }

  /**
   * Validate not found response
   * @param {Object} response - API response
   */
  async validateNotFoundResponse(response) {
    await this.validateErrorResponse(response, 404, 'Not Found');
    this.logger.info('Not found response validation passed');
  }

  /**
   * Validate bad request response
   * @param {Object} response - API response
   */
  async validateBadRequestResponse(response) {
    await this.validateErrorResponse(response, 400, 'Bad Request');
    this.logger.info('Bad request response validation passed');
  }

  /**
   * Validate conflict response
   * @param {Object} response - API response
   */
  async validateConflictResponse(response) {
    await this.validateErrorResponse(response, 409, 'Conflict');
    this.logger.info('Conflict response validation passed');
  }
}

module.exports = TestValidator;