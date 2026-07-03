# Low-Level Design Document
# Online Shopping Platform - DavTest1010

## Table of Contents
1. [Component Specifications](#component-specifications)
2. [Data Flow Diagrams](#data-flow-diagrams)
3. [Sequence Diagrams](#sequence-diagrams)
4. [Implementation Details](#implementation-details)
5. [Database Schema](#database-schema)
6. [API Specifications](#api-specifications)
7. [Security Implementation](#security-implementation)
8. [Deployment Architecture](#deployment-architecture)

## Component Specifications

### 1. API Gateway Component

```typescript
interface APIGatewayConfig {
  rateLimiting: {
    requestsPerMinute: number;
    burstCapacity: number;
    keyStrategy: 'IP' | 'USER' | 'API_KEY';
  };
  authentication: {
    jwtSecret: string;
    tokenExpiry: number;
    refreshTokenExpiry: number;
  };
  loadBalancing: {
    algorithm: 'ROUND_ROBIN' | 'LEAST_CONNECTIONS' | 'WEIGHTED';
    healthCheckInterval: number;
  };
}

class APIGateway {
  private rateLimiter: RateLimiter;
  private authService: AuthenticationService;
  private loadBalancer: LoadBalancer;
  
  constructor(config: APIGatewayConfig) {
    this.rateLimiter = new RateLimiter(config.rateLimiting);
    this.authService = new AuthenticationService(config.authentication);
    this.loadBalancer = new LoadBalancer(config.loadBalancing);
  }
  
  async handleRequest(request: IncomingRequest): Promise<Response> {
    // Rate limiting check
    if (!await this.rateLimiter.isAllowed(request)) {
      return new Response(429, 'Rate limit exceeded');
    }
    
    // Authentication
    const authResult = await this.authService.validateToken(request.headers.authorization);
    if (!authResult.valid) {
      return new Response(401, 'Unauthorized');
    }
    
    // Route to appropriate service
    const targetService = this.loadBalancer.selectService(request.path);
    return await this.forwardRequest(request, targetService);
  }
}
```

### 2. User Service Component

```typescript
interface UserProfile {
  userId: string;
  email: string;
  passwordHash: string;
  profile: {
    firstName: string;
    lastName: string;
    phone: string;
    address: Address;
  };
  roles: Role[];
  isActive: boolean;
  createdAt: Date;
  lastLogin: Date;
}

class UserService {
  private userRepository: UserRepository;
  private passwordService: PasswordService;
  private jwtService: JWTService;
  private auditService: AuditService;
  
  async registerUser(userData: RegisterUserRequest): Promise<UserRegistrationResponse> {
    // Input validation
    const validationResult = await this.validateUserInput(userData);
    if (!validationResult.valid) {
      throw new ValidationError(validationResult.errors);
    }
    
    // Check if user exists
    const existingUser = await this.userRepository.findByEmail(userData.email);
    if (existingUser) {
      throw new ConflictError('User already exists');
    }
    
    // Hash password
    const passwordHash = await this.passwordService.hash(userData.password);
    
    // Create user
    const user: UserProfile = {
      userId: generateUUID(),
      email: userData.email,
      passwordHash,
      profile: userData.profile,
      roles: [await this.getDefaultRole()],
      isActive: true,
      createdAt: new Date(),
      lastLogin: null
    };
    
    const savedUser = await this.userRepository.save(user);
    
    // Audit log
    await this.auditService.log({
      action: 'USER_REGISTRATION',
      userId: savedUser.userId,
      timestamp: new Date(),
      metadata: { email: userData.email }
    });
    
    return {
      userId: savedUser.userId,
      message: 'User registered successfully'
    };
  }
  
  async authenticateUser(credentials: LoginRequest): Promise<AuthenticationResponse> {
    const user = await this.userRepository.findByEmail(credentials.email);
    if (!user || !user.isActive) {
      throw new AuthenticationError('Invalid credentials');
    }
    
    const isPasswordValid = await this.passwordService.verify(
      credentials.password, 
      user.passwordHash
    );
    
    if (!isPasswordValid) {
      await this.auditService.log({
        action: 'FAILED_LOGIN_ATTEMPT',
        userId: user.userId,
        timestamp: new Date(),
        metadata: { ip: credentials.ipAddress }
      });
      throw new AuthenticationError('Invalid credentials');
    }
    
    // Update last login
    await this.userRepository.updateLastLogin(user.userId, new Date());
    
    // Generate JWT tokens
    const accessToken = await this.jwtService.generateAccessToken(user);
    const refreshToken = await this.jwtService.generateRefreshToken(user);
    
    await this.auditService.log({
      action: 'SUCCESSFUL_LOGIN',
      userId: user.userId,
      timestamp: new Date(),
      metadata: { ip: credentials.ipAddress }
    });
    
    return {
      accessToken,
      refreshToken,
      user: this.sanitizeUser(user)
    };
  }
}
```

### 3. Product Service Component

```typescript
interface Product {
  productId: string;
  name: string;
  description: string;
  price: number;
  sku: string;
  inventory: number;
  images: string[];
  sellerId: string;
  categoryId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

class ProductService {
  private productRepository: ProductRepository;
  private elasticsearchClient: ElasticsearchClient;
  private cacheService: CacheService;
  private inventoryService: InventoryService;
  
  async searchProducts(searchRequest: ProductSearchRequest): Promise<ProductSearchResponse> {
    const cacheKey = this.generateCacheKey(searchRequest);
    
    // Check cache first
    const cachedResult = await this.cacheService.get(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }
    
    // Build Elasticsearch query
    const query = this.buildSearchQuery(searchRequest);
    
    const searchResult = await this.elasticsearchClient.search({
      index: 'products',
      body: query
    });
    
    const products = searchResult.body.hits.hits.map(hit => hit._source);
    
    // Enrich with real-time inventory
    const enrichedProducts = await Promise.all(
      products.map(async (product) => ({
        ...product,
        inventory: await this.inventoryService.getCurrentStock(product.productId)
      }))
    );
    
    const response = {
      products: enrichedProducts,
      totalCount: searchResult.body.hits.total.value,
      facets: this.extractFacets(searchResult.body.aggregations)
    };
    
    // Cache the result
    await this.cacheService.set(cacheKey, response, 300); // 5 minutes
    
    return response;
  }
  
  private buildSearchQuery(request: ProductSearchRequest): any {
    const query: any = {
      query: {
        bool: {
          must: [],
          filter: []
        }
      },
      aggs: {
        categories: { terms: { field: 'categoryId' } },
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
      },
      from: request.offset || 0,
      size: request.limit || 20
    };
    
    // Text search
    if (request.query) {
      query.query.bool.must.push({
        multi_match: {
          query: request.query,
          fields: ['name^2', 'description', 'sku'],
          fuzziness: 'AUTO'
        }
      });
    }
    
    // Category filter
    if (request.categoryId) {
      query.query.bool.filter.push({
        term: { categoryId: request.categoryId }
      });
    }
    
    // Price range filter
    if (request.priceRange) {
      query.query.bool.filter.push({
        range: {
          price: {
            gte: request.priceRange.min,
            lte: request.priceRange.max
          }
        }
      });
    }
    
    // Active products only
    query.query.bool.filter.push({
      term: { isActive: true }
    });
    
    // Sorting
    if (request.sortBy) {
      query.sort = [{ [request.sortBy]: { order: request.sortOrder || 'asc' } }];
    }
    
    return query;
  }
}
```

### 4. Order Service Component

```typescript
interface Order {
  orderId: string;
  consumerId: string;
  orderNumber: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  paymentId: string;
  shippingAddress: Address;
  createdAt: Date;
  updatedAt: Date;
}

interface OrderItem {
  orderItemId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  sellerId: string;
}

enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  PROCESSING = 'PROCESSING',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED'
}

class OrderService {
  private orderRepository: OrderRepository;
  private cartService: CartService;
  private inventoryService: InventoryService;
  private paymentService: PaymentService;
  private notificationService: NotificationService;
  private eventBus: EventBus;
  
  async createOrder(orderRequest: CreateOrderRequest): Promise<CreateOrderResponse> {
    // Start transaction
    const transaction = await this.orderRepository.beginTransaction();
    
    try {
      // Get cart items
      const cartItems = await this.cartService.getCartItems(orderRequest.consumerId);
      if (!cartItems || cartItems.length === 0) {
        throw new ValidationError('Cart is empty');
      }
      
      // Validate inventory
      const inventoryCheck = await this.validateInventory(cartItems);
      if (!inventoryCheck.valid) {
        throw new InsufficientInventoryError(inventoryCheck.unavailableItems);
      }
      
      // Reserve inventory
      const reservations = await this.inventoryService.reserveItems(cartItems);
      
      // Calculate totals
      const orderItems = cartItems.map(item => ({
        orderItemId: generateUUID(),
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.quantity * item.unitPrice,
        sellerId: item.sellerId
      }));
      
      const totalAmount = orderItems.reduce((sum, item) => sum + item.totalPrice, 0);
      
      // Create order
      const order: Order = {
        orderId: generateUUID(),
        consumerId: orderRequest.consumerId,
        orderNumber: await this.generateOrderNumber(),
        items: orderItems,
        totalAmount,
        status: OrderStatus.PENDING,
        paymentId: null,
        shippingAddress: orderRequest.shippingAddress,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const savedOrder = await this.orderRepository.save(order, transaction);
      
      // Clear cart
      await this.cartService.clearCart(orderRequest.consumerId, transaction);
      
      // Commit transaction
      await transaction.commit();
      
      // Publish event
      await this.eventBus.publish('order.created', {
        orderId: savedOrder.orderId,
        consumerId: savedOrder.consumerId,
        totalAmount: savedOrder.totalAmount
      });
      
      return {
        orderId: savedOrder.orderId,
        orderNumber: savedOrder.orderNumber,
        totalAmount: savedOrder.totalAmount,
        status: savedOrder.status
      };
      
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
  
  async updateOrderStatus(orderId: string, newStatus: OrderStatus, metadata?: any): Promise<void> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundError('Order not found');
    }
    
    // Validate status transition
    if (!this.isValidStatusTransition(order.status, newStatus)) {
      throw new ValidationError(`Invalid status transition from ${order.status} to ${newStatus}`);
    }
    
    // Update order
    await this.orderRepository.updateStatus(orderId, newStatus);
    
    // Send notification
    await this.notificationService.sendOrderStatusUpdate({
      userId: order.consumerId,
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      status: newStatus,
      metadata
    });
    
    // Publish event
    await this.eventBus.publish('order.status_updated', {
      orderId,
      oldStatus: order.status,
      newStatus,
      metadata
    });
  }
}
```

### 5. Payment Service Component

```typescript
interface PaymentRequest {
  orderId: string;
  amount: number;
  currency: string;
  paymentMethodId: string;
  billingAddress: Address;
}

interface PaymentResponse {
  paymentId: string;
  status: PaymentStatus;
  transactionId: string;
  gatewayResponse: any;
}

enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED'
}

class PaymentService {
  private paymentRepository: PaymentRepository;
  private stripeGateway: StripeGateway;
  private paypalGateway: PayPalGateway;
  private fraudDetectionService: FraudDetectionService;
  private encryptionService: EncryptionService;
  
  async processPayment(paymentRequest: PaymentRequest): Promise<PaymentResponse> {
    // Fraud detection
    const fraudCheck = await this.fraudDetectionService.analyze(paymentRequest);
    if (fraudCheck.riskScore > 0.8) {
      throw new FraudDetectedError('High fraud risk detected');
    }
    
    // Get payment method
    const paymentMethod = await this.getPaymentMethod(paymentRequest.paymentMethodId);
    
    // Create payment record
    const payment = {
      paymentId: generateUUID(),
      orderId: paymentRequest.orderId,
      amount: paymentRequest.amount,
      currency: paymentRequest.currency,
      status: PaymentStatus.PENDING,
      methodId: paymentRequest.paymentMethodId,
      createdAt: new Date()
    };
    
    await this.paymentRepository.save(payment);
    
    try {
      // Process payment based on gateway
      let gatewayResponse;
      
      switch (paymentMethod.provider) {
        case 'stripe':
          gatewayResponse = await this.stripeGateway.processPayment({
            amount: paymentRequest.amount,
            currency: paymentRequest.currency,
            paymentMethodToken: paymentMethod.token,
            orderId: paymentRequest.orderId
          });
          break;
          
        case 'paypal':
          gatewayResponse = await this.paypalGateway.processPayment({
            amount: paymentRequest.amount,
            currency: paymentRequest.currency,
            paymentMethodToken: paymentMethod.token,
            orderId: paymentRequest.orderId
          });
          break;
          
        default:
          throw new UnsupportedPaymentMethodError('Unsupported payment provider');
      }
      
      // Update payment status
      await this.paymentRepository.updatePayment(payment.paymentId, {
        status: PaymentStatus.COMPLETED,
        transactionId: gatewayResponse.transactionId,
        gatewayResponse: this.encryptionService.encrypt(JSON.stringify(gatewayResponse)),
        processedAt: new Date()
      });
      
      return {
        paymentId: payment.paymentId,
        status: PaymentStatus.COMPLETED,
        transactionId: gatewayResponse.transactionId,
        gatewayResponse
      };
      
    } catch (error) {
      // Update payment status to failed
      await this.paymentRepository.updatePayment(payment.paymentId, {
        status: PaymentStatus.FAILED,
        gatewayResponse: this.encryptionService.encrypt(JSON.stringify({ error: error.message })),
        processedAt: new Date()
      });
      
      throw new PaymentProcessingError('Payment processing failed', error);
    }
  }
}
```

## Data Flow Diagrams

### User Registration Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client    │    │ API Gateway │    │User Service │    │  Database   │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │                  │
       │ POST /register   │                  │                  │
       ├─────────────────►│                  │                  │
       │                  │ Validate & Route │                  │
       │                  ├─────────────────►│                  │
       │                  │                  │ Check if exists  │
       │                  │                  ├─────────────────►│
       │                  │                  │◄─────────────────┤
       │                  │                  │ Hash password    │
       │                  │                  │ Create user      │
       │                  │                  ├─────────────────►│
       │                  │                  │◄─────────────────┤
       │                  │ Success Response │                  │
       │                  │◄─────────────────┤                  │
       │◄─────────────────┤                  │                  │
       │                  │                  │                  │
```

### Product Search Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client    │    │ API Gateway │    │Product Svc  │    │    Cache    │    │Elasticsearch│
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │                  │                  │
       │ GET /search      │                  │                  │                  │
       ├─────────────────►│                  │                  │                  │
       │                  │ Route request    │                  │                  │
       │                  ├─────────────────►│                  │                  │
       │                  │                  │ Check cache      │                  │
       │                  │                  ├─────────────────►│                  │
       │                  │                  │◄─────────────────┤                  │
       │                  │                  │ Cache miss       │                  │
       │                  │                  │ Search query     │                  │
       │                  │                  ├──────────────────────────────────►│
       │                  │                  │◄──────────────────────────────────┤
       │                  │                  │ Cache results    │                  │
       │                  │                  ├─────────────────►│                  │
       │                  │ Return results   │                  │                  │
       │                  │◄─────────────────┤                  │                  │
       │◄─────────────────┤                  │                  │                  │
```

### Order Processing Flow

```
┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
│ Client  │  │API Gate │  │Order Svc│  │Pay Svc  │  │Inventory│  │Notify   │
└────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘
     │            │            │            │            │            │
     │POST /order │            │            │            │            │
     ├───────────►│            │            │            │            │
     │            │Route       │            │            │            │
     │            ├───────────►│            │            │            │
     │            │            │Validate    │            │            │
     │            │            │cart        │            │            │
     │            │            │Check inv   │            │            │
     │            │            ├────────────────────────►│            │
     │            │            │◄────────────────────────┤            │
     │            │            │Reserve inv │            │            │
     │            │            ├────────────────────────►│            │
     │            │            │Create order│            │            │
     │            │            │Process pay │            │            │
     │            │            ├───────────►│            │            │
     │            │            │◄───────────┤            │            │
     │            │            │Send notify │            │            │
     │            │            ├────────────────────────────────────►│
     │            │Response    │            │            │            │
     │            │◄───────────┤            │            │            │
     │◄───────────┤            │            │            │            │
```

## Sequence Diagrams

### Authentication Sequence

```
actor User
participant Client
participant APIGateway
participant UserService
participant Database
participant AuditService

User->>Client: Enter credentials
Client->>APIGateway: POST /auth/login
APIGateway->>UserService: Forward request
UserService->>Database: Find user by email
Database-->>UserService: User data
UserService->>UserService: Verify password
alt Password valid
    UserService->>Database: Update last login
    UserService->>UserService: Generate JWT tokens
    UserService->>AuditService: Log successful login
    UserService-->>APIGateway: Return tokens
    APIGateway-->>Client: Authentication response
    Client-->>User: Login successful
else Password invalid
    UserService->>AuditService: Log failed attempt
    UserService-->>APIGateway: Authentication error
    APIGateway-->>Client: 401 Unauthorized
    Client-->>User: Login failed
end
```

### Payment Processing Sequence

```
participant OrderService
participant PaymentService
participant FraudDetection
participant PaymentGateway
participant Database
participant NotificationService

OrderService->>PaymentService: Process payment
PaymentService->>FraudDetection: Analyze transaction
FraudDetection-->>PaymentService: Risk score
alt Low risk
    PaymentService->>Database: Create payment record
    PaymentService->>PaymentGateway: Process payment
    PaymentGateway-->>PaymentService: Transaction result
    alt Payment successful
        PaymentService->>Database: Update payment status
        PaymentService->>NotificationService: Send confirmation
        PaymentService-->>OrderService: Payment successful
    else Payment failed
        PaymentService->>Database: Update payment status
        PaymentService-->>OrderService: Payment failed
    end
else High risk
    PaymentService-->>OrderService: Fraud detected
end
```

## Implementation Details

### Database Schema

```sql
-- Users table
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    account_status VARCHAR(50) DEFAULT 'ACTIVE',
    CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Profiles table
CREATE TABLE profiles (
    profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    address JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Roles table
CREATE TABLE roles (
    role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_name VARCHAR(50) UNIQUE NOT NULL,
    permissions JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User roles junction table
CREATE TABLE user_roles (
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(role_id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_id)
);

-- Categories table
CREATE TABLE categories (
    category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES categories(category_id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products table
CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    sku VARCHAR(100) UNIQUE NOT NULL,
    inventory INTEGER NOT NULL DEFAULT 0 CHECK (inventory >= 0),
    images JSONB,
    seller_id UUID REFERENCES users(user_id),
    category_id UUID REFERENCES categories(category_id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Shopping carts table
CREATE TABLE shopping_carts (
    cart_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consumer_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    session_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Cart items table
CREATE TABLE cart_items (
    cart_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID REFERENCES shopping_carts(cart_id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(product_id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Orders table
CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consumer_id UUID REFERENCES users(user_id),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    payment_id UUID,
    shipping_address JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_status CHECK (status IN ('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'))
);

-- Order items table
CREATE TABLE order_items (
    order_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(product_id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    seller_id UUID REFERENCES users(user_id)
);

-- Payment methods table
CREATE TABLE payment_methods (
    method_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    provider VARCHAR(100) NOT NULL,
    token TEXT NOT NULL, -- Encrypted
    is_default BOOLEAN DEFAULT false,
    expiry_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payments table
CREATE TABLE payments (
    payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(order_id),
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    method_id UUID REFERENCES payment_methods(method_id),
    transaction_id VARCHAR(255),
    gateway_response TEXT, -- Encrypted
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_payment_status CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED'))
);

-- Product reviews table
CREATE TABLE product_reviews (
    review_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(product_id) ON DELETE CASCADE,
    consumer_id UUID REFERENCES users(user_id),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order tracking table
CREATE TABLE order_tracking (
    tracking_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(order_id) ON DELETE CASCADE,
    status VARCHAR(100) NOT NULL,
    location VARCHAR(255),
    carrier_info JSONB,
    estimated_delivery TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notifications table
CREATE TABLE notifications (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    priority VARCHAR(20) DEFAULT 'MEDIUM',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP
);

-- Disputes table
CREATE TABLE disputes (
    dispute_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(order_id),
    reporter_id UUID REFERENCES users(user_id),
    type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'OPEN',
    assigned_to UUID REFERENCES users(user_id),
    resolution TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

-- Audit logs table
CREATE TABLE audit_logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_active ON users(is_active);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_seller ON products(seller_id);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_orders_consumer ON orders(consumer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read);

-- Full-text search indexes
CREATE INDEX idx_products_search ON products USING gin(to_tsvector('english', name || ' ' || description));
```

### API Specifications

#### User Management APIs

```yaml
# User Registration
POST /api/v1/users/register
Content-Type: application/json

Request:
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "profile": {
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+1234567890",
    "address": {
      "street": "123 Main St",
      "city": "Anytown",
      "state": "CA",
      "zipCode": "12345",
      "country": "US"
    }
  }
}

Response (201):
{
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "message": "User registered successfully"
}

# User Authentication
POST /api/v1/auth/login
Content-Type: application/json

Request:
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}

Response (200):
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "userId": "123e4567-e89b-12d3-a456-426614174000",
    "email": "user@example.com",
    "profile": {
      "firstName": "John",
      "lastName": "Doe"
    },
    "roles": ["CONSUMER"]
  }
}
```

#### Product Management APIs

```yaml
# Product Search
GET /api/v1/products/search
Authorization: Bearer {accessToken}

Query Parameters:
- q: string (search query)
- category: string (category ID)
- minPrice: number
- maxPrice: number
- sortBy: string (price, name, rating)
- sortOrder: string (asc, desc)
- page: number (default: 1)
- limit: number (default: 20)

Response (200):
{
  "products": [
    {
      "productId": "prod-123",
      "name": "Wireless Headphones",
      "description": "High-quality wireless headphones",
      "price": 99.99,
      "sku": "WH-001",
      "inventory": 50,
      "images": ["https://example.com/image1.jpg"],
      "seller": {
        "sellerId": "seller-123",
        "name": "Electronics Store"
      },
      "category": {
        "categoryId": "cat-123",
        "name": "Electronics"
      },
      "rating": 4.5,
      "reviewCount": 120
    }
  ],
  "totalCount": 1500,
  "page": 1,
  "limit": 20,
  "facets": {
    "categories": [
      {"id": "cat-123", "name": "Electronics", "count": 800},
      {"id": "cat-124", "name": "Clothing", "count": 700}
    ],
    "priceRanges": [
      {"range": "0-50", "count": 400},
      {"range": "50-100", "count": 600},
      {"range": "100-200", "count": 300},
      {"range": "200+", "count": 200}
    ]
  }
}

# Get Product Details
GET /api/v1/products/{productId}
Authorization: Bearer {accessToken}

Response (200):
{
  "productId": "prod-123",
  "name": "Wireless Headphones",
  "description": "High-quality wireless headphones with noise cancellation",
  "price": 99.99,
  "sku": "WH-001",
  "inventory": 50,
  "images": [
    "https://example.com/image1.jpg",
    "https://example.com/image2.jpg"
  ],
  "specifications": {
    "brand": "AudioTech",
    "model": "AT-WH-100",
    "batteryLife": "30 hours",
    "connectivity": "Bluetooth 5.0"
  },
  "seller": {
    "sellerId": "seller-123",
    "name": "Electronics Store",
    "rating": 4.8
  },
  "category": {
    "categoryId": "cat-123",
    "name": "Electronics",
    "breadcrumb": ["Electronics", "Audio", "Headphones"]
  },
  "reviews": {
    "averageRating": 4.5,
    "totalCount": 120,
    "distribution": {
      "5": 60,
      "4": 40,
      "3": 15,
      "2": 3,
      "1": 2
    }
  }
}
```

#### Order Management APIs

```yaml
# Create Order
POST /api/v1/orders
Authorization: Bearer {accessToken}
Content-Type: application/json

Request:
{
  "shippingAddress": {
    "street": "123 Main St",
    "city": "Anytown",
    "state": "CA",
    "zipCode": "12345",
    "country": "US"
  },
  "paymentMethodId": "pm-123"
}

Response (201):
{
  "orderId": "order-123",
  "orderNumber": "ORD-2024-001234",
  "totalAmount": 149.98,
  "status": "PENDING",
  "items": [
    {
      "productId": "prod-123",
      "name": "Wireless Headphones",
      "quantity": 1,
      "unitPrice": 99.99,
      "totalPrice": 99.99
    },
    {
      "productId": "prod-124",
      "name": "Phone Case",
      "quantity": 2,
      "unitPrice": 24.99,
      "totalPrice": 49.98
    }
  ],
  "estimatedDelivery": "2024-01-15T00:00:00Z"
}

# Get Order Details
GET /api/v1/orders/{orderId}
Authorization: Bearer {accessToken}

Response (200):
{
  "orderId": "order-123",
  "orderNumber": "ORD-2024-001234",
  "status": "SHIPPED",
  "totalAmount": 149.98,
  "createdAt": "2024-01-10T10:00:00Z",
  "updatedAt": "2024-01-12T14:30:00Z",
  "items": [...],
  "shippingAddress": {...},
  "payment": {
    "paymentId": "pay-123",
    "status": "COMPLETED",
    "method": "Credit Card",
    "last4": "1234"
  },
  "tracking": {
    "trackingNumber": "1Z999AA1234567890",
    "carrier": "UPS",
    "status": "In Transit",
    "estimatedDelivery": "2024-01-15T00:00:00Z",
    "trackingUrl": "https://ups.com/track/1Z999AA1234567890"
  }
}
```

### Security Implementation

#### JWT Token Structure

```typescript
interface JWTPayload {
  sub: string; // User ID
  email: string;
  roles: string[];
  permissions: string[];
  iat: number; // Issued at
  exp: number; // Expiration
  jti: string; // JWT ID for revocation
}

class JWTService {
  private secretKey: string;
  private algorithm = 'HS256';
  
  async generateAccessToken(user: User): Promise<string> {
    const payload: JWTPayload = {
      sub: user.userId,
      email: user.email,
      roles: user.roles.map(r => r.roleName),
      permissions: this.flattenPermissions(user.roles),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (15 * 60), // 15 minutes
      jti: generateUUID()
    };
    
    return jwt.sign(payload, this.secretKey, { algorithm: this.algorithm });
  }
  
  async generateRefreshToken(user: User): Promise<string> {
    const payload = {
      sub: user.userId,
      type: 'refresh',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days
      jti: generateUUID()
    };
    
    return jwt.sign(payload, this.secretKey, { algorithm: this.algorithm });
  }
}
```

#### Encryption Service

```typescript
class EncryptionService {
  private algorithm = 'aes-256-gcm';
  private keyDerivationSalt: Buffer;
  
  constructor(private masterKey: string) {
    this.keyDerivationSalt = crypto.randomBytes(32);
  }
  
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(this.masterKey, this.keyDerivationSalt, 100000, 32, 'sha256');
    
    const cipher = crypto.createCipher(this.algorithm, key);
    cipher.setAAD(Buffer.from('additional-data'));
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return JSON.stringify({
      iv: iv.toString('hex'),
      encrypted,
      authTag: authTag.toString('hex'),
      salt: this.keyDerivationSalt.toString('hex')
    });
  }
  
  decrypt(encryptedData: string): string {
    const data = JSON.parse(encryptedData);
    const key = crypto.pbkdf2Sync(
      this.masterKey, 
      Buffer.from(data.salt, 'hex'), 
      100000, 
      32, 
      'sha256'
    );
    
    const decipher = crypto.createDecipher(this.algorithm, key);
    decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));
    decipher.setAAD(Buffer.from('additional-data'));
    
    let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}
```

#### Input Validation

```typescript
import Joi from 'joi';

class ValidationService {
  private schemas = {
    userRegistration: Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string()
        .min(8)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/) // Strong password
        .required(),
      profile: Joi.object({
        firstName: Joi.string().min(1).max(100).required(),
        lastName: Joi.string().min(1).max(100).required(),
        phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/), // E.164 format
        address: Joi.object({
          street: Joi.string().required(),
          city: Joi.string().required(),
          state: Joi.string().required(),
          zipCode: Joi.string().required(),
          country: Joi.string().length(2).required() // ISO country code
        })
      }).required()
    }),
    
    productSearch: Joi.object({
      q: Joi.string().max(200),
      category: Joi.string().uuid(),
      minPrice: Joi.number().min(0),
      maxPrice: Joi.number().min(0),
      sortBy: Joi.string().valid('price', 'name', 'rating', 'created'),
      sortOrder: Joi.string().valid('asc', 'desc'),
      page: Joi.number().integer().min(1).max(1000),
      limit: Joi.number().integer().min(1).max(100)
    }),
    
    createOrder: Joi.object({
      shippingAddress: Joi.object({
        street: Joi.string().required(),
        city: Joi.string().required(),
        state: Joi.string().required(),
        zipCode: Joi.string().required(),
        country: Joi.string().length(2).required()
      }).required(),
      paymentMethodId: Joi.string().uuid().required()
    })
  };
  
  validate(data: any, schemaName: keyof typeof this.schemas): ValidationResult {
    const schema = this.schemas[schemaName];
    const { error, value } = schema.validate(data, { abortEarly: false });
    
    if (error) {
      return {
        valid: false,
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      };
    }
    
    return { valid: true, data: value };
  }
}
```

## Deployment Architecture

### Docker Configuration

```dockerfile
# Multi-stage build for Node.js services
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

# Production stage
FROM node:18-alpine AS production

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

WORKDIR /app

COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

USER nextjs

EXPOSE 3000

CMD ["node", "dist/index.js"]
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
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-secret
              key: url
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: jwt-secret
              key: secret
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

### Infrastructure as Code (Terraform)

```hcl
# AWS EKS Cluster
resource "aws_eks_cluster" "shopping_platform" {
  name     = "shopping-platform"
  role_arn = aws_iam_role.cluster.arn
  version  = "1.27"

  vpc_config {
    subnet_ids = aws_subnet.private[*].id
    endpoint_private_access = true
    endpoint_public_access  = true
  }

  depends_on = [
    aws_iam_role_policy_attachment.cluster_AmazonEKSClusterPolicy,
  ]
}

# RDS PostgreSQL Database
resource "aws_db_instance" "main" {
  identifier = "shopping-platform-db"
  
  engine         = "postgres"
  engine_version = "15.3"
  instance_class = "db.r6g.xlarge"
  
  allocated_storage     = 100
  max_allocated_storage = 1000
  storage_type         = "gp3"
  storage_encrypted    = true
  
  db_name  = "shopping_platform"
  username = var.db_username
  password = var.db_password
  
  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name
  
  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"
  
  skip_final_snapshot = false
  final_snapshot_identifier = "shopping-platform-final-snapshot"
  
  tags = {
    Name = "Shopping Platform Database"
  }
}

# ElastiCache Redis Cluster
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "shopping-platform-redis"
  description                = "Redis cluster for shopping platform"
  
  node_type                  = "cache.r6g.large"
  port                       = 6379
  parameter_group_name       = "default.redis7"
  
  num_cache_clusters         = 2
  automatic_failover_enabled = true
  multi_az_enabled          = true
  
  subnet_group_name = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]
  
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  
  tags = {
    Name = "Shopping Platform Redis"
  }
}

# Application Load Balancer
resource "aws_lb" "main" {
  name               = "shopping-platform-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  enable_deletion_protection = true

  tags = {
    Name = "Shopping Platform ALB"
  }
}
```

### Monitoring and Observability

```yaml
# Prometheus Configuration
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
data:
  prometheus.yml: |
    global:
      scrape_interval: 15s
      evaluation_interval: 15s
    
    rule_files:
      - "alert_rules.yml"
    
    alerting:
      alertmanagers:
        - static_configs:
            - targets:
              - alertmanager:9093
    
    scrape_configs:
      - job_name: 'kubernetes-apiservers'
        kubernetes_sd_configs:
        - role: endpoints
        scheme: https
        tls_config:
          ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
        bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
        relabel_configs:
        - source_labels: [__meta_kubernetes_namespace, __meta_kubernetes_service_name, __meta_kubernetes_endpoint_port_name]
          action: keep
          regex: default;kubernetes;https
      
      - job_name: 'shopping-platform-services'
        kubernetes_sd_configs:
        - role: pod
        relabel_configs:
        - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
          action: keep
          regex: true
        - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
          action: replace
          target_label: __metrics_path__
          regex: (.+)
        - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
          action: replace
          regex: ([^:]+)(?::\d+)?;(\d+)
          replacement: $1:$2
          target_label: __address__
```

This comprehensive Low-Level Design document provides detailed implementation specifications for the Online Shopping Platform, including component architectures, data flows, sequence diagrams, database schemas, API specifications, security implementations, and deployment configurations. The design ensures scalability, security, and maintainability while meeting all functional and non-functional requirements.