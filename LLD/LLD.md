# ONLINE SHOPPING PLATFORM - LOW-LEVEL DESIGN

## 1. INTRODUCTION

### 1.1 Purpose
This Low-Level Design (LLD) document provides detailed implementation specifications for the Online Shopping Platform based on the High-Level Design. It includes component specifications, data flows, sequence diagrams, and implementation details for all system components.

### 1.2 Scope
This document covers:
- Detailed component architecture and implementation
- Database schema design and optimization
- API specifications and data contracts
- Security implementation details
- Performance optimization strategies
- Error handling and resilience patterns

### 1.3 Architecture Overview
The system follows a microservices architecture with event-driven communication, implementing Domain-Driven Design (DDD) principles with clear bounded contexts.

## 2. SYSTEM ARCHITECTURE

### 2.1 Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        API Gateway                              │
│                    (Kong/AWS API Gateway)                       │
└─────────────────────┬───────────────────────────────────────────┘
                      │
         ┌────────────┼────────────┐
         │            │            │
    ┌────▼───┐   ┌────▼───┐   ┌────▼───┐
    │ User   │   │Product │   │ Order  │
    │Service │   │Service │   │Service │
    └────┬───┘   └────┬───┘   └────┬───┘
         │            │            │
    ┌────▼───┐   ┌────▼───┐   ┌────▼───┐
    │Payment │   │Inventory│   │Notification│
    │Service │   │Service │   │Service │
    └────────┘   └────────┘   └────────┘
```

### 2.2 Technology Stack

#### Backend Services
- **Runtime**: Node.js 18+ with TypeScript
- **Framework**: Express.js with Helmet for security
- **Database**: PostgreSQL 14+ with connection pooling
- **Cache**: Redis 7+ for session and application cache
- **Message Queue**: Apache Kafka for event streaming
- **Search Engine**: Elasticsearch 8+ for product search

#### Infrastructure
- **Container**: Docker with multi-stage builds
- **Orchestration**: Kubernetes with Helm charts
- **Service Mesh**: Istio for service communication
- **Monitoring**: Prometheus + Grafana + Jaeger
- **CI/CD**: GitHub Actions with security scanning

## 3. DETAILED COMPONENT SPECIFICATIONS

### 3.1 User Service

#### 3.1.1 Component Structure
```typescript
// Domain Layer
interface User {
  id: string;
  email: string;
  passwordHash: string;
  profile: UserProfile;
  roles: Role[];
  isActive: boolean;
  lastLoginAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface UserProfile {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  dateOfBirth: Date;
  addresses: Address[];
}

interface Role {
  id: string;
  name: string;
  permissions: Permission[];
}

interface Permission {
  id: string;
  resource: string;
  action: string;
  conditions?: object;
}
```

#### 3.1.2 Database Schema
```sql
-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User profiles table
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20),
    date_of_birth DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Roles table
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Permissions table
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    conditions JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(resource, action)
);

-- User roles junction table
CREATE TABLE user_roles (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_id)
);

-- Role permissions junction table
CREATE TABLE role_permissions (
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_active ON users(is_active);
CREATE INDEX idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
```

#### 3.1.3 API Specifications

```typescript
// Authentication Controller
@Controller('/api/v1/auth')
export class AuthController {
  
  @Post('/register')
  @ValidateBody(RegisterUserDto)
  async register(@Body() userData: RegisterUserDto): Promise<AuthResponse> {
    // Implementation with email verification
  }
  
  @Post('/login')
  @ValidateBody(LoginDto)
  @RateLimit({ windowMs: 15 * 60 * 1000, max: 5 }) // 5 attempts per 15 minutes
  async login(@Body() credentials: LoginDto): Promise<AuthResponse> {
    // Implementation with account lockout
  }
  
  @Post('/refresh')
  @UseGuards(RefreshTokenGuard)
  async refreshToken(@Req() req: Request): Promise<TokenResponse> {
    // JWT refresh implementation
  }
  
  @Post('/logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: Request): Promise<void> {
    // Token blacklisting
  }
}

// User Management Controller
@Controller('/api/v1/users')
@UseGuards(JwtAuthGuard)
export class UserController {
  
  @Get('/profile')
  async getProfile(@Req() req: Request): Promise<UserProfileResponse> {
    // Get current user profile
  }
  
  @Put('/profile')
  @ValidateBody(UpdateProfileDto)
  async updateProfile(
    @Req() req: Request,
    @Body() profileData: UpdateProfileDto
  ): Promise<UserProfileResponse> {
    // Update user profile with validation
  }
  
  @Post('/change-password')
  @ValidateBody(ChangePasswordDto)
  async changePassword(
    @Req() req: Request,
    @Body() passwordData: ChangePasswordDto
  ): Promise<void> {
    // Secure password change
  }
}
```

#### 3.1.4 Security Implementation

```typescript
// Password Security Service
@Injectable()
export class PasswordService {
  private readonly saltRounds = 12;
  
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }
  
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
  
  validatePasswordStrength(password: string): ValidationResult {
    const requirements = {
      minLength: 8,
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumbers: /\d/.test(password),
      hasSpecialChars: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    };
    
    return {
      isValid: Object.values(requirements).every(Boolean),
      requirements
    };
  }
}

// JWT Service
@Injectable()
export class JwtService {
  private readonly accessTokenExpiry = '15m';
  private readonly refreshTokenExpiry = '7d';
  
  generateTokens(user: User): TokenPair {
    const payload = {
      sub: user.id,
      email: user.email,
      roles: user.roles.map(r => r.name)
    };
    
    return {
      accessToken: jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: this.accessTokenExpiry,
        algorithm: 'RS256'
      }),
      refreshToken: jwt.sign({ sub: user.id }, process.env.JWT_REFRESH_SECRET, {
        expiresIn: this.refreshTokenExpiry,
        algorithm: 'RS256'
      })
    };
  }
}
```

### 3.2 Product Service

#### 3.2.1 Component Structure
```typescript
// Product Domain Models
interface Product {
  id: string;
  name: string;
  description: string;
  category: Category;
  seller: Seller;
  variants: ProductVariant[];
  images: ProductImage[];
  specifications: ProductSpecification[];
  seoMetadata: SEOMetadata;
  status: ProductStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  price: Money;
  compareAtPrice?: Money;
  attributes: VariantAttribute[];
  inventory: InventoryItem;
  isActive: boolean;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  parentId?: string;
  children: Category[];
  level: number;
  path: string;
  isActive: boolean;
}
```

#### 3.2.2 Database Schema
```sql
-- Categories table with hierarchical structure
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    parent_id UUID REFERENCES categories(id),
    level INTEGER NOT NULL DEFAULT 0,
    path LTREE NOT NULL,
    description TEXT,
    image_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products table
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(500) NOT NULL,
    slug VARCHAR(500) UNIQUE NOT NULL,
    description TEXT,
    short_description VARCHAR(1000),
    category_id UUID REFERENCES categories(id),
    seller_id UUID REFERENCES users(id),
    brand VARCHAR(255),
    model VARCHAR(255),
    status VARCHAR(20) DEFAULT 'draft',
    featured BOOLEAN DEFAULT false,
    meta_title VARCHAR(255),
    meta_description VARCHAR(500),
    meta_keywords TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Product variants table
CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    sku VARCHAR(100) UNIQUE NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    compare_at_price DECIMAL(10,2),
    cost_price DECIMAL(10,2),
    weight DECIMAL(8,3),
    dimensions JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Product images table
CREATE TABLE product_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
    url VARCHAR(500) NOT NULL,
    alt_text VARCHAR(255),
    sort_order INTEGER DEFAULT 0,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Product specifications table
CREATE TABLE product_specifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    value TEXT NOT NULL,
    group_name VARCHAR(255),
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_categories_parent_id ON categories(parent_id);
CREATE INDEX idx_categories_path ON categories USING GIST(path);
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_seller_id ON products(seller_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_featured ON products(featured);
CREATE INDEX idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX idx_product_variants_sku ON product_variants(sku);
```

#### 3.2.3 Search Implementation

```typescript
// Elasticsearch Product Index Mapping
const productIndexMapping = {
  mappings: {
    properties: {
      id: { type: 'keyword' },
      name: {
        type: 'text',
        analyzer: 'standard',
        fields: {
          keyword: { type: 'keyword' },
          suggest: { type: 'completion' }
        }
      },
      description: { type: 'text', analyzer: 'standard' },
      category: {
        properties: {
          id: { type: 'keyword' },
          name: { type: 'text' },
          path: { type: 'keyword' }
        }
      },
      price: { type: 'double' },
      brand: { type: 'keyword' },
      status: { type: 'keyword' },
      featured: { type: 'boolean' },
      specifications: {
        type: 'nested',
        properties: {
          name: { type: 'keyword' },
          value: { type: 'keyword' }
        }
      },
      createdAt: { type: 'date' },
      updatedAt: { type: 'date' }
    }
  }
};

// Product Search Service
@Injectable()
export class ProductSearchService {
  
  async searchProducts(query: ProductSearchQuery): Promise<ProductSearchResult> {
    const searchBody = {
      query: {
        bool: {
          must: this.buildMustClauses(query),
          filter: this.buildFilterClauses(query)
        }
      },
      sort: this.buildSortClauses(query.sort),
      aggs: this.buildAggregations(),
      from: (query.page - 1) * query.limit,
      size: query.limit
    };
    
    const response = await this.elasticsearchClient.search({
      index: 'products',
      body: searchBody
    });
    
    return this.transformSearchResponse(response);
  }
  
  private buildMustClauses(query: ProductSearchQuery): any[] {
    const clauses = [];
    
    if (query.q) {
      clauses.push({
        multi_match: {
          query: query.q,
          fields: ['name^3', 'description', 'brand^2'],
          type: 'best_fields',
          fuzziness: 'AUTO'
        }
      });
    }
    
    return clauses;
  }
  
  private buildFilterClauses(query: ProductSearchQuery): any[] {
    const filters = [
      { term: { status: 'active' } }
    ];
    
    if (query.categoryId) {
      filters.push({ term: { 'category.id': query.categoryId } });
    }
    
    if (query.priceRange) {
      filters.push({
        range: {
          price: {
            gte: query.priceRange.min,
            lte: query.priceRange.max
          }
        }
      });
    }
    
    if (query.brands?.length) {
      filters.push({ terms: { brand: query.brands } });
    }
    
    return filters;
  }
}
```

### 3.3 Order Service

#### 3.3.1 Component Structure
```typescript
// Order Domain Models
interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  items: OrderItem[];
  shippingAddress: Address;
  billingAddress: Address;
  subtotal: Money;
  taxAmount: Money;
  shippingAmount: Money;
  discountAmount: Money;
  totalAmount: Money;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface OrderItem {
  id: string;
  orderId: string;
  productVariantId: string;
  quantity: number;
  unitPrice: Money;
  totalPrice: Money;
  status: OrderItemStatus;
}

enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  RETURNED = 'returned'
}
```

#### 3.3.2 Database Schema
```sql
-- Orders table
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID REFERENCES users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    fulfillment_status VARCHAR(20) NOT NULL DEFAULT 'unfulfilled',
    subtotal DECIMAL(10,2) NOT NULL,
    tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    shipping_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    shipping_address JSONB NOT NULL,
    billing_address JSONB NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order items table
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_variant_id UUID REFERENCES product_variants(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order status history table
CREATE TABLE order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    from_status VARCHAR(20),
    to_status VARCHAR(20) NOT NULL,
    comment TEXT,
    changed_by UUID REFERENCES users(id),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Shopping carts table
CREATE TABLE shopping_carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(255),
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Cart items table
CREATE TABLE cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID REFERENCES shopping_carts(id) ON DELETE CASCADE,
    product_variant_id UUID REFERENCES product_variants(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(cart_id, product_variant_id)
);

-- Indexes
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_shopping_carts_user_id ON shopping_carts(user_id);
CREATE INDEX idx_cart_items_cart_id ON cart_items(cart_id);
```

#### 3.3.3 Order State Machine

```typescript
// Order State Machine Implementation
@Injectable()
export class OrderStateMachine {
  private readonly transitions: Map<OrderStatus, OrderStatus[]> = new Map([
    [OrderStatus.PENDING, [OrderStatus.CONFIRMED, OrderStatus.CANCELLED]],
    [OrderStatus.CONFIRMED, [OrderStatus.PROCESSING, OrderStatus.CANCELLED]],
    [OrderStatus.PROCESSING, [OrderStatus.SHIPPED, OrderStatus.CANCELLED]],
    [OrderStatus.SHIPPED, [OrderStatus.DELIVERED, OrderStatus.RETURNED]],
    [OrderStatus.DELIVERED, [OrderStatus.RETURNED]],
    [OrderStatus.CANCELLED, []],
    [OrderStatus.RETURNED, []]
  ]);
  
  canTransition(from: OrderStatus, to: OrderStatus): boolean {
    const allowedTransitions = this.transitions.get(from) || [];
    return allowedTransitions.includes(to);
  }
  
  async transitionOrder(
    orderId: string,
    newStatus: OrderStatus,
    comment?: string,
    userId?: string
  ): Promise<void> {
    const order = await this.orderRepository.findById(orderId);
    
    if (!this.canTransition(order.status, newStatus)) {
      throw new InvalidTransitionError(
        `Cannot transition from ${order.status} to ${newStatus}`
      );
    }
    
    await this.orderRepository.updateStatus(orderId, newStatus);
    
    await this.orderStatusHistoryRepository.create({
      orderId,
      fromStatus: order.status,
      toStatus: newStatus,
      comment,
      changedBy: userId
    });
    
    // Emit domain event
    await this.eventBus.publish(new OrderStatusChangedEvent({
      orderId,
      fromStatus: order.status,
      toStatus: newStatus,
      customerId: order.customerId
    }));
  }
}
```

### 3.4 Payment Service

#### 3.4.1 Component Structure
```typescript
// Payment Domain Models
interface Payment {
  id: string;
  orderId: string;
  amount: Money;
  method: PaymentMethod;
  status: PaymentStatus;
  gatewayTransactionId?: string;
  gatewayResponse?: object;
  failureReason?: string;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface PaymentMethod {
  type: PaymentMethodType;
  provider: PaymentProvider;
  details: PaymentMethodDetails;
}

enum PaymentMethodType {
  CREDIT_CARD = 'credit_card',
  DEBIT_CARD = 'debit_card',
  DIGITAL_WALLET = 'digital_wallet',
  BANK_TRANSFER = 'bank_transfer'
}

enum PaymentProvider {
  STRIPE = 'stripe',
  PAYPAL = 'paypal',
  RAZORPAY = 'razorpay'
}
```

#### 3.4.2 Database Schema
```sql
-- Payments table
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id),
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    method_type VARCHAR(20) NOT NULL,
    provider VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    gateway_transaction_id VARCHAR(255),
    gateway_response JSONB,
    failure_reason TEXT,
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment method details (tokenized)
CREATE TABLE payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    type VARCHAR(20) NOT NULL,
    provider VARCHAR(20) NOT NULL,
    token VARCHAR(255) NOT NULL, -- Tokenized payment details
    last_four VARCHAR(4),
    expiry_month INTEGER,
    expiry_year INTEGER,
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment transactions (for audit trail)
CREATE TABLE payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID REFERENCES payments(id),
    type VARCHAR(20) NOT NULL, -- charge, refund, partial_refund
    amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL,
    gateway_transaction_id VARCHAR(255),
    gateway_response JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payment_methods_user_id ON payment_methods(user_id);
CREATE INDEX idx_payment_transactions_payment_id ON payment_transactions(payment_id);
```

#### 3.4.3 Payment Gateway Integration

```typescript
// Payment Gateway Factory
@Injectable()
export class PaymentGatewayFactory {
  constructor(
    private readonly stripeGateway: StripePaymentGateway,
    private readonly paypalGateway: PayPalPaymentGateway,
    private readonly razorpayGateway: RazorpayPaymentGateway
  ) {}
  
  getGateway(provider: PaymentProvider): PaymentGateway {
    switch (provider) {
      case PaymentProvider.STRIPE:
        return this.stripeGateway;
      case PaymentProvider.PAYPAL:
        return this.paypalGateway;
      case PaymentProvider.RAZORPAY:
        return this.razorpayGateway;
      default:
        throw new UnsupportedPaymentProviderError(provider);
    }
  }
}

// Stripe Payment Gateway Implementation
@Injectable()
export class StripePaymentGateway implements PaymentGateway {
  private readonly stripe: Stripe;
  
  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16'
    });
  }
  
  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(request.amount.value * 100), // Convert to cents
        currency: request.amount.currency.toLowerCase(),
        payment_method: request.paymentMethodToken,
        confirmation_method: 'manual',
        confirm: true,
        metadata: {
          orderId: request.orderId,
          customerId: request.customerId
        }
      });
      
      return {
        success: paymentIntent.status === 'succeeded',
        transactionId: paymentIntent.id,
        status: this.mapStripeStatus(paymentIntent.status),
        gatewayResponse: paymentIntent
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        gatewayResponse: error
      };
    }
  }
  
  async refundPayment(request: RefundRequest): Promise<RefundResult> {
    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: request.transactionId,
        amount: request.amount ? Math.round(request.amount.value * 100) : undefined,
        reason: request.reason
      });
      
      return {
        success: refund.status === 'succeeded',
        refundId: refund.id,
        status: this.mapRefundStatus(refund.status),
        gatewayResponse: refund
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        gatewayResponse: error
      };
    }
  }
}
```

## 4. DATA FLOW DIAGRAMS

### 4.1 User Registration Flow
```
┌─────────┐    ┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│ Client  │    │ API Gateway │    │ User Service │    │ Email Service│
└────┬────┘    └──────┬──────┘    └──────┬───────┘    └──────┬──────┘
     │                │                  │                   │
     │ POST /register │                  │                   │
     ├───────────────►│                  │                   │
     │                │ Validate & Route │                   │
     │                ├─────────────────►│                   │
     │                │                  │ Validate Data     │
     │                │                  │ Hash Password     │
     │                │                  │ Create User       │
     │                │                  │ Send Verification │
     │                │                  ├──────────────────►│
     │                │                  │                   │
     │                │ Success Response │                   │
     │                │◄─────────────────┤                   │
     │ 201 Created    │                  │                   │
     │◄───────────────┤                  │                   │
```

### 4.2 Product Search Flow
```
┌─────────┐    ┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│ Client  │    │ API Gateway │    │Product Service│    │Elasticsearch │
└────┬────┘    └──────┬──────┘    └──────┬───────┘    └──────┬───────┘
     │                │                  │                   │
     │ GET /products  │                  │                   │
     ├───────────────►│                  │                   │
     │ ?q=laptop      │                  │                   │
     │                │ Route Request    │                   │
     │                ├─────────────────►│                   │
     │                │                  │ Build ES Query    │
     │                │                  │ Execute Search    │
     │                │                  ├──────────────────►│
     │                │                  │                   │
     │                │                  │ Search Results    │
     │                │                  │◄──────────────────┤
     │                │                  │ Transform Results │
     │                │                  │ Add Aggregations  │
     │                │ Product List     │                   │
     │                │◄─────────────────┤                   │
     │ 200 OK         │                  │                   │
     │◄───────────────┤                  │                   │
```

### 4.3 Order Processing Flow
```
┌─────────┐  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Client  │  │ API Gateway │  │ Order Service│  │Payment Service│  │Inventory Svc │
└────┬────┘  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
     │              │                │                 │                 │
     │ POST /orders │                │                 │                 │
     ├─────────────►│                │                 │                 │
     │              │ Route Request  │                 │                 │
     │              ├───────────────►│                 │                 │
     │              │                │ Validate Order  │                 │
     │              │                │ Reserve Items   │                 │
     │              │                ├─────────────────────────────────►│
     │              │                │                 │                 │
     │              │                │ Items Reserved  │                 │
     │              │                │◄─────────────────────────────────┤
     │              │                │ Process Payment │                 │
     │              │                ├────────────────►│                 │
     │              │                │                 │ Gateway Call    │
     │              │                │ Payment Success │                 │
     │              │                │◄────────────────┤                 │
     │              │                │ Confirm Order   │                 │
     │              │                │ Update Status   │                 │
     │              │ Order Created  │                 │                 │
     │              │◄───────────────┤                 │                 │
     │ 201 Created  │                │                 │                 │
     │◄─────────────┤                │                 │                 │
```

## 5. SEQUENCE DIAGRAMS

### 5.1 User Authentication Sequence
```
User -> API Gateway: POST /auth/login {email, password}
API Gateway -> User Service: Validate credentials
User Service -> Database: Query user by email
Database -> User Service: User data
User Service -> Password Service: Verify password
Password Service -> User Service: Password valid
User Service -> JWT Service: Generate tokens
JWT Service -> User Service: Access & refresh tokens
User Service -> Redis: Store refresh token
User Service -> API Gateway: Authentication response
API Gateway -> User: 200 OK {accessToken, refreshToken}
```

### 5.2 Product Purchase Sequence
```
User -> API Gateway: POST /orders {items, shipping, payment}
API Gateway -> Order Service: Create order request
Order Service -> Inventory Service: Reserve items
Inventory Service -> Database: Update stock
Inventory Service -> Order Service: Items reserved
Order Service -> Payment Service: Process payment
Payment Service -> Payment Gateway: Charge payment
Payment Gateway -> Payment Service: Payment result
Payment Service -> Order Service: Payment confirmed
Order Service -> Event Bus: OrderCreated event
Event Bus -> Notification Service: Send confirmation
Event Bus -> Inventory Service: Commit reservation
Order Service -> API Gateway: Order created
API Gateway -> User: 201 Created {order}
```

## 6. SECURITY IMPLEMENTATION

### 6.1 Authentication & Authorization

```typescript
// JWT Authentication Guard
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    private readonly redisService: RedisService
  ) {}
  
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    
    if (!token) {
      throw new UnauthorizedException('Access token required');
    }
    
    try {
      // Verify JWT signature and expiration
      const payload = await this.jwtService.verifyAsync(token);
      
      // Check if token is blacklisted
      const isBlacklisted = await this.redisService.get(`blacklist:${token}`);
      if (isBlacklisted) {
        throw new UnauthorizedException('Token has been revoked');
      }
      
      // Get user details
      const user = await this.userService.findById(payload.sub);
      if (!user || !user.isActive) {
        throw new UnauthorizedException('User not found or inactive');
      }
      
      // Attach user to request
      request.user = user;
      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
  
  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}

// Role-Based Access Control Guard
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass()
    ]);
    
    if (!requiredRoles) {
      return true;
    }
    
    const { user } = context.switchToHttp().getRequest();
    const userRoles = user.roles.map(role => role.name);
    
    return requiredRoles.some(role => userRoles.includes(role));
  }
}

// Permission-Based Access Control Guard
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionService: PermissionService
  ) {}
  
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      'permissions',
      [context.getHandler(), context.getClass()]
    );
    
    if (!requiredPermissions) {
      return true;
    }
    
    const { user } = context.switchToHttp().getRequest();
    
    for (const permission of requiredPermissions) {
      const hasPermission = await this.permissionService.checkPermission(
        user,
        permission.resource,
        permission.action,
        permission.conditions
      );
      
      if (!hasPermission) {
        return false;
      }
    }
    
    return true;
  }
}
```

### 6.2 Input Validation & Sanitization

```typescript
// Custom Validation Decorators
export function IsStrongPassword() {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName: propertyName,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return false;
          
          const requirements = {
            minLength: value.length >= 8,
            hasUppercase: /[A-Z]/.test(value),
            hasLowercase: /[a-z]/.test(value),
            hasNumbers: /\d/.test(value),
            hasSpecialChars: /[!@#$%^&*(),.?":{}|<>]/.test(value)
          };
          
          return Object.values(requirements).every(Boolean);
        },
        defaultMessage() {
          return 'Password must be at least 8 characters long and contain uppercase, lowercase, numbers, and special characters';
        }
      }
    });
  };
}

// Input Sanitization Service
@Injectable()
export class SanitizationService {
  sanitizeHtml(input: string): string {
    return DOMPurify.sanitize(input, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br'],
      ALLOWED_ATTR: []
    });
  }
  
  sanitizeString(input: string): string {
    return input
      .trim()
      .replace(/[<>"'&]/g, (match) => {
        const entityMap = {
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#x27;',
          '&': '&amp;'
        };
        return entityMap[match];
      });
  }
  
  validateAndSanitizeEmail(email: string): string {
    const sanitized = this.sanitizeString(email.toLowerCase());
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!emailRegex.test(sanitized)) {
      throw new ValidationError('Invalid email format');
    }
    
    return sanitized;
  }
}
```

### 6.3 Rate Limiting & DDoS Protection

```typescript
// Rate Limiting Configuration
@Injectable()
export class RateLimitingService {
  private readonly redisClient: Redis;
  
  constructor() {
    this.redisClient = new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT),
      password: process.env.REDIS_PASSWORD
    });
  }
  
  async checkRateLimit(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<RateLimitResult> {
    const current = await this.redisClient.incr(key);
    
    if (current === 1) {
      await this.redisClient.expire(key, Math.ceil(windowMs / 1000));
    }
    
    const ttl = await this.redisClient.ttl(key);
    
    return {
      allowed: current <= limit,
      remaining: Math.max(0, limit - current),
      resetTime: Date.now() + (ttl * 1000)
    };
  }
}

// Rate Limiting Middleware
@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  constructor(private readonly rateLimitingService: RateLimitingService) {}
  
  async use(req: Request, res: Response, next: NextFunction) {
    const key = `rate_limit:${req.ip}:${req.route?.path || req.path}`;
    const limit = this.getLimit(req.route?.path);
    const windowMs = 15 * 60 * 1000; // 15 minutes
    
    const result = await this.rateLimitingService.checkRateLimit(
      key,
      limit,
      windowMs
    );
    
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', result.resetTime);
    
    if (!result.allowed) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded',
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
      });
    }
    
    next();
  }
  
  private getLimit(path: string): number {
    const limits = {
      '/auth/login': 5,
      '/auth/register': 3,
      '/orders': 10,
      default: 100
    };
    
    return limits[path] || limits.default;
  }
}
```

## 7. PERFORMANCE OPTIMIZATION

### 7.1 Caching Strategy

```typescript
// Multi-Level Caching Service
@Injectable()
export class CacheService {
  constructor(
    private readonly redisClient: Redis,
    private readonly memoryCache: NodeCache
  ) {}
  
  async get<T>(key: string): Promise<T | null> {
    // L1: Memory cache (fastest)
    let value = this.memoryCache.get<T>(key);
    if (value !== undefined) {
      return value;
    }
    
    // L2: Redis cache
    const redisValue = await this.redisClient.get(key);
    if (redisValue) {
      value = JSON.parse(redisValue);
      // Store in memory cache for faster access
      this.memoryCache.set(key, value, 300); // 5 minutes
      return value;
    }
    
    return null;
  }
  
  async set<T>(
    key: string,
    value: T,
    ttlSeconds: number = 3600
  ): Promise<void> {
    // Store in both caches
    this.memoryCache.set(key, value, Math.min(ttlSeconds, 300));
    await this.redisClient.setex(key, ttlSeconds, JSON.stringify(value));
  }
  
  async invalidate(pattern: string): Promise<void> {
    // Clear memory cache
    this.memoryCache.flushAll();
    
    // Clear Redis cache
    const keys = await this.redisClient.keys(pattern);
    if (keys.length > 0) {
      await this.redisClient.del(...keys);
    }
  }
}

// Product Cache Service
@Injectable()
export class ProductCacheService {
  constructor(private readonly cacheService: CacheService) {}
  
  async getCachedProduct(productId: string): Promise<Product | null> {
    return this.cacheService.get(`product:${productId}`);
  }
  
  async cacheProduct(product: Product): Promise<void> {
    await this.cacheService.set(
      `product:${product.id}`,
      product,
      3600 // 1 hour
    );
  }
  
  async getCachedProductList(
    cacheKey: string
  ): Promise<ProductListResponse | null> {
    return this.cacheService.get(`products:${cacheKey}`);
  }
  
  async cacheProductList(
    cacheKey: string,
    products: ProductListResponse
  ): Promise<void> {
    await this.cacheService.set(
      `products:${cacheKey}`,
      products,
      600 // 10 minutes
    );
  }
  
  async invalidateProductCache(productId: string): Promise<void> {
    await this.cacheService.invalidate(`product:${productId}`);
    await this.cacheService.invalidate('products:*');
  }
}
```

### 7.2 Database Optimization

```typescript
// Database Connection Pool Configuration
export const databaseConfig = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  
  // Connection Pool Settings
  extra: {
    max: 20, // Maximum number of connections
    min: 5,  // Minimum number of connections
    acquire: 30000, // Maximum time to get connection
    idle: 10000,    // Maximum time connection can be idle
    evict: 1000,    // Interval to check for idle connections
    
    // Connection validation
    testOnBorrow: true,
    validationQuery: 'SELECT 1',
    
    // SSL configuration
    ssl: process.env.NODE_ENV === 'production' ? {
      rejectUnauthorized: false
    } : false
  },
  
  // Query optimization
  logging: process.env.NODE_ENV === 'development',
  cache: {
    type: 'redis',
    options: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT
    },
    duration: 30000 // 30 seconds
  }
};

// Repository with Query Optimization
@Injectable()
export class ProductRepository {
  constructor(
    @InjectRepository(Product)
    private readonly repository: Repository<Product>
  ) {}
  
  async findWithPagination(
    options: ProductSearchOptions
  ): Promise<PaginatedResult<Product>> {
    const queryBuilder = this.repository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.variants', 'variants')
      .leftJoinAndSelect('product.images', 'images')
      .where('product.status = :status', { status: 'active' });
    
    // Add filters
    if (options.categoryId) {
      queryBuilder.andWhere('product.categoryId = :categoryId', {
        categoryId: options.categoryId
      });
    }
    
    if (options.priceRange) {
      queryBuilder.andWhere(
        'variants.price BETWEEN :minPrice AND :maxPrice',
        {
          minPrice: options.priceRange.min,
          maxPrice: options.priceRange.max
        }
      );
    }
    
    // Add sorting
    switch (options.sortBy) {
      case 'price_asc':
        queryBuilder.orderBy('variants.price', 'ASC');
        break;
      case 'price_desc':
        queryBuilder.orderBy('variants.price', 'DESC');
        break;
      case 'created_desc':
        queryBuilder.orderBy('product.createdAt', 'DESC');
        break;
      default:
        queryBuilder.orderBy('product.featured', 'DESC')
                   .addOrderBy('product.createdAt', 'DESC');
    }
    
    // Add pagination
    const offset = (options.page - 1) * options.limit;
    queryBuilder.skip(offset).take(options.limit);
    
    // Execute query with count
    const [items, total] = await queryBuilder.getManyAndCount();
    
    return {
      items,
      total,
      page: options.page,
      limit: options.limit,
      totalPages: Math.ceil(total / options.limit)
    };
  }
  
  async findByIdWithCache(id: string): Promise<Product | null> {
    return this.repository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.variants', 'variants')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.specifications', 'specifications')
      .where('product.id = :id', { id })
      .cache(`product:${id}`, 300000) // Cache for 5 minutes
      .getOne();
  }
}
```

## 8. ERROR HANDLING & RESILIENCE

### 8.1 Global Exception Filter

```typescript
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';
    let details: any = null;
    
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'object') {
        message = exceptionResponse['message'] || message;
        code = exceptionResponse['code'] || code;
        details = exceptionResponse['details'] || null;
      } else {
        message = exceptionResponse;
      }
    } else if (exception instanceof ValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Validation failed';
      code = 'VALIDATION_ERROR';
      details = exception.constraints;
    } else if (exception instanceof QueryFailedError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Database operation failed';
      code = 'DATABASE_ERROR';
      
      // Handle specific database errors
      if (exception.message.includes('duplicate key')) {
        message = 'Resource already exists';
        code = 'DUPLICATE_RESOURCE';
      } else if (exception.message.includes('foreign key')) {
        message = 'Referenced resource not found';
        code = 'INVALID_REFERENCE';
      }
    }
    
    // Log error details
    const errorLog = {
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      status,
      code,
      message,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      userId: request['user']?.id,
      stack: exception instanceof Error ? exception.stack : undefined
    };
    
    if (status >= 500) {
      this.logger.error('Server Error', errorLog);
    } else {
      this.logger.warn('Client Error', errorLog);
    }
    
    // Send error response
    const errorResponse = {
      success: false,
      error: {
        code,
        message,
        timestamp: new Date().toISOString(),
        path: request.url,
        ...(details && { details })
      }
    };
    
    response.status(status).json(errorResponse);
  }
}
```

### 8.2 Circuit Breaker Implementation

```typescript
// Circuit Breaker Service
@Injectable()
export class CircuitBreakerService {
  private breakers = new Map<string, CircuitBreaker>();
  
  getBreaker(name: string, options?: CircuitBreakerOptions): CircuitBreaker {
    if (!this.breakers.has(name)) {
      const defaultOptions = {
        failureThreshold: 5,
        resetTimeout: 30000,
        monitoringPeriod: 10000,
        expectedErrors: [TimeoutError, ConnectionError]
      };
      
      this.breakers.set(
        name,
        new CircuitBreaker({ ...defaultOptions, ...options })
      );
    }
    
    return this.breakers.get(name);
  }
}

// Circuit Breaker Implementation
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private lastFailureTime = 0;
  private nextAttempt = 0;
  
  constructor(private options: CircuitBreakerOptions) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new CircuitOpenError('Circuit breaker is OPEN');
      }
      
      this.state = CircuitState.HALF_OPEN;
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failures = 0;
    this.state = CircuitState.CLOSED;
  }
  
  private onFailure(error: Error): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.options.resetTimeout;
    }
  }
  
  getState(): CircuitState {
    return this.state;
  }
  
  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      nextAttempt: this.nextAttempt
    };
  }
}
```

### 8.3 Retry Logic with Exponential Backoff

```typescript
// Retry Service
@Injectable()
export class RetryService {
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxAttempts = 3,
      baseDelay = 1000,
      maxDelay = 30000,
      backoffFactor = 2,
      jitter = true,
      retryableErrors = [TimeoutError, ConnectionError, ServiceUnavailableError]
    } = options;
    
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Check if error is retryable
        const isRetryable = retryableErrors.some(
          ErrorType => error instanceof ErrorType
        );
        
        if (!isRetryable || attempt === maxAttempts) {
          throw error;
        }
        
        // Calculate delay with exponential backoff
        let delay = baseDelay * Math.pow(backoffFactor, attempt - 1);
        delay = Math.min(delay, maxDelay);
        
        // Add jitter to prevent thundering herd
        if (jitter) {
          delay = delay * (0.5 + Math.random() * 0.5);
        }
        
        await this.sleep(delay);
      }
    }
    
    throw lastError;
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Usage Example
@Injectable()
export class PaymentService {
  constructor(
    private readonly retryService: RetryService,
    private readonly circuitBreakerService: CircuitBreakerService
  ) {}
  
  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    const circuitBreaker = this.circuitBreakerService.getBreaker(
      'payment-gateway',
      {
        failureThreshold: 5,
        resetTimeout: 60000
      }
    );
    
    return this.retryService.executeWithRetry(
      () => circuitBreaker.execute(() => this.callPaymentGateway(request)),
      {
        maxAttempts: 3,
        baseDelay: 1000,
        retryableErrors: [TimeoutError, ServiceUnavailableError]
      }
    );
  }
  
  private async callPaymentGateway(
    request: PaymentRequest
  ): Promise<PaymentResult> {
    // Payment gateway implementation
  }
}
```

## 9. MONITORING & OBSERVABILITY

### 9.1 Application Metrics

```typescript
// Metrics Service
@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  
  // HTTP metrics
  private readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
  });
  
  private readonly httpRequestTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code']
  });
  
  // Business metrics
  private readonly orderTotal = new Counter({
    name: 'orders_total',
    help: 'Total number of orders',
    labelNames: ['status']
  });
  
  private readonly paymentTotal = new Counter({
    name: 'payments_total',
    help: 'Total number of payments',
    labelNames: ['status', 'provider']
  });
  
  private readonly activeUsers = new Gauge({
    name: 'active_users',
    help: 'Number of active users'
  });
  
  constructor() {
    this.registry.registerMetric(this.httpRequestDuration);
    this.registry.registerMetric(this.httpRequestTotal);
    this.registry.registerMetric(this.orderTotal);
    this.registry.registerMetric(this.paymentTotal);
    this.registry.registerMetric(this.activeUsers);
  }
  
  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    duration: number
  ): void {
    const labels = { method, route, status_code: statusCode.toString() };
    this.httpRequestDuration.observe(labels, duration);
    this.httpRequestTotal.inc(labels);
  }
  
  recordOrder(status: string): void {
    this.orderTotal.inc({ status });
  }
  
  recordPayment(status: string, provider: string): void {
    this.paymentTotal.inc({ status, provider });
  }
  
  setActiveUsers(count: number): void {
    this.activeUsers.set(count);
  }
  
  getMetrics(): string {
    return this.registry.metrics();
  }
}

// Metrics Middleware
@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metricsService: MetricsService) {}
  
  use(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      this.metricsService.recordHttpRequest(
        req.method,
        req.route?.path || req.path,
        res.statusCode,
        duration
      );
    });
    
    next();
  }
}
```

### 9.2 Health Checks

```typescript
// Health Check Service
@Injectable()
export class HealthCheckService {
  constructor(
    private readonly databaseHealthIndicator: TypeOrmHealthIndicator,
    private readonly redisHealthIndicator: RedisHealthIndicator,
    private readonly elasticsearchHealthIndicator: ElasticsearchHealthIndicator
  ) {}
  
  @HealthCheck()
  async check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.databaseHealthIndicator.pingCheck('database'),
      () => this.redisHealthIndicator.pingCheck('redis'),
      () => this.elasticsearchHealthIndicator.pingCheck('elasticsearch'),
      () => this.checkExternalServices()
    ]);
  }
  
  private async checkExternalServices(): Promise<HealthIndicatorResult> {
    const checks = await Promise.allSettled([
      this.checkPaymentGateway(),
      this.checkEmailService(),
      this.checkSmsService()
    ]);
    
    const results = checks.map((check, index) => ({
      service: ['payment', 'email', 'sms'][index],
      status: check.status === 'fulfilled' ? 'up' : 'down',
      error: check.status === 'rejected' ? check.reason.message : undefined
    }));
    
    const allHealthy = results.every(result => result.status === 'up');
    
    return {
      external_services: {
        status: allHealthy ? 'up' : 'down',
        details: results
      }
    };
  }
  
  private async checkPaymentGateway(): Promise<void> {
    // Implement payment gateway health check
  }
  
  private async checkEmailService(): Promise<void> {
    // Implement email service health check
  }
  
  private async checkSmsService(): Promise<void> {
    // Implement SMS service health check
  }
}
```

## 10. DEPLOYMENT & INFRASTRUCTURE

### 10.1 Docker Configuration

```dockerfile
# Multi-stage Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY src/ ./src/

# Build application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

WORKDIR /app

# Copy built application
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package*.json ./

# Security hardening
RUN apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/*

# Switch to non-root user
USER nestjs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node dist/health-check.js

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
```

### 10.2 Kubernetes Deployment

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: shopping-platform-api
  labels:
    app: shopping-platform-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: shopping-platform-api
  template:
    metadata:
      labels:
        app: shopping-platform-api
    spec:
      containers:
      - name: api
        image: shopping-platform-api:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DB_HOST
          valueFrom:
            secretKeyRef:
              name: database-secret
              key: host
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: database-secret
              key: password
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
            path: /health/ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        securityContext:
          allowPrivilegeEscalation: false
          runAsNonRoot: true
          runAsUser: 1001
          capabilities:
            drop:
            - ALL
      securityContext:
        fsGroup: 1001
---
apiVersion: v1
kind: Service
metadata:
  name: shopping-platform-api-service
spec:
  selector:
    app: shopping-platform-api
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: ClusterIP
```

## 11. TESTING STRATEGY

### 11.1 Unit Testing

```typescript
// User Service Unit Tests
describe('UserService', () => {
  let service: UserService;
  let repository: Repository<User>;
  let passwordService: PasswordService;
  
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useClass: Repository
        },
        {
          provide: PasswordService,
          useValue: {
            hashPassword: jest.fn(),
            verifyPassword: jest.fn()
          }
        }
      ]
    }).compile();
    
    service = module.get<UserService>(UserService);
    repository = module.get<Repository<User>>(getRepositoryToken(User));
    passwordService = module.get<PasswordService>(PasswordService);
  });
  
  describe('createUser', () => {
    it('should create a new user with hashed password', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        password: 'StrongPassword123!',
        firstName: 'John',
        lastName: 'Doe'
      };
      
      const hashedPassword = 'hashedPassword';
      jest.spyOn(passwordService, 'hashPassword')
          .mockResolvedValue(hashedPassword);
      
      const savedUser = {
        id: 'user-id',
        email: userData.email,
        passwordHash: hashedPassword,
        profile: {
          firstName: userData.firstName,
          lastName: userData.lastName
        }
      };
      
      jest.spyOn(repository, 'save').mockResolvedValue(savedUser as User);
      
      // Act
      const result = await service.createUser(userData);
      
      // Assert
      expect(passwordService.hashPassword).toHaveBeenCalledWith(userData.password);
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          email: userData.email,
          passwordHash: hashedPassword
        })
      );
      expect(result).toEqual(savedUser);
    });
    
    it('should throw error if email already exists', async () => {
      // Arrange
      const userData = {
        email: 'existing@example.com',
        password: 'StrongPassword123!',
        firstName: 'John',
        lastName: 'Doe'
      };
      
      jest.spyOn(repository, 'save')
          .mockRejectedValue(new Error('duplicate key'));
      
      // Act & Assert
      await expect(service.createUser(userData))
        .rejects.toThrow('User with this email already exists');
    });
  });
});
```

### 11.2 Integration Testing

```typescript
// Order Integration Tests
describe('Order Integration', () => {
  let app: INestApplication;
  let orderService: OrderService;
  let paymentService: PaymentService;
  let inventoryService: InventoryService;
  
  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    })
    .overrideProvider(PaymentService)
    .useValue({
      processPayment: jest.fn()
    })
    .compile();
    
    app = moduleFixture.createNestApplication();
    await app.init();
    
    orderService = moduleFixture.get<OrderService>(OrderService);
    paymentService = moduleFixture.get<PaymentService>(PaymentService);
    inventoryService = moduleFixture.get<InventoryService>(InventoryService);
  });
  
  afterAll(async () => {
    await app.close();
  });
  
  describe('POST /orders', () => {
    it('should create order with successful payment', async () => {
      // Arrange
      const orderData = {
        items: [
          {
            productVariantId: 'variant-1',
            quantity: 2
          }
        ],
        shippingAddress: {
          street: '123 Main St',
          city: 'New York',
          zipCode: '10001',
          country: 'US'
        },
        paymentMethod: {
          type: 'credit_card',
          token: 'payment-token'
        }
      };
      
      jest.spyOn(paymentService, 'processPayment')
          .mockResolvedValue({
            success: true,
            transactionId: 'txn-123'
          });
      
      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send(orderData)
        .expect(201);
      
      // Assert
      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: expect.any(String),
          orderNumber: expect.any(String),
          status: 'confirmed',
          totalAmount: expect.any(Number)
        }
      });
      
      expect(paymentService.processPayment).toHaveBeenCalled();
    });
    
    it('should rollback inventory on payment failure', async () => {
      // Arrange
      const orderData = {
        items: [
          {
            productVariantId: 'variant-1',
            quantity: 2
          }
        ],
        shippingAddress: {
          street: '123 Main St',
          city: 'New York',
          zipCode: '10001',
          country: 'US'
        },
        paymentMethod: {
          type: 'credit_card',
          token: 'invalid-token'
        }
      };
      
      jest.spyOn(paymentService, 'processPayment')
          .mockResolvedValue({
            success: false,
            error: 'Payment declined'
          });
      
      const inventorySpy = jest.spyOn(inventoryService, 'releaseReservation');
      
      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send(orderData)
        .expect(400);
      
      // Assert
      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'PAYMENT_FAILED',
          message: 'Payment processing failed'
        }
      });
      
      expect(inventorySpy).toHaveBeenCalled();
    });
  });
});
```

## 12. CONCLUSION

This Low-Level Design document provides comprehensive implementation details for the Online Shopping Platform. The design emphasizes:

### Key Strengths:
1. **Scalable Architecture**: Microservices with event-driven communication
2. **Security First**: Multi-layered security with encryption, authentication, and authorization
3. **Performance Optimized**: Multi-level caching, database optimization, and CDN integration
4. **Resilient Design**: Circuit breakers, retry logic, and graceful degradation
5. **Observable System**: Comprehensive monitoring, logging, and health checks
6. **Maintainable Code**: Clean architecture with proper separation of concerns

### Implementation Readiness:
- Detailed component specifications with TypeScript interfaces
- Complete database schema with optimized indexes
- API specifications with validation and security
- Comprehensive error handling and resilience patterns
- Production-ready deployment configurations
- Extensive testing strategies

### Next Steps:
1. Set up development environment with Docker Compose
2. Implement core services following the specifications
3. Set up CI/CD pipeline with automated testing
4. Deploy to staging environment for integration testing
5. Conduct security audit and performance testing
6. Deploy to production with monitoring and alerting

This LLD serves as a blueprint for building a robust, scalable, and secure online shopping platform that meets all specified requirements and industry best practices.