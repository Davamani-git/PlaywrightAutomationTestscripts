# Online Shopping Platform - Low-Level Design Document

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

### 1. Authentication Service

**Class Structure:**
```typescript
class AuthenticationService {
  private jwtService: JWTService;
  private passwordService: PasswordService;
  private mfaService: MFAService;
  private auditService: AuditService;

  async authenticate(credentials: LoginCredentials): Promise<AuthResult>
  async refreshToken(refreshToken: string): Promise<TokenPair>
  async logout(userId: string, sessionId: string): Promise<void>
  async enableMFA(userId: string, method: MFAMethod): Promise<MFASetup>
  async validateMFA(userId: string, token: string): Promise<boolean>
}

interface LoginCredentials {
  email: string;
  password: string;
  mfaToken?: string;
}

interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
  expiresIn: number;
}
```

**Configuration:**
- JWT Access Token Expiry: 15 minutes
- JWT Refresh Token Expiry: 7 days
- Password Policy: Minimum 8 characters, uppercase, lowercase, number, special character
- Account Lockout: 5 failed attempts, 30-minute lockout
- MFA Methods: TOTP, SMS, Email

### 2. User Management Service

**Class Structure:**
```typescript
class UserManagementService {
  private userRepository: UserRepository;
  private roleService: RoleService;
  private emailService: EmailService;
  private encryptionService: EncryptionService;

  async registerUser(userData: UserRegistration): Promise<User>
  async verifyEmail(token: string): Promise<boolean>
  async updateProfile(userId: string, updates: ProfileUpdate): Promise<User>
  async assignRole(userId: string, roleId: string): Promise<void>
  async deactivateUser(userId: string, reason: string): Promise<void>
}

interface UserRegistration {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  acceptedTerms: boolean;
}
```

**Validation Rules:**
- Email: RFC 5322 compliant, unique constraint
- Password: Hashed using bcrypt with salt rounds = 12
- Phone: E.164 format validation
- Names: Alphanumeric with spaces, 2-50 characters

### 3. Product Catalog Service

**Class Structure:**
```typescript
class ProductCatalogService {
  private productRepository: ProductRepository;
  private categoryService: CategoryService;
  private imageService: ImageService;
  private searchService: SearchService;

  async createProduct(productData: ProductCreate): Promise<Product>
  async updateProduct(productId: string, updates: ProductUpdate): Promise<Product>
  async getProduct(productId: string): Promise<Product>
  async searchProducts(criteria: SearchCriteria): Promise<ProductSearchResult>
  async updateInventory(productId: string, quantity: number): Promise<void>
}

interface ProductCreate {
  name: string;
  description: string;
  price: number;
  categoryId: string;
  stockQuantity: number;
  sku: string;
  images: string[];
  attributes: ProductAttribute[];
}
```

**Business Rules:**
- SKU: Alphanumeric, 8-20 characters, unique
- Price: Decimal with 2 precision, positive value
- Stock: Non-negative integer
- Images: Maximum 10 images, 5MB each, JPG/PNG format

### 4. Shopping Cart Service

**Class Structure:**
```typescript
class ShoppingCartService {
  private cartRepository: CartRepository;
  private productService: ProductService;
  private pricingService: PricingService;
  private inventoryService: InventoryService;

  async addToCart(userId: string, item: CartItemAdd): Promise<Cart>
  async removeFromCart(userId: string, itemId: string): Promise<Cart>
  async updateQuantity(userId: string, itemId: string, quantity: number): Promise<Cart>
  async getCart(userId: string): Promise<Cart>
  async clearCart(userId: string): Promise<void>
  async validateCart(userId: string): Promise<CartValidation>
}

interface CartItemAdd {
  productId: string;
  quantity: number;
  selectedAttributes?: ProductAttribute[];
}
```

**Business Logic:**
- Session Timeout: 30 days for registered users, 24 hours for guests
- Quantity Limits: Maximum 99 per item
- Price Calculation: Real-time pricing with tax calculation
- Stock Validation: Check availability before adding

### 5. Order Management Service

**Class Structure:**
```typescript
class OrderManagementService {
  private orderRepository: OrderRepository;
  private inventoryService: InventoryService;
  private paymentService: PaymentService;
  private notificationService: NotificationService;

  async createOrder(orderData: OrderCreate): Promise<Order>
  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order>
  async cancelOrder(orderId: string, reason: string): Promise<Order>
  async getOrderHistory(userId: string, pagination: Pagination): Promise<OrderList>
  async processRefund(orderId: string, amount: number): Promise<Refund>
}

interface OrderCreate {
  userId: string;
  items: OrderItem[];
  shippingAddress: Address;
  billingAddress: Address;
  paymentMethodId: string;
}
```

**State Machine:**
- Pending → Processing → Shipped → Delivered
- Pending → Cancelled
- Processing → Cancelled (with inventory restoration)
- Delivered → Returned (within 30 days)

### 6. Payment Processing Service

**Class Structure:**
```typescript
class PaymentProcessingService {
  private stripeGateway: StripeGateway;
  private paypalGateway: PayPalGateway;
  private fraudDetection: FraudDetectionService;
  private encryptionService: EncryptionService;

  async processPayment(paymentRequest: PaymentRequest): Promise<PaymentResult>
  async refundPayment(paymentId: string, amount: number): Promise<RefundResult>
  async savePaymentMethod(userId: string, method: PaymentMethodData): Promise<PaymentMethod>
  async validatePayment(paymentData: PaymentValidation): Promise<ValidationResult>
}

interface PaymentRequest {
  orderId: string;
  amount: number;
  currency: string;
  paymentMethodId: string;
  billingAddress: Address;
}
```

**Security Measures:**
- PCI DSS Level 1 Compliance
- Tokenization for card data storage
- 3D Secure authentication
- Fraud scoring with machine learning
- Real-time transaction monitoring

## Data Flow Diagrams

### User Registration Flow
```
User Input → Validation Layer → User Service → Database
    ↓
Email Service ← Audit Service ← Role Assignment
    ↓
Verification Email → User Clicks → Account Activation
```

### Product Search Flow
```
Search Query → API Gateway → Authentication Check
    ↓
Search Service → Elasticsearch Index → Result Ranking
    ↓
Product Service → Cache Layer → Response Formatter
    ↓
Analytics Service ← Performance Monitor ← Client Response
```

### Checkout Process Flow
```
Cart Validation → Inventory Check → Price Calculation
    ↓
Payment Gateway → Fraud Detection → Order Creation
    ↓
Inventory Update → Notification Trigger → Audit Log
    ↓
Order Confirmation → Email/SMS → Tracking Generation
```

## Sequence Diagrams

### User Authentication Sequence
```
Client → API Gateway: POST /auth/login
API Gateway → Auth Service: validateCredentials()
Auth Service → User Repository: findByEmail()
User Repository → Auth Service: userRecord
Auth Service → Password Service: verifyPassword()
Password Service → Auth Service: isValid
Auth Service → MFA Service: requiresMFA()
MFA Service → Auth Service: mfaRequired
Auth Service → JWT Service: generateTokens()
JWT Service → Auth Service: tokenPair
Auth Service → Audit Service: logAuthEvent()
Auth Service → API Gateway: authResult
API Gateway → Client: 200 OK + tokens
```

### Order Creation Sequence
```
Client → API Gateway: POST /orders
API Gateway → Order Service: createOrder()
Order Service → Cart Service: getCart()
Cart Service → Order Service: cartItems
Order Service → Inventory Service: reserveItems()
Inventory Service → Order Service: reservationResult
Order Service → Payment Service: processPayment()
Payment Service → Payment Gateway: chargeCard()
Payment Gateway → Payment Service: paymentResult
Payment Service → Order Service: paymentConfirmed
Order Service → Order Repository: saveOrder()
Order Service → Notification Service: sendConfirmation()
Order Service → API Gateway: orderCreated
API Gateway → Client: 201 Created + orderDetails
```

## Implementation Details

### Technology Stack

**Backend Services:**
- **Runtime**: Node.js 18+ with TypeScript
- **Framework**: Express.js with Helmet security middleware
- **Database**: PostgreSQL 14+ with connection pooling
- **Cache**: Redis 7+ with clustering
- **Search**: Elasticsearch 8+ with security enabled
- **Message Queue**: Apache Kafka with Schema Registry
- **Container**: Docker with multi-stage builds
- **Orchestration**: Kubernetes with Helm charts

**Frontend Application:**
- **Framework**: React 18 with TypeScript
- **State Management**: Redux Toolkit with RTK Query
- **Styling**: Tailwind CSS with responsive design
- **Build Tool**: Vite with code splitting
- **Testing**: Jest + React Testing Library

### Configuration Management

**Environment Variables:**
```typescript
interface AppConfig {
  database: {
    host: string;
    port: number;
    name: string;
    username: string;
    password: string;
    ssl: boolean;
    poolSize: number;
  };
  redis: {
    host: string;
    port: number;
    password: string;
    db: number;
  };
  jwt: {
    secret: string;
    accessTokenExpiry: string;
    refreshTokenExpiry: string;
  };
  payment: {
    stripeSecretKey: string;
    paypalClientId: string;
    webhookSecret: string;
  };
}
```

### Error Handling Strategy

**Error Types:**
```typescript
class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  errorCode: string;
  
  constructor(message: string, statusCode: number, errorCode: string) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true;
  }
}

class ValidationError extends AppError {
  fields: ValidationField[];
  
  constructor(fields: ValidationField[]) {
    super('Validation failed', 400, 'VALIDATION_ERROR');
    this.fields = fields;
  }
}
```

**Global Error Handler:**
```typescript
const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: 'error',
      code: err.errorCode,
      message: err.message,
      ...(err instanceof ValidationError && { fields: err.fields })
    });
  }
  
  logger.error('Unhandled error:', err);
  return res.status(500).json({
    status: 'error',
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Something went wrong'
  });
};
```

## Database Schema

### PostgreSQL Tables

**Users Table:**
```sql
CREATE TABLE users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone_number VARCHAR(20),
  date_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP,
  status VARCHAR(20) DEFAULT 'ACTIVE',
  email_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
```

**Products Table:**
```sql
CREATE TABLE products (
  product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES users(user_id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  category_id UUID REFERENCES categories(category_id),
  stock_quantity INTEGER DEFAULT 0,
  sku VARCHAR(50) UNIQUE NOT NULL,
  images JSONB,
  status VARCHAR(20) DEFAULT 'ACTIVE',
  date_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_products_seller ON products(seller_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_status ON products(status);
```

**Orders Table:**
```sql
CREATE TABLE orders (
  order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id),
  order_number VARCHAR(50) UNIQUE NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING',
  payment_status VARCHAR(20) DEFAULT 'PENDING',
  shipping_address_id UUID REFERENCES addresses(address_id),
  billing_address_id UUID REFERENCES addresses(address_id),
  order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  shipped_date TIMESTAMP,
  delivered_date TIMESTAMP
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_date ON orders(order_date);
```

### Redis Cache Structure

**Session Storage:**
```
Key: session:{userId}
Value: {
  "sessionId": "uuid",
  "userId": "uuid",
  "roles": ["consumer"],
  "lastActivity": "timestamp",
  "ipAddress": "ip"
}
TTL: 7 days
```

**Product Cache:**
```
Key: product:{productId}
Value: {
  "productId": "uuid",
  "name": "Product Name",
  "price": 99.99,
  "stockQuantity": 50,
  "images": ["url1", "url2"]
}
TTL: 1 hour
```

**Cart Cache:**
```
Key: cart:{userId}
Value: {
  "cartId": "uuid",
  "items": [
    {
      "productId": "uuid",
      "quantity": 2,
      "unitPrice": 99.99
    }
  ],
  "totalAmount": 199.98
}
TTL: 30 days
```

## API Specifications

### Authentication Endpoints

**POST /api/v1/auth/login**
```typescript
Request:
{
  "email": "user@example.com",
  "password": "securePassword123",
  "mfaToken": "123456" // optional
}

Response (200):
{
  "status": "success",
  "data": {
    "accessToken": "jwt_token",
    "refreshToken": "refresh_token",
    "expiresIn": 900,
    "user": {
      "userId": "uuid",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "roles": ["consumer"]
    }
  }
}
```

**POST /api/v1/auth/refresh**
```typescript
Request:
{
  "refreshToken": "refresh_token"
}

Response (200):
{
  "status": "success",
  "data": {
    "accessToken": "new_jwt_token",
    "refreshToken": "new_refresh_token",
    "expiresIn": 900
  }
}
```

### Product Endpoints

**GET /api/v1/products**
```typescript
Query Parameters:
- page: number (default: 1)
- limit: number (default: 20, max: 100)
- category: string
- minPrice: number
- maxPrice: number
- search: string
- sortBy: string (price, name, date)
- sortOrder: string (asc, desc)

Response (200):
{
  "status": "success",
  "data": {
    "products": [
      {
        "productId": "uuid",
        "name": "Product Name",
        "description": "Product description",
        "price": 99.99,
        "category": "Electronics",
        "stockQuantity": 50,
        "images": ["url1", "url2"],
        "rating": 4.5,
        "reviewCount": 123
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1000,
      "totalPages": 50
    }
  }
}
```

**POST /api/v1/products** (Seller only)
```typescript
Request:
{
  "name": "New Product",
  "description": "Product description",
  "price": 99.99,
  "categoryId": "uuid",
  "stockQuantity": 100,
  "sku": "PROD-12345",
  "images": ["base64_image1", "base64_image2"]
}

Response (201):
{
  "status": "success",
  "data": {
    "productId": "uuid",
    "message": "Product created successfully"
  }
}
```

### Cart Endpoints

**GET /api/v1/cart**
```typescript
Response (200):
{
  "status": "success",
  "data": {
    "cartId": "uuid",
    "items": [
      {
        "cartItemId": "uuid",
        "productId": "uuid",
        "productName": "Product Name",
        "quantity": 2,
        "unitPrice": 99.99,
        "totalPrice": 199.98,
        "image": "url"
      }
    ],
    "totalAmount": 199.98,
    "itemCount": 2
  }
}
```

**POST /api/v1/cart/items**
```typescript
Request:
{
  "productId": "uuid",
  "quantity": 2
}

Response (200):
{
  "status": "success",
  "data": {
    "message": "Item added to cart",
    "cartItemId": "uuid"
  }
}
```

### Order Endpoints

**POST /api/v1/orders**
```typescript
Request:
{
  "shippingAddress": {
    "street1": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zipCode": "10001",
    "country": "US"
  },
  "billingAddress": {
    "street1": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zipCode": "10001",
    "country": "US"
  },
  "paymentMethodId": "uuid"
}

Response (201):
{
  "status": "success",
  "data": {
    "orderId": "uuid",
    "orderNumber": "ORD-20231201-001",
    "totalAmount": 199.98,
    "status": "PENDING",
    "estimatedDelivery": "2023-12-08"
  }
}
```

## Security Implementation

### Input Validation

**Validation Middleware:**
```typescript
import { body, query, param, validationResult } from 'express-validator';

const validateRegistration = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .custom(async (email) => {
      const existingUser = await userRepository.findByEmail(email);
      if (existingUser) {
        throw new Error('Email already in use');
      }
    }),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain uppercase, lowercase, number, and special character'),
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('First name must contain only letters and spaces'),
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(errors.array());
    }
    next();
  }
];
```

### Authentication Middleware

**JWT Verification:**
```typescript
const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    throw new AppError('Access token required', 401, 'MISSING_TOKEN');
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    
    // Check if token is blacklisted
    const isBlacklisted = await redis.get(`blacklist:${token}`);
    if (isBlacklisted) {
      throw new AppError('Token has been revoked', 401, 'TOKEN_REVOKED');
    }
    
    // Verify user still exists and is active
    const user = await userRepository.findById(decoded.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new AppError('User account not found or inactive', 401, 'INVALID_USER');
    }
    
    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AppError('Invalid token', 401, 'INVALID_TOKEN');
    }
    throw error;
  }
};
```

### Authorization Middleware

**Role-Based Access Control:**
```typescript
const authorize = (requiredRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    
    if (!user) {
      throw new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
    }
    
    const userRoles = user.roles.map(role => role.roleName);
    const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));
    
    if (!hasRequiredRole) {
      throw new AppError('Insufficient permissions', 403, 'INSUFFICIENT_PERMISSIONS');
    }
    
    next();
  };
};

// Usage
app.get('/api/v1/admin/users', authenticateToken, authorize(['ADMINISTRATOR']), getUserList);
app.post('/api/v1/products', authenticateToken, authorize(['SELLER', 'ADMINISTRATOR']), createProduct);
```

### Rate Limiting

**Rate Limiting Configuration:**
```typescript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

const authLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'auth_limit:'
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many login attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

const apiLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'api_limit:'
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'API rate limit exceeded'
  }
});

// Apply rate limiting
app.use('/api/v1/auth', authLimiter);
app.use('/api/v1', apiLimiter);
```

### Data Encryption

**Encryption Service:**
```typescript
import crypto from 'crypto';

class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32;
  private readonly ivLength = 16;
  private readonly tagLength = 16;
  
  encrypt(plaintext: string, key: string): EncryptedData {
    const keyBuffer = crypto.scryptSync(key, 'salt', this.keyLength);
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipher(this.algorithm, keyBuffer, { iv });
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex')
    };
  }
  
  decrypt(encryptedData: EncryptedData, key: string): string {
    const keyBuffer = crypto.scryptSync(key, 'salt', this.keyLength);
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const tag = Buffer.from(encryptedData.tag, 'hex');
    
    const decipher = crypto.createDecipher(this.algorithm, keyBuffer, { iv });
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}
```

## Performance Optimization

### Database Optimization

**Connection Pooling:**
```typescript
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT!),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20, // Maximum number of connections
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection could not be established
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});
```

**Query Optimization:**
```sql
-- Index for product search
CREATE INDEX idx_products_search ON products 
USING gin(to_tsvector('english', name || ' ' || description));

-- Composite index for order queries
CREATE INDEX idx_orders_user_status_date ON orders(user_id, status, order_date DESC);

-- Partial index for active products
CREATE INDEX idx_products_active ON products(category_id, price) 
WHERE status = 'ACTIVE';
```

### Caching Strategy

**Multi-Level Caching:**
```typescript
class CacheService {
  private redis: Redis;
  private localCache: NodeCache;
  
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT!),
      password: process.env.REDIS_PASSWORD,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3
    });
    
    this.localCache = new NodeCache({ 
      stdTTL: 300, // 5 minutes
      checkperiod: 60 // Check for expired keys every minute
    });
  }
  
  async get(key: string): Promise<any> {
    // Try local cache first
    const localValue = this.localCache.get(key);
    if (localValue) {
      return localValue;
    }
    
    // Try Redis cache
    const redisValue = await this.redis.get(key);
    if (redisValue) {
      const parsed = JSON.parse(redisValue);
      this.localCache.set(key, parsed, 60); // Cache locally for 1 minute
      return parsed;
    }
    
    return null;
  }
  
  async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    const serialized = JSON.stringify(value);
    await this.redis.setex(key, ttl, serialized);
    this.localCache.set(key, value, Math.min(ttl, 300));
  }
}
```

### API Response Optimization

**Response Compression:**
```typescript
import compression from 'compression';

app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6,
  threshold: 1024
}));
```

**Pagination and Filtering:**
```typescript
class ProductService {
  async searchProducts(criteria: SearchCriteria): Promise<ProductSearchResult> {
    const { page = 1, limit = 20, category, minPrice, maxPrice, search } = criteria;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT p.*, c.name as category_name,
             AVG(r.rating) as avg_rating,
             COUNT(r.review_id) as review_count
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.category_id
      LEFT JOIN reviews r ON p.product_id = r.product_id
      WHERE p.status = 'ACTIVE'
    `;
    
    const params: any[] = [];
    let paramIndex = 1;
    
    if (category) {
      query += ` AND c.name = $${paramIndex++}`;
      params.push(category);
    }
    
    if (minPrice) {
      query += ` AND p.price >= $${paramIndex++}`;
      params.push(minPrice);
    }
    
    if (maxPrice) {
      query += ` AND p.price <= $${paramIndex++}`;
      params.push(maxPrice);
    }
    
    if (search) {
      query += ` AND to_tsvector('english', p.name || ' ' || p.description) @@ plainto_tsquery($${paramIndex++})`;
      params.push(search);
    }
    
    query += `
      GROUP BY p.product_id, c.name
      ORDER BY p.date_created DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    // Get total count for pagination
    const countQuery = query.replace(/SELECT.*?FROM/, 'SELECT COUNT(DISTINCT p.product_id) FROM')
                           .replace(/GROUP BY.*?ORDER BY.*?LIMIT.*?OFFSET.*?$/, '');
    const countResult = await pool.query(countQuery, params.slice(0, -2));
    
    return {
      products: result.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count),
        totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
      }
    };
  }
}
```

### Monitoring and Logging

**Structured Logging:**
```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'shopping-platform' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Request logging middleware
const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const correlationId = req.headers['x-correlation-id'] || crypto.randomUUID();
  
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      correlationId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
  });
  
  next();
};
```

**Health Check Endpoint:**
```typescript
app.get('/health', async (req: Request, res: Response) => {
  const healthCheck = {
    uptime: process.uptime(),
    message: 'OK',
    timestamp: new Date().toISOString(),
    checks: {
      database: 'unknown',
      redis: 'unknown',
      elasticsearch: 'unknown'
    }
  };
  
  try {
    // Check database connection
    await pool.query('SELECT 1');
    healthCheck.checks.database = 'healthy';
  } catch (error) {
    healthCheck.checks.database = 'unhealthy';
    healthCheck.message = 'Degraded';
  }
  
  try {
    // Check Redis connection
    await redis.ping();
    healthCheck.checks.redis = 'healthy';
  } catch (error) {
    healthCheck.checks.redis = 'unhealthy';
    healthCheck.message = 'Degraded';
  }
  
  const statusCode = healthCheck.message === 'OK' ? 200 : 503;
  res.status(statusCode).json(healthCheck);
});
```

This comprehensive Low-Level Design document provides detailed implementation specifications for the Online Shopping Platform, covering all architectural components, security measures, performance optimizations, and operational considerations required for a production-ready e-commerce system.