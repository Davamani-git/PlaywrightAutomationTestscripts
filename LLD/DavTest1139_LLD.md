# DavTest1139 Online Shopping Platform - Low-Level Design Document

## 1. System Architecture Overview

### 1.1 Microservices Architecture
The DavTest1139 Online Shopping Platform implements a microservices architecture pattern with the following core services:

- **User Service**: Handles authentication, authorization, and profile management
- **Product Service**: Manages catalog, search, and inventory operations
- **Order Service**: Processes orders and manages workflow states
- **Payment Service**: Handles secure payment processing and refunds
- **Notification Service**: Manages email, SMS, and push notifications
- **Analytics Service**: Provides reporting and business intelligence

### 1.2 Technology Stack
- **Backend**: Node.js with Express.js framework
- **Database**: PostgreSQL for transactional data, Redis for caching
- **Search Engine**: Elasticsearch for product search and filtering
- **Message Queue**: Apache Kafka for event-driven communication
- **API Gateway**: Kong for request routing and rate limiting
- **Authentication**: JWT tokens with OAuth 2.0/OpenID Connect
- **Monitoring**: Prometheus and Grafana for metrics
- **Logging**: ELK Stack (Elasticsearch, Logstash, Kibana)

## 2. Database Design

### 2.1 Entity Relationship Diagram

```sql
-- User Management Tables
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    status VARCHAR(20) DEFAULT 'active',
    email_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE profiles (
    profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    zip_code VARCHAR(20),
    country VARCHAR(100),
    preferences JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE roles (
    role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_name VARCHAR(50) UNIQUE NOT NULL,
    permissions JSONB NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_roles (
    user_role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(role_id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, role_id)
);

-- Product Management Tables
CREATE TABLE categories (
    category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    parent_category_id UUID REFERENCES categories(category_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sellers (
    seller_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    business_name VARCHAR(200) NOT NULL,
    tax_id VARCHAR(50),
    verification_status VARCHAR(20) DEFAULT 'pending',
    commission_rate DECIMAL(5,4) DEFAULT 0.1000,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID REFERENCES sellers(seller_id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(category_id),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    images JSONB,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Shopping Cart Tables
CREATE TABLE shopping_carts (
    cart_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

CREATE TABLE cart_items (
    cart_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID REFERENCES shopping_carts(cart_id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(product_id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(cart_id, product_id)
);

-- Order Management Tables
CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id UUID REFERENCES users(user_id) ON DELETE RESTRICT,
    total_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    payment_status VARCHAR(20) DEFAULT 'pending',
    shipping_address JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
    order_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(product_id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment Tables
CREATE TABLE payments (
    payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(order_id) ON DELETE RESTRICT,
    payment_method VARCHAR(50) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    transaction_id VARCHAR(100),
    gateway_response JSONB,
    status VARCHAR(20) DEFAULT 'pending',
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Review Tables
CREATE TABLE reviews (
    review_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(product_id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    verified_purchase BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, user_id)
);
```

### 2.2 Indexing Strategy

```sql
-- Performance Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_seller ON products(seller_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_orders_buyer ON orders(buyer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_reviews_product ON reviews(product_id);

-- Composite Indexes
CREATE INDEX idx_products_category_status ON products(category_id, status);
CREATE INDEX idx_orders_buyer_status ON orders(buyer_id, status);
```

## 3. API Design

### 3.1 RESTful API Endpoints

#### User Service APIs

```javascript
// User Registration
POST /api/v1/users/register
Content-Type: application/json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "password": "SecurePass123!",
  "phone": "+1234567890"
}

// User Login
POST /api/v1/users/login
Content-Type: application/json
{
  "email": "john.doe@example.com",
  "password": "SecurePass123!"
}

// Email Verification
GET /api/v1/users/verify-email/{token}

// Password Reset Request
POST /api/v1/users/forgot-password
Content-Type: application/json
{
  "email": "john.doe@example.com"
}

// Password Reset
POST /api/v1/users/reset-password
Content-Type: application/json
{
  "token": "reset-token",
  "newPassword": "NewSecurePass123!"
}

// Profile Management
GET /api/v1/users/profile
PUT /api/v1/users/profile
Content-Type: application/json
{
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890",
  "address": "123 Main St",
  "city": "New York",
  "state": "NY",
  "zipCode": "10001",
  "country": "USA"
}
```

#### Product Service APIs

```javascript
// Product Search
GET /api/v1/products/search?q={query}&category={categoryId}&minPrice={min}&maxPrice={max}&page={page}&limit={limit}

// Product Details
GET /api/v1/products/{productId}

// Create Product (Seller)
POST /api/v1/products
Authorization: Bearer {jwt-token}
Content-Type: application/json
{
  "name": "Wireless Headphones",
  "description": "High-quality wireless headphones",
  "price": 99.99,
  "categoryId": "category-uuid",
  "stockQuantity": 50,
  "images": ["image1.jpg", "image2.jpg"]
}

// Update Product (Seller)
PUT /api/v1/products/{productId}
Authorization: Bearer {jwt-token}

// Delete Product (Seller)
DELETE /api/v1/products/{productId}
Authorization: Bearer {jwt-token}

// Categories
GET /api/v1/categories
GET /api/v1/categories/{categoryId}
```

#### Shopping Cart APIs

```javascript
// Get Cart
GET /api/v1/cart
Authorization: Bearer {jwt-token}

// Add to Cart
POST /api/v1/cart/items
Authorization: Bearer {jwt-token}
Content-Type: application/json
{
  "productId": "product-uuid",
  "quantity": 2
}

// Update Cart Item
PUT /api/v1/cart/items/{cartItemId}
Authorization: Bearer {jwt-token}
Content-Type: application/json
{
  "quantity": 3
}

// Remove from Cart
DELETE /api/v1/cart/items/{cartItemId}
Authorization: Bearer {jwt-token}

// Clear Cart
DELETE /api/v1/cart
Authorization: Bearer {jwt-token}
```

#### Order Service APIs

```javascript
// Create Order
POST /api/v1/orders
Authorization: Bearer {jwt-token}
Content-Type: application/json
{
  "items": [
    {
      "productId": "product-uuid",
      "quantity": 2,
      "unitPrice": 99.99
    }
  ],
  "shippingAddress": {
    "street": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zipCode": "10001",
    "country": "USA"
  },
  "paymentMethod": "credit_card"
}

// Get Order Details
GET /api/v1/orders/{orderId}
Authorization: Bearer {jwt-token}

// Get Order History
GET /api/v1/orders?page={page}&limit={limit}
Authorization: Bearer {jwt-token}

// Cancel Order
POST /api/v1/orders/{orderId}/cancel
Authorization: Bearer {jwt-token}

// Update Order Status (Seller/Admin)
PUT /api/v1/orders/{orderId}/status
Authorization: Bearer {jwt-token}
Content-Type: application/json
{
  "status": "shipped",
  "trackingNumber": "TRACK123456"
}
```

#### Payment Service APIs

```javascript
// Process Payment
POST /api/v1/payments
Authorization: Bearer {jwt-token}
Content-Type: application/json
{
  "orderId": "order-uuid",
  "paymentMethod": "credit_card",
  "amount": 199.98,
  "cardDetails": {
    "cardNumber": "4532123456789012",
    "expiryMonth": "12",
    "expiryYear": "2025",
    "cvv": "123",
    "cardholderName": "John Doe"
  }
}

// Payment Status
GET /api/v1/payments/{paymentId}
Authorization: Bearer {jwt-token}

// Process Refund
POST /api/v1/payments/{paymentId}/refund
Authorization: Bearer {jwt-token}
Content-Type: application/json
{
  "amount": 99.99,
  "reason": "Product return"
}
```

### 3.2 GraphQL Schema

```graphql
type User {
  id: ID!
  email: String!
  firstName: String!
  lastName: String!
  phone: String
  profile: Profile
  orders: [Order!]!
  createdAt: DateTime!
}

type Profile {
  id: ID!
  address: String
  city: String
  state: String
  zipCode: String
  country: String
  preferences: JSON
}

type Product {
  id: ID!
  name: String!
  description: String
  price: Float!
  category: Category!
  seller: Seller!
  stockQuantity: Int!
  images: [String!]!
  reviews: [Review!]!
  averageRating: Float
  status: ProductStatus!
  createdAt: DateTime!
}

type Category {
  id: ID!
  name: String!
  description: String
  parentCategory: Category
  products: [Product!]!
}

type Order {
  id: ID!
  buyer: User!
  items: [OrderItem!]!
  totalAmount: Float!
  status: OrderStatus!
  paymentStatus: PaymentStatus!
  shippingAddress: Address!
  payment: Payment
  createdAt: DateTime!
}

type OrderItem {
  id: ID!
  product: Product!
  quantity: Int!
  unitPrice: Float!
  totalPrice: Float!
}

type Payment {
  id: ID!
  order: Order!
  amount: Float!
  paymentMethod: String!
  status: PaymentStatus!
  transactionId: String
  processedAt: DateTime
}

enum OrderStatus {
  PENDING
  PROCESSING
  SHIPPED
  DELIVERED
  CANCELLED
}

enum PaymentStatus {
  PENDING
  COMPLETED
  FAILED
  REFUNDED
}

enum ProductStatus {
  ACTIVE
  INACTIVE
  OUT_OF_STOCK
}

type Query {
  user(id: ID!): User
  product(id: ID!): Product
  products(filter: ProductFilter, pagination: Pagination): ProductConnection!
  order(id: ID!): Order
  orders(filter: OrderFilter, pagination: Pagination): OrderConnection!
  categories: [Category!]!
}

type Mutation {
  registerUser(input: RegisterUserInput!): AuthPayload!
  loginUser(input: LoginUserInput!): AuthPayload!
  createProduct(input: CreateProductInput!): Product!
  addToCart(input: AddToCartInput!): CartItem!
  createOrder(input: CreateOrderInput!): Order!
  processPayment(input: ProcessPaymentInput!): Payment!
}
```

## 4. Component Specifications

### 4.1 User Service Component

```javascript
// UserService.js
class UserService {
  constructor(database, emailService, jwtService) {
    this.db = database;
    this.emailService = emailService;
    this.jwtService = jwtService;
  }

  async registerUser(userData) {
    try {
      // Validate input data
      const validationResult = this.validateUserData(userData);
      if (!validationResult.isValid) {
        throw new ValidationError(validationResult.errors);
      }

      // Check if email already exists
      const existingUser = await this.db.users.findByEmail(userData.email);
      if (existingUser) {
        throw new ConflictError('Email already registered');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(userData.password, 12);

      // Create user
      const user = await this.db.users.create({
        ...userData,
        passwordHash,
        emailVerified: false,
        status: 'active'
      });

      // Generate verification token
      const verificationToken = this.jwtService.generateVerificationToken(user.id);

      // Send verification email
      await this.emailService.sendVerificationEmail(
        user.email,
        user.firstName,
        verificationToken
      );

      return {
        userId: user.id,
        message: 'Registration successful. Please check your email for verification.'
      };
    } catch (error) {
      throw new ServiceError('User registration failed', error);
    }
  }

  async loginUser(email, password) {
    try {
      // Find user by email
      const user = await this.db.users.findByEmail(email);
      if (!user) {
        throw new AuthenticationError('Invalid credentials');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        throw new AuthenticationError('Invalid credentials');
      }

      // Check if email is verified
      if (!user.emailVerified) {
        throw new AuthenticationError('Please verify your email before logging in');
      }

      // Generate JWT token
      const token = this.jwtService.generateAccessToken(user.id, user.roles);
      const refreshToken = this.jwtService.generateRefreshToken(user.id);

      return {
        token,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName
        }
      };
    } catch (error) {
      throw new ServiceError('Login failed', error);
    }
  }

  async verifyEmail(token) {
    try {
      // Verify token
      const decoded = this.jwtService.verifyToken(token);
      
      // Update user verification status
      await this.db.users.update(decoded.userId, {
        emailVerified: true
      });

      return { message: 'Email verified successfully' };
    } catch (error) {
      throw new ServiceError('Email verification failed', error);
    }
  }

  validateUserData(userData) {
    const errors = [];

    if (!userData.email || !this.isValidEmail(userData.email)) {
      errors.push('Valid email is required');
    }

    if (!userData.password || !this.isStrongPassword(userData.password)) {
      errors.push('Password must be at least 8 characters with uppercase, lowercase, number, and special character');
    }

    if (!userData.firstName || userData.firstName.trim().length < 2) {
      errors.push('First name must be at least 2 characters');
    }

    if (!userData.lastName || userData.lastName.trim().length < 2) {
      errors.push('Last name must be at least 2 characters');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  isStrongPassword(password) {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    return password.length >= minLength && hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar;
  }
}
```

### 4.2 Product Service Component

```javascript
// ProductService.js
class ProductService {
  constructor(database, searchEngine, cacheService) {
    this.db = database;
    this.searchEngine = searchEngine; // Elasticsearch
    this.cache = cacheService; // Redis
  }

  async searchProducts(searchParams) {
    try {
      const { query, category, minPrice, maxPrice, page = 1, limit = 20 } = searchParams;
      
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
          sort: [{ _score: { order: 'desc' } }],
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
      searchQuery.body.query.bool.filter.push({ term: { status: 'active' } });
      
      if (category) {
        searchQuery.body.query.bool.filter.push({ term: { 'category.id': category } });
      }

      if (minPrice || maxPrice) {
        const priceRange = {};
        if (minPrice) priceRange.gte = minPrice;
        if (maxPrice) priceRange.lte = maxPrice;
        searchQuery.body.query.bool.filter.push({ range: { price: priceRange } });
      }

      // Execute search
      const searchResult = await this.searchEngine.search(searchQuery);

      return {
        products: searchResult.body.hits.hits.map(hit => hit._source),
        total: searchResult.body.hits.total.value,
        page,
        limit,
        totalPages: Math.ceil(searchResult.body.hits.total.value / limit)
      };
    } catch (error) {
      throw new ServiceError('Product search failed', error);
    }
  }

  async getProductById(productId) {
    try {
      // Check cache first
      const cacheKey = `product:${productId}`;
      const cachedProduct = await this.cache.get(cacheKey);
      
      if (cachedProduct) {
        return JSON.parse(cachedProduct);
      }

      // Fetch from database
      const product = await this.db.products.findById(productId, {
        include: ['category', 'seller', 'reviews']
      });

      if (!product) {
        throw new NotFoundError('Product not found');
      }

      // Calculate average rating
      const averageRating = product.reviews.length > 0
        ? product.reviews.reduce((sum, review) => sum + review.rating, 0) / product.reviews.length
        : 0;

      const productWithRating = {
        ...product,
        averageRating: Math.round(averageRating * 10) / 10
      };

      // Cache the result
      await this.cache.setex(cacheKey, 300, JSON.stringify(productWithRating)); // 5 minutes

      return productWithRating;
    } catch (error) {
      throw new ServiceError('Failed to get product', error);
    }
  }

  async createProduct(productData, sellerId) {
    try {
      // Validate product data
      const validationResult = this.validateProductData(productData);
      if (!validationResult.isValid) {
        throw new ValidationError(validationResult.errors);
      }

      // Create product in database
      const product = await this.db.products.create({
        ...productData,
        sellerId,
        status: 'active'
      });

      // Index in Elasticsearch
      await this.indexProduct(product);

      return product;
    } catch (error) {
      throw new ServiceError('Product creation failed', error);
    }
  }

  async updateInventory(productId, quantityChange) {
    try {
      const product = await this.db.products.findById(productId);
      if (!product) {
        throw new NotFoundError('Product not found');
      }

      const newQuantity = product.stockQuantity + quantityChange;
      if (newQuantity < 0) {
        throw new ValidationError('Insufficient inventory');
      }

      await this.db.products.update(productId, {
        stockQuantity: newQuantity,
        status: newQuantity === 0 ? 'out_of_stock' : 'active'
      });

      // Invalidate cache
      await this.cache.del(`product:${productId}`);

      return { stockQuantity: newQuantity };
    } catch (error) {
      throw new ServiceError('Inventory update failed', error);
    }
  }

  async indexProduct(product) {
    try {
      await this.searchEngine.index({
        index: 'products',
        id: product.id,
        body: {
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price,
          category: {
            id: product.category.id,
            name: product.category.name
          },
          seller: {
            id: product.seller.id,
            businessName: product.seller.businessName
          },
          stockQuantity: product.stockQuantity,
          status: product.status,
          createdAt: product.createdAt
        }
      });
    } catch (error) {
      console.error('Failed to index product:', error);
    }
  }

  validateProductData(productData) {
    const errors = [];

    if (!productData.name || productData.name.trim().length < 3) {
      errors.push('Product name must be at least 3 characters');
    }

    if (!productData.price || productData.price <= 0) {
      errors.push('Product price must be greater than 0');
    }

    if (!productData.categoryId) {
      errors.push('Category is required');
    }

    if (productData.stockQuantity === undefined || productData.stockQuantity < 0) {
      errors.push('Stock quantity must be 0 or greater');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
```

### 4.3 Order Service Component

```javascript
// OrderService.js
class OrderService {
  constructor(database, paymentService, inventoryService, notificationService) {
    this.db = database;
    this.paymentService = paymentService;
    this.inventoryService = inventoryService;
    this.notificationService = notificationService;
  }

  async createOrder(orderData, buyerId) {
    const transaction = await this.db.beginTransaction();
    
    try {
      // Validate order data
      const validationResult = await this.validateOrderData(orderData);
      if (!validationResult.isValid) {
        throw new ValidationError(validationResult.errors);
      }

      // Reserve inventory
      const inventoryReservations = [];
      for (const item of orderData.items) {
        const reservation = await this.inventoryService.reserveInventory(
          item.productId,
          item.quantity,
          transaction
        );
        inventoryReservations.push(reservation);
      }

      // Calculate total amount
      const totalAmount = orderData.items.reduce(
        (sum, item) => sum + (item.quantity * item.unitPrice),
        0
      );

      // Create order
      const order = await this.db.orders.create({
        buyerId,
        totalAmount,
        status: 'pending',
        paymentStatus: 'pending',
        shippingAddress: orderData.shippingAddress
      }, transaction);

      // Create order items
      const orderItems = await Promise.all(
        orderData.items.map(item =>
          this.db.orderItems.create({
            orderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.quantity * item.unitPrice
          }, transaction)
        )
      );

      await transaction.commit();

      // Send order confirmation
      await this.notificationService.sendOrderConfirmation(order.id, buyerId);

      return {
        ...order,
        items: orderItems
      };
    } catch (error) {
      await transaction.rollback();
      throw new ServiceError('Order creation failed', error);
    }
  }

  async updateOrderStatus(orderId, newStatus, updatedBy) {
    try {
      const order = await this.db.orders.findById(orderId);
      if (!order) {
        throw new NotFoundError('Order not found');
      }

      // Validate status transition
      if (!this.isValidStatusTransition(order.status, newStatus)) {
        throw new ValidationError(`Invalid status transition from ${order.status} to ${newStatus}`);
      }

      // Update order status
      const updatedOrder = await this.db.orders.update(orderId, {
        status: newStatus,
        updatedAt: new Date()
      });

      // Handle status-specific logic
      await this.handleStatusChange(order, newStatus);

      // Send notification
      await this.notificationService.sendOrderStatusUpdate(
        orderId,
        order.buyerId,
        newStatus
      );

      return updatedOrder;
    } catch (error) {
      throw new ServiceError('Order status update failed', error);
    }
  }

  async cancelOrder(orderId, userId) {
    const transaction = await this.db.beginTransaction();
    
    try {
      const order = await this.db.orders.findById(orderId, {
        include: ['items']
      });

      if (!order) {
        throw new NotFoundError('Order not found');
      }

      if (order.buyerId !== userId) {
        throw new ForbiddenError('Not authorized to cancel this order');
      }

      if (!this.isCancellable(order.status)) {
        throw new ValidationError('Order cannot be cancelled in current status');
      }

      // Release inventory
      for (const item of order.items) {
        await this.inventoryService.releaseInventory(
          item.productId,
          item.quantity,
          transaction
        );
      }

      // Update order status
      await this.db.orders.update(orderId, {
        status: 'cancelled',
        updatedAt: new Date()
      }, transaction);

      // Process refund if payment was completed
      if (order.paymentStatus === 'completed') {
        await this.paymentService.processRefund(order.id, order.totalAmount);
      }

      await transaction.commit();

      // Send cancellation notification
      await this.notificationService.sendOrderCancellation(orderId, userId);

      return { message: 'Order cancelled successfully' };
    } catch (error) {
      await transaction.rollback();
      throw new ServiceError('Order cancellation failed', error);
    }
  }

  isValidStatusTransition(currentStatus, newStatus) {
    const validTransitions = {
      'pending': ['processing', 'cancelled'],
      'processing': ['shipped', 'cancelled'],
      'shipped': ['delivered'],
      'delivered': [],
      'cancelled': []
    };

    return validTransitions[currentStatus]?.includes(newStatus) || false;
  }

  isCancellable(status) {
    return ['pending', 'processing'].includes(status);
  }

  async handleStatusChange(order, newStatus) {
    switch (newStatus) {
      case 'shipped':
        // Generate tracking number, integrate with shipping provider
        break;
      case 'delivered':
        // Mark as completed, enable reviews
        break;
      case 'cancelled':
        // Handle cancellation logic
        break;
    }
  }

  async validateOrderData(orderData) {
    const errors = [];

    if (!orderData.items || orderData.items.length === 0) {
      errors.push('Order must contain at least one item');
    }

    if (!orderData.shippingAddress) {
      errors.push('Shipping address is required');
    }

    // Validate each item
    for (const item of orderData.items || []) {
      if (!item.productId) {
        errors.push('Product ID is required for all items');
      }
      if (!item.quantity || item.quantity <= 0) {
        errors.push('Quantity must be greater than 0');
      }
      if (!item.unitPrice || item.unitPrice <= 0) {
        errors.push('Unit price must be greater than 0');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
```

## 5. Data Flow Diagrams

### 5.1 User Registration Flow

```
[Client] → [API Gateway] → [User Service]
    ↓
[Validation] → [Password Hashing] → [Database]
    ↓
[Email Service] → [Verification Email]
    ↓
[Response to Client]
```

### 5.2 Product Search Flow

```
[Client] → [API Gateway] → [Product Service]
    ↓
[Cache Check (Redis)] → [Cache Hit] → [Return Cached Results]
    ↓ (Cache Miss)
[Elasticsearch Query] → [Search Results] → [Cache Results] → [Return to Client]
```

### 5.3 Order Processing Flow

```
[Client] → [API Gateway] → [Order Service]
    ↓
[Inventory Check] → [Reserve Inventory] → [Create Order]
    ↓
[Payment Service] → [Process Payment] → [Update Order Status]
    ↓
[Notification Service] → [Send Confirmation] → [Response to Client]
```

### 5.4 Payment Processing Flow

```
[Order Service] → [Payment Service] → [Payment Gateway (Stripe/PayPal)]
    ↓
[Fraud Detection] → [Payment Validation] → [Process Transaction]
    ↓
[Update Payment Status] → [Notification Service] → [Audit Log]
```

## 6. Sequence Diagrams

### 6.1 User Registration Sequence

```
Client          API Gateway    User Service    Database    Email Service
  |                 |              |             |             |
  |-- POST /register ->|              |             |             |
  |                 |-- validate -->|             |             |
  |                 |              |-- check email ->|             |
  |                 |              |<-- result ---|             |
  |                 |              |-- hash pwd --|             |
  |                 |              |-- create user ->|             |
  |                 |              |<-- user id ---|             |
  |                 |              |-- send email ----------->|
  |                 |<-- response --|             |             |
  |<-- 201 Created --|              |             |             |
```

### 6.2 Product Search Sequence

```
Client          API Gateway    Product Service    Redis Cache    Elasticsearch
  |                 |              |                 |              |
  |-- GET /search -->|              |                 |              |
  |                 |-- route ----->|                 |              |
  |                 |              |-- check cache ->|              |
  |                 |              |<-- cache miss ---|              |
  |                 |              |-- search query ------------->|
  |                 |              |<-- results ----------------|
  |                 |              |-- cache results ->|              |
  |                 |<-- response --|                 |              |
  |<-- 200 OK ------|              |                 |              |
```

### 6.3 Order Creation Sequence

```
Client    API Gateway    Order Service    Inventory    Payment    Database    Notification
  |           |              |               |           |           |             |
  |-- POST -->|              |               |           |           |             |
  |           |-- route ----->|               |           |           |             |
  |           |              |-- reserve ---->|           |           |             |
  |           |              |<-- confirmed --|           |           |             |
  |           |              |-- create order ----------->|             |
  |           |              |<-- order id --------------|             |
  |           |              |-- process payment -------->|           |             |
  |           |              |<-- payment result ---------|           |             |
  |           |              |-- send notification --------------------->|
  |           |<-- response --|               |           |           |             |
  |<-- 201 ---|              |               |           |           |             |
```

## 7. Implementation Details

### 7.1 Security Implementation

```javascript
// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Role-based Authorization Middleware
const authorizeRole = (roles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.roles) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const hasRole = req.user.roles.some(role => roles.includes(role));
    if (!hasRole) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

// Rate Limiting
const rateLimit = require('express-rate-limit');

const createAccountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 account creation requests per windowMs
  message: 'Too many accounts created from this IP, please try again after an hour.'
});

// Input Validation
const { body, validationResult } = require('express-validator');

const validateUserRegistration = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/),
  body('firstName').trim().isLength({ min: 2 }),
  body('lastName').trim().isLength({ min: 2 }),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];
```

### 7.2 Database Connection and Configuration

```javascript
// Database Configuration
const { Pool } = require('pg');
const Redis = require('redis');

// PostgreSQL Connection Pool
const dbPool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Redis Connection
const redisClient = Redis.createClient({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: null
});

// Elasticsearch Configuration
const { Client } = require('@elastic/elasticsearch');

const esClient = new Client({
  node: process.env.ELASTICSEARCH_URL,
  auth: {
    username: process.env.ELASTICSEARCH_USERNAME,
    password: process.env.ELASTICSEARCH_PASSWORD
  },
  maxRetries: 5,
  requestTimeout: 60000,
  sniffOnStart: true
});
```

### 7.3 Error Handling and Logging

```javascript
// Custom Error Classes
class ServiceError extends Error {
  constructor(message, originalError = null, statusCode = 500) {
    super(message);
    this.name = 'ServiceError';
    this.statusCode = statusCode;
    this.originalError = originalError;
  }
}

class ValidationError extends ServiceError {
  constructor(message) {
    super(message, null, 400);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends ServiceError {
  constructor(message) {
    super(message, null, 404);
    this.name = 'NotFoundError';
  }
}

class AuthenticationError extends ServiceError {
  constructor(message) {
    super(message, null, 401);
    this.name = 'AuthenticationError';
  }
}

// Global Error Handler
const errorHandler = (err, req, res, next) => {
  // Log error
  logger.error({
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Send response
  if (err instanceof ServiceError) {
    res.status(err.statusCode).json({
      error: err.message,
      type: err.name
    });
  } else {
    res.status(500).json({
      error: 'Internal server error',
      type: 'ServerError'
    });
  }
};

// Structured Logging
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'davtest1139-platform' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}
```

### 7.4 Performance Optimization

```javascript
// Caching Strategy
class CacheService {
  constructor(redisClient) {
    this.redis = redisClient;
  }

  async get(key) {
    try {
      return await this.redis.get(key);
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  async set(key, value, ttl = 300) {
    try {
      await this.redis.setex(key, ttl, value);
    } catch (error) {
      logger.error('Cache set error:', error);
    }
  }

  async del(key) {
    try {
      await this.redis.del(key);
    } catch (error) {
      logger.error('Cache delete error:', error);
    }
  }

  async invalidatePattern(pattern) {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(keys);
      }
    } catch (error) {
      logger.error('Cache invalidation error:', error);
    }
  }
}

// Database Query Optimization
class DatabaseService {
  constructor(pool) {
    this.pool = pool;
  }

  async query(text, params) {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      
      logger.info('Executed query', {
        text: text.substring(0, 100),
        duration,
        rows: result.rowCount
      });
      
      return result;
    } catch (error) {
      logger.error('Database query error:', {
        text: text.substring(0, 100),
        error: error.message
      });
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
}
```

## 8. Testing Strategy

### 8.1 Unit Tests

```javascript
// UserService.test.js
const UserService = require('../services/UserService');
const bcrypt = require('bcrypt');

describe('UserService', () => {
  let userService;
  let mockDatabase;
  let mockEmailService;
  let mockJwtService;

  beforeEach(() => {
    mockDatabase = {
      users: {
        findByEmail: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      }
    };
    mockEmailService = {
      sendVerificationEmail: jest.fn()
    };
    mockJwtService = {
      generateVerificationToken: jest.fn(),
      generateAccessToken: jest.fn()
    };

    userService = new UserService(mockDatabase, mockEmailService, mockJwtService);
  });

  describe('registerUser', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'SecurePass123!'
      };

      mockDatabase.users.findByEmail.mockResolvedValue(null);
      mockDatabase.users.create.mockResolvedValue({ id: 'user-123' });
      mockJwtService.generateVerificationToken.mockReturnValue('token-123');

      const result = await userService.registerUser(userData);

      expect(result.userId).toBe('user-123');
      expect(mockEmailService.sendVerificationEmail).toHaveBeenCalled();
    });

    it('should throw error for duplicate email', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'existing@example.com',
        password: 'SecurePass123!'
      };

      mockDatabase.users.findByEmail.mockResolvedValue({ id: 'existing-user' });

      await expect(userService.registerUser(userData))
        .rejects.toThrow('Email already registered');
    });
  });

  describe('validateUserData', () => {
    it('should validate correct user data', () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'SecurePass123!'
      };

      const result = userService.validateUserData(userData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject weak password', () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: '123'
      };

      const result = userService.validateUserData(userData);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters with uppercase, lowercase, number, and special character');
    });
  });
});
```

### 8.2 Integration Tests

```javascript
// api.integration.test.js
const request = require('supertest');
const app = require('../app');
const { setupTestDatabase, cleanupTestDatabase } = require('./helpers/database');

describe('API Integration Tests', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  describe('User Registration Flow', () => {
    it('should complete full registration flow', async () => {
      // Register user
      const registrationResponse = await request(app)
        .post('/api/v1/users/register')
        .send({
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          password: 'TestPass123!'
        })
        .expect(201);

      expect(registrationResponse.body.userId).toBeDefined();

      // Verify email (simulate)
      const verificationResponse = await request(app)
        .get('/api/v1/users/verify-email/mock-token')
        .expect(200);

      // Login
      const loginResponse = await request(app)
        .post('/api/v1/users/login')
        .send({
          email: 'test@example.com',
          password: 'TestPass123!'
        })
        .expect(200);

      expect(loginResponse.body.token).toBeDefined();
    });
  });

  describe('Product Search', () => {
    it('should search products and return results', async () => {
      const response = await request(app)
        .get('/api/v1/products/search?q=laptop')
        .expect(200);

      expect(response.body.products).toBeDefined();
      expect(Array.isArray(response.body.products)).toBe(true);
    });
  });

  describe('Order Processing', () => {
    it('should create order with valid data', async () => {
      // First login to get token
      const loginResponse = await request(app)
        .post('/api/v1/users/login')
        .send({
          email: 'test@example.com',
          password: 'TestPass123!'
        });

      const token = loginResponse.body.token;

      // Create order
      const orderResponse = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [{
            productId: 'test-product-id',
            quantity: 1,
            unitPrice: 99.99
          }],
          shippingAddress: {
            street: '123 Test St',
            city: 'Test City',
            state: 'TS',
            zipCode: '12345',
            country: 'USA'
          }
        })
        .expect(201);

      expect(orderResponse.body.id).toBeDefined();
      expect(orderResponse.body.status).toBe('pending');
    });
  });
});
```

## 9. Deployment Configuration

### 9.1 Docker Configuration

```dockerfile
# Dockerfile
FROM node:16-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Change ownership
RUN chown -R nextjs:nodejs /app
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start application
CMD ["npm", "start"]
```

### 9.2 Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  api-gateway:
    build: ./api-gateway
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - user-service
      - product-service
      - order-service

  user-service:
    build: ./user-service
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - DB_NAME=davtest1139_users
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
      - REDIS_HOST=redis
    depends_on:
      - postgres
      - redis

  product-service:
    build: ./product-service
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - DB_NAME=davtest1139_products
      - ELASTICSEARCH_URL=http://elasticsearch:9200
      - REDIS_HOST=redis
    depends_on:
      - postgres
      - elasticsearch
      - redis

  order-service:
    build: ./order-service
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - DB_NAME=davtest1139_orders
      - KAFKA_BROKERS=kafka:9092
    depends_on:
      - postgres
      - kafka

  payment-service:
    build: ./payment-service
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
      - PAYPAL_CLIENT_ID=${PAYPAL_CLIENT_ID}
    depends_on:
      - postgres

  postgres:
    image: postgres:13
    environment:
      - POSTGRES_DB=davtest1139
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-scripts:/docker-entrypoint-initdb.d
    ports:
      - "5432:5432"

  redis:
    image: redis:6-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  elasticsearch:
    image: elasticsearch:7.14.0
    environment:
      - discovery.type=single-node
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data
    ports:
      - "9200:9200"

  kafka:
    image: confluentinc/cp-kafka:latest
    environment:
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
    depends_on:
      - zookeeper

  zookeeper:
    image: confluentinc/cp-zookeeper:latest
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000

volumes:
  postgres_data:
  redis_data:
  elasticsearch_data:
```

### 9.3 Kubernetes Deployment

```yaml
# k8s/user-service-deployment.yaml
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
        image: davtest1139/user-service:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DB_HOST
          value: "postgres-service"
        - name: DB_USER
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: username
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: password
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
            path: /ready
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
  - port: 80
    targetPort: 3000
  type: ClusterIP
```

## 10. Monitoring and Observability

### 10.1 Health Check Endpoints

```javascript
// health.js
const express = require('express');
const router = express.Router();

// Basic health check
router.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'davtest1139-user-service',
      version: process.env.npm_package_version || '1.0.0'
    };

    res.status(200).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// Detailed readiness check
router.get('/ready', async (req, res) => {
  try {
    const checks = await Promise.all([
      checkDatabase(),
      checkRedis(),
      checkExternalServices()
    ]);

    const allHealthy = checks.every(check => check.status === 'healthy');

    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'ready' : 'not ready',
      checks
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      error: error.message
    });
  }
});

async function checkDatabase() {
  try {
    await dbPool.query('SELECT 1');
    return { service: 'database', status: 'healthy' };
  } catch (error) {
    return { service: 'database', status: 'unhealthy', error: error.message };
  }
}

async function checkRedis() {
  try {
    await redisClient.ping();
    return { service: 'redis', status: 'healthy' };
  } catch (error) {
    return { service: 'redis', status: 'unhealthy', error: error.message };
  }
}

async function checkExternalServices() {
  // Check external service dependencies
  return { service: 'external', status: 'healthy' };
}

module.exports = router;
```

### 10.2 Metrics Collection

```javascript
// metrics.js
const prometheus = require('prom-client');

// Create metrics
const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status']
});

const httpRequestTotal = new prometheus.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status']
});

const databaseQueryDuration = new prometheus.Histogram({
  name: 'database_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['query_type']
});

// Middleware to collect HTTP metrics
const collectHttpMetrics = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route ? req.route.path : req.path;
    
    httpRequestDuration
      .labels(req.method, route, res.statusCode)
      .observe(duration);
    
    httpRequestTotal
      .labels(req.method, route, res.statusCode)
      .inc();
  });
  
  next();
};

// Metrics endpoint
const metricsEndpoint = (req, res) => {
  res.set('Content-Type', prometheus.register.contentType);
  res.end(prometheus.register.metrics());
};

module.exports = {
  collectHttpMetrics,
  metricsEndpoint,
  httpRequestDuration,
  httpRequestTotal,
  databaseQueryDuration
};
```

This comprehensive Low-Level Design document provides detailed implementation specifications for the DavTest1139 Online Shopping Platform, covering all aspects from database design to deployment configuration, ensuring a robust, scalable, and maintainable e-commerce solution.