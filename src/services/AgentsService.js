/**
 * Agents Service Layer
 * Provides business logic and orchestration for Agents API operations
 * @module AgentsService
 */

const AgentsClient = require('../api/agents/AgentsClient');
const AgentsValidator = require('../api/agents/AgentsValidator');
const AgentsPayloads = require('../api/agents/AgentsPayloads');
const Logger = require('../utils/Logger');

class AgentsService {
  constructor(request, authManager) {
    this.client = new AgentsClient(request, authManager);
    this.validator = new AgentsValidator();
    this.logger = new Logger('AgentsService');
    this.createdAgentIds = []; // Track created agents for cleanup
  }

  /**
   * Get all agents with validation
   * @param {Object} queryParams - Optional query parameters
   * @returns {Promise<Object>} Validated response
   */
  async getAllAgents(queryParams = {}) {
    try {
      this.logger.info('Service: Getting all agents');
      const response = await this.client.getAll(queryParams);
      await this.validator.validateGetAll(response);
      return response;
    } catch (error) {
      this.logger.error(`Service: Failed to get all agents - ${error.message}`);
      throw error;
    }
  }

  /**
   * Get agent by ID with validation
   * @param {string} agentId - Agent identifier
   * @returns {Promise<Object>} Validated response
   */
  async getAgentById(agentId) {
    try {
      this.logger.info(`Service: Getting agent by ID: ${agentId}`);
      const response = await this.client.getById(agentId);
      await this.validator.validateGetById(response, agentId);
      return response;
    } catch (error) {
      this.logger.error(`Service: Failed to get agent by ID - ${error.message}`);
      throw error;
    }
  }

  /**
   * Create agent with validation
   * @param {Object} payload - Agent data
   * @param {boolean} trackForCleanup - Whether to track for cleanup
   * @returns {Promise<Object>} Validated response with created agent
   */
  async createAgent(payload, trackForCleanup = true) {
    try {
      this.logger.info('Service: Creating agent');
      const response = await this.client.create(payload);
      await this.validator.validateCreate(response, payload);
      
      // Track created agent for cleanup
      if (trackForCleanup) {
        const responseBody = await response.json();
        const agentId = responseBody.id || responseBody._id || responseBody.agentId;
        if (agentId) {
          this.createdAgentIds.push(agentId);
          this.logger.info(`Tracking agent for cleanup: ${agentId}`);
        }
      }
      
      return response;
    } catch (error) {
      this.logger.error(`Service: Failed to create agent - ${error.message}`);
      throw error;
    }
  }

  /**
   * Create agent with valid payload
   * @param {Object} overrides - Optional field overrides
   * @returns {Promise<Object>} Created agent response
   */
  async createValidAgent(overrides = {}) {
    const payload = AgentsPayloads.buildValidCreatePayload(overrides);
    return await this.createAgent(payload);
  }

  /**
   * Update agent with validation
   * @param {string} agentId - Agent identifier
   * @param {Object} payload - Updated agent data
   * @returns {Promise<Object>} Validated response
   */
  async updateAgent(agentId, payload) {
    try {
      this.logger.info(`Service: Updating agent: ${agentId}`);
      const response = await this.client.update(agentId, payload);
      await this.validator.validateUpdate(response, payload);
      return response;
    } catch (error) {
      this.logger.error(`Service: Failed to update agent - ${error.message}`);
      throw error;
    }
  }

  /**
   * Partially update agent with validation
   * @param {string} agentId - Agent identifier
   * @param {Object} payload - Partial agent data
   * @returns {Promise<Object>} Validated response
   */
  async patchAgent(agentId, payload) {
    try {
      this.logger.info(`Service: Patching agent: ${agentId}`);
      const response = await this.client.patch(agentId, payload);
      await this.validator.validateUpdate(response, payload);
      return response;
    } catch (error) {
      this.logger.error(`Service: Failed to patch agent - ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete agent with validation
   * @param {string} agentId - Agent identifier
   * @returns {Promise<Object>} Validated response
   */
  async deleteAgent(agentId) {
    try {
      this.logger.info(`Service: Deleting agent: ${agentId}`);
      const response = await this.client.delete(agentId);
      await this.validator.validateDelete(response);
      
      // Remove from cleanup tracking
      const index = this.createdAgentIds.indexOf(agentId);
      if (index > -1) {
        this.createdAgentIds.splice(index, 1);
        this.logger.info(`Removed agent from cleanup tracking: ${agentId}`);
      }
      
      return response;
    } catch (error) {
      this.logger.error(`Service: Failed to delete agent - ${error.message}`);
      throw error;
    }
  }

  /**
   * Search agents with validation
   * @param {Object} searchCriteria - Search parameters
   * @returns {Promise<Object>} Validated response
   */
  async searchAgents(searchCriteria) {
    try {
      this.logger.info('Service: Searching agents');
      const response = await this.client.search(searchCriteria);
      await this.validator.validateGetAll(response);
      return response;
    } catch (error) {
      this.logger.error(`Service: Failed to search agents - ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify agent exists
   * @param {string} agentId - Agent identifier
   * @returns {Promise<boolean>} True if agent exists
   */
  async verifyAgentExists(agentId) {
    try {
      this.logger.info(`Service: Verifying agent exists: ${agentId}`);
      const response = await this.client.getById(agentId);
      return response.status === 200;
    } catch (error) {
      this.logger.warn(`Service: Agent does not exist: ${agentId}`);
      return false;
    }
  }

  /**
   * Verify agent does not exist
   * @param {string} agentId - Agent identifier
   * @returns {Promise<boolean>} True if agent does not exist
   */
  async verifyAgentNotExists(agentId) {
    try {
      this.logger.info(`Service: Verifying agent does not exist: ${agentId}`);
      const response = await this.client.getById(agentId);
      return response.status === 404;
    } catch (error) {
      return true;
    }
  }

  /**
   * Create and get agent (helper method)
   * @param {Object} overrides - Optional field overrides
   * @returns {Promise<Object>} Created agent data
   */
  async createAndGetAgent(overrides = {}) {
    try {
      this.logger.info('Service: Creating and retrieving agent');
      const createResponse = await this.createValidAgent(overrides);
      const createBody = await createResponse.json();
      const agentId = createBody.id || createBody._id || createBody.agentId;
      
      const getResponse = await this.getAgentById(agentId);
      return await getResponse.json();
    } catch (error) {
      this.logger.error(`Service: Failed to create and get agent - ${error.message}`);
      throw error;
    }
  }

  /**
   * Cleanup all created agents
   * Should be called in test teardown
   */
  async cleanupCreatedAgents() {
    this.logger.info(`Service: Cleaning up ${this.createdAgentIds.length} created agents`);
    
    const deletePromises = this.createdAgentIds.map(async (agentId) => {
      try {
        await this.client.delete(agentId);
        this.logger.info(`Successfully deleted agent: ${agentId}`);
      } catch (error) {
        this.logger.warn(`Failed to delete agent ${agentId}: ${error.message}`);
      }
    });
    
    await Promise.allSettled(deletePromises);
    this.createdAgentIds = [];
    this.logger.info('Cleanup completed');
  }

  /**
   * Get created agent IDs
   * @returns {Array<string>} List of created agent IDs
   */
  getCreatedAgentIds() {
    return [...this.createdAgentIds];
  }

  /**
   * Clear created agent IDs tracking
   */
  clearCreatedAgentIds() {
    this.createdAgentIds = [];
    this.logger.info('Cleared created agent IDs tracking');
  }
}

module.exports = AgentsService;