# Low-Level Design Document for DavTest09

## Table of Contents
1. [Component Specifications](#component-specifications)
2. [Data Flow Diagrams](#data-flow-diagrams)
3. [Sequence Diagrams](#sequence-diagrams)
4. [Implementation Details](#implementation-details)
5. [Database Schema](#database-schema)
6. [API Specifications](#api-specifications)
7. [Security Implementation](#security-implementation)
8. [Error Handling](#error-handling)
9. [Performance Optimization](#performance-optimization)
10. [Testing Strategy](#testing-strategy)

## Component Specifications

### 1. User Service Component

#### 1.1 Authentication Module
```javascript
class AuthenticationService {
  constructor(jwtService, bcryptService, userRepository) {
    this.jwtService = jwtService;
    this.bcryptService = bcryptService;
    this.userRepository = userRepository;
    this.maxFailedAttempts = 5;
    this.lockoutDuration = 15 * 60 * 1000; // 15 minutes
  }

  async authenticate(email, password) {
    const user = await this.userRepository.findByEmail(email);
    
    if (!user) {
      throw new AuthenticationError('Invalid credentials');
    }

    if (this.isAccountLocked(user)) {
      throw new AccountLockedError('Account temporarily locked');
    }

    const isValidPassword = await this.bcryptService.compare(password, user.password);
    
    if (!isValidPassword) {
      await this.handleFailedAttempt(user);
      throw new AuthenticationError('Invalid credentials');
    }

    await this.resetFailedAttempts(user);
    return this.generateTokens(user);
  }

  async generateTokens(user) {
    const payload = {
      userId: user.userId,
      email: user.email,
      roles: user.roles
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '15m',
      algorithm: 'RS256'
    });

    const refreshToken = this.jwtService.sign(
      { userId: user.userId },
      { expiresIn: '7d', algorithm: 'RS256' }
    );

    return { accessToken, refreshToken };
  }
}
```

#### 1.2 Authorization Module
```javascript
class AuthorizationService {
  constructor(roleRepository, permissionRepository) {
    this.roleRepository = roleRepository;
    this.permissionRepository = permissionRepository;
  }

  async hasPermission(userId, resource, action) {
    const userRoles = await this.roleRepository.findByUserId(userId);
    const permissions = await this.permissionRepository.findByRoles(userRoles);
    
    return permissions.some(permission => 
      permission.resource === resource && 
      permission.actions.includes(action)
    );
  }

  async enforcePermission(userId, resource, action) {
    const hasAccess = await this.hasPermission(userId, resource, action);
    
    if (!hasAccess) {
      throw new ForbiddenError(`Access denied for ${action} on ${resource}`);
    }
  }
}
```

### 2. Product Service Component

#### 2.1 Product Management Module
```javascript
class ProductService {
  constructor(productRepository, elasticSearchService, cacheService) {
    this.productRepository = productRepository;
    this.elasticSearchService = elasticSearchService;
    this.cacheService = cacheService;
  }

  async createProduct(productData) {
    const validation = this.validateProductData(productData);
    if (!validation.isValid) {
      throw new ValidationError(validation.errors);
    }

    const product = await this.productRepository.create(productData);
    
    // Index in ElasticSearch for search functionality
    await this.elasticSearchService.index('products', product.productId, {
      name: product.name,
      description: product.description,
      category: product.category,
      price: product.price,
      tags: product.tags
    });

    // Cache product data
    await this.cacheService.set(`product:${product.productId}`, product, 3600);

    return product;
  }

  async searchProducts(query, filters, pagination) {
    const searchParams = {
      index: 'products',
      body: {
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query: query,
                  fields: ['name^2', 'description', 'tags'],
                  fuzziness: 'AUTO'
                }
              }
            ],
            filter: this.buildFilters(filters)
          }
        },
        from: pagination.offset,
        size: pagination.limit,
        sort: this.buildSortCriteria(filters.sort)
      }
    };

    const results = await this.elasticSearchService.search(searchParams);
    return this.formatSearchResults(results);
  }
}
```

#### 2.2 Inventory Management Module
```javascript
class InventoryService {
  constructor(inventoryRepository, eventPublisher, lockService) {
    this.inventoryRepository = inventoryRepository;
    this.eventPublisher = eventPublisher;
    this.lockService = lockService;
  }

  async reserveInventory(productId, quantity) {
    const lockKey = `inventory:${productId}`;
    const lock = await this.lockService.acquire(lockKey, 5000);
    
    try {
      const inventory = await this.inventoryRepository.findByProductId(productId);
      
      if (inventory.quantity < quantity) {
        throw new InsufficientStockError('Not enough inventory available');
      }

      const updatedInventory = await this.inventoryRepository.update(productId, {
        quantity: inventory.quantity - quantity,
        reservedQty: inventory.reservedQty + quantity
      });

      // Publish inventory reserved event
      await this.eventPublisher.publish('inventory.reserved', {
        productId,
        quantity,
        reservationId: this.generateReservationId(),
        timestamp: new Date()
      });

      return updatedInventory;
    } finally {
      await lock.release();
    }
  }

  async checkLowStock() {
    const lowStockItems = await this.inventoryRepository.findLowStock();
    
    for (const item of lowStockItems) {
      await this.eventPublisher.publish('inventory.low_stock', {
        productId: item.productId,
        currentQuantity: item.quantity,
        minThreshold: item.minThreshold,
        timestamp: new Date()
      });
    }
  }
}
```

### 3. Order Service Component

#### 3.1 Order Management Module
```javascript
class OrderService {
  constructor(orderRepository, inventoryService, paymentService, eventPublisher) {
    this.orderRepository = orderRepository;
    this.inventoryService = inventoryService;
    this.paymentService = paymentService;
    this.eventPublisher = eventPublisher;
    this.orderStateMachine = new OrderStateMachine();
  }

  async createOrder(orderData) {
    const orderId = this.generateOrderId();
    
    // Validate order items and reserve inventory
    for (const item of orderData.items) {
      await this.inventoryService.reserveInventory(item.productId, item.quantity);
    }

    const order = await this.orderRepository.create({
      ...orderData,
      orderId,
      status: 'PENDING',
      createdAt: new Date()
    });

    // Publish order created event
    await this.eventPublisher.publish('order.created', {
      orderId,
      userId: order.userId,
      totalAmount: order.totalAmount,
      timestamp: new Date()
    });

    return order;
  }

  async updateOrderStatus(orderId, newStatus) {
    const order = await this.orderRepository.findById(orderId);
    
    if (!this.orderStateMachine.canTransition(order.status, newStatus)) {
      throw new InvalidStateTransitionError(
        `Cannot transition from ${order.status} to ${newStatus}`
      );
    }

    const updatedOrder = await this.orderRepository.update(orderId, {
      status: newStatus,
      updatedAt: new Date()
    });

    await this.eventPublisher.publish('order.status_updated', {
      orderId,
      oldStatus: order.status,
      newStatus,
      timestamp: new Date()
    });

    return updatedOrder;
  }
}
```

#### 3.2 Order State Machine
```javascript
class OrderStateMachine {
  constructor() {
    this.transitions = {
      'PENDING': ['CONFIRMED', 'CANCELLED'],
      'CONFIRMED': ['PROCESSING', 'CANCELLED'],
      'PROCESSING': ['SHIPPED', 'CANCELLED'],
      'SHIPPED': ['DELIVERED', 'RETURNED'],
      'DELIVERED': ['COMPLETED', 'RETURNED'],
      'CANCELLED': [],
      'RETURNED': ['REFUNDED'],
      'REFUNDED': [],
      'COMPLETED': []
    };
  }

  canTransition(currentState, newState) {
    return this.transitions[currentState]?.includes(newState) || false;
  }

  getValidTransitions(currentState) {
    return this.transitions[currentState] || [];
  }
}
```

### 4. Payment Service Component

#### 4.1 Payment Processing Module
```javascript
class PaymentService {
  constructor(stripeService, paypalService, fraudDetectionService, eventPublisher) {
    this.stripeService = stripeService;
    this.paypalService = paypalService;
    this.fraudDetectionService = fraudDetectionService;
    this.eventPublisher = eventPublisher;
  }

  async processPayment(paymentData) {
    // Fraud detection check
    const fraudScore = await this.fraudDetectionService.analyze(paymentData);
    
    if (fraudScore > 0.8) {
      throw new FraudDetectedError('Payment flagged for fraud');
    }

    const paymentProcessor = this.getPaymentProcessor(paymentData.method);
    
    try {
      const result = await paymentProcessor.charge({
        amount: paymentData.amount,
        currency: paymentData.currency,
        source: paymentData.source,
        metadata: {
          orderId: paymentData.orderId,
          userId: paymentData.userId
        }
      });

      // Store payment record
      const payment = await this.paymentRepository.create({
        paymentId: this.generatePaymentId(),
        orderId: paymentData.orderId,
        amount: paymentData.amount,
        method: paymentData.method,
        status: 'COMPLETED',
        transactionId: result.transactionId,
        processedAt: new Date()
      });

      await this.eventPublisher.publish('payment.completed', {
        paymentId: payment.paymentId,
        orderId: paymentData.orderId,
        amount: paymentData.amount,
        timestamp: new Date()
      });

      return payment;
    } catch (error) {
      await this.handlePaymentFailure(paymentData, error);
      throw error;
    }
  }

  getPaymentProcessor(method) {
    switch (method) {
      case 'STRIPE':
        return this.stripeService;
      case 'PAYPAL':
        return this.paypalService;
      default:
        throw new UnsupportedPaymentMethodError(`Unsupported payment method: ${method}`);
    }
  }
}
```

## Data Flow Diagrams

### User Authentication Flow
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client    │───▶│ API Gateway │───▶│ Auth Service│───▶│  Database   │
│             │    │             │    │             │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │                   │                   │                   │
       │                   │                   │                   │
       │◀──────────────────┼───────────────────┼───────────────────┘
       │                   │                   │
       │                   │                   ▼
       │                   │            ┌─────────────┐
       │                   │            │ JWT Service │
       │                   │            │             │
       │                   │            └─────────────┘
       │                   │                   │
       │◀──────────────────┼───────────────────┘
       │                   │
       │                   ▼
       │            ┌─────────────┐
       │            │ Redis Cache │
       │            │ (Sessions)  │
       │            └─────────────┘
       │                   │
       │◀──────────────────┘
```

### Order Processing Flow
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client    │───▶│Order Service│───▶│Inventory    │
│             │    │             │    │Service      │
└─────────────┘    └─────────────┘    └─────────────┘
       │                   │                   │
       │                   │                   ▼
       │                   │            ┌─────────────┐
       │                   │            │  Database   │
       │                   │            │             │
       │                   │            └─────────────┘
       │                   │                   │
       │                   ▼                   │
       │            ┌─────────────┐           │
       │            │Payment      │           │
       │            │Service      │           │
       │            └─────────────┘           │
       │                   │                   │
       │                   ▼                   │
       │            ┌─────────────┐           │
       │            │External     │           │
       │            │Payment      │           │
       │            │Gateway      │           │
       │            └─────────────┘           │
       │                   │                   │
       │◀──────────────────┼───────────────────┘
       │                   │
       │                   ▼
       │            ┌─────────────┐
       │            │Event        │
       │            │Publisher    │
       │            └─────────────┘
```

## Sequence Diagrams

### User Registration Sequence
```
Client          API Gateway     Auth Service    Database        Email Service
  │                 │               │             │                 │
  │──POST /register─▶│               │             │                 │
  │                 │──validate────▶│             │                 │
  │                 │               │──hash pwd──▶│                 │
  │                 │               │             │                 │
  │                 │               │──save user─▶│                 │
  │                 │               │             │                 │
  │                 │               │◀──user id───│                 │
  │                 │               │                               │
  │                 │               │──send welcome email─────────▶│
  │                 │               │                               │
  │                 │◀──success─────│                               │
  │◀────201─────────│               │                               │
```

### Product Search Sequence
```
Client          API Gateway     Product Service  ElasticSearch   Cache
  │                 │               │               │             │
  │──GET /search────▶│               │               │             │
  │                 │──authorize───▶│               │             │
  │                 │               │──check cache─▶│             │
  │                 │               │               │             │
  │                 │               │◀──cache miss──│             │
  │                 │               │                             │
  │                 │               │──search query─────────────▶│
  │                 │               │                             │
  │                 │               │◀──results──────────────────│
  │                 │               │                             │
  │                 │               │──cache results────────────▶│
  │                 │               │                             │
  │                 │◀──products────│                             │
  │◀────200─────────│               │                             │
```

### Order Creation Sequence
```
Client      API Gateway   Order Service   Inventory   Payment     Database
  │             │             │             │           │             │
  │──POST /order▶│             │             │           │             │
  │             │──validate──▶│             │           │             │
  │             │             │──reserve───▶│           │             │
  │             │             │             │           │             │
  │             │             │◀──reserved──│           │             │
  │             │             │                         │             │
  │             │             │──create order──────────▶│             │
  │             │             │                         │             │
  │             │             │◀──order id─────────────│             │
  │             │             │                                       │
  │             │             │──process payment──────▶│             │
  │             │             │                         │             │
  │             │             │◀──payment success──────│             │
  │             │             │                                       │
  │             │             │──update status─────────▶│             │
  │             │◀──success───│                         │             │
  │◀────201─────│             │                         │             │
```

## Implementation Details

### 1. Database Schema

#### Users Table
```sql
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    status user_status_enum DEFAULT 'ACTIVE',
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
```

#### Products Table
```sql
CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    sku VARCHAR(100) UNIQUE NOT NULL,
    seller_id UUID NOT NULL,
    category_id UUID NOT NULL,
    images JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (seller_id) REFERENCES users(user_id),
    FOREIGN KEY (category_id) REFERENCES categories(category_id)
);

CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_seller ON products(seller_id);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_products_price ON products(price);
```

#### Orders Table
```sql
CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
    status order_status_enum DEFAULT 'PENDING',
    shipping_address JSONB NOT NULL,
    billing_address JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at);
```

#### Inventory Table
```sql
CREATE TABLE inventory (
    inventory_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID UNIQUE NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    reserved_qty INTEGER DEFAULT 0 CHECK (reserved_qty >= 0),
    min_threshold INTEGER DEFAULT 10 CHECK (min_threshold >= 0),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(product_id),
    CONSTRAINT quantity_check CHECK (quantity >= reserved_qty)
);

CREATE INDEX idx_inventory_product ON inventory(product_id);
CREATE INDEX idx_inventory_low_stock ON inventory(quantity) WHERE quantity <= min_threshold;
```

### 2. API Specifications

#### Authentication Endpoints
```yaml
/auth/register:
  post:
    summary: Register new user
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required:
              - email
              - password
              - firstName
              - lastName
            properties:
              email:
                type: string
                format: email
              password:
                type: string
                minLength: 8
                pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]'
              firstName:
                type: string
                maxLength: 50
              lastName:
                type: string
                maxLength: 50
    responses:
      201:
        description: User registered successfully
        content:
          application/json:
            schema:
              type: object
              properties:
                userId:
                  type: string
                  format: uuid
                message:
                  type: string
      400:
        description: Validation error
      409:
        description: Email already exists
```

#### Product Endpoints
```yaml
/products/search:
  get:
    summary: Search products
    parameters:
      - name: q
        in: query
        required: true
        schema:
          type: string
          minLength: 1
      - name: category
        in: query
        schema:
          type: string
      - name: minPrice
        in: query
        schema:
          type: number
          minimum: 0
      - name: maxPrice
        in: query
        schema:
          type: number
          minimum: 0
      - name: page
        in: query
        schema:
          type: integer
          minimum: 1
          default: 1
      - name: limit
        in: query
        schema:
          type: integer
          minimum: 1
          maximum: 100
          default: 20
    responses:
      200:
        description: Search results
        content:
          application/json:
            schema:
              type: object
              properties:
                products:
                  type: array
                  items:
                    $ref: '#/components/schemas/Product'
                pagination:
                  $ref: '#/components/schemas/Pagination'
                facets:
                  type: object
```

### 3. Security Implementation

#### Input Validation Middleware
```javascript
const validateInput = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context.value
      }));

      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    req.validatedBody = value;
    next();
  };
};
```

#### Rate Limiting Implementation
```javascript
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');

const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    store: new RedisStore({
      client: redisClient,
      prefix: 'rl:'
    }),
    windowMs,
    max,
    message: {
      error: 'Too many requests',
      message,
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      return req.user?.userId || req.ip;
    }
  });
};

// Different rate limits for different endpoints
const authRateLimit = createRateLimiter(15 * 60 * 1000, 5, 'Too many authentication attempts');
const apiRateLimit = createRateLimiter(15 * 60 * 1000, 100, 'API rate limit exceeded');
const searchRateLimit = createRateLimiter(60 * 1000, 30, 'Search rate limit exceeded');
```

#### Encryption Service
```javascript
const crypto = require('crypto');

class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32;
    this.ivLength = 16;
    this.tagLength = 16;
  }

  encrypt(text, key) {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipher(this.algorithm, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex')
    };
  }

  decrypt(encryptedData, key) {
    const decipher = crypto.createDecipher(
      this.algorithm,
      key,
      Buffer.from(encryptedData.iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}
```

## Error Handling

### Global Error Handler
```javascript
class ErrorHandler {
  static handle(error, req, res, next) {
    const errorId = this.generateErrorId();
    
    // Log error with context
    logger.error('Request error', {
      errorId,
      error: error.message,
      stack: error.stack,
      url: req.url,
      method: req.method,
      userId: req.user?.userId,
      timestamp: new Date().toISOString()
    });

    // Handle specific error types
    if (error instanceof ValidationError) {
      return res.status(400).json({
        error: 'Validation failed',
        errorId,
        details: error.details
      });
    }

    if (error instanceof AuthenticationError) {
      return res.status(401).json({
        error: 'Authentication failed',
        errorId,
        message: error.message
      });
    }

    if (error instanceof ForbiddenError) {
      return res.status(403).json({
        error: 'Access denied',
        errorId,
        message: error.message
      });
    }

    if (error instanceof NotFoundError) {
      return res.status(404).json({
        error: 'Resource not found',
        errorId,
        message: error.message
      });
    }

    // Default server error
    res.status(500).json({
      error: 'Internal server error',
      errorId,
      message: 'An unexpected error occurred'
    });
  }

  static generateErrorId() {
    return crypto.randomBytes(8).toString('hex');
  }
}
```

### Circuit Breaker Implementation
```javascript
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000;
    this.monitoringPeriod = options.monitoringPeriod || 10000;
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
  }

  async execute(operation) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new CircuitBreakerOpenError('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.resetTimeout;
    }
  }
}
```

## Performance Optimization

### Caching Strategy
```javascript
class CacheService {
  constructor(redisClient) {
    this.redis = redisClient;
    this.defaultTTL = 3600; // 1 hour
  }

  async get(key) {
    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.warn('Cache get error', { key, error: error.message });
      return null;
    }
  }

  async set(key, value, ttl = this.defaultTTL) {
    try {
      await this.redis.setex(key, ttl, JSON.stringify(value));
    } catch (error) {
      logger.warn('Cache set error', { key, error: error.message });
    }
  }

  async del(key) {
    try {
      await this.redis.del(key);
    } catch (error) {
      logger.warn('Cache delete error', { key, error: error.message });
    }
  }

  // Cache patterns for different data types
  getUserCacheKey(userId) {
    return `user:${userId}`;
  }

  getProductCacheKey(productId) {
    return `product:${productId}`;
  }

  getSearchCacheKey(query, filters) {
    const filterHash = crypto
      .createHash('md5')
      .update(JSON.stringify(filters))
      .digest('hex');
    return `search:${query}:${filterHash}`;
  }
}
```

### Database Query Optimization
```javascript
class OptimizedRepository {
  constructor(db) {
    this.db = db;
  }

  // Use prepared statements for better performance
  async findUserById(userId) {
    const query = `
      SELECT u.*, p.first_name, p.last_name, p.phone
      FROM users u
      LEFT JOIN profiles p ON u.user_id = p.user_id
      WHERE u.user_id = $1 AND u.status = 'ACTIVE'
    `;
    
    const result = await this.db.query(query, [userId]);
    return result.rows[0];
  }

  // Batch operations for better performance
  async updateInventoryBatch(updates) {
    const query = `
      UPDATE inventory 
      SET quantity = data.quantity,
          reserved_qty = data.reserved_qty,
          last_updated = CURRENT_TIMESTAMP
      FROM (VALUES ${updates.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ')}) 
      AS data(product_id, quantity, reserved_qty)
      WHERE inventory.product_id = data.product_id::uuid
    `;
    
    const params = updates.flatMap(u => [u.productId, u.quantity, u.reservedQty]);
    await this.db.query(query, params);
  }

  // Pagination with cursor-based approach for large datasets
  async getProductsPaginated(cursor, limit = 20) {
    const query = `
      SELECT p.*, c.name as category_name
      FROM products p
      JOIN categories c ON p.category_id = c.category_id
      WHERE ($1::uuid IS NULL OR p.product_id > $1)
        AND p.is_active = true
      ORDER BY p.product_id
      LIMIT $2
    `;
    
    const result = await this.db.query(query, [cursor, limit]);
    return result.rows;
  }
}
```

## Testing Strategy

### Unit Tests
```javascript
const { AuthenticationService } = require('../services/AuthenticationService');
const { jest } = require('@jest/globals');

describe('AuthenticationService', () => {
  let authService;
  let mockJwtService;
  let mockBcryptService;
  let mockUserRepository;

  beforeEach(() => {
    mockJwtService = {
      sign: jest.fn(),
      verify: jest.fn()
    };
    
    mockBcryptService = {
      compare: jest.fn(),
      hash: jest.fn()
    };
    
    mockUserRepository = {
      findByEmail: jest.fn(),
      update: jest.fn()
    };

    authService = new AuthenticationService(
      mockJwtService,
      mockBcryptService,
      mockUserRepository
    );
  });

  describe('authenticate', () => {
    it('should authenticate valid user credentials', async () => {
      // Arrange
      const email = 'test@example.com';
      const password = 'validPassword123!';
      const user = {
        userId: 'user-123',
        email,
        password: 'hashedPassword',
        failedAttempts: 0,
        lockedUntil: null
      };

      mockUserRepository.findByEmail.mockResolvedValue(user);
      mockBcryptService.compare.mockResolvedValue(true);
      mockJwtService.sign.mockReturnValue('mock-token');

      // Act
      const result = await authService.authenticate(email, password);

      // Assert
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(email);
      expect(mockBcryptService.compare).toHaveBeenCalledWith(password, user.password);
    });

    it('should throw AuthenticationError for invalid credentials', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue(null);

      // Act & Assert
      await expect(
        authService.authenticate('invalid@example.com', 'password')
      ).rejects.toThrow('Invalid credentials');
    });

    it('should handle account lockout after max failed attempts', async () => {
      // Arrange
      const user = {
        userId: 'user-123',
        email: 'test@example.com',
        failedAttempts: 5,
        lockedUntil: new Date(Date.now() + 15 * 60 * 1000)
      };

      mockUserRepository.findByEmail.mockResolvedValue(user);

      // Act & Assert
      await expect(
        authService.authenticate('test@example.com', 'password')
      ).rejects.toThrow('Account temporarily locked');
    });
  });
});
```

### Integration Tests
```javascript
const request = require('supertest');
const app = require('../app');
const { setupTestDatabase, cleanupTestDatabase } = require('./helpers/database');

describe('Product API Integration Tests', () => {
  let authToken;
  let testUser;

  beforeAll(async () => {
    await setupTestDatabase();
    
    // Create test user and get auth token
    const userResponse = await request(app)
      .post('/auth/register')
      .send({
        email: 'test@example.com',
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'User'
      });

    testUser = userResponse.body;

    const loginResponse = await request(app)
      .post('/auth/login')
      .send({
        email: 'test@example.com',
        password: 'TestPassword123!'
      });

    authToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  describe('POST /products', () => {
    it('should create a new product', async () => {
      const productData = {
        name: 'Test Product',
        description: 'A test product',
        price: 29.99,
        sku: 'TEST-001',
        categoryId: 'category-123'
      };

      const response = await request(app)
        .post('/products')
        .set('Authorization', `Bearer ${authToken}`)
        .send(productData)
        .expect(201);

      expect(response.body).toHaveProperty('productId');
      expect(response.body.name).toBe(productData.name);
      expect(response.body.price).toBe(productData.price);
    });

    it('should return 400 for invalid product data', async () => {
      const invalidData = {
        name: '', // Invalid: empty name
        price: -10 // Invalid: negative price
      };

      const response = await request(app)
        .post('/products')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('GET /products/search', () => {
    beforeEach(async () => {
      // Create test products
      await request(app)
        .post('/products')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Laptop Computer',
          description: 'High performance laptop',
          price: 999.99,
          sku: 'LAPTOP-001',
          categoryId: 'electronics-123'
        });
    });

    it('should search products by name', async () => {
      const response = await request(app)
        .get('/products/search?q=laptop')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('products');
      expect(response.body.products).toHaveLength(1);
      expect(response.body.products[0].name).toContain('Laptop');
    });

    it('should filter products by price range', async () => {
      const response = await request(app)
        .get('/products/search?q=laptop&minPrice=500&maxPrice=1500')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.products).toHaveLength(1);
      expect(response.body.products[0].price).toBeGreaterThanOrEqual(500);
      expect(response.body.products[0].price).toBeLessThanOrEqual(1500);
    });
  });
});
```

### Load Testing
```javascript
// k6 load testing script
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export let options = {
  stages: [
    { duration: '2m', target: 100 }, // Ramp up to 100 users
    { duration: '5m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 200 }, // Ramp up to 200 users
    { duration: '5m', target: 200 }, // Stay at 200 users
    { duration: '2m', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    errors: ['rate<0.1'],             // Error rate under 10%
  },
};

const BASE_URL = 'https://api.example.com';

export function setup() {
  // Authenticate and get token
  const loginResponse = http.post(`${BASE_URL}/auth/login`, {
    email: 'loadtest@example.com',
    password: 'LoadTest123!'
  });
  
  return { token: loginResponse.json('accessToken') };
}

export default function(data) {
  const headers = {
    'Authorization': `Bearer ${data.token}`,
    'Content-Type': 'application/json'
  };

  // Test product search
  const searchResponse = http.get(
    `${BASE_URL}/products/search?q=laptop&page=1&limit=20`,
    { headers }
  );
  
  check(searchResponse, {
    'search status is 200': (r) => r.status === 200,
    'search response time < 500ms': (r) => r.timings.duration < 500,
    'search returns products': (r) => r.json('products').length > 0
  }) || errorRate.add(1);

  sleep(1);

  // Test order creation
  const orderData = {
    items: [
      {
        productId: 'product-123',
        quantity: 1,
        price: 999.99
      }
    ],
    shippingAddress: {
      street: '123 Test St',
      city: 'Test City',
      state: 'TS',
      zipCode: '12345',
      country: 'US'
    }
  };

  const orderResponse = http.post(
    `${BASE_URL}/orders`,
    JSON.stringify(orderData),
    { headers }
  );

  check(orderResponse, {
    'order status is 201': (r) => r.status === 201,
    'order response time < 1000ms': (r) => r.timings.duration < 1000,
    'order has ID': (r) => r.json('orderId') !== undefined
  }) || errorRate.add(1);

  sleep(2);
}
```

This comprehensive Low-Level Design document provides detailed implementation specifications, component designs, data flows, sequence diagrams, security implementations, error handling strategies, performance optimizations, and testing approaches for the DavTest09 e-commerce platform. The design ensures scalability, security, and maintainability while meeting all functional and non-functional requirements.