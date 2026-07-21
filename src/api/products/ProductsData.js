/**
 * Products Test Data
 * Contains test data for various product scenarios
 * @module ProductsData
 */

const { faker } = require('@faker-js/faker');

class ProductsData {
  /**
   * Generate valid product data
   * @returns {Object} Valid product payload
   */
  static getValidProductData() {
    return {
      name: `Test Product ${faker.commerce.productName()} ${Date.now()}`,
      description: faker.commerce.productDescription(),
      price: parseFloat(faker.commerce.price()),
      category: faker.commerce.department(),
      sku: `SKU-${faker.string.alphanumeric(8).toUpperCase()}`,
      quantity: faker.number.int({ min: 1, max: 1000 }),
      manufacturer: faker.company.name(),
      isActive: true,
      tags: [faker.commerce.productAdjective(), faker.commerce.productMaterial()],
      specifications: {
        weight: `${faker.number.float({ min: 0.1, max: 100, precision: 0.01 })} kg`,
        dimensions: {
          length: faker.number.int({ min: 1, max: 100 }),
          width: faker.number.int({ min: 1, max: 100 }),
          height: faker.number.int({ min: 1, max: 100 })
        },
        color: faker.color.human()
      }
    };
  }

  /**
   * Generate minimal valid product data (only required fields)
   * @returns {Object} Minimal valid product payload
   */
  static getMinimalValidProductData() {
    return {
      name: `Minimal Product ${Date.now()}`,
      price: 99.99,
      sku: `SKU-${faker.string.alphanumeric(8).toUpperCase()}`
    };
  }

  /**
   * Generate product data with missing required fields
   * @param {string} missingField - Field to omit
   * @returns {Object} Invalid product payload
   */
  static getProductDataWithMissingField(missingField) {
    const data = this.getValidProductData();
    delete data[missingField];
    return data;
  }

  /**
   * Generate product data with invalid data types
   * @returns {Object} Invalid product payload
   */
  static getProductDataWithInvalidTypes() {
    return {
      name: 12345, // Should be string
      description: true, // Should be string
      price: "invalid", // Should be number
      category: [], // Should be string
      sku: null, // Should be string
      quantity: "ten", // Should be number
      isActive: "yes" // Should be boolean
    };
  }

  /**
   * Generate product data with invalid values
   * @returns {Object} Invalid product payload
   */
  static getProductDataWithInvalidValues() {
    return {
      name: "", // Empty string
      description: faker.lorem.paragraphs(50), // Too long
      price: -100, // Negative price
      category: faker.string.alpha(256), // Too long
      sku: "AB", // Too short
      quantity: -5, // Negative quantity
      isActive: true
    };
  }

  /**
   * Generate product data for duplicate testing
   * @param {string} existingSku - Existing SKU to duplicate
   * @returns {Object} Product payload with duplicate SKU
   */
  static getDuplicateProductData(existingSku) {
    return {
      name: `Duplicate Product ${Date.now()}`,
      description: faker.commerce.productDescription(),
      price: parseFloat(faker.commerce.price()),
      category: faker.commerce.department(),
      sku: existingSku, // Duplicate SKU
      quantity: faker.number.int({ min: 1, max: 1000 }),
      isActive: true
    };
  }

  /**
   * Generate product update data
   * @returns {Object} Product update payload
   */
  static getProductUpdateData() {
    return {
      name: `Updated Product ${Date.now()}`,
      description: `Updated: ${faker.commerce.productDescription()}`,
      price: parseFloat(faker.commerce.price()),
      quantity: faker.number.int({ min: 1, max: 500 }),
      isActive: false
    };
  }

  /**
   * Generate partial product update data
   * @returns {Object} Partial product update payload
   */
  static getPartialProductUpdateData() {
    return {
      price: parseFloat(faker.commerce.price()),
      quantity: faker.number.int({ min: 1, max: 100 })
    };
  }

  /**
   * Generate bulk product data
   * @param {number} count - Number of products to generate
   * @returns {Array<Object>} Array of product payloads
   */
  static getBulkProductData(count = 5) {
    const products = [];
    for (let i = 0; i < count; i++) {
      products.push(this.getValidProductData());
    }
    return products;
  }

  /**
   * Get search criteria for testing
   * @returns {Object} Search parameters
   */
  static getSearchCriteria() {
    return {
      category: faker.commerce.department(),
      minPrice: 10,
      maxPrice: 1000,
      isActive: true
    };
  }

  /**
   * Get invalid product IDs for negative testing
   * @returns {Array<string>} Array of invalid IDs
   */
  static getInvalidProductIds() {
    return [
      'invalid-id',
      '00000000-0000-0000-0000-000000000000',
      '999999999',
      'null',
      '',
      ' ',
      'abc@123',
      '../../../etc/passwd'
    ];
  }
}

module.exports = ProductsData;