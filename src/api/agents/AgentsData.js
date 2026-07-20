/**
 * Agents Test Data
 * Contains test data for Agents API testing
 * @module AgentsData
 */

const { faker } = require('@faker-js/faker');

class AgentsData {
  /**
   * Generate unique agent name
   * @returns {string} Unique agent name
   */
  static generateAgentName() {
    return `Agent_${faker.person.firstName()}_${Date.now()}`;
  }

  /**
   * Generate unique agent description
   * @returns {string} Agent description
   */
  static generateDescription() {
    return faker.lorem.sentence();
  }

  /**
   * Generate agent type
   * @returns {string} Agent type
   */
  static generateAgentType() {
    const types = ['conversational', 'analytical', 'task-oriented', 'hybrid'];
    return faker.helpers.arrayElement(types);
  }

  /**
   * Generate agent status
   * @returns {string} Agent status
   */
  static generateStatus() {
    const statuses = ['active', 'inactive', 'draft', 'archived'];
    return faker.helpers.arrayElement(statuses);
  }

  /**
   * Generate agent capabilities
   * @returns {Array<string>} List of capabilities
   */
  static generateCapabilities() {
    const capabilities = [
      'natural_language_processing',
      'sentiment_analysis',
      'entity_recognition',
      'intent_classification',
      'context_management',
      'multi_language_support'
    ];
    return faker.helpers.arrayElements(capabilities, { min: 2, max: 4 });
  }

  /**
   * Generate agent configuration
   * @returns {Object} Agent configuration
   */
  static generateConfiguration() {
    return {
      model: faker.helpers.arrayElement(['gpt-4', 'gpt-3.5-turbo', 'claude-2', 'palm-2']),
      temperature: faker.number.float({ min: 0, max: 1, precision: 0.1 }),
      maxTokens: faker.number.int({ min: 100, max: 4000 }),
      topP: faker.number.float({ min: 0, max: 1, precision: 0.1 }),
      frequencyPenalty: faker.number.float({ min: 0, max: 2, precision: 0.1 }),
      presencePenalty: faker.number.float({ min: 0, max: 2, precision: 0.1 })
    };
  }

  /**
   * Generate agent metadata
   * @returns {Object} Agent metadata
   */
  static generateMetadata() {
    return {
      version: faker.system.semver(),
      createdBy: faker.internet.email(),
      tags: faker.helpers.arrayElements(['production', 'testing', 'development', 'qa'], { min: 1, max: 3 }),
      department: faker.helpers.arrayElement(['Sales', 'Support', 'Marketing', 'Engineering'])
    };
  }

  /**
   * Valid agent IDs for testing
   */
  static VALID_AGENT_IDS = [
    'agent-001',
    'agent-002',
    'agent-003'
  ];

  /**
   * Invalid agent IDs for negative testing
   */
  static INVALID_AGENT_IDS = [
    'invalid-id',
    '999999',
    'non-existent-agent',
    '',
    null,
    undefined
  ];

  /**
   * Test agent names
   */
  static TEST_AGENT_NAMES = [
    'Customer Support Agent',
    'Sales Assistant Agent',
    'Technical Support Agent',
    'Marketing Agent'
  ];

  /**
   * Query parameters for filtering
   */
  static QUERY_PARAMS = {
    status: 'active',
    type: 'conversational',
    limit: 10,
    offset: 0,
    sortBy: 'createdAt',
    sortOrder: 'desc'
  };

  /**
   * Invalid tokens for authorization testing
   */
  static INVALID_TOKENS = [
    'invalid_token_12345',
    'expired_token_67890',
    'malformed.token.here',
    ''
  ];

  /**
   * Performance thresholds
   */
  static PERFORMANCE_THRESHOLDS = {
    getAll: 3000,      // 3 seconds
    getById: 2000,     // 2 seconds
    create: 3000,      // 3 seconds
    update: 2500,      // 2.5 seconds
    delete: 2000       // 2 seconds
  };
}

module.exports = AgentsData;