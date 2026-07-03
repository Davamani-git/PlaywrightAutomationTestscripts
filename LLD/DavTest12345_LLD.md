# Low-Level Design Document for DavTest12345 Online Shopping Platform

## Table of Contents
1. [Component Specifications](#component-specifications)
2. [Data Flow Diagrams](#data-flow-diagrams)
3. [Sequence Diagrams](#sequence-diagrams)
4. [Implementation Details](#implementation-details)
5. [Database Schema](#database-schema)
6. [API Specifications](#api-specifications)
7. [Security Implementation](#security-implementation)
8. [Performance Optimization](#performance-optimization)

## Component Specifications

### 1. User Management Service

#### Architecture
```
┌───────────────────────────────────────────────────────────────┐
│                    User Management Service                   │
├───────────────────────────────────────────────────────────────┤
│  Controllers  │  Services  │  Repositories  │  Middleware   │
├───────────────────────────────────────────────────────────────┤
│ AuthController│ UserService│ UserRepository │ AuthMiddleware │
│ UserController│ AuthService│ RoleRepository │ ValidateInput  │
│ RoleController│ RoleService│ SessionRepo    │ RateLimiter    │
└───────────────────────────────────────────────────────────────┘
```

#### Component Details

**AuthController.js**
```javascript
class AuthController {
  constructor(authService, userService, logger) {
    this.authService = authService;
    this.userService = userService;
    this.logger = logger;
  }

  async register(req, res) {
    try {
      const { email, password, firstName, lastName, role } = req.body;
      
      // Input validation
      const validationResult = this.validateRegistrationInput(req.body);
      if (!validationResult.isValid) {
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: validationResult.errors 
        });
      }

      // Check if user exists
      const existingUser = await this.userService.findByEmail(email);
      if (existingUser) {
        return res.status(409).json({ error: 'User already exists' });
      }

      // Create user
      const hashedPassword = await bcrypt.hash(password, 12);
      const user = await this.userService.create({
        email,
        password: hashedPassword,
        firstName,
        lastName,
        role: role || 'consumer',
        isActive: true,
        createdAt: new Date()
      });

      // Generate JWT token
      const token = this.authService.generateToken(user);
      
      // Audit log
      this.logger.info('User registered', { 
        userId: user.id, 
        email: user.email,
        role: user.role,
        timestamp: new Date()
      });

      res.status(201).json({
        message: 'User registered successfully',
        token,
        user: this.sanitizeUserData(user)
      });
    } catch (error) {
      this.logger.error('Registration error', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async login(req, res) {
    try {
      const { email, password } = req.body;
      
      // Rate limiting check
      const rateLimitResult = await this.checkRateLimit(req.ip, email);
      if (!rateLimitResult.allowed) {
        return res.status(429).json({ 
          error: 'Too many login attempts', 
          retryAfter: rateLimitResult.retryAfter 
        });
      }

      // Find user
      const user = await this.userService.findByEmail(email);
      if (!user || !user.isActive) {
        await this.recordFailedLogin(req.ip, email);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        await this.recordFailedLogin(req.ip, email);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Generate token
      const token = this.authService.generateToken(user);
      
      // Update last login
      await this.userService.updateLastLogin(user.id);
      
      // Audit log
      this.logger.info('User logged in', { 
        userId: user.id, 
        email: user.email,
        ip: req.ip,
        timestamp: new Date()
      });

      res.json({
        message: 'Login successful',
        token,
        user: this.sanitizeUserData(user)
      });
    } catch (error) {
      this.logger.error('Login error', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  sanitizeUserData(user) {
    const { password, ...sanitizedUser } = user;
    return sanitizedUser;
  }
}
```

**UserService.js**
```javascript
class UserService {
  constructor(userRepository, cacheService, eventBus) {
    this.userRepository = userRepository;
    this.cacheService = cacheService;
    this.eventBus = eventBus;
  }

  async create(userData) {
    const user = await this.userRepository.create(userData);
    
    // Cache user data
    await this.cacheService.set(`user:${user.id}`, user, 3600);
    
    // Publish user created event
    await this.eventBus.publish('user.created', {
      userId: user.id,
      email: user.email,
      role: user.role,
      timestamp: new Date()
    });
    
    return user;
  }

  async findById(userId) {
    // Try cache first
    let user = await this.cacheService.get(`user:${userId}`);
    
    if (!user) {
      user = await this.userRepository.findById(userId);
      if (user) {
        await this.cacheService.set(`user:${userId}`, user, 3600);
      }
    }
    
    return user;
  }

  async findByEmail(email) {
    return await this.userRepository.findByEmail(email);
  }

  async updateProfile(userId, updateData) {
    const user = await this.userRepository.update(userId, updateData);
    
    // Invalidate cache
    await this.cacheService.delete(`user:${userId}`);
    
    // Publish user updated event
    await this.eventBus.publish('user.updated', {
      userId,
      changes: updateData,
      timestamp: new Date()
    });
    
    return user;
  }
}
```

### 2. Product Catalog Service

#### Component Architecture
```
┌───────────────────────────────────────────────────────────────┐
│                  Product Catalog Service                     │
├───────────────────────────────────────────────────────────────┤
│ ProductController │ SearchController │ CategoryController   │
│ ProductService    │ SearchService    │ CategoryService      │
│ ProductRepository │ ElasticSearch    │ CategoryRepository   │
│ ImageService      │ IndexManager     │ CacheManager         │
└───────────────────────────────────────────────────────────────┘
```

**ProductController.js**
```javascript
class ProductController {
  constructor(productService, searchService, imageService) {
    this.productService = productService;
    this.searchService = searchService;
    this.imageService = imageService;
  }

  async createProduct(req, res) {
    try {
      const productData = req.body;
      const sellerId = req.user.id;
      
      // Validate seller permissions
      if (!this.hasSellerPermissions(req.user)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      // Process images
      let imageUrls = [];
      if (req.files && req.files.length > 0) {
        imageUrls = await this.imageService.uploadImages(req.files);
      }

      const product = await this.productService.create({
        ...productData,
        sellerId,
        images: imageUrls,
        isActive: true,
        createdAt: new Date()
      });

      // Index in Elasticsearch
      await this.searchService.indexProduct(product);

      res.status(201).json({
        message: 'Product created successfully',
        product
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create product' });
    }
  }

  async searchProducts(req, res) {
    try {
      const { query, category, minPrice, maxPrice, page = 1, limit = 20 } = req.query;
      
      const searchParams = {
        query,
        filters: {
          category,
          priceRange: { min: minPrice, max: maxPrice }
        },
        pagination: { page: parseInt(page), limit: parseInt(limit) }
      };

      const results = await this.searchService.searchProducts(searchParams);
      
      res.json({
        products: results.products,
        pagination: results.pagination,
        facets: results.facets
      });
    } catch (error) {
      res.status(500).json({ error: 'Search failed' });
    }
  }
}
```

**SearchService.js**
```javascript
class SearchService {
  constructor(elasticClient, cacheService) {
    this.elasticClient = elasticClient;
    this.cacheService = cacheService;
  }

  async searchProducts(searchParams) {
    const cacheKey = this.generateCacheKey(searchParams);
    
    // Check cache first
    let results = await this.cacheService.get(cacheKey);
    if (results) {
      return results;
    }

    const query = this.buildElasticsearchQuery(searchParams);
    
    const response = await this.elasticClient.search({
      index: 'products',
      body: query
    });

    results = this.formatSearchResults(response);
    
    // Cache results for 5 minutes
    await this.cacheService.set(cacheKey, results, 300);
    
    return results;
  }

  buildElasticsearchQuery(searchParams) {
    const { query, filters, pagination } = searchParams;
    
    const esQuery = {
      query: {
        bool: {
          must: [],
          filter: []
        }
      },
      aggs: {
        categories: {
          terms: { field: 'category.keyword' }
        },
        price_ranges: {
          range: {
            field: 'price',
            ranges: [
              { to: 50 },
              { from: 50, to: 100 },
              { from: 100, to: 500 },
              { from: 500 }
            ]
          }
        }
      },
      from: (pagination.page - 1) * pagination.limit,
      size: pagination.limit
    };

    // Text search
    if (query) {
      esQuery.query.bool.must.push({
        multi_match: {
          query,
          fields: ['name^2', 'description', 'category'],
          type: 'best_fields',
          fuzziness: 'AUTO'
        }
      });
    }

    // Category filter
    if (filters.category) {
      esQuery.query.bool.filter.push({
        term: { 'category.keyword': filters.category }
      });
    }

    // Price range filter
    if (filters.priceRange.min || filters.priceRange.max) {
      const priceFilter = { range: { price: {} } };
      if (filters.priceRange.min) priceFilter.range.price.gte = filters.priceRange.min;
      if (filters.priceRange.max) priceFilter.range.price.lte = filters.priceRange.max;
      esQuery.query.bool.filter.push(priceFilter);
    }

    // Only active products
    esQuery.query.bool.filter.push({ term: { isActive: true } });

    return esQuery;
  }
}
```

### 3. Order Management Service

#### Component Architecture
```
┌───────────────────────────────────────────────────────────────┐
│                  Order Management Service                    │
├───────────────────────────────────────────────────────────────┤
│ OrderController   │ OrderService      │ OrderRepository     │
│ OrderItemService  │ InventoryService  │ PaymentService      │
│ StatusManager     │ EventHandler      │ NotificationService │
│ WorkflowEngine    │ AuditLogger       │ ReportGenerator     │
└───────────────────────────────────────────────────────────────┘
```

**OrderController.js**
```javascript
class OrderController {
  constructor(orderService, inventoryService, paymentService) {
    this.orderService = orderService;
    this.inventoryService = inventoryService;
    this.paymentService = paymentService;
  }

  async createOrder(req, res) {
    const transaction = await db.transaction();
    
    try {
      const { cartItems, shippingAddress, paymentMethod } = req.body;
      const userId = req.user.id;

      // Validate cart items and check inventory
      const validationResult = await this.validateOrderItems(cartItems);
      if (!validationResult.isValid) {
        await transaction.rollback();
        return res.status(400).json({ 
          error: 'Order validation failed', 
          details: validationResult.errors 
        });
      }

      // Calculate order total
      const orderTotal = this.calculateOrderTotal(validationResult.items);

      // Create order
      const order = await this.orderService.create({
        userId,
        totalAmount: orderTotal.total,
        subtotal: orderTotal.subtotal,
        tax: orderTotal.tax,
        shipping: orderTotal.shipping,
        shippingAddress,
        status: 'pending',
        createdAt: new Date()
      }, { transaction });

      // Create order items
      const orderItems = await this.orderService.createOrderItems(
        order.id, 
        validationResult.items, 
        { transaction }
      );

      // Reserve inventory
      await this.inventoryService.reserveItems(validationResult.items, { transaction });

      // Process payment
      const paymentResult = await this.paymentService.processPayment({
        orderId: order.id,
        amount: orderTotal.total,
        paymentMethod,
        customerId: userId
      });

      if (!paymentResult.success) {
        await transaction.rollback();
        return res.status(402).json({ 
          error: 'Payment failed', 
          details: paymentResult.error 
        });
      }

      // Update order status
      await this.orderService.updateStatus(order.id, 'confirmed', { transaction });

      await transaction.commit();

      // Send confirmation
      await this.orderService.sendOrderConfirmation(order.id);

      res.status(201).json({
        message: 'Order created successfully',
        order: {
          ...order,
          items: orderItems,
          payment: paymentResult.payment
        }
      });
    } catch (error) {
      await transaction.rollback();
      res.status(500).json({ error: 'Failed to create order' });
    }
  }

  async getOrderStatus(req, res) {
    try {
      const { orderId } = req.params;
      const userId = req.user.id;

      const order = await this.orderService.findById(orderId);
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Check permissions
      if (order.userId !== userId && !this.hasAdminPermissions(req.user)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const orderDetails = await this.orderService.getOrderWithDetails(orderId);
      
      res.json({
        order: orderDetails,
        timeline: await this.orderService.getOrderTimeline(orderId)
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve order' });
    }
  }
}
```

**OrderService.js**
```javascript
class OrderService {
  constructor(orderRepository, eventBus, notificationService) {
    this.orderRepository = orderRepository;
    this.eventBus = eventBus;
    this.notificationService = notificationService;
  }

  async create(orderData, options = {}) {
    const order = await this.orderRepository.create(orderData, options);
    
    // Publish order created event
    await this.eventBus.publish('order.created', {
      orderId: order.id,
      userId: order.userId,
      totalAmount: order.totalAmount,
      timestamp: new Date()
    });
    
    return order;
  }

  async updateStatus(orderId, newStatus, options = {}) {
    const order = await this.orderRepository.findById(orderId);
    const oldStatus = order.status;
    
    const updatedOrder = await this.orderRepository.update(
      orderId, 
      { status: newStatus, updatedAt: new Date() }, 
      options
    );
    
    // Create status history entry
    await this.orderRepository.createStatusHistory({
      orderId,
      fromStatus: oldStatus,
      toStatus: newStatus,
      timestamp: new Date()
    }, options);
    
    // Publish status change event
    await this.eventBus.publish('order.status_changed', {
      orderId,
      oldStatus,
      newStatus,
      timestamp: new Date()
    });
    
    // Send notification to user
    await this.notificationService.sendOrderStatusUpdate(
      order.userId, 
      orderId, 
      newStatus
    );
    
    return updatedOrder;
  }

  async processRefund(orderId, refundAmount, reason) {
    const transaction = await db.transaction();
    
    try {
      const order = await this.orderRepository.findById(orderId);
      
      if (order.status !== 'delivered' && order.status !== 'completed') {
        throw new Error('Order cannot be refunded in current status');
      }
      
      // Process refund with payment service
      const refundResult = await this.paymentService.processRefund({
        orderId,
        amount: refundAmount,
        reason
      });
      
      if (!refundResult.success) {
        throw new Error('Refund processing failed');
      }
      
      // Update order status
      await this.updateStatus(orderId, 'refunded', { transaction });
      
      // Create refund record
      await this.orderRepository.createRefund({
        orderId,
        amount: refundAmount,
        reason,
        refundId: refundResult.refundId,
        processedAt: new Date()
      }, { transaction });
      
      await transaction.commit();
      
      return { success: true, refundId: refundResult.refundId };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}
```

## Data Flow Diagrams

### 1. User Registration Flow
```
┌──────────┐    ┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  Client  │───►│ API Gateway │───►│ User Service │───►│  Database   │
└──────────┘    └─────────────┘    └──────────────┘    └─────────────┘
      │                │                    │                   │
      │                │         ┌──────────▼──────────┐        │
      │                │         │  Validation Layer   │        │
      │                │         └──────────┬──────────┘        │
      │                │                    │                   │
      │                │         ┌──────────▼──────────┐        │
      │                │         │  Password Hashing   │        │
      │                │         └──────────┬──────────┘        │
      │                │                    │                   │
      │                │         ┌──────────▼──────────┐        │
      │                │         │   JWT Generation    │        │
      │                │         └──────────┬──────────┘        │
      │                │                    │                   │
      │◄───────────────┼────────────────────┴───────────────────│
      │                │                                        │
      │                │         ┌──────────────────────────────▼──┐
      │                │         │        Audit Logging            │
      │                │         └─────────────────────────────────┘
```

### 2. Product Search Flow
```
┌──────────┐    ┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  Client  │───►│ API Gateway │───►│Search Service│───►│Elasticsearch│
└──────────┘    └─────────────┘    └──────────────┘    └─────────────┘
      │                │                    │                   │
      │                │         ┌──────────▼──────────┐        │
      │                │         │   Cache Check       │        │
      │                │         └──────────┬──────────┘        │
      │                │                    │                   │
      │                │         ┌──────────▼──────────┐        │
      │                │         │  Query Building     │        │
      │                │         └──────────┬──────────┘        │
      │                │                    │                   │
      │                │         ┌──────────▼──────────┐        │
      │                │         │  Result Formatting  │        │
      │                │         └──────────┬──────────┘        │
      │                │                    │                   │
      │◄───────────────┼────────────────────┴───────────────────│
      │                │                                        │
      │                │         ┌──────────────────────────────▼──┐
      │                │         │       Cache Update              │
      │                │         └─────────────────────────────────┘
```

### 3. Order Processing Flow
```
┌──────────┐    ┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  Client  │───►│ API Gateway │───►│ Order Service│───►│  Database   │
└──────────┘    └─────────────┘    └──────────────┘    └─────────────┘
      │                │                    │                   │
      │                │         ┌──────────▼──────────┐        │
      │                │         │  Inventory Check    │        │
      │                │         └──────────┬──────────┘        │
      │                │                    │                   │
      │                │         ┌──────────▼──────────┐        │
      │                │         │  Payment Processing │        │
      │                │         └──────────┬──────────┘        │
      │                │                    │                   │
      │                │         ┌──────────▼──────────┐        │
      │                │         │  Order Creation     │        │
      │                │         └──────────┬──────────┘        │
      │                │                    │                   │
      │                │         ┌──────────▼──────────┐        │
      │                │         │  Event Publishing   │        │
      │                │         └──────────┬──────────┘        │
      │                │                    │                   │
      │◄───────────────┼────────────────────┴───────────────────│
      │                │                                        │
      │                │         ┌──────────────────────────────▼──┐
      │                │         │     Notification Service        │
      │                │         └─────────────────────────────────┘
```

## Sequence Diagrams

### 1. User Authentication Sequence
```
Client          API Gateway     Auth Service    User Service    Database        Cache
  │                 │               │               │             │             │
  │─── POST /login ─►│               │               │             │             │
  │                 │──── validate ─►│               │             │             │
  │                 │               │─── findUser ──►│             │             │
  │                 │               │               │── query ───►│             │
  │                 │               │               │◄─ result ───│             │
  │                 │               │◄── user ──────│             │             │
  │                 │               │─── verifyPwd ─│             │             │
  │                 │               │─── genToken ──│             │             │
  │                 │               │─── cacheUser ──────────────────────────────►│
  │                 │◄─── token ────│               │             │             │
  │◄─── response ───│               │               │             │             │
```

### 2. Product Search Sequence
```
Client          API Gateway     Search Service  Cache Service   Elasticsearch   Database
  │                 │               │               │               │             │
  │─── GET /search ─►│               │               │               │             │
  │                 │─── search ────►│               │               │             │
  │                 │               │─── checkCache ►│               │             │
  │                 │               │◄─── miss ─────│               │             │
  │                 │               │─── buildQuery ─│               │             │
  │                 │               │─── search ─────────────────────►│             │
  │                 │               │◄─── results ───────────────────│             │
  │                 │               │─── getDetails ─────────────────────────────►│
  │                 │               │◄─── details ───────────────────────────────│
  │                 │               │─── cacheResults ►│               │             │
  │                 │◄─── response ─│               │               │             │
  │◄─── results ────│               │               │               │             │
```

### 3. Order Creation Sequence
```
Client      API Gateway   Order Service   Inventory   Payment     Database    Event Bus
  │             │             │             │           │           │           │
  │── POST ────►│             │             │           │           │           │
  │             │── create ───►│             │           │           │           │
  │             │             │── validate ──►│           │           │           │
  │             │             │◄─── ok ──────│           │           │           │
  │             │             │── reserve ───►│           │           │           │
  │             │             │◄─── ok ──────│           │           │           │
  │             │             │── process ───────────────►│           │           │
  │             │             │◄─── success ─────────────│           │           │
  │             │             │── save ─────────────────────────────►│           │
  │             │             │◄─── order ─────────────────────────│           │
  │             │             │── publish ─────────────────────────────────────►│
  │             │◄─── order ──│             │           │           │           │
  │◄─── response ──│             │             │           │           │           │
```

## Implementation Details

### 1. Database Schema

#### Users Table
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role user_role NOT NULL DEFAULT 'consumer',
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    phone VARCHAR(20),
    date_of_birth DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE TYPE user_role AS ENUM ('consumer', 'seller', 'admin');

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(is_active);
```

#### Products Table
```sql
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    seller_id UUID NOT NULL REFERENCES users(id),
    category_id UUID NOT NULL REFERENCES categories(id),
    brand VARCHAR(100),
    sku VARCHAR(100) UNIQUE,
    images JSONB DEFAULT '[]',
    attributes JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT positive_price CHECK (price > 0)
);

CREATE INDEX idx_products_seller ON products(seller_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_products_name_gin ON products USING gin(to_tsvector('english', name));
CREATE INDEX idx_products_description_gin ON products USING gin(to_tsvector('english', description));
```

#### Orders Table
```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    total_amount DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    shipping_amount DECIMAL(10,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    status order_status NOT NULL DEFAULT 'pending',
    shipping_address JSONB NOT NULL,
    billing_address JSONB,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT positive_amounts CHECK (
        total_amount > 0 AND 
        subtotal > 0 AND 
        tax_amount >= 0 AND 
        shipping_amount >= 0 AND 
        discount_amount >= 0
    )
);

CREATE TYPE order_status AS ENUM (
    'pending', 'confirmed', 'processing', 'shipped', 
    'delivered', 'cancelled', 'refunded'
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at);
```

#### Order Items Table
```sql
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    product_snapshot JSONB NOT NULL, -- Store product details at time of order
    
    CONSTRAINT positive_quantity CHECK (quantity > 0),
    CONSTRAINT positive_prices CHECK (unit_price > 0 AND total_price > 0),
    CONSTRAINT correct_total CHECK (total_price = unit_price * quantity)
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);
```

#### Inventory Table
```sql
CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0,
    reserved_quantity INTEGER NOT NULL DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 10,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT non_negative_quantities CHECK (
        quantity >= 0 AND 
        reserved_quantity >= 0 AND 
        reserved_quantity <= quantity
    ),
    
    UNIQUE(product_id)
);

CREATE INDEX idx_inventory_product ON inventory(product_id);
CREATE INDEX idx_inventory_low_stock ON inventory(quantity) WHERE quantity <= low_stock_threshold;
```

### 2. API Specifications

#### Authentication Endpoints
```yaml
/api/v1/auth/register:
  post:
    summary: Register a new user
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required: [email, password, firstName, lastName]
            properties:
              email:
                type: string
                format: email
                example: "user@example.com"
              password:
                type: string
                minLength: 8
                pattern: "^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]"
              firstName:
                type: string
                minLength: 1
                maxLength: 100
              lastName:
                type: string
                minLength: 1
                maxLength: 100
              role:
                type: string
                enum: [consumer, seller]
                default: consumer
    responses:
      201:
        description: User registered successfully
        content:
          application/json:
            schema:
              type: object
              properties:
                message:
                  type: string
                token:
                  type: string
                user:
                  $ref: '#/components/schemas/User'
      400:
        description: Validation error
      409:
        description: User already exists

/api/v1/auth/login:
  post:
    summary: Authenticate user
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required: [email, password]
            properties:
              email:
                type: string
                format: email
              password:
                type: string
    responses:
      200:
        description: Login successful
        content:
          application/json:
            schema:
              type: object
              properties:
                message:
                  type: string
                token:
                  type: string
                user:
                  $ref: '#/components/schemas/User'
      401:
        description: Invalid credentials
      429:
        description: Too many login attempts
```

#### Product Endpoints
```yaml
/api/v1/products:
  get:
    summary: Search products
    parameters:
      - name: q
        in: query
        description: Search query
        schema:
          type: string
      - name: category
        in: query
        description: Category filter
        schema:
          type: string
      - name: minPrice
        in: query
        description: Minimum price filter
        schema:
          type: number
      - name: maxPrice
        in: query
        description: Maximum price filter
        schema:
          type: number
      - name: page
        in: query
        description: Page number
        schema:
          type: integer
          minimum: 1
          default: 1
      - name: limit
        in: query
        description: Items per page
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
                  $ref: '#/components/schemas/SearchFacets'

  post:
    summary: Create a new product
    security:
      - bearerAuth: []
    requestBody:
      required: true
      content:
        multipart/form-data:
          schema:
            type: object
            required: [name, description, price, categoryId]
            properties:
              name:
                type: string
                minLength: 1
                maxLength: 255
              description:
                type: string
              price:
                type: number
                minimum: 0.01
              categoryId:
                type: string
                format: uuid
              brand:
                type: string
              sku:
                type: string
              images:
                type: array
                items:
                  type: string
                  format: binary
              attributes:
                type: object
    responses:
      201:
        description: Product created successfully
      400:
        description: Validation error
      403:
        description: Insufficient permissions
```

### 3. Security Implementation

#### JWT Token Management
```javascript
class JWTService {
  constructor(secretKey, refreshSecretKey) {
    this.secretKey = secretKey;
    this.refreshSecretKey = refreshSecretKey;
    this.accessTokenExpiry = '15m';
    this.refreshTokenExpiry = '7d';
  }

  generateTokenPair(user) {
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      permissions: this.getUserPermissions(user.role)
    };

    const accessToken = jwt.sign(
      payload, 
      this.secretKey, 
      { 
        expiresIn: this.accessTokenExpiry,
        issuer: 'shopping-platform',
        audience: 'shopping-platform-users'
      }
    );

    const refreshToken = jwt.sign(
      { userId: user.id, tokenVersion: user.tokenVersion }, 
      this.refreshSecretKey, 
      { 
        expiresIn: this.refreshTokenExpiry,
        issuer: 'shopping-platform',
        audience: 'shopping-platform-users'
      }
    );

    return { accessToken, refreshToken };
  }

  verifyAccessToken(token) {
    try {
      return jwt.verify(token, this.secretKey, {
        issuer: 'shopping-platform',
        audience: 'shopping-platform-users'
      });
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  getUserPermissions(role) {
    const permissions = {
      consumer: [
        'products:read',
        'orders:create',
        'orders:read:own',
        'cart:manage:own',
        'reviews:create',
        'reviews:read'
      ],
      seller: [
        'products:read',
        'products:create:own',
        'products:update:own',
        'orders:read:own',
        'inventory:manage:own',
        'reviews:read'
      ],
      admin: [
        'products:*',
        'orders:*',
        'users:*',
        'inventory:*',
        'reviews:*',
        'analytics:*'
      ]
    };
    
    return permissions[role] || [];
  }
}
```

#### Input Validation Middleware
```javascript
const Joi = require('joi');

class ValidationMiddleware {
  static validateRegistration() {
    const schema = Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string()
        .min(8)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .required()
        .messages({
          'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
        }),
      firstName: Joi.string().min(1).max(100).required(),
      lastName: Joi.string().min(1).max(100).required(),
      role: Joi.string().valid('consumer', 'seller').default('consumer')
    });

    return (req, res, next) => {
      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
          }))
        });
      }
      req.body = value;
      next();
    };
  }

  static validateProductCreation() {
    const schema = Joi.object({
      name: Joi.string().min(1).max(255).required(),
      description: Joi.string().required(),
      price: Joi.number().positive().precision(2).required(),
      categoryId: Joi.string().uuid().required(),
      brand: Joi.string().max(100).optional(),
      sku: Joi.string().max(100).optional(),
      attributes: Joi.object().optional()
    });

    return (req, res, next) => {
      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
          }))
        });
      }
      req.body = value;
      next();
    };
  }
}
```

#### Rate Limiting Implementation
```javascript
const Redis = require('redis');

class RateLimiter {
  constructor(redisClient) {
    this.redis = redisClient;
  }

  async checkLimit(identifier, windowMs = 60000, maxRequests = 100) {
    const key = `rate_limit:${identifier}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Use Redis sorted set to track requests in time window
    const pipeline = this.redis.pipeline();
    
    // Remove old entries
    pipeline.zremrangebyscore(key, 0, windowStart);
    
    // Count current requests
    pipeline.zcard(key);
    
    // Add current request
    pipeline.zadd(key, now, `${now}-${Math.random()}`);
    
    // Set expiry
    pipeline.expire(key, Math.ceil(windowMs / 1000));
    
    const results = await pipeline.exec();
    const currentCount = results[1][1];
    
    if (currentCount >= maxRequests) {
      const oldestRequest = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
      const resetTime = oldestRequest.length > 0 ? 
        parseInt(oldestRequest[1]) + windowMs : 
        now + windowMs;
        
      return {
        allowed: false,
        count: currentCount,
        resetTime,
        retryAfter: Math.ceil((resetTime - now) / 1000)
      };
    }
    
    return {
      allowed: true,
      count: currentCount + 1,
      resetTime: now + windowMs
    };
  }

  middleware(windowMs = 60000, maxRequests = 100, keyGenerator = (req) => req.ip) {
    return async (req, res, next) => {
      try {
        const identifier = keyGenerator(req);
        const result = await this.checkLimit(identifier, windowMs, maxRequests);
        
        // Set rate limit headers
        res.set({
          'X-RateLimit-Limit': maxRequests,
          'X-RateLimit-Remaining': Math.max(0, maxRequests - result.count),
          'X-RateLimit-Reset': new Date(result.resetTime).toISOString()
        });
        
        if (!result.allowed) {
          res.set('Retry-After', result.retryAfter);
          return res.status(429).json({
            error: 'Too many requests',
            retryAfter: result.retryAfter
          });
        }
        
        next();
      } catch (error) {
        // If rate limiting fails, allow the request but log the error
        console.error('Rate limiting error:', error);
        next();
      }
    };
  }
}
```

## Performance Optimization

### 1. Caching Strategy Implementation

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
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  }

  async delete(key) {
    try {
      await this.redis.del(key);
      return true;
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  }

  async invalidatePattern(pattern) {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      return true;
    } catch (error) {
      console.error('Cache invalidation error:', error);
      return false;
    }
  }

  // Cache-aside pattern implementation
  async getOrSet(key, fetchFunction, ttl = this.defaultTTL) {
    let value = await this.get(key);
    
    if (value === null) {
      value = await fetchFunction();
      if (value !== null && value !== undefined) {
        await this.set(key, value, ttl);
      }
    }
    
    return value;
  }
}
```

### 2. Database Connection Pooling

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
      min: 5,  // Minimum number of connections
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      acquireTimeoutMillis: 60000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200
    });

    // Connection pool monitoring
    this.pool.on('connect', (client) => {
      console.log('New database connection established');
    });

    this.pool.on('error', (err) => {
      console.error('Database pool error:', err);
    });
  }

  async query(text, params) {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      
      // Log slow queries
      if (duration > 1000) {
        console.warn(`Slow query detected: ${duration}ms`, { text, params });
      }
      
      return result;
    } catch (error) {
      console.error('Database query error:', { text, params, error: error.message });
      throw error;
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

  async getPoolStats() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount
    };
  }
}
```

### 3. Query Optimization

```javascript
class OptimizedQueries {
  constructor(db) {
    this.db = db;
  }

  // Optimized product search with pagination
  async searchProducts(searchParams) {
    const { query, category, minPrice, maxPrice, page = 1, limit = 20 } = searchParams;
    const offset = (page - 1) * limit;

    let whereConditions = ['p.is_active = true'];
    let params = [];
    let paramIndex = 1;

    // Build dynamic WHERE clause
    if (query) {
      whereConditions.push(`(
        to_tsvector('english', p.name || ' ' || p.description) @@ plainto_tsquery('english', $${paramIndex})
        OR p.name ILIKE $${paramIndex + 1}
      )`);
      params.push(query, `%${query}%`);
      paramIndex += 2;
    }

    if (category) {
      whereConditions.push(`c.name = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }

    if (minPrice) {
      whereConditions.push(`p.price >= $${paramIndex}`);
      params.push(minPrice);
      paramIndex++;
    }

    if (maxPrice) {
      whereConditions.push(`p.price <= $${paramIndex}`);
      params.push(maxPrice);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Main query with optimized joins
    const searchQuery = `
      SELECT 
        p.id, p.name, p.description, p.price, p.images,
        c.name as category_name,
        u.first_name || ' ' || u.last_name as seller_name,
        i.quantity as stock_quantity,
        COALESCE(AVG(r.rating), 0) as avg_rating,
        COUNT(r.id) as review_count
      FROM products p
      JOIN categories c ON p.category_id = c.id
      JOIN users u ON p.seller_id = u.id
      LEFT JOIN inventory i ON p.id = i.product_id
      LEFT JOIN reviews r ON p.id = r.product_id
      WHERE ${whereClause}
      GROUP BY p.id, c.name, u.first_name, u.last_name, i.quantity
      ORDER BY 
        CASE WHEN $${paramIndex} IS NOT NULL THEN 
          ts_rank(to_tsvector('english', p.name || ' ' || p.description), plainto_tsquery('english', $${paramIndex}))
        ELSE 0 END DESC,
        p.created_at DESC
      LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}
    `;

    params.push(query, limit, offset);

    // Count query for pagination
    const countQuery = `
      SELECT COUNT(DISTINCT p.id) as total
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE ${whereClause}
    `;

    const countParams = params.slice(0, -2); // Remove limit and offset

    const [searchResult, countResult] = await Promise.all([
      this.db.query(searchQuery, params),
      this.db.query(countQuery, countParams)
    ]);

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    return {
      products: searchResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }

  // Optimized order retrieval with items
  async getOrderWithItems(orderId, userId = null) {
    const query = `
      SELECT 
        o.*,
        json_agg(
          json_build_object(
            'id', oi.id,
            'productId', oi.product_id,
            'quantity', oi.quantity,
            'unitPrice', oi.unit_price,
            'totalPrice', oi.total_price,
            'productSnapshot', oi.product_snapshot
          ) ORDER BY oi.created_at
        ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.id = $1
      ${userId ? 'AND o.user_id = $2' : ''}
      GROUP BY o.id
    `;

    const params = userId ? [orderId, userId] : [orderId];
    const result = await this.db.query(query, params);
    
    return result.rows[0] || null;
  }
}
```

This comprehensive Low-Level Design document provides detailed implementation specifications for the DavTest12345 Online Shopping Platform, including component architectures, data flows, sequence diagrams, database schemas, API specifications, security implementations, and performance optimizations. The design ensures scalability, security, and maintainability while meeting all functional and non-functional requirements.