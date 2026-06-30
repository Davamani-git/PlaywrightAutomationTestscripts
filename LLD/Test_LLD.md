# Low-Level Design Document

## Online Shopping Platform - Detailed Implementation Specifications

### 1. Component Architecture

#### 1.1 User Service Implementation

**Class Structure:**
```javascript
class UserService {
  constructor(database, jwtService, encryptionService) {
    this.db = database;
    this.jwt = jwtService;
    this.encryption = encryptionService;
  }

  async registerUser(userData) {
    // Input validation
    const validationResult = this.validateUserInput(userData);
    if (!validationResult.isValid) {
      throw new ValidationError(validationResult.errors);
    }

    // Check for existing user
    const existingUser = await this.db.User.findOne({
      where: { email: userData.email }
    });
    if (existingUser) {
      throw new ConflictError('User already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(userData.password, 12);
    
    // Create user with transaction
    const transaction = await this.db.sequelize.transaction();
    try {
      const user = await this.db.User.create({
        userId: uuidv4(),
        email: userData.email,
        passwordHash,
        isActive: true,
        createdAt: new Date()
      }, { transaction });

      // Create default profile
      await this.db.Profile.create({
        profileId: uuidv4(),
        userId: user.userId,
        firstName: userData.firstName,
        lastName: userData.lastName,
        phoneNumber: userData.phoneNumber
      }, { transaction });

      // Assign default role
      await this.db.UserRole.create({
        userId: user.userId,
        roleId: 'CONSUMER_ROLE_ID'
      }, { transaction });

      await transaction.commit();
      
      // Log audit event
      await this.auditLogger.logAction(
        user.userId, 
        'USER_REGISTERED', 
        'User', 
        user.userId, 
        { email: userData.email }
      );

      return this.sanitizeUserData(user);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async authenticateUser(email, password) {
    const user = await this.db.User.findOne({
      where: { email, isActive: true },
      include: [{
        model: this.db.Role,
        through: { attributes: [] }
      }]
    });

    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Generate JWT tokens
    const accessToken = this.jwt.generateAccessToken({
      userId: user.userId,
      email: user.email,
      roles: user.Roles.map(role => role.roleName)
    });

    const refreshToken = this.jwt.generateRefreshToken({
      userId: user.userId
    });

    // Update last login
    await user.update({ lastLogin: new Date() });

    // Log audit event
    await this.auditLogger.logAction(
      user.userId, 
      'USER_LOGIN', 
      'User', 
      user.userId, 
      { loginTime: new Date() }
    );

    return {
      user: this.sanitizeUserData(user),
      accessToken,
      refreshToken
    };
  }

  validateUserInput(userData) {
    const schema = Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).required(),
      firstName: Joi.string().min(2).max(50).required(),
      lastName: Joi.string().min(2).max(50).required(),
      phoneNumber: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required()
    });

    const { error } = schema.validate(userData);
    return {
      isValid: !error,
      errors: error ? error.details.map(d => d.message) : []
    };
  }

  sanitizeUserData(user) {
    const { passwordHash, ...sanitizedUser } = user.toJSON();
    return sanitizedUser;
  }
}
```

**Database Schema:**
```sql
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP NULL
);

CREATE TABLE profiles (
    profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20),
    address JSONB,
    preferences JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE roles (
    role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_name VARCHAR(50) UNIQUE NOT NULL,
    permissions JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true
);

CREATE TABLE user_roles (
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(role_id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_id)
);
```

#### 1.2 Product Service Implementation

**Class Structure:**
```javascript
class ProductService {
  constructor(database, searchEngine, cacheService) {
    this.db = database;
    this.search = searchEngine;
    this.cache = cacheService;
  }

  async createProduct(productData, sellerId) {
    // Validate seller permissions
    await this.validateSellerPermissions(sellerId);
    
    // Input validation
    const validationResult = this.validateProductInput(productData);
    if (!validationResult.isValid) {
      throw new ValidationError(validationResult.errors);
    }

    const transaction = await this.db.sequelize.transaction();
    try {
      // Create product
      const product = await this.db.Product.create({
        productId: uuidv4(),
        name: productData.name,
        description: productData.description,
        price: new Decimal(productData.price),
        sellerId,
        categoryId: productData.categoryId,
        images: productData.images || [],
        isActive: true,
        createdAt: new Date()
      }, { transaction });

      // Create inventory record
      await this.db.Inventory.create({
        inventoryId: uuidv4(),
        productId: product.productId,
        quantity: productData.initialQuantity || 0,
        reservedQty: 0,
        lowStockThreshold: productData.lowStockThreshold || 10,
        lastUpdated: new Date()
      }, { transaction });

      await transaction.commit();

      // Index in search engine
      await this.indexProductForSearch(product);

      // Clear cache
      await this.cache.del(`products:category:${productData.categoryId}`);

      // Log audit event
      await this.auditLogger.logAction(
        sellerId,
        'PRODUCT_CREATED',
        'Product',
        product.productId,
        productData
      );

      return product;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async searchProducts(searchParams) {
    const {
      query,
      category,
      minPrice,
      maxPrice,
      sortBy = 'relevance',
      page = 1,
      limit = 20
    } = searchParams;

    // Build Elasticsearch query
    const searchQuery = {
      index: 'products',
      body: {
        query: {
          bool: {
            must: [],
            filter: []
          }
        },
        sort: this.buildSortQuery(sortBy),
        from: (page - 1) * limit,
        size: limit
      }
    };

    // Add text search
    if (query) {
      searchQuery.body.query.bool.must.push({
        multi_match: {
          query,
          fields: ['name^3', 'description^2', 'category.name'],
          fuzziness: 'AUTO'
        }
      });
    }

    // Add filters
    if (category) {
      searchQuery.body.query.bool.filter.push({
        term: { 'category.id': category }
      });
    }

    if (minPrice || maxPrice) {
      const priceRange = {};
      if (minPrice) priceRange.gte = minPrice;
      if (maxPrice) priceRange.lte = maxPrice;
      
      searchQuery.body.query.bool.filter.push({
        range: { price: priceRange }
      });
    }

    // Add active product filter
    searchQuery.body.query.bool.filter.push({
      term: { isActive: true }
    });

    const result = await this.search.search(searchQuery);
    
    return {
      products: result.body.hits.hits.map(hit => hit._source),
      total: result.body.hits.total.value,
      page,
      totalPages: Math.ceil(result.body.hits.total.value / limit)
    };
  }

  async indexProductForSearch(product) {
    const category = await this.db.Category.findByPk(product.categoryId);
    
    await this.search.index({
      index: 'products',
      id: product.productId,
      body: {
        productId: product.productId,
        name: product.name,
        description: product.description,
        price: product.price,
        category: {
          id: category.categoryId,
          name: category.name
        },
        sellerId: product.sellerId,
        isActive: product.isActive,
        createdAt: product.createdAt
      }
    });
  }

  buildSortQuery(sortBy) {
    const sortOptions = {
      relevance: [{ _score: { order: 'desc' } }],
      price_asc: [{ price: { order: 'asc' } }],
      price_desc: [{ price: { order: 'desc' } }],
      newest: [{ createdAt: { order: 'desc' } }],
      oldest: [{ createdAt: { order: 'asc' } }]
    };

    return sortOptions[sortBy] || sortOptions.relevance;
  }

  validateProductInput(productData) {
    const schema = Joi.object({
      name: Joi.string().min(3).max(200).required(),
      description: Joi.string().min(10).max(2000).required(),
      price: Joi.number().positive().precision(2).required(),
      categoryId: Joi.string().uuid().required(),
      images: Joi.array().items(Joi.string().uri()).max(10),
      initialQuantity: Joi.number().integer().min(0),
      lowStockThreshold: Joi.number().integer().min(1)
    });

    const { error } = schema.validate(productData);
    return {
      isValid: !error,
      errors: error ? error.details.map(d => d.message) : []
    };
  }
}
```

**Database Schema:**
```sql
CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    seller_id UUID REFERENCES users(user_id),
    category_id UUID REFERENCES categories(category_id),
    images JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
    category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    parent_category_id UUID REFERENCES categories(category_id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE inventory (
    inventory_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(product_id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0,
    reserved_qty INTEGER NOT NULL DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 10,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 1.3 Order Service Implementation

**Class Structure:**
```javascript
class OrderService {
  constructor(database, paymentService, inventoryService, notificationService) {
    this.db = database;
    this.paymentService = paymentService;
    this.inventoryService = inventoryService;
    this.notificationService = notificationService;
  }

  async createOrder(userId, orderData) {
    const transaction = await this.db.sequelize.transaction();
    try {
      // Validate cart items and calculate total
      const { validatedItems, totalAmount } = await this.validateCartItems(orderData.items);
      
      // Reserve inventory
      await this.reserveInventory(validatedItems, transaction);

      // Create order
      const order = await this.db.Order.create({
        orderId: uuidv4(),
        userId,
        totalAmount,
        status: 'PENDING',
        shippingAddress: orderData.shippingAddress,
        createdAt: new Date()
      }, { transaction });

      // Create order items
      const orderItems = await Promise.all(
        validatedItems.map(item => 
          this.db.OrderItem.create({
            orderItemId: uuidv4(),
            orderId: order.orderId,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.quantity * item.unitPrice
          }, { transaction })
        )
      );

      await transaction.commit();

      // Process payment asynchronously
      this.processPaymentAsync(order.orderId, orderData.paymentDetails);

      // Send order confirmation
      await this.notificationService.sendOrderConfirmation(userId, order);

      // Log audit event
      await this.auditLogger.logAction(
        userId,
        'ORDER_CREATED',
        'Order',
        order.orderId,
        { totalAmount, itemCount: validatedItems.length }
      );

      return { ...order.toJSON(), items: orderItems };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async validateCartItems(items) {
    const validatedItems = [];
    let totalAmount = new Decimal(0);

    for (const item of items) {
      const product = await this.db.Product.findOne({
        where: { productId: item.productId, isActive: true },
        include: [{ model: this.db.Inventory }]
      });

      if (!product) {
        throw new ValidationError(`Product ${item.productId} not found or inactive`);
      }

      if (product.Inventory.quantity < item.quantity) {
        throw new ValidationError(`Insufficient inventory for product ${product.name}`);
      }

      const itemTotal = new Decimal(product.price).mul(item.quantity);
      totalAmount = totalAmount.add(itemTotal);

      validatedItems.push({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: product.price,
        name: product.name
      });
    }

    return { validatedItems, totalAmount };
  }

  async reserveInventory(items, transaction) {
    for (const item of items) {
      await this.db.Inventory.update(
        {
          reservedQty: this.db.sequelize.literal(`reserved_qty + ${item.quantity}`)
        },
        {
          where: { productId: item.productId },
          transaction
        }
      );
    }
  }

  async processPaymentAsync(orderId, paymentDetails) {
    try {
      const order = await this.db.Order.findByPk(orderId);
      
      const paymentResult = await this.paymentService.processPayment({
        orderId,
        amount: order.totalAmount,
        paymentMethod: paymentDetails.method,
        cardToken: paymentDetails.cardToken
      });

      if (paymentResult.success) {
        await this.updateOrderStatus(orderId, 'CONFIRMED');
        await this.confirmInventoryReservation(orderId);
      } else {
        await this.updateOrderStatus(orderId, 'PAYMENT_FAILED');
        await this.releaseInventoryReservation(orderId);
      }
    } catch (error) {
      console.error('Payment processing failed:', error);
      await this.updateOrderStatus(orderId, 'PAYMENT_FAILED');
      await this.releaseInventoryReservation(orderId);
    }
  }

  async updateOrderStatus(orderId, newStatus) {
    const order = await this.db.Order.findByPk(orderId);
    const oldStatus = order.status;
    
    await order.update({ 
      status: newStatus, 
      updatedAt: new Date() 
    });

    // Send status update notification
    await this.notificationService.sendOrderStatusUpdate(
      order.userId, 
      orderId, 
      newStatus
    );

    // Log audit event
    await this.auditLogger.logAction(
      order.userId,
      'ORDER_STATUS_UPDATED',
      'Order',
      orderId,
      { oldStatus, newStatus }
    );
  }
}
```

**Database Schema:**
```sql
CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id),
    total_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    shipping_address JSONB NOT NULL,
    payment_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
    order_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(product_id),
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL
);

CREATE TABLE shopping_carts (
    cart_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    items JSONB DEFAULT '[]',
    total_amount DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2. Data Flow Diagrams

#### 2.1 User Registration Flow
```
Client Request → API Gateway → User Service
     ↓              ↓            ↓
Validation → Rate Limiting → Input Validation
     ↓              ↓            ↓
Password Hash ← JWT Token ← Database Transaction
     ↓              ↓            ↓
Profile Creation → Audit Log → Email Verification
     ↓              ↓            ↓
Response ← Success Response ← Notification Service
```

#### 2.2 Product Search Flow
```
Search Query → API Gateway → Product Service
     ↓              ↓            ↓
Cache Check → Authentication → Query Building
     ↓              ↓            ↓
Elasticsearch ← Authorization ← Result Filtering
     ↓              ↓            ↓
Result Caching → Response Format → Client Response
```

#### 2.3 Order Processing Flow
```
Order Request → API Gateway → Order Service
     ↓              ↓            ↓
Cart Validation → User Auth → Inventory Check
     ↓              ↓            ↓
Inventory Reserve → Order Creation → Payment Service
     ↓              ↓            ↓
Payment Processing → Status Update → Notification Service
     ↓              ↓            ↓
Order Confirmation → Audit Log → Email/SMS Alert
```

### 3. Sequence Diagrams

#### 3.1 Complete Order Processing Sequence
```
User → Frontend → API Gateway → Order Service → Payment Service → Notification Service
  |       |           |             |              |                |
  |-------|-----------|-------------|--------------|----------------|
  | Place Order       |             |              |                |
  |       |---------->|             |              |                |
  |       |           |------------>|              |                |
  |       |           |             |---Validate-->|                |
  |       |           |             |<--Items------|                |
  |       |           |             |              |                |
  |       |           |             |---Reserve--->|                |
  |       |           |             |<--Inventory--|                |
  |       |           |             |              |                |
  |       |           |             |---Create---->|                |
  |       |           |             |<--Order------|                |
  |       |           |             |              |                |
  |       |           |             |------------->|---Process----->|
  |       |           |             |              |<--Payment------|  
  |       |           |             |<-------------|                |
  |       |           |             |              |                |
  |       |           |             |---Update---->|                |
  |       |           |             |<--Status-----|                |
  |       |           |             |              |                |
  |       |           |             |---Send------>|---Notification>|
  |       |           |<------------|              |                |
  |       |<----------|             |              |                |
  |<------|           |             |              |                |
```

### 4. Security Implementation Details

#### 4.1 Authentication & Authorization

**JWT Token Implementation:**
```javascript
class JWTService {
  constructor(secretKey, refreshSecretKey) {
    this.accessTokenSecret = secretKey;
    this.refreshTokenSecret = refreshSecretKey;
    this.accessTokenExpiry = '15m';
    this.refreshTokenExpiry = '7d';
  }

  generateAccessToken(payload) {
    return jwt.sign(
      {
        ...payload,
        type: 'access',
        iat: Math.floor(Date.now() / 1000)
      },
      this.accessTokenSecret,
      { expiresIn: this.accessTokenExpiry }
    );
  }

  generateRefreshToken(payload) {
    return jwt.sign(
      {
        userId: payload.userId,
        type: 'refresh',
        iat: Math.floor(Date.now() / 1000)
      },
      this.refreshTokenSecret,
      { expiresIn: this.refreshTokenExpiry }
    );
  }

  verifyAccessToken(token) {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret);
      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }
      return decoded;
    } catch (error) {
      throw new UnauthorizedError('Invalid or expired token');
    }
  }

  refreshAccessToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, this.refreshTokenSecret);
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid refresh token');
      }

      // Generate new access token
      return this.generateAccessToken({
        userId: decoded.userId
      });
    } catch (error) {
      throw new UnauthorizedError('Invalid refresh token');
    }
  }
}
```

**RBAC Middleware:**
```javascript
class RBACMiddleware {
  static authorize(requiredPermission) {
    return async (req, res, next) => {
      try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwtService.verifyAccessToken(token);
        
        // Fetch user with roles
        const user = await db.User.findByPk(decoded.userId, {
          include: [{
            model: db.Role,
            through: { attributes: [] }
          }]
        });

        if (!user || !user.isActive) {
          return res.status(401).json({ error: 'User not found or inactive' });
        }

        // Check permissions
        const userPermissions = user.Roles.reduce((acc, role) => {
          return acc.concat(role.permissions);
        }, []);

        if (!userPermissions.includes(requiredPermission)) {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }

        req.user = user;
        next();
      } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
      }
    };
  }

  static requireRole(requiredRole) {
    return async (req, res, next) => {
      const userRoles = req.user.Roles.map(role => role.roleName);
      
      if (!userRoles.includes(requiredRole)) {
        return res.status(403).json({ error: 'Insufficient role' });
      }
      
      next();
    };
  }
}
```

#### 4.2 Data Encryption

**Encryption Service:**
```javascript
class EncryptionService {
  constructor(encryptionKey) {
    this.algorithm = 'aes-256-gcm';
    this.key = Buffer.from(encryptionKey, 'hex');
  }

  encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(this.algorithm, this.key);
    cipher.setAAD(Buffer.from('additional-data'));
    
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
    const decipher = crypto.createDecipher(this.algorithm, this.key);
    decipher.setAAD(Buffer.from('additional-data'));
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  hashPassword(password, saltRounds = 12) {
    return bcrypt.hash(password, saltRounds);
  }

  verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
  }
}
```

#### 4.3 Input Validation & Sanitization

**Comprehensive Validation Middleware:**
```javascript
class ValidationMiddleware {
  static validateRequest(schema, source = 'body') {
    return (req, res, next) => {
      const data = req[source];
      const { error, value } = schema.validate(data, {
        abortEarly: false,
        stripUnknown: true
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

      req[source] = value;
      next();
    };
  }

  static sanitizeOutput(data) {
    if (typeof data === 'string') {
      return DOMPurify.sanitize(data, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: []
      });
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeOutput(item));
    }

    if (typeof data === 'object' && data !== null) {
      const sanitized = {};
      for (const [key, value] of Object.entries(data)) {
        sanitized[key] = this.sanitizeOutput(value);
      }
      return sanitized;
    }

    return data;
  }
}
```

### 5. Performance Optimization

#### 5.1 Caching Strategy

**Redis Caching Implementation:**
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

  async invalidatePattern(pattern) {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      console.error('Cache invalidation error:', error);
    }
  }

  // Cache decorator for methods
  static cached(keyGenerator, ttl = 3600) {
    return function(target, propertyName, descriptor) {
      const method = descriptor.value;
      
      descriptor.value = async function(...args) {
        const cacheKey = keyGenerator.apply(this, args);
        
        // Try to get from cache
        let result = await this.cacheService.get(cacheKey);
        
        if (result === null) {
          // Execute original method
          result = await method.apply(this, args);
          
          // Cache the result
          await this.cacheService.set(cacheKey, result, ttl);
        }
        
        return result;
      };
      
      return descriptor;
    };
  }
}
```

#### 5.2 Database Optimization

**Query Optimization:**
```javascript
class DatabaseOptimizer {
  static addIndexes() {
    return [
      'CREATE INDEX CONCURRENTLY idx_users_email ON users(email)',
      'CREATE INDEX CONCURRENTLY idx_products_category ON products(category_id)',
      'CREATE INDEX CONCURRENTLY idx_products_seller ON products(seller_id)',
      'CREATE INDEX CONCURRENTLY idx_orders_user ON orders(user_id)',
      'CREATE INDEX CONCURRENTLY idx_orders_status ON orders(status)',
      'CREATE INDEX CONCURRENTLY idx_products_search ON products USING gin(to_tsvector(\'english\', name || \' \' || description))',
      'CREATE INDEX CONCURRENTLY idx_audit_logs_user_action ON audit_logs(user_id, action)',
      'CREATE INDEX CONCURRENTLY idx_inventory_product ON inventory(product_id)'
    ];
  }

  static optimizeQueries() {
    // Use connection pooling
    const sequelize = new Sequelize(DATABASE_URL, {
      pool: {
        max: 20,
        min: 5,
        acquire: 30000,
        idle: 10000
      },
      logging: process.env.NODE_ENV === 'development' ? console.log : false
    });

    // Enable query optimization
    return sequelize;
  }

  static async analyzePerformance() {
    const slowQueries = await db.sequelize.query(`
      SELECT query, mean_time, calls, total_time
      FROM pg_stat_statements
      WHERE mean_time > 1000
      ORDER BY mean_time DESC
      LIMIT 10
    `);

    return slowQueries[0];
  }
}
```

### 6. Error Handling & Monitoring

#### 6.1 Comprehensive Error Handling

**Error Classes:**
```javascript
class BaseError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends BaseError {
  constructor(message, details = []) {
    super(message, 400);
    this.details = details;
  }
}

class UnauthorizedError extends BaseError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

class ForbiddenError extends BaseError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

class NotFoundError extends BaseError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

class ConflictError extends BaseError {
  constructor(message = 'Resource conflict') {
    super(message, 409);
  }
}

class InternalServerError extends BaseError {
  constructor(message = 'Internal server error') {
    super(message, 500, false);
  }
}
```

**Global Error Handler:**
```javascript
class ErrorHandler {
  static handle(error, req, res, next) {
    const errorId = uuidv4();
    
    // Log error with context
    logger.error({
      errorId,
      message: error.message,
      stack: error.stack,
      url: req.url,
      method: req.method,
      userId: req.user?.userId,
      timestamp: new Date().toISOString(),
      headers: req.headers,
      body: req.body
    });

    // Send to monitoring service
    if (!error.isOperational) {
      monitoringService.reportError(error, {
        errorId,
        userId: req.user?.userId,
        endpoint: `${req.method} ${req.url}`
      });
    }

    // Prepare client response
    const response = {
      error: {
        id: errorId,
        message: error.isOperational ? error.message : 'Internal server error',
        timestamp: error.timestamp || new Date().toISOString()
      }
    };

    // Add validation details if available
    if (error instanceof ValidationError && error.details) {
      response.error.details = error.details;
    }

    res.status(error.statusCode || 500).json(response);
  }

  static async handleUncaughtException(error) {
    logger.fatal({
      message: 'Uncaught Exception',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    await monitoringService.reportCriticalError(error);
    
    // Graceful shutdown
    process.exit(1);
  }

  static async handleUnhandledRejection(reason, promise) {
    logger.fatal({
      message: 'Unhandled Rejection',
      reason: reason,
      promise: promise,
      timestamp: new Date().toISOString()
    });

    await monitoringService.reportCriticalError(reason);
    
    // Graceful shutdown
    process.exit(1);
  }
}
```

#### 6.2 Health Monitoring

**Health Check Implementation:**
```javascript
class HealthCheckService {
  constructor(dependencies) {
    this.dependencies = dependencies;
  }

  async checkHealth() {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkElasticsearch(),
      this.checkExternalAPIs()
    ]);

    const results = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: this.getCheckResult(checks[0]),
        redis: this.getCheckResult(checks[1]),
        elasticsearch: this.getCheckResult(checks[2]),
        externalAPIs: this.getCheckResult(checks[3])
      }
    };

    // Determine overall status
    const hasFailures = Object.values(results.checks)
      .some(check => check.status === 'unhealthy');
    
    if (hasFailures) {
      results.status = 'unhealthy';
    }

    return results;
  }

  async checkDatabase() {
    try {
      await this.dependencies.database.authenticate();
      return { status: 'healthy', responseTime: Date.now() };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        error: error.message,
        responseTime: Date.now()
      };
    }
  }

  async checkRedis() {
    try {
      const start = Date.now();
      await this.dependencies.redis.ping();
      return { 
        status: 'healthy', 
        responseTime: Date.now() - start 
      };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        error: error.message 
      };
    }
  }

  async checkElasticsearch() {
    try {
      const start = Date.now();
      await this.dependencies.elasticsearch.ping();
      return { 
        status: 'healthy', 
        responseTime: Date.now() - start 
      };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        error: error.message 
      };
    }
  }

  getCheckResult(promiseResult) {
    if (promiseResult.status === 'fulfilled') {
      return promiseResult.value;
    } else {
      return {
        status: 'unhealthy',
        error: promiseResult.reason.message
      };
    }
  }
}
```

### 7. Deployment & Infrastructure

#### 7.1 Docker Configuration

**Dockerfile:**
```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine AS runtime

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

WORKDIR /app

# Copy dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --chown=nextjs:nodejs . .

# Security configurations
RUN apk add --no-cache dumb-init
RUN chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["./docker-entrypoint.sh"]
```

**Docker Compose:**
```yaml
version: '3.8'

services:
  api-gateway:
    build: ./api-gateway
    ports:
      - "80:3000"
    environment:
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - user-service
      - product-service
      - order-service
    networks:
      - app-network

  user-service:
    build: ./user-service
    environment:
      - DATABASE_URL=${USER_DB_URL}
      - REDIS_URL=${REDIS_URL}
    depends_on:
      - postgres
      - redis
    networks:
      - app-network

  product-service:
    build: ./product-service
    environment:
      - DATABASE_URL=${PRODUCT_DB_URL}
      - ELASTICSEARCH_URL=${ES_URL}
    depends_on:
      - postgres
      - elasticsearch
    networks:
      - app-network

  order-service:
    build: ./order-service
    environment:
      - DATABASE_URL=${ORDER_DB_URL}
      - PAYMENT_SERVICE_URL=${PAYMENT_URL}
    depends_on:
      - postgres
      - kafka
    networks:
      - app-network

  postgres:
    image: postgres:14-alpine
    environment:
      - POSTGRES_DB=ecommerce
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - app-network

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    networks:
      - app-network

  elasticsearch:
    image: elasticsearch:8.5.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    volumes:
      - es_data:/usr/share/elasticsearch/data
    networks:
      - app-network

volumes:
  postgres_data:
  redis_data:
  es_data:

networks:
  app-network:
    driver: bridge
```

### 8. Testing Strategy

#### 8.1 Unit Testing

**Service Test Example:**
```javascript
describe('UserService', () => {
  let userService;
  let mockDatabase;
  let mockJwtService;
  let mockEncryptionService;

  beforeEach(() => {
    mockDatabase = {
      User: {
        findOne: jest.fn(),
        create: jest.fn()
      },
      Profile: {
        create: jest.fn()
      },
      sequelize: {
        transaction: jest.fn()
      }
    };

    mockJwtService = {
      generateAccessToken: jest.fn(),
      generateRefreshToken: jest.fn()
    };

    mockEncryptionService = {
      hashPassword: jest.fn()
    };

    userService = new UserService(
      mockDatabase,
      mockJwtService,
      mockEncryptionService
    );
  });

  describe('registerUser', () => {
    it('should successfully register a new user', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: '+1234567890'
      };

      mockDatabase.User.findOne.mockResolvedValue(null);
      mockDatabase.User.create.mockResolvedValue({
        userId: 'user-123',
        email: userData.email,
        toJSON: () => ({ userId: 'user-123', email: userData.email })
      });
      
      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn()
      };
      mockDatabase.sequelize.transaction.mockResolvedValue(mockTransaction);

      const result = await userService.registerUser(userData);

      expect(result.userId).toBe('user-123');
      expect(result.email).toBe(userData.email);
      expect(mockTransaction.commit).toHaveBeenCalled();
    });

    it('should throw ConflictError for existing user', async () => {
      const userData = {
        email: 'existing@example.com',
        password: 'SecurePass123!'
      };

      mockDatabase.User.findOne.mockResolvedValue({ userId: 'existing-user' });

      await expect(userService.registerUser(userData))
        .rejects.toThrow(ConflictError);
    });
  });
});
```

#### 8.2 Integration Testing

**API Integration Test:**
```javascript
describe('Product API Integration', () => {
  let app;
  let testDb;
  let authToken;

  beforeAll(async () => {
    // Setup test database
    testDb = await setupTestDatabase();
    app = createApp(testDb);
    
    // Create test user and get auth token
    const user = await createTestUser();
    authToken = generateTestToken(user);
  });

  afterAll(async () => {
    await cleanupTestDatabase(testDb);
  });

  describe('POST /api/products', () => {
    it('should create a new product', async () => {
      const productData = {
        name: 'Test Product',
        description: 'A test product description',
        price: 29.99,
        categoryId: 'category-123',
        initialQuantity: 100
      };

      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${authToken}`)
        .send(productData)
        .expect(201);

      expect(response.body.name).toBe(productData.name);
      expect(response.body.price).toBe(productData.price);
      
      // Verify database record
      const dbProduct = await testDb.Product.findByPk(response.body.productId);
      expect(dbProduct).toBeTruthy();
    });

    it('should return 400 for invalid product data', async () => {
      const invalidData = {
        name: 'A', // Too short
        price: -10 // Negative price
      };

      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toHaveLength(2);
    });
  });
});
```

### 9. API Documentation

#### 9.1 OpenAPI Specification

```yaml
openapi: 3.0.3
info:
  title: E-commerce Platform API
  version: 1.0.0
  description: Comprehensive e-commerce platform API

paths:
  /api/auth/register:
    post:
      summary: Register new user
      tags:
        - Authentication
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
                firstName:
                  type: string
                  minLength: 2
                lastName:
                  type: string
                  minLength: 2
                phoneNumber:
                  type: string
                  pattern: '^\+?[1-9]\d{1,14}$'
      responses:
        '201':
          description: User registered successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  userId:
                    type: string
                    format: uuid
                  email:
                    type: string
                  accessToken:
                    type: string
                  refreshToken:
                    type: string
        '400':
          description: Validation error
        '409':
          description: User already exists

  /api/products:
    get:
      summary: Search products
      tags:
        - Products
      parameters:
        - name: query
          in: query
          schema:
            type: string
        - name: category
          in: query
          schema:
            type: string
        - name: minPrice
          in: query
          schema:
            type: number
        - name: maxPrice
          in: query
          schema:
            type: number
        - name: page
          in: query
          schema:
            type: integer
            default: 1
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
      responses:
        '200':
          description: Products found
          content:
            application/json:
              schema:
                type: object
                properties:
                  products:
                    type: array
                    items:
                      $ref: '#/components/schemas/Product'
                  total:
                    type: integer
                  page:
                    type: integer
                  totalPages:
                    type: integer

    post:
      summary: Create new product
      tags:
        - Products
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateProductRequest'
      responses:
        '201':
          description: Product created
        '400':
          description: Validation error
        '401':
          description: Unauthorized
        '403':
          description: Insufficient permissions

components:
  schemas:
    Product:
      type: object
      properties:
        productId:
          type: string
          format: uuid
        name:
          type: string
        description:
          type: string
        price:
          type: number
          format: decimal
        sellerId:
          type: string
          format: uuid
        categoryId:
          type: string
          format: uuid
        images:
          type: array
          items:
            type: string
            format: uri
        isActive:
          type: boolean
        createdAt:
          type: string
          format: date-time

    CreateProductRequest:
      type: object
      required:
        - name
        - description
        - price
        - categoryId
      properties:
        name:
          type: string
          minLength: 3
          maxLength: 200
        description:
          type: string
          minLength: 10
          maxLength: 2000
        price:
          type: number
          minimum: 0.01
        categoryId:
          type: string
          format: uuid
        images:
          type: array
          items:
            type: string
            format: uri
          maxItems: 10
        initialQuantity:
          type: integer
          minimum: 0

  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

### 10. Compliance & Audit Implementation

#### 10.1 Audit Logging System

```javascript
class AuditLogger {
  constructor(database) {
    this.db = database;
  }

  async logAction(userId, action, entityType, entityId, changes, metadata = {}) {
    try {
      const auditEntry = {
        logId: uuidv4(),
        userId,
        action,
        entityType,
        entityId,
        oldValues: changes.oldValues ? JSON.stringify(changes.oldValues) : null,
        newValues: changes.newValues ? JSON.stringify(changes.newValues) : null,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        sessionId: metadata.sessionId,
        timestamp: new Date()
      };

      await this.db.AuditLog.create(auditEntry);

      // Real-time monitoring for suspicious activities
      if (this.isSuspiciousActivity(auditEntry)) {
        await this.alertSecurityTeam(auditEntry);
      }

      // Compliance reporting
      if (this.isComplianceRelevant(auditEntry)) {
        await this.updateComplianceMetrics(auditEntry);
      }

    } catch (error) {
      console.error('Audit logging failed:', error);
      // Fail silently to not impact main application flow
    }
  }

  isSuspiciousActivity(auditEntry) {
    const suspiciousPatterns = [
      // Multiple failed login attempts
      { action: 'LOGIN_FAILED', threshold: 5, timeWindow: 300000 }, // 5 minutes
      // Rapid order creation
      { action: 'ORDER_CREATED', threshold: 10, timeWindow: 60000 }, // 1 minute
      // Admin actions from unusual locations
      { action: /ADMIN_.*/, ipPattern: /^(?!10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/ }
    ];

    return suspiciousPatterns.some(pattern => {
      if (pattern.action instanceof RegExp) {
        return pattern.action.test(auditEntry.action) && 
               pattern.ipPattern.test(auditEntry.ipAddress);
      }
      return pattern.action === auditEntry.action;
    });
  }

  async getAuditTrail(entityType, entityId, options = {}) {
    const { startDate, endDate, actions, userId } = options;
    
    const whereClause = {
      entityType,
      entityId
    };

    if (startDate || endDate) {
      whereClause.timestamp = {};
      if (startDate) whereClause.timestamp[Op.gte] = startDate;
      if (endDate) whereClause.timestamp[Op.lte] = endDate;
    }

    if (actions && actions.length > 0) {
      whereClause.action = { [Op.in]: actions };
    }

    if (userId) {
      whereClause.userId = userId;
    }

    return await this.db.AuditLog.findAll({
      where: whereClause,
      order: [['timestamp', 'DESC']],
      include: [{
        model: this.db.User,
        attributes: ['userId', 'email']
      }]
    });
  }
}
```

#### 10.2 GDPR Compliance Implementation

```javascript
class GDPRComplianceService {
  constructor(database, encryptionService) {
    this.db = database;
    this.encryption = encryptionService;
  }

  async handleDataSubjectRequest(requestType, userId, requestDetails) {
    const request = await this.db.DataSubjectRequest.create({
      requestId: uuidv4(),
      userId,
      requestType, // 'ACCESS', 'PORTABILITY', 'RECTIFICATION', 'ERASURE'
      status: 'PENDING',
      requestDetails: JSON.stringify(requestDetails),
      createdAt: new Date()
    });

    switch (requestType) {
      case 'ACCESS':
        return await this.handleAccessRequest(userId, request.requestId);
      case 'PORTABILITY':
        return await this.handlePortabilityRequest(userId, request.requestId);
      case 'RECTIFICATION':
        return await this.handleRectificationRequest(userId, requestDetails, request.requestId);
      case 'ERASURE':
        return await this.handleErasureRequest(userId, request.requestId);
      default:
        throw new ValidationError('Invalid request type');
    }
  }

  async handleAccessRequest(userId, requestId) {
    const userData = await this.collectUserData(userId);
    
    // Encrypt sensitive data for secure transmission
    const encryptedData = this.encryption.encrypt(JSON.stringify(userData));
    
    await this.db.DataSubjectRequest.update(
      { 
        status: 'COMPLETED',
        responseData: encryptedData,
        completedAt: new Date()
      },
      { where: { requestId } }
    );

    return {
      requestId,
      status: 'COMPLETED',
      data: userData
    };
  }

  async handleErasureRequest(userId, requestId) {
    const transaction = await this.db.sequelize.transaction();
    
    try {
      // Check for legal basis to retain data
      const retentionCheck = await this.checkDataRetentionRequirements(userId);
      
      if (retentionCheck.mustRetain) {
        await this.db.DataSubjectRequest.update(
          { 
            status: 'REJECTED',
            rejectionReason: retentionCheck.reason,
            completedAt: new Date()
          },
          { where: { requestId }, transaction }
        );
        
        await transaction.commit();
        return {
          requestId,
          status: 'REJECTED',
          reason: retentionCheck.reason
        };
      }

      // Anonymize user data
      await this.anonymizeUserData(userId, transaction);
      
      await this.db.DataSubjectRequest.update(
        { 
          status: 'COMPLETED',
          completedAt: new Date()
        },
        { where: { requestId }, transaction }
      );

      await transaction.commit();
      
      return {
        requestId,
        status: 'COMPLETED'
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async collectUserData(userId) {
    const [user, profile, orders, reviews, auditLogs] = await Promise.all([
      this.db.User.findByPk(userId, {
        attributes: { exclude: ['passwordHash'] }
      }),
      this.db.Profile.findOne({ where: { userId } }),
      this.db.Order.findAll({ where: { userId } }),
      this.db.Review.findAll({ where: { userId } }),
      this.db.AuditLog.findAll({ 
        where: { userId },
        limit: 100,
        order: [['timestamp', 'DESC']]
      })
    ]);

    return {
      personalData: {
        user: user?.toJSON(),
        profile: profile?.toJSON()
      },
      transactionData: {
        orders: orders.map(o => o.toJSON()),
        reviews: reviews.map(r => r.toJSON())
      },
      systemData: {
        auditLogs: auditLogs.map(l => l.toJSON())
      },
      exportedAt: new Date().toISOString()
    };
  }

  async anonymizeUserData(userId, transaction) {
    const anonymizedEmail = `deleted_${uuidv4()}@anonymized.local`;
    const anonymizedData = {
      email: anonymizedEmail,
      isActive: false,
      deletedAt: new Date()
    };

    // Anonymize user record
    await this.db.User.update(anonymizedData, {
      where: { userId },
      transaction
    });

    // Anonymize profile
    await this.db.Profile.update({
      firstName: 'Deleted',
      lastName: 'User',
      phoneNumber: null,
      address: null,
      preferences: null
    }, {
      where: { userId },
      transaction
    });

    // Keep order records for business purposes but anonymize personal data
    await this.db.Order.update({
      shippingAddress: { anonymized: true }
    }, {
      where: { userId },
      transaction
    });
  }
}
```

This Low-Level Design Document provides comprehensive implementation specifications for the Online Shopping Platform, covering all architectural components, security measures, performance optimizations, error handling, testing strategies, and compliance requirements identified in the High-Level Design.