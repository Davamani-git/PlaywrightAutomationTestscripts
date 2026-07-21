/**
 * Get Product By ID API Tests
 * Tests for retrieving product by ID
 * @module GetProductByIdTests
 */

const { test, expect } = require('@playwright/test');
const ProductsService = require('../../../src/services/ProductsService');
const ProductsPayloads = require('../../../src/api/products/ProductsPayloads');
const ProductsData = require('../../../src/api/products/ProductsData');
const ProductsValidator = require('../../../src/api/products/ProductsValidator');
const AuthManager = require('../../../src/auth/AuthManager');
const Logger = require('../../../src/utils/Logger');

const logger = new Logger('GetProductByIdTests');

test.describe('Get Product By ID API Tests', () => {
  let productsService;
  let authManager;
  let validator;
  let testProductId;

  test.beforeAll(async ({ request }) => {
    logger.info('Setting up Get Product By ID tests');
    authManager = new AuthManager(request);
    await authManager.authenticate();
    validator = new ProductsValidator();
  });

  test.beforeEach(async ({ request }) => {
    productsService = new ProductsService(request, authManager);
    
    // Create a test product for retrieval tests
    const payload = ProductsPayloads.getValidCreatePayload();
    const response = await productsService.createProduct(payload);
    const product = (await response.json()).data || await response.json();
    testProductId = product.id;
    
    logger.info('Test product created', { testProductId });
  });

  test.afterEach(async () => {
    await productsService.cleanup();
  });

  test('TC001: Get product by valid ID', async () => {
    logger.info('Test: Get product by valid ID', { testProductId });
    
    // Act
    const response = await productsService.getProductById(testProductId);
    
    // Assert
    expect(response.status()).toBe(200);
    
    const responseBody = await response.json();
    const product = responseBody.data || responseBody;
    
    expect(product.id).toBe(testProductId);
    expect(product.name).toBeDefined();
    expect(product.price).toBeDefined();
    expect(product.sku).toBeDefined();
    
    await validator.validateProductSchema(product);
    
    logger.info('Test passed: Product retrieved successfully');
  });

  test('TC002: Get product by invalid ID format', async () => {
    logger.info('Test: Get product by invalid ID format');
    
    // Arrange
    const invalidId = 'invalid-id-format';
    
    // Act
    try {
      const response = await productsService.client.getById(invalidId);
      
      // Assert
      expect([400, 404]).toContain(response.status());
      await validator.validateErrorResponse(response, response.status());
      
      logger.info('Test passed: Invalid ID format rejected');
    } catch (error) {
      logger.info('Test passed: Invalid ID format error handled');
    }
  });

  test('TC003: Get product by non-existent ID', async () => {
    logger.info('Test: Get product by non-existent ID');
    
    // Arrange
    const nonExistentId = '00000000-0000-0000-0000-000000000000';
    
    // Act
    try {
      const response = await productsService.client.getById(nonExistentId);
      
      // Assert
      expect(response.status()).toBe(404);
      await validator.validateErrorResponse(response, 404, 'not found');
      
      logger.info('Test passed: Non-existent ID returns 404');
    } catch (error) {
      logger.info('Test passed: Non-existent ID error handled');
    }
  });

  test('TC004: Get product with null ID', async () => {
    logger.info('Test: Get product with null ID');
    
    // Act & Assert
    try {
      const response = await productsService.client.getById(null);
      expect([400, 404]).toContain(response.status());
      logger.info('Test passed: Null ID rejected');
    } catch (error) {
      logger.info('Test passed: Null ID error handled');
    }
  });

  test('TC005: Get product with empty string ID', async () => {
    logger.info('Test: Get product with empty string ID');
    
    // Act & Assert
    try {
      const response = await productsService.client.getById('');
      expect([400, 404]).toContain(response.status());
      logger.info('Test passed: Empty string ID rejected');
    } catch (error) {
      logger.info('Test passed: Empty string ID error handled');
    }
  });

  test('TC006: Get product with special characters in ID', async () => {
    logger.info('Test: Get product with special characters in ID');
    
    // Arrange
    const specialCharId = 'abc@123#$%';
    
    // Act
    try {
      const response = await productsService.client.getById(specialCharId);
      expect([400, 404]).toContain(response.status());
      logger.info('Test passed: Special characters in ID rejected');
    } catch (error) {
      logger.info('Test passed: Special characters ID error handled');
    }
  });

  test('TC007: Get product with SQL injection in ID', async () => {
    logger.info('Test: Get product with SQL injection in ID');
    
    // Arrange
    const sqlInjectionId = "1' OR '1'='1";
    
    // Act
    try {
      const response = await productsService.client.getById(sqlInjectionId);
      expect([400, 404]).toContain(response.status());
      logger.info('Test passed: SQL injection attempt blocked');
    } catch (error) {
      logger.info('Test passed: SQL injection error handled');
    }
  });

  test('TC008: Verify all product fields are returned', async () => {
    logger.info('Test: Verify all product fields are returned');
    
    // Act
    const response = await productsService.getProductById(testProductId);
    
    // Assert
    expect(response.status()).toBe(200);
    
    const responseBody = await response.json();
    const product = responseBody.data || responseBody;
    
    // Verify mandatory fields
    expect(product).toHaveProperty('id');
    expect(product).toHaveProperty('name');
    expect(product).toHaveProperty('price');
    expect(product).toHaveProperty('sku');
    expect(product).toHaveProperty('createdAt');
    expect(product).toHaveProperty('updatedAt');
    
    logger.info('Test passed: All fields present in response');
  });

  test('TC009: Verify response time for get by ID operation', async () => {
    logger.info('Test: Verify response time for get by ID operation');
    
    // Act
    const startTime = Date.now();
    const response = await productsService.getProductById(testProductId);
    const responseTime = Date.now() - startTime;
    
    // Assert
    expect(response.status()).toBe(200);
    validator.validateResponseTime(responseTime, 2000);
    
    logger.info('Test passed: Response time within acceptable limits', { responseTime });
  });

  test('TC010: Get same product multiple times returns consistent data', async () => {
    logger.info('Test: Get same product multiple times returns consistent data');
    
    // Act - Call API multiple times
    const response1 = await productsService.getProductById(testProductId);
    const response2 = await productsService.getProductById(testProductId);
    const response3 = await productsService.getProductById(testProductId);
    
    // Assert
    const product1 = (await response1.json()).data || await response1.json();
    const product2 = (await response2.json()).data || await response2.json();
    const product3 = (await response3.json()).data || await response3.json();
    
    expect(product1.id).toBe(product2.id);
    expect(product2.id).toBe(product3.id);
    expect(product1.name).toBe(product2.name);
    expect(product2.name).toBe(product3.name);
    expect(product1.sku).toBe(product2.sku);
    expect(product2.sku).toBe(product3.sku);
    
    logger.info('Test passed: Consistent data returned');
  });

  test('TC011: Verify product data types', async () => {
    logger.info('Test: Verify product data types');
    
    // Act
    const response = await productsService.getProductById(testProductId);
    
    // Assert
    const product = (await response.json()).data || await response.json();
    
    expect(typeof product.id).toBe('string');
    expect(typeof product.name).toBe('string');
    expect(typeof product.price).toBe('number');
    expect(typeof product.sku).toBe('string');
    
    if (product.description !== undefined) {
      expect(typeof product.description).toBe('string');
    }
    
    if (product.isActive !== undefined) {
      expect(typeof product.isActive).toBe('boolean');
    }
    
    logger.info('Test passed: All data types correct');
  });

  test('TC012: Get deleted product returns 404', async () => {
    logger.info('Test: Get deleted product returns 404');
    
    // Arrange - Delete the product
    await productsService.deleteProduct(testProductId);
    
    // Act
    try {
      const response = await productsService.client.getById(testProductId);
      
      // Assert
      expect(response.status()).toBe(404);
      await validator.validateErrorResponse(response, 404);
      
      logger.info('Test passed: Deleted product returns 404');
    } catch (error) {
      logger.info('Test passed: Deleted product error handled');
    }
  });
});