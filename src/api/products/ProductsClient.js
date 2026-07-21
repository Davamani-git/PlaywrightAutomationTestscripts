/**
 * Products API Client
 * Handles all HTTP operations for Products module
 * Extends BaseApiClient for common functionality
 * @module ProductsClient
 */

const BaseApiClient = require('../common/BaseApiClient');
const ProductsEndpoints = require('./ProductsEndpoints');
const Logger = require('../../utils/Logger');
const ConfigManager = require('../../config/ConfigManager');

class ProductsClient extends BaseApiClient {
  constructor(request, authManager) {
    super(request, authManager);
    this.endpoints = new ProductsEndpoints(ConfigManager.getBaseUrl());
    this.logger = new Logger('ProductsClient');
  }

  /**
   * Get all products
   * @param {Object} queryParams - Optional query parameters for filtering
   * @returns {Promise<Object>} API response with products list
   */
  async getAll(queryParams = {}) {
    try {
      this.logger.info('Fetching all products', { queryParams });
      const endpoint = this.endpoints.getBaseEndpoint();
      const response = await this.get(endpoint, queryParams);
      this.logger.info('Successfully fetched all products', { 
        statusCode: response.status(),
        count: response.data?.length || 0 
      });
      return response;
    } catch (error) {
      this.logger.error('Failed to fetch all products', { error: error.message });
      throw error;
    }
  }

  /**
   * Get product by ID
   * @param {string} productId - Product identifier
   * @returns {Promise<Object>} API response with product details
   */
  async getById(productId) {
    try {
      this.logger.info('Fetching product by ID', { productId });
      const endpoint = this.endpoints.getByIdEndpoint(productId);
      const response = await this.get(endpoint);
      this.logger.info('Successfully fetched product', { 
        productId,
        statusCode: response.status() 
      });
      return response;
    } catch (error) {
      this.logger.error('Failed to fetch product by ID', { 
        productId,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Create new product
   * @param {Object} payload - Product data
   * @returns {Promise<Object>} API response with created product
   */
  async create(payload) {
    try {
      this.logger.info('Creating new product', { payload });
      const endpoint = this.endpoints.getCreateEndpoint();
      const response = await this.post(endpoint, payload);
      this.logger.info('Successfully created product', { 
        statusCode: response.status(),
        productId: response.data?.id 
      });
      return response;
    } catch (error) {
      this.logger.error('Failed to create product', { 
        payload,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Update existing product
   * @param {string} productId - Product identifier
   * @param {Object} payload - Updated product data
   * @returns {Promise<Object>} API response with updated product
   */
  async update(productId, payload) {
    try {
      this.logger.info('Updating product', { productId, payload });
      const endpoint = this.endpoints.getUpdateEndpoint(productId);
      const response = await this.put(endpoint, payload);
      this.logger.info('Successfully updated product', { 
        productId,
        statusCode: response.status() 
      });
      return response;
    } catch (error) {
      this.logger.error('Failed to update product', { 
        productId,
        payload,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Partially update product
   * @param {string} productId - Product identifier
   * @param {Object} payload - Partial product data
   * @returns {Promise<Object>} API response with updated product
   */
  async patch(productId, payload) {
    try {
      this.logger.info('Partially updating product', { productId, payload });
      const endpoint = this.endpoints.getUpdateEndpoint(productId);
      const response = await this.patchRequest(endpoint, payload);
      this.logger.info('Successfully patched product', { 
        productId,
        statusCode: response.status() 
      });
      return response;
    } catch (error) {
      this.logger.error('Failed to patch product', { 
        productId,
        payload,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Delete product
   * @param {string} productId - Product identifier
   * @returns {Promise<Object>} API response confirming deletion
   */
  async delete(productId) {
    try {
      this.logger.info('Deleting product', { productId });
      const endpoint = this.endpoints.getDeleteEndpoint(productId);
      const response = await this.deleteRequest(endpoint);
      this.logger.info('Successfully deleted product', { 
        productId,
        statusCode: response.status() 
      });
      return response;
    } catch (error) {
      this.logger.error('Failed to delete product', { 
        productId,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Search products
   * @param {Object} searchCriteria - Search parameters
   * @returns {Promise<Object>} API response with matching products
   */
  async search(searchCriteria) {
    try {
      this.logger.info('Searching products', { searchCriteria });
      const endpoint = this.endpoints.getSearchEndpoint(searchCriteria);
      const response = await this.get(endpoint);
      this.logger.info('Successfully searched products', { 
        statusCode: response.status(),
        count: response.data?.length || 0 
      });
      return response;
    } catch (error) {
      this.logger.error('Failed to search products', { 
        searchCriteria,
        error: error.message 
      });
      throw error;
    }
  }
}

module.exports = ProductsClient;