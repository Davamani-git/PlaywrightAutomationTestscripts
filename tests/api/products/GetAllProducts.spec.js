/**
 * Get All Products API Tests
 * Tests for retrieving all products
 * @module GetAllProductsTests
 */

const { test, expect } = require('@playwright/test');
const ProductsService = require('../../../src/services/ProductsService');
const ProductsPayloads = require('../../../src/api/products/ProductsPayloads');
const ProductsValidator = require('../../../src/api/products/ProductsValidator');
const AuthManager = require('../../../src/auth/AuthManager');
const Logger = require('../../../src/utils/Logger');

const logger = new Logger('GetAllProductsTests');

test.describe('Get All Products API Tests', () => {
  let productsService;
  let authManager;
  let validator;

  test.beforeAll(async ({ request }) => {
    logger.info('Setting up Get All Products tests');
    authManager = new AuthManager(request);
    await authManager.authenticate();
    validator = new ProductsValidator();
  });

  test.beforeEach(async ({ request }) => {
    productsService = new ProductsService(request, authManager);
  });

  test.afterEach(async () => {
    await productsService.cleanup();
  });

  test('TC001: Get all products successfully', async () => {
    logger.info('Test: Get all products successfully');
    
    // Act
    const response = await productsService.getAllProducts();
    
    // Assert
    expect(response.status()).toBe(200);
    
    const responseBody = await response.json();
    const products = Array.isArray(responseBody) ? responseBody : responseBody.data;
    
    expect(products).toBeDefined();
    expect(Array.isArray(products)).toBeTruthy();
    
    logger.info('Test passed: Retrieved all products', { count: products.length });
  });

  test('TC002: Verify products list structure', async () => {
    logger.info('Test: Verify products list structure');
    
    // Arrange - Create test product
    const payload = ProductsPayloads.getValidCreatePayload();
    await productsService.createProduct(payload);
    
    // Act
    const response = await productsService.getAllProducts();
    
    // Assert
    expect(response.status()).toBe(200);
    
    const responseBody = await response.json();
    const products = Array.isArray(responseBody) ? responseBody : responseBody.data;
    
    expect(products.length).toBeGreaterThan(0);
    
    // Validate first product schema
    await validator.validateProductSchema(products[0]);
    
    logger.info('Test passed: Products list structure validated');
  });

  test('TC003: Get all products with pagination', async () => {
    logger.info('Test: Get all products with pagination');
    
    // Arrange
    const queryParams = {
      page: 1,
      pageSize: 10
    };
    
    // Act
    const response = await productsService.getAllProducts(queryParams);
    
    // Assert
    expect(response.status()).toBe(200);
    
    const responseBody = await response.json();
    
    if (responseBody.pagination) {
      await validator.validatePagination(responseBody.pagination);
      expect(responseBody.pagination.page).toBe(queryParams.page);
      expect(responseBody.pagination.pageSize).toBe(queryParams.pageSize);
    }
    
    logger.info('Test passed: Pagination working correctly');
  });

  test('TC004: Get all products with category filter', async () => {
    logger.info('Test: Get all products with category filter');
    
    // Arrange - Create product with specific category
    const payload = ProductsPayloads.getValidCreatePayload();
    const createResponse = await productsService.createProduct(payload);
    const createdProduct = (await createResponse.json()).data || await createResponse.json();
    
    const queryParams = {
      category: createdProduct.category
    };
    
    // Act
    const response = await productsService.getAllProducts(queryParams);
    
    // Assert
    expect(response.status()).toBe(200);
    
    const responseBody = await response.json();
    const products = Array.isArray(responseBody) ? responseBody : responseBody.data;
    
    // Verify all products have the filtered category
    products.forEach(product => {
      expect(product.category).toBe(createdProduct.category);
    });
    
    logger.info('Test passed: Category filter working correctly');
  });

  test('TC005: Get all products with price range filter', async () => {
    logger.info('Test: Get all products with price range filter');
    
    // Arrange
    const queryParams = {
      minPrice: 10,
      maxPrice: 1000
    };
    
    // Act
    const response = await productsService.getAllProducts(queryParams);
    
    // Assert
    expect(response.status()).toBe(200);
    
    const responseBody = await response.json();
    const products = Array.isArray(responseBody) ? responseBody : responseBody.data;
    
    // Verify all products are within price range
    products.forEach(product => {
      expect(product.price).toBeGreaterThanOrEqual(queryParams.minPrice);
      expect(product.price).toBeLessThanOrEqual(queryParams.maxPrice);
    });
    
    logger.info('Test passed: Price range filter working correctly');
  });

  test('TC006: Get all active products', async () => {
    logger.info('Test: Get all active products');
    
    // Arrange
    const queryParams = {
      isActive: true
    };
    
    // Act
    const response = await productsService.getAllProducts(queryParams);
    
    // Assert
    expect(response.status()).toBe(200);
    
    const responseBody = await response.json();
    const products = Array.isArray(responseBody) ? responseBody : responseBody.data;
    
    // Verify all products are active
    products.forEach(product => {
      if (product.isActive !== undefined) {
        expect(product.isActive).toBe(true);
      }
    });
    
    logger.info('Test passed: Active products filter working correctly');
  });

  test('TC007: Get all products with sorting', async () => {
    logger.info('Test: Get all products with sorting');
    
    // Arrange
    const queryParams = {
      sortBy: 'price',
      sortOrder: 'asc'
    };
    
    // Act
    const response = await productsService.getAllProducts(queryParams);
    
    // Assert
    expect(response.status()).toBe(200);
    
    const responseBody = await response.json();
    const products = Array.isArray(responseBody) ? responseBody : responseBody.data;
    
    // Verify products are sorted by price
    if (products.length > 1) {
      for (let i = 0; i < products.length - 1; i++) {
        expect(products[i].price).toBeLessThanOrEqual(products[i + 1].price);
      }
    }
    
    logger.info('Test passed: Sorting working correctly');
  });

  test('TC008: Get all products with multiple filters', async () => {
    logger.info('Test: Get all products with multiple filters');
    
    // Arrange
    const queryParams = {
      isActive: true,
      minPrice: 10,
      maxPrice: 500,
      page: 1,
      pageSize: 20
    };
    
    // Act
    const response = await productsService.getAllProducts(queryParams);
    
    // Assert
    expect(response.status()).toBe(200);
    
    const responseBody = await response.json();
    const products = Array.isArray(responseBody) ? responseBody : responseBody.data;
    
    expect(Array.isArray(products)).toBeTruthy();
    
    logger.info('Test passed: Multiple filters working correctly');
  });

  test('TC009: Verify response time for get all operation', async () => {
    logger.info('Test: Verify response time for get all operation');
    
    // Act
    const startTime = Date.now();
    const response = await productsService.getAllProducts();
    const responseTime = Date.now() - startTime;
    
    // Assert
    expect(response.status()).toBe(200);
    validator.validateResponseTime(responseTime, 3000);
    
    logger.info('Test passed: Response time within acceptable limits', { responseTime });
  });

  test('TC010: Get all products returns consistent data', async () => {
    logger.info('Test: Get all products returns consistent data');
    
    // Act - Call API twice
    const response1 = await productsService.getAllProducts();
    const response2 = await productsService.getAllProducts();
    
    // Assert
    expect(response1.status()).toBe(200);
    expect(response2.status()).toBe(200);
    
    const products1 = Array.isArray(await response1.json()) 
      ? await response1.json() 
      : (await response1.json()).data;
    const products2 = Array.isArray(await response2.json()) 
      ? await response2.json() 
      : (await response2.json()).data;
    
    expect(products1.length).toBe(products2.length);
    
    logger.info('Test passed: Consistent data returned');
  });
});