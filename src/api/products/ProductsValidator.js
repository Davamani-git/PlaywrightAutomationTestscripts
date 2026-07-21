/**
 * Products Validator
 * Validates API responses for Products module
 * Extends BaseValidator for common validation functionality
 * @module ProductsValidator
 */

const BaseValidator = require('../common/BaseValidator');
const { expect } = require('@playwright/test');
const Logger = require('../../utils/Logger');

class ProductsValidator extends BaseValidator {
  constructor() {
    super();
    this.logger = new Logger('ProductsValidator');
  }

  /**
   * Validate Get All Products response
   * @param {Object} response - API response object
   * @param {number} expectedStatus - Expected HTTP status code
   */
  async validateGetAll(response, expectedStatus = 200) {
    try {
      this.logger.info('Validating Get All Products response');
      
      // Validate status code
      await this.validateStatusCode(response, expectedStatus);
      
      const responseBody = await response.json();
      
      // Validate response is an array or contains data array
      if (Array.isArray(responseBody)) {
        expect(responseBody).toBeDefined();
        this.logger.info(`Validated array response with ${responseBody.length} products`);
      } else {
        expect(responseBody).toHaveProperty('data');
        expect(Array.isArray(responseBody.data)).toBeTruthy();
        this.logger.info(`Validated response with ${responseBody.data.length} products`);
      }
      
      // Validate response structure if products exist
      const products = Array.isArray(responseBody) ? responseBody : responseBody.data;
      if (products.length > 0) {
        await this.validateProductSchema(products[0]);
      }
      
      // Validate pagination if present
      if (responseBody.pagination) {
        await this.validatePagination(responseBody.pagination);
      }
      
      this.logger.info('Get All Products validation passed');
    } catch (error) {
      this.logger.error('Get All Products validation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate Get Product By ID response
   * @param {Object} response - API response object
   * @param {string} productId - Expected product ID
   * @param {number} expectedStatus - Expected HTTP status code
   */
  async validateGetById(response, productId, expectedStatus = 200) {
    try {
      this.logger.info('Validating Get Product By ID response', { productId });
      
      // Validate status code
      await this.validateStatusCode(response, expectedStatus);
      
      const responseBody = await response.json();
      
      // Validate response structure
      const product = responseBody.data || responseBody;
      expect(product).toBeDefined();
      
      // Validate product schema
      await this.validateProductSchema(product);
      
      // Validate product ID matches
      expect(product.id).toBe(productId);
      
      this.logger.info('Get Product By ID validation passed', { productId });
    } catch (error) {
      this.logger.error('Get Product By ID validation failed', { 
        productId,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Validate Create Product response
   * @param {Object} response - API response object
   * @param {Object} requestPayload - Original request payload
   * @param {number} expectedStatus - Expected HTTP status code
   */
  async validateCreate(response, requestPayload, expectedStatus = 201) {
    try {
      this.logger.info('Validating Create Product response');
      
      // Validate status code
      await this.validateStatusCode(response, expectedStatus);
      
      const responseBody = await response.json();
      const product = responseBody.data || responseBody;
      
      // Validate response structure
      expect(product).toBeDefined();
      await this.validateProductSchema(product);
      
      // Validate product ID is generated
      expect(product.id).toBeDefined();
      expect(product.id).not.toBeNull();
      
      // Validate request payload fields match response
      expect(product.name).toBe(requestPayload.name);
      expect(product.price).toBe(requestPayload.price);
      expect(product.sku).toBe(requestPayload.sku);
      
      if (requestPayload.description) {
        expect(product.description).toBe(requestPayload.description);
      }
      
      if (requestPayload.category) {
        expect(product.category).toBe(requestPayload.category);
      }
      
      // Validate timestamps
      expect(product.createdAt).toBeDefined();
      expect(product.updatedAt).toBeDefined();
      
      // Validate success message if present
      if (responseBody.message) {
        expect(responseBody.message).toContain('success');
      }
      
      this.logger.info('Create Product validation passed', { productId: product.id });
      return product;
    } catch (error) {
      this.logger.error('Create Product validation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate Update Product response
   * @param {Object} response - API response object
   * @param {string} productId - Product ID being updated
   * @param {Object} requestPayload - Update request payload
   * @param {number} expectedStatus - Expected HTTP status code
   */
  async validateUpdate(response, productId, requestPayload, expectedStatus = 200) {
    try {
      this.logger.info('Validating Update Product response', { productId });
      
      // Validate status code
      await this.validateStatusCode(response, expectedStatus);
      
      const responseBody = await response.json();
      const product = responseBody.data || responseBody;
      
      // Validate response structure
      expect(product).toBeDefined();
      await this.validateProductSchema(product);
      
      // Validate product ID matches
      expect(product.id).toBe(productId);
      
      // Validate updated fields
      Object.keys(requestPayload).forEach(key => {
        if (key !== 'id') {
          expect(product[key]).toBe(requestPayload[key]);
        }
      });
      
      // Validate updatedAt timestamp is recent
      expect(product.updatedAt).toBeDefined();
      const updatedAt = new Date(product.updatedAt);
      const now = new Date();
      const timeDiff = now - updatedAt;
      expect(timeDiff).toBeLessThan(60000); // Within last minute
      
      this.logger.info('Update Product validation passed', { productId });
    } catch (error) {
      this.logger.error('Update Product validation failed', { 
        productId,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Validate Delete Product response
   * @param {Object} response - API response object
   * @param {string} productId - Product ID being deleted
   * @param {number} expectedStatus - Expected HTTP status code
   */
  async validateDelete(response, productId, expectedStatus = 200) {
    try {
      this.logger.info('Validating Delete Product response', { productId });
      
      // Validate status code (200 or 204)
      await this.validateStatusCode(response, expectedStatus);
      
      // For 204 No Content, no body validation needed
      if (expectedStatus === 204) {
        this.logger.info('Delete Product validation passed (204 No Content)', { productId });
        return;
      }
      
      const responseBody = await response.json();
      
      // Validate success message
      expect(responseBody.message || responseBody.status).toBeDefined();
      
      // Validate deleted product ID if returned
      if (responseBody.data) {
        expect(responseBody.data.id).toBe(productId);
      }
      
      this.logger.info('Delete Product validation passed', { productId });
    } catch (error) {
      this.logger.error('Delete Product validation failed', { 
        productId,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Validate product schema structure
   * @param {Object} product - Product object to validate
   */
  async validateProductSchema(product) {
    // Mandatory fields
    expect(product).toHaveProperty('id');
    expect(product).toHaveProperty('name');
    expect(product).toHaveProperty('price');
    expect(product).toHaveProperty('sku');
    
    // Data type validation
    expect(typeof product.id).toBe('string');
    expect(typeof product.name).toBe('string');
    expect(typeof product.price).toBe('number');
    expect(typeof product.sku).toBe('string');
    
    // Value validation
    expect(product.name.length).toBeGreaterThan(0);
    expect(product.price).toBeGreaterThanOrEqual(0);
    expect(product.sku.length).toBeGreaterThan(0);
    
    // Optional fields validation if present
    if (product.description !== undefined) {
      expect(typeof product.description).toBe('string');
    }
    
    if (product.category !== undefined) {
      expect(typeof product.category).toBe('string');
    }
    
    if (product.quantity !== undefined) {
      expect(typeof product.quantity).toBe('number');
      expect(product.quantity).toBeGreaterThanOrEqual(0);
    }
    
    if (product.isActive !== undefined) {
      expect(typeof product.isActive).toBe('boolean');
    }
    
    // Timestamp validation
    if (product.createdAt) {
      expect(this.isValidDate(product.createdAt)).toBeTruthy();
    }
    
    if (product.updatedAt) {
      expect(this.isValidDate(product.updatedAt)).toBeTruthy();
    }
  }

  /**
   * Validate error response
   * @param {Object} response - API response object
   * @param {number} expectedStatus - Expected error status code
   * @param {string} expectedMessage - Expected error message (optional)
   */
  async validateErrorResponse(response, expectedStatus, expectedMessage = null) {
    try {
      this.logger.info('Validating error response', { expectedStatus });
      
      // Validate status code
      await this.validateStatusCode(response, expectedStatus);
      
      const responseBody = await response.json();
      
      // Validate error structure
      expect(responseBody.error || responseBody.message).toBeDefined();
      
      // Validate error message if provided
      if (expectedMessage) {
        const errorMsg = responseBody.error || responseBody.message;
        expect(errorMsg.toLowerCase()).toContain(expectedMessage.toLowerCase());
      }
      
      this.logger.info('Error response validation passed');
    } catch (error) {
      this.logger.error('Error response validation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate pagination structure
   * @param {Object} pagination - Pagination object
   */
  async validatePagination(pagination) {
    expect(pagination).toHaveProperty('page');
    expect(pagination).toHaveProperty('pageSize');
    expect(pagination).toHaveProperty('totalPages');
    expect(pagination).toHaveProperty('totalItems');
    
    expect(typeof pagination.page).toBe('number');
    expect(typeof pagination.pageSize).toBe('number');
    expect(typeof pagination.totalPages).toBe('number');
    expect(typeof pagination.totalItems).toBe('number');
    
    expect(pagination.page).toBeGreaterThanOrEqual(1);
    expect(pagination.pageSize).toBeGreaterThan(0);
    expect(pagination.totalPages).toBeGreaterThanOrEqual(0);
    expect(pagination.totalItems).toBeGreaterThanOrEqual(0);
  }

  /**
   * Validate response time
   * @param {number} responseTime - Response time in milliseconds
   * @param {number} maxTime - Maximum acceptable response time
   */
  validateResponseTime(responseTime, maxTime = 3000) {
    this.logger.info('Validating response time', { responseTime, maxTime });
    expect(responseTime).toBeLessThan(maxTime);
    this.logger.info('Response time validation passed');
  }

  /**
   * Check if date string is valid
   * @param {string} dateString - Date string to validate
   * @returns {boolean} True if valid date
   */
  isValidDate(dateString) {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
  }
}

module.exports = ProductsValidator;