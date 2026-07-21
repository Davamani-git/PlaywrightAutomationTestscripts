/**
 * TestClient.js
 * 
 * Client layer for Test API operations
 * Extends BaseApiClient to inherit common HTTP methods and error handling
 * Implements all CRUD operations for Test module
 * 
 * @module TestClient
 * @author API Automation Team
 * @version 1.0.0
 */

const BaseApiClient = require('../base/BaseApiClient');
const TestEndpoints = require('./TestEndpoints');
const Logger = require('../../utils/Logger');
const AuthManager = require('../../auth/AuthManager');

class TestClient extends BaseApiClient {
  constructor(request) {
    super(request);
    this.endpoints = new TestEndpoints();
    this.logger = new Logger('TestClient');
    this.authManager = new AuthManager();
    
    this.logger.info('TestClient initialized');
  }

  /**
   * Retrieve all test records
   * @param {Object} options - Query parameters (pagination, filters, etc.)
   * @param {string} token - Authentication token
   * @returns {Promise<Object>} API response with all test records
   */
  async getAll(options = {}, token = null) {
    try {
      this.logger.info('Fetching all test records');
      
      const url = this.endpoints.getAll();
      const headers = await this.buildHeaders(token);
      
      // Build query parameters
      const queryParams = this.buildQueryParams(options);
      const fullUrl = queryParams ? `${url}?${queryParams}` : url;
      
      this.logger.debug(`Request URL: ${fullUrl}`);
      
      const response = await this.get(fullUrl, { headers });
      
      this.logger.info(`Successfully retrieved ${response.data?.length || 0} test records`);
      return response;
    } catch (error) {
      this.logger.error(`Failed to get all tests: ${error.message}`);
      throw error;
    }
  }

  /**
   * Retrieve a specific test by ID
   * @param {string|number} id - Test ID
   * @param {string} token - Authentication token
   * @returns {Promise<Object>} API response with test details
   */
  async getById(id, token = null) {
    try {
      this.logger.info(`Fetching test with ID: ${id}`);
      
      if (!id) {
        throw new Error('Test ID is required');
      }
      
      const url = this.endpoints.getById(id);
      const headers = await this.buildHeaders(token);
      
      this.logger.debug(`Request URL: ${url}`);
      
      const response = await this.get(url, { headers });
      
      this.logger.info(`Successfully retrieved test with ID: ${id}`);
      return response;
    } catch (error) {
      this.logger.error(`Failed to get test by ID ${id}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a new test
   * @param {Object} payload - Test data
   * @param {string} token - Authentication token
   * @returns {Promise<Object>} API response with created test
   */
  async create(payload, token = null) {
    try {
      this.logger.info('Creating new test');
      
      if (!payload) {
        throw new Error('Payload is required to create a test');
      }
      
      const url = this.endpoints.create();
      const headers = await this.buildHeaders(token);
      
      this.logger.debug(`Request URL: ${url}`);
      this.logger.debug(`Payload: ${JSON.stringify(payload)}`);
      
      const response = await this.post(url, payload, { headers });
      
      this.logger.info(`Successfully created test with ID: ${response.data?.id}`);
      return response;
    } catch (error) {
      this.logger.error(`Failed to create test: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update an existing test
   * @param {string|number} id - Test ID
   * @param {Object} payload - Updated test data
   * @param {string} token - Authentication token
   * @returns {Promise<Object>} API response with updated test
   */
  async update(id, payload, token = null) {
    try {
      this.logger.info(`Updating test with ID: ${id}`);
      
      if (!id) {
        throw new Error('Test ID is required');
      }
      
      if (!payload) {
        throw new Error('Payload is required to update a test');
      }
      
      const url = this.endpoints.update(id);
      const headers = await this.buildHeaders(token);
      
      this.logger.debug(`Request URL: ${url}`);
      this.logger.debug(`Payload: ${JSON.stringify(payload)}`);
      
      const response = await this.put(url, payload, { headers });
      
      this.logger.info(`Successfully updated test with ID: ${id}`);
      return response;
    } catch (error) {
      this.logger.error(`Failed to update test ${id}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Partially update an existing test
   * @param {string|number} id - Test ID
   * @param {Object} payload - Partial test data
   * @param {string} token - Authentication token
   * @returns {Promise<Object>} API response with updated test
   */
  async patch(id, payload, token = null) {
    try {
      this.logger.info(`Partially updating test with ID: ${id}`);
      
      if (!id) {
        throw new Error('Test ID is required');
      }
      
      if (!payload) {
        throw new Error('Payload is required to patch a test');
      }
      
      const url = this.endpoints.update(id);
      const headers = await this.buildHeaders(token);
      
      this.logger.debug(`Request URL: ${url}`);
      this.logger.debug(`Payload: ${JSON.stringify(payload)}`);
      
      const response = await this.patch(url, payload, { headers });
      
      this.logger.info(`Successfully patched test with ID: ${id}`);
      return response;
    } catch (error) {
      this.logger.error(`Failed to patch test ${id}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a test
   * @param {string|number} id - Test ID
   * @param {string} token - Authentication token
   * @returns {Promise<Object>} API response confirming deletion
   */
  async delete(id, token = null) {
    try {
      this.logger.info(`Deleting test with ID: ${id}`);
      
      if (!id) {
        throw new Error('Test ID is required');
      }
      
      const url = this.endpoints.delete(id);
      const headers = await this.buildHeaders(token);
      
      this.logger.debug(`Request URL: ${url}`);
      
      const response = await this.delete(url, { headers });
      
      this.logger.info(`Successfully deleted test with ID: ${id}`);
      return response;
    } catch (error) {
      this.logger.error(`Failed to delete test ${id}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Search tests with filters
   * @param {Object} searchCriteria - Search parameters
   * @param {string} token - Authentication token
   * @returns {Promise<Object>} API response with matching tests
   */
  async search(searchCriteria, token = null) {
    try {
      this.logger.info('Searching tests with criteria');
      
      const url = this.endpoints.search();
      const headers = await this.buildHeaders(token);
      
      this.logger.debug(`Request URL: ${url}`);
      this.logger.debug(`Search Criteria: ${JSON.stringify(searchCriteria)}`);
      
      const response = await this.post(url, searchCriteria, { headers });
      
      this.logger.info(`Search returned ${response.data?.length || 0} results`);
      return response;
    } catch (error) {
      this.logger.error(`Failed to search tests: ${error.message}`);
      throw error;
    }
  }

  /**
   * Build authentication headers
   * @param {string} token - Authentication token
   * @returns {Promise<Object>} Headers object
   * @private
   */
  async buildHeaders(token) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    
    // Use provided token or get from AuthManager
    const authToken = token || await this.authManager.getToken();
    
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    return headers;
  }

  /**
   * Build query parameters string
   * @param {Object} params - Query parameters
   * @returns {string} Query string
   * @private
   */
  buildQueryParams(params) {
    if (!params || Object.keys(params).length === 0) {
      return '';
    }
    
    return Object.entries(params)
      .filter(([_, value]) => value !== null && value !== undefined)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
  }
}

module.exports = TestClient;