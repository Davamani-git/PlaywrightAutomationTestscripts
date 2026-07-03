# Low-Level Design Document - Online Shopping Platform

## 1. Component Specifications

### 1.1 User Management Service

#### 1.1.1 Class Structure
```javascript
class UserService {
  constructor(database, jwtService, bcryptService) {
    this.db = database;
    this.jwt = jwtService;
    this.bcrypt = bcryptService;
  }

  async registerUser(userData) {
    // Implementation details
  }

  async authenticateUser(credentials) {
    // Implementation details
  }

  async updateProfile(userId, profileData) {
    // Implementation details
  }

  async deleteUser(userId) {
    // Implementation details
  }
}

class User {
  constructor({
    userId = uuid.v4(),
    email,
    password,
    firstName,
    lastName,
    phoneNumber,
    address,
    role = 'CUSTOMER',
    isActive = true,
    createdAt = new Date(),
    lastLogin = null
  }) {
    this.userId = userId;
    this.email = email;
    this.password = password;
    this.firstName = firstName;
    this.lastName = lastName;
    this.phoneNumber = phoneNumber;
    this.address = address;
    this.role = role;
    this.isActive = isActive;
    this.createdAt = createdAt;
    this.lastLogin = lastLogin;
  }

  validateEmail() {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(this.email);
  }

  validatePassword() {
    // Password must be at least 8 characters with uppercase, lowercase, number, special char
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(this.password);
  }
}
```

#### 1.1.2 Database Schema
```sql
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20),
    address JSONB,
    role VARCHAR(20) DEFAULT 'CUSTOMER' CHECK (role IN ('CUSTOMER', 'SELLER', 'ADMIN')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(is_active);
```

#### 1.1.3 API Endpoints
```javascript
// POST /api/v1/users/register
app.post('/api/v1/users/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phoneNumber, address } = req.body;
    
    // Validation
    const user = new User({ email, password, firstName, lastName, phoneNumber, address });
    if (!user.validateEmail()) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (!user.validatePassword()) {
      return res.status(400).json({ error: 'Password does not meet requirements' });
    }
    
    const result = await userService.registerUser(user);
    res.status(201).json({ userId: result.userId, message: 'User registered successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/users/login
app.post('/api/v1/users/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await userService.authenticateUser({ email, password });
    res.json({ token: result.token, user: result.user });
  } catch (error) {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});
```

### 1.2 Product Catalog Service

#### 1.2.1 Class Structure
```javascript
class ProductService {
  constructor(database, elasticsearchClient, cacheService) {
    this.db = database;
    this.es = elasticsearchClient;
    this.cache = cacheService;
  }

  async createProduct(productData) {
    // Implementation with inventory management
  }

  async searchProducts(query, filters, pagination) {
    // Elasticsearch integration
  }

  async updateInventory(productId, quantity) {
    // Real-time inventory updates
  }

  async getProductById(productId) {
    // Cache-first retrieval
  }
}

class Product {
  constructor({
    productId = uuid.v4(),
    name,
    description,
    price,
    category,
    imageUrls = [],
    sellerId,
    inventory = 0,
    isActive = true,
    createdAt = new Date(),
    updatedAt = new Date()
  }) {
    this.productId = productId;
    this.name = name;
    this.description = description;
    this.price = price;
    this.category = category;
    this.imageUrls = imageUrls;
    this.sellerId = sellerId;
    this.inventory = inventory;
    this.isActive = isActive;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  validatePrice() {
    return this.price > 0 && Number.isFinite(this.price);
  }

  validateInventory() {
    return this.inventory >= 0 && Number.isInteger(this.inventory);
  }
}
```

#### 1.2.2 Database Schema
```sql
CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL CHECK (price > 0),
    category VARCHAR(100) NOT NULL,
    image_urls JSONB DEFAULT '[]',
    seller_id UUID NOT NULL REFERENCES users(user_id),
    inventory INTEGER NOT NULL DEFAULT 0 CHECK (inventory >= 0),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_seller ON products(seller_id);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_products_price ON products(price);
```

### 1.3 Order Management Service

#### 1.3.1 Class Structure
```javascript
class OrderService {
  constructor(database, paymentService, notificationService, inventoryService) {
    this.db = database;
    this.paymentService = paymentService;
    this.notificationService = notificationService;
    this.inventoryService = inventoryService;
  }

  async createOrder(orderData) {
    // Saga pattern implementation
    const transaction = await this.db.beginTransaction();
    try {
      const order = await this.processOrder(orderData, transaction);
      await this.reserveInventory(order.items, transaction);
      await this.processPayment(order, transaction);
      await transaction.commit();
      return order;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async updateOrderStatus(orderId, status) {
    // Status transition validation
  }

  async cancelOrder(orderId, reason) {
    // Cancellation workflow with refund
  }
}

class Order {
  constructor({
    orderId = uuid.v4(),
    userId,
    totalAmount,
    status = 'PENDING',
    createdAt = new Date(),
    updatedAt = new Date(),
    shippingAddress,
    paymentMethod,
    trackingNumber = null
  }) {
    this.orderId = orderId;
    this.userId = userId;
    this.totalAmount = totalAmount;
    this.status = status;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.shippingAddress = shippingAddress;
    this.paymentMethod = paymentMethod;
    this.trackingNumber = trackingNumber;
  }

  validateStatusTransition(newStatus) {
    const validTransitions = {
      'PENDING': ['CONFIRMED', 'CANCELLED'],
      'CONFIRMED': ['PROCESSING', 'CANCELLED'],
      'PROCESSING': ['SHIPPED', 'CANCELLED'],
      'SHIPPED': ['DELIVERED'],
      'DELIVERED': ['RETURNED'],
      'CANCELLED': [],
      'RETURNED': []
    };
    return validTransitions[this.status].includes(newStatus);
  }
}
```

#### 1.3.2 Database Schema
```sql
CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id),
    total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount > 0),
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    shipping_address JSONB NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    tracking_number VARCHAR(100)
);

CREATE TABLE order_items (
    order_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(product_id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price > 0),
    total_price DECIMAL(10,2) NOT NULL CHECK (total_price > 0)
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_order_items_order ON order_items(order_id);
```

### 1.4 Payment Processing Service

#### 1.4.1 Class Structure
```javascript
class PaymentService {
  constructor(stripeClient, paypalClient, database) {
    this.stripe = stripeClient;
    this.paypal = paypalClient;
    this.db = database;
  }

  async processPayment(paymentData) {
    const { method, amount, orderId, paymentDetails } = paymentData;
    
    try {
      let result;
      switch (method) {
        case 'STRIPE':
          result = await this.processStripePayment(amount, paymentDetails);
          break;
        case 'PAYPAL':
          result = await this.processPayPalPayment(amount, paymentDetails);
          break;
        default:
          throw new Error('Unsupported payment method');
      }
      
      await this.recordPayment({
        orderId,
        amount,
        method,
        transactionId: result.transactionId,
        status: 'COMPLETED'
      });
      
      return result;
    } catch (error) {
      await this.recordPayment({
        orderId,
        amount,
        method,
        status: 'FAILED',
        errorMessage: error.message
      });
      throw error;
    }
  }

  async processRefund(paymentId, amount, reason) {
    // Refund processing with audit trail
  }
}

class Payment {
  constructor({
    paymentId = uuid.v4(),
    orderId,
    amount,
    paymentMethod,
    status = 'PENDING',
    transactionId = null,
    processedAt = null
  }) {
    this.paymentId = paymentId;
    this.orderId = orderId;
    this.amount = amount;
    this.paymentMethod = paymentMethod;
    this.status = status;
    this.transactionId = transactionId;
    this.processedAt = processedAt;
  }
}
```

#### 1.4.2 Database Schema
```sql
CREATE TABLE payments (
    payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(order_id),
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED')),
    transaction_id VARCHAR(255),
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    error_message TEXT
);

CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_status ON payments(status);
```

### 1.5 Shopping Cart Service

#### 1.5.1 Class Structure
```javascript
class CartService {
  constructor(redisClient, database) {
    this.redis = redisClient;
    this.db = database;
  }

  async addToCart(userId, productId, quantity) {
    const cartKey = `cart:${userId}`;
    const cartItem = { productId, quantity, addedAt: new Date() };
    
    await this.redis.hset(cartKey, productId, JSON.stringify(cartItem));
    await this.redis.expire(cartKey, 86400 * 7); // 7 days expiry
    
    return await this.getCart(userId);
  }

  async removeFromCart(userId, productId) {
    const cartKey = `cart:${userId}`;
    await this.redis.hdel(cartKey, productId);
    return await this.getCart(userId);
  }

  async getCart(userId) {
    const cartKey = `cart:${userId}`;
    const cartData = await this.redis.hgetall(cartKey);
    
    const items = Object.entries(cartData).map(([productId, itemData]) => {
      const item = JSON.parse(itemData);
      return { productId, ...item };
    });
    
    return { userId, items, totalItems: items.length };
  }

  async clearCart(userId) {
    const cartKey = `cart:${userId}`;
    await this.redis.del(cartKey);
  }
}
```

## 2. Data Flow Diagrams

### 2.1 User Registration Flow
```
User → API Gateway → User Service → Database
  ↓         ↓            ↓           ↓
Validation → Rate Limit → Hash Password → Store User
  ↓         ↓            ↓           ↓
Response ← JWT Token ← Success ← Audit Log
```

### 2.2 Order Processing Flow
```
User → Cart Service → Order Service → Payment Service
  ↓        ↓             ↓              ↓
Add Items → Validate → Create Order → Process Payment
  ↓        ↓             ↓              ↓
Checkout → Calculate → Reserve Inventory → Update Status
  ↓        ↓             ↓              ↓
Confirm ← Notification ← Fulfill Order ← Success Response
```

### 2.3 Product Search Flow
```
User → API Gateway → Product Service → Elasticsearch
  ↓        ↓             ↓               ↓
Search → Cache Check → Query Builder → Search Index
  ↓        ↓             ↓               ↓
Results ← Cache Store ← Format Results ← Ranked Results
```

## 3. Sequence Diagrams

### 3.1 User Authentication Sequence
```
User          API Gateway    User Service    Database    JWT Service
 |                |              |            |           |
 |--POST /login-->|              |            |           |
 |                |--validate--->|            |           |
 |                |              |--query---->|           |
 |                |              |<--user-----|           |
 |                |              |--verify--->|           |
 |                |              |<--valid----|           |
 |                |              |--generate->|           |
 |                |              |<--token----|           |
 |                |<--response---|            |           |
 |<--JWT token----|              |            |           |
```

### 3.2 Order Creation Sequence
```
User     Order Service   Payment Service   Inventory Service   Notification Service
 |            |               |                 |                    |
 |--create--->|               |                 |                    |
 |            |--validate---->|                 |                    |
 |            |<--valid-------|                 |                    |
 |            |--reserve----->|                 |                    |
 |            |<--reserved----|                 |                    |
 |            |--process----->|                 |                    |
 |            |<--success-----|                 |                    |
 |            |--confirm----->|                 |                    |
 |            |--notify------>|                 |                    |
 |<--order----|               |                 |                    |
```

## 4. Implementation Details

### 4.1 Security Implementation

#### 4.1.1 JWT Token Management
```javascript
class JWTService {
  constructor(secretKey, expirationTime = '24h') {
    this.secretKey = secretKey;
    this.expirationTime = expirationTime;
  }

  generateToken(payload) {
    return jwt.sign(payload, this.secretKey, {
      expiresIn: this.expirationTime,
      issuer: 'shopping-platform',
      audience: 'shopping-platform-users'
    });
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, this.secretKey);
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  refreshToken(token) {
    const decoded = this.verifyToken(token);
    delete decoded.iat;
    delete decoded.exp;
    return this.generateToken(decoded);
  }
}
```

#### 4.1.2 Input Validation Middleware
```javascript
const validateInput = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(detail => detail.message)
      });
    }
    next();
  };
};

const userRegistrationSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/).required(),
  firstName: Joi.string().min(2).max(50).required(),
  lastName: Joi.string().min(2).max(50).required(),
  phoneNumber: Joi.string().pattern(/^[+]?[1-9]\d{1,14}$/),
  address: Joi.object({
    street: Joi.string().required(),
    city: Joi.string().required(),
    state: Joi.string().required(),
    zipCode: Joi.string().required(),
    country: Joi.string().required()
  }).required()
});
```

### 4.2 Error Handling Implementation

#### 4.2.1 Circuit Breaker Pattern
```javascript
class CircuitBreaker {
  constructor(service, options = {}) {
    this.service = service;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000;
    this.monitoringPeriod = options.monitoringPeriod || 10000;
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
  }

  async execute(operation, ...args) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation.apply(this.service, args);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 3) {
        this.state = 'CLOSED';
      }
    }
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
}
```

#### 4.2.2 Retry Mechanism with Exponential Backoff
```javascript
class RetryHandler {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 10000;
    this.backoffFactor = options.backoffFactor || 2;
  }

  async execute(operation, ...args) {
    let lastError;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation(...args);
      } catch (error) {
        lastError = error;
        
        if (attempt === this.maxRetries) {
          throw error;
        }
        
        if (!this.isRetryableError(error)) {
          throw error;
        }
        
        const delay = Math.min(
          this.baseDelay * Math.pow(this.backoffFactor, attempt),
          this.maxDelay
        );
        
        await this.sleep(delay + Math.random() * 1000); // Add jitter
      }
    }
    
    throw lastError;
  }

  isRetryableError(error) {
    // Define which errors are retryable
    const retryableStatusCodes = [408, 429, 500, 502, 503, 504];
    return retryableStatusCodes.includes(error.status) || error.code === 'ECONNRESET';
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 4.3 Database Implementation

#### 4.3.1 Connection Pool Management
```javascript
const { Pool } = require('pg');

class DatabaseManager {
  constructor(config) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: 20, // Maximum number of connections
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }

  async query(text, params) {
    const start = Date.now();
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(text, params);
      const duration = Date.now() - start;
      console.log('Executed query', { text, duration, rows: result.rowCount });
      return result;
    } finally {
      client.release();
    }
  }

  async transaction(callback) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
```

### 4.4 Caching Implementation

#### 4.4.1 Redis Cache Service
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
      console.error('Cache get error:', error);
      return null;
    }
  }

  async set(key, value, ttl = this.defaultTTL) {
    try {
      await this.redis.setex(key, ttl, JSON.stringify(value));
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  async del(key) {
    try {
      await this.redis.del(key);
    } catch (error) {
      console.error('Cache delete error:', error);
    }
  }

  async getOrSet(key, fetchFunction, ttl = this.defaultTTL) {
    let value = await this.get(key);
    
    if (value === null) {
      value = await fetchFunction();
      await this.set(key, value, ttl);
    }
    
    return value;
  }
}
```

## 5. API Documentation

### 5.1 User Management APIs

#### POST /api/v1/users/register
**Description**: Register a new user

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "+1234567890",
  "address": {
    "street": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zipCode": "10001",
    "country": "USA"
  }
}
```

**Response**:
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "User registered successfully"
}
```

#### POST /api/v1/users/login
**Description**: Authenticate user and return JWT token

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "CUSTOMER"
  }
}
```

### 5.2 Product Management APIs

#### GET /api/v1/products/search
**Description**: Search products with filters and pagination

**Query Parameters**:
- `q`: Search query
- `category`: Product category
- `minPrice`: Minimum price
- `maxPrice`: Maximum price
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)

**Response**:
```json
{
  "products": [
    {
      "productId": "550e8400-e29b-41d4-a716-446655440001",
      "name": "Product Name",
      "description": "Product description",
      "price": 29.99,
      "category": "Electronics",
      "imageUrls": ["https://example.com/image1.jpg"],
      "inventory": 100,
      "sellerId": "550e8400-e29b-41d4-a716-446655440002"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

### 5.3 Order Management APIs

#### POST /api/v1/orders
**Description**: Create a new order

**Request Body**:
```json
{
  "items": [
    {
      "productId": "550e8400-e29b-41d4-a716-446655440001",
      "quantity": 2
    }
  ],
  "shippingAddress": {
    "street": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zipCode": "10001",
    "country": "USA"
  },
  "paymentMethod": "STRIPE",
  "paymentDetails": {
    "cardToken": "tok_1234567890"
  }
}
```

**Response**:
```json
{
  "orderId": "550e8400-e29b-41d4-a716-446655440003",
  "status": "CONFIRMED",
  "totalAmount": 59.98,
  "estimatedDelivery": "2024-01-15T10:00:00Z"
}
```

## 6. Testing Strategy

### 6.1 Unit Testing
```javascript
// Example unit test for User class
describe('User', () => {
  describe('validateEmail', () => {
    it('should return true for valid email', () => {
      const user = new User({ email: 'test@example.com' });
      expect(user.validateEmail()).toBe(true);
    });

    it('should return false for invalid email', () => {
      const user = new User({ email: 'invalid-email' });
      expect(user.validateEmail()).toBe(false);
    });
  });

  describe('validatePassword', () => {
    it('should return true for strong password', () => {
      const user = new User({ password: 'StrongPass123!' });
      expect(user.validatePassword()).toBe(true);
    });

    it('should return false for weak password', () => {
      const user = new User({ password: 'weak' });
      expect(user.validatePassword()).toBe(false);
    });
  });
});
```

### 6.2 Integration Testing
```javascript
// Example integration test for User Service
describe('UserService Integration', () => {
  let userService;
  let testDatabase;

  beforeAll(async () => {
    testDatabase = await setupTestDatabase();
    userService = new UserService(testDatabase, new JWTService('test-secret'), bcrypt);
  });

  afterAll(async () => {
    await teardownTestDatabase(testDatabase);
  });

  describe('registerUser', () => {
    it('should create user and return userId', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'TestPass123!',
        firstName: 'Test',
        lastName: 'User'
      };

      const result = await userService.registerUser(userData);
      expect(result.userId).toBeDefined();
      expect(result.email).toBe(userData.email);
    });

    it('should throw error for duplicate email', async () => {
      const userData = {
        email: 'duplicate@example.com',
        password: 'TestPass123!',
        firstName: 'Test',
        lastName: 'User'
      };

      await userService.registerUser(userData);
      await expect(userService.registerUser(userData)).rejects.toThrow('Email already exists');
    });
  });
});
```

## 7. Performance Optimization

### 7.1 Database Optimization
- **Indexing Strategy**: Create indexes on frequently queried columns
- **Query Optimization**: Use EXPLAIN ANALYZE to optimize slow queries
- **Connection Pooling**: Implement connection pooling to manage database connections
- **Read Replicas**: Use read replicas for read-heavy operations

### 7.2 Caching Strategy
- **Application-Level Caching**: Cache frequently accessed data in Redis
- **CDN Integration**: Use CDN for static assets and product images
- **Query Result Caching**: Cache expensive query results
- **Session Caching**: Store user sessions in Redis

### 7.3 API Performance
- **Response Compression**: Enable gzip compression for API responses
- **Pagination**: Implement cursor-based pagination for large datasets
- **Field Selection**: Allow clients to specify required fields
- **Rate Limiting**: Implement rate limiting to prevent abuse

## 8. Monitoring and Observability

### 8.1 Logging Implementation
```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'shopping-platform' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Usage example
logger.info('User registered', { userId: user.userId, email: user.email });
logger.error('Payment failed', { orderId, error: error.message });
```

### 8.2 Metrics Collection
```javascript
const promClient = require('prom-client');

// Create metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status']
});

const activeUsers = new promClient.Gauge({
  name: 'active_users_total',
  help: 'Total number of active users'
});

// Middleware to collect metrics
const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.route?.path || req.path, res.statusCode)
      .observe(duration);
  });
  
  next();
};
```

## 9. Security Implementation Details

### 9.1 Data Encryption
```javascript
const crypto = require('crypto');

class EncryptionService {
  constructor(secretKey) {
    this.algorithm = 'aes-256-gcm';
    this.secretKey = crypto.scryptSync(secretKey, 'salt', 32);
  }

  encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(this.algorithm, this.secretKey, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  decrypt(encryptedData) {
    const { encrypted, iv, authTag } = encryptedData;
    const decipher = crypto.createDecipher(
      this.algorithm,
      this.secretKey,
      Buffer.from(iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}
```

### 9.2 Audit Logging
```javascript
class AuditLogger {
  constructor(database) {
    this.db = database;
  }

  async logActivity({
    userId,
    action,
    entityType,
    entityId,
    ipAddress,
    userAgent,
    metadata = {}
  }) {
    const logEntry = {
      logId: uuid.v4(),
      userId,
      action,
      entityType,
      entityId,
      ipAddress,
      userAgent,
      metadata: JSON.stringify(metadata),
      timestamp: new Date()
    };

    await this.db.query(
      `INSERT INTO audit_logs (log_id, user_id, action, entity_type, entity_id, 
       ip_address, user_agent, metadata, timestamp) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      Object.values(logEntry)
    );
  }
}

// Usage middleware
const auditMiddleware = (auditLogger) => {
  return (req, res, next) => {
    res.on('finish', async () => {
      if (req.user && ['POST', 'PUT', 'DELETE'].includes(req.method)) {
        await auditLogger.logActivity({
          userId: req.user.userId,
          action: `${req.method} ${req.path}`,
          entityType: req.path.split('/')[3] || 'unknown',
          entityId: req.params.id || null,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          metadata: { body: req.body, query: req.query }
        });
      }
    });
    next();
  };
};
```

This comprehensive Low-Level Design document provides detailed implementation specifications for all components of the Online Shopping Platform, ensuring secure, scalable, and maintainable code architecture.