# Low-Level Design (LLD) Document - DavTest12345 Online Shopping Platform

## 1. INTRODUCTION

This Low-Level Design document provides detailed implementation specifications for the DavTest12345 Online Shopping Platform based on the High-Level Design analysis. It includes component specifications, data flows, sequence diagrams, and implementation details for secure, scalable e-commerce functionality.

## 2. SYSTEM ARCHITECTURE OVERVIEW

### 2.1 Microservices Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                          │
├─────────────────┬─────────────────┬─────────────────┬─────────┤
│   Web App       │   Mobile Web    │  Admin Dashboard│   APIs  │
│   (React)       │   (PWA)         │   (React Admin) │ (REST)  │
└─────────────────┴─────────────────┴─────────────────┴─────────┘
           │                │                │              │
┌─────────────────────────────────────────────────────────────────┐
│                     API GATEWAY LAYER                          │
├─────────────────┬─────────────────┬─────────────────┬─────────┤
│ Authentication  │ Rate Limiting   │ Request Routing │ SSL/TLS │
│ & Authorization │ & Throttling    │ & Load Balancer │ Termina │
└─────────────────┴─────────────────┴─────────────────┴─────────┘
           │                │                │              │
┌─────────────────────────────────────────────────────────────────┐
│                   MICROSERVICES LAYER                          │
├──────────┬──────────┬──────────┬──────────┬──────────┬────────┤
│   User   │ Product  │  Order   │ Payment  │   Cart   │Inventory│
│ Service  │ Service  │ Service  │ Service  │ Service  │Service │
├──────────┼──────────┼──────────┼──────────┼──────────┼────────┤
│Notification│Analytics│ Review   │ Audit    │ Security │ Config │
│ Service  │ Service  │ Service  │ Service  │ Service  │Service │
└──────────┴──────────┴──────────┴──────────┴──────────┴────────┘
           │                │                │              │
┌─────────────────────────────────────────────────────────────────┐
│                      DATA LAYER                                │
├─────────────────┬─────────────────┬─────────────────┬─────────┤
│   PostgreSQL    │   Redis Cache   │  Elasticsearch  │File Stor│
│   (Primary DB)  │   (Sessions)    │   (Search)      │(AWS S3) │
└─────────────────┴─────────────────┴─────────────────┴─────────┘
```

## 3. DETAILED COMPONENT SPECIFICATIONS

### 3.1 User Management Service

#### 3.1.1 Component Structure
```javascript
// User Service Architecture
const userService = {
  controllers: {
    AuthController: './controllers/AuthController.js',
    UserController: './controllers/UserController.js',
    ProfileController: './controllers/ProfileController.js'
  },
  services: {
    AuthService: './services/AuthService.js',
    UserService: './services/UserService.js',
    RoleService: './services/RoleService.js'
  },
  models: {
    User: './models/User.js',
    Role: './models/Role.js',
    Permission: './models/Permission.js'
  },
  middleware: {
    AuthMiddleware: './middleware/AuthMiddleware.js',
    RBACMiddleware: './middleware/RBACMiddleware.js'
  }
};
```

#### 3.1.2 Database Schema
```sql
-- Users Table
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    date_of_birth DATE,
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    phone_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP
);

-- Roles Table
CREATE TABLE roles (
    role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Roles Junction Table
CREATE TABLE user_roles (
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(role_id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by UUID REFERENCES users(user_id),
    PRIMARY KEY (user_id, role_id)
);

-- Permissions Table
CREATE TABLE permissions (
    permission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    permission_name VARCHAR(100) UNIQUE NOT NULL,
    resource VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Role Permissions Junction Table
CREATE TABLE role_permissions (
    role_id UUID REFERENCES roles(role_id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(permission_id) ON DELETE CASCADE,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, permission_id)
);
```

#### 3.1.3 API Endpoints
```javascript
// Authentication Endpoints
POST   /api/v1/auth/register          // User registration
POST   /api/v1/auth/login             // User login
POST   /api/v1/auth/logout            // User logout
POST   /api/v1/auth/refresh-token     // Refresh JWT token
POST   /api/v1/auth/forgot-password   // Password reset request
POST   /api/v1/auth/reset-password    // Password reset confirmation
POST   /api/v1/auth/verify-email      // Email verification
POST   /api/v1/auth/resend-verification // Resend verification email

// User Management Endpoints
GET    /api/v1/users                  // Get all users (admin only)
GET    /api/v1/users/:id              // Get user by ID
PUT    /api/v1/users/:id              // Update user profile
DELETE /api/v1/users/:id              // Deactivate user account
POST   /api/v1/users/:id/roles        // Assign role to user
DELETE /api/v1/users/:id/roles/:roleId // Remove role from user

// Profile Management Endpoints
GET    /api/v1/profile                // Get current user profile
PUT    /api/v1/profile                // Update current user profile
POST   /api/v1/profile/change-password // Change password
POST   /api/v1/profile/upload-avatar  // Upload profile picture
```

#### 3.1.4 Implementation Details

##### Authentication Service
```javascript
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

class AuthService {
  async register(userData) {
    try {
      // Validate input
      const validation = await this.validateRegistrationData(userData);
      if (!validation.isValid) {
        throw new ValidationError(validation.errors);
      }

      // Check if user already exists
      const existingUser = await User.findOne({ email: userData.email });
      if (existingUser) {
        throw new ConflictError('User already exists with this email');
      }

      // Hash password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(userData.password, saltRounds);

      // Create user
      const user = await User.create({
        ...userData,
        password_hash: passwordHash,
        email_verification_token: crypto.randomBytes(32).toString('hex')
      });

      // Assign default role
      await this.assignDefaultRole(user.user_id);

      // Send verification email
      await this.sendVerificationEmail(user);

      // Log registration event
      await AuditService.log({
        action: 'USER_REGISTRATION',
        userId: user.user_id,
        details: { email: user.email },
        ipAddress: this.getClientIP(),
        userAgent: this.getUserAgent()
      });

      return {
        user: this.sanitizeUser(user),
        message: 'Registration successful. Please verify your email.'
      };
    } catch (error) {
      await AuditService.log({
        action: 'USER_REGISTRATION_FAILED',
        details: { email: userData.email, error: error.message },
        ipAddress: this.getClientIP()
      });
      throw error;
    }
  }

  async login(email, password, ipAddress, userAgent) {
    try {
      // Find user
      const user = await User.findOne({ 
        email: email.toLowerCase(),
        is_active: true 
      }).populate('roles');

      if (!user) {
        await this.logFailedLogin(email, 'USER_NOT_FOUND', ipAddress);
        throw new UnauthorizedError('Invalid credentials');
      }

      // Check if account is locked
      if (user.locked_until && user.locked_until > new Date()) {
        await this.logFailedLogin(email, 'ACCOUNT_LOCKED', ipAddress);
        throw new UnauthorizedError('Account is temporarily locked');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        await this.handleFailedLogin(user, ipAddress);
        throw new UnauthorizedError('Invalid credentials');
      }

      // Check if email is verified
      if (!user.email_verified) {
        throw new UnauthorizedError('Please verify your email before logging in');
      }

      // Reset failed login attempts
      await User.update(
        { user_id: user.user_id },
        { 
          failed_login_attempts: 0,
          locked_until: null,
          last_login: new Date()
        }
      );

      // Generate tokens
      const tokens = await this.generateTokens(user);

      // Log successful login
      await AuditService.log({
        action: 'USER_LOGIN_SUCCESS',
        userId: user.user_id,
        details: { email: user.email },
        ipAddress,
        userAgent
      });

      return {
        user: this.sanitizeUser(user),
        tokens
      };
    } catch (error) {
      throw error;
    }
  }

  async generateTokens(user) {
    const payload = {
      userId: user.user_id,
      email: user.email,
      roles: user.roles.map(role => role.role_name),
      permissions: await this.getUserPermissions(user.user_id)
    };

    const accessToken = jwt.sign(
      payload,
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
      { userId: user.user_id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    // Store refresh token in Redis
    await RedisService.setex(
      `refresh_token:${user.user_id}`,
      7 * 24 * 60 * 60, // 7 days
      refreshToken
    );

    return { accessToken, refreshToken };
  }
}
```

### 3.2 Product Catalog Service

#### 3.2.1 Database Schema
```sql
-- Categories Table
CREATE TABLE categories (
    category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    parent_category_id UUID REFERENCES categories(category_id),
    image_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products Table
CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    short_description VARCHAR(500),
    sku VARCHAR(100) UNIQUE NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    compare_price DECIMAL(10,2),
    cost_price DECIMAL(10,2),
    weight DECIMAL(8,2),
    dimensions JSONB, -- {length, width, height, unit}
    category_id UUID REFERENCES categories(category_id),
    seller_id UUID REFERENCES users(user_id),
    brand VARCHAR(100),
    tags TEXT[],
    attributes JSONB, -- Custom attributes
    is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    requires_shipping BOOLEAN DEFAULT true,
    is_taxable BOOLEAN DEFAULT true,
    tax_class VARCHAR(50),
    seo_title VARCHAR(255),
    seo_description VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Product Images Table
CREATE TABLE product_images (
    image_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(product_id) ON DELETE CASCADE,
    image_url VARCHAR(500) NOT NULL,
    alt_text VARCHAR(255),
    sort_order INTEGER DEFAULT 0,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Product Variants Table
CREATE TABLE product_variants (
    variant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(product_id) ON DELETE CASCADE,
    sku VARCHAR(100) UNIQUE NOT NULL,
    price DECIMAL(10,2),
    compare_price DECIMAL(10,2),
    cost_price DECIMAL(10,2),
    weight DECIMAL(8,2),
    attributes JSONB, -- {color: 'red', size: 'M'}
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 3.2.2 Search Implementation with Elasticsearch
```javascript
class ProductSearchService {
  constructor() {
    this.client = new Client({
      node: process.env.ELASTICSEARCH_URL,
      auth: {
        username: process.env.ES_USERNAME,
        password: process.env.ES_PASSWORD
      }
    });
  }

  async indexProduct(product) {
    const document = {
      id: product.product_id,
      name: product.name,
      description: product.description,
      short_description: product.short_description,
      sku: product.sku,
      price: product.price,
      category: product.category,
      brand: product.brand,
      tags: product.tags,
      attributes: product.attributes,
      is_active: product.is_active,
      is_featured: product.is_featured,
      created_at: product.created_at,
      updated_at: product.updated_at
    };

    await this.client.index({
      index: 'products',
      id: product.product_id,
      body: document
    });
  }

  async searchProducts(query, filters = {}, pagination = {}) {
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    const searchQuery = {
      index: 'products',
      body: {
        query: {
          bool: {
            must: [],
            filter: []
          }
        },
        sort: [],
        from: offset,
        size: limit,
        highlight: {
          fields: {
            name: {},
            description: {}
          }
        },
        aggs: {
          categories: {
            terms: { field: 'category.keyword' }
          },
          brands: {
            terms: { field: 'brand.keyword' }
          },
          price_ranges: {
            range: {
              field: 'price',
              ranges: [
                { to: 50 },
                { from: 50, to: 100 },
                { from: 100, to: 200 },
                { from: 200 }
              ]
            }
          }
        }
      }
    };

    // Add search query
    if (query) {
      searchQuery.body.query.bool.must.push({
        multi_match: {
          query: query,
          fields: [
            'name^3',
            'description^2',
            'short_description^2',
            'brand^2',
            'tags',
            'sku'
          ],
          type: 'best_fields',
          fuzziness: 'AUTO'
        }
      });
    } else {
      searchQuery.body.query.bool.must.push({
        match_all: {}
      });
    }

    // Add filters
    searchQuery.body.query.bool.filter.push({
      term: { is_active: true }
    });

    if (filters.category) {
      searchQuery.body.query.bool.filter.push({
        term: { 'category.keyword': filters.category }
      });
    }

    if (filters.brand) {
      searchQuery.body.query.bool.filter.push({
        terms: { 'brand.keyword': Array.isArray(filters.brand) ? filters.brand : [filters.brand] }
      });
    }

    if (filters.price_min || filters.price_max) {
      const priceRange = {};
      if (filters.price_min) priceRange.gte = parseFloat(filters.price_min);
      if (filters.price_max) priceRange.lte = parseFloat(filters.price_max);
      
      searchQuery.body.query.bool.filter.push({
        range: { price: priceRange }
      });
    }

    // Add sorting
    const sortOptions = {
      relevance: [],
      price_asc: [{ price: { order: 'asc' } }],
      price_desc: [{ price: { order: 'desc' } }],
      name_asc: [{ 'name.keyword': { order: 'asc' } }],
      name_desc: [{ 'name.keyword': { order: 'desc' } }],
      newest: [{ created_at: { order: 'desc' } }]
    };

    searchQuery.body.sort = sortOptions[filters.sort] || sortOptions.relevance;

    const response = await this.client.search(searchQuery);

    return {
      products: response.body.hits.hits.map(hit => ({
        ...hit._source,
        score: hit._score,
        highlights: hit.highlight
      })),
      total: response.body.hits.total.value,
      aggregations: response.body.aggregations,
      page,
      limit,
      totalPages: Math.ceil(response.body.hits.total.value / limit)
    };
  }
}
```

### 3.3 Order Management Service

#### 3.3.1 Database Schema
```sql
-- Orders Table
CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    user_id UUID REFERENCES users(user_id),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    subtotal DECIMAL(10,2) NOT NULL,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    shipping_amount DECIMAL(10,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Billing Information
    billing_first_name VARCHAR(100),
    billing_last_name VARCHAR(100),
    billing_email VARCHAR(255),
    billing_phone VARCHAR(20),
    billing_address_line1 VARCHAR(255),
    billing_address_line2 VARCHAR(255),
    billing_city VARCHAR(100),
    billing_state VARCHAR(100),
    billing_postal_code VARCHAR(20),
    billing_country VARCHAR(100),
    
    -- Shipping Information
    shipping_first_name VARCHAR(100),
    shipping_last_name VARCHAR(100),
    shipping_email VARCHAR(255),
    shipping_phone VARCHAR(20),
    shipping_address_line1 VARCHAR(255),
    shipping_address_line2 VARCHAR(255),
    shipping_city VARCHAR(100),
    shipping_state VARCHAR(100),
    shipping_postal_code VARCHAR(20),
    shipping_country VARCHAR(100),
    shipping_method VARCHAR(100),
    
    notes TEXT,
    internal_notes TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    shipped_at TIMESTAMP,
    delivered_at TIMESTAMP,
    cancelled_at TIMESTAMP
);

-- Order Items Table
CREATE TABLE order_items (
    order_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(product_id),
    variant_id UUID REFERENCES product_variants(variant_id),
    sku VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    product_snapshot JSONB, -- Store product details at time of order
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order Status History Table
CREATE TABLE order_status_history (
    history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(order_id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL,
    notes TEXT,
    created_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 3.3.2 Order Processing Workflow
```javascript
class OrderService {
  async createOrder(orderData, userId) {
    const transaction = await db.transaction();
    
    try {
      // Validate cart items
      const cartItems = await this.validateCartItems(orderData.items);
      
      // Calculate totals
      const totals = await this.calculateOrderTotals(cartItems, orderData.shippingMethod, orderData.discountCode);
      
      // Generate order number
      const orderNumber = await this.generateOrderNumber();
      
      // Create order
      const order = await Order.create({
        order_number: orderNumber,
        user_id: userId,
        status: 'pending',
        ...totals,
        ...orderData.billingAddress,
        ...orderData.shippingAddress,
        shipping_method: orderData.shippingMethod
      }, { transaction });
      
      // Create order items
      const orderItems = [];
      for (const item of cartItems) {
        const orderItem = await OrderItem.create({
          order_id: order.order_id,
          product_id: item.product_id,
          variant_id: item.variant_id,
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          unit_price: item.price,
          total_price: item.price * item.quantity,
          product_snapshot: item.productSnapshot
        }, { transaction });
        
        orderItems.push(orderItem);
        
        // Update inventory
        await this.updateInventory(item.product_id, item.variant_id, -item.quantity, transaction);
      }
      
      // Create initial status history
      await OrderStatusHistory.create({
        order_id: order.order_id,
        status: 'pending',
        notes: 'Order created',
        created_by: userId
      }, { transaction });
      
      // Clear cart
      await CartService.clearCart(userId, transaction);
      
      await transaction.commit();
      
      // Publish order created event
      await EventBus.publish('order.created', {
        orderId: order.order_id,
        userId: userId,
        total: order.total_amount
      });
      
      // Send order confirmation email
      await NotificationService.sendOrderConfirmation(order, orderItems);
      
      return {
        order,
        items: orderItems
      };
      
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
  
  async updateOrderStatus(orderId, newStatus, notes, updatedBy) {
    const transaction = await db.transaction();
    
    try {
      const order = await Order.findByPk(orderId, { transaction });
      if (!order) {
        throw new NotFoundError('Order not found');
      }
      
      const oldStatus = order.status;
      
      // Validate status transition
      if (!this.isValidStatusTransition(oldStatus, newStatus)) {
        throw new ValidationError(`Invalid status transition from ${oldStatus} to ${newStatus}`);
      }
      
      // Update order status
      await order.update({ 
        status: newStatus,
        updated_at: new Date(),
        ...(newStatus === 'shipped' && { shipped_at: new Date() }),
        ...(newStatus === 'delivered' && { delivered_at: new Date() }),
        ...(newStatus === 'cancelled' && { cancelled_at: new Date() })
      }, { transaction });
      
      // Create status history record
      await OrderStatusHistory.create({
        order_id: orderId,
        status: newStatus,
        notes: notes,
        created_by: updatedBy
      }, { transaction });
      
      // Handle inventory for cancelled orders
      if (newStatus === 'cancelled' && oldStatus !== 'cancelled') {
        await this.restoreInventoryForCancelledOrder(orderId, transaction);
      }
      
      await transaction.commit();
      
      // Publish status change event
      await EventBus.publish('order.status_changed', {
        orderId: orderId,
        oldStatus: oldStatus,
        newStatus: newStatus,
        updatedBy: updatedBy
      });
      
      // Send status update notification
      await NotificationService.sendOrderStatusUpdate(order, newStatus);
      
      return order;
      
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}
```

### 3.4 Payment Processing Service

#### 3.4.1 Database Schema
```sql
-- Payments Table
CREATE TABLE payments (
    payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(order_id),
    payment_method VARCHAR(50) NOT NULL, -- 'stripe', 'paypal', 'apple_pay', etc.
    payment_type VARCHAR(50) NOT NULL, -- 'payment', 'refund', 'partial_refund'
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    
    -- External payment provider details
    external_transaction_id VARCHAR(255),
    external_payment_id VARCHAR(255),
    provider_response JSONB,
    
    -- Payment method details (encrypted)
    payment_method_details JSONB,
    
    -- Fraud detection
    risk_score DECIMAL(3,2),
    fraud_check_result JSONB,
    
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment Methods Table (for saved payment methods)
CREATE TABLE saved_payment_methods (
    payment_method_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'card', 'bank_account'
    provider VARCHAR(50) NOT NULL, -- 'stripe', 'paypal'
    external_id VARCHAR(255) NOT NULL, -- Provider's payment method ID
    
    -- Encrypted payment method details
    last_four VARCHAR(4),
    brand VARCHAR(50), -- 'visa', 'mastercard', etc.
    exp_month INTEGER,
    exp_year INTEGER,
    
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 3.4.2 Payment Processing Implementation
```javascript
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

class PaymentService {
  async processPayment(orderData, paymentMethodData) {
    try {
      // Validate order
      const order = await Order.findByPk(orderData.orderId);
      if (!order) {
        throw new NotFoundError('Order not found');
      }
      
      if (order.status !== 'pending') {
        throw new ValidationError('Order is not in a payable state');
      }
      
      // Fraud detection
      const fraudCheck = await this.performFraudCheck(order, paymentMethodData);
      if (fraudCheck.riskScore > 0.8) {
        throw new FraudError('Payment blocked due to high risk score');
      }
      
      // Create payment record
      const payment = await Payment.create({
        order_id: order.order_id,
        payment_method: paymentMethodData.method,
        payment_type: 'payment',
        amount: order.total_amount,
        currency: order.currency,
        status: 'processing',
        risk_score: fraudCheck.riskScore,
        fraud_check_result: fraudCheck.details
      });
      
      let paymentResult;
      
      // Process payment based on method
      switch (paymentMethodData.method) {
        case 'stripe':
          paymentResult = await this.processStripePayment(payment, paymentMethodData);
          break;
        case 'paypal':
          paymentResult = await this.processPayPalPayment(payment, paymentMethodData);
          break;
        default:
          throw new ValidationError('Unsupported payment method');
      }
      
      // Update payment with result
      await payment.update({
        status: paymentResult.status,
        external_transaction_id: paymentResult.transactionId,
        external_payment_id: paymentResult.paymentId,
        provider_response: paymentResult.providerResponse,
        processed_at: new Date()
      });
      
      // Update order status if payment successful
      if (paymentResult.status === 'completed') {
        await OrderService.updateOrderStatus(
          order.order_id,
          'paid',
          'Payment completed successfully',
          'system'
        );
      }
      
      // Publish payment event
      await EventBus.publish('payment.processed', {
        paymentId: payment.payment_id,
        orderId: order.order_id,
        status: paymentResult.status,
        amount: payment.amount
      });
      
      return {
        payment,
        status: paymentResult.status,
        transactionId: paymentResult.transactionId
      };
      
    } catch (error) {
      // Log payment failure
      await AuditService.log({
        action: 'PAYMENT_FAILED',
        orderId: orderData.orderId,
        error: error.message,
        paymentMethod: paymentMethodData.method
      });
      
      throw error;
    }
  }
  
  async processStripePayment(payment, paymentMethodData) {
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(payment.amount * 100), // Convert to cents
        currency: payment.currency.toLowerCase(),
        payment_method: paymentMethodData.paymentMethodId,
        confirmation_method: 'manual',
        confirm: true,
        metadata: {
          orderId: payment.order_id,
          paymentId: payment.payment_id
        }
      });
      
      let status;
      switch (paymentIntent.status) {
        case 'succeeded':
          status = 'completed';
          break;
        case 'requires_action':
          status = 'requires_action';
          break;
        case 'processing':
          status = 'processing';
          break;
        default:
          status = 'failed';
      }
      
      return {
        status,
        transactionId: paymentIntent.id,
        paymentId: paymentIntent.id,
        providerResponse: paymentIntent,
        clientSecret: paymentIntent.client_secret
      };
      
    } catch (error) {
      return {
        status: 'failed',
        error: error.message,
        providerResponse: error
      };
    }
  }
  
  async performFraudCheck(order, paymentMethodData) {
    // Implement fraud detection logic
    let riskScore = 0;
    const details = {};
    
    // Check for suspicious patterns
    const recentOrders = await Order.count({
      where: {
        user_id: order.user_id,
        created_at: {
          [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      }
    });
    
    if (recentOrders > 5) {
      riskScore += 0.3;
      details.highFrequency = true;
    }
    
    // Check order amount
    if (order.total_amount > 1000) {
      riskScore += 0.2;
      details.highAmount = true;
    }
    
    // Check shipping vs billing address mismatch
    if (order.billing_country !== order.shipping_country) {
      riskScore += 0.1;
      details.addressMismatch = true;
    }
    
    return {
      riskScore: Math.min(riskScore, 1.0),
      details
    };
  }
}
```

## 4. SEQUENCE DIAGRAMS

### 4.1 User Registration Flow
```
User          Web App       API Gateway    Auth Service    Database      Email Service
 │              │              │              │              │              │
 │─Register────▶│              │              │              │              │
 │              │─POST /auth──▶│              │              │              │
 │              │  /register   │              │              │              │
 │              │              │─Validate────▶│              │              │
 │              │              │  Request     │              │              │
 │              │              │              │─Hash────────▶│              │
 │              │              │              │  Password    │              │
 │              │              │              │              │              │
 │              │              │              │─Create──────▶│              │
 │              │              │              │  User        │              │
 │              │              │              │              │─User────────▶│
 │              │              │              │              │  Created     │
 │              │              │              │─Generate────▶│              │
 │              │              │              │  Token       │              │
 │              │              │              │              │              │
 │              │              │              │─Send────────────────────────▶│
 │              │              │              │  Verification               │
 │              │              │              │  Email                      │
 │              │              │              │              │              │
 │              │              │◀─Success────│              │              │
 │              │◀─201 Created─│  Response    │              │              │
 │◀─Success────│              │              │              │              │
 │  Message     │              │              │              │              │
```

### 4.2 Product Search Flow
```
User          Web App       API Gateway    Product Service  Elasticsearch  Database
 │              │              │              │              │              │
 │─Search──────▶│              │              │              │              │
 │  "laptop"    │              │              │              │              │
 │              │─GET /products│              │              │              │
 │              │  ?q=laptop   │              │              │              │
 │              │              │─Validate────▶│              │              │
 │              │              │  & Route     │              │              │
 │              │              │              │─Search──────▶│              │
 │              │              │              │  Query       │              │
 │              │              │              │              │─Results─────▶│
 │              │              │              │              │              │
 │              │              │              │─Enrich──────▶│              │
 │              │              │              │  Results     │              │
 │              │              │              │              │─Product─────▶│
 │              │              │              │              │  Details     │
 │              │              │              │              │              │
 │              │              │◀─Search─────│              │              │
 │              │◀─200 OK─────│  Results     │              │              │
 │◀─Display────│              │              │              │              │
 │  Results     │              │              │              │              │
```

### 4.3 Order Processing Flow
```
User     Web App   API Gateway  Order Service  Payment Service  Inventory  Notification
 │         │          │            │              │               │          │
 │─Checkout▶│          │            │              │               │          │
 │         │─POST─────▶│            │              │               │          │
 │         │ /orders   │            │              │               │          │
 │         │           │─Validate──▶│              │               │          │
 │         │           │            │─Validate────▶│               │          │
 │         │           │            │  Cart Items  │               │          │
 │         │           │            │              │               │          │
 │         │           │            │─Check───────────────────────▶│          │
 │         │           │            │  Inventory                   │          │
 │         │           │            │              │               │─Stock───▶│
 │         │           │            │              │               │  OK      │
 │         │           │            │              │               │          │
 │         │           │            │─Create──────▶│               │          │
 │         │           │            │  Payment     │               │          │
 │         │           │            │              │─Process──────▶│          │
 │         │           │            │              │  Payment      │          │
 │         │           │            │              │               │          │
 │         │           │            │◀─Payment─────│               │          │
 │         │           │            │  Success     │               │          │
 │         │           │            │              │               │          │
 │         │           │            │─Update──────────────────────▶│          │
 │         │           │            │  Inventory                   │          │
 │         │           │            │              │               │          │
 │         │           │            │─Send────────────────────────────────────▶│
 │         │           │            │  Confirmation                            │
 │         │           │            │              │               │          │
 │         │           │◀─Order─────│              │               │          │
 │         │◀─201─────│  Created    │              │               │          │
 │◀─Success│          │            │              │               │          │
```

## 5. DATA FLOW ARCHITECTURE

### 5.1 Request Processing Flow
```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CLIENT REQUEST                                │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                │
│  │   Web App   │    │ Mobile App  │    │   Admin     │                │
│  │   (React)   │    │   (PWA)     │    │  Dashboard  │                │
│  └─────────────┘    └─────────────┘    └─────────────┘                │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         API GATEWAY                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │    SSL/TLS  │  │Rate Limiting│  │   Request   │  │Authentication│    │
│  │ Termination │  │& Throttling │  │   Routing   │  │& Authorization│    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      MICROSERVICES LAYER                               │
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │    User     │  │   Product   │  │    Order    │  │   Payment   │    │
│  │   Service   │  │   Service   │  │   Service   │  │   Service   │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │    Cart     │  │ Inventory   │  │Notification │  │  Analytics  │    │
│  │   Service   │  │   Service   │  │   Service   │  │   Service   │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                                      │
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ PostgreSQL  │  │    Redis    │  │Elasticsearch│  │   AWS S3    │    │
│  │ (Primary)   │  │   (Cache)   │  │  (Search)   │  │ (Storage)   │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Event-Driven Data Flow
```
┌─────────────────────────────────────────────────────────────────────────┐
│                        EVENT BUS (Apache Kafka)                        │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                │               │               │
                ▼               ▼               ▼
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │   Order Events  │ │ Payment Events  │ │Inventory Events │
    │                 │ │                 │ │                 │
    │ • order.created │ │ • payment.      │ │ • stock.low     │
    │ • order.paid    │ │   processed     │ │ • stock.out     │
    │ • order.shipped │ │ • payment.      │ │ • stock.        │
    │ • order.        │ │   failed        │ │   replenished   │
    │   delivered     │ │ • refund.       │ │                 │
    │ • order.        │ │   processed     │ │                 │
    │   cancelled     │ │                 │ │                 │
    └─────────────────┘ └─────────────────┘ └─────────────────┘
                │               │               │
                └───────────────┼───────────────┘
                                │
                                ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                   EVENT CONSUMERS                          │
    │                                                             │
    │  • Notification Service (Email/SMS)                        │
    │  • Analytics Service (Data Processing)                     │
    │  • Inventory Service (Stock Management)                    │
    │  • Audit Service (Compliance Logging)                     │
    │  • Recommendation Service (ML Processing)                  │
    └─────────────────────────────────────────────────────────────┘
```

## 6. SECURITY IMPLEMENTATION

### 6.1 Authentication & Authorization
```javascript
// JWT Token Structure
const tokenPayload = {
  userId: 'uuid',
  email: 'user@example.com',
  roles: ['customer', 'seller'],
  permissions: [
    'product:read',
    'order:create',
    'order:read:own'
  ],
  iat: 1640995200,
  exp: 1640998800
};

// RBAC Middleware
const rbacMiddleware = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) {
        return res.status(401).json({ error: 'Access token required' });
      }

      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      req.user = decoded;

      // Check if user has required permission
      if (!hasPermission(decoded.permissions, requiredPermission, req)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
};

// Permission checking with context
const hasPermission = (userPermissions, requiredPermission, req) => {
  // Direct permission match
  if (userPermissions.includes(requiredPermission)) {
    return true;
  }

  // Context-aware permissions (e.g., own resources)
  if (requiredPermission.includes(':own')) {
    const basePermission = requiredPermission.replace(':own', '');
    if (userPermissions.includes(basePermission + ':own')) {
      // Additional check for resource ownership
      return checkResourceOwnership(req.user.userId, req.params.id, req.route.path);
    }
  }

  return false;
};
```

### 6.2 Data Encryption
```javascript
const crypto = require('crypto');

class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32;
    this.ivLength = 16;
    this.tagLength = 16;
  }

  encrypt(text, key = process.env.ENCRYPTION_KEY) {
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

  decrypt(encryptedData, key = process.env.ENCRYPTION_KEY) {
    const { encrypted, iv, tag } = encryptedData;
    
    const decipher = crypto.createDecipher(
      this.algorithm,
      key,
      Buffer.from(iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  // Hash sensitive data (one-way)
  hash(data, salt = null) {
    if (!salt) {
      salt = crypto.randomBytes(16).toString('hex');
    }
    
    const hash = crypto.pbkdf2Sync(data, salt, 10000, 64, 'sha512');
    
    return {
      hash: hash.toString('hex'),
      salt
    };
  }
}
```

### 6.3 Input Validation & Sanitization
```javascript
const Joi = require('joi');
const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const window = new JSDOM('').window;
const purify = DOMPurify(window);

// Validation Schemas
const userRegistrationSchema = Joi.object({
  email: Joi.string().email().required().max(255),
  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .messages({
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    }),
  firstName: Joi.string().trim().min(1).max(100).required(),
  lastName: Joi.string().trim().min(1).max(100).required(),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
  dateOfBirth: Joi.date().max('now').optional()
});

const productSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).required(),
  description: Joi.string().max(5000).optional(),
  price: Joi.number().positive().precision(2).required(),
  categoryId: Joi.string().uuid().required(),
  sku: Joi.string().alphanum().min(3).max(50).required(),
  tags: Joi.array().items(Joi.string().trim().max(50)).max(10).optional()
});

// Input Validation Middleware
const validateInput = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    req.body = value;
    next();
  };
};

// Output Sanitization
const sanitizeOutput = (data) => {
  if (typeof data === 'string') {
    return purify.sanitize(data);
  }
  
  if (Array.isArray(data)) {
    return data.map(sanitizeOutput);
  }
  
  if (typeof data === 'object' && data !== null) {
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      sanitized[key] = sanitizeOutput(value);
    }
    return sanitized;
  }
  
  return data;
};

// SQL Injection Prevention (using parameterized queries)
const getUserOrders = async (userId, filters) => {
  const query = `
    SELECT o.*, oi.product_name, oi.quantity, oi.unit_price
    FROM orders o
    JOIN order_items oi ON o.order_id = oi.order_id
    WHERE o.user_id = $1
    AND o.created_at >= $2
    AND o.status = $3
    ORDER BY o.created_at DESC
    LIMIT $4 OFFSET $5
  `;
  
  const values = [
    userId,
    filters.startDate,
    filters.status,
    filters.limit || 20,
    filters.offset || 0
  ];
  
  return await db.query(query, values);
};
```

## 7. PERFORMANCE OPTIMIZATION

### 7.1 Caching Strategy
```javascript
const Redis = require('redis');
const client = Redis.createClient({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD
});

class CacheService {
  // Multi-level caching
  async get(key, fallbackFn, ttl = 3600) {
    try {
      // L1 Cache: In-memory (Node.js process)
      if (this.memoryCache.has(key)) {
        return this.memoryCache.get(key);
      }
      
      // L2 Cache: Redis
      const cached = await client.get(key);
      if (cached) {
        const data = JSON.parse(cached);
        // Store in L1 cache
        this.memoryCache.set(key, data, 300); // 5 minutes
        return data;
      }
      
      // L3: Database/API call
      if (fallbackFn) {
        const data = await fallbackFn();
        // Store in both caches
        await this.set(key, data, ttl);
        return data;
      }
      
      return null;
    } catch (error) {
      console.error('Cache get error:', error);
      return fallbackFn ? await fallbackFn() : null;
    }
  }
  
  async set(key, data, ttl = 3600) {
    try {
      // Store in Redis
      await client.setex(key, ttl, JSON.stringify(data));
      // Store in memory cache
      this.memoryCache.set(key, data, Math.min(ttl, 300));
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }
  
  // Cache invalidation patterns
  async invalidatePattern(pattern) {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  }
  
  // Product cache with tags
  async cacheProduct(product) {
    const key = `product:${product.product_id}`;
    const tags = [
      `category:${product.category_id}`,
      `seller:${product.seller_id}`,
      'products:all'
    ];
    
    await this.set(key, product, 3600);
    
    // Store cache tags for invalidation
    for (const tag of tags) {
      await client.sadd(`tag:${tag}`, key);
    }
  }
  
  async invalidateByTag(tag) {
    const keys = await client.smembers(`tag:${tag}`);
    if (keys.length > 0) {
      await client.del(...keys);
      await client.del(`tag:${tag}`);
    }
  }
}

// Usage in Product Service
class ProductService {
  async getProduct(productId) {
    return await CacheService.get(
      `product:${productId}`,
      () => Product.findByPk(productId),
      3600 // 1 hour
    );
  }
  
  async updateProduct(productId, updateData) {
    const product = await Product.update(updateData, {
      where: { product_id: productId },
      returning: true
    });
    
    // Invalidate related caches
    await CacheService.invalidateByTag(`category:${product.category_id}`);
    await CacheService.invalidateByTag(`seller:${product.seller_id}`);
    await CacheService.invalidatePattern(`search:*`);
    
    return product;
  }
}
```

### 7.2 Database Optimization
```sql
-- Optimized indexes for common queries

-- User queries
CREATE INDEX CONCURRENTLY idx_users_email ON users(email) WHERE is_active = true;
CREATE INDEX CONCURRENTLY idx_users_created_at ON users(created_at DESC);

-- Product queries
CREATE INDEX CONCURRENTLY idx_products_category ON products(category_id) WHERE is_active = true;
CREATE INDEX CONCURRENTLY idx_products_seller ON products(seller_id) WHERE is_active = true;
CREATE INDEX CONCURRENTLY idx_products_price ON products(price) WHERE is_active = true;
CREATE INDEX CONCURRENTLY idx_products_featured ON products(is_featured, created_at DESC) WHERE is_active = true;
CREATE INDEX CONCURRENTLY idx_products_search ON products USING gin(to_tsvector('english', name || ' ' || description));

-- Order queries
CREATE INDEX CONCURRENTLY idx_orders_user_status ON orders(user_id, status, created_at DESC);
CREATE INDEX CONCURRENTLY idx_orders_status_created ON orders(status, created_at DESC);
CREATE INDEX CONCURRENTLY idx_order_items_product ON order_items(product_id);

-- Payment queries
CREATE INDEX CONCURRENTLY idx_payments_order ON payments(order_id, status);
CREATE INDEX CONCURRENTLY idx_payments_status_created ON payments(status, created_at DESC);

-- Composite indexes for complex queries
CREATE INDEX CONCURRENTLY idx_products_category_price_created ON products(category_id, price, created_at DESC) WHERE is_active = true;

-- Partial indexes for better performance
CREATE INDEX CONCURRENTLY idx_orders_pending ON orders(created_at DESC) WHERE status = 'pending';
CREATE INDEX CONCURRENTLY idx_products_low_stock ON products(product_id) WHERE stock_quantity < 10 AND is_active = true;

-- Database partitioning for large tables
CREATE TABLE orders_2024 PARTITION OF orders
FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

CREATE TABLE audit_logs_2024_01 PARTITION OF audit_logs
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

### 7.3 API Performance Optimization
```javascript
// Response compression
const compression = require('compression');
app.use(compression());

// Request rate limiting
const rateLimit = require('express-rate-limit');

const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });
};

// Different limits for different endpoints
app.use('/api/auth/login', createRateLimiter(15 * 60 * 1000, 5, 'Too many login attempts'));
app.use('/api/auth/register', createRateLimiter(60 * 60 * 1000, 3, 'Too many registration attempts'));
app.use('/api/', createRateLimiter(15 * 60 * 1000, 100, 'Too many requests'));

// Response pagination
class PaginationHelper {
  static paginate(query, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    return {
      ...query,
      limit: Math.min(limit, 100), // Max 100 items per page
      offset
    };
  }
  
  static formatResponse(data, total, page, limit) {
    const totalPages = Math.ceil(total / limit);
    return {
      data,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    };
  }
}

// Efficient data loading with includes
class ProductController {
  async getProducts(req, res) {
    const { page = 1, limit = 20, category, search } = req.query;
    
    const whereClause = { is_active: true };
    if (category) whereClause.category_id = category;
    
    const query = {
      where: whereClause,
      include: [
        {
          model: Category,
          attributes: ['name', 'slug']
        },
        {
          model: ProductImage,
          where: { is_primary: true },
          required: false,
          attributes: ['image_url', 'alt_text']
        }
      ],
      attributes: {
        exclude: ['created_at', 'updated_at'] // Reduce payload size
      },
      order: [['created_at', 'DESC']],
      ...PaginationHelper.paginate({}, page, limit)
    };
    
    if (search) {
      // Use Elasticsearch for search instead of database LIKE queries
      return this.searchProducts(req, res);
    }
    
    const { count, rows } = await Product.findAndCountAll(query);
    
    res.json(PaginationHelper.formatResponse(rows, count, page, limit));
  }
}
```

## 8. MONITORING & OBSERVABILITY

### 8.1 Application Monitoring
```javascript
const prometheus = require('prom-client');
const winston = require('winston');

// Metrics collection
class MetricsService {
  constructor() {
    // Create metrics
    this.httpRequestDuration = new prometheus.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
    });
    
    this.httpRequestTotal = new prometheus.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code']
    });
    
    this.databaseQueryDuration = new prometheus.Histogram({
      name: 'database_query_duration_seconds',
      help: 'Duration of database queries in seconds',
      labelNames: ['operation', 'table'],
      buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5]
    });
    
    this.activeUsers = new prometheus.Gauge({
      name: 'active_users_total',
      help: 'Number of active users'
    });
    
    this.orderTotal = new prometheus.Counter({
      name: 'orders_total',
      help: 'Total number of orders',
      labelNames: ['status']
    });
    
    this.revenueTotal = new prometheus.Counter({
      name: 'revenue_total',
      help: 'Total revenue in USD'
    });
  }
  
  // Middleware to track HTTP requests
  trackHttpRequests() {
    return (req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        const route = req.route ? req.route.path : req.path;
        
        this.httpRequestDuration
          .labels(req.method, route, res.statusCode)
          .observe(duration);
          
        this.httpRequestTotal
          .labels(req.method, route, res.statusCode)
          .inc();
      });
      
      next();
    };
  }
  
  // Track business metrics
  trackOrder(order) {
    this.orderTotal.labels(order.status).inc();
    if (order.status === 'completed') {
      this.revenueTotal.inc(order.total_amount);
    }
  }
  
  // Update active users (called periodically)
  async updateActiveUsers() {
    const count = await RedisService.scard('active_users');
    this.activeUsers.set(count);
  }
}

// Structured logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return JSON.stringify({
        timestamp,
        level,
        message,
        service: 'ecommerce-api',
        version: process.env.APP_VERSION,
        environment: process.env.NODE_ENV,
        ...meta
      });
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log' 
    })
  ]
});

// Health check endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.APP_VERSION,
    checks: {}
  };
  
  try {
    // Database health
    await db.authenticate();
    health.checks.database = { status: 'ok' };
  } catch (error) {
    health.checks.database = { status: 'error', message: error.message };
    health.status = 'error';
  }
  
  try {
    // Redis health
    await RedisService.ping();
    health.checks.redis = { status: 'ok' };
  } catch (error) {
    health.checks.redis = { status: 'error', message: error.message };
    health.status = 'error';
  }
  
  try {
    // Elasticsearch health
    await ElasticsearchService.ping();
    health.checks.elasticsearch = { status: 'ok' };
  } catch (error) {
    health.checks.elasticsearch = { status: 'error', message: error.message };
    health.status = 'error';
  }
  
  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});
```

### 8.2 Error Handling & Alerting
```javascript
// Custom error classes
class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = []) {
    super(message, 400);
    this.details = details;
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

// Global error handler
const errorHandler = (error, req, res, next) => {
  let err = { ...error };
  err.message = error.message;
  
  // Log error
  logger.error('Error occurred', {
    error: {
      message: err.message,
      stack: err.stack,
      statusCode: err.statusCode
    },
    request: {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      user: req.user?.userId
    }
  });
  
  // Mongoose validation error
  if (error.name === 'ValidationError') {
    const message = Object.values(error.errors).map(val => val.message).join(', ');
    err = new ValidationError(message);
  }
  
  // Mongoose duplicate key error
  if (error.code === 11000) {
    const field = Object.keys(error.keyValue)[0];
    err = new ValidationError(`${field} already exists`);
  }
  
  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    err = new UnauthorizedError('Invalid token');
  }
  
  if (error.name === 'TokenExpiredError') {
    err = new UnauthorizedError('Token expired');
  }
  
  // Send error response
  res.status(err.statusCode || 500).json({
    success: false,
    error: {
      message: err.message || 'Internal Server Error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
      ...(err.details && { details: err.details })
    }
  });
};

// Unhandled promise rejection handler
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection', { error: err });
  
  // Send alert
  AlertService.sendCriticalAlert({
    type: 'unhandled_rejection',
    message: err.message,
    stack: err.stack
  });
  
  // Graceful shutdown
  server.close(() => {
    process.exit(1);
  });
});

// Uncaught exception handler
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err });
  
  AlertService.sendCriticalAlert({
    type: 'uncaught_exception',
    message: err.message,
    stack: err.stack
  });
  
  process.exit(1);
});
```

## 9. DEPLOYMENT & DEVOPS

### 9.1 Docker Configuration
```dockerfile
# Multi-stage Dockerfile for Node.js microservice
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Build application (if needed)
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Create app user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

WORKDIR /app

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Start application
CMD ["node", "dist/index.js"]
```

### 9.2 Kubernetes Deployment
```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ecommerce-api
  labels:
    app: ecommerce-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ecommerce-api
  template:
    metadata:
      labels:
        app: ecommerce-api
    spec:
      containers:
      - name: ecommerce-api
        image: ecommerce/api:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-secret
              key: url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: redis-secret
              key: url
        - name: JWT_ACCESS_SECRET
          valueFrom:
            secretKeyRef:
              name: jwt-secret
              key: access-secret
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: ecommerce-api-service
spec:
  selector:
    app: ecommerce-api
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: ClusterIP
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ecommerce-api-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
spec:
  tls:
  - hosts:
    - api.ecommerce.com
    secretName: ecommerce-api-tls
  rules:
  - host: api.ecommerce.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: ecommerce-api-service
            port:
              number: 80
```

### 9.3 CI/CD Pipeline
```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test_db
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run linting
      run: npm run lint
    
    - name: Run type checking
      run: npm run type-check
    
    - name: Run unit tests
      run: npm run test:unit
      env:
        DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db
        REDIS_URL: redis://localhost:6379
    
    - name: Run integration tests
      run: npm run test:integration
      env:
        DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db
        REDIS_URL: redis://localhost:6379
    
    - name: Generate test coverage
      run: npm run test:coverage
    
    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3

  security:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Run security audit
      run: npm audit --audit-level high
    
    - name: Run SAST scan
      uses: github/super-linter@v4
      env:
        DEFAULT_BRANCH: main
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    
    - name: Run dependency check
      uses: dependency-check/Dependency-Check_Action@main
      with:
        project: 'ecommerce-api'
        path: '.'
        format: 'ALL'

  build:
    needs: [test, security]
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Log in to Container Registry
      uses: docker/login-action@v2
      with:
        registry: ${{ env.REGISTRY }}
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}
    
    - name: Extract metadata
      id: meta
      uses: docker/metadata-action@v4
      with:
        images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
        tags: |
          type=ref,event=branch
          type=ref,event=pr
          type=sha,prefix={{branch}}-
          type=raw,value=latest,enable={{is_default_branch}}
    
    - name: Build and push Docker image
      uses: docker/build-push-action@v4
      with:
        context: .
        push: true
        tags: ${{ steps.meta.outputs.tags }}
        labels: ${{ steps.meta.outputs.labels }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Deploy to Kubernetes
      uses: azure/k8s-deploy@v1
      with:
        manifests: |
          k8s/deployment.yaml
          k8s/service.yaml
          k8s/ingress.yaml
        images: |
          ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
        kubeconfig: ${{ secrets.KUBE_CONFIG }}
    
    - name: Run smoke tests
      run: |
        sleep 30 # Wait for deployment
        npm run test:smoke
      env:
        API_BASE_URL: https://api.ecommerce.com
```

## 10. TESTING STRATEGY

### 10.1 Unit Tests
```javascript
// tests/services/AuthService.test.js
const { AuthService } = require('../../src/services/AuthService');
const { User } = require('../../src/models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

jest.mock('../../src/models/User');
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');

describe('AuthService', () => {
  let authService;
  
  beforeEach(() => {
    authService = new AuthService();
    jest.clearAllMocks();
  });
  
  describe('register', () => {
    it('should successfully register a new user', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'John',
        lastName: 'Doe'
      };
      
      User.findOne.mockResolvedValue(null);
      bcrypt.hash.mockResolvedValue('hashedPassword');
      User.create.mockResolvedValue({
        user_id: 'uuid-123',
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName
      });
      
      // Act
      const result = await authService.register(userData);
      
      // Assert
      expect(User.findOne).toHaveBeenCalledWith({ email: userData.email });
      expect(bcrypt.hash).toHaveBeenCalledWith(userData.password, 12);
      expect(User.create).toHaveBeenCalledWith(expect.objectContaining({
        email: userData.email,
        password_hash: 'hashedPassword'
      }));
      expect(result.user).toBeDefined();
      expect(result.message).toContain('Registration successful');
    });
    
    it('should throw error if user already exists', async () => {
      // Arrange
      const userData = {
        email: 'existing@example.com',
        password: 'Password123!'
      };
      
      User.findOne.mockResolvedValue({ email: userData.email });
      
      // Act & Assert
      await expect(authService.register(userData))
        .rejects
        .toThrow('User already exists with this email');
    });
  });
  
  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
      // Arrange
      const email = 'test@example.com';
      const password = 'Password123!';
      const user = {
        user_id: 'uuid-123',
        email,
        password_hash: 'hashedPassword',
        is_active: true,
        email_verified: true,
        roles: [{ role_name: 'customer' }]
      };
      
      User.findOne.mockResolvedValue(user);
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('mock-token');
      
      // Act
      const result = await authService.login(email, password, '127.0.0.1', 'test-agent');
      
      // Assert
      expect(User.findOne).toHaveBeenCalledWith({
        email: email.toLowerCase(),
        is_active: true
      });
      expect(bcrypt.compare).toHaveBeenCalledWith(password, user.password_hash);
      expect(result.user).toBeDefined();
      expect(result.tokens).toBeDefined();
    });
    
    it('should throw error for invalid credentials', async () => {
      // Arrange
      User.findOne.mockResolvedValue(null);
      
      // Act & Assert
      await expect(authService.login('test@example.com', 'wrongpassword', '127.0.0.1', 'test-agent'))
        .rejects
        .toThrow('Invalid credentials');
    });
  });
});
```

### 10.2 Integration Tests
```javascript
// tests/integration/auth.test.js
const request = require('supertest');
const app = require('../../src/app');
const { User } = require('../../src/models/User');
const { setupTestDB, cleanupTestDB } = require('../helpers/database');

describe('Auth Integration Tests', () => {
  beforeAll(async () => {
    await setupTestDB();
  });
  
  afterAll(async () => {
    await cleanupTestDB();
  });
  
  beforeEach(async () => {
    await User.destroy({ where: {}, force: true });
  });
  
  describe('POST /api/v1/auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'John',
        lastName: 'Doe'
      };
      
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(201);
      
      expect(response.body.success).toBe(true);
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.user.password_hash).toBeUndefined();
      
      // Verify user was created in database
      const user = await User.findOne({ where: { email: userData.email } });
      expect(user).toBeTruthy();
      expect(user.email_verified).toBe(false);
    });
    
    it('should return validation errors for invalid data', async () => {
      const invalidData = {
        email: 'invalid-email',
        password: '123', // Too short
        firstName: '', // Empty
        lastName: 'Doe'
      };
      
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(invalidData)
        .expect(400);
      
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toHaveLength(3);
    });
  });
  
  describe('POST /api/v1/auth/login', () => {
    let user;
    
    beforeEach(async () => {
      // Create a verified user for login tests
      user = await User.create({
        email: 'test@example.com',
        password_hash: await bcrypt.hash('Password123!', 12),
        firstName: 'John',
        lastName: 'Doe',
        is_active: true,
        email_verified: true
      });
    });
    
    it('should login successfully with valid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'Password123!'
      };
      
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.user.email).toBe(loginData.email);
      expect(response.body.tokens.accessToken).toBeDefined();
      expect(response.body.tokens.refreshToken).toBeDefined();
    });
    
    it('should fail login with invalid password', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'WrongPassword'
      };
      
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(401);
      
      expect(response.body.error.message).toBe('Invalid credentials');
    });
  });
});
```

### 10.3 End-to-End Tests
```javascript
// tests/e2e/user-journey.test.js
const { chromium } = require('playwright');
const { expect } = require('@playwright/test');

describe('User Journey E2E Tests', () => {
  let browser, context, page;
  
  beforeAll(async () => {
    browser = await chromium.launch();
    context = await browser.newContext();
    page = await context.newPage();
  });
  
  afterAll(async () => {
    await browser.close();
  });
  
  test('Complete user registration and purchase flow', async () => {
    // 1. Visit homepage
    await page.goto('http://localhost:3000');
    await expect(page.locator('h1')).toContainText('Welcome to Our Store');
    
    // 2. Register new user
    await page.click('[data-testid="register-button"]');
    await page.fill('[data-testid="email-input"]', 'e2e@example.com');
    await page.fill('[data-testid="password-input"]', 'Password123!');
    await page.fill('[data-testid="firstName-input"]', 'John');
    await page.fill('[data-testid="lastName-input"]', 'Doe');
    await page.click('[data-testid="submit-register"]');
    
    // 3. Verify registration success
    await expect(page.locator('[data-testid="success-message"]'))
      .toContainText('Registration successful');
    
    // 4. Search for products
    await page.fill('[data-testid="search-input"]', 'laptop');
    await page.press('[data-testid="search-input"]', 'Enter');
    
    // 5. Add product to cart
    await page.click('[data-testid="product-card"]:first-child');
    await page.click('[data-testid="add-to-cart"]');
    
    // 6. Verify cart update
    await expect(page.locator('[data-testid="cart-count"]')).toContainText('1');
    
    // 7. Proceed to checkout
    await page.click('[data-testid="cart-icon"]');
    await page.click('[data-testid="checkout-button"]');
    
    // 8. Fill shipping information
    await page.fill('[data-testid="shipping-address"]', '123 Test Street');
    await page.fill('[data-testid="shipping-city"]', 'Test City');
    await page.fill('[data-testid="shipping-zip"]', '12345');
    
    // 9. Select payment method
    await page.click('[data-testid="payment-card"]');
    await page.fill('[data-testid="card-number"]', '4242424242424242');
    await page.fill('[data-testid="card-expiry"]', '12/25');
    await page.fill('[data-testid="card-cvc"]', '123');
    
    // 10. Complete order
    await page.click('[data-testid="place-order"]');
    
    // 11. Verify order confirmation
    await expect(page.locator('[data-testid="order-confirmation"]'))
      .toContainText('Order placed successfully');
    
    // 12. Check order in account
    await page.click('[data-testid="account-menu"]');
    await page.click('[data-testid="my-orders"]');
    await expect(page.locator('[data-testid="order-item"]')).toHaveCount(1);
  });
});
```

## 11. COMPLIANCE & AUDIT IMPLEMENTATION

### 11.1 Audit Logging System
```javascript
class AuditService {
  static async log(auditData) {
    const auditEntry = {
      audit_id: uuidv4(),
      timestamp: new Date(),
      user_id: auditData.userId || null,
      session_id: auditData.sessionId || null,
      action: auditData.action,
      resource_type: auditData.resourceType || null,
      resource_id: auditData.resourceId || null,
      old_values: auditData.oldValues || null,
      new_values: auditData.newValues || null,
      ip_address: auditData.ipAddress || null,
      user_agent: auditData.userAgent || null,
      status: auditData.status || 'success',
      error_message: auditData.errorMessage || null,
      additional_data: auditData.additionalData || null
    };
    
    // Store in database
    await AuditLog.create(auditEntry);
    
    // Also send to external audit system for compliance
    await this.sendToExternalAuditSystem(auditEntry);
    
    // Real-time monitoring for critical actions
    if (this.isCriticalAction(auditData.action)) {
      await AlertService.sendSecurityAlert(auditEntry);
    }
  }
  
  static isCriticalAction(action) {
    const criticalActions = [
      'USER_LOGIN_FAILED',
      'ADMIN_ACCESS',
      'DATA_EXPORT',
      'PAYMENT_FAILED',
      'SECURITY_BREACH',
      'UNAUTHORIZED_ACCESS'
    ];
    return criticalActions.includes(action);
  }
  
  static async generateComplianceReport(startDate, endDate) {
    const auditLogs = await AuditLog.findAll({
      where: {
        timestamp: {
          [Op.between]: [startDate, endDate]
        }
      },
      order: [['timestamp', 'DESC']]
    });
    
    return {
      period: { startDate, endDate },
      totalEvents: auditLogs.length,
      eventsByAction: this.groupByAction(auditLogs),
      securityEvents: auditLogs.filter(log => this.isCriticalAction(log.action)),
      dataAccessEvents: auditLogs.filter(log => log.action.includes('DATA_')),
      userActivities: this.groupByUser(auditLogs),
      complianceScore: this.calculateComplianceScore(auditLogs)
    };
  }
}
```

## FINAL IMPLEMENTATION SUMMARY

This comprehensive Low-Level Design document provides:

1. **Complete System Architecture** - Microservices-based design with clear separation of concerns
2. **Detailed Database Schemas** - Optimized for performance and scalability
3. **Security Implementation** - Multi-layered security with encryption, authentication, and authorization
4. **Performance Optimization** - Caching strategies, database optimization, and monitoring
5. **Compliance Features** - Audit logging, data retention, and regulatory compliance
6. **Testing Strategy** - Comprehensive unit, integration, and E2E testing
7. **DevOps Implementation** - CI/CD pipelines, containerization, and Kubernetes deployment
8. **Monitoring & Observability** - Metrics collection, logging, and alerting

The design ensures:
- **Scalability**: Handles 100K+ concurrent users
- **Security**: Enterprise-grade security controls
- **Performance**: Sub-2 second response times
- **Reliability**: 99.9% uptime with fault tolerance
- **Compliance**: SOC2, ISO27001, and GDPR compliance
- **Maintainability**: Clean architecture with comprehensive testing