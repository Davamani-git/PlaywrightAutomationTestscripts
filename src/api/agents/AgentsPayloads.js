/**
 * Agents API Payloads
 * Contains payload builders for Agents API requests
 * @module AgentsPayloads
 */

const AgentsData = require('./AgentsData');
const { faker } = require('@faker-js/faker');

class AgentsPayloads {
  /**
   * Build valid agent creation payload
   * @param {Object} overrides - Optional field overrides
   * @returns {Object} Valid agent payload
   */
  static buildValidCreatePayload(overrides = {}) {
    return {
      name: AgentsData.generateAgentName(),
      description: AgentsData.generateDescription(),
      type: AgentsData.generateAgentType(),
      status: 'active',
      capabilities: AgentsData.generateCapabilities(),
      configuration: AgentsData.generateConfiguration(),
      metadata: AgentsData.generateMetadata(),
      isActive: true,
      ...overrides
    };
  }

  /**
   * Build minimal valid payload with only required fields
   * @returns {Object} Minimal valid payload
   */
  static buildMinimalValidPayload() {
    return {
      name: AgentsData.generateAgentName(),
      type: AgentsData.generateAgentType(),
      status: 'active'
    };
  }

  /**
   * Build payload with missing required field: name
   * @returns {Object} Invalid payload
   */
  static buildPayloadMissingName() {
    return {
      description: AgentsData.generateDescription(),
      type: AgentsData.generateAgentType(),
      status: 'active',
      capabilities: AgentsData.generateCapabilities()
    };
  }

  /**
   * Build payload with missing required field: type
   * @returns {Object} Invalid payload
   */
  static buildPayloadMissingType() {
    return {
      name: AgentsData.generateAgentName(),
      description: AgentsData.generateDescription(),
      status: 'active',
      capabilities: AgentsData.generateCapabilities()
    };
  }

  /**
   * Build payload with missing required field: status
   * @returns {Object} Invalid payload
   */
  static buildPayloadMissingStatus() {
    return {
      name: AgentsData.generateAgentName(),
      description: AgentsData.generateDescription(),
      type: AgentsData.generateAgentType(),
      capabilities: AgentsData.generateCapabilities()
    };
  }

  /**
   * Build payload with invalid data types
   * @returns {Object} Invalid payload
   */
  static buildPayloadWithInvalidDataTypes() {
    return {
      name: 12345, // Should be string
      description: true, // Should be string
      type: ['invalid'], // Should be string
      status: 999, // Should be string
      capabilities: 'not-an-array', // Should be array
      configuration: 'not-an-object', // Should be object
      isActive: 'yes' // Should be boolean
    };
  }

  /**
   * Build payload with empty required fields
   * @returns {Object} Invalid payload
   */
  static buildPayloadWithEmptyFields() {
    return {
      name: '',
      description: '',
      type: '',
      status: '',
      capabilities: [],
      configuration: {},
      metadata: {}
    };
  }

  /**
   * Build payload with null values
   * @returns {Object} Invalid payload
   */
  static buildPayloadWithNullValues() {
    return {
      name: null,
      description: null,
      type: null,
      status: null,
      capabilities: null,
      configuration: null,
      metadata: null
    };
  }

  /**
   * Build payload with invalid enum values
   * @returns {Object} Invalid payload
   */
  static buildPayloadWithInvalidEnumValues() {
    return {
      name: AgentsData.generateAgentName(),
      description: AgentsData.generateDescription(),
      type: 'invalid-type',
      status: 'invalid-status',
      capabilities: ['invalid-capability-1', 'invalid-capability-2']
    };
  }

  /**
   * Build payload exceeding field length limits
   * @returns {Object} Invalid payload
   */
  static buildPayloadExceedingLengthLimits() {
    return {
      name: 'A'.repeat(256), // Exceeds typical name length limit
      description: 'B'.repeat(2001), // Exceeds typical description length limit
      type: AgentsData.generateAgentType(),
      status: 'active',
      capabilities: Array(100).fill('capability') // Too many capabilities
    };
  }

  /**
   * Build payload with special characters
   * @returns {Object} Payload with special characters
   */
  static buildPayloadWithSpecialCharacters() {
    return {
      name: `Agent_<script>alert('xss')</script>_${Date.now()}`,
      description: "Agent with special chars: !@#$%^&*()_+-=[]{}|;':,.<>?/~`",
      type: AgentsData.generateAgentType(),
      status: 'active',
      capabilities: AgentsData.generateCapabilities()
    };
  }

  /**
   * Build payload with SQL injection attempt
   * @returns {Object} Payload with SQL injection
   */
  static buildPayloadWithSQLInjection() {
    return {
      name: "Agent'; DROP TABLE agents; --",
      description: "1' OR '1'='1",
      type: AgentsData.generateAgentType(),
      status: 'active'
    };
  }

  /**
   * Build duplicate agent payload
   * @param {string} existingName - Name of existing agent
   * @returns {Object} Duplicate payload
   */
  static buildDuplicatePayload(existingName) {
    return {
      name: existingName,
      description: AgentsData.generateDescription(),
      type: AgentsData.generateAgentType(),
      status: 'active',
      capabilities: AgentsData.generateCapabilities()
    };
  }

  /**
   * Build valid update payload
   * @param {Object} overrides - Optional field overrides
   * @returns {Object} Valid update payload
   */
  static buildValidUpdatePayload(overrides = {}) {
    return {
      description: `Updated: ${AgentsData.generateDescription()}`,
      status: 'active',
      capabilities: AgentsData.generateCapabilities(),
      configuration: AgentsData.generateConfiguration(),
      metadata: AgentsData.generateMetadata(),
      isActive: true,
      ...overrides
    };
  }

  /**
   * Build partial update payload
   * @returns {Object} Partial update payload
   */
  static buildPartialUpdatePayload() {
    return {
      description: `Partially Updated: ${AgentsData.generateDescription()}`,
      status: 'inactive'
    };
  }

  /**
   * Build payload with additional unexpected fields
   * @returns {Object} Payload with extra fields
   */
  static buildPayloadWithExtraFields() {
    return {
      name: AgentsData.generateAgentName(),
      description: AgentsData.generateDescription(),
      type: AgentsData.generateAgentType(),
      status: 'active',
      capabilities: AgentsData.generateCapabilities(),
      unexpectedField1: 'should be ignored',
      unexpectedField2: 12345,
      unexpectedField3: { nested: 'object' }
    };
  }

  /**
   * Build search criteria payload
   * @param {Object} criteria - Search criteria
   * @returns {Object} Search payload
   */
  static buildSearchPayload(criteria = {}) {
    return {
      filters: {
        status: 'active',
        type: 'conversational',
        ...criteria
      },
      pagination: {
        limit: 10,
        offset: 0
      },
      sort: {
        field: 'createdAt',
        order: 'desc'
      }
    };
  }

  /**
   * Build payload with Unicode characters
   * @returns {Object} Payload with Unicode
   */
  static buildPayloadWithUnicode() {
    return {
      name: `Agent_测试_${Date.now()}`,
      description: 'Agent with Unicode: 你好世界 مرحبا العالم Привет мир',
      type: AgentsData.generateAgentType(),
      status: 'active',
      capabilities: AgentsData.generateCapabilities()
    };
  }

  /**
   * Build payload with boundary values
   * @returns {Object} Payload with boundary values
   */
  static buildPayloadWithBoundaryValues() {
    return {
      name: 'A', // Minimum length
      description: AgentsData.generateDescription(),
      type: AgentsData.generateAgentType(),
      status: 'active',
      capabilities: ['natural_language_processing'], // Minimum array length
      configuration: {
        temperature: 0, // Minimum value
        maxTokens: 1, // Minimum value
        topP: 0 // Minimum value
      }
    };
  }
}

module.exports = AgentsPayloads;