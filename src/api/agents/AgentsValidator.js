/**
 * Agents API Response Validator
 * Validates API responses for Agents endpoints
 * Extends BaseValidator for common validation functionality
 * @module AgentsValidator
 */

const BaseValidator = require('../common/BaseValidator');
const { expect } = require('@playwright/test');
const Logger = require('../../utils/Logger');

class AgentsValidator extends BaseValidator {
  constructor() {
    super();
    this.logger = new Logger('AgentsValidator');
  }

  /**
   * Validate Get All Agents response
   * @param {Object} response - API response object
   * @param {number} expectedStatus - Expected HTTP status code
   */
  async validateGetAll(response, expectedStatus = 200) {
    try {
      this.logger.info('Validating Get All Agents response');
      
      // Validate status code
      this.validateStatusCode(response, expectedStatus);
      
      if (expectedStatus === 200) {
        const responseBody = await response.json();
        
        // Validate response is an array or has data property
        if (Array.isArray(responseBody)) {
          this.logger.info(`Response contains ${responseBody.length} agents`);
          
          // Validate each agent in the array
          if (responseBody.length > 0) {
            responseBody.forEach((agent, index) => {
              this.validateAgentObject(agent, `Agent at index ${index}`);
            });
          }
        } else if (responseBody.data && Array.isArray(responseBody.data)) {
          this.logger.info(`Response contains ${responseBody.data.length} agents`);
          
          // Validate pagination metadata if present
          if (responseBody.pagination) {
            this.validatePaginationMetadata(responseBody.pagination);
          }
          
          // Validate each agent
          if (responseBody.data.length > 0) {
            responseBody.data.forEach((agent, index) => {
              this.validateAgentObject(agent, `Agent at index ${index}`);
            });
          }
        } else {
          throw new Error('Response is neither an array nor contains data property');
        }
      }
      
      this.logger.info('Get All Agents validation passed');
    } catch (error) {
      this.logger.error(`Get All Agents validation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate Get Agent By ID response
   * @param {Object} response - API response object
   * @param {string} expectedAgentId - Expected agent ID
   * @param {number} expectedStatus - Expected HTTP status code
   */
  async validateGetById(response, expectedAgentId, expectedStatus = 200) {
    try {
      this.logger.info(`Validating Get Agent By ID response for ID: ${expectedAgentId}`);
      
      // Validate status code
      this.validateStatusCode(response, expectedStatus);
      
      if (expectedStatus === 200) {
        const responseBody = await response.json();
        
        // Validate agent object
        this.validateAgentObject(responseBody);
        
        // Validate agent ID matches
        if (expectedAgentId) {
          expect(responseBody.id || responseBody._id || responseBody.agentId).toBe(expectedAgentId);
          this.logger.info(`Agent ID matches: ${expectedAgentId}`);
        }
      } else if (expectedStatus === 404) {
        const responseBody = await response.json();
        this.validateErrorResponse(responseBody, 'Agent not found');
      }
      
      this.logger.info('Get Agent By ID validation passed');
    } catch (error) {
      this.logger.error(`Get Agent By ID validation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate Create Agent response
   * @param {Object} response - API response object
   * @param {Object} requestPayload - Original request payload
   * @param {number} expectedStatus - Expected HTTP status code
   */
  async validateCreate(response, requestPayload, expectedStatus = 201) {
    try {
      this.logger.info('Validating Create Agent response');
      
      // Validate status code
      this.validateStatusCode(response, expectedStatus);
      
      if (expectedStatus === 201 || expectedStatus === 200) {
        const responseBody = await response.json();
        
        // Validate agent object
        this.validateAgentObject(responseBody);
        
        // Validate created agent has an ID
        expect(responseBody.id || responseBody._id || responseBody.agentId).toBeDefined();
        this.logger.info(`Created agent ID: ${responseBody.id || responseBody._id || responseBody.agentId}`);
        
        // Validate request payload fields match response
        if (requestPayload.name) {
          expect(responseBody.name).toBe(requestPayload.name);
        }
        if (requestPayload.type) {
          expect(responseBody.type).toBe(requestPayload.type);
        }
        if (requestPayload.status) {
          expect(responseBody.status).toBe(requestPayload.status);
        }
        
        // Validate timestamps
        expect(responseBody.createdAt || responseBody.created_at).toBeDefined();
        this.logger.info('Created timestamp validated');
        
      } else if (expectedStatus === 400) {
        const responseBody = await response.json();
        this.validateErrorResponse(responseBody, 'Bad Request');
      } else if (expectedStatus === 409) {
        const responseBody = await response.json();
        this.validateErrorResponse(responseBody, 'Conflict');
      }
      
      this.logger.info('Create Agent validation passed');
    } catch (error) {
      this.logger.error(`Create Agent validation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate Update Agent response
   * @param {Object} response - API response object
   * @param {Object} requestPayload - Original request payload
   * @param {number} expectedStatus - Expected HTTP status code
   */
  async validateUpdate(response, requestPayload, expectedStatus = 200) {
    try {
      this.logger.info('Validating Update Agent response');
      
      // Validate status code
      this.validateStatusCode(response, expectedStatus);
      
      if (expectedStatus === 200) {
        const responseBody = await response.json();
        
        // Validate agent object
        this.validateAgentObject(responseBody);
        
        // Validate updated fields match request
        Object.keys(requestPayload).forEach(key => {
          if (responseBody[key] !== undefined) {
            expect(responseBody[key]).toEqual(requestPayload[key]);
            this.logger.info(`Field ${key} updated successfully`);
          }
        });
        
        // Validate updatedAt timestamp
        expect(responseBody.updatedAt || responseBody.updated_at).toBeDefined();
        this.logger.info('Updated timestamp validated');
        
      } else if (expectedStatus === 404) {
        const responseBody = await response.json();
        this.validateErrorResponse(responseBody, 'Agent not found');
      } else if (expectedStatus === 400) {
        const responseBody = await response.json();
        this.validateErrorResponse(responseBody, 'Bad Request');
      }
      
      this.logger.info('Update Agent validation passed');
    } catch (error) {
      this.logger.error(`Update Agent validation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate Delete Agent response
   * @param {Object} response - API response object
   * @param {number} expectedStatus - Expected HTTP status code
   */
  async validateDelete(response, expectedStatus = 204) {
    try {
      this.logger.info('Validating Delete Agent response');
      
      // Validate status code
      this.validateStatusCode(response, expectedStatus);
      
      if (expectedStatus === 204) {
        // No content expected for 204
        this.logger.info('Delete successful - No content returned');
      } else if (expectedStatus === 200) {
        const responseBody = await response.json();
        // Validate success message
        expect(responseBody.message || responseBody.status).toBeDefined();
        this.logger.info(`Delete response: ${responseBody.message || responseBody.status}`);
      } else if (expectedStatus === 404) {
        const responseBody = await response.json();
        this.validateErrorResponse(responseBody, 'Agent not found');
      }
      
      this.logger.info('Delete Agent validation passed');
    } catch (error) {
      this.logger.error(`Delete Agent validation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate unauthorized response
   * @param {Object} response - API response object
   */
  async validateUnauthorized(response) {
    try {
      this.logger.info('Validating Unauthorized response');
      
      // Validate status code is 401
      this.validateStatusCode(response, 401);
      
      const responseBody = await response.json();
      
      // Validate error message
      this.validateErrorResponse(responseBody, 'Unauthorized');
      
      this.logger.info('Unauthorized validation passed');
    } catch (error) {
      this.logger.error(`Unauthorized validation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate forbidden response
   * @param {Object} response - API response object
   */
  async validateForbidden(response) {
    try {
      this.logger.info('Validating Forbidden response');
      
      // Validate status code is 403
      this.validateStatusCode(response, 403);
      
      const responseBody = await response.json();
      
      // Validate error message
      this.validateErrorResponse(responseBody, 'Forbidden');
      
      this.logger.info('Forbidden validation passed');
    } catch (error) {
      this.logger.error(`Forbidden validation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate agent object structure and required fields
   * @param {Object} agent - Agent object
   * @param {string} context - Context for logging
   */
  validateAgentObject(agent, context = 'Agent') {
    this.logger.info(`Validating ${context} object structure`);
    
    // Validate agent is an object
    expect(agent).toBeDefined();
    expect(typeof agent).toBe('object');
    
    // Validate required fields
    const idField = agent.id || agent._id || agent.agentId;
    expect(idField).toBeDefined();
    expect(typeof idField).toBe('string');
    
    expect(agent.name).toBeDefined();
    expect(typeof agent.name).toBe('string');
    expect(agent.name.length).toBeGreaterThan(0);
    
    expect(agent.type).toBeDefined();
    expect(typeof agent.type).toBe('string');
    
    expect(agent.status).toBeDefined();
    expect(typeof agent.status).toBe('string');
    
    // Validate optional fields if present
    if (agent.description !== undefined) {
      expect(typeof agent.description).toBe('string');
    }
    
    if (agent.capabilities !== undefined) {
      expect(Array.isArray(agent.capabilities)).toBe(true);
    }
    
    if (agent.configuration !== undefined) {
      expect(typeof agent.configuration).toBe('object');
    }
    
    if (agent.metadata !== undefined) {
      expect(typeof agent.metadata).toBe('object');
    }
    
    if (agent.isActive !== undefined) {
      expect(typeof agent.isActive).toBe('boolean');
    }
    
    // Validate timestamps
    const createdAtField = agent.createdAt || agent.created_at;
    if (createdAtField) {
      expect(createdAtField).toBeDefined();
      this.validateTimestamp(createdAtField);
    }
    
    const updatedAtField = agent.updatedAt || agent.updated_at;
    if (updatedAtField) {
      expect(updatedAtField).toBeDefined();
      this.validateTimestamp(updatedAtField);
    }
    
    this.logger.info(`${context} object validation passed`);
  }

  /**
   * Validate pagination metadata
   * @param {Object} pagination - Pagination object
   */
  validatePaginationMetadata(pagination) {
    this.logger.info('Validating pagination metadata');
    
    expect(pagination).toBeDefined();
    expect(typeof pagination).toBe('object');
    
    // Validate pagination fields
    if (pagination.total !== undefined) {
      expect(typeof pagination.total).toBe('number');
      expect(pagination.total).toBeGreaterThanOrEqual(0);
    }
    
    if (pagination.limit !== undefined) {
      expect(typeof pagination.limit).toBe('number');
      expect(pagination.limit).toBeGreaterThan(0);
    }
    
    if (pagination.offset !== undefined) {
      expect(typeof pagination.offset).toBe('number');
      expect(pagination.offset).toBeGreaterThanOrEqual(0);
    }
    
    if (pagination.page !== undefined) {
      expect(typeof pagination.page).toBe('number');
      expect(pagination.page).toBeGreaterThan(0);
    }
    
    if (pagination.totalPages !== undefined) {
      expect(typeof pagination.totalPages).toBe('number');
      expect(pagination.totalPages).toBeGreaterThanOrEqual(0);
    }
    
    this.logger.info('Pagination metadata validation passed');
  }

  /**
   * Validate error response structure
   * @param {Object} errorResponse - Error response object
   * @param {string} expectedMessagePattern - Expected error message pattern
   */
  validateErrorResponse(errorResponse, expectedMessagePattern) {
    this.logger.info('Validating error response');
    
    expect(errorResponse).toBeDefined();
    expect(typeof errorResponse).toBe('object');
    
    // Validate error message exists
    const errorMessage = errorResponse.message || errorResponse.error || errorResponse.errorMessage;
    expect(errorMessage).toBeDefined();
    expect(typeof errorMessage).toBe('string');
    
    // Validate error message contains expected pattern
    if (expectedMessagePattern) {
      expect(errorMessage.toLowerCase()).toContain(expectedMessagePattern.toLowerCase());
    }
    
    this.logger.info(`Error response validated: ${errorMessage}`);
  }

  /**
   * Validate timestamp format
   * @param {string} timestamp - Timestamp string
   */
  validateTimestamp(timestamp) {
    expect(timestamp).toBeDefined();
    
    // Check if valid ISO 8601 format or Unix timestamp
    const isValidISO = !isNaN(Date.parse(timestamp));
    const isValidUnix = typeof timestamp === 'number' && timestamp > 0;
    
    expect(isValidISO || isValidUnix).toBe(true);
  }

  /**
   * Validate response time
   * @param {number} responseTime - Response time in milliseconds
   * @param {number} threshold - Maximum acceptable response time
   */
  validateResponseTime(responseTime, threshold) {
    this.logger.info(`Validating response time: ${responseTime}ms (threshold: ${threshold}ms)`);
    
    expect(responseTime).toBeDefined();
    expect(typeof responseTime).toBe('number');
    expect(responseTime).toBeLessThanOrEqual(threshold);
    
    this.logger.info('Response time validation passed');
  }
}

module.exports = AgentsValidator;