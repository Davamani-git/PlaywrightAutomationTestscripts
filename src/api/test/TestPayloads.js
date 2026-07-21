/**
 * TestPayloads.js
 * 
 * Payload builder for Test module
 * Provides methods to construct request payloads for various test scenarios
 * Ensures payload consistency and reusability across test suites
 * 
 * @module TestPayloads
 * @author API Automation Team
 * @version 1.0.0
 */

const TestData = require('./TestData');
const Logger = require('../../utils/Logger');

class TestPayloads {
  constructor() {
    this.logger = new Logger('TestPayloads');
    this.logger.info('TestPayloads initialized');
  }

  /**
   * Build a valid create test payload
   * @param {Object} overrides - Optional field overrides
   * @returns {Object} Create test payload
   */
  buildCreatePayload(overrides = {}) {
    const basePayload = TestData.getValidTestData();
    const payload = { ...basePayload, ...overrides };
    
    this.logger.debug(`Built create payload: ${JSON.stringify(payload)}`);
    return payload;
  }

  /**
   * Build a minimal valid create test payload
   * @param {Object} overrides - Optional field overrides
   * @returns {Object} Minimal create test payload
   */
  buildMinimalCreatePayload(overrides = {}) {
    const basePayload = TestData.getMinimalValidTestData();
    const payload = { ...basePayload, ...overrides };
    
    this.logger.debug(`Built minimal create payload: ${JSON.stringify(payload)}`);
    return payload;
  }

  /**
   * Build a create payload with missing required field
   * @param {string} fieldName - Name of the field to remove
   * @returns {Object} Invalid create payload
   */
  buildCreatePayloadWithMissingField(fieldName) {
    const payload = TestData.getTestDataWithMissingField(fieldName);
    
    this.logger.debug(`Built create payload with missing field '${fieldName}': ${JSON.stringify(payload)}`);
    return payload;
  }

  /**
   * Build a create payload with missing name field
   * @returns {Object} Invalid create payload
   */
  buildCreatePayloadWithoutName() {
    return this.buildCreatePayloadWithMissingField('name');
  }

  /**
   * Build a create payload with missing type field
   * @returns {Object} Invalid create payload
   */
  buildCreatePayloadWithoutType() {
    return this.buildCreatePayloadWithMissingField('type');
  }

  /**
   * Build a create payload with missing status field
   * @returns {Object} Invalid create payload
   */
  buildCreatePayloadWithoutStatus() {
    return this.buildCreatePayloadWithMissingField('status');
  }

  /**
   * Build a create payload with invalid field value
   * @param {string} fieldName - Name of the field
   * @param {*} invalidValue - Invalid value
   * @returns {Object} Invalid create payload
   */
  buildCreatePayloadWithInvalidField(fieldName, invalidValue) {
    const payload = TestData.getTestDataWithInvalidField(fieldName, invalidValue);
    
    this.logger.debug(`Built create payload with invalid field '${fieldName}': ${JSON.stringify(payload)}`);
    return payload;
  }

  /**
   * Build a create payload with invalid type
   * @returns {Object} Invalid create payload
   */
  buildCreatePayloadWithInvalidType() {
    return this.buildCreatePayloadWithInvalidField('type', 'invalid_type_value');
  }

  /**
   * Build a create payload with invalid status
   * @returns {Object} Invalid create payload
   */
  buildCreatePayloadWithInvalidStatus() {
    return this.buildCreatePayloadWithInvalidField('status', 'invalid_status_value');
  }

  /**
   * Build a create payload with null values
   * @returns {Object} Invalid create payload
   */
  buildCreatePayloadWithNullValues() {
    const payload = TestData.getTestDataWithNullValues();
    
    this.logger.debug(`Built create payload with null values: ${JSON.stringify(payload)}`);
    return payload;
  }

  /**
   * Build a create payload with empty strings
   * @returns {Object} Invalid create payload
   */
  buildCreatePayloadWithEmptyStrings() {
    const payload = TestData.getTestDataWithEmptyStrings();
    
    this.logger.debug(`Built create payload with empty strings: ${JSON.stringify(payload)}`);
    return payload;
  }

  /**
   * Build a create payload with special characters
   * @returns {Object} Create payload with special characters
   */
  buildCreatePayloadWithSpecialCharacters() {
    const payload = TestData.getTestDataWithSpecialCharacters();
    
    this.logger.debug(`Built create payload with special characters: ${JSON.stringify(payload)}`);
    return payload;
  }

  /**
   * Build a create payload with maximum field lengths
   * @returns {Object} Create payload with max lengths
   */
  buildCreatePayloadWithMaxLengths() {
    const payload = TestData.getTestDataWithMaxLengths();
    
    this.logger.debug('Built create payload with maximum field lengths');
    return payload;
  }

  /**
   * Build a create payload exceeding maximum field lengths
   * @returns {Object} Invalid create payload
   */
  buildCreatePayloadExceedingMaxLengths() {
    const payload = TestData.getTestDataExceedingMaxLengths();
    
    this.logger.debug('Built create payload exceeding maximum field lengths');
    return payload;
  }

  /**
   * Build an update test payload
   * @param {Object} overrides - Optional field overrides
   * @returns {Object} Update test payload
   */
  buildUpdatePayload(overrides = {}) {
    const basePayload = TestData.getUpdateTestData();
    const payload = { ...basePayload, ...overrides };
    
    this.logger.debug(`Built update payload: ${JSON.stringify(payload)}`);
    return payload;
  }

  /**
   * Build a partial update test payload
   * @param {Object} overrides - Optional field overrides
   * @returns {Object} Partial update test payload
   */
  buildPartialUpdatePayload(overrides = {}) {
    const basePayload = TestData.getPartialUpdateTestData();
    const payload = { ...basePayload, ...overrides };
    
    this.logger.debug(`Built partial update payload: ${JSON.stringify(payload)}`);
    return payload;
  }

  /**
   * Build an update payload with invalid field
   * @param {string} fieldName - Name of the field
   * @param {*} invalidValue - Invalid value
   * @returns {Object} Invalid update payload
   */
  buildUpdatePayloadWithInvalidField(fieldName, invalidValue) {
    const payload = this.buildUpdatePayload();
    payload[fieldName] = invalidValue;
    
    this.logger.debug(`Built update payload with invalid field '${fieldName}': ${JSON.stringify(payload)}`);
    return payload;
  }

  /**
   * Build a duplicate test payload
   * @param {Object} existingData - Existing test data
   * @returns {Object} Duplicate test payload
   */
  buildDuplicatePayload(existingData) {
    const payload = TestData.getDuplicateTestData(existingData);
    
    this.logger.debug(`Built duplicate payload: ${JSON.stringify(payload)}`);
    return payload;
  }

  /**
   * Build bulk create payloads
   * @param {number} count - Number of payloads to generate
   * @returns {Array<Object>} Array of create payloads
   */
  buildBulkCreatePayloads(count = 5) {
    const payloads = TestData.getBulkTestData(count);
    
    this.logger.debug(`Built ${count} bulk create payloads`);
    return payloads;
  }

  /**
   * Build search payload
   * @param {Object} criteria - Search criteria
   * @returns {Object} Search payload
   */
  buildSearchPayload(criteria = {}) {
    const baseCriteria = TestData.getSearchCriteria();
    const payload = { ...baseCriteria, ...criteria };
    
    this.logger.debug(`Built search payload: ${JSON.stringify(payload)}`);
    return payload;
  }

  /**
   * Build empty payload
   * @returns {Object} Empty payload
   */
  buildEmptyPayload() {
    const payload = {};
    
    this.logger.debug('Built empty payload');
    return payload;
  }

  /**
   * Build malformed JSON payload
   * @returns {string} Malformed JSON string
   */
  buildMalformedPayload() {
    const payload = '{"name": "test", "type": "unit", invalid_json}';
    
    this.logger.debug(`Built malformed payload: ${payload}`);
    return payload;
  }

  /**
   * Build payload with SQL injection attempt
   * @returns {Object} Payload with SQL injection
   */
  buildSQLInjectionPayload() {
    const payload = this.buildCreatePayload({
      name: "Test'; DROP TABLE tests; --",
      description: "1' OR '1'='1"
    });
    
    this.logger.debug(`Built SQL injection payload: ${JSON.stringify(payload)}`);
    return payload;
  }

  /**
   * Build payload with XSS attempt
   * @returns {Object} Payload with XSS
   */
  buildXSSPayload() {
    const payload = this.buildCreatePayload({
      name: "<script>alert('XSS')</script>",
      description: "<img src=x onerror=alert('XSS')>"
    });
    
    this.logger.debug(`Built XSS payload: ${JSON.stringify(payload)}`);
    return payload;
  }

  /**
   * Build payload with command injection attempt
   * @returns {Object} Payload with command injection
   */
  buildCommandInjectionPayload() {
    const payload = this.buildCreatePayload({
      name: "test; rm -rf /",
      description: "test && cat /etc/passwd"
    });
    
    this.logger.debug(`Built command injection payload: ${JSON.stringify(payload)}`);
    return payload;
  }
}

module.exports = new TestPayloads();