/**
 * TestService.js
 * 
 * Service layer for Test module
 * Provides high-level business logic and orchestrates API client operations
 * Implements additional business rules and data transformations
 * 
 * @module TestService
 * @author API Automation Team
 * @version 1.0.0
 */

const TestClient = require('../api/test/TestClient');
const TestValidator = require('../api/test/TestValidator');
const Logger = require('../utils/Logger');
const AuthManager = require('../auth/AuthManager');

class TestService {
  constructor(request) {
    this.client = new TestClient(request);
    this.validator = new TestValidator();
    this.logger = new Logger('TestService');
    this.authManager = new AuthManager();
    
    this.logger.info('TestService initialized');
  }

  /**
   * Get all tests with validation
   * @param {Object} options - Query options
   * @param {string} token - Authentication token
   * @returns {Promise<Object>} Validated response
   */
  async getAllTests(options = {}, token = null) {
    try {
      this.logger.info('Service: Getting all tests');
      
      const response = await this.client.getAll(options, token);
      await this.validator.validateGetAll(response);
      
      this.logger.info(`Service: Successfully retrieved ${response.data?.length || 0} tests`);
      return response;
    } catch (error) {
      this.logger.error(`Service: Failed to get all tests: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get test by ID with validation
   * @param {string|number} id - Test ID
   * @param {string} token - Authentication token
   * @returns {Promise<Object>} Validated response
   */
  async getTestById(id, token = null) {
    try {
      this.logger.info(`Service: Getting test by ID: ${id}`);
      
      const response = await this.client.getById(id, token);
      await this.validator.validateGetById(response, id);
      
      this.logger.info(`Service: Successfully retrieved test: ${id}`);
      return response;
    } catch (error) {
      this.logger.error(`Service: Failed to get test ${id}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create test with validation
   * @param {Object} payload - Test data
   * @param {string} token - Authentication token
   * @returns {Promise<Object>} Validated response
   */
  async createTest(payload, token = null) {
    try {
      this.logger.info('Service: Creating new test');
      
      // Pre-validation of payload
      this.validateCreatePayload(payload);
      
      const response = await this.client.create(payload, token);
      await this.validator.validateCreate(response, payload);
      
      this.logger.info(`Service: Successfully created test with ID: ${response.data?.id}`);
      return response;
    } catch (error) {
      this.logger.error(`Service: Failed to create test: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update test with validation
   * @param {string|number} id - Test ID
   * @param {Object} payload - Updated test data
   * @param {string} token - Authentication token
   * @returns {Promise<Object>} Validated response
   */
  async updateTest(id, payload, token = null) {
    try {
      this.logger.info(`Service: Updating test: ${id}`);
      
      // Pre-validation of payload
      this.validateUpdatePayload(payload);
      
      const response = await this.client.update(id, payload, token);
      await this.validator.validateUpdate(response, payload, id);
      
      this.logger.info(`Service: Successfully updated test: ${id}`);
      return response;
    } catch (error) {
      this.logger.error(`Service: Failed to update test ${id}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete test with validation
   * @param {string|number} id - Test ID
   * @param {string} token - Authentication token
   * @returns {Promise<Object>} Validated response
   */
  async deleteTest(id, token = null) {
    try {
      this.logger.info(`Service: Deleting test: ${id}`);
      
      const response = await this.client.delete(id, token);
      await this.validator.validateDelete(response, id);
      
      this.logger.info(`Service: Successfully deleted test: ${id}`);
      return response;
    } catch (error) {
      this.logger.error(`Service: Failed to delete test ${id}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Search tests with validation
   * @param {Object} criteria - Search criteria
   * @param {string} token - Authentication token
   * @returns {Promise<Object>} Validated response
   */
  async searchTests(criteria, token = null) {
    try {
      this.logger.info('Service: Searching tests');
      
      const response = await this.client.search(criteria, token);
      await this.validator.validateGetAll(response);
      
      this.logger.info(`Service: Search returned ${response.data?.length || 0} results`);
      return response;
    } catch (error) {
      this.logger.error(`Service: Failed to search tests: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if test exists
   * @param {string|number} id - Test ID
   * @param {string} token - Authentication token
   * @returns {Promise<boolean>} True if test exists
   */
  async testExists(id, token = null) {
    try {
      this.logger.info(`Service: Checking if test exists: ${id}`);
      
      await this.client.getById(id, token);
      
      this.logger.info(`Service: Test exists: ${id}`);
      return true;
    } catch (error) {
      if (error.status === 404) {
        this.logger.info(`Service: Test does not exist: ${id}`);
        return false;
      }
      throw error;
    }
  }

  /**
   * Create multiple tests
   * @param {Array<Object>} payloads - Array of test payloads
   * @param {string} token - Authentication token
   * @returns {Promise<Array<Object>>} Array of created tests
   */
  async createMultipleTests(payloads, token = null) {
    try {
      this.logger.info(`Service: Creating ${payloads.length} tests`);
      
      const createdTests = [];
      
      for (const payload of payloads) {
        const response = await this.createTest(payload, token);
        createdTests.push(response.data);
      }
      
      this.logger.info(`Service: Successfully created ${createdTests.length} tests`);
      return createdTests;
    } catch (error) {
      this.logger.error(`Service: Failed to create multiple tests: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete multiple tests
   * @param {Array<string|number>} ids - Array of test IDs
   * @param {string} token - Authentication token
   * @returns {Promise<Array<Object>>} Array of deletion responses
   */
  async deleteMultipleTests(ids, token = null) {
    try {
      this.logger.info(`Service: Deleting ${ids.length} tests`);
      
      const deletionResults = [];
      
      for (const id of ids) {
        try {
          const response = await this.deleteTest(id, token);
          deletionResults.push({ id, success: true, response });
        } catch (error) {
          deletionResults.push({ id, success: false, error: error.message });
        }
      }
      
      const successCount = deletionResults.filter(r => r.success).length;
      this.logger.info(`Service: Successfully deleted ${successCount}/${ids.length} tests`);
      
      return deletionResults;
    } catch (error) {
      this.logger.error(`Service: Failed to delete multiple tests: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate create payload
   * @param {Object} payload - Payload to validate
   * @private
   */
  validateCreatePayload(payload) {
    if (!payload) {
      throw new Error('Payload is required');
    }
    
    if (!payload.name) {
      throw new Error('Name is required');
    }
    
    if (!payload.type) {
      throw new Error('Type is required');
    }
    
    if (!payload.status) {
      throw new Error('Status is required');
    }
    
    this.logger.debug('Create payload validation passed');
  }

  /**
   * Validate update payload
   * @param {Object} payload - Payload to validate
   * @private
   */
  validateUpdatePayload(payload) {
    if (!payload) {
      throw new Error('Payload is required');
    }
    
    if (Object.keys(payload).length === 0) {
      throw new Error('Update payload cannot be empty');
    }
    
    this.logger.debug('Update payload validation passed');
  }

  /**
   * Get test statistics
   * @param {string} token - Authentication token
   * @returns {Promise<Object>} Test statistics
   */
  async getTestStatistics(token = null) {
    try {
      this.logger.info('Service: Getting test statistics');
      
      const response = await this.getAllTests({}, token);
      const tests = response.data || [];
      
      const statistics = {
        total: tests.length,
        byType: this.groupBy(tests, 'type'),
        byStatus: this.groupBy(tests, 'status'),
        byPriority: this.groupBy(tests, 'priority')
      };
      
      this.logger.info('Service: Successfully calculated test statistics');
      return statistics;
    } catch (error) {
      this.logger.error(`Service: Failed to get test statistics: ${error.message}`);
      throw error;
    }
  }

  /**
   * Group array of objects by property
   * @param {Array} array - Array to group
   * @param {string} property - Property to group by
   * @returns {Object} Grouped object
   * @private
   */
  groupBy(array, property) {
    return array.reduce((acc, obj) => {
      const key = obj[property] || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }
}

module.exports = TestService;