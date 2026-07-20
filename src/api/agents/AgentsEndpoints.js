/**
 * Agents API Endpoints
 * Defines all endpoint paths for Agents API
 * @module AgentsEndpoints
 */

class AgentsEndpoints {
  /**
   * Base path for Agents API
   */
  static BASE_PATH = '/agents';

  /**
   * Get all agents endpoint
   * @returns {string} Endpoint path
   */
  static GET_ALL_AGENTS() {
    return this.BASE_PATH;
  }

  /**
   * Get agent by ID endpoint
   * @param {string} agentId - Agent identifier
   * @returns {string} Endpoint path
   */
  static GET_AGENT_BY_ID(agentId) {
    return `${this.BASE_PATH}/${agentId}`;
  }

  /**
   * Create new agent endpoint
   * @returns {string} Endpoint path
   */
  static CREATE_AGENT() {
    return this.BASE_PATH;
  }

  /**
   * Update agent endpoint
   * @param {string} agentId - Agent identifier
   * @returns {string} Endpoint path
   */
  static UPDATE_AGENT(agentId) {
    return `${this.BASE_PATH}/${agentId}`;
  }

  /**
   * Delete agent endpoint
   * @param {string} agentId - Agent identifier
   * @returns {string} Endpoint path
   */
  static DELETE_AGENT(agentId) {
    return `${this.BASE_PATH}/${agentId}`;
  }

  /**
   * Search agents endpoint
   * @returns {string} Endpoint path
   */
  static SEARCH_AGENTS() {
    return `${this.BASE_PATH}/search`;
  }
}

module.exports = AgentsEndpoints;