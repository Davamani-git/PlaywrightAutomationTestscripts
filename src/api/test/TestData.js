/**
 * TestData.js
 * 
 * Test data repository for Test module
 * Contains reusable test data for various test scenarios
 * Supports data-driven testing and test data management
 * 
 * @module TestData
 * @author API Automation Team
 * @version 1.0.0
 */

const { faker } = require('@faker-js/faker');
const Logger = require('../../utils/Logger');

class TestData {
  constructor() {
    this.logger = new Logger('TestData');
    this.logger.info('TestData initialized');
  }

  /**
   * Generate a unique identifier
   * @returns {string} Unique ID
   */
  generateUniqueId() {
    return `TEST_${Date.now()}_${faker.string.alphanumeric(6).toUpperCase()}`;
  }

  /**
   * Generate a valid test name
   * @returns {string} Test name
   */
  generateTestName() {
    return `Test_${faker.commerce.productName()}_${Date.now()}`;
  }

  /**
   * Generate a valid test description
   * @returns {string} Test description
   */
  generateTestDescription() {
    return faker.lorem.sentence(10);
  }

  /**
   * Get valid test data for creation
   * @returns {Object} Valid test payload
   */
  getValidTestData() {
    const data = {
      name: this.generateTestName(),
      description: this.generateTestDescription(),
      type: faker.helpers.arrayElement(['unit', 'integration', 'e2e', 'performance']),
      status: 'active',
      priority: faker.helpers.arrayElement(['low', 'medium', 'high', 'critical']),
      tags: [faker.word.noun(), faker.word.noun(), faker.word.noun()],
      metadata: {
        createdBy: faker.internet.email(),
        department: faker.commerce.department(),
        version: '1.0.0'
      },
      configuration: {
        timeout: faker.number.int({ min: 1000, max: 30000 }),
        retries: faker.number.int({ min: 0, max: 3 }),
        parallel: faker.datatype.boolean()
      },
      isActive: true,
      createdAt: new Date().toISOString()
    };
    
    this.logger.debug(`Generated valid test data: ${JSON.stringify(data)}`);
    return data;
  }

  /**
   * Get minimal valid test data (only required fields)
   * @returns {Object} Minimal test payload
   */
  getMinimalValidTestData() {
    const data = {
      name: this.generateTestName(),
      type: 'unit',
      status: 'active'
    };
    
    this.logger.debug(`Generated minimal valid test data: ${JSON.stringify(data)}`);
    return data;
  }

  /**
   * Get test data with missing required fields
   * @param {string} fieldToRemove - Field name to remove
   * @returns {Object} Invalid test payload
   */
  getTestDataWithMissingField(fieldToRemove) {
    const data = this.getValidTestData();
    delete data[fieldToRemove];
    
    this.logger.debug(`Generated test data with missing field '${fieldToRemove}': ${JSON.stringify(data)}`);
    return data;
  }

  /**
   * Get test data with invalid field values
   * @param {string} field - Field name
   * @param {*} invalidValue - Invalid value
   * @returns {Object} Invalid test payload
   */
  getTestDataWithInvalidField(field, invalidValue) {
    const data = this.getValidTestData();
    data[field] = invalidValue;
    
    this.logger.debug(`Generated test data with invalid field '${field}': ${JSON.stringify(data)}`);
    return data;
  }

  /**
   * Get test data for update operations
   * @returns {Object} Update payload
   */
  getUpdateTestData() {
    const data = {
      description: `Updated: ${this.generateTestDescription()}`,
      status: faker.helpers.arrayElement(['active', 'inactive', 'archived']),
      priority: faker.helpers.arrayElement(['low', 'medium', 'high', 'critical']),
      tags: [faker.word.noun(), faker.word.noun()],
      configuration: {
        timeout: faker.number.int({ min: 1000, max: 30000 }),
        retries: faker.number.int({ min: 0, max: 5 })
      },
      updatedAt: new Date().toISOString()
    };
    
    this.logger.debug(`Generated update test data: ${JSON.stringify(data)}`);
    return data;
  }

  /**
   * Get partial update test data
   * @returns {Object} Partial update payload
   */
  getPartialUpdateTestData() {
    const data = {
      status: faker.helpers.arrayElement(['active', 'inactive']),
      priority: faker.helpers.arrayElement(['low', 'medium', 'high'])
    };
    
    this.logger.debug(`Generated partial update test data: ${JSON.stringify(data)}`);
    return data;
  }

  /**
   * Get test data with special characters
   * @returns {Object} Test payload with special characters
   */
  getTestDataWithSpecialCharacters() {
    const data = this.getValidTestData();
    data.name = `Test_<script>alert('XSS')</script>_${Date.now()}`;
    data.description = "Test with special chars: !@#$%^&*()_+-=[]{}|;':,.<>?/~`";
    
    this.logger.debug(`Generated test data with special characters: ${JSON.stringify(data)}`);
    return data;
  }

  /**
   * Get test data with maximum field lengths
   * @returns {Object} Test payload with max lengths
   */
  getTestDataWithMaxLengths() {
    const data = this.getValidTestData();
    data.name = 'A'.repeat(255);
    data.description = 'B'.repeat(1000);
    
    this.logger.debug('Generated test data with maximum field lengths');
    return data;
  }

  /**
   * Get test data exceeding maximum field lengths
   * @returns {Object} Invalid test payload
   */
  getTestDataExceedingMaxLengths() {
    const data = this.getValidTestData();
    data.name = 'A'.repeat(256);
    data.description = 'B'.repeat(1001);
    
    this.logger.debug('Generated test data exceeding maximum field lengths');
    return data;
  }

  /**
   * Get test data with null values
   * @returns {Object} Test payload with null values
   */
  getTestDataWithNullValues() {
    const data = {
      name: null,
      description: null,
      type: null,
      status: null
    };
    
    this.logger.debug(`Generated test data with null values: ${JSON.stringify(data)}`);
    return data;
  }

  /**
   * Get test data with empty strings
   * @returns {Object} Test payload with empty strings
   */
  getTestDataWithEmptyStrings() {
    const data = {
      name: '',
      description: '',
      type: '',
      status: ''
    };
    
    this.logger.debug(`Generated test data with empty strings: ${JSON.stringify(data)}`);
    return data;
  }

  /**
   * Get bulk test data
   * @param {number} count - Number of test records
   * @returns {Array<Object>} Array of test payloads
   */
  getBulkTestData(count = 5) {
    const bulkData = [];
    
    for (let i = 0; i < count; i++) {
      bulkData.push(this.getValidTestData());
    }
    
    this.logger.debug(`Generated ${count} bulk test records`);
    return bulkData;
  }

  /**
   * Get search criteria for test queries
   * @returns {Object} Search criteria
   */
  getSearchCriteria() {
    const criteria = {
      type: faker.helpers.arrayElement(['unit', 'integration', 'e2e']),
      status: 'active',
      priority: faker.helpers.arrayElement(['high', 'critical']),
      tags: [faker.word.noun()]
    };
    
    this.logger.debug(`Generated search criteria: ${JSON.stringify(criteria)}`);
    return criteria;
  }

  /**
   * Get pagination parameters
   * @returns {Object} Pagination params
   */
  getPaginationParams() {
    const params = {
      page: faker.number.int({ min: 1, max: 10 }),
      limit: faker.helpers.arrayElement([10, 20, 50, 100]),
      sortBy: faker.helpers.arrayElement(['name', 'createdAt', 'priority']),
      sortOrder: faker.helpers.arrayElement(['asc', 'desc'])
    };
    
    this.logger.debug(`Generated pagination params: ${JSON.stringify(params)}`);
    return params;
  }

  /**
   * Get invalid ID formats for negative testing
   * @returns {Array} Array of invalid IDs
   */
  getInvalidIds() {
    return [
      null,
      undefined,
      '',
      ' ',
      '0',
      '-1',
      'invalid-id',
      '999999999',
      '<script>alert(1)</script>',
      '../../../etc/passwd',
      'SELECT * FROM tests',
      faker.string.alphanumeric(1000)
    ];
  }

  /**
   * Get test data for duplicate testing
   * @param {Object} existingData - Existing test data
   * @returns {Object} Duplicate test payload
   */
  getDuplicateTestData(existingData) {
    const data = { ...existingData };
    delete data.id;
    delete data.createdAt;
    delete data.updatedAt;
    
    this.logger.debug(`Generated duplicate test data: ${JSON.stringify(data)}`);
    return data;
  }
}

module.exports = new TestData();