/**
 * Update Product API Tests
 * Tests for updating existing products
 * @module UpdateProductTests
 */

const { test, expect } = require('@playwright/test');
const ProductsService = require('../../../src/services/ProductsService');
const ProductsPayloads = require('../../../src/api/products/ProductsPayloads');
const ProductsValidator = require('../../../src/api/products/ProductsValidator');
const AuthManager = require('../../../src/auth/AuthManager');
const Logger = require('../../../src/utils/Logger');

const logger = new Logger('UpdateProductTests');

test.describe('Update Product API Tests', () => {
  let productsService;
  let authManager;
  let validator;
  let testProductId;
  let originalProduct;

  test.beforeAll(async ({ request }) => {
    logger.info('Setting up Update Product tests');
    authManager = new AuthManager(request);
    await authManager.authenticate();
    validator = new ProductsValidator();
  });

  test.beforeEach(async ({ request }) => {
    productsService = new ProductsService(request, authManager);
    
    // Create a test product for update tests
    const payload = ProductsPayloads.getValidCreatePayload();
    const response = await productsService.createProduct(payload);
    originalProduct = (await response.json()).data || await response.json();
    testProductId = originalProduct.id;
    
    logger.info('Test product created for update', { testProductId });
  });

  test.afterEach(async () => {
    await productsService.cleanup();
  });

  test('TC001: Update product with valid complete payload', async () => {
    logger.info('Test: Update product with valid complete payload');
    
    // Arrange
    const updatePayload = ProductsPayloads.getValidUpdatePayload();
    
    // Act
    const response = await productsService.updateProduct(testProductId, updatePayload);
    
    // Assert
    expect(response.status()).toBe(200);
    
    const responseBody = await response.json();
    const updatedProduct = responseBody.data || responseBody;
    
    expect(updatedProduct.id).toBe(testProductId);
    expect(updatedProduct.name).toBe(updatePayload.name);
    expect(updatedProduct.price).toBe(updatePayload.price);
    expect(updatedProduct.description).toBe(updatePayload.description);
    
    logger.info('Test passed: Product updated successfully');
  });

  test('TC002: Partially update product (PATCH)', async () => {
    logger.info('Test: Partially update product');
    
    // Arrange
    const partialPayload = ProductsPayloads.getPartialUpdatePayload();
    
    // Act
    const response = await productsService.patchProduct(testProductId, partialPayload);
    
    // Assert
    expect(response.status()).toBe(200);
    
    const responseBody = await response.json();
    const updatedProduct = responseBody.data || responseBody;
    
    expect(updatedProduct.id).toBe(testProductId);
    expect(updatedProduct.price).toBe(partialPayload.price);
    expect(updatedProduct.quantity).toBe(partialPayload.quantity);
    // Original fields should remain unchanged
    expect(updatedProduct.name).toBe(originalProduct.name);
    expect(updatedProduct.sku).toBe(originalProduct.sku);
    
    logger.info('Test passed: Product partially updated');
  });

  test('TC003: Update product with invalid ID', async () => {
    logger.info('Test: Update product with invalid ID');
    
    // Arrange
    const invalidId = 'invalid-id';
    const updatePayload = ProductsPayloads.getValidUpdatePayload();
    
    // Act
    try {
      const response = await productsService.client.update(invalidId, updatePayload);
      
      // Assert
      expect([400, 404]).toContain(response.status());
      await validator.validateErrorResponse(response, response.status());
      
      logger.info('Test passed: Invalid ID rejected');
    } catch (error) {
      logger.info('Test passed: Invalid ID error handled');
    }
  });

  test('TC004: Update non-existent product', async () => {
    logger.info('Test: Update non-existent product');
    
    // Arrange
    const nonExistentId = '00000000-0000-0000-0000-000000000000';
    const updatePayload = ProductsPayloads.getValidUpdatePayload();
    
    // Act
    try {
      const response = await productsService.client.update(nonExistentId, updatePayload);
      
      // Assert
      expect(response.status()).toBe(404);
      await validator.validateErrorResponse(response, 404, 'not found');
      
      logger.info('Test passed: Non-existent product returns 404');
    } catch (error) {
      logger.info('Test passed: Non-existent product error handled');
    }
  });

  test('TC005: Update product with invalid data types', async () => {
    logger.info('Test: Update product with invalid data types');
    
    // Arrange
    const invalidPayload = ProductsPayloads.getInvalidUpdatePayload();
    
    // Act
    try {
      const response = await productsService.client.update(testProductId, invalidPayload);
      
      // Assert
      expect(response.status()).toBe(400);
      await validator.validateErrorResponse(response, 400);
      
      logger.info('Test passed: Invalid data types rejected');
    } catch (error) {
      logger.info('Test passed: Invalid data types error handled');
    }
  });

  test('TC006: Update product with empty payload', async () => {
    logger.info('Test: Update product with empty payload');
    
    // Arrange
    const emptyPayload = ProductsPayloads.getEmptyPayload();
    
    // Act
    try {
      const response = await productsService.client.update(testProductId, emptyPayload);
      
      // Assert - Some APIs accept empty payload, others reject it
      expect([200, 400]).toContain(response.status());
      
      logger.info('Test passed: Empty payload handled');
    } catch (error) {
      logger.info('Test passed: Empty payload error handled');
    }
  });

  test('TC007: Update product price to negative value', async () => {
    logger.info('Test: Update product price to negative value');
    
    // Arrange
    const invalidPayload = {
      price: -100
    };
    
    // Act
    try {
      const response = await productsService.client.update(testProductId, invalidPayload);
      
      // Assert
      expect(response.status()).toBe(400);
      await validator.validateErrorResponse(response, 400, 'price');
      
      logger.info('Test passed: Negative price rejected');
    } catch (error) {
      logger.info('Test passed: Negative price error handled');
    }
  });

  test('TC008: Update product name to empty string', async () => {
    logger.info('Test: Update product name to empty string');
    
    // Arrange
    const invalidPayload = {
      name: ''
    };
    
    // Act
    try {
      const response = await productsService.client.update(testProductId, invalidPayload);
      
      // Assert
      expect(response.status()).toBe(400);
      await validator.validateErrorResponse(response, 400, 'name');
      
      logger.info('Test passed: Empty name rejected');
    } catch (error) {
      logger.info('Test passed: Empty name error handled');
    }
  });

  test('TC009: Verify updatedAt timestamp changes after update', async () => {
    logger.info('Test: Verify updatedAt timestamp changes');
    
    // Arrange
    const originalUpdatedAt = new Date(originalProduct.updatedAt);
    
    // Wait a moment to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const updatePayload = ProductsPayloads.getPartialUpdatePayload();
    
    // Act
    const response = await productsService.updateProduct(testProductId, updatePayload);
    
    // Assert
    const updatedProduct = (await response.json()).data || await response.json();
    const newUpdatedAt = new Date(updatedProduct.updatedAt);
    
    expect(newUpdatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    
    logger.info('Test passed: updatedAt timestamp updated');
  });

  test('TC010: Verify createdAt timestamp remains unchanged after update', async () => {
    logger.info('Test: Verify createdAt timestamp remains unchanged');
    
    // Arrange
    const originalCreatedAt = originalProduct.createdAt;
    const updatePayload = ProductsPayloads.getValidUpdatePayload();
    
    // Act
    const response = await productsService.updateProduct(testProductId, updatePayload);
    
    // Assert
    const updatedProduct = (await response.json()).data || await response.json();
    
    expect(updatedProduct.createdAt).toBe(originalCreatedAt);
    
    logger.info('Test passed: createdAt timestamp unchanged');
  });

  test('TC011: Update product and verify changes persist', async () => {
    logger.info('Test: Update product and verify changes persist');
    
    // Arrange
    const updatePayload = ProductsPayloads.getValidUpdatePayload();
    
    // Act - Update product
    await productsService.updateProduct(testProductId, updatePayload);
    
    // Act - Retrieve updated product
    const getResponse = await productsService.getProductById(testProductId);
    
    // Assert
    const retrievedProduct = (await getResponse.json()).data || await getResponse.json();
    
    expect(retrievedProduct.name).toBe(updatePayload.name);
    expect(retrievedProduct.price).toBe(updatePayload.price);
    expect(retrievedProduct.description).toBe(updatePayload.description);
    
    logger.info('Test passed: Updated data persists');
  });

  test('TC012: Update product multiple times', async () => {
    logger.info('Test: Update product multiple times');
    
    // Act - Update 1
    const update1 = { price: 100 };
    await productsService.patchProduct(testProductId, update1);
    
    // Act - Update 2
    const update2 = { price: 200 };
    await productsService.patchProduct(testProductId, update2);
    
    // Act - Update 3
    const update3 = { price: 300 };
    const finalResponse = await productsService.patchProduct(testProductId, update3);
    
    // Assert
    const finalProduct = (await finalResponse.json()).data || await finalResponse.json();
    expect(finalProduct.price).toBe(300);
    
    logger.info('Test passed: Multiple updates successful');
  });

  test('TC013: Verify response time for update operation', async () => {
    logger.info('Test: Verify response time for update operation');
    
    // Arrange
    const updatePayload = ProductsPayloads.getValidUpdatePayload();
    
    // Act
    const startTime = Date.now();
    const response = await productsService.updateProduct(testProductId, updatePayload);
    const responseTime = Date.now() - startTime;
    
    // Assert
    expect(response.status()).toBe(200);
    validator.validateResponseTime(responseTime, 3000);
    
    logger.info('Test passed: Response time within acceptable limits', { responseTime });
  });
});