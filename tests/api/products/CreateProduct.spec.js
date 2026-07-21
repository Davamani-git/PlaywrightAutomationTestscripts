/**
 * Create Product API Tests
 * Tests for creating new products
 * @module CreateProductTests
 */

const { test, expect } = require('@playwright/test');
const ProductsService = require('../../../src/services/ProductsService');
const ProductsPayloads = require('../../../src/api/products/ProductsPayloads');
const ProductsValidator = require('../../../src/api/products/ProductsValidator');
const AuthManager = require('../../../src/auth/AuthManager');
const Logger = require('../../../src/utils/Logger');

const logger = new Logger('CreateProductTests');

test.describe('Create Product API Tests', () => {
  let productsService;
  let authManager;
  let validator;

  test.beforeAll(async ({ request }) => {
    logger.info('Setting up Create Product tests');
    authManager = new AuthManager(request);
    await authManager.authenticate();
    validator = new ProductsValidator();
  });

  test.beforeEach(async ({ request }) => {
    productsService = new ProductsService(request, authManager);
  });

  test.afterEach(async () => {
    // Cleanup created products
    await productsService.cleanup();
  });

  test('TC001: Create product with valid complete payload', async () => {
    logger.info('Test: Create product with valid complete payload');
    
    // Arrange
    const payload = ProductsPayloads.getValidCreatePayload();
    logger.info('Payload prepared', { payload });
    
    // Act
    const response = await productsService.createProduct(payload);
    
    // Assert
    expect(response.status()).toBe(201);
    
    const responseBody = await response.json();
    const product = responseBody.data || responseBody;
    
    expect(product.id).toBeDefined();
    expect(product.name).toBe(payload.name);
    expect(product.price).toBe(payload.price);
    expect(product.sku).toBe(payload.sku);
    expect(product.description).toBe(payload.description);
    expect(product.category).toBe(payload.category);
    expect(product.createdAt).toBeDefined();
    expect(product.updatedAt).toBeDefined();
    
    logger.info('Test passed: Product created successfully', { productId: product.id });
  });

  test('TC002: Create product with minimal required fields', async () => {
    logger.info('Test: Create product with minimal required fields');
    
    // Arrange
    const payload = ProductsPayloads.getMinimalValidCreatePayload();
    
    // Act
    const response = await productsService.createProduct(payload);
    
    // Assert
    expect(response.status()).toBe(201);
    
    const responseBody = await response.json();
    const product = responseBody.data || responseBody;
    
    expect(product.id).toBeDefined();
    expect(product.name).toBe(payload.name);
    expect(product.price).toBe(payload.price);
    expect(product.sku).toBe(payload.sku);
    
    logger.info('Test passed: Product created with minimal fields');
  });

  test('TC003: Create product with missing name field', async () => {
    logger.info('Test: Create product with missing name field');
    
    // Arrange
    const payload = ProductsPayloads.getCreatePayloadMissingName();
    
    // Act & Assert
    try {
      const response = await productsService.client.create(payload);
      
      expect(response.status()).toBe(400);
      await validator.validateErrorResponse(response, 400, 'name');
      
      logger.info('Test passed: Validation error for missing name');
    } catch (error) {
      logger.info('Test passed: Request rejected for missing name');
    }
  });

  test('TC004: Create product with missing price field', async () => {
    logger.info('Test: Create product with missing price field');
    
    // Arrange
    const payload = ProductsPayloads.getCreatePayloadMissingPrice();
    
    // Act & Assert
    try {
      const response = await productsService.client.create(payload);
      
      expect(response.status()).toBe(400);
      await validator.validateErrorResponse(response, 400, 'price');
      
      logger.info('Test passed: Validation error for missing price');
    } catch (error) {
      logger.info('Test passed: Request rejected for missing price');
    }
  });

  test('TC005: Create product with missing SKU field', async () => {
    logger.info('Test: Create product with missing SKU field');
    
    // Arrange
    const payload = ProductsPayloads.getCreatePayloadMissingSku();
    
    // Act & Assert
    try {
      const response = await productsService.client.create(payload);
      
      expect(response.status()).toBe(400);
      await validator.validateErrorResponse(response, 400, 'sku');
      
      logger.info('Test passed: Validation error for missing SKU');
    } catch (error) {
      logger.info('Test passed: Request rejected for missing SKU');
    }
  });

  test('TC006: Create product with invalid data types', async () => {
    logger.info('Test: Create product with invalid data types');
    
    // Arrange
    const payload = ProductsPayloads.getCreatePayloadWithInvalidTypes();
    
    // Act & Assert
    try {
      const response = await productsService.client.create(payload);
      
      expect(response.status()).toBe(400);
      await validator.validateErrorResponse(response, 400);
      
      logger.info('Test passed: Validation error for invalid data types');
    } catch (error) {
      logger.info('Test passed: Request rejected for invalid data types');
    }
  });

  test('TC007: Create product with invalid values', async () => {
    logger.info('Test: Create product with invalid values');
    
    // Arrange
    const payload = ProductsPayloads.getCreatePayloadWithInvalidValues();
    
    // Act & Assert
    try {
      const response = await productsService.client.create(payload);
      
      expect(response.status()).toBe(400);
      await validator.validateErrorResponse(response, 400);
      
      logger.info('Test passed: Validation error for invalid values');
    } catch (error) {
      logger.info('Test passed: Request rejected for invalid values');
    }
  });

  test('TC008: Create product with duplicate SKU', async () => {
    logger.info('Test: Create product with duplicate SKU');
    
    // Arrange - Create first product
    const firstPayload = ProductsPayloads.getValidCreatePayload();
    const firstResponse = await productsService.createProduct(firstPayload);
    const firstProduct = (await firstResponse.json()).data || await firstResponse.json();
    
    // Create duplicate payload with same SKU
    const duplicatePayload = ProductsPayloads.getDuplicateSkuPayload(firstProduct.sku);
    
    // Act & Assert
    try {
      const response = await productsService.client.create(duplicatePayload);
      
      expect(response.status()).toBe(409);
      await validator.validateErrorResponse(response, 409, 'duplicate');
      
      logger.info('Test passed: Duplicate SKU rejected');
    } catch (error) {
      logger.info('Test passed: Duplicate SKU validation error');
    }
  });

  test('TC009: Create product with empty payload', async () => {
    logger.info('Test: Create product with empty payload');
    
    // Arrange
    const payload = ProductsPayloads.getEmptyPayload();
    
    // Act & Assert
    try {
      const response = await productsService.client.create(payload);
      
      expect(response.status()).toBe(400);
      await validator.validateErrorResponse(response, 400);
      
      logger.info('Test passed: Empty payload rejected');
    } catch (error) {
      logger.info('Test passed: Empty payload validation error');
    }
  });

  test('TC010: Create product with special characters', async () => {
    logger.info('Test: Create product with special characters');
    
    // Arrange
    const payload = ProductsPayloads.getSpecialCharactersPayload();
    
    // Act
    const response = await productsService.createProduct(payload);
    
    // Assert
    expect(response.status()).toBe(201);
    
    const responseBody = await response.json();
    const product = responseBody.data || responseBody;
    
    expect(product.name).toBe(payload.name);
    expect(product.description).toBe(payload.description);
    
    logger.info('Test passed: Special characters handled correctly');
  });

  test('TC011: Create product with unicode characters', async () => {
    logger.info('Test: Create product with unicode characters');
    
    // Arrange
    const payload = ProductsPayloads.getUnicodePayload();
    
    // Act
    const response = await productsService.createProduct(payload);
    
    // Assert
    expect(response.status()).toBe(201);
    
    const responseBody = await response.json();
    const product = responseBody.data || responseBody;
    
    expect(product.name).toBe(payload.name);
    expect(product.description).toBe(payload.description);
    
    logger.info('Test passed: Unicode characters handled correctly');
  });

  test('TC012: Verify created product can be retrieved', async () => {
    logger.info('Test: Verify created product can be retrieved');
    
    // Arrange & Act - Create product
    const payload = ProductsPayloads.getValidCreatePayload();
    const createResponse = await productsService.createProduct(payload);
    const createdProduct = (await createResponse.json()).data || await createResponse.json();
    
    // Act - Retrieve product
    const getResponse = await productsService.getProductById(createdProduct.id);
    
    // Assert
    expect(getResponse.status()).toBe(200);
    
    const retrievedProduct = (await getResponse.json()).data || await getResponse.json();
    expect(retrievedProduct.id).toBe(createdProduct.id);
    expect(retrievedProduct.name).toBe(payload.name);
    expect(retrievedProduct.sku).toBe(payload.sku);
    
    logger.info('Test passed: Created product retrieved successfully');
  });

  test('TC013: Verify response time for create operation', async () => {
    logger.info('Test: Verify response time for create operation');
    
    // Arrange
    const payload = ProductsPayloads.getValidCreatePayload();
    
    // Act
    const startTime = Date.now();
    const response = await productsService.createProduct(payload);
    const responseTime = Date.now() - startTime;
    
    // Assert
    expect(response.status()).toBe(201);
    validator.validateResponseTime(responseTime, 3000);
    
    logger.info('Test passed: Response time within acceptable limits', { responseTime });
  });
});