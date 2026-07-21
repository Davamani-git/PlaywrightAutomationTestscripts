/**
 * Products API Endpoints
 * Defines all endpoint paths for Products module
 * @module ProductsEndpoints
 */

class ProductsEndpoints {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  /**
   * Get base products endpoint
   * @returns {string} Base endpoint URL
   */
  getBaseEndpoint() {
    return `${this.baseUrl}/api/v1/products`;
  }

  /**
   * Get endpoint for specific product by ID
   * @param {string} productId - Product identifier
   * @returns {string} Product by ID endpoint URL
   */
  getByIdEndpoint(productId) {
    return `${this.baseUrl}/api/v1/products/${productId}`;
  }

  /**
   * Get endpoint for creating product
   * @returns {string} Create product endpoint URL
   */
  getCreateEndpoint() {
    return `${this.baseUrl}/api/v1/products`;
  }

  /**
   * Get endpoint for updating product
   * @param {string} productId - Product identifier
   * @returns {string} Update product endpoint URL
   */
  getUpdateEndpoint(productId) {
    return `${this.baseUrl}/api/v1/products/${productId}`;
  }

  /**
   * Get endpoint for deleting product
   * @param {string} productId - Product identifier
   * @returns {string} Delete product endpoint URL
   */
  getDeleteEndpoint(productId) {
    return `${this.baseUrl}/api/v1/products/${productId}`;
  }

  /**
   * Get endpoint for searching products
   * @param {Object} queryParams - Search parameters
   * @returns {string} Search endpoint URL with query parameters
   */
  getSearchEndpoint(queryParams = {}) {
    const params = new URLSearchParams(queryParams).toString();
    return `${this.baseUrl}/api/v1/products/search?${params}`;
  }
}

module.exports = ProductsEndpoints;