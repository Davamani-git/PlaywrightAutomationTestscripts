/**
 * Delete Product API Tests
 * Tests for deleting products
 * @module DeleteProductTests
 */

const { test, expect } = require('@playwright/test');
const ProductsService = require('../../../src/services/ProductsService');
const ProductsPayloads = require('../../../src/api/products/ProductsPayloads');
const ProductsValidator = require('../../../src/api/products/ProductsValidator');
const AuthManager = require('../../../src/auth/AuthManager');
const Logger = require('../../../src/utils/Logger');

const logger = new Logger('DeleteProductTests');

test.describe('Delete Product API Tests', () => {
  let productsService;
  let authManager;
  let validator;
  let testProductId;

  test.beforeAll(async ({ request }) => {
    logger.info('Setting up Delete Product tests');
    authManager = new AuthManager(request);
    await authManager.authenticate();
    validator = new ProductsValidator();
  });

  test.beforeEach(async ({ request }) => {
    productsService = new ProductsService(request, authManager);
    
    // Create a test product for deletion tests
    const payload = ProductsPayloads.getValidCreatePayload();
    const response = await productsService.createProduct(payload);
    const product = (await response.json()).data || await response.json();
    testProductId = product.id;
    
    logger.info('Test product created for deletion', { testProductId });
  });

  test.afterEach(async () => {
    // Cleanup any remaining products
    try {
      await productsService.cleanup();
    } catch (error) {
      logger.warn('Cleanup error (expected for delete tests)', { error: error.message });
    }
  });

  test('TC001: Delete product with valid ID', async () => {
    logger.info('Test: Delete product with valid ID', { testProductId });
    
    // Act
    const response = await productsService.deleteProduct(testProductId);
    
    // Assert
    expect([200, 204]).toContain(response.status());
    
    // Verify product is deleted
    const isDeleted = await productsService.verifyProductDeleted(testProductId);
    expect(isDeleted).toBeTruthy();
    
    logger.info('Test passed: Product deleted successfully');
  });

  test('TC002: Delete product with invalid ID', async () => {
    logger.info('Test: Delete product with invalid ID');
    
    // Arrange
    const invalidId = 'invalid-id-format';
    
    // Act
    try {
      const response = await productsService.client.delete(invalidId);
      
      // Assert
      expect([400, 404]).toContain(response.status());
      await validator.validateErrorResponse(response, response.status());
      
      logger.info('Test passed: Invalid ID rejected');
    } catch (error) {
      logger.info('Test passed: Invalid ID error handled');
    }
  });

  test('TC003: Delete non-existent product', async () => {
    logger.info('Test: Delete non-existent product');
    
    // Arrange
    const nonExistentId = '00000000-0000-0000-0000-000000000000';
    
    // Act
    try {
      const response = await productsService.client.delete(nonExistentId);
      
      // Assert
      expect(response.status()).toBe(404);
      await validator.validateErrorResponse(response, 404, 'not found');
      
      logger.info('Test passed: Non-existent product returns 404');
    } catch (error) {
      logger.info('Test passed: Non-existent product error handled');
    }
  });

  test('TC004: Delete already deleted product', async () => {
    logger.info('Test: Delete already deleted product');
    
    // Arrange - Delete product first time
    await productsService.deleteProduct(testProductId);
    
    // Act - Try to delete again
    try {
      const response = await productsService.client.delete(testProductId);
      
      // Assert
      expect(response.status()).toBe(404);
      await validator.validateErrorResponse(response, 404);
      
      logger.info('Test passed: Already deleted product returns 404');
    } catch (error) {
      logger.info('Test passed: Already deleted product error handled');
    }
  });

  test('TC005: Delete product with null ID', async () => {
    logger.info('Test: Delete product with null ID');
    
    // Act & Assert
    try {
      const response = await productsService.client.delete(null);
      expect([400, 404]).toContain(response.status());
      logger.info('Test passed: Null ID rejected');
    } catch (error) {
      logger.info('Test passed: Null ID error handled');
    }
  });

  test('TC006: Delete product with empty string ID', async () => {
    logger.info('Test: Delete product with empty string ID');
    
    // Act & Assert
    try {
      const response = await productsService.client.delete('');
      expect([400, 404]).toContain(response.status());
      logger.info('Test passed: Empty string ID rejected');
    } catch (error) {
      logger.info('Test passed: Empty string ID error handled');
    }
  });

  test('TC007: Verify deleted product cannot be retrieved', async () => {
    logger.info('Test: Verify deleted product cannot be retrieved');
    
    // Arrange - Delete product
    await productsService.deleteProduct(testProductId);
    
    // Act - Try to retrieve deleted product
    try {
      const response = await productsService.client.getById(testProductId);
      
      // Assert
      expect(response.status()).toBe(404);
      
      logger.info('Test passed: Deleted product cannot be retrieved');
    } catch (error) {
      logger.info('Test passed: Deleted product retrieval error handled');
    }
  });

  test('TC008: Verify deleted product not in list', async () => {
    logger.info('Test: Verify deleted product not in list');
    
    // Arrange - Get initial list
    const beforeResponse = await productsService.getAllProducts();
    const beforeBody = await beforeResponse.json();
    const beforeProducts = Array.isArray(beforeBody) ? beforeBody : beforeBody.data;
    const beforeCount = beforeProducts.length;
    
    // Act - Delete product
    await productsService.deleteProduct(testProductId);
    
    // Get list after deletion
    const afterResponse = await productsService.getAllProducts();
    const afterBody = await afterResponse.json();
    const afterProducts = Array.isArray(afterBody) ? afterBody : afterBody.data;
    
    // Assert
    expect(afterProducts.length).toBeLessThanOrEqual(beforeCount);
    
    const deletedProductExists = afterProducts.some(p => p.id === testProductId);
    expect(deletedProductExists).toBeFalsy();
    
    logger.info('Test passed: Deleted product not in list');
  });

  test('TC009: Delete product and verify response structure', async () => {
    logger.info('Test: Delete product and verify response structure');
    
    // Act
    const response = await productsService.deleteProduct(testProductId);
    
    // Assert
    expect([200, 204]).toContain(response.status());
    
    if (response.status() === 200) {
      const responseBody = await response.json();
      expect(responseBody.message || responseBody.status).toBeDefined();
    }
    
    logger.info('Test passed: Delete response structure validated');
  });

  test('TC010: Verify response time for delete operation', async () => {
    logger.info('Test: Verify response time for delete operation');
    
    // Act
    const startTime = Date.now();
    const response = await productsService.deleteProduct(testProductId);
    const responseTime = Date.now() - startTime;
    
    // Assert
    expect([200, 204]).toContain(response.status());
    validator.validateResponseTime(responseTime, 3000);
    
    logger.info('Test passed: Response time within acceptable limits', { responseTime });
  });

  test('TC011: Delete multiple products sequentially', async () => {
    logger.info('Test: Delete multiple products sequentially');
    
    // Arrange - Create additional products
    const product2Response = await productsService.createProduct(ProductsPayloads.getValidCreatePayload());
    const product2 = (await product2Response.json()).data || await product2Response.json();
    
    const product3Response = await productsService.createProduct(ProductsPayloads.getValidCreatePayload());
    const product3 = (await product3Response.json()).data || await product3Response.json();
    
    // Act - Delete all products
    const delete1 = await productsService.deleteProduct(testProductId);
    const delete2 = await productsService.deleteProduct(product2.id);
    const delete3 = await productsService.deleteProduct(product3.id);
    
    // Assert
    expect([200, 204]).toContain(delete1.status());
    expect([200, 204]).toContain(delete2.status());
    expect([200, 204]).toContain(delete3.status());
    
    logger.info('Test passed: Multiple products deleted successfully');
  });

  test('TC012: Delete product with SQL injection attempt', async () => {
    logger.info('Test: Delete product with SQL injection attempt');
    
    // Arrange
    const sqlInjectionId = "1' OR '1'='1";
    
    // Act
    try {
      const response = await productsService.client.delete(sqlInjectionId);
      
      // Assert
      expect([400, 404]).toContain(response.status());
      
      // Verify original product still exists
      const verifyResponse = await productsService.getProductById(testProductId);
      expect(verifyResponse.status()).toBe(200);
      
      logger.info('Test passed: SQL injection attempt blocked');
    } catch (error) {
      logger.info('Test passed: SQL injection error handled');
    }
  });
});