# Low-Level Design Document - DavTest10 Online Shopping Platform

## Executive Summary

This Low-Level Design (LLD) document provides detailed technical specifications for implementing the DavTest10 Online Shopping Platform based on the High-Level Design requirements. The document covers component specifications, data flows, sequence diagrams, API contracts, database schemas, and implementation details for a secure, scalable e-commerce platform.

## Component Specifications

### 1. API Gateway Component

#### Technical Specifications
- **Technology Stack:** Kong Gateway with Lua plugins
- **Deployment:** Kubernetes with 3+ replicas for HA
- **Load Balancer:** NGINX with SSL termination
- **Rate Limiting:** Redis-backed sliding window algorithm

#### Configuration Details
```yaml
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: rate-limiting-plugin
config:
  minute: 100
  hour: 1000
  policy: redis
  redis_host: redis-cluster.default.svc.cluster.local
  redis_port: 6379
```

#### Security Implementation
```javascript
// JWT Validation Plugin
const jwt = require('jsonwebtoken');

function validateJWT(token, secret) {
  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ['RS256'],
      issuer: 'shopping-platform',
      audience: 'api-gateway'
    });
    return { valid: true, payload: decoded };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}
```

### 2. User Service Component

#### Database Schema
```sql
-- Users table
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(255) NOT NULL,
    role_id UUID REFERENCES roles(role_id),
    is_active BOOLEAN DEFAULT true,
    failed_login_attempts INTEGER DEFAULT 0,
    last_login_attempt TIMESTAMP,
    account_locked_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- User profiles table
CREATE TABLE user_profiles (
    profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    date_of_birth DATE,
    address JSONB,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Roles table
CREATE TABLE roles (
    role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Permissions table
CREATE TABLE permissions (
    permission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    resource VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Role permissions mapping
CREATE TABLE role_permissions (
    role_id UUID REFERENCES roles(role_id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(permission_id) ON DELETE CASCADE,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, permission_id)
);
```

#### API Endpoints Implementation
```javascript
// User Registration Endpoint
app.post('/api/v1/users/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;
    
    // Input validation
    const validationResult = validateRegistrationInput({
      email, password, firstName, lastName, phone
    });
    
    if (!validationResult.isValid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationResult.errors
      });
    }
    
    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        error: 'User already exists'
      });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);
    
    // Create user transaction
    const result = await db.transaction(async (trx) => {
      const user = await User.create({
        email,
        passwordHash,
        salt,
        roleId: await Role.getDefaultRoleId('consumer')
      }, trx);
      
      const profile = await UserProfile.create({
        userId: user.userId,
        firstName,
        lastName,
        phone
      }, trx);
      
      return { user, profile };
    });
    
    // Generate JWT token
    const token = generateJWT({
      userId: result.user.userId,
      email: result.user.email,
      role: 'consumer'
    });
    
    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        userId: result.user.userId,
        email: result.user.email,
        profile: result.profile
      }
    });
    
  } catch (error) {
    logger.error('Registration failed', { error: error.message, email });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User Authentication Endpoint
app.post('/api/v1/users/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Rate limiting check
    const rateLimitKey = `login_attempts:${req.ip}`;
    const attempts = await redis.get(rateLimitKey);
    
    if (attempts && parseInt(attempts) >= 5) {
      return res.status(429).json({
        error: 'Too many login attempts. Please try again later.'
      });
    }
    
    // Find user
    const user = await User.findByEmail(email);
    if (!user) {
      await redis.incr(rateLimitKey);
      await redis.expire(rateLimitKey, 900); // 15 minutes
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check account lock
    if (user.accountLockedUntil && new Date() < user.accountLockedUntil) {
      return res.status(423).json({
        error: 'Account is temporarily locked'
      });
    }
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    
    if (!isValidPassword) {
      await User.incrementFailedAttempts(user.userId);
      await redis.incr(rateLimitKey);
      await redis.expire(rateLimitKey, 900);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Reset failed attempts
    await User.resetFailedAttempts(user.userId);
    
    // Generate JWT token
    const token = generateJWT({
      userId: user.userId,
      email: user.email,
      role: user.role.name
    });
    
    res.json({
      message: 'Login successful',
      token,
      user: {
        userId: user.userId,
        email: user.email,
        role: user.role.name
      }
    });
    
  } catch (error) {
    logger.error('Login failed', { error: error.message, email });
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

### 3. Product Service Component

#### Database Schema
```sql
-- Categories table
CREATE TABLE categories (
    category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES categories(category_id),
    image_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products table
CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    short_description VARCHAR(500),
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    cost_price DECIMAL(10,2) CHECK (cost_price >= 0),
    seller_id UUID REFERENCES users(user_id),
    category_id UUID REFERENCES categories(category_id),
    sku VARCHAR(100) UNIQUE,
    inventory_count INTEGER DEFAULT 0 CHECK (inventory_count >= 0),
    min_stock_level INTEGER DEFAULT 0,
    weight DECIMAL(8,2),
    dimensions JSONB, -- {length, width, height}
    images JSONB DEFAULT '[]',
    attributes JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FULLTEXT(name, description, short_description)
);

-- Product reviews table
CREATE TABLE product_reviews (
    review_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(product_id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(user_id),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(200),
    comment TEXT,
    is_verified_purchase BOOLEAN DEFAULT false,
    is_approved BOOLEAN DEFAULT false,
    helpful_votes INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, user_id)
);

-- Inventory tracking table
CREATE TABLE inventory_transactions (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(product_id),
    transaction_type VARCHAR(20) NOT NULL, -- 'IN', 'OUT', 'ADJUSTMENT'
    quantity INTEGER NOT NULL,
    reference_id UUID, -- Order ID or adjustment reference
    reference_type VARCHAR(50), -- 'ORDER', 'RETURN', 'ADJUSTMENT'
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(user_id)
);
```

#### Search Implementation with Elasticsearch
```javascript
// Elasticsearch mapping
const productMapping = {
  mappings: {
    properties: {
      productId: { type: 'keyword' },
      name: {
        type: 'text',
        analyzer: 'standard',
        fields: {
          keyword: { type: 'keyword' },
          suggest: {
            type: 'completion',
            analyzer: 'simple'
          }
        }
      },
      description: {
        type: 'text',
        analyzer: 'standard'
      },
      price: { type: 'float' },
      categoryId: { type: 'keyword' },
      categoryName: {
        type: 'text',
        fields: { keyword: { type: 'keyword' } }
      },
      sellerId: { type: 'keyword' },
      attributes: { type: 'object' },
      rating: { type: 'float' },
      reviewCount: { type: 'integer' },
      inventoryCount: { type: 'integer' },
      isActive: { type: 'boolean' },
      isFeatured: { type: 'boolean' },
      createdAt: { type: 'date' },
      updatedAt: { type: 'date' }
    }
  }
};

// Product search endpoint
app.get('/api/v1/products/search', async (req, res) => {
  try {
    const {
      q,
      category,
      minPrice,
      maxPrice,
      rating,
      sortBy = 'relevance',
      page = 1,
      limit = 20
    } = req.query;
    
    const searchQuery = {
      index: 'products',
      body: {
        query: {
          bool: {
            must: [],
            filter: [
              { term: { isActive: true } }
            ]
          }
        },
        sort: [],
        from: (page - 1) * limit,
        size: limit,
        aggs: {
          categories: {
            terms: { field: 'categoryName.keyword', size: 10 }
          },
          priceRange: {
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
        }
      }
    };
    
    // Add text search
    if (q) {
      searchQuery.body.query.bool.must.push({
        multi_match: {
          query: q,
          fields: ['name^3', 'description^2', 'categoryName'],
          type: 'best_fields',
          fuzziness: 'AUTO'
        }
      });
    }
    
    // Add filters
    if (category) {
      searchQuery.body.query.bool.filter.push({
        term: { 'categoryName.keyword': category }
      });
    }
    
    if (minPrice || maxPrice) {
      const priceRange = {};
      if (minPrice) priceRange.gte = parseFloat(minPrice);
      if (maxPrice) priceRange.lte = parseFloat(maxPrice);
      
      searchQuery.body.query.bool.filter.push({
        range: { price: priceRange }
      });
    }
    
    if (rating) {
      searchQuery.body.query.bool.filter.push({
        range: { rating: { gte: parseFloat(rating) } }
      });
    }
    
    // Add sorting
    switch (sortBy) {
      case 'price_low':
        searchQuery.body.sort.push({ price: { order: 'asc' } });
        break;
      case 'price_high':
        searchQuery.body.sort.push({ price: { order: 'desc' } });
        break;
      case 'rating':
        searchQuery.body.sort.push({ rating: { order: 'desc' } });
        break;
      case 'newest':
        searchQuery.body.sort.push({ createdAt: { order: 'desc' } });
        break;
      default:
        if (q) {
          searchQuery.body.sort.push({ _score: { order: 'desc' } });
        } else {
          searchQuery.body.sort.push({ isFeatured: { order: 'desc' } });
          searchQuery.body.sort.push({ createdAt: { order: 'desc' } });
        }
    }
    
    const response = await elasticsearch.search(searchQuery);
    
    res.json({
      products: response.body.hits.hits.map(hit => hit._source),
      total: response.body.hits.total.value,
      page: parseInt(page),
      limit: parseInt(limit),
      aggregations: response.body.aggregations
    });
    
  } catch (error) {
    logger.error('Product search failed', { error: error.message, query: req.query });
    res.status(500).json({ error: 'Search failed' });
  }
});
```

### 4. Order Service Component

#### Database Schema
```sql
-- Shopping carts table
CREATE TABLE shopping_carts (
    cart_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
    session_id VARCHAR(255), -- For guest users
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cart items table
CREATE TABLE cart_items (
    cart_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID REFERENCES shopping_carts(cart_id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(product_id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(cart_id, product_id)
);

-- Orders table
CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(20) UNIQUE NOT NULL,
    user_id UUID REFERENCES users(user_id),
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN (
        'PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 
        'DELIVERED', 'CANCELLED', 'RETURNED'
    )),
    subtotal DECIMAL(10,2) NOT NULL CHECK (subtotal >= 0),
    tax_amount DECIMAL(10,2) DEFAULT 0 CHECK (tax_amount >= 0),
    shipping_amount DECIMAL(10,2) DEFAULT 0 CHECK (shipping_amount >= 0),
    discount_amount DECIMAL(10,2) DEFAULT 0 CHECK (discount_amount >= 0),
    total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
    currency VARCHAR(3) DEFAULT 'USD',
    shipping_address JSONB NOT NULL,
    billing_address JSONB NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order items table
CREATE TABLE order_items (
    order_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(product_id),
    product_name VARCHAR(200) NOT NULL, -- Snapshot at time of order
    product_sku VARCHAR(100),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
    total_price DECIMAL(10,2) NOT NULL CHECK (total_price >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order status history table
CREATE TABLE order_status_history (
    history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(order_id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL,
    notes TEXT,
    changed_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Order Processing Implementation
```javascript
// Order creation endpoint
app.post('/api/v1/orders', async (req, res) => {
  try {
    const { userId } = req.user;
    const { shippingAddress, billingAddress, paymentMethodId } = req.body;
    
    // Validate addresses
    const addressValidation = validateAddresses(shippingAddress, billingAddress);
    if (!addressValidation.isValid) {
      return res.status(400).json({
        error: 'Invalid address information',
        details: addressValidation.errors
      });
    }
    
    const result = await db.transaction(async (trx) => {
      // Get cart items
      const cartItems = await CartItem.getByUserId(userId, trx);
      
      if (!cartItems.length) {
        throw new Error('Cart is empty');
      }
      
      // Validate inventory and calculate totals
      let subtotal = 0;
      const orderItems = [];
      
      for (const item of cartItems) {
        const product = await Product.findById(item.productId, trx);
        
        if (!product || !product.isActive) {
          throw new Error(`Product ${item.productId} is not available`);
        }
        
        if (product.inventoryCount < item.quantity) {
          throw new Error(`Insufficient inventory for ${product.name}`);
        }
        
        const itemTotal = item.quantity * product.price;
        subtotal += itemTotal;
        
        orderItems.push({
          productId: product.productId,
          productName: product.name,
          productSku: product.sku,
          quantity: item.quantity,
          unitPrice: product.price,
          totalPrice: itemTotal
        });
      }
      
      // Calculate tax and shipping
      const taxAmount = calculateTax(subtotal, shippingAddress);
      const shippingAmount = calculateShipping(orderItems, shippingAddress);
      const totalAmount = subtotal + taxAmount + shippingAmount;
      
      // Generate order number
      const orderNumber = await generateOrderNumber();
      
      // Create order
      const order = await Order.create({
        orderNumber,
        userId,
        subtotal,
        taxAmount,
        shippingAmount,
        totalAmount,
        shippingAddress,
        billingAddress,
        status: 'PENDING'
      }, trx);
      
      // Create order items and update inventory
      for (const item of orderItems) {
        await OrderItem.create({
          orderId: order.orderId,
          ...item
        }, trx);
        
        // Reserve inventory
        await Product.decrementInventory(item.productId, item.quantity, trx);
        
        // Log inventory transaction
        await InventoryTransaction.create({
          productId: item.productId,
          transactionType: 'OUT',
          quantity: -item.quantity,
          referenceId: order.orderId,
          referenceType: 'ORDER'
        }, trx);
      }
      
      // Clear cart
      await Cart.clearByUserId(userId, trx);
      
      // Create order status history
      await OrderStatusHistory.create({
        orderId: order.orderId,
        status: 'PENDING',
        notes: 'Order created'
      }, trx);
      
      return order;
    });
    
    // Process payment asynchronously
    processPaymentAsync(result.orderId, paymentMethodId, result.totalAmount);
    
    // Send order confirmation email
    sendOrderConfirmationEmail(userId, result.orderId);
    
    res.status(201).json({
      message: 'Order created successfully',
      order: {
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        totalAmount: result.totalAmount,
        status: result.status
      }
    });
    
  } catch (error) {
    logger.error('Order creation failed', {
      error: error.message,
      userId: req.user.userId
    });
    
    res.status(500).json({
      error: 'Failed to create order',
      message: error.message
    });
  }
});
```

### 5. Payment Service Component

#### Database Schema
```sql
-- Payment methods table
CREATE TABLE payment_methods (
    method_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id),
    type VARCHAR(20) NOT NULL CHECK (type IN ('CREDIT_CARD', 'DEBIT_CARD', 'PAYPAL', 'BANK_TRANSFER')),
    provider VARCHAR(50) NOT NULL, -- 'stripe', 'paypal', etc.
    provider_method_id VARCHAR(255), -- External provider's method ID
    last_four VARCHAR(4),
    card_brand VARCHAR(20),
    expiry_month INTEGER,
    expiry_year INTEGER,
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payments table
CREATE TABLE payments (
    payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(order_id),
    method_id UUID REFERENCES payment_methods(method_id),
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN (
        'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 
        'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED'
    )),
    provider VARCHAR(50) NOT NULL,
    provider_transaction_id VARCHAR(255),
    provider_response JSONB,
    failure_reason TEXT,
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Refunds table
CREATE TABLE refunds (
    refund_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID REFERENCES payments(payment_id),
    order_id UUID REFERENCES orders(order_id),
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    reason VARCHAR(500),
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN (
        'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'
    )),
    provider_refund_id VARCHAR(255),
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Payment Processing Implementation
```javascript
// Stripe payment processor
class StripePaymentProcessor {
  constructor(apiKey) {
    this.stripe = require('stripe')(apiKey);
  }
  
  async processPayment(paymentData) {
    try {
      const {
        amount,
        currency,
        paymentMethodId,
        orderId,
        customerEmail
      } = paymentData;
      
      // Create payment intent
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency.toLowerCase(),
        payment_method: paymentMethodId,
        confirmation_method: 'manual',
        confirm: true,
        metadata: {
          orderId,
          customerEmail
        },
        receipt_email: customerEmail
      });
      
      return {
        success: true,
        transactionId: paymentIntent.id,
        status: this.mapStripeStatus(paymentIntent.status),
        response: paymentIntent
      };
      
    } catch (error) {
      logger.error('Stripe payment failed', {
        error: error.message,
        orderId: paymentData.orderId
      });
      
      return {
        success: false,
        error: error.message,
        code: error.code
      };
    }
  }
  
  async refundPayment(transactionId, amount, reason) {
    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: transactionId,
        amount: Math.round(amount * 100),
        reason: 'requested_by_customer',
        metadata: { reason }
      });
      
      return {
        success: true,
        refundId: refund.id,
        status: refund.status,
        response: refund
      };
      
    } catch (error) {
      logger.error('Stripe refund failed', {
        error: error.message,
        transactionId
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  mapStripeStatus(stripeStatus) {
    const statusMap = {
      'requires_payment_method': 'PENDING',
      'requires_confirmation': 'PENDING',
      'requires_action': 'PROCESSING',
      'processing': 'PROCESSING',
      'succeeded': 'COMPLETED',
      'requires_capture': 'COMPLETED',
      'canceled': 'CANCELLED'
    };
    
    return statusMap[stripeStatus] || 'FAILED';
  }
}

// Payment processing endpoint
app.post('/api/v1/payments/process', async (req, res) => {
  try {
    const { orderId, paymentMethodId } = req.body;
    
    // Get order details
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    if (order.status !== 'PENDING') {
      return res.status(400).json({ error: 'Order cannot be processed' });
    }
    
    // Get payment method
    const paymentMethod = await PaymentMethod.findById(paymentMethodId);
    if (!paymentMethod) {
      return res.status(404).json({ error: 'Payment method not found' });
    }
    
    // Get user details
    const user = await User.findById(order.userId);
    
    // Create payment record
    const payment = await Payment.create({
      orderId: order.orderId,
      methodId: paymentMethod.methodId,
      amount: order.totalAmount,
      currency: order.currency,
      provider: paymentMethod.provider,
      status: 'PROCESSING'
    });
    
    // Process payment based on provider
    let processor;
    switch (paymentMethod.provider) {
      case 'stripe':
        processor = new StripePaymentProcessor(process.env.STRIPE_SECRET_KEY);
        break;
      case 'paypal':
        processor = new PayPalPaymentProcessor(process.env.PAYPAL_CLIENT_ID);
        break;
      default:
        throw new Error('Unsupported payment provider');
    }
    
    const result = await processor.processPayment({
      amount: order.totalAmount,
      currency: order.currency,
      paymentMethodId: paymentMethod.providerMethodId,
      orderId: order.orderId,
      customerEmail: user.email
    });
    
    // Update payment record
    await Payment.update(payment.paymentId, {
      status: result.success ? result.status : 'FAILED',
      providerTransactionId: result.transactionId,
      providerResponse: result.response,
      failureReason: result.error,
      processedAt: new Date()
    });
    
    if (result.success) {
      // Update order status
      await Order.updateStatus(order.orderId, 'CONFIRMED');
      
      // Send confirmation notifications
      await sendPaymentConfirmationEmail(user.email, order.orderId);
      await sendOrderProcessingNotification(order.orderId);
      
      res.json({
        message: 'Payment processed successfully',
        paymentId: payment.paymentId,
        status: result.status
      });
    } else {
      // Update order status to failed
      await Order.updateStatus(order.orderId, 'PAYMENT_FAILED');
      
      res.status(400).json({
        error: 'Payment processing failed',
        reason: result.error
      });
    }
    
  } catch (error) {
    logger.error('Payment processing error', {
      error: error.message,
      orderId: req.body.orderId
    });
    
    res.status(500).json({ error: 'Payment processing failed' });
  }
});
```

## Data Flow Diagrams

### 1. User Registration Flow
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client    │───▶│ API Gateway │───▶│ User Service│───▶│  Database   │
│             │    │             │    │             │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │                   │                   │                   │
       │            ┌─────────────┐    ┌─────────────┐           │
       │            │   Input     │    │  Password   │           │
       │◀───────────│ Validation  │    │  Hashing    │           │
       │            │             │    │             │           │
       │            └─────────────┘    └─────────────┘           │
       │                   │                   │                   │
       │            ┌─────────────┐    ┌─────────────┐           │
       │            │    JWT      │    │   Email     │           │
       │◀───────────│ Generation  │    │ Verification│───────────┘
       │            │             │    │             │
       │            └─────────────┘    └─────────────┘
```

### 2. Product Search Flow
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client    │───▶│ API Gateway │───▶│Product Svc  │───▶│Elasticsearch│
│             │    │             │    │             │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │                   │                   │                   │
       │            ┌─────────────┐    ┌─────────────┐           │
       │            │   Cache     │    │   Query     │           │
       │◀───────────│   Check     │    │ Processing  │           │
       │            │             │    │             │           │
       │            └─────────────┘    └─────────────┘           │
       │                   │                   │                   │
       │            ┌─────────────┐    ┌─────────────┐           │
       │            │  Response   │    │Aggregations │           │
       │◀───────────│ Formatting  │◀───│& Filtering  │◀──────────┘
       │            │             │    │             │
       │            └─────────────┘    └─────────────┘
```

### 3. Order Processing Flow
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client    │───▶│ API Gateway │───▶│ Order Svc   │───▶│  Database   │
│             │    │             │    │             │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │                   │                   │                   │
       │            ┌─────────────┐    ┌─────────────┐           │
       │            │ Inventory   │    │   Order     │           │
       │            │ Validation  │    │ Creation    │───────────┘
       │            │             │    │             │
       │            └─────────────┘    └─────────────┘
       │                   │                   │
       │            ┌─────────────┐    ┌─────────────┐
       │            │  Payment    │    │   Email     │
       │◀───────────│ Processing  │    │Notification │
       │            │             │    │             │
       │            └─────────────┘    └─────────────┘
```

## Sequence Diagrams

### 1. User Authentication Sequence
```
Client          API Gateway     User Service    Database       Redis
  │                 │               │             │             │
  │──POST /login───▶│               │             │             │
  │                 │──validate────▶│             │             │
  │                 │               │──get user──▶│             │
  │                 │               │◀────────────│             │
  │                 │               │──check rate─────────────▶│
  │                 │               │◀─────────────────────────│
  │                 │               │──verify pwd─│             │
  │                 │               │──gen JWT────│             │
  │                 │◀──response────│             │             │
  │◀────200 OK──────│               │             │             │
```

### 2. Product Purchase Sequence
```
Client      API Gateway   Order Service   Product Service   Payment Service   Database
  │             │             │               │                 │               │
  │─POST order─▶│             │               │                 │               │
  │             │─validate───▶│               │                 │               │
  │             │             │─check stock──▶│                 │               │
  │             │             │◀──response────│                 │               │
  │             │             │─create order──────────────────────────────────▶│
  │             │             │◀──order id────────────────────────────────────│
  │             │             │─process payment───────────────▶│               │
  │             │             │                                 │─charge card──▶│
  │             │             │                                 │◀──response───│
  │             │             │◀──payment result───────────────│               │
  │             │             │─update order──────────────────────────────────▶│
  │             │◀──response──│               │                 │               │
  │◀──201──────│             │               │                 │               │
```

## API Contracts

### Authentication APIs

#### POST /api/v1/users/register
**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890"
}
```

**Response (201):**
```json
{
  "message": "User registered successfully",
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "userId": "123e4567-e89b-12d3-a456-426614174000",
    "email": "user@example.com",
    "profile": {
      "firstName": "John",
      "lastName": "Doe",
      "phone": "+1234567890"
    }
  }
}
```

#### POST /api/v1/users/login
**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response (200):**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "userId": "123e4567-e89b-12d3-a456-426614174000",
    "email": "user@example.com",
    "role": "consumer"
  }
}
```

### Product APIs

#### GET /api/v1/products/search
**Query Parameters:**
- `q` (string): Search query
- `category` (string): Category filter
- `minPrice` (number): Minimum price filter
- `maxPrice` (number): Maximum price filter
- `rating` (number): Minimum rating filter
- `sortBy` (string): Sort option (relevance, price_low, price_high, rating, newest)
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20)

**Response (200):**
```json
{
  "products": [
    {
      "productId": "123e4567-e89b-12d3-a456-426614174000",
      "name": "Wireless Headphones",
      "description": "High-quality wireless headphones with noise cancellation",
      "price": 199.99,
      "categoryName": "Electronics",
      "rating": 4.5,
      "reviewCount": 128,
      "inventoryCount": 50,
      "images": [
        "https://cdn.example.com/products/headphones-1.jpg"
      ]
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20,
  "aggregations": {
    "categories": {
      "buckets": [
        { "key": "Electronics", "doc_count": 1 }
      ]
    },
    "priceRange": {
      "buckets": [
        { "key": "100-500", "doc_count": 1 }
      ]
    }
  }
}
```

### Order APIs

#### POST /api/v1/orders
**Request:**
```json
{
  "shippingAddress": {
    "firstName": "John",
    "lastName": "Doe",
    "street": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zipCode": "10001",
    "country": "US"
  },
  "billingAddress": {
    "firstName": "John",
    "lastName": "Doe",
    "street": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zipCode": "10001",
    "country": "US"
  },
  "paymentMethodId": "pm_1234567890"
}
```

**Response (201):**
```json
{
  "message": "Order created successfully",
  "order": {
    "orderId": "123e4567-e89b-12d3-a456-426614174000",
    "orderNumber": "ORD-2024-001234",
    "totalAmount": 219.98,
    "status": "PENDING"
  }
}
```

## Security Implementation Details

### Input Validation
```javascript
// Joi validation schemas
const registrationSchema = Joi.object({
  email: Joi.string().email().required().max(255),
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .messages({
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    }),
  firstName: Joi.string().trim().min(1).max(100).required(),
  lastName: Joi.string().trim().min(1).max(100).required(),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional()
});

const productSearchSchema = Joi.object({
  q: Joi.string().trim().max(200).optional(),
  category: Joi.string().trim().max(100).optional(),
  minPrice: Joi.number().min(0).optional(),
  maxPrice: Joi.number().min(0).optional(),
  rating: Joi.number().min(1).max(5).optional(),
  sortBy: Joi.string().valid('relevance', 'price_low', 'price_high', 'rating', 'newest').optional(),
  page: Joi.number().integer().min(1).max(1000).optional(),
  limit: Joi.number().integer().min(1).max(100).optional()
});
```

### SQL Injection Prevention
```javascript
// Using parameterized queries with pg-promise
class UserRepository {
  async findByEmail(email) {
    const query = `
      SELECT u.*, r.name as role_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.role_id
      WHERE u.email = $1 AND u.is_active = true
    `;
    
    return await db.oneOrNone(query, [email]);
  }
  
  async create(userData, trx = db) {
    const query = `
      INSERT INTO users (email, password_hash, salt, role_id)
      VALUES ($1, $2, $3, $4)
      RETURNING user_id, email, created_at
    `;
    
    return await trx.one(query, [
      userData.email,
      userData.passwordHash,
      userData.salt,
      userData.roleId
    ]);
  }
}
```

### XSS Prevention
```javascript
// Content Security Policy middleware
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://js.stripe.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' https://api.stripe.com"
  );
  next();
});

// Input sanitization
const DOMPurify = require('isomorphic-dompurify');

function sanitizeInput(input) {
  if (typeof input === 'string') {
    return DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
  }
  return input;
}
```

### Encryption Implementation
```javascript
// Data encryption utilities
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
}
```

## Performance Optimization

### Database Indexing Strategy
```sql
-- User service indexes
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
CREATE INDEX CONCURRENTLY idx_users_active ON users(is_active) WHERE is_active = true;
CREATE INDEX CONCURRENTLY idx_user_profiles_user_id ON user_profiles(user_id);

-- Product service indexes
CREATE INDEX CONCURRENTLY idx_products_category ON products(category_id);
CREATE INDEX CONCURRENTLY idx_products_seller ON products(seller_id);
CREATE INDEX CONCURRENTLY idx_products_active ON products(is_active) WHERE is_active = true;
CREATE INDEX CONCURRENTLY idx_products_featured ON products(is_featured) WHERE is_featured = true;
CREATE INDEX CONCURRENTLY idx_products_price ON products(price);
CREATE INDEX CONCURRENTLY idx_products_created ON products(created_at DESC);

-- Order service indexes
CREATE INDEX CONCURRENTLY idx_orders_user ON orders(user_id);
CREATE INDEX CONCURRENTLY idx_orders_status ON orders(status);
CREATE INDEX CONCURRENTLY idx_orders_created ON orders(created_at DESC);
CREATE INDEX CONCURRENTLY idx_order_items_order ON order_items(order_id);
CREATE INDEX CONCURRENTLY idx_order_items_product ON order_items(product_id);

-- Shopping cart indexes
CREATE INDEX CONCURRENTLY idx_cart_user ON shopping_carts(user_id);
CREATE INDEX CONCURRENTLY idx_cart_items_cart ON cart_items(cart_id);
CREATE INDEX CONCURRENTLY idx_cart_items_product ON cart_items(product_id);
```

### Caching Strategy
```javascript
// Redis caching implementation
class CacheService {
  constructor(redisClient) {
    this.redis = redisClient;
    this.defaultTTL = 3600; // 1 hour
  }
  
  async get(key) {
    try {
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Cache get error', { key, error: error.message });
      return null;
    }
  }
  
  async set(key, value, ttl = this.defaultTTL) {
    try {
      await this.redis.setex(key, ttl, JSON.stringify(value));
    } catch (error) {
      logger.error('Cache set error', { key, error: error.message });
    }
  }
  
  async del(key) {
    try {
      await this.redis.del(key);
    } catch (error) {
      logger.error('Cache delete error', { key, error: error.message });
    }
  }
  
  // Cache patterns for different data types
  getUserCacheKey(userId) {
    return `user:${userId}`;
  }
  
  getProductCacheKey(productId) {
    return `product:${productId}`;
  }
  
  getSearchCacheKey(searchParams) {
    const hash = crypto
      .createHash('md5')
      .update(JSON.stringify(searchParams))
      .digest('hex');
    return `search:${hash}`;
  }
}

// Cache middleware
function cacheMiddleware(ttl = 300) {
  return async (req, res, next) => {
    const cacheKey = `api:${req.method}:${req.originalUrl}`;
    
    try {
      const cachedData = await cache.get(cacheKey);
      
      if (cachedData) {
        return res.json(cachedData);
      }
      
      // Override res.json to cache the response
      const originalJson = res.json;
      res.json = function(data) {
        cache.set(cacheKey, data, ttl);
        return originalJson.call(this, data);
      };
      
      next();
    } catch (error) {
      logger.error('Cache middleware error', { error: error.message });
      next();
    }
  };
}
```

## Monitoring and Logging

### Structured Logging Implementation
```javascript
// Winston logger configuration
const winston = require('winston');
const { ElasticsearchTransport } = require('winston-elasticsearch');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: process.env.SERVICE_NAME || 'shopping-platform',
    version: process.env.SERVICE_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new ElasticsearchTransport({
      level: 'info',
      clientOpts: {
        node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200'
      },
      index: 'shopping-platform-logs'
    })
  ]
});

// Request logging middleware
function requestLogger(req, res, next) {
  const startTime = Date.now();
  const correlationId = req.headers['x-correlation-id'] || generateUUID();
  
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  
  logger.info('Request started', {
    correlationId,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.headers['user-agent'],
    ip: req.ip
  });
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    logger.info('Request completed', {
      correlationId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration
    });
  });
  
  next();
}
```

### Health Check Implementation
```javascript
// Health check endpoint
app.get('/health', async (req, res) => {
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
    elasticsearch: await checkElasticsearch(),
    externalAPIs: await checkExternalAPIs()
  };
  
  const isHealthy = Object.values(checks).every(check => check.status === 'healthy');
  
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks
  });
});

async function checkDatabase() {
  try {
    await db.one('SELECT 1');
    return { status: 'healthy', responseTime: Date.now() };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}

async function checkRedis() {
  try {
    const start = Date.now();
    await redis.ping();
    return { status: 'healthy', responseTime: Date.now() - start };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}
```

## Deployment Configuration

### Docker Configuration
```dockerfile
# Multi-stage Dockerfile for Node.js services
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

FROM node:18-alpine AS runtime

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

# Copy node_modules from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs . .

# Security hardening
RUN apk add --no-cache dumb-init
RUN chmod -R 755 /app

USER nodejs

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
```

### Kubernetes Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
  labels:
    app: user-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: user-service
  template:
    metadata:
      labels:
        app: user-service
    spec:
      containers:
      - name: user-service
        image: shopping-platform/user-service:latest
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
  name: user-service
spec:
  selector:
    app: user-service
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: ClusterIP
```

## Testing Strategy

### Unit Testing Implementation
```javascript
// Jest test configuration
const request = require('supertest');
const app = require('../app');
const { User, UserProfile } = require('../models');

describe('User Registration', () => {
  beforeEach(async () => {
    await User.deleteMany({});
    await UserProfile.deleteMany({});
  });
  
  describe('POST /api/v1/users/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890'
      };
      
      const response = await request(app)
        .post('/api/v1/users/register')
        .send(userData)
        .expect(201);
      
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.user.profile.firstName).toBe(userData.firstName);
    });
    
    it('should return 400 for invalid email', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'SecurePass123!',
        firstName: 'John',
        lastName: 'Doe'
      };
      
      const response = await request(app)
        .post('/api/v1/users/register')
        .send(userData)
        .expect(400);
      
      expect(response.body.error).toBe('Validation failed');
    });
    
    it('should return 409 for duplicate email', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        firstName: 'John',
        lastName: 'Doe'
      };
      
      // Register first user
      await request(app)
        .post('/api/v1/users/register')
        .send(userData)
        .expect(201);
      
      // Try to register with same email
      const response = await request(app)
        .post('/api/v1/users/register')
        .send(userData)
        .expect(409);
      
      expect(response.body.error).toBe('User already exists');
    });
  });
});
```

### Integration Testing
```javascript
// Integration test for order processing
describe('Order Processing Integration', () => {
  let userToken, productId, paymentMethodId;
  
  beforeAll(async () => {
    // Setup test data
    const user = await createTestUser();
    userToken = generateJWT(user);
    
    const product = await createTestProduct();
    productId = product.productId;
    
    const paymentMethod = await createTestPaymentMethod(user.userId);
    paymentMethodId = paymentMethod.methodId;
  });
  
  it('should process complete order flow', async () => {
    // Add product to cart
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        productId,
        quantity: 2
      })
      .expect(201);
    
    // Create order
    const orderResponse = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        shippingAddress: testShippingAddress,
        billingAddress: testBillingAddress,
        paymentMethodId
      })
      .expect(201);
    
    const orderId = orderResponse.body.order.orderId;
    
    // Verify order was created
    const order = await Order.findById(orderId);
    expect(order.status).toBe('PENDING');
    
    // Verify inventory was updated
    const product = await Product.findById(productId);
    expect(product.inventoryCount).toBe(48); // 50 - 2
    
    // Verify cart was cleared
    const cartItems = await CartItem.getByUserId(user.userId);
    expect(cartItems).toHaveLength(0);
  });
});
```

## Conclusion

This Low-Level Design document provides comprehensive technical specifications for implementing the DavTest10 Online Shopping Platform. The design emphasizes:

1. **Security First**: Multi-layered security with input validation, encryption, and access controls
2. **Scalability**: Microservices architecture with horizontal scaling capabilities
3. **Performance**: Optimized database queries, caching strategies, and CDN integration
4. **Reliability**: Circuit breakers, retry mechanisms, and comprehensive monitoring
5. **Compliance**: Built-in privacy controls and audit logging for regulatory requirements

The implementation follows enterprise-grade best practices and provides a solid foundation for a secure, scalable e-commerce platform that can handle high traffic loads while maintaining data integrity and user security.

### Next Steps

1. **Phase 1**: Implement core user management and authentication services
2. **Phase 2**: Develop product catalog and search functionality
3. **Phase 3**: Build order processing and payment systems
4. **Phase 4**: Add advanced features like recommendations and analytics
5. **Phase 5**: Implement mobile applications and advanced integrations

Each phase should include comprehensive testing, security audits, and performance optimization to ensure the platform meets enterprise standards and regulatory requirements.