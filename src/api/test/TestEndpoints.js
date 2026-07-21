/**
 * TestEndpoints.js
 * 
 * Defines all API endpoints for Test module
 * Centralizes endpoint URLs for maintainability and reusability
 * 
 * @module TestEndpoints
 * @author API Automation Team
 * @version 1.0.0
 */

const ConfigManager = require('../../config/ConfigManager');
const Logger = require('../../utils/Logger');

class TestEndpoints {
  constructor() {
    this.baseUrl = ConfigManager.getBaseUrl();
    this.apiVersion = ConfigManager.getApiVersion() || 'v1';
    this.logger = new Logger('TestEndpoints');
    
    // Base path for Test module
    this.basePath = `/api/${this.apiVersion}/test`;
    
    this.logger.info('TestEndpoints initialized');
  }

  /**
   * Get the endpoint for retrieving all test records
   * @returns {string} Full URL for GET all tests
   */
  getAll() {
    const endpoint = `${this.baseUrl}${this.basePath}`;
    this.logger.debug(`GET All Tests endpoint: ${endpoint}`);
    return endpoint;
  }

  /**
   * Get the endpoint for retrieving a specific test by ID
   * @param {string|number} id - Test ID
   * @returns {string} Full URL for GET test by ID
   */
  getById(id) {
    if (!id) {
      this.logger.error('Test ID is required for getById endpoint');
      throw new Error('Test ID cannot be null or undefined');
    }
    const endpoint = `${this.baseUrl}${this.basePath}/${id}`;
    this.logger.debug(`GET Test by ID endpoint: ${endpoint}`);
    return endpoint;
  }

  /**
   * Get the endpoint for creating a new test
   * @returns {string} Full URL for POST test
   */
  create() {
    const endpoint = `${this.baseUrl}${this.basePath}`;
    this.logger.debug(`CREATE Test endpoint: ${endpoint}`);
    return endpoint;
  }

  /**
   * Get the endpoint for updating an existing test
   * @param {string|number} id - Test ID
   * @returns {string} Full URL for PUT/PATCH test
   */
  update(id) {
    if (!id) {
      this.logger.error('Test ID is required for update endpoint');
      throw new Error('Test ID cannot be null or undefined');
    }
    const endpoint = `${this.baseUrl}${this.basePath}/${id}`;
    this.logger.debug(`UPDATE Test endpoint: ${endpoint}`);
    return endpoint;
  }

  /**
   * Get the endpoint for deleting a test
   * @param {string|number} id - Test ID
   * @returns {string} Full URL for DELETE test
   */
  delete(id) {
    if (!id) {
      this.logger.error('Test ID is required for delete endpoint');
      throw new Error('Test ID cannot be null or undefined');
    }
    const endpoint = `${this.baseUrl}${this.basePath}/${id}`;
    this.logger.debug(`DELETE Test endpoint: ${endpoint}`);
    return endpoint;
  }

  /**
   * Get the endpoint for bulk operations
   * @returns {string} Full URL for bulk operations
   */
  bulk() {
    const endpoint = `${this.baseUrl}${this.basePath}/bulk`;
    this.logger.debug(`BULK Test endpoint: ${endpoint}`);
    return endpoint;
  }

  /**
   * Get the endpoint for search operations
   * @returns {string} Full URL for search
   */
  search() {
    const endpoint = `${this.baseUrl}${this.basePath}/search`;
    this.logger.debug(`SEARCH Test endpoint: ${endpoint}`);
    return endpoint;
  }
}

module.exports = TestEndpoints;