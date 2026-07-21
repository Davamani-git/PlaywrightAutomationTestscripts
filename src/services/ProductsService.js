/**
 * Products Service
 * Business logic layer for Products operations
 * Orchestrates client calls and adds business logic
 * @module ProductsService
 */

const ProductsClient = require('../api/products/ProductsClient');
const ProductsValidator = require('../api/products/ProductsValidator');
const Logger = require('../utils/Logger');

class ProductsService {
  constructor(request, authManager) {
    this.client = new ProductsClient(request, authManager);
    this.validator = new ProductsValidator();
    this.logger = new Logger('ProductsService');
    this.createdProductIds = []; // Track created products for cleanup
  }

  /**
   * Get all products with validation
   * @param {Object} queryParams - Query parameters for filtering
   * @returns {Promise<Object>} Validated response
   */
  async getAllProducts(queryParams = {}) {
    try {
      this.logger.info('Service: Getting all products', { queryParams });
      const startTime = Date.now();
      
      const response = await this.client.getAll(queryParams);
      
      const responseTime = Date.now() - startTime;
      this.validator.validateResponseTime(responseTime);
      
      await this.validator.validateGetAll(response);
      
      this.logger.info('Service: Successfully retrieved all products');
      return response;
    } catch (error) {
      this.logger.error('Service: Failed to get all products', { error: error.message });
      throw error;
    }
  }

  /**
   * Get product by ID with validation
   * @param {string} productId - Product identifier
   * @returns {Promise<Object>} Validated response
   */
  async getProductById(productId) {
    try {
      this.logger.info('Service: Getting product by ID', { productId });
      const startTime = Date.now();
      
      const response = await this.client.getById(productId);
      
      const responseTime = Date.now() - startTime;
      this.validator.validateResponseTime(responseTime);
      
      await this.validator.validateGetById(response, productId);
      
      this.logger.info('Service: Successfully retrieved product', { productId });
      return response;
    } catch (error) {
      this.logger.error('Service: Failed to get product by ID', { 
        productId,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Create product with validation
   * @param {Object} payload - Product data
   * @returns {Promise<Object>} Validated response with created product
   */
  async createProduct(payload) {
    try {
      this.logger.info('Service: Creating product', { payload });
      const startTime = Date.now();
      
      const response = await this.client.create(payload);
      
      const responseTime = Date.now() - startTime;
      this.validator.validateResponseTime(responseTime);
      
      const product = await this.validator.validateCreate(response, payload);
      
      // Track created product for cleanup
      if (product && product.id) {
        this.createdProductIds.push(product.id);
      }
      
      this.logger.info('Service: Successfully created product', { productId: product.id });
      return response;
    } catch (error) {
      this.logger.error('Service: Failed to create product', { error: error.message });
      throw error;
    }
  }

  /**
   * Update product with validation
   * @param {string} productId - Product identifier
   * @param {Object} payload - Updated product data
   * @returns {Promise<Object>} Validated response
   */
  async updateProduct(productId, payload) {
    try {
      this.logger.info('Service: Updating product', { productId, payload });
      const startTime = Date.now();
      
      const response = await this.client.update(productId, payload);
      
      const responseTime = Date.now() - startTime;
      this.validator.validateResponseTime(responseTime);
      
      await this.validator.validateUpdate(response, productId, payload);
      
      this.logger.info('Service: Successfully updated product', { productId });
      return response;
    } catch (error) {
      this.logger.error('Service: Failed to update product', { 
        productId,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Partially update product with validation
   * @param {string} productId - Product identifier
   * @param {Object} payload - Partial product data
   * @returns {Promise<Object>} Validated response
   */
  async patchProduct(productId, payload) {
    try {
      this.logger.info('Service: Patching product', { productId, payload });
      const startTime = Date.now();
      
      const response = await this.client.patch(productId, payload);
      
      const responseTime = Date.now() - startTime;
      this.validator.validateResponseTime(responseTime);
      
      await this.validator.validateUpdate(response, productId, payload);
      
      this.logger.info('Service: Successfully patched product', { productId });
      return response;
    } catch (error) {
      this.logger.error('Service: Failed to patch product', { 
        productId,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Delete product with validation
   * @param {string} productId - Product identifier
   * @returns {Promise<Object>} Validated response
   */
  async deleteProduct(productId) {
    try {
      this.logger.info('Service: Deleting product', { productId });
      const startTime = Date.now();
      
      const response = await this.client.delete(productId);
      
      const responseTime = Date.now() - startTime;
      this.validator.validateResponseTime(responseTime);
      
      await this.validator.validateDelete(response, productId);
      
      // Remove from tracked products
      this.createdProductIds = this.createdProductIds.filter(id => id !== productId);
      
      this.logger.info('Service: Successfully deleted product', { productId });
      return response;
    } catch (error) {
      this.logger.error('Service: Failed to delete product', { 
        productId,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Search products with validation
   * @param {Object} searchCriteria - Search parameters
   * @returns {Promise<Object>} Validated response
   */
  async searchProducts(searchCriteria) {
    try {
      this.logger.info('Service: Searching products', { searchCriteria });
      const startTime = Date.now();
      
      const response = await this.client.search(searchCriteria);
      
      const responseTime = Date.now() - startTime;
      this.validator.validateResponseTime(responseTime);
      
      await this.validator.validateGetAll(response);
      
      this.logger.info('Service: Successfully searched products');
      return response;
    } catch (error) {
      this.logger.error('Service: Failed to search products', { error: error.message });
      throw error;
    }
  }

  /**
   * Verify product exists
   * @param {string} productId - Product identifier
   * @returns {Promise<boolean>} True if product exists
   */
  async verifyProductExists(productId) {
    try {
      const response = await this.client.getById(productId);
      return response.status() === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Verify product deleted
   * @param {string} productId - Product identifier
   * @returns {Promise<boolean>} True if product is deleted
   */
  async verifyProductDeleted(productId) {
    try {
      const response = await this.client.getById(productId);
      return response.status() === 404;
    } catch (error) {
      return true; // Assume deleted if error
    }
  }

  /**
   * Cleanup all created products
   * Should be called in test teardown
   */
  async cleanup() {
    this.logger.info('Service: Starting cleanup', { 
      productsToDelete: this.createdProductIds.length 
    });
    
    const deletePromises = this.createdProductIds.map(async (productId) => {
      try {
        await this.client.delete(productId);
        this.logger.info('Service: Cleaned up product', { productId });
      } catch (error) {
        this.logger.warn('Service: Failed to cleanup product', { 
          productId,
          error: error.message 
        });
      }
    });
    
    await Promise.allSettled(deletePromises);
    this.createdProductIds = [];
    this.logger.info('Service: Cleanup completed');
  }

  /**
   * Get list of created product IDs
   * @returns {Array<string>} Array of product IDs
   */
  getCreatedProductIds() {
    return [...this.createdProductIds];
  }
}

module.exports = ProductsService;