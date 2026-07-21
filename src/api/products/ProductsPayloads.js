/**
 * Products Payloads
 * Generates request payloads for Products API
 * @module ProductsPayloads
 */

const ProductsData = require('./ProductsData');

class ProductsPayloads {
  /**
   * Get valid create product payload
   * @returns {Object} Valid product creation payload
   */
  static getValidCreatePayload() {
    return ProductsData.getValidProductData();
  }

  /**
   * Get minimal valid create product payload
   * @returns {Object} Minimal valid product creation payload
   */
  static getMinimalValidCreatePayload() {
    return ProductsData.getMinimalValidProductData();
  }

  /**
   * Get create payload with missing name
   * @returns {Object} Invalid payload missing name field
   */
  static getCreatePayloadMissingName() {
    return ProductsData.getProductDataWithMissingField('name');
  }

  /**
   * Get create payload with missing price
   * @returns {Object} Invalid payload missing price field
   */
  static getCreatePayloadMissingPrice() {
    return ProductsData.getProductDataWithMissingField('price');
  }

  /**
   * Get create payload with missing SKU
   * @returns {Object} Invalid payload missing SKU field
   */
  static getCreatePayloadMissingSku() {
    return ProductsData.getProductDataWithMissingField('sku');
  }

  /**
   * Get create payload with invalid data types
   * @returns {Object} Invalid payload with wrong data types
   */
  static getCreatePayloadWithInvalidTypes() {
    return ProductsData.getProductDataWithInvalidTypes();
  }

  /**
   * Get create payload with invalid values
   * @returns {Object} Invalid payload with invalid values
   */
  static getCreatePayloadWithInvalidValues() {
    return ProductsData.getProductDataWithInvalidValues();
  }

  /**
   * Get create payload with duplicate SKU
   * @param {string} existingSku - Existing SKU to duplicate
   * @returns {Object} Payload with duplicate SKU
   */
  static getDuplicateSkuPayload(existingSku) {
    return ProductsData.getDuplicateProductData(existingSku);
  }

  /**
   * Get valid update product payload
   * @returns {Object} Valid product update payload
   */
  static getValidUpdatePayload() {
    return ProductsData.getProductUpdateData();
  }

  /**
   * Get partial update product payload
   * @returns {Object} Partial product update payload
   */
  static getPartialUpdatePayload() {
    return ProductsData.getPartialProductUpdateData();
  }

  /**
   * Get update payload with invalid data
   * @returns {Object} Invalid update payload
   */
  static getInvalidUpdatePayload() {
    return {
      name: "",
      price: -50,
      quantity: "invalid"
    };
  }

  /**
   * Get empty payload
   * @returns {Object} Empty payload
   */
  static getEmptyPayload() {
    return {};
  }

  /**
   * Get null payload
   * @returns {null} Null payload
   */
  static getNullPayload() {
    return null;
  }

  /**
   * Get malformed JSON payload
   * @returns {string} Malformed JSON string
   */
  static getMalformedPayload() {
    return '{"name": "Test", invalid}';
  }

  /**
   * Get payload with SQL injection attempt
   * @returns {Object} Payload with SQL injection
   */
  static getSqlInjectionPayload() {
    return {
      name: "'; DROP TABLE products; --",
      description: "1' OR '1'='1",
      price: 99.99,
      sku: "SKU' OR '1'='1"
    };
  }

  /**
   * Get payload with XSS attempt
   * @returns {Object} Payload with XSS script
   */
  static getXssPayload() {
    return {
      name: "<script>alert('XSS')</script>",
      description: "<img src=x onerror=alert('XSS')>",
      price: 99.99,
      sku: "SKU-XSS-TEST"
    };
  }

  /**
   * Get payload with special characters
   * @returns {Object} Payload with special characters
   */
  static getSpecialCharactersPayload() {
    return {
      name: "Product !@#$%^&*()_+-=[]{}|;':,.<>?/~`",
      description: "Special chars: ñ é ü ö ä ß",
      price: 99.99,
      sku: "SKU-SPECIAL-123"
    };
  }

  /**
   * Get payload with unicode characters
   * @returns {Object} Payload with unicode
   */
  static getUnicodePayload() {
    return {
      name: "产品测试 🚀 テスト محصول",
      description: "Unicode test: 你好世界 こんにちは مرحبا",
      price: 99.99,
      sku: "SKU-UNICODE-123"
    };
  }

  /**
   * Get payload exceeding size limits
   * @returns {Object} Oversized payload
   */
  static getOversizedPayload() {
    return {
      name: "A".repeat(1000),
      description: "B".repeat(10000),
      price: 99.99,
      sku: "SKU-OVERSIZE"
    };
  }
}

module.exports = ProductsPayloads;