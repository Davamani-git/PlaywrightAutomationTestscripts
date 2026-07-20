/**
 * Agents API Client
 * Handles all HTTP operations for Agents API
 * Extends BaseApiClient for common functionality
 * @module AgentsClient
 */

const BaseApiClient = require('../common/BaseApiClient');
const AgentsEndpoints = require('./AgentsEndpoints');
const Logger = require('../../utils/Logger');
const ConfigManager = require('../../config/ConfigManager');

class AgentsClient extends BaseApiClient {
  constructor(request, authManager) {
    super(request, authManager);
    this.baseURL = ConfigManager.getBaseURL();
    this.logger = new Logger('AgentsClient');
  }

  /**
   * Get all agents
   * @param {Object} queryParams - Optional query parameters for filtering
   * @returns {Promise<Object>} API response
   */
  async getAll(queryParams = {}) {
    try {
      this.logger.info('Fetching all agents');
      const endpoint = AgentsEndpoints.GET_ALL_AGENTS();
      const response = await this.get(endpoint, queryParams);
      this.logger.info(`Successfully fetched agents. Status: ${response.status}`);
      return response;
    } catch (error) {
      this.logger.error(`Failed to fetch all agents: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get agent by ID
   * @param {string} agentId - Agent identifier
   * @returns {Promise<Object>} API response
   */
  async getById(agentId) {
    try {
      this.logger.info(`Fetching agent with ID: ${agentId}`);
      const endpoint = AgentsEndpoints.GET_AGENT_BY_ID(agentId);
      const response = await this.get(endpoint);
      this.logger.info(`Successfully fetched agent. Status: ${response.status}`);
      return response;
    } catch (error) {
      this.logger.error(`Failed to fetch agent by ID ${agentId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create new agent
   * @param {Object} payload - Agent data
   * @returns {Promise<Object>} API response
   */
  async create(payload) {
    try {
      this.logger.info('Creating new agent');
      const endpoint = AgentsEndpoints.CREATE_AGENT();
      const response = await this.post(endpoint, payload);
      this.logger.info(`Successfully created agent. Status: ${response.status}`);
      return response;
    } catch (error) {
      this.logger.error(`Failed to create agent: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update existing agent
   * @param {string} agentId - Agent identifier
   * @param {Object} payload - Updated agent data
   * @returns {Promise<Object>} API response
   */
  async update(agentId, payload) {
    try {
      this.logger.info(`Updating agent with ID: ${agentId}`);
      const endpoint = AgentsEndpoints.UPDATE_AGENT(agentId);
      const response = await this.put(endpoint, payload);
      this.logger.info(`Successfully updated agent. Status: ${response.status}`);
      return response;
    } catch (error) {
      this.logger.error(`Failed to update agent ${agentId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Partially update agent
   * @param {string} agentId - Agent identifier
   * @param {Object} payload - Partial agent data
   * @returns {Promise<Object>} API response
   */
  async patch(agentId, payload) {
    try {
      this.logger.info(`Partially updating agent with ID: ${agentId}`);
      const endpoint = AgentsEndpoints.UPDATE_AGENT(agentId);
      const response = await this.patchRequest(endpoint, payload);
      this.logger.info(`Successfully patched agent. Status: ${response.status}`);
      return response;
    } catch (error) {
      this.logger.error(`Failed to patch agent ${agentId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete agent
   * @param {string} agentId - Agent identifier
   * @returns {Promise<Object>} API response
   */
  async delete(agentId) {
    try {
      this.logger.info(`Deleting agent with ID: ${agentId}`);
      const endpoint = AgentsEndpoints.DELETE_AGENT(agentId);
      const response = await this.deleteRequest(endpoint);
      this.logger.info(`Successfully deleted agent. Status: ${response.status}`);
      return response;
    } catch (error) {
      this.logger.error(`Failed to delete agent ${agentId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Search agents with criteria
   * @param {Object} searchCriteria - Search parameters
   * @returns {Promise<Object>} API response
   */
  async search(searchCriteria) {
    try {
      this.logger.info('Searching agents with criteria');
      const endpoint = AgentsEndpoints.SEARCH_AGENTS();
      const response = await this.post(endpoint, searchCriteria);
      this.logger.info(`Successfully searched agents. Status: ${response.status}`);
      return response;
    } catch (error) {
      this.logger.error(`Failed to search agents: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all agents without authentication
   * Used for negative testing
   * @returns {Promise<Object>} API response
   */
  async getAllWithoutAuth() {
    try {
      this.logger.info('Fetching all agents without authentication');
      const endpoint = AgentsEndpoints.GET_ALL_AGENTS();
      const response = await this.getWithoutAuth(endpoint);
      this.logger.info(`Request completed. Status: ${response.status}`);
      return response;
    } catch (error) {
      this.logger.error(`Request failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all agents with invalid token
   * Used for negative testing
   * @param {string} invalidToken - Invalid authentication token
   * @returns {Promise<Object>} API response
   */
  async getAllWithInvalidToken(invalidToken) {
    try {
      this.logger.info('Fetching all agents with invalid token');
      const endpoint = AgentsEndpoints.GET_ALL_AGENTS();
      const response = await this.getWithCustomToken(endpoint, invalidToken);
      this.logger.info(`Request completed. Status: ${response.status}`);
      return response;
    } catch (error) {
      this.logger.error(`Request failed: ${error.message}`);
      throw error;
    }
  }
}

module.exports = AgentsClient;